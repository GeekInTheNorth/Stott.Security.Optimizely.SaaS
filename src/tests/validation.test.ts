/**
 * Tests for structural validation and compile diagnostics.
 *
 * These concentrate on ground the C# suite covers thinly, rather than
 * re-proving what it covers well: untrusted import payloads, header-injection
 * defences, and the terminal-threshold cliff that silently drops a policy.
 */

import { describe, expect, it } from 'vitest';

import {
  CustomHeaderBehavior,
  PermissionPolicyState,
  createEmptyConfig,
  normaliseConfig,
  type ConfigDocument
} from '../shared/config.js';
import { Directives } from '../shared/constants.js';
import { validateConfig } from '../backend/lib/validation.js';
import { analyseCsp, compileWithDiagnostics } from '../backend/core/index.js';
import { fallbackChain, compiledKey, draftKey, measureConfig } from '../backend/lib/storage.js';

const valid = (): ConfigDocument => ({
  ...createEmptyConfig(),
  sources: [{ id: 's1', source: 'https://example.com', directives: [Directives.DefaultSource] }]
});

describe('validateConfig', () => {
  it('accepts a well-formed document', () => {
    expect(validateConfig(valid())).toEqual([]);
  });

  it('accepts an empty configuration — a fresh install is valid', () => {
    expect(validateConfig(createEmptyConfig())).toEqual([]);
  });

  it.each([null, undefined, 'string', 42, []])('rejects %s as a document', (input) => {
    expect(validateConfig(input).length).toBeGreaterThan(0);
  });

  it('rejects an unsupported version', () => {
    expect(validateConfig({ ...valid(), version: 2 }).join(' ')).toContain('version');
  });

  it.each(['settings', 'sandbox', 'sources', 'headers'])('rejects a missing %s', (field) => {
    const doc = { ...valid() } as Record<string, unknown>;
    delete doc[field];

    expect(validateConfig(doc).join(' ')).toContain(field);
  });

  describe('sources', () => {
    it('rejects a source with no domain', () => {
      const doc = { ...valid(), sources: [{ id: 's', source: '  ', directives: ['default-src'] }] };

      expect(validateConfig(doc).join(' ')).toContain('no domain');
    });

    it('rejects a source with no directives', () => {
      const doc = { ...valid(), sources: [{ id: 's', source: 'https://x.com', directives: [] }] };

      expect(validateConfig(doc).join(' ')).toContain('no directives');
    });

    it('rejects unknown directives', () => {
      const doc = {
        ...valid(),
        sources: [{ id: 's', source: 'https://x.com', directives: ['made-up-src'] }]
      };

      expect(validateConfig(doc).join(' ')).toContain('made-up-src');
    });

    it('accepts directives case-insensitively', () => {
      const doc = {
        ...valid(),
        sources: [{ id: 's', source: 'https://x.com', directives: ['SCRIPT-SRC'] }]
      };

      expect(validateConfig(doc)).toEqual([]);
    });

    // Response splitting: a CR or LF reaching the head would let an attacker
    // append arbitrary headers.
    it('rejects control characters in a domain', () => {
      const doc = {
        ...valid(),
        sources: [{ id: 's', source: 'https://x.com\r\nX-Evil: 1', directives: ['default-src'] }]
      };

      expect(validateConfig(doc).join(' ')).toContain('control characters');
    });
  });

  describe('headers', () => {
    const withHeaders = (headers: unknown[]) => ({ ...valid(), headers });

    it('rejects a header with no name', () => {
      expect(
        validateConfig(
          withHeaders([{ id: 'h', headerName: '', behavior: 'Add', headerValue: 'x' }])
        ).join(' ')
      ).toContain('no name');
    });

    it.each(['X Frame Options', 'X-Frame:Options', 'X-Frame\r\nOptions', 'Bad Header'])(
      'rejects the invalid header name %j',
      (headerName) => {
        expect(
          validateConfig(
            withHeaders([{ id: 'h', headerName, behavior: 'Add', headerValue: 'x' }])
          ).join(' ')
        ).toContain('not a valid HTTP header name');
      }
    );

    it.each(['X-Frame-Options', 'X-Custom_Thing', "X-Weird'Name", 'X-Netcel.Trace'])(
      'accepts the valid header name %j',
      (headerName) => {
        expect(
          validateConfig(withHeaders([{ id: 'h', headerName, behavior: 'Add', headerValue: 'x' }]))
        ).toEqual([]);
      }
    );

    it('rejects control characters in a value', () => {
      expect(
        validateConfig(
          withHeaders([
            { id: 'h', headerName: 'X-Thing', behavior: 'Add', headerValue: 'a\r\nX-Evil: 1' }
          ])
        ).join(' ')
      ).toContain('control characters');
    });

    /**
     * Headers the engine compiles from another part of the document. A second
     * header of the same name would compete with it, and which of the two took
     * effect would be invisible in the console.
     */
    it.each([
      'Permissions-Policy',
      'permissions-policy',
      'Content-Security-Policy',
      'Content-Security-Policy-Report-Only',
      'Reporting-Endpoints'
    ])('rejects %j, which this app manages itself', (headerName) => {
      expect(
        validateConfig(
          withHeaders([{ id: 'h', headerName, behavior: 'Add', headerValue: 'camera=()' }])
        ).join(' ')
      ).toContain('managed by this app');
    });

    // The eight standard headers are configured exactly by adding a row, so they
    // must not be caught by the reserved-name rule.
    it('still accepts a standard security header', () => {
      expect(
        validateConfig(
          withHeaders([
            { id: 'h', headerName: 'Strict-Transport-Security', behavior: 'Add', headerValue: 'max-age=1' }
          ])
        )
      ).toEqual([]);
    });

    // Silently letting the last one win would make the effective config invisible.
    it('rejects a duplicated header name, case-insensitively', () => {
      expect(
        validateConfig(
          withHeaders([
            { id: 'a', headerName: 'X-Frame-Options', behavior: 'Add', headerValue: 'DENY' },
            { id: 'b', headerName: 'x-frame-options', behavior: 'Add', headerValue: 'SAMEORIGIN' }
          ])
        ).join(' ')
      ).toContain('more than once');
    });

    it('rejects an unknown behaviour', () => {
      expect(
        validateConfig(
          withHeaders([{ id: 'h', headerName: 'X-Thing', behavior: 'Maybe', headerValue: 'x' }])
        ).join(' ')
      ).toContain('unknown behaviour');
    });

    it('rejects Add with no value but allows Remove with none', () => {
      expect(
        validateConfig(
          withHeaders([{ id: 'h', headerName: 'X-Thing', behavior: 'Add', headerValue: '' }])
        ).join(' ')
      ).toContain('set to Add but has no value');

      expect(
        validateConfig(
          withHeaders([
            { id: 'h', headerName: 'Server', behavior: CustomHeaderBehavior.Remove, headerValue: '' }
          ])
        )
      ).toEqual([]);
    });
  });

  /**
   * Unlike the sections above, this one is validated only when present.
   * Export/import is the only backup a customer can hold, so a document exported
   * before the section existed has to stay restorable — a missing-section check
   * here would make every older export unimportable.
   */
  describe('permissions policy', () => {
    const withDirectives = (
      directives: Array<Record<string, unknown>>
    ): Record<string, unknown> => ({
      ...valid(),
      permissionPolicy: { isEnabled: true, directives }
    });

    it('accepts a document that carries no permissionPolicy at all', () => {
      const doc = { ...valid() } as Record<string, unknown>;
      delete doc['permissionPolicy'];

      expect(validateConfig(doc)).toEqual([]);
    });

    it('normalises a document that carries no permissionPolicy into an empty one', () => {
      const doc = { ...valid() } as Record<string, unknown>;
      delete doc['permissionPolicy'];

      expect(normaliseConfig(doc as unknown as ConfigDocument).permissionPolicy).toEqual({
        isEnabled: false,
        directives: []
      });
    });

    it('rejects a permissionPolicy that is not an object', () => {
      expect(
        validateConfig({ ...valid(), permissionPolicy: 'on' }).join(' ')
      ).toContain('permissionPolicy');
    });

    it('rejects a missing directives array', () => {
      expect(
        validateConfig({ ...valid(), permissionPolicy: { isEnabled: true } }).join(' ')
      ).toContain('directives');
    });

    it('rejects an unrecognised directive', () => {
      expect(
        validateConfig(withDirectives([{ directive: 'teleport', state: 'None', origins: [] }])).join(
          ' '
        )
      ).toContain('teleport');
    });

    it.each(['attribution-reporting', 'browsing-topics', 'document-domain', 'opt-credentials'])(
      'rejects the unsupported directive %s, which import is expected to have remapped',
      (name) => {
        expect(
          validateConfig(withDirectives([{ directive: name, state: 'None', origins: [] }])).join(' ')
        ).toContain(name);
      }
    );

    it('rejects a duplicated directive', () => {
      const errors = validateConfig(
        withDirectives([
          { directive: 'camera', state: 'None', origins: [] },
          { directive: 'CAMERA', state: 'All', origins: [] }
        ])
      );

      expect(errors.join(' ')).toContain('more than once');
    });

    it('rejects an unknown state', () => {
      expect(
        validateConfig(withDirectives([{ directive: 'camera', state: 'Maybe', origins: [] }])).join(
          ' '
        )
      ).toContain('Maybe');
    });

    // An empty list is what makes SpecificSites collapse to `()`, blocking the
    // feature rather than allowing the origins the editor meant to name.
    it.each(['SpecificSites', 'ThisAndSpecificSites'])(
      'rejects %s with no origins',
      (state) => {
        expect(
          validateConfig(withDirectives([{ directive: 'camera', state, origins: [] }])).join(' ')
        ).toContain('no origins');
      }
    );

    it('accepts a state that needs no origins without any', () => {
      expect(
        validateConfig(withDirectives([{ directive: 'camera', state: 'ThisSite', origins: [] }]))
      ).toEqual([]);
    });

    it('rejects an invalid origin', () => {
      expect(
        validateConfig(
          withDirectives([
            { directive: 'camera', state: 'SpecificSites', origins: ['not-a-url'] }
          ])
        ).join(' ')
      ).toContain('not-a-url');
    });

    // Response splitting: a CR or LF reaching the head would let an attacker
    // append arbitrary headers.
    it('rejects an origin containing control characters', () => {
      expect(
        validateConfig(
          withDirectives([
            {
              directive: 'camera',
              state: 'SpecificSites',
              origins: ['https://a.example.com\r\nX-Evil: 1']
            }
          ])
        ).join(' ')
      ).toContain('control characters');
    });

    it('rejects a missing origins array', () => {
      expect(
        validateConfig(withDirectives([{ directive: 'camera', state: 'ThisSite' }])).join(' ')
      ).toContain('origins');
    });

    /**
     * A non-string origin is excluded from the strings `validatePermissionPolicy`
     * inspects, so without an explicit check it would validate in silence and
     * stay in the stored document — where `toPolicyFragment` calls `trim()` on it
     * and throws, resurfacing a malformed import as a 500 on the next publish.
     */
    it.each([[42], [null], [{}], [['nested']], [true]])(
      'rejects the non-string origin %j',
      (origin) => {
        const errors = validateConfig(
          withDirectives([
            { directive: 'camera', state: 'SpecificSites', origins: [origin] }
          ])
        );

        expect(errors.join(' ')).toContain('not text');
      }
    );

    it('still accepts a blank string among the origins', () => {
      expect(
        validateConfig(
          withDirectives([
            {
              directive: 'camera',
              state: 'SpecificSites',
              origins: ['https://www.example.com', '']
            }
          ])
        )
      ).toEqual([]);
    });

    // A document carrying directives but no flag would be stored and then
    // treated as disabled, so a configured policy would emit nothing at all.
    it.each([undefined, null, 'true', 1])('rejects isEnabled of %j', (isEnabled) => {
      const doc = {
        ...valid(),
        permissionPolicy: { isEnabled, directives: [] }
      };

      expect(validateConfig(doc).join(' ')).toContain('isEnabled');
    });

    it.each([true, false])('accepts isEnabled of %j', (isEnabled) => {
      const doc = {
        ...valid(),
        permissionPolicy: { isEnabled, directives: [] }
      };

      expect(validateConfig(doc)).toEqual([]);
    });
  });

  describe('report collector URL', () => {
    const withSettings = (overrides: Record<string, unknown>) => ({
      ...valid(),
      settings: { ...createEmptyConfig().settings, ...overrides }
    });

    it('requires a URL when external reporting is enabled', () => {
      expect(
        validateConfig(withSettings({ useExternalReporting: true, externalReportToUrl: '' })).join(
          ' '
        )
      ).toContain('no collector URL');
    });

    // Browsers will not post reports to plain HTTP from an HTTPS page, so an
    // http: collector is a config that silently never reports.
    it.each(['http://collector.test/r', 'not-a-url', '/relative/path'])(
      'rejects the collector URL %j',
      (url) => {
        expect(
          validateConfig(
            withSettings({ useExternalReporting: true, externalReportToUrl: url })
          ).join(' ')
        ).toContain('not a valid absolute HTTPS URL');
      }
    );

    it('accepts an absolute HTTPS collector URL', () => {
      expect(
        validateConfig(
          withSettings({
            useExternalReporting: true,
            externalReportToUrl: 'https://collector.test/r?k=abc'
          })
        )
      ).toEqual([]);
    });
  });
});

