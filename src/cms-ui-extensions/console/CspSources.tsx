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
 *
 * Adding a source uses the same dialog shape, from a button beside the filter,
 * and collects the directives at the same time. A source with none is rejected by
 * `validateConfig`, so adding one on its own would leave a draft that cannot be
 * saved.
 */

import { useMemo, useState } from 'react';

import type { ConfigDocument, CspSourceConfig } from '../../shared/config.js';
import { Sources } from '../../shared/constants.js';
import { CSP_SOURCE_RULE, isValidCspSource } from '../../shared/csp-source-rules.js';
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

import { Notice } from './ui.js';
import { DIRECTIVE_DESCRIPTIONS } from './directives.js';
import './card-grid.css';

/**
 * Suggestions offered in the source field, matching the existing PaaS UI
 * (`CSP/PermissionModal.jsx`) so the two products behave alike.
 *
 * The keyword block is in display order, leading with `'self'` as the one an
 * editor reaches for most. That is deliberately *not* `ALL_SOURCES` order, which
 * is the precedence the engine sorts by and has no bearing on what reads well in
 * a list. Common third-party wildcards follow, carrying a friendlier label than
 * the value itself.
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

/**
 * The last sentence is not padding. `toLowerSource` in the engine lower-cases the
 * whole value, path included, faithfully mirroring PaaS — so a source given as
 * `/Scripts/App.js` is emitted as `/scripts/app.js` and matches nothing. The
 * console is the only place that can warn about it.
 */
const ADD_SOURCE_DESCRIPTION =
  'A domain such as https://cdn.example.com — optionally with a leading *. wildcard, a port ' +
  "or a path — a scheme such as data:, or a keyword such as 'self'. A path is lower-cased " +
  'when the policy is compiled, so give it in lower case.';

export function CspSources({
  config,
  onChange
}: {
  config: ConfigDocument;
  onChange: (mutate: (current: ConfigDocument) => ConfigDocument) => void;
}): React.JSX.Element {
  const [filter, setFilter] = useState('');
  /** Which source's directive dialog is open, if any. */
  const [editing, setEditing] = useState<string | undefined>(undefined);

  /**
   * Sources matching the filter, by domain **or** by directive.
   *
   * Directives matter as much as domains here: the model is domain-first, so the
   * answer to "what is allowed to run scripts?" is scattered across every card,
   * and typing `script-src` is the only way to gather it.
   */
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();

    if (needle.length === 0) {
      return config.sources;
    }

    return config.sources.filter(
      (source) =>
        source.source.toLowerCase().includes(needle) ||
        source.directives.some((directive) => directive.toLowerCase().includes(needle))
    );
  }, [config.sources, filter]);

  const takenSources = useMemo(
    () => new Set(config.sources.map((source) => source.source.trim().toLowerCase())),
    [config.sources]
  );

  const addSource = (source: string, directives: readonly string[]): void => {
    onChange((current) => ({
      ...current,
      // New sources go first — otherwise adding one to a long list appears to
      // do nothing until you scroll.
      sources: [{ id: `src-${Date.now().toString(36)}`, source, directives }, ...current.sources]
    }));

    // A filter that does not match the new source would hide the card that was
    // just created, which reads as the dialog having done nothing.
    setFilter('');
  };

  const updateSource = (id: string, patch: Partial<CspSourceConfig>): void =>
    onChange((current) => ({
      ...current,
      sources: current.sources.map((s) => (s.id === id ? { ...s, ...patch } : s))
    }));

  const removeSource = (id: string): void =>
    onChange((current) => ({ ...current, sources: current.sources.filter((s) => s.id !== id) }));

  return (
    <Group flexDirection="column" gap="16">
      {config.sources.some((source) => source.source === Sources.Nonce) && (
        <Notice intent="warning" title="Your front end must apply the nonce.">
          The published policy carries a placeholder that your front end must replace with a
          fresh, unguessable value on every request, and it must put the same value in a{' '}
          <code>nonce=</code> attribute on the script and style tags you want to allow.
        </Notice>
      )}

      {/* The filter is always shown, even for a handful of sources: it carries the
          add button, which must not disappear with it. */}
      <Group gap="8" alignItems="end" flexWrap="wrap">
        <Box flex="1">
          <Field label="Filter" w="full">
            <SearchInput
              value={filter}
              onValueChange={setFilter}
              placeholder="Domain, keyword or directive"
              w="full"
            />
          </Field>
        </Box>

        <AddSource takenSources={takenSources} onAdd={addSource} />
      </Group>

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
            takenSources={takenSources}
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
    </Group>
  );
}

