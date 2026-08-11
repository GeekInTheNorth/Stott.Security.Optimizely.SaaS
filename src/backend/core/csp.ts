/**
 * Builds CSP headers from configuration.
 *
 * Ported from Features/Csp/CspService.cs (directive construction only — data
 * access and route resolution stay behind in PaaS). As with the optimiser this
 * is a faithful port: C# behaviour is the specification and ordering is
 * load-bearing, because the golden-file harness compares emitted bytes.
 *
 * Omitted relative to PaaS, per the SaaS scope decisions:
 *   - per-page CSP sources, and with them the whole `SecurityRouteType` /
 *     nonce-and-hash-stripping concept (there are no CMS admin routes in a head)
 *   - internal violation reporting — external collectors only
 */

import {
  ALL_DIRECTIVES,
  ALL_SOURCES,
  Directives,
  EXTERNAL_REPORT_ENDPOINT_NAME,
  HeaderNames,
  SANDBOX_TOKENS,
  Sources
} from '../../shared/constants.js';
import type {
  ConfigDocument,
  CspSettingsConfig,
  CspSourceConfig,
  HeaderDto,
  SandboxConfig
} from '../../shared/config.js';
import { createDirective, directiveToString, type CspDirective } from './directive.js';
import { groupDirectives } from './optimizer.js';

/**
 * Why the CSP compiled to what it did.
 *
 * The console cannot infer this from an empty header list: "too large to emit"
 * and "nothing meaningful configured" both produce zero headers, and reporting
 * the wrong one is worse than reporting nothing. A source with no directives
 * granted — the state every source is in immediately after it is added — hits
 * the second case.
 */
export type CspOutcome =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'nothing-configured' }
  | { readonly kind: 'no-directives-granted' }
  | { readonly kind: 'dropped' }
  | { readonly kind: 'emitted'; readonly headerCount: number };

/**
 * Compiles, and reports the outcome.
 *
 * Shares the exact code path {@link compileCspHeaders} uses, so the explanation
 * can never disagree with what was actually emitted.
 */
export function analyseCsp(config: ConfigDocument): CspOutcome {
  const { settings, sandbox, sources } = config;

  if (!settings.isEnabled) {
    return { kind: 'disabled' };
  }

  const directives = getAllDirectives(settings, sandbox, sources);

  if (directives.length === 0) {
    // Sources exist but none grant a directive — distinguish that from having
    // configured nothing at all, because the remedy is different.
    const hasSourcesWithoutDirectives = sources.some(
      (source) => source.source.trim().length > 0 && source.directives.length === 0
    );

    return hasSourcesWithoutDirectives
      ? { kind: 'no-directives-granted' }
      : { kind: 'nothing-configured' };
  }

  // An empty group list is the optimiser giving up past the terminal threshold.
  const groups = groupDirectives(directives);
  if (groups.length === 0) {
    return { kind: 'dropped' };
  }

  const headerCount = groups
    .map((group) => group.map(directiveToString).join('').trim())
    .filter((value) => value.length > 0).length;

  return headerCount === 0 ? { kind: 'nothing-configured' } : { kind: 'emitted', headerCount };
}

/**
 * Compiles the CSP headers for one scope.
 *
 * Returns an empty array when CSP is disabled, when there is nothing to say, or
 * when the policy is so large that even the optimiser gives up — callers must
 * treat all three the same way: emit no CSP header at all.
 *
 * The `'nonce-random'` placeholder is left intact; the head substitutes a real
 * per-request nonce.
 */
export function compileCspHeaders(config: ConfigDocument): HeaderDto[] {
  const { settings, sandbox, sources } = config;

  if (!settings.isEnabled) {
    return [];
  }

  const headers = buildCspHeaders(settings, sandbox, sources);
  if (headers.length === 0) {
    return [];
  }

  const reportingEndpoints = getReportingEndpoints(settings);
  if (reportingEndpoints.length > 0) {
    headers.push({
      key: HeaderNames.ReportingEndpoints,
      value: reportingEndpoints.join(', '),
      isRemoval: false,
      isReplacement: true
    });
  }

  return headers;
}

function buildCspHeaders(
  settings: CspSettingsConfig,
  sandbox: SandboxConfig,
  sources: readonly CspSourceConfig[]
): HeaderDto[] {
  // Nothing worth emitting a header for.
  if (
    sources.length === 0 &&
    !settings.isUpgradeInsecureRequestsEnabled &&
    !sandbox.isSandboxEnabled
  ) {
    return [];
  }

  const headerName = settings.isReportOnly
    ? HeaderNames.ReportOnlyContentSecurityPolicy
    : HeaderNames.ContentSecurityPolicy;

  return (
    buildCspContent(settings, sandbox, sources)
      // DELIBERATE DIVERGENCE from CspService.cs, producing identical observable
      // output. The C# service can emit an empty-valued CSP header: reach the
      // "we have sources" gate with rows whose source or directives are blank,
      // every directive then gets filtered out, and one empty group remains.
      // PaaS discards those downstream in two separate places — the API boundary
      // (`CompiledHeaderController` filters `!IsNullOrWhiteSpace(Value) ||
      // IsRemoval`) and the middleware (`HandleAppend`/`HandleReplacement` both
      // return early on a whitespace value). We do it once, at the source, so
      // every consumer inherits it rather than having to remember.
      .filter((value) => value.trim().length > 0)
      .map((value) => ({ key: headerName, value, isRemoval: false, isReplacement: false }))
  );
}