/**
 * Export/import is the only backup a customer can hold — the configuration lives
 * in installation-owned key-value storage, so uninstalling deletes it. That makes
 * "an export is importable" a real invariant rather than a tautology: import runs
 * the same `validateConfig` as save, so any rule stricter than what the console
 * can produce would make a customer's own backup unrestorable.
 */
describe('export/import round trip', () => {
  const populated = (): ConfigDocument => ({
    ...createEmptyConfig(),
    settings: {
      isEnabled: true,
      isReportOnly: true,
      isUpgradeInsecureRequestsEnabled: true,
      useExternalReporting: true,
      externalReportToUrl: 'https://collector.test/report'
    },
    sandbox: { isSandboxEnabled: true, allowScripts: true, allowSameOrigin: true },
    sources: [
      { id: 's1', source: 'https://example.com', directives: [Directives.ScriptSource] },
      { id: 's2', source: "'self'", directives: [Directives.DefaultSource, Directives.StyleSource] }
    ],
    headers: [
      { id: 'h1', headerName: 'X-Frame-Options', behavior: CustomHeaderBehavior.Add, headerValue: 'DENY' },
      { id: 'h2', headerName: 'Server', behavior: CustomHeaderBehavior.Remove, headerValue: '' },
      { id: 'h3', headerName: 'X-Netcel-Trace', behavior: CustomHeaderBehavior.Disabled, headerValue: 'off' }
    ],
    permissionPolicy: {
      isEnabled: true,
      directives: [
        { directive: 'camera', state: PermissionPolicyState.None, origins: [] },
        { directive: 'fullscreen', state: PermissionPolicyState.ThisSite, origins: [] },
        {
          directive: 'geolocation',
          state: PermissionPolicyState.ThisAndSpecificSites,
          origins: ['https://maps.example.com']
        }
      ]
    }
  });

  it('accepts a fully populated document back after serialisation', () => {
    // Through JSON, because that is what actually leaves and re-enters the
    // browser — a document that only survives in memory is not a backup.
    const restored = JSON.parse(JSON.stringify(populated())) as unknown;

    expect(validateConfig(restored)).toEqual([]);
  });

  it('compiles the restored document to the same headers as the original', () => {
    const original = populated();
    const restored = JSON.parse(JSON.stringify(original)) as ConfigDocument;

    expect(compileWithDiagnostics(restored).headers).toEqual(compileWithDiagnostics(original).headers);
  });

  it('accepts an empty export, so a fresh install can still be backed up', () => {
    expect(validateConfig(JSON.parse(JSON.stringify(createEmptyConfig())))).toEqual([]);
  });

  // The console parses before sending, but the backend is what guards storage —
  // `compiled_headers` serves stored output without re-validating it.
  it.each(['[]', '"a string"', '{"version":2}', 'null'])(
    'rejects the pasted payload %j',
    (payload) => {
      expect(validateConfig(JSON.parse(payload)).length).toBeGreaterThan(0);
    }
  );
});

