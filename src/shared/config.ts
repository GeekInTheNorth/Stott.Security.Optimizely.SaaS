/**
 * The configuration document, and the types the console and engine agree on.
 *
 * One document per app/host scope, stored in OCP `kvStore` under
 * `config:v1:{appId}:{hostName}` (draft) with the compiled output under
 * `compiled:v1:{appId}:{hostName}` (live).
 *
 * Shapes mirror the PaaS entities in Entities/, minus what SaaS omits:
 *   - no `Modified`/`ModifiedBy` — audit is out of scope
 *   - no internal reporting — external collectors only
 *   - no per-page sources — dropped from scope
 *
 * Note: every OCP kvStore key stores an *object*, never a bare array. Arrays
 * must stay as fields inside this document.
 */

import { SANDBOX_TOKENS } from './constants.js';

/** Behaviour of a response header. Mirrors `CustomHeaderBehavior`. */
export const CustomHeaderBehavior = {
  Disabled: 'Disabled',
  Add: 'Add',
  Remove: 'Remove'
} as const;

export type CustomHeaderBehaviorValue =
  (typeof CustomHeaderBehavior)[keyof typeof CustomHeaderBehavior];

/**
 * A domain and the directives it is granted. Mirrors `CspSource`, except
 * `directives` is a real array rather than the CSV string the SQL column holds.
 */
export interface CspSourceConfig {
  readonly id: string;
  readonly source: string;
  readonly directives: readonly string[];
}

export interface CustomHeaderConfig {
  readonly id: string;
  readonly headerName: string;
  readonly behavior: CustomHeaderBehaviorValue;
  readonly headerValue: string;
}

/**
 * What a Permissions Policy directive permits. Mirrors
 * `PermissionPolicyEnabledState`, minus its integer values — the PaaS column
 * stores the member *name*, so the names are the wire format either way.
 *
 * `Disabled` and `None` are not the same thing and must not be collapsed:
 * `Disabled` omits the directive so the browser default applies, whereas `None`
 * emits `()` and blocks the feature outright.
 */
export const PermissionPolicyState = {
  Disabled: 'Disabled',
  None: 'None',
  All: 'All',
  ThisSite: 'ThisSite',
  ThisAndSpecificSites: 'ThisAndSpecificSites',
  SpecificSites: 'SpecificSites'
} as const;

export type PermissionPolicyStateValue =
  (typeof PermissionPolicyState)[keyof typeof PermissionPolicyState];

/**
 * One directive's configuration.
 *
 * No `id`: the directive name is the identity, unique within a document, exactly
 * as a header name is. PaaS carries a `Guid` per origin, regenerated on every
 * read purely as React key material — which then leaks into its export. Origins
 * are plain strings here and the edit dialog generates its own keys locally.
 *
 * `origins` is only meaningful for `SpecificSites` and `ThisAndSpecificSites`.
 * It is retained rather than cleared when the state changes away from those, so
 * an editor who switches to `None` and back does not lose their list.
 */
export interface PermissionPolicyDirectiveConfig {
  readonly directive: string;
  readonly state: PermissionPolicyStateValue;
  readonly origins: readonly string[];
}

/**
 * Only directives the customer has touched are stored; the console materialises
 * the full set from `PERMISSION_POLICY_DIRECTIVES`. Mirrors the PaaS model,
 * where the table holds a row per configured directive and the API synthesises
 * the rest as `Disabled`.
 */
export interface PermissionPolicyConfig {
  readonly isEnabled: boolean;
  readonly directives: readonly PermissionPolicyDirectiveConfig[];
}

/** Derived from {@link SANDBOX_TOKENS} so the two cannot drift apart. */
export type SandboxFlag = (typeof SANDBOX_TOKENS)[number][0];

export type SandboxConfig = {
  readonly isSandboxEnabled: boolean;
} & {
  readonly [K in SandboxFlag]?: boolean;
};

