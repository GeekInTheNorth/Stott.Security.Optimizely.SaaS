/**
 * Splits a CSP into multiple headers to stay under CDN header-size limits.
 *
 * Ported from Features/Csp/CspOptimizer.cs. This is a deliberately faithful
 * port, not a redesign: the C# behaviour is the specification, the ported tests
 * are the conformance check, and the golden-file harness guards against drift.
 * Where the original does something surprising it is preserved and commented
 * rather than "fixed" — fixes belong in both engines at once, or neither.
 *
 * Directives are grouped by type so that a restrictive `default-src` in one
 * header cannot override a more permissive specific directive in another. Each
 * emitted group carries `default-src` (or its primary fallback) and `report-to`.
 *
 * Note: the C# signature takes an `ICspSettings` argument, but it is unused in
 * every code path — omitted here.
 */

import {
  Directives,
  Sources,
  SPLIT_THRESHOLD,
  SIMPLIFY_THRESHOLD,
  TERMINAL_THRESHOLD,
  NONCE_LENGTH_INCREASE
} from '../../shared/constants.js';
import { createDirective, type CspDirective } from './directive.js';

const FRAME_SOURCE_DIRECTIVES: readonly string[] = [
  Directives.FencedFrameSource,
  Directives.FrameSource,
  Directives.WorkerSource,
  Directives.ChildSource
];

const SCRIPT_SOURCE_DIRECTIVES: readonly string[] = [
  Directives.ScriptSourceElement,
  Directives.ScriptSourceAttribute,
  Directives.ScriptSource
];

const STYLE_SOURCE_DIRECTIVES: readonly string[] = [
  Directives.StyleSourceElement,
  Directives.StyleSourceAttribute,
  Directives.StyleSource
];

const OTHER_FETCH_DIRECTIVES: readonly string[] = [
  Directives.ConnectSource,
  Directives.FontSource,
  Directives.ImageSource,
  Directives.ManifestSource,
  Directives.MediaSource,
  Directives.ObjectSource
];

const STANDALONE_DIRECTIVES: readonly string[] = [
  Directives.BaseUri,
  Directives.FormAction,
  Directives.FrameAncestors,
  Directives.UpgradeInsecureRequests,
  Directives.Sandbox
];

/**
 * Groups directives into one header's worth of directives per entry.
 *
 * Returns a single group unchanged when the policy fits. Returns an empty array
 * when even the optimised form exceeds {@link TERMINAL_THRESHOLD} — callers must
 * treat that as "emit no CSP" rather than "emit an empty CSP".
 */
export function groupDirectives(cspDirectives: readonly CspDirective[]): CspDirective[][] {
  const splitThreshold = getSplitThreshold(cspDirectives);
  if (!exceedsSize(cspDirectives, splitThreshold)) {
    return [[...cspDirectives]];
  }

  const forceSimplification = exceedsSize(cspDirectives, SIMPLIFY_THRESHOLD);

  // Fall back to 'self' when there is no default-src, so every emitted header
  // has a defined baseline.
  const defaultSrc =
    cspDirectives.find((d) => d.directive === Directives.DefaultSource) ??
    createDirective(Directives.DefaultSource, [Sources.Self]);

  const reportTo = cspDirectives.find((d) => d.directive === Directives.ReportTo);

  const optimized: CspDirective[][] = [
    groupFetchDirectives(
      cspDirectives,
      defaultSrc,
      reportTo,
      FRAME_SOURCE_DIRECTIVES,
      Directives.ChildSource,
      forceSimplification
    ),
    groupFetchDirectives(
      cspDirectives,
      defaultSrc,
      reportTo,
      SCRIPT_SOURCE_DIRECTIVES,
      Directives.ScriptSource,
      forceSimplification
    ),
    groupFetchDirectives(
      cspDirectives,
      defaultSrc,
      reportTo,
      STYLE_SOURCE_DIRECTIVES,
      Directives.StyleSource,
      forceSimplification
    ),
    ...groupOtherFetchDirectives(cspDirectives, defaultSrc, reportTo, OTHER_FETCH_DIRECTIVES),
    ...groupStandaloneDirectives(cspDirectives, reportTo, STANDALONE_DIRECTIVES)
  ];

  if (exceedsSizeAcrossGroups(optimized, TERMINAL_THRESHOLD)) {
    return [];
  }

  return optimized;
}

/**
 * Collapses a related directive family (frame/script/style) into one header,
 * simplifying to the primary directive when the family alone would breach the
 * threshold or when simplification is forced globally.
 */