describe('compile diagnostics', () => {
  const enabled = (overrides: Partial<ConfigDocument> = {}): ConfigDocument => ({
    ...createEmptyConfig(),
    settings: { ...createEmptyConfig().settings, isEnabled: true },
    ...overrides
  });

  const codes = (doc: ConfigDocument) => compileWithDiagnostics(doc).diagnostics.map((d) => d.code);

  it('reports nothing of concern for a small valid policy', () => {
    const doc = enabled({
      sources: [{ id: 's1', source: 'https://example.com', directives: [Directives.DefaultSource] }]
    });

    expect(compileWithDiagnostics(doc).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  // Regression: these all compile to zero CSP headers, and an earlier version
  // inferred "too large to emit" from that — reporting a size problem for a
  // brand-new empty configuration.
  describe('does not claim the policy was dropped when it was never built', () => {
    it('with CSP enabled and nothing configured', () => {
      expect(codes(enabled())).not.toContain('policy-dropped');
      expect(analyseCsp(enabled()).kind).toBe('nothing-configured');
    });

    it('with a source that has no directives granted yet', () => {
      const doc = enabled({ sources: [{ id: 's1', source: 'https://example.com', directives: [] }] });

      expect(codes(doc)).not.toContain('policy-dropped');
      expect(codes(doc)).toContain('no-directives-granted');
      expect(analyseCsp(doc).kind).toBe('no-directives-granted');
    });

    it('with the sandbox enabled but suppressed by report-only mode', () => {
      const base = createEmptyConfig();
      const doc: ConfigDocument = {
        ...base,
        settings: { ...base.settings, isEnabled: true, isReportOnly: true },
        sandbox: { isSandboxEnabled: true, allowScripts: true }
      };

      expect(codes(doc)).not.toContain('policy-dropped');
      expect(analyseCsp(doc).kind).toBe('nothing-configured');
    });

    it('with CSP disabled entirely', () => {
      expect(codes(createEmptyConfig())).not.toContain('policy-dropped');
      expect(analyseCsp(createEmptyConfig()).kind).toBe('disabled');
    });
  });

  // The whole reason compileWithDiagnostics exists: past the terminal threshold
  // the optimiser emits nothing, and on SaaS there is no server log to notice.
  it('raises policy-dropped only when the policy really is too large', () => {
    const doc = enabled({
      sources: Array.from({ length: 400 }, (_, i) => ({
        id: `s${i}`,
        source: `https://${i}.example.com`,
        directives: [Directives.ScriptSource, Directives.StyleSource, Directives.ImageSource]
      }))
    });

    const { headers, diagnostics } = compileWithDiagnostics(doc);

    expect(analyseCsp(doc).kind).toBe('dropped');
    expect(headers.filter((h) => h.key.startsWith('Content-Security-Policy'))).toEqual([]);
    const dropped = diagnostics.find((d) => d.code === 'policy-dropped');
    expect(dropped?.severity).toBe('error');
    expect(dropped?.message).toContain('dropped entirely');
  });

  it('reports policy-split as information, not a problem', () => {
    const doc = enabled({
      sources: Array.from({ length: 200 }, (_, i) => ({
        id: `s${i}`,
        source: `https://${i}.example.com`,
        directives: [Directives.ScriptSource, Directives.StyleSource]
      }))
    });

    const { diagnostics } = compileWithDiagnostics(doc);

    expect(diagnostics.find((d) => d.code === 'policy-split')?.severity).toBe('info');
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('notes an entirely empty configuration without alarming about it', () => {
    const found = compileWithDiagnostics(createEmptyConfig()).diagnostics.find(
      (d) => d.code === 'no-headers'
    );

    expect(found?.severity).toBe('info');
  });

  it('stays quiet about emptiness when response headers are doing the work', () => {
    const base = createEmptyConfig();
    const doc: ConfigDocument = {
      ...base,
      headers: [
        { id: 'h1', headerName: 'X-Frame-Options', behavior: CustomHeaderBehavior.Add, headerValue: 'DENY' }
      ]
    };

    expect(codes(doc)).not.toContain('no-headers');
  });
});

describe('scope resolution', () => {
  it('falls back host → app → global', () => {
    expect(fallbackChain({ appId: 'cms13', hostName: 'example.com' })).toEqual([
      { appId: 'cms13', hostName: 'example.com' },
      { appId: 'cms13' },
      {}
    ]);
  });

  it('falls back app → global when no host is given', () => {
    expect(fallbackChain({ appId: 'cms13' })).toEqual([{ appId: 'cms13' }, {}]);
  });

  it('resolves to global alone when unscoped', () => {
    expect(fallbackChain({})).toEqual([{}]);
  });

  // A host without an app is not a meaningful scope in the PaaS model either.
  it('ignores a host with no app', () => {
    expect(fallbackChain({ hostName: 'example.com' })).toEqual([{}]);
  });

  it('builds distinct, versioned keys per scope', () => {
    const scope = { appId: 'cms13', hostName: 'example.com' };

    expect(draftKey(scope)).toBe('config:v1:cms13:example.com');
    expect(compiledKey(scope)).toBe('compiled:v1:cms13:example.com');
    expect(draftKey({})).toBe('config:v1:*:*');
  });
});

describe('document sizing', () => {
  it('measures the serialised byte length', () => {
    expect(measureConfig(createEmptyConfig())).toBeGreaterThan(0);
  });

  it('stays far below the KV limit for a large realistic config', () => {
    const doc: ConfigDocument = {
      ...createEmptyConfig(),
      sources: Array.from({ length: 200 }, (_, i) => ({
        id: `source-${i}`,
        source: `https://subdomain-${i}.example-customer-domain.com`,
        directives: [Directives.ScriptSource, Directives.StyleSource, Directives.ImageSource]
      }))
    };

    // OCP's per-record limit is ~400 KB; our guard is 300 KB.
    expect(measureConfig(doc)).toBeLessThan(100_000);
  });
});
