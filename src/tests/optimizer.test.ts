/**
 * Conformance tests for the ported CSP optimiser.
 *
 * Ported from src/Stott.Security.Optimizely.Test/Features/Csp/CspOptimizerTests.cs.
 * The C# suite is the specification: these cases reuse its exact source counts
 * and expected group counts, because the thresholds are byte-sensitive and a
 * one-character drift in `predictedSize` changes the outcome. If a case here
 * disagrees with the C# original, the port is wrong — not the test.
 */

import { describe, expect, it } from 'vitest';

import { Directives, Sources } from '../shared/constants.js';
import { createDirective, type CspDirective } from '../backend/core/directive.js';
import { groupDirectives } from '../backend/core/optimizer.js';

/** Mirrors `GenerateSources` in the C# suite exactly. */
function generateSources(amount: number, useNonce = false, useStrictDynamic = false): string[] {
  const items = Array.from({ length: amount }, (_, i) => `https://${i}.example.com`);

  if (useNonce) {
    items.push(Sources.Nonce);
  }

  if (useStrictDynamic) {
    items.push(Sources.StrictDynamic);
  }

  return items;
}

const groupContaining = (groups: CspDirective[][], directive: string) =>
  groups.find((group) => group.some((d) => d.directive === directive));

const groupStartingWith = (groups: CspDirective[][], prefix: string) =>
  groups.find((group) => group.some((d) => d.directive.startsWith(prefix)));

describe('predictedSize', () => {
  it('is directive.length + 3 + sum(source.length + 1)', () => {
    const directive = createDirective(Directives.ScriptSource, ["'self'"]);

    // 'script-src'.length (10) + 3 + ("'self'".length (6) + 1) = 20
    expect(directive.predictedSize).toBe(20);
  });

  it('ignores blank sources so they cannot inflate the size', () => {
    const withBlanks = createDirective(Directives.ScriptSource, ["'self'", '', '   ']);
    const without = createDirective(Directives.ScriptSource, ["'self'"]);

    expect(withBlanks.sources).toEqual(["'self'"]);
    expect(withBlanks.predictedSize).toBe(without.predictedSize);
  });
});

describe('directive inheritance', () => {
  it('falls back to default-src when script-src is absent', () => {
    const sources = ["'self'", 'https://example.com'];
    const directives = [
      createDirective(Directives.DefaultSource, sources),
      createDirective(Directives.ScriptSourceElement, generateSources(250)),
      createDirective(Directives.StyleSourceElement, generateSources(250))
    ];

    const result = groupDirectives(directives);
    const scriptsGroup = groupContaining(result, Directives.ScriptSource);
    const scriptSrc = scriptsGroup?.find((d) => d.directive === Directives.ScriptSource);

    expect(scriptsGroup).toHaveLength(2);
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc?.sources).toEqual(sources);
  });

  it("falls back to 'self' when neither script-src nor default-src exist", () => {
    const directives = [
      createDirective(Directives.ScriptSourceElement, generateSources(250)),
      createDirective(Directives.StyleSourceElement, generateSources(250))
    ];

    const result = groupDirectives(directives);
    const scriptsGroup = groupContaining(result, Directives.ScriptSource);
    const scriptSrc = scriptsGroup?.find((d) => d.directive === Directives.ScriptSource);

    expect(scriptsGroup).toHaveLength(2);
    expect(scriptSrc?.sources).toEqual([Sources.Self]);
  });

  it('falls back to default-src for absent other-fetch directives', () => {
    const sources = ["'self'", 'https://example.com'];
    const directives = [
      createDirective(Directives.DefaultSource, sources),
      createDirective(Directives.ScriptSourceElement, generateSources(250)),
      createDirective(Directives.StyleSourceElement, generateSources(250))
    ];

    const result = groupDirectives(directives);
    const imgSrc = groupContaining(result, Directives.ImageSource)?.find(
      (d) => d.directive === Directives.ImageSource
    );

    expect(imgSrc).toBeDefined();
    expect(imgSrc?.sources).toEqual(sources);
  });
});