/**
 * Global CSP settings.
 *
 * Deliberately does NOT carry `isNonceEnabled` / `isStrictDynamicEnabled`. Those
 * are legacy booleans in PaaS, retained there only so `MigrationRepository` can
 * remap old exports — nothing in the compile path reads them. Nonce and
 * strict-dynamic are **sources** (`'nonce-random'`, `'strict-dynamic'`) granted
 * to directives like any other. That is also why `CspOptimizer` counts nonce
 * sources rather than consulting settings.
 *
 * The agency allow list is omitted too: it required an outbound fetch from an
 * OCP function and would only refresh on publish, which is a stale-by-design
 * feature nobody asked for here.
 */
export interface CspSettingsConfig {
  readonly isEnabled: boolean;
  readonly isReportOnly: boolean;
  readonly isUpgradeInsecureRequestsEnabled: boolean;
  readonly useExternalReporting: boolean;
  /**
   * Absolute collector URL, entered in the console and stored in KV with the rest
   * of the draft. report-uri.com and its like embed an API key in the path, so
   * this field can hold a credential in plain text — which is why it is included
   * in an export, and why an export should be handled as a secret.
   */
  readonly externalReportToUrl: string;
}

export interface ConfigDocument {
  readonly version: 1;
  readonly settings: CspSettingsConfig;
  readonly sandbox: SandboxConfig;
  readonly sources: readonly CspSourceConfig[];
  readonly headers: readonly CustomHeaderConfig[];
  readonly permissionPolicy: PermissionPolicyConfig;
}

/**
 * A compiled header, ready for the head to apply. Mirrors `HeaderDto`.
 *
 * The two flags encode three distinct actions, and the head must honour all
 * three — mapping them onto the Fetch `Headers` API:
 *
 * | `isRemoval` | `isReplacement` | Action                    | Used by |
 * |-------------|-----------------|---------------------------|---------|
 * | `true`      | —               | `headers.delete(key)`     | `Remove` behaviour |
 * | `false`     | `true`          | `headers.set(key, value)` | `Add` behaviour |
 * | `false`     | `false`         | `headers.append(key, …)`  | CSP |
 *
 * CSP appends rather than replaces because a policy legitimately spans several
 * `Content-Security-Policy` headers — that is how the optimiser's splitting
 * works. Treating CSP as a replacement would silently discard every header bar
 * the last.
 */
export interface HeaderDto {
  readonly key: string;
  readonly value: string;
  readonly isRemoval: boolean;
  readonly isReplacement: boolean;
}

export const EMPTY_SETTINGS: CspSettingsConfig = {
  isEnabled: false,
  isReportOnly: false,
  isUpgradeInsecureRequestsEnabled: false,
  useExternalReporting: false,
  externalReportToUrl: ''
};

export const EMPTY_PERMISSION_POLICY: PermissionPolicyConfig = {
  isEnabled: false,
  directives: []
};

export function createEmptyConfig(): ConfigDocument {
  return {
    version: 1,
    settings: EMPTY_SETTINGS,
    sandbox: { isSandboxEnabled: false },
    sources: [],
    headers: [],
    permissionPolicy: EMPTY_PERMISSION_POLICY
  };
}

/**
 * Fills in sections a document does not carry.
 *
 * `readDraft` casts stored JSON straight to `ConfigDocument`, so a draft written
 * before a section existed would hand the engine `undefined` where the type
 * promises an object. Every installation that predates a new section is in that
 * state, which makes this the difference between an added section working and the
 * console throwing on load.
 *
 * Only ever adds. A section that is present is passed through **verbatim, even if
 * it is malformed** — `validateConfig` is the single judge of that, and coercing
 * a nonsense value into a valid default here would make its rules unreachable
 * from the import path, which runs this first.
 */
export function normaliseConfig(config: ConfigDocument): ConfigDocument {
  if (config.permissionPolicy !== undefined && config.permissionPolicy !== null) {
    return config;
  }

  return { ...config, permissionPolicy: EMPTY_PERMISSION_POLICY };
}
