/**
 * Structural validation for a configuration document.
 *
 * Two reasons this is stricter than it might seem necessary:
 *
 *   1. **Import is an untrusted path.** A customer can paste any JSON into the
 *      import tool, and it lands straight in the system of record.
 *   2. **The read path does not validate.** `compiled_headers` reads precompiled
 *      output and serves it, so anything malformed that gets stored is served to
 *      a live site. Validation has to happen on the way in.
 *
 * These rules are deliberately structural. Source-value rules (is this a valid
 * CSP source?) belong in `shared/` so the console can apply them live — they are
 * a separate concern and follow with the console work. Header name and value
 * rules already live there, in `shared/header-rules.ts`, because a customer
 * types their own header names: the console has to reject what this would.
 */

import {
  CustomHeaderBehavior,
  PermissionPolicyState,
  type ConfigDocument,
  type CspSourceConfig,
  type CustomHeaderConfig,
  type PermissionPolicyDirectiveConfig
} from '../../shared/config.js';
import { ALL_DIRECTIVES } from '../../shared/constants.js';
import {
  HEADER_NAME_RULE,
  RESERVED_HEADER_NAMES,
  hasControlCharacters,
  isValidHeaderName
} from '../../shared/header-rules.js';
import {
  ALL_PERMISSION_POLICY_DIRECTIVES,
  PERMISSION_POLICY_ORIGIN_RULE,
  isValidPermissionPolicyOrigin,
  stateRequiresOrigins
} from '../../shared/permission-policy.js';

const KNOWN_DIRECTIVES = new Set(ALL_DIRECTIVES.map((d) => d.toLowerCase()));
const KNOWN_BEHAVIORS = new Set<string>(Object.values(CustomHeaderBehavior));
const KNOWN_PERMISSION_POLICY_DIRECTIVES = new Set(
  ALL_PERMISSION_POLICY_DIRECTIVES.map((d) => d.toLowerCase())
);
const KNOWN_PERMISSION_POLICY_STATES = new Set<string>(Object.values(PermissionPolicyState));

/** Returns human-readable problems; empty means valid. */
export function validateConfig(config: unknown): string[] {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    return ['Configuration must be an object.'];
  }

  const doc = config as Partial<ConfigDocument>;

  if (doc.version !== 1) {
    errors.push(`Unsupported configuration version '${String(doc.version)}'; expected 1.`);
  }

  if (!doc.settings || typeof doc.settings !== 'object') {
    errors.push('Configuration is missing a `settings` object.');
  } else {
    const { externalReportToUrl, useExternalReporting } = doc.settings;

    if (useExternalReporting && !isNonEmptyString(externalReportToUrl)) {
      errors.push('External reporting is enabled but no collector URL is set.');
    }

    if (isNonEmptyString(externalReportToUrl) && !isValidReportUrl(externalReportToUrl)) {
      errors.push(
        `The violation report collector URL '${externalReportToUrl}' is not a valid absolute HTTPS URL.`
      );
    }
  }

  if (!doc.sandbox || typeof doc.sandbox !== 'object') {
    errors.push('Configuration is missing a `sandbox` object.');
  }

  if (!Array.isArray(doc.sources)) {
    errors.push('Configuration is missing a `sources` array.');
  } else {
    errors.push(...validateSources(doc.sources));
  }

  if (!Array.isArray(doc.headers)) {
    errors.push('Configuration is missing a `headers` array.');
  } else {
    errors.push(...validateHeaders(doc.headers));
  }

  // Validated only when present, unlike the sections above. Export/import is the
  // only backup a customer can hold, so a document exported before this section
  // existed has to remain restorable — `normaliseConfig` fills it in on the way
  // through. A missing-section check here would make every older export
  // unimportable.
  if (doc.permissionPolicy !== undefined) {
    if (typeof doc.permissionPolicy !== 'object' || doc.permissionPolicy === null) {
      errors.push('`permissionPolicy` must be an object.');
    } else {
      // Checked rather than defaulted: a document carrying directives but no
      // flag would be stored and then treated as disabled, so a configured
      // policy would silently emit nothing. Stricter than the `settings` and
      // `sandbox` sections, deliberately — this one has a state where being
      // wrong is invisible.
      if (typeof doc.permissionPolicy.isEnabled !== 'boolean') {
        errors.push('`permissionPolicy.isEnabled` must be true or false.');
      }

      if (!Array.isArray(doc.permissionPolicy.directives)) {
        errors.push('Configuration is missing a `permissionPolicy.directives` array.');
      } else {
        errors.push(...validatePermissionPolicy(doc.permissionPolicy.directives));
      }
    }
  }

  return errors;
}

