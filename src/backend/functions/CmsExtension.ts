/**
 * Backend for the security console.
 *
 * Invoked only via `context.extension.invokeFunction('cms_extension', …)` from the
 * `view` extension — it has no public URL, because `accepts: cms_ui_extension`
 * functions are not publicly addressable. One function switching on `action` is
 * the documented convention, rather than a function per operation.
 */

import * as App from '@zaiusinc/app-sdk';
import { functions, logger } from '@zaiusinc/app-sdk';

import {
  Actions,
  ErrorCodes,
  describeScope,
  type Action,
  type DraftResult,
  type Envelope,
  type ImportResult,
  type IntegrationResult,
  type PublishResult,
  type Scope,
  type StatusResult
} from '../../shared/contracts.js';
import { compileWithDiagnostics } from '../core/index.js';
import { listHeaderRows } from '../core/headers.js';
import {
  CorruptDocumentError,
  DocumentTooLargeError,
  InvalidPayloadError,
  StaleRevisionError
} from '../lib/errors.js';
import {
  readCompiled,
  readDraft,
  writeCompiled,
  writeDraft
} from '../lib/storage.js';
import { validateConfig } from '../lib/validation.js';
import { normaliseConfig, type ConfigDocument } from '../../shared/config.js';
import { remapLegacyPermissionPolicy } from '../../shared/permission-policy.js';

interface RequestBody {
  action?: unknown;
  params?: unknown;
}

interface ScopedParams extends Scope {
  config?: ConfigDocument;
  revision?: number;
  actor?: string;
}

export class CmsExtension extends App.Function {
  public async perform(): Promise<App.Response> {
    const body = (this.request.bodyJSON ?? {}) as RequestBody;
    const action = typeof body.action === 'string' ? (body.action as Action) : '';
    const params = (body.params ?? {}) as ScopedParams;
    const scope: Scope = {
      ...(params.appId ? { appId: params.appId } : {}),
      ...(params.hostName ? { hostName: params.hostName } : {})
    };

    try {
      switch (action) {
      case Actions.GetDraft:
        return ok(await this.getDraft(scope));

      case Actions.SaveDraft:
        return ok(await this.saveDraft(scope, params));

      case Actions.PreviewDraft: {
        const { config } = await readDraft(scope);
        return ok(compileWithDiagnostics(config));
      }

      case Actions.Publish:
        return ok(await this.publish(scope, params));

      case Actions.GetStatus:
        return ok(await this.getStatus(scope));

      case Actions.Export: {
        const { config } = await readDraft(scope);
        return ok(config);
      }

      case Actions.Import:
        return ok(await this.importConfig(scope, params));

      case Actions.GetIntegration:
        return ok(await this.getIntegration());

      default:
        return fail(400, ErrorCodes.UnknownAction, `Unknown action '${String(action)}'.`);
      }
    } catch (error) {
      return this.toErrorResponse(error, action, scope);
    }
  }

  private async getDraft(scope: Scope): Promise<DraftResult & { rows: unknown }> {
    const { config, revision } = await readDraft(scope);

    // Materialise the standard-header rows here rather than in the browser, so
    // the console never has to know which headers are "standard".
    return { config, revision, rows: listHeaderRows(config.headers) };
  }

  private async saveDraft(scope: Scope, params: ScopedParams): Promise<DraftResult> {
    if (!params.config) {
      throw new InvalidPayloadError('A `config` document is required.');
    }

    const errors = validateConfig(params.config);
    if (errors.length > 0) {
      throw new InvalidPayloadError(errors.join(' '));
    }

    const revision = await writeDraft(scope, params.config, params.revision);

    return { config: params.config, revision };
  }

  /**
   * Compiles the draft and makes it live.
   *
   * This is the only operation that changes what the head serves — saving a draft
   * never does. Deliberate: an incorrect CSP breaks a site, so going live is an
   * explicit act.
   */
  private async publish(scope: Scope, params: ScopedParams): Promise<PublishResult> {
    const actor = params.actor?.trim();
    if (!actor) {
      throw new InvalidPayloadError('An `actor` is required to record who published.');
    }

    const { config, revision } = await readDraft(scope);
    const { headers, diagnostics } = compileWithDiagnostics(config);

    const publishedAt = new Date().toISOString();
    await writeCompiled(scope, headers, actor, publishedAt, revision);

    logger.info(
      `Published ${headers.length} header(s) for scope ${describeScope(scope)} by ${actor}.`
    );

    return { headers, publishedAt, publishedBy: actor, diagnostics };
  }

