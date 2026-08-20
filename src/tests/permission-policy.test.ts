/**
 * Conformance tests for the ported Permissions Policy compiler.
 *
 * Ported from src/Stott.Security.Optimizely.Test/Features/PermissionPolicy/. The
 * fragment cases are the C# `PermissionPolicyMapperTestCases.ToPolicyFragmentTestCases`
 * reproduced verbatim, and the origin cases are its
 * `SavePermissionPolicyModelTestCases.SourceTestCases` — those golden values are
 * the strongest guarantee that the two engines agree byte for byte.
 */

import { describe, expect, it } from 'vitest';

import { HeaderNames } from '../shared/constants.js';
import {
  PermissionPolicyState,
  createEmptyConfig,
  type ConfigDocument,
  type PermissionPolicyDirectiveConfig,
  type PermissionPolicyStateValue
} from '../shared/config.js';
import {
  ALL_PERMISSION_POLICY_DIRECTIVES,
  PERMISSION_POLICY_DIRECTIVES,
  findPermissionPolicyDirective,
  isValidPermissionPolicyOrigin,
  listPermissionPolicyRows,
  remapLegacyPermissionPolicy,
  toPolicyFragment
} from '../shared/permission-policy.js';
import {
  analysePermissionPolicy,
  compilePermissionPolicyHeaders
} from '../backend/core/permission-policy.js';
import { compileHeaders, compileWithDiagnostics } from '../backend/core/index.js';

const directive = (
  name: string,
  state: PermissionPolicyStateValue,
  ...origins: string[]
): PermissionPolicyDirectiveConfig => ({ directive: name, state, origins });

function config(
  directives: PermissionPolicyDirectiveConfig[],
  isEnabled = true
): ConfigDocument {
  return { ...createEmptyConfig(), permissionPolicy: { isEnabled, directives } };
}

const policyValue = (doc: ConfigDocument): string | undefined =>
  compilePermissionPolicyHeaders(doc).find((h) => h.key === HeaderNames.PermissionsPolicy)?.value;

describe('the directive table', () => {
  it('offers 48 directives', () => {
    expect(PERMISSION_POLICY_DIRECTIVES).toHaveLength(48);
  });

  /**
   * MDN's directive index lists 50 and shows none of the status flags — those are
   * only on each directive's own page. This is the assertion that fails if the
   * table is ever regenerated from that index, silently restoring two directives
   * MDN marks deprecated, non-standard and pending removal.
   */
  it.each(['attribution-reporting', 'browsing-topics'])(
    'does not offer the deprecated %s',
    (name) => {
      expect(findPermissionPolicyDirective(name)).toBeUndefined();
    }
  );

  // The PaaS names for these were never real directives, so emitting them
  // produced a header browsers ignored.
  it.each(['opt-credentials', 'identity-credentials', 'document-domain'])(
    'does not offer the legacy PaaS name %s',
    (name) => {
      expect(findPermissionPolicyDirective(name)).toBeUndefined();
    }
  );

  it.each(['otp-credentials', 'identity-credentials-get'])('offers the spec name %s', (name) => {
    expect(findPermissionPolicyDirective(name)?.directive).toBe(name);
  });

  it('has no duplicate directives', () => {
    const names = PERMISSION_POLICY_DIRECTIVES.map((d) => d.directive);

    expect(new Set(names).size).toBe(names.length);
  });

  it.each(PERMISSION_POLICY_DIRECTIVES)('$directive carries a title and a description', (d) => {
    expect(d.title.trim().length).toBeGreaterThan(0);
    expect(d.description.trim().length).toBeGreaterThan(0);
  });

  // Emission order is behavioural: the compiled header lists directives in this
  // order, so a reordering changes the bytes of every configuration.
  it('is in alphabetical order, which is the emission order', () => {
    expect([...ALL_PERMISSION_POLICY_DIRECTIVES]).toEqual(
      [...ALL_PERMISSION_POLICY_DIRECTIVES].sort()
    );
  });

  it('finds a directive however it is cased', () => {
    expect(findPermissionPolicyDirective('CAMERA')?.directive).toBe('camera');
  });
});