/**
 * The call to action, and the dialog it opens.
 *
 * The form is mounted only while the dialog is open, so it starts empty on each
 * open with no effect needed to reset it — the same split as `DirectiveDialog`
 * below, for the same reason.
 */
function AddSource({
  takenSources,
  onAdd
}: {
  takenSources: ReadonlySet<string>;
  onAdd: (source: string, directives: readonly string[]) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button appearance="primary" onClick={() => setOpen(true)}>
        Add source
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          {open && (
            <AddSourceForm
              takenSources={takenSources}
              onCancel={() => setOpen(false)}
              onAdd={(source, directives) => {
                onAdd(source, directives);
                setOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddSourceForm({
  takenSources,
  onCancel,
  onAdd
}: {
  takenSources: ReadonlySet<string>;
  onCancel: () => void;
  onAdd: (source: string, directives: readonly string[]) => void;
}): React.JSX.Element {
  const [source, setSource] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [sourceError, setSourceError] = useState<string | undefined>(undefined);
  const [directiveError, setDirectiveError] = useState<string | undefined>(undefined);

  const submit = (): void => {
    const value = source.trim();
    const problem = describeSourceProblem(value, takenSources);
    // A source with no directives is rejected by `validateConfig`, so adding one
    // would leave a draft that cannot be saved.
    const directiveProblem =
      selected.length === 0 ? 'Choose at least one thing this source is permitted to do.' : undefined;

    setSourceError(problem);
    setDirectiveError(directiveProblem);

    if (problem !== undefined || directiveProblem !== undefined) {
      return;
    }

    onAdd(value, selected);
  };

  return (
    <>
      <DialogHeader description={ADD_SOURCE_DESCRIPTION}>Add a source</DialogHeader>

      <DialogBody>
        <Group flexDirection="column" gap="16" w="full">
          <Field label="Source" error={sourceError} w="full">
            {/* The border reacts per keystroke, the message does not: one that
                appears at `h`, `ht`, `htt` is noise. */}
            <Input
              value={source}
              error={
                sourceError !== undefined ||
                (source.trim().length > 0 && !isValidCspSource(source))
              }
              w="full"
              placeholder="https://cdn.example.com"
              list="csp-keyword-suggestions"
              onValueChange={(value) => {
                setSource(value);
                setSourceError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </Field>

          <KeywordSuggestions />

          <Field error={directiveError} w="full">
            <DirectiveChecklist
              source={source.trim()}
              selected={selected}
              onToggle={(directive, granted) => {
                setSelected((current) =>
                  granted ? [...current, directive] : current.filter((d) => d !== directive)
                );
                setDirectiveError(undefined);
              }}
            />
          </Field>
        </Group>
      </DialogBody>

      <DialogFooter>
        <Button onClick={onCancel}>Cancel</Button>
        <Button appearance="primary" onClick={submit} disabled={source.trim().length === 0}>
          Add source
        </Button>
      </DialogFooter>
    </>
  );
}

function SourceCard({
  source,
  takenSources,
  editing,
  onEdit,
  onCloseEdit,
  onChange,
  onRemove
}: {
  source: CspSourceConfig;
  takenSources: ReadonlySet<string>;
  editing: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  onChange: (patch: Partial<CspSourceConfig>) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const invalid = !isValidCspSource(source.source);

  return (
    <Card p="16">
      {/* `w="full"` on the stack: without it the column is only as wide as its
          widest child, which leaves a short source name in a card of empty space
          and the buttons stranded in the middle of it. */}
      <Group flexDirection="column" gap="8" w="full">
        <Box>
          <Code fontWeight="600" style={{ wordBreak: 'break-all' }}>
            {source.source}
          </Code>

          <Text color="fg.tertiary" mt="4">
            {source.directives.length === 0
              ? 'No directives — not emitted'
              : `${source.directives.length} directive${source.directives.length === 1 ? '' : 's'}`}
          </Text>
        </Box>

        {source.directives.length > 0 && (
          <Text color="fg.tertiary" style={{ wordBreak: 'break-all' }}>
            {source.directives.join(', ')}
          </Text>
        )}

        {/* A value predating the source rules blocks *every* save, on every tab,
            because `validateConfig` judges the whole document. Saying so on the
            card is what turns an unsaveable console into a work list. */}
        {invalid && (
          <Notice intent="warning" title="This source cannot be saved.">
            {CSP_SOURCE_RULE} Edit the source to correct it.
          </Notice>
        )}

        {/* Actions at the foot of the card, as on a response header card. Cards
            sitting side by side vary in height with their directive lists, so
            buttons on the top row land at a different place in each one. */}
        <Group gap="8" mt="4" flexWrap="wrap">
          <Button ml="auto" onClick={onEdit}>
            Edit
          </Button>
          <Button
            appearance="danger-outline"
            onClick={onRemove}
            aria-label={`Remove ${source.source}`}
          >
            Remove
          </Button>
        </Group>

        <DirectiveDialog
          source={source}
          takenSources={takenSources}
          open={editing}
          onOpenChange={(next) => (next ? onEdit() : onCloseEdit())}
          onChange={onChange}
        />
      </Group>
    </Card>
  );
}

/**
 * The directive picker, and the repair path for a source value that predates the
 * source rules.
 *
 * Edits are held locally and only reach the in-memory draft when **Apply** is
 * pressed. Cancelling — including Escape or clicking away, which a modal is
 * expected to treat as cancelling — discards them.
 *
 * The form is mounted only while open, so its initial state comes straight from
 * the source on each open with no effect needed to resynchronise it. That is the
 * whole reason for the split: a long-lived component holding a copy of a prop is
 * exactly the shape that goes stale.
 */
function DirectiveDialog({
  source,
  takenSources,
  open,
  onOpenChange,
  onChange
}: {
  source: CspSourceConfig;
  takenSources: ReadonlySet<string>;
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
            takenSources={takenSources}
            onCancel={() => onOpenChange(false)}
            onApply={(patch) => {
              onChange(patch);
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
  takenSources,
  onCancel,
  onApply
}: {
  source: CspSourceConfig;
  takenSources: ReadonlySet<string>;
  onCancel: () => void;
  onApply: (patch: Partial<CspSourceConfig>) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(source.source);
  const [selected, setSelected] = useState<readonly string[]>(source.directives);
  const [valueError, setValueError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  /**
   * A source name is otherwise as fixed as a header name — it is chosen once, in
   * the add dialog. The exception is a value that no longer validates: it blocks
   * every save until it is corrected, and delete-and-re-add would discard the
   * directives on the card. Editable only while invalid makes this a one-way
   * ratchet towards a saveable document, never a rename.
   *
   * Read from the stored value, not the local one, so the field does not lock
   * itself the moment the replacement becomes valid.
   */
  const repairable = !isValidCspSource(source.source);

  /** Its own value is not a duplicate of itself. */
  const otherSources = useMemo(() => {
    const others = new Set(takenSources);
    others.delete(source.source.trim().toLowerCase());
    return others;
  }, [takenSources, source.source]);

  const apply = (): void => {
    const trimmed = value.trim();
    const valueProblem = repairable ? describeSourceProblem(trimmed, otherSources) : undefined;
    // Same rule as the add dialog: revoking everything leaves a source that
    // `validateConfig` rejects, so it cannot be saved. Removing the source is
    // what "allow nothing" means.
    const directiveProblem =
      selected.length === 0
        ? 'Choose at least one directive, or remove the source entirely.'
        : undefined;

    setValueError(valueProblem);
    setError(directiveProblem);

    if (valueProblem !== undefined || directiveProblem !== undefined) {
      return;
    }

    // The value only ever reaches the patch when it was repairable. A valid
    // source is chosen once, in the add dialog, and Apply must not quietly
    // rewrite it — not even to trim it.
    onApply(repairable ? { source: trimmed, directives: selected } : { directives: selected });
  };

  return (
    <>
      <DialogHeader description="Choose what this source is permitted to do.">
        {source.source}
      </DialogHeader>

      <DialogBody>
        <Group flexDirection="column" gap="16" w="full">
          {repairable && (
            <>
              <Field label="Source" error={valueError} w="full">
                <Input
                  value={value}
                  error={valueError !== undefined || !isValidCspSource(value)}
                  w="full"
                  placeholder="https://cdn.example.com"
                  list="csp-keyword-suggestions"
                  onValueChange={(next) => {
                    setValue(next);
                    setValueError(undefined);
                  }}
                />
              </Field>

              <KeywordSuggestions />
            </>
          )}

          <Field error={error} w="full">
            {/* The live value, not the stored one, so the keyword notices track
                what is being typed — as they do in the add dialog. */}
            <DirectiveChecklist
              source={value.trim()}
              selected={selected}
              onToggle={(directive, granted) => {
                setSelected((current) =>
                  granted ? [...current, directive] : current.filter((d) => d !== directive)
                );
                setError(undefined);
              }}
            />
          </Field>
        </Group>
      </DialogBody>

      <DialogFooter>
        <Button onClick={onCancel}>Cancel</Button>
        <Button appearance="primary" onClick={apply}>Apply</Button>
      </DialogFooter>
    </>
  );
}

/**
 * The suggestion list, rendered by whichever dialog can accept a source value.
 *
 * Only one of the two is ever mounted, so the shared `id` cannot collide.
 */
function KeywordSuggestions(): React.JSX.Element {
  return (
    <datalist id="csp-keyword-suggestions">
      {KEYWORD_SUGGESTIONS.map((suggestion) => (
        <option key={suggestion.value} value={suggestion.value}>
          {suggestion.label}
        </option>
      ))}
    </datalist>
  );
}

/**
 * The checkbox list, plus whatever the source itself needs explaining.
 *
 * Shared by both dialogs so adding a source and editing one offer the same
 * nineteen choices and the same warnings. `source` is a plain string rather than
 * a `CspSourceConfig`: in the add dialog it is still being typed, and the notices
 * should appear as soon as someone types `'none'`.
 */
function DirectiveChecklist({
  source,
  selected,
  onToggle
}: {
  source: string;
  selected: readonly string[];
  onToggle: (directive: string, granted: boolean) => void;
}): React.JSX.Element {
  return (
    <Group flexDirection="column" gap="12" w="full">
      {/* Mirrors the engine: 'none' wins outright for any directive it is
          granted, discarding every other source for that directive. */}
      {source === Sources.None && (
        <Notice intent="warning" title="'none' overrides everything.">
          Any directive granted here will permit nothing at all, regardless of other sources.
        </Notice>
      )}

      {source === Sources.Nonce && (
        <Text color="fg.tertiary">
          Grant this to <code>script-src</code> or <code>style-src</code> to allow inline code
          carrying a matching nonce. The stored value is a placeholder — a real, unguessable
          nonce is substituted on every request.
        </Text>
      )}

      {source === Sources.StrictDynamic && (
        <Text color="fg.tertiary">
          Lets a trusted script load further scripts, so host allow-lists can be dropped. Only
          meaningful alongside a nonce, and modern browsers ignore host sources on any directive
          that carries it.
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
                onCheckedChange={(checked) => onToggle(directive, checked)}
              >
                {directive}
              </Checkbox>
            ))}
          </Group>
        </fieldset>
      </Box>
    </Group>
  );
}

function describeSourceProblem(
  source: string,
  takenSources: ReadonlySet<string>
): string | undefined {
  if (source.length === 0) {
    return 'Enter a domain, scheme or keyword.';
  }

  // Before the duplicate check: most specific reason first, so the generic
  // "already listed" message only ever describes a source that could exist.
  if (!isValidCspSource(source)) {
    return `Not a valid CSP source. ${CSP_SOURCE_RULE}`;
  }

  if (takenSources.has(source.toLowerCase())) {
    return 'This source is already listed.';
  }

  return undefined;
}