  private async getStatus(scope: Scope): Promise<StatusResult> {
    const { config, revision } = await readDraft(scope);
    const { headers: pendingHeaders, diagnostics } = compileWithDiagnostics(config);
    const live = await readCompiled(scope);

    return {
      // Compare revisions rather than diffing headers: a draft edit that happens
      // to compile identically is still an unpublished change, and the editor
      // should be able to see that it has not gone live.
      hasUnpublishedChanges: live === undefined || live.sourceRevision !== revision,
      ...(live?.publishedAt ? { publishedAt: live.publishedAt } : {}),
      ...(live?.publishedBy ? { publishedBy: live.publishedBy } : {}),
      liveHeaders: live?.headers ?? [],
      pendingHeaders,
      diagnostics
    };
  }

  /**
   * Replaces the draft from a previously exported document.
   *
   * Two things happen before validation, and both are what make a PaaS export
   * importable: `normaliseConfig` fills in sections the document predates, and
   * `remapLegacyPermissionPolicy` brings directive names up to date. Without the
   * latter a PaaS document fails validation on three unrecognised directives, and
   * import is the only migration path between the two products.
   */
  private async importConfig(scope: Scope, params: ScopedParams): Promise<ImportResult> {
    if (!params.config) {
      throw new InvalidPayloadError('A `config` document is required.');
    }

    const normalised = normaliseConfig(params.config);

    // Only remap what is shaped like a directive list. A malformed section is
    // passed through for `validateConfig` to reject with a message naming it,
    // rather than throwing here on an unhelpful TypeError.
    const existing = normalised.permissionPolicy?.directives;
    const { directives, dropped } = Array.isArray(existing)
      ? remapLegacyPermissionPolicy(existing)
      : { directives: existing, dropped: [] as string[] };

    const config: ConfigDocument = {
      ...normalised,
      permissionPolicy: { ...normalised.permissionPolicy, directives }
    };

    const errors = validateConfig(config);
    if (errors.length > 0) {
      throw new InvalidPayloadError(`The imported configuration is not valid. ${errors.join(' ')}`);
    }

    if (dropped.length > 0) {
      logger.info(
        `Import for scope ${describeScope(scope)} dropped unsupported Permissions Policy ` +
          `directives: ${dropped.join(', ')}.`
      );
    }

    // No expectedRevision: an import deliberately overwrites whatever is there.
    const revision = await writeDraft(scope, config);

    return { config, revision, droppedDirectives: dropped };
  }

  /**
   * Resolves this installation's public function URL.
   *
   * `getEndpoints()` defaults to the current installation when called from a
   * non-global function. Failure is not fatal — the console shows integration
   * details as unavailable rather than failing the whole page.
   */
  private async getIntegration(): Promise<IntegrationResult> {
    try {
      const endpoints = await functions.getEndpoints();
      const url = endpoints['compiled_headers'];

      return url ? { compiledHeadersUrl: url } : {};
    } catch (error) {
      logger.warn(`Could not resolve function endpoints: ${String(error)}`);

      return {};
    }
  }

  private toErrorResponse(error: unknown, action: string, scope: Scope): App.Response {
    if (error instanceof StaleRevisionError) {
      return fail(409, ErrorCodes.StaleRevision, error.message);
    }

    if (error instanceof DocumentTooLargeError) {
      return fail(413, ErrorCodes.ConfigTooLarge, error.message);
    }

    if (error instanceof InvalidPayloadError) {
      return fail(400, ErrorCodes.InvalidPayload, error.message);
    }

    if (error instanceof CorruptDocumentError) {
      logger.error(`Corrupt document for scope ${describeScope(scope)}: ${error.message}`);
      return fail(500, ErrorCodes.StorageFailure, error.message);
    }

    logger.error(
      `Unhandled error in '${action}' for scope ${describeScope(scope)}: ${String(error)}`
    );

    return fail(500, ErrorCodes.StorageFailure, 'An unexpected error occurred.');
  }
}

/** Status is the FIRST argument to App.Response — the opposite of web `Response`. */
function ok<T>(result: T): App.Response {
  return new App.Response(200, { ok: true, result } satisfies Envelope<T>);
}

function fail(status: number, error: string, message: string): App.Response {
  return new App.Response(status, { ok: false, error, message } satisfies Envelope<never>);
}
