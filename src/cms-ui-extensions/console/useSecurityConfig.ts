/**
 * Draft state for the console.
 *
 * Holds one scope's draft plus its revision, and mediates every backend call.
 * Two behaviours are deliberate:
 *
 *   - **Edits are local until saved.** `update()` mutates in-memory state and
 *     marks it dirty; nothing reaches storage until `save()`.
 *   - **Saving is not publishing.** `save()` writes the draft; only `publish()`
 *     changes what the live site serves. For a security header product that
 *     separation is the point — a half-finished CSP must not go live.
 */

import { useCallback, useEffect, useState } from 'react';

import type { ExtensionContext } from '@optimizely/cms-extensibility-sdk';

import type { ConfigDocument, HeaderDto } from '../../shared/config.js';
import {
  ErrorCodes,
  type ConfigDocumentPayload,
  type Diagnostic,
  type Scope
} from '../../shared/contracts.js';
import type { HeaderRowModel } from '../../shared/standard-headers.js';
import { BackendError, createClient, type SecurityClient } from '../lib/client.js';

export interface SecurityConfigState {
  readonly config: ConfigDocument | undefined;
  readonly rows: readonly HeaderRowModel[];
  readonly revision: number;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly publishing: boolean;
  readonly importing: boolean;
  readonly dirty: boolean;
  readonly error: string | undefined;
  readonly notice: string | undefined;
  readonly diagnostics: readonly Diagnostic[];
  readonly hasUnpublishedChanges: boolean;
  readonly publishedAt: string | undefined;
  readonly publishedBy: string | undefined;
  /** What the site head is served right now. */
  readonly liveHeaders: readonly HeaderDto[];
  /** What publishing the current draft would produce. */
  readonly pendingHeaders: readonly HeaderDto[];
}

export interface SecurityConfigActions {
  readonly update: (mutate: (current: ConfigDocument) => ConfigDocument) => void;
  readonly save: () => Promise<void>;
  readonly publish: () => Promise<void>;
  /** The stored draft, for backup. Not the in-memory one — see `Tools`. */
  readonly exportDocument: () => Promise<ConfigDocument>;
  readonly importDocument: (payload: ConfigDocumentPayload) => Promise<void>;
  readonly reload: () => Promise<void>;
  readonly dismissNotice: () => void;
  readonly client: SecurityClient;
}