describe('policy fragments', () => {
  // Verbatim from ToPolicyFragmentTestCases, bar the one noted divergence.
  it.each([
    ['accelerometer', PermissionPolicyState.None, [], 'accelerometer=()'],
    ['ambient-light-sensor', PermissionPolicyState.All, [], 'ambient-light-sensor=*'],
    ['autoplay', PermissionPolicyState.ThisSite, [], 'autoplay=(self)'],
    [
      'camera',
      PermissionPolicyState.ThisAndSpecificSites,
      ['https://www.example.com'],
      'camera=(self "https://www.example.com")'
    ],
    [
      'fullscreen',
      PermissionPolicyState.ThisAndSpecificSites,
      ['https://www.example.com', 'https://www.test.com'],
      'fullscreen=(self "https://www.example.com" "https://www.test.com")'
    ],
    ['gamepad', PermissionPolicyState.SpecificSites, [], 'gamepad=()'],
    [
      'geolocation',
      PermissionPolicyState.SpecificSites,
      ['https://www.example.com'],
      'geolocation=("https://www.example.com")'
    ],
    [
      'gyroscope',
      PermissionPolicyState.SpecificSites,
      ['https://www.example.com', 'https://www.test.com'],
      'gyroscope=("https://www.example.com" "https://www.test.com")'
    ]
  ])('serialises %s in state %s', (name, state, origins, expected) => {
    expect(toPolicyFragment({ directive: name, state, origins })).toBe(expected);
  });

  /**
   * DIVERGENCE from PaaS, which interpolates the origin list unconditionally and
   * so emits `bluetooth=(self )` — a trailing space its own unit test pins.
   * Identical meaning, two bytes shorter.
   */
  it('emits no trailing space when this-and-specific-sites has no origins', () => {
    expect(
      toPolicyFragment({
        directive: 'bluetooth',
        state: PermissionPolicyState.ThisAndSpecificSites,
        origins: []
      })
    ).toBe('bluetooth=(self)');
  });

  // Disabled and None are not the same thing: one omits the directive so the
  // browser default applies, the other blocks the feature outright.
  it('contributes nothing when disabled', () => {
    expect(
      toPolicyFragment({ directive: 'camera', state: PermissionPolicyState.Disabled, origins: [] })
    ).toBe('');
  });

  it('drops blank origins rather than emitting an empty quoted string', () => {
    expect(
      toPolicyFragment({
        directive: 'camera',
        state: PermissionPolicyState.SpecificSites,
        origins: ['https://www.example.com', '   ', '']
      })
    ).toBe('camera=("https://www.example.com")');
  });

  it('trims surrounding whitespace from an origin', () => {
    expect(
      toPolicyFragment({
        directive: 'camera',
        state: PermissionPolicyState.SpecificSites,
        origins: ['  https://www.example.com  ']
      })
    ).toBe('camera=("https://www.example.com")');
  });
});

describe('compiling the header', () => {
  it('emits nothing when the policy is disabled', () => {
    const doc = config([directive('camera', PermissionPolicyState.ThisSite)], false);

    expect(compilePermissionPolicyHeaders(doc)).toEqual([]);
  });

  it('emits nothing when every directive is disabled', () => {
    const doc = config([directive('camera', PermissionPolicyState.Disabled)]);

    expect(compilePermissionPolicyHeaders(doc)).toEqual([]);
  });

  it('emits nothing when nothing is configured at all', () => {
    expect(compilePermissionPolicyHeaders(config([]))).toEqual([]);
  });

  it('emits a replacement, not an append', () => {
    const doc = config([directive('camera', PermissionPolicyState.ThisSite)]);

    expect(compilePermissionPolicyHeaders(doc)).toEqual([
      {
        key: 'Permissions-Policy',
        value: 'camera=(self)',
        isRemoval: false,
        isReplacement: true
      }
    ]);
  });

  // PaaS pins this separator as "Test, Example".
  it('joins fragments with a comma and a space', () => {
    const doc = config([
      directive('camera', PermissionPolicyState.ThisSite),
      directive('geolocation', PermissionPolicyState.None)
    ]);

    expect(policyValue(doc)).toBe('camera=(self), geolocation=()');
  });

  /**
   * DIVERGENCE from PaaS, which applies no `ORDER BY` when reading its rows and
   * so emits in SQL insertion order — two installations holding identical
   * configuration can produce different headers. Order here comes from the
   * directive table, which matters because the output is stored and diffed.
   */
  it('emits in table order regardless of the order directives were configured', () => {
    const doc = config([
      directive('usb', PermissionPolicyState.None),
      directive('camera', PermissionPolicyState.ThisSite),
      directive('microphone', PermissionPolicyState.All)
    ]);

    expect(policyValue(doc)).toBe('camera=(self), microphone=*, usb=()');
  });

  it('configures a directive named in any case', () => {
    const doc = config([directive('CAMERA', PermissionPolicyState.ThisSite)]);

    expect(policyValue(doc)).toBe('camera=(self)');
  });

  it('ignores a directive it does not recognise', () => {
    const doc = config([
      directive('not-a-directive', PermissionPolicyState.All),
      directive('camera', PermissionPolicyState.ThisSite)
    ]);

    expect(policyValue(doc)).toBe('camera=(self)');
  });
});