function validatePermissionPolicy(
  directives: readonly PermissionPolicyDirectiveConfig[]
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  directives.forEach((entry, index) => {
    const label = `Permissions Policy directive ${index + 1}`;

    if (!isNonEmptyString(entry?.directive)) {
      errors.push(`${label} has no name.`);
      return;
    }

    const name = entry.directive.toLowerCase();

    if (!KNOWN_PERMISSION_POLICY_DIRECTIVES.has(name)) {
      errors.push(`${label} ('${entry.directive}') is not a recognised directive.`);
    }

    // Rejected rather than last-wins: which of two rows for the same directive
    // took effect would be invisible in the console.
    if (seen.has(name)) {
      errors.push(`Permissions Policy directive '${entry.directive}' is configured more than once.`);
    }
    seen.add(name);

    if (!KNOWN_PERMISSION_POLICY_STATES.has(String(entry.state))) {
      errors.push(
        `${label} ('${entry.directive}') has an unknown state '${String(entry.state)}'. ` +
          `Expected one of ${[...KNOWN_PERMISSION_POLICY_STATES].join(', ')}.`
      );
      return;
    }

    if (!Array.isArray(entry.origins)) {
      errors.push(`${label} ('${entry.directive}') is missing an \`origins\` array.`);
      return;
    }

    // Non-string elements have to be rejected explicitly, not merely skipped.
    // `isNonEmptyString` already excludes them from `origins` below, which means
    // validation would pass in silence and leave the value in the stored
    // document — where `toPolicyFragment` calls `trim()` on it and throws, so a
    // malformed import would resurface as a 500 on the next status or publish.
    if (entry.origins.some((origin) => typeof origin !== 'string')) {
      errors.push(
        `${label} ('${entry.directive}') has an origin that is not text. Origins must be strings.`
      );
    }

    const origins = entry.origins.filter((origin) => isNonEmptyString(origin));

    // An empty list is what makes `SpecificSites` collapse to `()` — blocking the
    // feature rather than allowing the origins the editor meant to name. Rejecting
    // it here is what keeps that unreachable from the console.
    if (stateRequiresOrigins(entry.state) && origins.length === 0) {
      errors.push(
        `${label} ('${entry.directive}') targets specific sites but lists no origins.`
      );
    }

    origins.forEach((origin) => {
      if (hasControlCharacters(origin)) {
        errors.push(`${label} ('${entry.directive}') has an origin containing control characters.`);
        return;
      }

      if (!isValidPermissionPolicyOrigin(origin)) {
        errors.push(
          `${label} ('${entry.directive}') has an invalid origin '${origin}'. ` +
            PERMISSION_POLICY_ORIGIN_RULE
        );
      }
    });
  });

  return errors;
}

function validateSources(sources: readonly CspSourceConfig[]): string[] {
  const errors: string[] = [];

  sources.forEach((source, index) => {
    const label = `Source ${index + 1}`;

    if (!isNonEmptyString(source?.source)) {
      errors.push(`${label} has no domain.`);
      return;
    }

    if (hasControlCharacters(source.source)) {
      errors.push(`${label} ('${source.source}') contains control characters.`);
    }

    if (!Array.isArray(source.directives) || source.directives.length === 0) {
      errors.push(`${label} ('${source.source}') has no directives.`);
      return;
    }

    const unknown = source.directives.filter((d) => !KNOWN_DIRECTIVES.has(String(d).toLowerCase()));
    if (unknown.length > 0) {
      errors.push(`${label} ('${source.source}') has unknown directives: ${unknown.join(', ')}.`);
    }
  });

  return errors;
}

function validateHeaders(headers: readonly CustomHeaderConfig[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  headers.forEach((header, index) => {
    const label = `Header ${index + 1}`;

    if (!isNonEmptyString(header?.headerName)) {
      errors.push(`${label} has no name.`);
      return;
    }

    if (!isValidHeaderName(header.headerName)) {
      errors.push(
        `${label} ('${header.headerName}') is not a valid HTTP header name. ${HEADER_NAME_RULE}`
      );
    }

    // Duplicates are rejected rather than silently last-wins, because which one
    // took effect would be invisible in the console.
    const key = header.headerName.toLowerCase();
    if (seen.has(key)) {
      errors.push(`Header '${header.headerName}' is configured more than once.`);
    }
    seen.add(key);

    // A header the engine compiles from elsewhere in this document. Two headers
    // of the same name would compete, and the console shows no sign of the one
    // coming from the other tab.
    if (RESERVED_HEADER_NAMES.has(key)) {
      errors.push(
        `Header '${header.headerName}' is managed by this app and cannot be set as a custom ` +
          'header. Configure it on its own tab instead.'
      );
    }

    if (!KNOWN_BEHAVIORS.has(String(header.behavior))) {
      errors.push(
        `${label} ('${header.headerName}') has an unknown behaviour '${String(header.behavior)}'. ` +
          `Expected one of ${[...KNOWN_BEHAVIORS].join(', ')}.`
      );
    }

    if (typeof header.headerValue === 'string' && hasControlCharacters(header.headerValue)) {
      errors.push(`${label} ('${header.headerName}') has a value containing control characters.`);
    }

    if (header.behavior === CustomHeaderBehavior.Add && !isNonEmptyString(header.headerValue)) {
      errors.push(`${label} ('${header.headerName}') is set to Add but has no value.`);
    }
  });

  return errors;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Report collectors must be absolute HTTPS. Browsers will not post violation
 * reports to a plain-HTTP endpoint from an HTTPS page, so allowing `http:` would
 * produce a configuration that silently never reports.
 */
function isValidReportUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