describe('script-src family simplification', () => {
  // Exact counts from the C# [TestCase] attributes — nonce presence lowers the
  // effective threshold by 38 bytes per nonce source, so the counts differ.
  it.each([
    { sources: 115, useNonce: false, useStrictDynamic: false },
    { sources: 110, useNonce: true, useStrictDynamic: false },
    { sources: 109, useNonce: true, useStrictDynamic: true }
  ])(
    'keeps all three script directives at $sources sources (nonce=$useNonce, strictDynamic=$useStrictDynamic)',
    ({ sources, useNonce, useStrictDynamic }) => {
      const directives = [
        createDirective(Directives.ScriptSource, generateSources(sources, useNonce, useStrictDynamic)),
        createDirective(
          Directives.ScriptSourceElement,
          generateSources(117, useNonce, useStrictDynamic)
        ),
        createDirective(Directives.ScriptSourceAttribute, generateSources(117)),
        createDirective(Directives.StyleSource, generateSources(100, useNonce, useStrictDynamic))
      ];

      const result = groupDirectives(directives);
      const scriptsGroup = groupStartingWith(result, Directives.ScriptSource);

      expect(scriptsGroup).toHaveLength(3);
      expect(
        scriptsGroup?.filter((d) => d.directive === Directives.ScriptSource)
      ).toHaveLength(1);
      expect(
        scriptsGroup?.filter((d) => d.directive === Directives.ScriptSourceElement)
      ).toHaveLength(1);
      expect(
        scriptsGroup?.filter((d) => d.directive === Directives.ScriptSourceAttribute)
      ).toHaveLength(1);
    }
  );

  it.each([
    { sources: 113, useNonce: false, useStrictDynamic: false },
    { sources: 109, useNonce: true, useStrictDynamic: false },
    { sources: 108, useNonce: true, useStrictDynamic: true }
  ])(
    'keeps all three script directives plus report-to at $sources sources',
    ({ sources, useNonce, useStrictDynamic }) => {
      const directives = [
        createDirective(Directives.ScriptSource, generateSources(sources, useNonce, useStrictDynamic)),
        createDirective(
          Directives.ScriptSourceElement,
          generateSources(117, useNonce, useStrictDynamic)
        ),
        createDirective(Directives.ScriptSourceAttribute, generateSources(117)),
        createDirective(Directives.StyleSource, generateSources(100, useNonce, useStrictDynamic)),
        createDirective(Directives.ReportTo, 'report-url-header')
      ];

      const result = groupDirectives(directives);
      const scriptsGroup = groupStartingWith(result, Directives.ScriptSource);

      expect(scriptsGroup).toHaveLength(4);
      expect(
        scriptsGroup?.filter((d) => d.directive === Directives.ReportTo)
      ).toHaveLength(1);
    }
  );
});

describe('report-to preservation', () => {
  // 60 sources across six directives lands at roughly 8.3 KB: past the 8100
  // split threshold, comfortably below the 15500 terminal threshold. Raising
  // this to 120 blows the terminal threshold and yields NO groups at all —
  // see the terminal-threshold note in the suite below.
  it('appears in every split group', () => {
    const sources = generateSources(60);
    const directives = [
      createDirective(Directives.ConnectSource, sources),
      createDirective(Directives.FontSource, sources),
      createDirective(Directives.ImageSource, sources),
      createDirective(Directives.ManifestSource, sources),
      createDirective(Directives.MediaSource, sources),
      createDirective(Directives.ObjectSource, sources),
      createDirective(Directives.ReportTo, 'report-url-header')
    ];

    const result = groupDirectives(directives);

    expect(result.length).toBeGreaterThan(1);
    for (const group of result) {
      expect(group.some((d) => d.directive === Directives.ReportTo)).toBe(true);
    }
  });

  it('is absent from every group when no collector is configured', () => {
    const sources = generateSources(120);
    const directives = [
      createDirective(Directives.ConnectSource, sources),
      createDirective(Directives.FontSource, sources),
      createDirective(Directives.ImageSource, sources)
    ];

    const result = groupDirectives(directives);

    for (const group of result) {
      expect(group.some((d) => d.directive === Directives.ReportTo)).toBe(false);
    }
  });
});