function groupFetchDirectives(
  cspDirectives: readonly CspDirective[],
  defaultSource: CspDirective,
  reportTo: CspDirective | undefined,
  directiveNames: readonly string[],
  primaryFallback: string,
  forceSimplification: boolean
): CspDirective[] {
  // Ordered by appearance in the input, not by directiveNames.
  let matching = cspDirectives.filter((d) => directiveNames.includes(d.directive));
  const allSources = distinct(matching.flatMap((d) => [...d.sources]));

  if (reportTo) {
    matching.push(reportTo);
  }

  const splitThreshold = getSplitThreshold(matching);
  if (forceSimplification || exceedsSize(matching, splitThreshold)) {
    matching = [createDirective(primaryFallback, allSources)];
    if (reportTo) {
      matching.push(reportTo);
    }
  }

  if (matching.length === 0 || !matching.some((d) => d.directive === primaryFallback)) {
    matching.push(createDirective(primaryFallback, defaultSource.sources));
  }

  return matching;
}

/**
 * Other fetch directives are materialised in `directiveNames` order, inheriting
 * default-src where absent, then bin-packed.
 */
function groupOtherFetchDirectives(
  cspDirectives: readonly CspDirective[],
  defaultSource: CspDirective,
  reportTo: CspDirective | undefined,
  directiveNames: readonly string[]
): CspDirective[][] {
  const matching = directiveNames.map(
    (name) =>
      cspDirectives.find((d) => d.directive === name) ??
      createDirective(name, defaultSource.sources)
  );

  if (reportTo) {
    matching.push(reportTo);
  }

  return groupWithHeaderSizeLimits(matching);
}

function groupStandaloneDirectives(
  cspDirectives: readonly CspDirective[],
  reportTo: CspDirective | undefined,
  directiveNames: readonly string[]
): CspDirective[][] {
  const matching = cspDirectives.filter((d) => directiveNames.includes(d.directive));

  if (reportTo) {
    matching.push(reportTo);
  }

  return groupWithHeaderSizeLimits(matching);
}

/**
 * Greedy bin-packing. Not optimal, but deterministic and better than emitting a
 * single oversized header.
 *
 * Two behaviours preserved verbatim from the C# original:
 *   - the running size excludes `report-to`, even though it is added to every
 *     group, so groups can slightly exceed the threshold;
 *   - because a fresh group is seeded with `report-to`, a trailing group
 *     containing only `report-to` can be emitted.
 */
function groupWithHeaderSizeLimits(cspDirectives: readonly CspDirective[]): CspDirective[][] {
  // Deliberately the raw constant, not the nonce-adjusted threshold.
  if (!exceedsSize(cspDirectives, SPLIT_THRESHOLD)) {
    return [[...cspDirectives]];
  }

  const reportTo = cspDirectives.find((d) => d.directive === Directives.ReportTo);
  const others = cspDirectives.filter((d) => d.directive !== Directives.ReportTo);

  const grouped: CspDirective[][] = [];
  let currentGroup = seedGroup(reportTo);
  let currentGroupSize = 0;

  for (const directive of others) {
    if (currentGroupSize + directive.predictedSize > SPLIT_THRESHOLD) {
      grouped.push(currentGroup);
      currentGroup = seedGroup(reportTo);
      currentGroupSize = 0;
    }

    currentGroup.push(directive);
    currentGroupSize += directive.predictedSize;
  }

  if (currentGroup.length > 0) {
    grouped.push(currentGroup);
  }

  return grouped;
}

function seedGroup(reportTo: CspDirective | undefined): CspDirective[] {
  return reportTo ? [reportTo] : [];
}

/** Strictly greater than `limit`, short-circuiting like the C# original. */
function exceedsSize(directives: readonly CspDirective[], limit: number): boolean {
  let total = 0;
  for (const directive of directives) {
    total += directive.predictedSize;
    if (total > limit) {
      return true;
    }
  }
  return false;
}

function exceedsSizeAcrossGroups(groups: readonly CspDirective[][], limit: number): boolean {
  let total = 0;
  for (const group of groups) {
    for (const directive of group) {
      total += directive.predictedSize;
      if (total > limit) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Reduces the split threshold to leave room for real nonces, which are longer
 * than the `'nonce-random'` placeholder counted in `predictedSize`.
 */
function getSplitThreshold(directives: readonly CspDirective[]): number {
  const nonceAbleDirectives = directives
    .flatMap((d) => [...d.sources])
    .filter((s) => s.toLowerCase() === Sources.Nonce.toLowerCase()).length;

  return SPLIT_THRESHOLD - NONCE_LENGTH_INCREASE * nonceAbleDirectives;
}

/** First-occurrence-order dedupe, matching LINQ `Distinct()`. */
function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}
