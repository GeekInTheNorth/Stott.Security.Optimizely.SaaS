/**
 * Export and import of the whole configuration.
 *
 * This is not a convenience feature. On PaaS the configuration lives in the
 * customer's own SQL database, which is backed up, restorable, and outlives the
 * addon. Here it lives in OCP key-value storage owned by the installation —
 * **uninstalling the app takes the configuration with it**, and there is no
 * restore path a customer can reach. A downloadable document is the only backup
 * they can hold, so it is a requirement rather than a nicety.
 *
 * It is also how a configuration moves between environments: build a policy on
 * an integration instance, export it, import it into production.
 *
 * Two deliberate choices:
 *
 *   - **Export reads the stored draft, not what is on screen.** A backup should
 *     be a copy of the system of record. Unsaved edits are called out rather
 *     than silently folded in.
 *   - **Import replaces the draft, never the live headers.** Restoring a backup
 *     must not change what a site serves without someone seeing it first, so an
 *     import still has to be published.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  Box,
  Button,
  Group,
  Text,
  Textarea
} from '@optiaxiom/react';

import type { ConfigDocument } from '../../shared/config.js';
import type { ConfigDocumentPayload } from '../../shared/contracts.js';
import { Notice, Section, SubNav } from './ui.js';

type ToolsTab = 'export' | 'import';

const TABS: ReadonlyArray<{ id: ToolsTab; label: string }> = [
  { id: 'export', label: 'Export' },
  { id: 'import', label: 'Import' }
];

export function Tools({
  dirty,
  exportDocument,
  importDocument,
  importing
}: {
  dirty: boolean;
  exportDocument: () => Promise<ConfigDocument>;
  importDocument: (payload: ConfigDocumentPayload) => Promise<void>;
  importing: boolean;
}): React.JSX.Element {
  const [tab, setTab] = useState<ToolsTab>('export');

  return (
    <Group flexDirection="column" gap="16">
      <SubNav tabs={TABS} current={tab} onSelect={setTab} />

      {tab === 'export' && <Export dirty={dirty} exportDocument={exportDocument} />}
      {tab === 'import' && <Import importDocument={importDocument} importing={importing} />}
    </Group>
  );
}

function Export({
  dirty,
  exportDocument
}: {
  dirty: boolean;
  exportDocument: () => Promise<ConfigDocument>;
}): React.JSX.Element {
  const [json, setJson] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      try {
        const document = await exportDocument();

        if (!cancelled) {
          // Indented: a backup is something a person may need to read, diff, or
          // hand-edit before importing it somewhere else.
          setJson(JSON.stringify(document, null, 2));
        }
      } catch (cause) {
        if (!cancelled) {
          setError(String(cause));
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [exportDocument]);

  return (
    <Section
      title="Export"
      description={
        'A complete copy of the stored configuration — settings, sources, sandbox, response ' +
        'headers and permissions policy.'
      }
    >
      <Notice intent="warning">
        Keep a copy somewhere outside Optimizely. This configuration is held by the app
        installation, so uninstalling the app deletes it and there is no way to recover it
        afterwards.
      </Notice>

      {dirty && (
        <Notice intent="information">
          You have unsaved edits. This export is of the saved draft and does not include them —
          save first if you want them in the file.
        </Notice>
      )}

      {error && <Notice intent="danger">The configuration could not be exported. {error}</Notice>}

      {!json && !error && <Text>Preparing export…</Text>}

      {json && (
        <Group flexDirection="column" gap="12">
          <CopyButton json={json} />

          {/* Always shown, not just as a preview. Selecting the text by hand is
              the one route that cannot be taken away, and with downloads
              unavailable it is the only fallback if the clipboard is ever
              refused too.

              A scrolling block rather than Axiom's Textarea, whose `maxRows`
              caps at 5 — too small to review a configuration in. */}
          <Box
            asChild
            bg="bg.secondary"
            border="1"
            fontFamily="mono"
            p="8"
            rounded="sm"
            style={{ maxHeight: '24rem', overflow: 'auto' }}
          >
            <pre aria-label="Exported configuration">{json}</pre>
          </Box>
        </Group>
      )}
    </Section>
  );
}

