/**
 * Conformance tests for the ported CSP compiler.
 *
 * Ported from src/Stott.Security.Optimizely.Test/Features/Csp/CspServiceTests.cs.
 * Where the C# suite asserts an exact policy string, that string is reproduced
 * here verbatim as a golden value — those are the strongest guarantee that the
 * two engines agree byte for byte.
 */

import { describe, expect, it } from 'vitest';

import { ALL_SOURCES, Directives, HeaderNames, Sources } from '../shared/constants.js';
import {
  createEmptyConfig,
  type ConfigDocument,
  type CspSourceConfig,
  type CspSettingsConfig,
  type SandboxConfig
} from '../shared/config.js';
import { compileCspHeaders } from '../backend/core/csp.js';

let nextId = 0;
const source = (src: string, ...directives: string[]): CspSourceConfig => ({
  id: `src-${++nextId}`,
  source: src,
  directives
});

function config(overrides: {
  settings?: Partial<CspSettingsConfig>;
  sandbox?: SandboxConfig;
  sources?: CspSourceConfig[];
}): ConfigDocument {
  const base = createEmptyConfig();

  return {
    ...base,
    settings: { ...base.settings, isEnabled: true, ...overrides.settings },
    sandbox: overrides.sandbox ?? base.sandbox,
    sources: overrides.sources ?? []
  };
}

const cspValue = (doc: ConfigDocument, key: string = HeaderNames.ContentSecurityPolicy) =>
  compileCspHeaders(doc).find((h) => h.key === key)?.value;

describe('emitting nothing', () => {
  it('returns no headers when CSP is disabled', () => {
    const doc = config({
      settings: { isEnabled: false },
      sources: [source('https://example.com', Directives.DefaultSource)]
    });

    expect(compileCspHeaders(doc)).toEqual([]);
  });

  it('returns no headers when there are no sources, sandbox or upgrade-insecure-requests', () => {
    expect(compileCspHeaders(config({ sources: [] }))).toEqual([]);
  });

  // Guards the deliberate divergence documented in csp.ts: the C# service would
  // emit a single empty-valued CSP header here, filtered only at its API
  // boundary. We drop it during compilation instead.
  it('emits nothing — not an empty header — when every source is malformed', () => {
    const doc = config({
      sources: [source('   ', Directives.DefaultSource), source('https://example.com')]
    });

    expect(compileCspHeaders(doc)).toEqual([]);
  });
});

describe('source ordering', () => {
  // Golden value lifted verbatim from
  // GetCompiledHeaders_GivenAVarietyOfAllSourceTypes_ThenSourcesShouldBeCorrectlyOrdered.
  it('orders keyword sources by precedence, then non-keywords alphabetically', () => {
    // Reversed on the way in, so any correct ordering must come from the sort
    // rather than from input order — the C# test shuffles for the same reason.
    const sources = ALL_SOURCES.filter((s) => s !== Sources.None)
      .map((s) => source(s, Directives.DefaultSource))
      .reverse();
    sources.push(source('https://www.example.com', Directives.DefaultSource));

    expect(cspValue(config({ sources }))).toBe(
      "default-src 'nonce-random' 'strict-dynamic' 'self' 'unsafe-eval' 'wasm-unsafe-eval' " +
        "'unsafe-inline' 'unsafe-hashes' 'inline-speculation-rules' blob: data: filesystem: " +
        'http: https: ws: wss: mediastream: https://www.example.com;'
    );
  });

  it('emits a single source unchanged', () => {
    const doc = config({ sources: [source('https://www.example.com', Directives.DefaultSource)] });

    expect(cspValue(doc)).toBe('default-src https://www.example.com;');
  });

  it('de-duplicates a source granted the same directive twice', () => {
    const doc = config({
      sources: [
        source('https://example.com', Directives.DefaultSource),
        source('https://example.com', Directives.DefaultSource)
      ]
    });

    expect(cspValue(doc)).toBe('default-src https://example.com;');
  });

  it('lowercases sources but preserves hash casing', () => {
    const doc = config({
      sources: [
        source('HTTPS://Example.COM', Directives.ScriptSource),
        source("'sha256-AbCdEf123='", Directives.ScriptSource)
      ]
    });

    const value = cspValue(doc) ?? '';
    expect(value).toContain('https://example.com');
    expect(value).toContain("'sha256-AbCdEf123='");
  });
});

describe("the 'none' keyword", () => {
  it('wins outright over other sources for the same directive', () => {
    const doc = config({
      sources: [
        source('https://example.com', Directives.ScriptSource),
        source(Sources.None, Directives.ScriptSource)
      ]
    });

    expect(cspValue(doc)).toBe("script-src 'none';");
  });

  it('only affects the directives it is granted', () => {
    const doc = config({
      sources: [
        source(Sources.None, Directives.ObjectSource),
        source('https://example.com', Directives.ScriptSource)
      ]
    });

    const value = cspValue(doc) ?? '';
    expect(value).toContain("object-src 'none';");
    expect(value).toContain('script-src https://example.com;');
  });
});

describe('directive normalisation', () => {
  it('accepts directives case-insensitively and drops unknown ones', () => {
    const doc = config({
      sources: [source('https://example.com', 'SCRIPT-SRC', 'not-a-real-directive')]
    });

    expect(cspValue(doc)).toBe('script-src https://example.com;');
  });

  it('orders a single source’s directives canonically, not as supplied', () => {
    // Supplied style-src → script-src → base-uri; ALL_DIRECTIVES order is
    // base-uri, script-src, style-src.
    const doc = config({
      sources: [
        source(
          'https://example.com',
          Directives.StyleSource,
          Directives.ScriptSource,
          Directives.BaseUri
        )
      ]
    });

    expect(cspValue(doc)).toBe(
      'base-uri https://example.com; script-src https://example.com; ' +
        'style-src https://example.com;'
    );
  });
});

