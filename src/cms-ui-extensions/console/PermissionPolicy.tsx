/**
 * Permissions Policy tab.
 *
 * Ported from the PaaS `PermissionsPolicy/` components. A card per directive,
 * with the state and its origin list edited in a dialog — the same shape as CSP
 * sources, and for the same reason: a state dropdown plus a variable-length list
 * of origin fields is more than a card can open inline without shunting every
 * other card off screen and making card heights wildly uneven.
 *
 * The enable switch sits above the cards rather than behind a sub-navigation.
 * There is exactly one setting, and a sub-nav would put a segmented control in
 * front of a page holding a single checkbox.
 *
 * The live fragment preview — in the dialog and on every card — is the piece
 * worth carrying across from PaaS. A dropdown reading "Allow just this website"
 * does not tell an editor that the response will carry `camera=(self)`. Both
 * previews render through the engine's own `toPolicyFragment`, so neither can
 * drift from what is actually emitted.
 */

import { useMemo, useState } from 'react';

import {
  Box,
  Button,
  Card,
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
  Select,
  SelectContent,
  SelectTrigger,
  Switch,
  Text
} from '@optiaxiom/react';

import {
  PermissionPolicyState,
  type ConfigDocument,
  type PermissionPolicyConfig,
  type PermissionPolicyDirectiveConfig,
  type PermissionPolicyStateValue
} from '../../shared/config.js';
import {
  PERMISSION_POLICY_ORIGIN_RULE,
  isValidPermissionPolicyOrigin,
  listPermissionPolicyRows,
  stateRequiresOrigins,
  toPolicyFragment,
  type PermissionPolicyRowModel
} from '../../shared/permission-policy.js';
import { Notice, Preview, Section } from './ui.js';
import './card-grid.css';

/**
 * The six states, labelled as PaaS labels them. "Allow none" and "Disabled" are
 * genuinely different and the labels have to carry that: one blocks the feature
 * outright, the other leaves the browser's own default in place.
 */
const STATE_OPTIONS: ReadonlyArray<{ value: PermissionPolicyStateValue; label: string }> = [
  { value: PermissionPolicyState.Disabled, label: 'Disabled — use the browser default' },
  { value: PermissionPolicyState.None, label: 'Allow none' },
  { value: PermissionPolicyState.All, label: 'Allow all websites' },
  { value: PermissionPolicyState.ThisSite, label: 'Allow just this website' },
  {
    value: PermissionPolicyState.ThisAndSpecificSites,
    label: 'Allow this website and specific third party websites'
  },
  { value: PermissionPolicyState.SpecificSites, label: 'Allow specific third party websites' }
];

type StateFilter =
  | 'all'
  | 'configured'
  | 'unconfigured'
  | 'none'
  | 'allSites'
  | 'thisSite'
  | 'specificSites';

/**
 * Filters ported from `PermissionPolicyEnabledFilter`, but mapped one-to-one onto
 * the states so each is unambiguous — PaaS's "Directives Using This Site" does
 * not say whether it includes the state that allows this site *and* third
 * parties.
 */
const FILTER_OPTIONS: ReadonlyArray<{ value: StateFilter; label: string }> = [
  { value: 'all', label: 'All directives' },
  { value: 'configured', label: 'Configured' },
  { value: 'unconfigured', label: 'Not configured' },
  { value: 'none', label: 'Blocked everywhere' },
  { value: 'allSites', label: 'Allowed everywhere' },
  { value: 'thisSite', label: 'This website only' },
  { value: 'specificSites', label: 'Specific third party websites' }
];

