/**
 * CSP sources — the domain-based permission model.
 *
 * This is the product's central idea, carried over from PaaS: an editor grants
 * *a domain* permission to do things ("allow scripts from google.com") rather
 * than assembling directives by hand. The engine inverts that into
 * directive-first output at compile time.
 *
 * Mirrors the PaaS `CSP/PermissionList.jsx` and `CSP/PermissionModal.jsx`
 * shape: a compact card per source, with directives edited in a dialog.
 *
 * The dialog is what keeps the card list usable. Nineteen checkboxes with
 * descriptions is more vertical space than a card can open inline without
 * pushing every other source off screen, and it makes card heights wildly
 * uneven — which is also what would stop them sitting side by side.
 */

import { useMemo, useState } from 'react';

import type { ConfigDocument, CspSourceConfig } from '../../shared/config.js';
import { Sources } from '../../shared/constants.js';
import {
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Group,
  Input,
  SearchInput,
  Text
} from '@optiaxiom/react';

import { Notice, Section } from './ui.js';
import { DIRECTIVE_DESCRIPTIONS } from './directives.js';
import './card-grid.css';

/**
 * Suggestions offered in the source field, matching the existing PaaS UI
 * (`CSP/PermissionModal.jsx`) so the two products behave alike.
 *
 * The keyword block is in `ALL_SOURCES` order — the same precedence the engine
 * sorts by — followed by common third-party wildcards, which carry a friendlier
 * label than the value itself.
 *
 * `'nonce-random'` and `'strict-dynamic'` are here, not on the Settings tab:
 * they are sources granted to directives like any other. The `IsNonceEnabled`
 * booleans in PaaS are legacy, read only when migrating old exports.
 */
const KEYWORD_SUGGESTIONS: ReadonlyArray<{ value: string; label?: string }> = [
  { value: Sources.Self },
  { value: Sources.Nonce },
  { value: Sources.StrictDynamic },
  { value: Sources.UnsafeEval },
  { value: Sources.WebAssemblyUnsafeEval },
  { value: Sources.UnsafeHashes },
  { value: Sources.UnsafeInline },
  { value: Sources.InlineSpeculationRules },
  { value: Sources.None },
  { value: Sources.SchemeBlob },
  { value: Sources.SchemeData },
  { value: Sources.SchemeFileSystem },
  { value: Sources.SchemeHttp },
  { value: Sources.SchemeHttps },
  { value: Sources.SchemeWs },
  { value: Sources.SchemeWss },
  { value: Sources.SchemeMediaStream },
  { value: 'https://*.google.com', label: 'https://www.google.com (and subdomains)' },
  {
    value: 'https://*.googletagmanager.com',
    label: 'https://www.googletagmanager.com (and subdomains)'
  },
  {
    value: 'https://*.google-analytics.com',
    label: 'https://www.google-analytics.com (and subdomains)'
  }
];

