/**
 * The RPC contract between the console and the backend.
 *
 * This is the seam that replaces the 36 build-time `VITE_*` endpoint variables in
 * the PaaS UI. The console never constructs a URL — it calls
 * `context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, { action, params })`
 * and the backend switches on `action`.
 *
 * Lives in `shared/` so both halves compile against the same types. **Types and
 * pure helpers only** — no node builtins (breaks the browser bundle), no browser
 * globals (breaks backend startup), no secrets (shared code ships to the browser).
 */

import type { ConfigDocument, HeaderDto } from './config.js';

/** Must match the `functions:` key in app.yml. */
export const CMS_EXTENSION_FUNCTION_ID = 'cms_extension';

/**
 * Which app/host a request concerns. Mirrors the PaaS `appId`/`hostName`
 * scoping, which is already the product's multi-tenancy axis.
 *
 * Both omitted means the global scope.
 */
export interface Scope {
  readonly appId?: string;
  readonly hostName?: string;
}

export const Actions = {
  /** Read the draft for a scope, with the standard-header rows materialised. */
  GetDraft: 'getDraft',
  /** Overwrite the draft. Uses a CAS patch, so concurrent editors cannot clobber. */
  SaveDraft: 'saveDraft',
  /** Compile the draft and write it to `compiled:v1:{scope}` — makes it live. */
  Publish: 'publish',
  /** Compile the draft without storing it, so the console can preview. */
  PreviewDraft: 'previewDraft',
  /** Live headers plus whether the draft differs from them. */
  GetStatus: 'getStatus',
  /** Whole-config JSON for backup. */
  Export: 'export',
  /** Replace the draft from a previously exported document. */
  Import: 'import',
  /** The public URL a site head fetches compiled headers from. */
  GetIntegration: 'getIntegration'
} as const;

export type Action = (typeof Actions)[keyof typeof Actions];

/**
 * Every response is enveloped so the console can branch on one shape rather than
 * inspecting status codes. Transport failures reject; application failures arrive
 * as `ok: false` with a non-2xx status.
 */
export type Envelope<T> =
  | { readonly ok: true; readonly result: T }
  | { readonly ok: false; readonly error: string; readonly message?: string };

export interface DraftResult {
  readonly config: ConfigDocument;
  /** Bumped on every save; echo it back on save to detect a stale editor. */
  readonly revision: number;
}

/**
 * An imported document, before validation.
 *
 * Deliberately `unknown`-shaped rather than `ConfigDocument`: import is an
 * untrusted path — a customer can paste any JSON — so the type must not claim
 * more than has been checked. The backend validates before it is stored.
 */
export type ConfigDocumentPayload = unknown;

export interface PublishResult {
  readonly headers: readonly HeaderDto[];
  readonly publishedAt: string;
  readonly publishedBy: string;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * What a site head needs in order to consume this installation.
 *
 * The URL embeds a per-installation UUID, so it cannot be derived or guessed —
 * without surfacing it here a customer would have to run
 * `ocp directory listFunctions` to integrate, which is not a reasonable ask of
 * someone configuring headers in a CMS.
 *
 * It changes if the app is ever uninstalled and reinstalled.
 */
export interface IntegrationResult {
  readonly compiledHeadersUrl?: string;
}

export interface StatusResult {
  readonly hasUnpublishedChanges: boolean;
  readonly publishedAt?: string;
  readonly publishedBy?: string;
  readonly liveHeaders: readonly HeaderDto[];
  readonly pendingHeaders: readonly HeaderDto[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Something the editor needs to know about a compile result.
 *
 * `policy-dropped` is the important one: past the 15500-byte terminal threshold
 * the optimiser emits *nothing*, so a site would silently lose its CSP entirely.
 * On PaaS that leaves a server-side log; on SaaS there is nowhere for it to
 * surface except here, so the console must show it before a publish lands.
 */
export interface Diagnostic {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code:
    | 'policy-dropped'
    | 'policy-split'
    | 'approaching-size-limit'
    | 'no-directives-granted'
    | 'no-headers';
  readonly message: string;
}

/** Error codes the console is expected to recognise. */
export const ErrorCodes = {
  UnknownAction: 'unknown_action',
  InvalidPayload: 'invalid_payload',
  StaleRevision: 'stale_revision',
  ConfigTooLarge: 'config_too_large',
  StorageFailure: 'storage_failure'
} as const;

/** Stable, human-readable label for a scope — used in keys and messages. */
export function describeScope(scope: Scope): string {
  if (scope.hostName) {
    return `${scope.appId ?? '*'} / ${scope.hostName}`;
  }

  return scope.appId ? `${scope.appId} / all hosts` : 'global';
}