function Import({
  importDocument,
  importing
}: {
  importDocument: (payload: ConfigDocumentPayload) => Promise<void>;
  importing: boolean;
}): React.JSX.Element {
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = useCallback(async (file: File | undefined): Promise<void> => {
    if (file) {
      setText(await file.text());
      setParseError(undefined);
    }
  }, []);

  /**
   * Parses locally before sending. The backend validates too — and is the only
   * validation that counts, since it guards storage — but malformed JSON is
   * worth catching here so the customer gets the parser's position rather than
   * a generic server error.
   */
  const review = useCallback((): void => {
    try {
      JSON.parse(text);
      setParseError(undefined);
      setConfirming(true);
    } catch (cause) {
      setParseError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [text]);

  const confirm = useCallback(async (): Promise<void> => {
    setConfirming(false);
    await importDocument(JSON.parse(text) as ConfigDocumentPayload);
    setText('');
  }, [importDocument, text]);

  return (
    <Section
      title="Import"
      description="Restore a previously exported configuration, or copy one in from another environment."
    >
      <Notice intent="warning">
        Importing replaces the entire draft — every setting, source, response header and
        permissions policy directive. It does not change what the site serves until you publish.
      </Notice>

      <Group gap="8" flexWrap="wrap">
        <Button onClick={() => fileInput.current?.click()}>Choose a file…</Button>

        {/* Hidden rather than styled: a native file input cannot be restyled to
            match Axiom, and the button above gives the same affordance. */}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            // Reset so choosing the same file twice still fires a change event.
            event.target.value = '';
          }}
        />
      </Group>

      <Box>
        <Text mb="4">Or paste the configuration JSON:</Text>
        <Textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setParseError(undefined);
          }}
          maxRows={5}
          placeholder='{ "version": 1, … }'
          aria-label="Configuration to import"
        />
      </Box>

      {parseError && <Notice intent="danger">That is not valid JSON — {parseError}</Notice>}

      <Group gap="16">
        <Button
          appearance="primary"
          onClick={review}
          disabled={text.trim().length === 0 || importing}
        >
          {importing ? 'Importing…' : 'Replace draft'}
        </Button>
      </Group>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>Replace the current draft?</AlertDialogHeader>
          <AlertDialogBody>
            The draft will be overwritten by the imported configuration and the current one cannot
            be recovered. The live headers are unaffected until you publish.
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction appearance="danger" onClick={() => void confirm()}>
              Replace draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

/**
 * Copies the export to the clipboard.
 *
 * This is the *only* way to get the configuration out of the CMS, so it reports
 * what happened rather than failing quietly.
 *
 * A file download is not an option: the extension runs in a sandboxed
 * cross-origin iframe, where an anchor carrying `download` does nothing at all —
 * no file, no error, nothing to catch — which is worse than not offering it. The
 * SDK's guidance is to assume a restrictive sandbox, and the same goes for
 * anything else needing top-level navigation or a popup.
 */
function CopyButton({ json }: { json: string }): React.JSX.Element {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(json);
      setState('copied');
    } catch {
      setState('failed');
    }

    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 4000);
  };

  return (
    <Group flexDirection="column" gap="8">
      <Group gap="8" alignItems="center" flexWrap="wrap">
        <Button appearance="primary" onClick={() => void onClick()}>
          Copy to clipboard
        </Button>
        {state === 'copied' && <Text color="fg.success">Copied. Paste it into a file to keep it.</Text>}
      </Group>

      {state === 'failed' && (
        <Notice intent="danger">
          The clipboard was refused. Select the configuration below and copy it manually.
        </Notice>
      )}
    </Group>
  );
}