export function PermissionPolicy({
  config,
  onChange
}: {
  config: ConfigDocument;
  onChange: (mutate: (current: ConfigDocument) => ConfigDocument) => void;
}): React.JSX.Element {
  const { permissionPolicy } = config;
  const [originFilter, setOriginFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  /** Which directive's dialog is open, if any. */
  const [editing, setEditing] = useState<string | undefined>(undefined);

  const set = (patch: Partial<PermissionPolicyConfig>): void =>
    onChange((current) => ({
      ...current,
      permissionPolicy: { ...current.permissionPolicy, ...patch }
    }));

  /**
   * Upserts one directive.
   *
   * Only configured directives are stored, so the first edit of a directive adds
   * a row rather than patching one — the same promote-on-first-edit shape the
   * response headers tab uses for a standard header nobody has touched.
   *
   * A row left `Disabled` with no origins is dropped rather than stored. It
   * compiles to nothing and materialises identically either way, so keeping it
   * would only pad the document and the export with rows recording that someone
   * opened a dialog and changed their mind.
   */
  const setDirective = (directive: string, patch: Partial<PermissionPolicyDirectiveConfig>): void =>
    onChange((current) => {
      const existing = current.permissionPolicy.directives.find(
        (entry) => entry.directive.toLowerCase() === directive.toLowerCase()
      );

      const updated = existing
        ? current.permissionPolicy.directives.map((entry) =>
          entry === existing ? { ...entry, ...patch } : entry
        )
        : [
          ...current.permissionPolicy.directives,
          { directive, state: PermissionPolicyState.Disabled, origins: [], ...patch }
        ];

      const directives = updated.filter(
        (entry) =>
          entry.state !== PermissionPolicyState.Disabled || entry.origins.length > 0
      );

      return { ...current, permissionPolicy: { ...current.permissionPolicy, directives } };
    });

  const rows = useMemo(
    () => listPermissionPolicyRows(permissionPolicy.directives),
    [permissionPolicy.directives]
  );

  const visible = useMemo(() => {
    const needle = originFilter.trim().toLowerCase();

    return rows.filter((row) => {
      if (needle.length > 0 && !row.origins.some((o) => o.toLowerCase().includes(needle))) {
        return false;
      }

      return matchesFilter(row, stateFilter);
    });
  }, [originFilter, rows, stateFilter]);

  return (
    <Group flexDirection="column" gap="16">
      <Section
        title="Permissions Policy"
        description={
          'Controls which browser features this site and the third parties it embeds are ' +
          'permitted to use. Every directive is left to the browser default until you change ' +
          'it. Note that browsers treat this whole header as experimental, and support for ' +
          'individual directives varies.'
        }
      >
        <Switch
          checked={permissionPolicy.isEnabled}
          onCheckedChange={(isEnabled) => set({ isEnabled })}
          description="When off, no Permissions-Policy header is produced at all."
        >
          Enable Permissions Policy
        </Switch>
      </Section>

      {!permissionPolicy.isEnabled && (
        <Notice intent="neutral">
          The Permissions Policy is disabled, so none of this is emitted. Enable it above when
          you are ready.
        </Notice>
      )}

      {/* `alignItems="end"` lines the dropdown up with the input rather than its
          label. Neither carries error text, so nothing can appear later to push
          them out of alignment. */}
      <Group gap="8" alignItems="end" flexWrap="wrap">
        <Box flex="1">
          <Field label="Filter by origin" w="full">
            <SearchInput
              value={originFilter}
              onValueChange={setOriginFilter}
              placeholder="https://www.example.com"
              w="full"
            />
          </Field>
        </Box>

        <Box>
          <Field label="Show" w="full">
            <Select
              options={FILTER_OPTIONS}
              value={stateFilter}
              onValueChange={(value: string) => setStateFilter(value as StateFilter)}
            >
              <SelectTrigger w="full" />
              <SelectContent />
            </Select>
          </Field>
        </Box>
      </Group>

      {/* A CSS grid rather than Axiom's Grid: the two-column rule is a 1440px
          breakpoint, and Axiom's responsive props only offer 600px and 900px.
          See card-grid.css. */}
      <Box className="stott-card-grid">
        {visible.map((row) => (
          <DirectiveCard
            key={row.directive}
            row={row}
            editing={editing === row.directive}
            onEdit={() => setEditing(row.directive)}
            onCloseEdit={() => setEditing(undefined)}
            onChange={(patch) => setDirective(row.directive, patch)}
          />
        ))}
      </Box>

      {/* Outside the grid — an empty-state message is not a card. */}
      {visible.length === 0 && (
        <Text color="fg.tertiary">No directives match the current filter.</Text>
      )}
    </Group>
  );
}

function matchesFilter(row: PermissionPolicyRowModel, filter: StateFilter): boolean {
  switch (filter) {
  case 'configured':
    return row.state !== PermissionPolicyState.Disabled;

  case 'unconfigured':
    return row.state === PermissionPolicyState.Disabled;

  case 'none':
    return row.state === PermissionPolicyState.None;

  case 'allSites':
    return row.state === PermissionPolicyState.All;

  case 'thisSite':
    return row.state === PermissionPolicyState.ThisSite;

  case 'specificSites':
    return stateRequiresOrigins(row.state);

  default:
    return true;
  }
}

/**
 * One directive's card.
 *
 * The summary is in plain language and the preview is the literal header
 * fragment, because the two answer different questions: what have I allowed, and
 * what will actually be sent.
 */
function DirectiveCard({
  row,
  editing,
  onEdit,
  onCloseEdit,
  onChange
}: {
  row: PermissionPolicyRowModel;
  editing: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  onChange: (patch: Partial<PermissionPolicyDirectiveConfig>) => void;
}): React.JSX.Element {
  const fragment = toPolicyFragment(row);

  return (
    <Card p="16">
      {/* `w="full"` on the stack: without it the column is only as wide as its
          widest child, leaving a short directive name in a card of empty space
          with the button stranded in the middle of it. */}
      <Group flexDirection="column" gap="12" w="full">
        <Box>
          <Text fontWeight="600">
            {row.title} - <Code>{row.directive}</Code>
          </Text>
          <Text color="fg.tertiary" mt="4">{row.description}</Text>
        </Box>

        <Text>{describeState(row)}</Text>

        <Field label="Preview" w="full">
          <Preview>
            {fragment.length > 0 ? (
              fragment
            ) : (
              <em>Not sent — the browser default applies.</em>
            )}
          </Preview>
        </Field>

        <Group gap="8" flexWrap="wrap">
          <Button ml="auto" onClick={onEdit} aria-label={`Edit ${row.title}`}>
            Edit
          </Button>
        </Group>

        <EditDirective
          row={row}
          open={editing}
          onOpenChange={(next) => (next ? onEdit() : onCloseEdit())}
          onChange={onChange}
        />
      </Group>
    </Card>
  );
}

/**
 * Plain-language summary of what a directive currently permits. Ported from
 * `PermissionPolicyCard.jsx`.
 */
function describeState(row: PermissionPolicyRowModel): string {
  const origins = row.origins.filter((origin) => origin.trim().length > 0);

  switch (row.state) {
  case PermissionPolicyState.All:
    return 'Enabled for all websites.';

  case PermissionPolicyState.ThisSite:
    return 'Enabled for this website only.';

  case PermissionPolicyState.ThisAndSpecificSites:
    return origins.length > 0
      ? `Enabled for this website and ${origins.join(', ')}.`
      : 'Enabled for this website only.';

  case PermissionPolicyState.SpecificSites:
    return origins.length > 0
      ? `Enabled for ${origins.join(', ')}.`
      : 'No websites — every use of this feature is blocked.';

  case PermissionPolicyState.None:
    return 'Blocked for every website, including this one.';

  default:
    return 'Not configured, so the browser default applies.';
  }
}

/**
 * The dialog wrapper.
 *
 * The form is mounted only while open, so its state comes straight from the row
 * on each open with no effect needed to resynchronise it. That is the whole
 * reason for the split: a long-lived component holding a copy of a prop is
 * exactly the shape that goes stale.
 */
function EditDirective({
  row,
  open,
  onOpenChange,
  onChange
}: {
  row: PermissionPolicyRowModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<PermissionPolicyDirectiveConfig>) => void;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && (
          <EditDirectiveForm
            row={row}
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

/** Stable React keys for origin rows, which are otherwise identical empty strings. */
let nextOriginKey = 0;

interface OriginRow {
  readonly key: string;
  readonly url: string;
}

function EditDirectiveForm({
  row,
  onCancel,
  onApply
}: {
  row: PermissionPolicyRowModel;
  onCancel: () => void;
  onApply: (patch: Partial<PermissionPolicyDirectiveConfig>) => void;
}): React.JSX.Element {
  const [state, setState] = useState<PermissionPolicyStateValue>(row.state);
  const [origins, setOrigins] = useState<readonly OriginRow[]>(() =>
    row.origins.map((url) => ({ key: `origin-${++nextOriginKey}`, url }))
  );
  const [error, setError] = useState<string | undefined>(undefined);

  const carriesOrigins = stateRequiresOrigins(state);
  const filled = origins.filter((origin) => origin.url.trim().length > 0);

  const apply = (): void => {
    if (carriesOrigins) {
      if (filled.length === 0) {
        // `validateConfig` rejects this, so applying it would leave a draft that
        // cannot be saved — reported by the server rather than by the field that
        // caused it.
        setError('Add at least one origin, or choose a different option.');
        return;
      }

      const invalid = filled.find((origin) => !isValidPermissionPolicyOrigin(origin.url));
      if (invalid) {
        setError(`'${invalid.url.trim()}' is not a valid origin. ${PERMISSION_POLICY_ORIGIN_RULE}`);
        return;
      }
    }

    // Origins are kept even when the chosen state ignores them, so switching to
    // Allow none and back does not silently discard the list. Lower-cased on the
    // way in, as the PaaS editor does on blur: host names are case-insensitive
    // and mixed case in a stored policy is just noise in a diff.
    onApply({
      state,
      origins: filled.map((origin) => origin.url.trim().toLowerCase())
    });
  };

  return (
    <>
      <DialogHeader description={row.description}>{row.title}</DialogHeader>

      <DialogBody>
        <Group flexDirection="column" gap="16" w="full">
          <Field label="Permitted websites" w="full">
            <Select
              options={STATE_OPTIONS}
              value={state}
              onValueChange={(value: string) => {
                const next = value as PermissionPolicyStateValue;
                setState(next);
                setError(undefined);

                // Opening the origin editor with nothing in it looks broken, and
                // the PaaS equivalent has a long-standing bug where this never
                // fires because it compares against a value that is not an option.
                if (stateRequiresOrigins(next) && origins.length === 0) {
                  setOrigins([{ key: `origin-${++nextOriginKey}`, url: '' }]);
                }
              }}
            >
              <SelectTrigger w="full" />
              <SelectContent />
            </Select>
          </Field>

          {carriesOrigins && (
            <Box asChild>
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <Text asChild fontWeight="600" mb="8">
                  <legend>Third party websites</legend>
                </Text>

                <Group flexDirection="column" gap="8" w="full">
                  {origins.map((origin) => (
                    <Group key={origin.key} gap="8" alignItems="start" w="full">
                      <Box flex="1">
                        <Input
                          value={origin.url}
                          fontFamily="mono"
                          w="full"
                          placeholder="https://www.example.com"
                          error={
                            origin.url.trim().length > 0 &&
                            !isValidPermissionPolicyOrigin(origin.url)
                          }
                          aria-label="Origin"
                          onValueChange={(url) => {
                            setOrigins((current) =>
                              current.map((o) => (o.key === origin.key ? { ...o, url } : o))
                            );
                            setError(undefined);
                          }}
                        />
                      </Box>

                      <Button
                        appearance="danger-outline"
                        aria-label={`Remove ${origin.url.trim() || 'empty origin'}`}
                        onClick={() => {
                          setOrigins((current) => current.filter((o) => o.key !== origin.key));
                          setError(undefined);
                        }}
                      >
                        Remove
                      </Button>
                    </Group>
                  ))}

                  <Button
                    onClick={() =>
                      setOrigins((current) => [
                        ...current,
                        { key: `origin-${++nextOriginKey}`, url: '' }
                      ])
                    }
                  >
                    Add origin
                  </Button>
                </Group>
              </fieldset>
            </Box>
          )}

          {error && <Notice intent="danger">{error}</Notice>}

          <Field label="Preview" w="full">
            <Preview>
              {state === PermissionPolicyState.Disabled ? (
                <em>
                  This directive will not be included in the Permissions-Policy header, so the
                  browser default applies.
                </em>
              ) : (
                toPolicyFragment({
                  directive: row.directive,
                  state,
                  origins: filled.map((origin) => origin.url.trim().toLowerCase())
                })
              )}
            </Preview>
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