/** One string per emitted header. */
function buildCspContent(
  settings: CspSettingsConfig,
  sandbox: SandboxConfig,
  sources: readonly CspSourceConfig[]
): string[] {
  const directives = getAllDirectives(settings, sandbox, sources);

  return groupDirectives(directives).map((group) =>
    group.map(directiveToString).join('').trim()
  );
}

function getAllDirectives(
  settings: CspSettingsConfig,
  sandbox: SandboxConfig,
  sources: readonly CspSourceConfig[]
): CspDirective[] {
  const directives = getFetchDirectives(sources);

  if (settings.isUpgradeInsecureRequestsEnabled) {
    directives.push(createDirective(Directives.UpgradeInsecureRequests, []));
  }

  const sandboxDirective = getSandboxDirective(settings, sandbox);
  if (sandboxDirective) {
    directives.push(sandboxDirective);
  }

  const reportToEndpoints = getReportToEndpoints(settings);
  if (reportToEndpoints.length > 0) {
    directives.push(createDirective(Directives.ReportTo, reportToEndpoints));
  }

  return directives;
}

/**
 * Turns domain-to-directive grants inside out: from "this domain may do X and Y"
 * into "directive X permits these domains".
 *
 * Two ordering rules are preserved exactly from the C# original:
 *
 *   - **Directive order follows first appearance across sources**, not a global
 *     sort. Each source's own directive list is normalised into
 *     `ALL_DIRECTIVES` order, so the flattened distinct order is the first
 *     source's directives followed by any new ones from later sources.
 *   - **Source order is keyword-precedence first** (`ALL_SOURCES` index, or 100
 *     for anything else), then alphabetical.
 *
 * `'none'` wins outright: if any source grants a directive as `'none'`, that
 * directive emits `'none'` alone.
 */
function getFetchDirectives(sources: readonly CspSourceConfig[]): CspDirective[] {
  const normalised = sources
    .filter((s) => s.source.trim().length > 0 && s.directives.length > 0)
    .map((s) => ({
      source: s.source,
      // Filtering ALL_DIRECTIVES (rather than the source's own list) is what
      // imposes canonical directive order and drops unknown directives.
      directives: ALL_DIRECTIVES.filter((d) =>
        s.directives.some((sd) => sd.toLowerCase() === d.toLowerCase())
      )
    }));

  if (normalised.length === 0) {
    return [];
  }

  const distinctDirectives = [...new Set(normalised.flatMap((s) => s.directives))];
  const noneDirectives = new Set(
    normalised.filter((s) => s.source === Sources.None).flatMap((s) => s.directives)
  );

  return distinctDirectives.map((directive) => {
    if (noneDirectives.has(directive)) {
      return createDirective(directive, [Sources.None]);
    }

    const directiveSources = normalised
      .filter((s) => s.directives.includes(directive))
      .map((s) => toLowerSource(s.source))
      .sort(compareSources);

    return createDirective(directive, [...new Set(directiveSources)]);
  });
}

/**
 * Sandbox is suppressed in report-only mode: a report-only sandbox directive is
 * ignored by browsers, and emitting it wastes header bytes.
 */
function getSandboxDirective(
  settings: CspSettingsConfig,
  sandbox: SandboxConfig
): CspDirective | undefined {
  if (!sandbox.isSandboxEnabled || !settings.isEnabled || settings.isReportOnly) {
    return undefined;
  }

  const tokens = SANDBOX_TOKENS.filter(([flag]) => sandbox[flag] === true).map(
    ([, token]) => token
  );

  return createDirective(Directives.Sandbox, tokens);
}

/** Endpoint *names* referenced by the `report-to` directive. */
function getReportToEndpoints(settings: CspSettingsConfig): string[] {
  return settings.useExternalReporting && settings.externalReportToUrl.length > 0
    ? [EXTERNAL_REPORT_ENDPOINT_NAME]
    : [];
}

/** `name="url"` pairs for the `Reporting-Endpoints` response header. */
function getReportingEndpoints(settings: CspSettingsConfig): string[] {
  return settings.isEnabled &&
    settings.useExternalReporting &&
    settings.externalReportToUrl.length > 0
    ? [`${EXTERNAL_REPORT_ENDPOINT_NAME}="${settings.externalReportToUrl}"`]
    : [];
}

/** Hashes keep their casing — base64 is case-sensitive. Everything else lowercases. */
function toLowerSource(value: string): string {
  return value.toLowerCase().startsWith("'sha") ? value : value.toLowerCase();
}

function compareSources(a: string, b: string): number {
  const indexDelta = getSortIndex(a) - getSortIndex(b);
  if (indexDelta !== 0) {
    return indexDelta;
  }

  // Ordinal, matching .NET's default string comparison for OrderBy/ThenBy.
  return a < b ? -1 : a > b ? 1 : 0;
}

function getSortIndex(source: string): number {
  const index = ALL_SOURCES.indexOf(source);

  return index < 0 ? 100 : index;
}