describe('listing rows for the console', () => {
  it('materialises all 48 directives as Disabled when nothing is configured', () => {
    const rows = listPermissionPolicyRows([]);

    expect(rows).toHaveLength(48);
    expect(rows.every((r) => r.state === PermissionPolicyState.Disabled)).toBe(true);
    expect(rows.every((r) => r.origins.length === 0)).toBe(true);
  });

  it('does not duplicate a directive the customer has configured', () => {
    const rows = listPermissionPolicyRows([directive('camera', PermissionPolicyState.ThisSite)]);

    expect(rows).toHaveLength(48);
    expect(rows.filter((r) => r.directive === 'camera')).toHaveLength(1);
  });

  it('carries the configured state and origins onto the row', () => {
    const rows = listPermissionPolicyRows([
      directive('camera', PermissionPolicyState.SpecificSites, 'https://www.example.com')
    ]);

    expect(rows.find((r) => r.directive === 'camera')).toMatchObject({
      state: PermissionPolicyState.SpecificSites,
      origins: ['https://www.example.com'],
      title: 'Camera'
    });
  });

  it('matches a configured directive case-insensitively', () => {
    const rows = listPermissionPolicyRows([directive('CaMeRa', PermissionPolicyState.All)]);

    expect(rows).toHaveLength(48);
    expect(rows.find((r) => r.directive === 'camera')?.state).toBe(PermissionPolicyState.All);
  });
});

describe('explaining the outcome', () => {
  // Diagnostics come from the analysis, never inferred from an empty header list:
  // "switched off" and "on but nothing set" both produce no header and need
  // different remedies.
  it('distinguishes disabled from nothing configured', () => {
    expect(analysePermissionPolicy(config([], false))).toEqual({ kind: 'disabled' });
    expect(analysePermissionPolicy(config([]))).toEqual({ kind: 'nothing-configured' });
  });

  it('reports what was emitted', () => {
    const doc = config([
      directive('camera', PermissionPolicyState.ThisSite),
      directive('usb', PermissionPolicyState.None)
    ]);

    expect(analysePermissionPolicy(doc)).toEqual({
      kind: 'emitted',
      directiveCount: 2,
      bytes: 'camera=(self), usb=()'.length
    });
  });

  it('warns that an enabled policy with nothing set emits no header', () => {
    const { diagnostics } = compileWithDiagnostics(config([]));

    expect(diagnostics.map((d) => d.code)).toContain('permission-policy-empty');
  });

  it('does not claim nothing is configured when only a permissions policy is set', () => {
    const doc = config([directive('camera', PermissionPolicyState.ThisSite)]);

    expect(compileWithDiagnostics(doc).diagnostics.map((d) => d.code)).not.toContain('no-headers');
  });

  it('still reports an empty configuration', () => {
    const { diagnostics } = compileWithDiagnostics(createEmptyConfig());

    expect(diagnostics.map((d) => d.code)).toContain('no-headers');
  });

  // The header cannot be split, so past a CDN's limit it is dropped in full.
  it('warns when the header approaches the size limit', () => {
    // Around 33 bytes each once quoted and separated, so 300 clears the
    // 90%-of-8100 bar the check uses.
    const origins = Array.from({ length: 300 }, (_, i) => `https://origin-${i}.example.com`);
    const doc = config([directive('camera', PermissionPolicyState.SpecificSites, ...origins)]);

    expect(compileWithDiagnostics(doc).diagnostics.map((d) => d.code)).toContain(
      'permission-policy-large'
    );
  });
});

