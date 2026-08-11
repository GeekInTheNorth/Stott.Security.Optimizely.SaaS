/**
 * Installation lifecycle.
 *
 * The one hook here that carries real weight is {@link Lifecycle.onFinalizeUpgrade}:
 * this app precompiles headers at publish time, so an upgrade that changes the
 * engine leaves every `compiled:v1:*` document stale. Without regeneration an
 * upgrade would silently keep serving output produced by the previous version —
 * a failure with no error and no log line anywhere.
 */

import {
  Lifecycle as AppLifecycle,
  AuthorizationGrantResult,
  LifecycleResult,
  LifecycleSettingsResult,
  logger,
  Request,
  storage,
  SubmittedFormData
} from '@zaiusinc/app-sdk';

import { compileHeaders } from '../core/index.js';
import { listPublishedScopes, readCompiled, readDraft, writeCompiled } from '../lib/storage.js';
import { describeScope } from '../../shared/contracts.js';

export class Lifecycle extends AppLifecycle {
  public async onInstall(): Promise<LifecycleResult> {
    // Nothing to provision. Configuration starts empty and every standard header
    // defaults to Disabled, so installing the app changes no response until
    // someone publishes — deliberate, since silently adding headers could break
    // a live site.
    logger.info('Stott Security installed.');

    return { success: true };
  }

  public async onSettingsForm(
    section: string,
    _action: string,
    formData: SubmittedFormData
  ): Promise<LifecycleSettingsResult> {
    const result = new LifecycleSettingsResult();

    try {
      await storage.settings.put(section, formData);

      return result;
    } catch (error) {
      logger.error(`Failed to save settings section '${section}': ${String(error)}`);

      return result.addToast(
        'danger',
        'Sorry, an unexpected error occurred. Please try again in a moment.'
      );
    }
  }

  public async onAuthorizationRequest(
    _section: string,
    _formData: SubmittedFormData
  ): Promise<LifecycleSettingsResult> {
    // No OAuth: this app holds no third-party credentials and integrates with
    // nothing that could grant one.
    return new LifecycleSettingsResult().addToast('danger', 'OAuth is not used by this app.');
  }

  public async onAuthorizationGrant(_request: Request): Promise<AuthorizationGrantResult> {
    return new AuthorizationGrantResult('').addToast('danger', 'OAuth is not used by this app.');
  }

  public async onUpgrade(_fromVersion: string): Promise<LifecycleResult> {
    return { success: true };
  }

  /**
   * Regenerates every published scope from its draft.
   *
   * Runs after the new version's functions exist, so the engine compiled into
   * this version is the one that produces the output. Idempotent: it recompiles
   * from the stored draft rather than mutating what is already there.
   *
   * A scope that fails is logged and skipped rather than failing the whole
   * upgrade — one unparseable document should not strand every other site on
   * stale headers.
   */
  public async onFinalizeUpgrade(fromVersion: string): Promise<LifecycleResult> {
    try {
      const scopes = await listPublishedScopes();
      logger.info(
        `Upgrade from ${fromVersion}: regenerating compiled headers for ${scopes.length} scope(s).`
      );

      let regenerated = 0;
      let failed = 0;

      for (const scope of scopes) {
        try {
          const { config, revision } = await readDraft(scope);
          const previous = await readCompiled(scope);

          await writeCompiled(
            scope,
            compileHeaders(config),
            // Preserve the original attribution — regeneration is not a publish
            // by whoever triggered the upgrade.
            previous?.publishedBy ?? 'system',
            previous?.publishedAt ?? new Date().toISOString(),
            revision
          );

          regenerated++;
        } catch (error) {
          failed++;
          logger.error(
            `Failed to regenerate scope ${describeScope(scope)} during upgrade: ${String(error)}`
          );
        }
      }

      logger.info(`Upgrade regeneration complete: ${regenerated} succeeded, ${failed} failed.`);

      return { success: true };
    } catch (error) {
      logger.error(`Upgrade regeneration could not run: ${String(error)}`);

      // Not retryable: the app is upgraded and functional, and every scope can be
      // brought current by republishing from the console.
      return { success: true };
    }
  }

  public async onAfterUpgrade(): Promise<LifecycleResult> {
    return { success: true };
  }

  public async onUninstall(): Promise<LifecycleResult> {
    // Per-installation KV is removed by the platform. Nothing external was
    // registered, so there is nothing to deregister.
    logger.info('Stott Security uninstalled.');

    return { success: true };
  }
}