export function CspSources({
  config,
  onChange
}: {
  config: ConfigDocument;
  onChange: (mutate: (current: ConfigDocument) => ConfigDocument) => void;
}): React.JSX.Element {
  const [draftSource, setDraftSource] = useState('');
  const [filter, setFilter] = useState('');
  /** Which source's directive dialog is open, if any. */
  const [editing, setEditing] = useState<string | undefined>(undefined);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();

    return needle
      ? config.sources.filter((s) => s.source.toLowerCase().includes(needle))
      : config.sources;
  }, [config.sources, filter]);

  const addSource = (): void => {
    const source = draftSource.trim();
    if (source.length === 0) {
      return;
    }

    const exists = config.sources.some((s) => s.source.toLowerCase() === source.toLowerCase());
    if (exists) {
      setFilter(source);
      setDraftSource('');
      return;
    }

    const id = `src-${Date.now().toString(36)}`;
    onChange((current) => ({
      ...current,
      // New sources go first — otherwise adding one to a long list appears to
      // do nothing until you scroll.
      sources: [{ id, source, directives: [] }, ...current.sources]
    }));
    setDraftSource('');
    // Open straight into the directive picker: a source with no directives is
    // not emitted, so adding one is only half the job.
    setEditing(id);
  };

  const updateSource = (id: string, patch: Partial<CspSourceConfig>): void =>
    onChange((current) => ({
      ...current,
      sources: current.sources.map((s) => (s.id === id ? { ...s, ...patch } : s))
    }));

  const removeSource = (id: string): void =>
    onChange((current) => ({ ...current, sources: current.sources.filter((s) => s.id !== id) }));

  return (
    <Group flexDirection="column" gap="20">
      <Section
        title="Add a source"
        description="A domain, a scheme such as data:, or a keyword such as 'self'."
      >
        <Group gap="8" alignItems="end" flexWrap="wrap">
          {/* At least half the row, never wider than 400px. */}
          <Box flex="1" style={{ minWidth: '50%', maxWidth: '400px' }}>
            <Field label="Source">
              <Input
                value={draftSource}
                placeholder="https://cdn.example.com"
                onChange={(event) => setDraftSource(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addSource();
                  }
                }}
                list="csp-keyword-suggestions"
              />
            </Field>
          </Box>
          <datalist id="csp-keyword-suggestions">
            {KEYWORD_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion.value} value={suggestion.value}>
                {suggestion.label}
              </option>
            ))}
          </datalist>

          <Button appearance="primary" onClick={addSource} disabled={draftSource.trim().length === 0}>
            Add
          </Button>
        </Group>
      </Section>

      {config.sources.some((source) => source.source === Sources.Nonce) && (
        <Notice intent="warning" title="Your front end must apply the nonce.">
          The published policy carries a placeholder that your front end must replace with a
          fresh, unguessable value on every request, and it must put the same value in a{' '}
          <code>nonce=</code> attribute on the script and style tags you want to allow.
        </Notice>
      )}

      <Section title={`Sources (${config.sources.length})`}>
        {config.sources.length > 3 && (
          <Box maxW="sm">
            <Field label="Filter">
              <SearchInput
                value={filter}
                onValueChange={setFilter}
                placeholder="Domain or keyword"
              />
            </Field>
          </Box>
        )}

        {config.sources.length === 0 && (
          <Text color="fg.tertiary">
            No sources yet. Until at least one source, the sandbox, or
            upgrade-insecure-requests is configured, no policy is emitted.
          </Text>
        )}

        {/* A CSS grid rather than Axiom's Grid: the two-column rule is a 1440px
            breakpoint, and Axiom's responsive props only offer 600px and 900px.
            See card-grid.css. */}
        <Box className="stott-card-grid">
          {visible.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              editing={editing === source.id}
              onEdit={() => setEditing(source.id)}
              onCloseEdit={() => setEditing(undefined)}
              onChange={(patch) => updateSource(source.id, patch)}
              onRemove={() => removeSource(source.id)}
            />
          ))}
        </Box>

        {visible.length === 0 && config.sources.length > 0 && (
          <Text color="fg.tertiary">No sources match “{filter}”.</Text>
        )}
      </Section>
    </Group>
  );
}

function SourceCard({
  source,
  editing,
  onEdit,
  onCloseEdit,
  onChange,
  onRemove
}: {
  source: CspSourceConfig;
  editing: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  onChange: (patch: Partial<CspSourceConfig>) => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <Card p="16">
      <Group gap="12" alignItems="center" flexWrap="wrap">
        <Code flex="1" fontWeight="600" style={{ wordBreak: 'break-all' }}>
          {source.source}
        </Code>

        <Text color="fg.tertiary">
          {source.directives.length === 0
            ? 'No directives — not emitted'
            : `${source.directives.length} directive${source.directives.length === 1 ? '' : 's'}`}
        </Text>

        <Button onClick={onEdit}>Edit</Button>
        <Button
          appearance="danger-outline"
          onClick={onRemove}
          aria-label={`Remove ${source.source}`}
        >
          Remove
        </Button>
      </Group>

      {source.directives.length > 0 && (
        <Text color="fg.tertiary" mt="8" style={{ wordBreak: 'break-all' }}>
          {source.directives.join(', ')}
        </Text>
      )}

      <DirectiveDialog
        source={source}
        open={editing}
        onOpenChange={(next) => (next ? onEdit() : onCloseEdit())}
        onChange={onChange}
      />
    </Card>
  );
}

