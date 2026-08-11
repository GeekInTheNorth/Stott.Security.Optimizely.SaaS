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
  /** Absolute collector URL. Held in the settings store, not KV — may embed a key. */
  readonly externalReportToUrl: string;
}

export interface ConfigDocument {
  readonly version: 1;
  readonly settings: CspSettingsConfig;
  readonly sandbox: SandboxConfig;
  readonly sources: readonly CspSourceConfig[];
  readonly headers: readonly CustomHeaderConfig[];
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

export function createEmptyConfig(): ConfigDocument {
  return {
    version: 1,
    settings: EMPTY_SETTINGS,
    sandbox: { isSandboxEnabled: false },
    sources: [],
    headers: []
  };
}