export function useSecurityConfig(
  context: ExtensionContext,
  scope: Scope,
  actor: string
): SecurityConfigState & SecurityConfigActions {
  const [client] = useState(() => createClient(context));

  const [config, setConfig] = useState<ConfigDocument | undefined>(undefined);
  const [rows, setRows] = useState<readonly HeaderRowModel[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | undefined>(undefined);
  const [publishedBy, setPublishedBy] = useState<string | undefined>(undefined);
  const [liveHeaders, setLiveHeaders] = useState<readonly HeaderDto[]>([]);
  const [pendingHeaders, setPendingHeaders] = useState<readonly HeaderDto[]>([]);

  const scopeKey = `${scope.appId ?? ''}|${scope.hostName ?? ''}`;

  /**
   * Re-reads everything derived from the *stored* draft: what publishing would
   * emit, what is live, and the compile diagnostics.
   *
   * Separate from `load()` so it can run after every save, which it must. Both
   * things it refreshes go stale the moment a draft is written: the Preview
   * tab's "Pending" view would keep showing the pre-edit compile — on an
   * unmodified page, indistinguishable from the live headers — and diagnostics
   * would not report a policy that had just grown past the terminal threshold,
   * which is the failure mode with no other way to surface on SaaS.
   */
  const refreshStatus = useCallback(async () => {
    const status = await client.getStatus(scope);

    setDiagnostics(status.diagnostics);
    setHasUnpublishedChanges(status.hasUnpublishedChanges);
    setPublishedAt(status.publishedAt);
    setPublishedBy(status.publishedBy);
    setLiveHeaders(status.liveHeaders);
    setPendingHeaders(status.pendingHeaders);
    // Keyed on scopeKey rather than the scope object: its identity changes on
    // every render, which would re-fetch in a loop.
  }, [client, scopeKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const draft = await client.getDraft(scope);
      setConfig(draft.config);
      setRows(draft.rows);
      setRevision(draft.revision);
      setDirty(false);

      // Status is a second call rather than part of getDraft: it compares the
      // draft against the live copy, and is useful to refresh on its own.
      await refreshStatus();
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setLoading(false);
    }
  }, [client, refreshStatus, scopeKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback((mutate: (current: ConfigDocument) => ConfigDocument) => {
    setConfig((current) => (current ? mutate(current) : current));
    setDirty(true);
    setNotice(undefined);
  }, []);

  const save = useCallback(async () => {
    if (!config) {
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      const saved = await client.saveDraft(scope, config, revision);
      setRevision(saved.revision);
      setDirty(false);
      setNotice('Draft saved. It is not live until you publish.');

      // What publishing would emit has just changed. `hasUnpublishedChanges`
      // comes from the server's revision comparison rather than being assumed
      // true here — the two agree, but only one of them can be wrong.
      await refreshStatus();
    } catch (cause) {
      // A stale revision is not a generic failure — someone else saved while
      // this editor was working, and blindly retrying would clobber them.
      if (cause instanceof BackendError && cause.code === ErrorCodes.StaleRevision) {
        setError(
          'Someone else has saved changes since you loaded this page. ' +
            'Reload to see their version — your unsaved edits will be lost.'
        );
      } else {
        setError(describe(cause));
      }
    } finally {
      setSaving(false);
    }
  }, [client, config, refreshStatus, revision, scope]);

  const publish = useCallback(async () => {
    setPublishing(true);
    setError(undefined);

    try {
      const result = await client.publish(scope, actor);
      setDiagnostics(result.diagnostics);
      setHasUnpublishedChanges(false);
      setPublishedAt(result.publishedAt);
      setPublishedBy(result.publishedBy);
      // Publishing makes pending the new live.
      setLiveHeaders(result.headers);
      setPendingHeaders(result.headers);

      const dropped = result.diagnostics.some((d) => d.code === 'policy-dropped');
      setNotice(
        dropped
          ? 'Published, but the Content Security Policy was too large to emit — see the warning below.'
          : `Published ${result.headers.length} header${result.headers.length === 1 ? '' : 's'}.`
      );
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setPublishing(false);
    }
  }, [actor, client, scope]);

  const exportDocument = useCallback(() => client.exportConfig(scope), [client, scope]);

  /**
   * Replaces the draft with an imported document.
   *
   * Reloads afterwards rather than trusting the echoed document: an import can
   * introduce custom headers the console has never seen, and the materialised
   * standard-header rows are produced by the backend, so they have to be
   * re-fetched or the editor would show a stale set.
   */
  const importDocument = useCallback(
    async (payload: ConfigDocumentPayload) => {
      setImporting(true);
      setError(undefined);

      try {
        await client.importConfig(scope, payload);
        await load();
        setNotice('Configuration imported into the draft. Publish to make it live.');
      } catch (cause) {
        setError(describe(cause));
      } finally {
        setImporting(false);
      }
    },
    [client, load, scope]
  );

  return {
    config,
    rows,
    revision,
    loading,
    saving,
    publishing,
    importing,
    dirty,
    error,
    notice,
    diagnostics,
    hasUnpublishedChanges,
    publishedAt,
    publishedBy,
    liveHeaders,
    pendingHeaders,
    update,
    save,
    publish,
    exportDocument,
    importDocument,
    reload: load,
    dismissNotice: () => setNotice(undefined),
    client
  };
}

function describe(cause: unknown): string {
  return cause instanceof BackendError ? cause.message : String(cause);
}
