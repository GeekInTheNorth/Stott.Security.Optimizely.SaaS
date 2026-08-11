/**
 * Compiled header preview, and what a site head needs to consume it.
 *
 * Two things an editor cannot otherwise see:
 *
 *   1. **Live versus pending.** Saving a draft does not change what the site
 *      serves; only publishing does. Showing both side by side makes the
 *      difference concrete rather than something to infer from a badge.
 *   2. **The endpoint URL.** It embeds a per-installation UUID, so it cannot be
 *      derived. Without it here, integrating means running
 *      `ocp directory listFunctions` from a terminal.
 */

import { useEffect, useState } from 'react';

import { Badge, Box, Card, Code, Group, Heading, Text } from '@optiaxiom/react';

import type { HeaderDto } from '../../shared/config.js';
import type { SecurityClient } from '../lib/client.js';
import { Notice, Preview, Section, SubNav } from './ui.js';

type View = 'pending' | 'live' | 'integration';

const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'live', label: 'Live' },
  { id: 'integration', label: 'Integration' }
];

export function HeaderPreview({
  client,
  liveHeaders,
  pendingHeaders,
  hasUnpublishedChanges,
  dirty
}: {
  client: SecurityClient;
  liveHeaders: readonly HeaderDto[];
  pendingHeaders: readonly HeaderDto[];
  hasUnpublishedChanges: boolean;
  /** Unsaved edits exist, so the pending compile is behind what is on screen. */
  dirty: boolean;
}): React.JSX.Element {
  const [view, setView] = useState<View>('pending');

  return (
    <Group flexDirection="column" gap="16">
      <SubNav tabs={VIEWS} current={view} onSelect={setView} />

      {view === 'pending' && (
        <Section
          title="Pending"
          description="What publishing would produce from the saved draft."
        >
          {/* Compiled server-side from the *stored* draft, which is also what
              Publish acts on — so unsaved edits genuinely are not included, and
              saying so is more honest than quietly showing something staler
              than the screen. Publish is disabled while dirty for the same
              reason. */}
          {dirty && (
            <Notice intent="information">
              You have unsaved edits. This shows the saved draft — save to see
              them here.
            </Notice>
          )}

          {hasUnpublishedChanges && (
            <Notice intent="warning">
              These headers are not live yet. Publish to apply them.
            </Notice>
          )}
          <HeaderList headers={pendingHeaders} emptyMessage="Nothing would be emitted." />
        </Section>
      )}

      {view === 'live' && (
        <Section title="Live" description="What the site head is being served right now.">
          <HeaderList
            headers={liveHeaders}
            emptyMessage="Nothing has been published yet, so no headers are being served."
          />
        </Section>
      )}

      {view === 'integration' && <Integration client={client} />}
    </Group>
  );
}

/**
 * Each header with the action the head must take.
 *
 * The three actions are not interchangeable — CSP in particular must be
 * appended, because a split policy spans several headers and replacing would
 * keep only the last.
 */
function HeaderList({
  headers,
  emptyMessage
}: {
  headers: readonly HeaderDto[];
  emptyMessage: string;
}): React.JSX.Element {
  if (headers.length === 0) {
    return <Text color="fg.tertiary">{emptyMessage}</Text>;
  }

  return (
    <Group flexDirection="column" gap="8">
      {headers.map((header, index) => (
        <Card key={`${header.key}-${index}`} p="12">
          <Group flexDirection="column" gap="8">
            <Group gap="8" alignItems="center" flexWrap="wrap">
              <Code fontWeight="600">{header.key}</Code>
              <ActionBadge header={header} />
            </Group>

            {!header.isRemoval && (
              <>
                {/* Preview holds the header value and nothing else. Its whole
                    point is showing exactly what the response will carry, so
                    commentary inside it reads as part of the policy. Notes
                    follow the box; the parent Group's gap spaces them. */}
                <Preview>{header.value}</Preview>

                {header.value.includes("'nonce-") && (
                  <Text color="fg.tertiary">
                    The nonce shown is a placeholder, your front end should substitute a fresh value on every request.
                  </Text>
                )}
              </>
            )}
          </Group>
        </Card>
      ))}
    </Group>
  );
}

function ActionBadge({ header }: { header: HeaderDto }): React.JSX.Element {
  if (header.isRemoval) {
    return <Badge intent="danger">Removed from responses</Badge>;
  }

  return header.isReplacement ? (
    <Badge intent="information">Set</Badge>
  ) : (
    <Badge intent="neutral">Appended</Badge>
  );
}

function Integration({ client }: { client: SecurityClient }): React.JSX.Element {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      try {
        const result = await client.getIntegration();
        if (!cancelled) {
          setUrl(result.compiledHeadersUrl);
          setState(result.compiledHeadersUrl ? 'ready' : 'unavailable');
        }
      } catch {
        if (!cancelled) {
          setState('unavailable');
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <Section
      title="Integration"
      description="Point your site's front end at this endpoint to apply the published headers."
    >
      {state === 'loading' && <Text>Resolving endpoint…</Text>}

      {state === 'unavailable' && (
        <Notice intent="warning">
          The endpoint could not be resolved. Run{' '}
          <Code>ocp directory listFunctions stott_security &lt;trackerId&gt;</Code> to find it.
        </Notice>
      )}

      {state === 'ready' && url && (
        <Group flexDirection="column" gap="12">
          <Box>
            <Heading level="4">Endpoint</Heading>
            <Preview>{url}</Preview>
          </Box>

          <Notice intent="information">
            This URL is specific to this installation. Uninstalling and reinstalling the app
            issues a new one, which would break any front end still pointing at the old address.
          </Notice>

          <Box>
            <Heading level="4">Applying the headers</Heading>
            <Text color="fg.tertiary" mb="8">
              Each header carries the action to take. <Code>isRemoval</Code> means delete it,{' '}
              <Code>isReplacement</Code> means set it, and neither means append — Content
              Security Policy must be appended, because a large policy is split across several
              headers and setting would keep only the last.
            </Text>
            <Preview>
              {`const res = await fetch(ENDPOINT);
const { headers } = await res.json();

for (const h of headers) {
  if (h.isRemoval) response.headers.delete(h.key);
  else if (h.isReplacement) response.headers.set(h.key, h.value);
  else response.headers.append(h.key, h.value);
}`}
            </Preview>
          </Box>
        </Group>
      )}
    </Section>
  );
}