describe('thresholds', () => {
  it('returns a single unmodified group when the policy fits', () => {
    const directives = [
      createDirective(Directives.DefaultSource, [Sources.Self]),
      createDirective(Directives.ScriptSource, ["'self'", 'https://example.com'])
    ];

    const result = groupDirectives(directives);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(directives);
  });

  // C# [TestCase(73, false)] / [TestCase(74, true)]
  it.each([
    { sources: 73, shouldBeEmpty: false },
    { sources: 74, shouldBeEmpty: true }
  ])(
    'emits nothing past the terminal threshold at $sources sources',
    ({ sources, shouldBeEmpty }) => {
      const generated = generateSources(sources);
      const directives = [
        Directives.FrameSource,
        Directives.ScriptSource,
        Directives.StyleSource,
        Directives.ConnectSource,
        Directives.FontSource,
        Directives.ImageSource,
        Directives.ManifestSource,
        Directives.MediaSource,
        Directives.ObjectSource
      ].map((name) => createDirective(name, generated));
      directives.push(createDirective(Directives.ReportTo, 'report-url-header'));

      const result = groupDirectives(directives);

      expect(result.length === 0).toBe(shouldBeEmpty);
    }
  );

  // C# [TestCase(31, 1)] / [TestCase(32, 5)]
  it.each([
    { sources: 31, expectedGroups: 1 },
    { sources: 32, expectedGroups: 5 }
  ])('splits into $expectedGroups group(s) at $sources sources', ({ sources, expectedGroups }) => {
    const generated = generateSources(sources);
    const directives = [
      Directives.FrameSource,
      Directives.ScriptSource,
      Directives.ScriptSourceElement,
      Directives.StyleSource,
      Directives.StyleSourceElement,
      Directives.ConnectSource,
      Directives.FontSource,
      Directives.ImageSource,
      Directives.ManifestSource,
      Directives.MediaSource,
      Directives.ObjectSource
    ].map((name) => createDirective(name, generated));
    directives.push(createDirective(Directives.ReportTo, 'report-url-header'));

    expect(groupDirectives(directives)).toHaveLength(expectedGroups);
  });

  // C# [TestCase(39, 4)] / [TestCase(40, 2)] — past the simplification
  // threshold the script and style families collapse to two entries
  // (primary directive + report-to).
  it.each([
    { sources: 39, expectedCount: 4 },
    { sources: 40, expectedCount: 2 }
  ])(
    'collapses script and style families to $expectedCount entries at $sources sources',
    ({ sources, expectedCount }) => {
      const generated = generateSources(sources);
      const directives = [
        Directives.FrameSource,
        Directives.ScriptSource,
        Directives.ScriptSourceElement,
        Directives.ScriptSourceAttribute,
        Directives.StyleSource,
        Directives.StyleSourceElement,
        Directives.StyleSourceAttribute,
        Directives.ConnectSource,
        Directives.FontSource,
        Directives.ImageSource,
        Directives.ManifestSource,
        Directives.MediaSource,
        Directives.ObjectSource
      ].map((name) => createDirective(name, generated));
      directives.push(createDirective(Directives.ReportTo, 'report-url-header'));

      const result = groupDirectives(directives);

      expect(groupStartingWith(result, Directives.ScriptSource)).toHaveLength(expectedCount);
      expect(groupStartingWith(result, Directives.StyleSource)).toHaveLength(expectedCount);
    }
  );
});

describe('edge cases', () => {
  it('handles very long domain names', () => {
    const longDomain = `https://${'a'.repeat(200)}.example.com`;
    const directives = [
      createDirective(Directives.ScriptSource, Array.from({ length: 60 }, () => longDomain)),
      createDirective(Directives.StyleSource, generateSources(50))
    ];

    expect(() => groupDirectives(directives)).not.toThrow();
  });

  it('handles special keywords only', () => {
    const directives = [
      createDirective(Directives.DefaultSource, [Sources.None]),
      createDirective(Directives.ScriptSource, [Sources.Self, Sources.UnsafeInline])
    ];

    const result = groupDirectives(directives);

    expect(result).toHaveLength(1);
  });

  it('returns an empty group list for no input', () => {
    expect(groupDirectives([])).toEqual([[]]);
  });
});