describe('upgrade-insecure-requests', () => {
  it('is absent when disabled', () => {
    const doc = config({ sources: [source('https://example.com', Directives.DefaultSource)] });

    expect(cspValue(doc)).not.toContain(Directives.UpgradeInsecureRequests);
  });

  it('is present as a valueless directive when enabled', () => {
    const doc = config({
      settings: { isUpgradeInsecureRequestsEnabled: true },
      sources: [source('https://example.com', Directives.DefaultSource)]
    });

    expect(cspValue(doc)).toContain(`${Directives.UpgradeInsecureRequests};`);
  });

  it('alone is enough to emit a header with no sources at all', () => {
    const doc = config({ settings: { isUpgradeInsecureRequestsEnabled: true }, sources: [] });

    expect(cspValue(doc)).toBe('upgrade-insecure-requests;');
  });
});

describe('report-only mode', () => {
  it('switches the header name', () => {
    const doc = config({
      settings: { isReportOnly: true },
      sources: [source('https://example.com', Directives.DefaultSource)]
    });

    const headers = compileCspHeaders(doc);
    expect(headers.map((h) => h.key)).toContain(HeaderNames.ReportOnlyContentSecurityPolicy);
    expect(headers.map((h) => h.key)).not.toContain(HeaderNames.ContentSecurityPolicy);
  });
});

describe('external violation reporting', () => {
  const sources = [source('https://example.com', Directives.DefaultSource)];

  it('adds report-to and Reporting-Endpoints when a collector is configured', () => {
    const doc = config({
      settings: { useExternalReporting: true, externalReportToUrl: 'https://collector.test/r' },
      sources
    });

    const headers = compileCspHeaders(doc);
    expect(cspValue(doc)).toContain(`${Directives.ReportTo} stott-security-external-endpoint`);
    expect(headers.find((h) => h.key === HeaderNames.ReportingEndpoints)?.value).toBe(
      'stott-security-external-endpoint="https://collector.test/r"'
    );
  });

  it('omits both when reporting is off', () => {
    const doc = config({ settings: { useExternalReporting: false }, sources });

    expect(cspValue(doc)).not.toContain(Directives.ReportTo);
    expect(compileCspHeaders(doc).map((h) => h.key)).not.toContain(HeaderNames.ReportingEndpoints);
  });

  it('omits both when enabled but the collector URL is blank', () => {
    const doc = config({
      settings: { useExternalReporting: true, externalReportToUrl: '' },
      sources
    });

    expect(cspValue(doc)).not.toContain(Directives.ReportTo);
    expect(compileCspHeaders(doc).map((h) => h.key)).not.toContain(HeaderNames.ReportingEndpoints);
  });
});

describe('sandbox', () => {
  const sources = [source('https://example.com', Directives.DefaultSource)];

  it('emits enabled tokens in canonical order', () => {
    const doc = config({
      sandbox: {
        isSandboxEnabled: true,
        allowScripts: true,
        allowForms: true,
        allowSameOrigin: true
      },
      sources
    });

    expect(cspValue(doc)).toContain('sandbox allow-forms allow-same-origin allow-scripts;');
  });

  it('is absent when the sandbox is disabled', () => {
    const doc = config({ sandbox: { isSandboxEnabled: false, allowScripts: true }, sources });

    expect(cspValue(doc)).not.toContain(Directives.Sandbox);
  });

  // Browsers ignore a report-only sandbox, so emitting it would only waste bytes.
  it('is absent in report-only mode', () => {
    const doc = config({
      settings: { isReportOnly: true },
      sandbox: { isSandboxEnabled: true, allowScripts: true },
      sources
    });

    expect(cspValue(doc, HeaderNames.ReportOnlyContentSecurityPolicy)).not.toContain(
      Directives.Sandbox
    );
  });

  it('emits a valueless sandbox directive when enabled with no tokens', () => {
    const doc = config({ sandbox: { isSandboxEnabled: true }, sources });

    expect(cspValue(doc)).toContain('sandbox;');
  });

  it('alone is enough to emit a header with no sources at all', () => {
    const doc = config({ sandbox: { isSandboxEnabled: true, allowScripts: true }, sources: [] });

    expect(cspValue(doc)).toBe('sandbox allow-scripts;');
  });
});

describe('header splitting', () => {
  // 200 sources across two directives lands near 9.2 KB: past the 8100 split
  // threshold, below the 12000 simplification threshold, and well below the
  // 15500 terminal threshold. At 400 sources this compiles to *nothing* —
  // see the terminal-threshold cases in optimizer.test.ts.
  it('emits multiple CSP headers under the same key when the policy is large', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      source(`https://${i}.example.com`, Directives.ScriptSource, Directives.StyleSource)
    );

    const headers = compileCspHeaders(config({ sources: many }));

    expect(headers.length).toBeGreaterThan(1);
    for (const header of headers.filter((h) => h.key !== HeaderNames.ReportingEndpoints)) {
      expect(header.key).toBe(HeaderNames.ContentSecurityPolicy);
      expect(header.isRemoval).toBe(false);
    }
  });
});
