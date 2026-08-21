/**
 * Typed transport between the console and the backend.
 *
 * This replaces `src/Common/httpClient.js` and the 36 build-time `VITE_*`
 * endpoint variables in the PaaS UI. There are no URLs here: the console calls
 * `context.extension.invokeFunction()` and the backend switches on `action`.
 *
 * That also removes three problems the PaaS app has to solve — the auth cookie,
 * CORS, and CSRF. Identity comes from the extension context, and the call never
 * leaves the CMS host.
 */

import type { ExtensionContext } from '@optimizely/cms-extensibility-sdk';

import {
  Actions,
  CMS_EXTENSION_FUNCTION_ID,
  type ConfigDocumentPayload,
  type DraftResult,
  type Envelope,
  type ImportResult,
  type IntegrationResult,
  type PublishResult,
  type Scope,
  type StatusResult
} from '../../shared/contracts.js';
import type { ConfigDocument } from '../../shared/config.js';
import type { HeaderRowModel } from '../../shared/standard-headers.js';

/**
 * A backend call that failed for an application reason rather than a transport
 * one. `code` is the machine-readable `ErrorCodes` value so callers can react —
 * a stale revision needs a reload prompt, a validation failure needs the message.
 */
export class BackendError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

export interface DraftWithRows extends DraftResult {
  readonly rows: readonly HeaderRowModel[];
}

/**
 * Calls the backend and unwraps the envelope.
 *
 * `invokeFunction` rejects only on transport failure; application failures come
 * back as a non-2xx status with `{ok: false}`. Both are normalised to a thrown
 * `BackendError` so callers have one failure path rather than two.
 */
async function invoke<T>(
  context: ExtensionContext,
  action: string,
  params: Record<string, unknown>
): Promise<T> {
  let result;

  try {
    result = await context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, { action, params });
  } catch (error) {
    throw new BackendError('transport_error', `Could not reach the server: ${String(error)}`, 0);
  }

  const body = result.data as Envelope<T> | undefined;

  if (!body || typeof body !== 'object' || !('ok' in body)) {
    throw new BackendError(
      'malformed_response',
      `The server returned an unexpected response (status ${result.statusCode}).`,
      result.statusCode
    );
  }

  if (!body.ok) {
    throw new BackendError(body.error, body.message ?? body.error, result.statusCode);
  }

  return body.result;
}

/**
 * The console's API surface, bound to one extension context.
 *
 * Every method takes the scope explicitly rather than holding it as state — the
 * context switcher can change scope at any time, and an implicit current-scope
 * is the kind of thing that silently saves to the wrong place.
 */
export function createClient(context: ExtensionContext) {
  return {
    getDraft: (scope: Scope) => invoke<DraftWithRows>(context, Actions.GetDraft, { ...scope }),

    saveDraft: (scope: Scope, config: ConfigDocument, revision: number) =>
      invoke<DraftResult>(context, Actions.SaveDraft, { ...scope, config, revision }),

    /** Compiles without storing, so the console can preview before publishing. */
    previewDraft: (scope: Scope) =>
      invoke<{ headers: unknown[]; diagnostics: unknown[] }>(context, Actions.PreviewDraft, {
        ...scope
      }),

    /** The only call that changes what the live site serves. */
    publish: (scope: Scope, actor: string) =>
      invoke<PublishResult>(context, Actions.Publish, { ...scope, actor }),

    getStatus: (scope: Scope) => invoke<StatusResult>(context, Actions.GetStatus, { ...scope }),

    exportConfig: (scope: Scope) => invoke<ConfigDocument>(context, Actions.Export, { ...scope }),

    importConfig: (scope: Scope, config: ConfigDocumentPayload) =>
      invoke<ImportResult>(context, Actions.Import, { ...scope, config }),

    getIntegration: () => invoke<IntegrationResult>(context, Actions.GetIntegration, {})
  };
}

export type SecurityClient = ReturnType<typeof createClient>;