/**
 * The directive picker.
 *
 * Edits are held locally and only reach the draft when **Save directives** is
 * pressed. Cancelling — including Escape or clicking away, which a modal is
 * expected to treat as cancelling — discards them.
 *
 * The form is mounted only while open, so its initial state comes straight from
 * `source.directives` on each open with no effect needed to resynchronise it.
 * That is the whole reason for the split: a long-lived component holding a copy
 * of a prop is exactly the shape that goes stale.
 */
function DirectiveDialog({
  source,
  open,
  onOpenChange,
  onChange
}: {
  source: CspSourceConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<CspSourceConfig>) => void;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && (
          <DirectiveForm
            source={source}
            onCancel={() => onOpenChange(false)}
            onApply={(directives) => {
              onChange({ directives });
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DirectiveForm({
  source,
  onCancel,
  onApply
}: {
  source: CspSourceConfig;
  onCancel: () => void;
  onApply: (directives: readonly string[]) => void;
}): React.JSX.Element {
  const [selected, setSelected] = useState<readonly string[]>(source.directives);

  const toggleDirective = (directive: string, granted: boolean): void =>
    setSelected((current) =>
      granted ? [...current, directive] : current.filter((d) => d !== directive)
    );

  const isNone = source.source === Sources.None;
  const isNonce = source.source === Sources.Nonce;
  const isStrictDynamic = source.source === Sources.StrictDynamic;

  return (
    <>
      <DialogHeader description="Choose what this source is permitted to do.">
        {source.source}
      </DialogHeader>

      <DialogBody>
        <Group flexDirection="column" gap="12">
          {/* Mirrors the engine: 'none' wins outright for any directive it is
              granted, discarding every other source for that directive. */}
          {isNone && (
            <Notice intent="warning" title="'none' overrides everything.">
              Any directive granted here will permit nothing at all, regardless of other
              sources.
            </Notice>
          )}

          {isNonce && (
            <Text color="fg.tertiary">
              Grant this to <code>script-src</code> or <code>style-src</code> to allow inline
              code carrying a matching nonce. The stored value is a placeholder — a real,
              unguessable nonce is substituted on every request.
            </Text>
          )}

          {isStrictDynamic && (
            <Text color="fg.tertiary">
              Lets a trusted script load further scripts, so host allow-lists can be dropped.
              Only meaningful alongside a nonce, and modern browsers ignore host sources on
              any directive that carries it.
            </Text>
          )}

          <Box asChild>
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <Text asChild fontWeight="600" mb="8">
                <legend>Directives</legend>
              </Text>
              {/* A vertical list rather than a dense grid: the descriptions are
                  what make the domain-based model approachable, and they need
                  the room. The dialog is what affords that room. */}
              <Group flexDirection="column" gap="8">
                {DIRECTIVE_DESCRIPTIONS.map(({ directive, description }) => (
                  <Checkbox
                    key={directive}
                    checked={selected.includes(directive)}
                    description={description}
                    onCheckedChange={(checked) => toggleDirective(directive, checked)}
                  >
                    {directive}
                  </Checkbox>
                ))}
              </Group>
            </fieldset>
          </Box>
        </Group>
      </DialogBody>

      <DialogFooter>
        <Button onClick={onCancel}>Cancel</Button>
        <Button appearance="primary" onClick={() => onApply(selected)}>
          Save directives
        </Button>
      </DialogFooter>
    </>
  );
}