describe('compileHeaders', () => {
  it('places the permissions policy among the other headers, sorted by key', () => {
    const base = createEmptyConfig();
    const doc: ConfigDocument = {
      ...base,
      settings: { ...base.settings, isEnabled: true },
      sources: [{ id: 's1', source: 'https://example.com', directives: ['default-src'] }],
      permissionPolicy: {
        isEnabled: true,
        directives: [directive('camera', PermissionPolicyState.ThisSite)]
      }
    };

    expect(compileHeaders(doc).map((h) => h.key)).toEqual([
      'Content-Security-Policy',
      'Permissions-Policy'
    ]);
  });
});

/**
 * The migration path between the two products. A PaaS export carries directive
 * names this app does not offer, and import is the only route from one to the
 * other, so the remap is what stops that document being refused outright.
 */
describe('remapping a PaaS document', () => {
  it('renames the two directives PaaS spelled incorrectly', () => {
    const { directives, dropped } = remapLegacyPermissionPolicy([
      directive('opt-credentials', PermissionPolicyState.ThisSite),
      directive('identity-credentials', PermissionPolicyState.None)
    ]);

    expect(directives.map((d) => d.directive)).toEqual([
      'otp-credentials',
      'identity-credentials-get'
    ]);
    expect(dropped).toEqual([]);
  });

  it('keeps the state and origins of a renamed directive', () => {
    const { directives } = remapLegacyPermissionPolicy([
      directive('opt-credentials', PermissionPolicyState.SpecificSites, 'https://www.example.com')
    ]);

    expect(directives[0]).toEqual({
      directive: 'otp-credentials',
      state: PermissionPolicyState.SpecificSites,
      origins: ['https://www.example.com']
    });
  });

  it.each(['document-domain', 'attribution-reporting', 'browsing-topics'])(
    'drops %s and reports it',
    (name) => {
      const { directives, dropped } = remapLegacyPermissionPolicy([
        directive(name, PermissionPolicyState.None),
        directive('camera', PermissionPolicyState.ThisSite)
      ]);

      expect(directives.map((d) => d.directive)).toEqual(['camera']);
      expect(dropped).toEqual([name]);
    }
  );

  // The correctly-named entry is the one the editor last saw in a console, so a
  // rename must not overwrite it.
  it('drops a rename that would collide with an entry already present', () => {
    const { directives, dropped } = remapLegacyPermissionPolicy([
      directive('otp-credentials', PermissionPolicyState.ThisSite),
      directive('opt-credentials', PermissionPolicyState.All)
    ]);

    expect(directives).toEqual([directive('otp-credentials', PermissionPolicyState.ThisSite)]);
    expect(dropped).toEqual(['opt-credentials']);
  });

  it('leaves a document with nothing legacy in it untouched', () => {
    const original = [directive('camera', PermissionPolicyState.ThisSite)];
    const { directives, dropped } = remapLegacyPermissionPolicy(original);

    expect(directives).toEqual(original);
    expect(dropped).toEqual([]);
  });
});

/**
 * Ported from SourceTestCases. The console applies these as an origin is typed
 * and the backend applies the same ones on save — shared precisely so the two
 * cannot disagree.
 */
describe('origin rules', () => {
  it.each([
    'http://www.example.com',
    'https://www.example.com',
    'ws://www.example.com',
    'wss://www.example.com',
    'https://example.com',
    'https://www.example.com/',
    'https://www.example.com:8080',
    'https://www.example.com:8080/',
    // MDN documents the wildcard form for the header, and PaaS accepts it.
    'https://*.example.com'
  ])('accepts the origin %j', (origin) => {
    expect(isValidPermissionPolicyOrigin(origin)).toBe(true);
  });

  it.each([
    '',
    'ftp://www.example.com',
    'www.example.com',
    'example.com',
    'http://*.com',
    'http://www.*.com',
    'https://localhost',
    // A path is meaningless in an allow-list, and browsers reject the whole
    // directive rather than the one entry.
    'https://www.example.com/1234/v4.3.2iframeResizer.min.js',
    'https://www.example.com:'
  ])('rejects the origin %j', (origin) => {
    expect(isValidPermissionPolicyOrigin(origin)).toBe(false);
  });

  // Host names are case-insensitive, and PaaS's own import path stores whatever
  // case it was given.
  it('accepts an origin whatever its case', () => {
    expect(isValidPermissionPolicyOrigin('https://WWW.Example.com')).toBe(true);
  });
});
