/**
 * Response headers editor — the eight standard security headers plus custom ones.
 *
 * Ported from the PaaS `CustomHeaders/` components. The behaviour that matters is
 * inherited from the engine rather than reimplemented here: every standard header
 * a customer has not configured is materialised by the backend as a `Disabled`
 * row, so installing the app emits nothing until someone deliberately turns a
 * header on.
 *
 * A custom header is a name of the customer's choosing, a behaviour and a raw
 * value. It needs no metadata to exist — an unrecognised name simply has no
 * standard-header definition, which gives it a free text value editor and no
 * description.
 *
 * Adding one happens in a dialog, reached from beside the filter. The list is the
 * tab's subject, and a permanently mounted three-field form would take the top of
 * the page from it to serve the rarer action. The dialog is also the only place a
 * name is ever entered: once added, a custom name is as fixed as a standard one,
 * and every card shows its name read-only.
 *
 * Each card is a single vertical stack — name, description, behaviour, then
 * behaviour-dependent fields — ending in a preview of the header as it will
 * actually be emitted. The preview is the point: a dropdown showing "Same Origin"
 * does not tell an editor that the response will carry
 * `Cross-Origin-Resource-Policy: same-origin`.
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
  Text
} from '@optiaxiom/react';

import {
  CustomHeaderBehavior,
  type ConfigDocument,
  type CustomHeaderBehaviorValue,
  type CustomHeaderConfig
} from '../../shared/config.js';
import {
  HEADER_NAME_RULE,
  RESERVED_HEADER_NAMES,
  hasControlCharacters,
  isValidHeaderName
} from '../../shared/header-rules.js';
import {
  findStandardHeader,
  toConfiguredRow,
  toDefaultRow,
  type HeaderRowModel
} from '../../shared/standard-headers.js';
import { Preview } from './ui.js';
import './card-grid.css';

const BEHAVIOURS: ReadonlyArray<{ value: CustomHeaderBehaviorValue; label: string }> = [
  { value: CustomHeaderBehavior.Disabled, label: 'Disabled' },
  { value: CustomHeaderBehavior.Add, label: 'Add' },
  { value: CustomHeaderBehavior.Remove, label: 'Remove' }
];

export function ResponseHeaders({
  config,
  rows,
  onChange
}: {
  config: ConfigDocument;
  rows: readonly HeaderRowModel[];
  onChange: (mutate: (current: ConfigDocument) => ConfigDocument) => void;
}): React.JSX.Element {
  const [filter, setFilter] = useState('');

  /**
   * The rows to render, reconciled against the local draft.
   *
   * `rows` comes from the backend — it is what knows which headers are standard —
   * and reflects the *stored* draft, so unsaved edits are overlaid on top and a
   * header added in the console is appended, having no row of its own yet.
   *
   * Reconciliation is by id wherever there is one, because the id is the identity
   * of a stored row and is what the edit and delete handlers key on. A row the
   * backend materialised has no id to match, so those fall back to the name.
   */
  const merged = useMemo<readonly HeaderRowModel[]>(() => {
    const byId = new Map(config.headers.map((header) => [header.id, header]));
    const reconciled = new Set<string>();

    const listed = rows.flatMap<HeaderRowModel>((row) => {
      const configured =
        (row.id === undefined ? undefined : byId.get(row.id)) ??
        config.headers.find((h) => h.headerName.toLowerCase() === row.headerName.toLowerCase());

      if (configured) {
        reconciled.add(configured.id);

        return [toConfiguredRow(configured)];
      }

      // No draft row at all: a standard header nobody has configured, whose
      // materialised default is already what should be shown.
      if (row.id === undefined) {
        return [row];
      }

      // Stored when the draft loaded, deleted since. A standard header falls back
      // to its default card so it can be configured again; a custom one is gone.
      const definition = findStandardHeader(row.headerName);

      return definition ? [toDefaultRow(definition)] : [];
    });

    // Added in the console since the draft loaded. First, because appending to a
    // list of at least eight cards looks like nothing happened.
    const added = config.headers
      .filter((header) => !reconciled.has(header.id))
      .map(toConfiguredRow);

    return [...added, ...listed];
  }, [config.headers, rows]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();

    return needle ? merged.filter((r) => r.headerName.toLowerCase().includes(needle)) : merged;
  }, [filter, merged]);

  /**
   * Every name already listed, so the add dialog can refuse a duplicate. It is
   * the only place a name can enter the draft, which is why no card needs to
   * check: the backend rejects a duplicated name on save, and which of the two
   * had taken effect would be invisible in the console.
   */
  const takenNames = useMemo(
    () => new Set(merged.map((row) => row.headerName.trim().toLowerCase())),
    [merged]
  );

  const updateHeader = (id: string, patch: Partial<CustomHeaderConfig>): void =>
    onChange((current) => ({
      ...current,
      headers: current.headers.map((h) => (h.id === id ? { ...h, ...patch } : h))
    }));

  /**
   * First edit of a standard header the customer has never configured: promote
   * the materialised default into a real stored row, seeded with its documented
   * default value.
   */
  const promoteHeader = (headerName: string, patch: Partial<CustomHeaderConfig>): void =>
    onChange((current) => ({
      ...current,
      headers: [
        ...current.headers,
        {
          id: `hdr-${headerName.toLowerCase()}`,
          headerName,
          behavior: CustomHeaderBehavior.Disabled,
          headerValue: findStandardHeader(headerName)?.defaultValue ?? '',
          ...patch
        }
      ]
    }));

  const deleteHeader = (id: string): void =>
    onChange((current) => ({
      ...current,
      headers: current.headers.filter((h) => h.id !== id)
    }));

  const addCustomHeader = (header: Omit<CustomHeaderConfig, 'id'>): void => {
    onChange((current) => ({
      ...current,
      headers: [...current.headers, { id: `hdr-${Date.now().toString(36)}`, ...header }]
    }));

    // A filter that does not match the new name would hide the card that was
    // just created, which reads as the Add button having done nothing.
    setFilter('');
  };

  return (
    <Group flexDirection="column" gap="16">
      {/* `alignItems="end"` lines the button up with the input rather than its
          label. The filter carries no error text beneath it, so nothing can
          appear later to push the two out of alignment. */}
      <Group gap="8" alignItems="end" flexWrap="wrap">
        <Box flex="1">
          <Field label="Filter">
            <SearchInput value={filter} onValueChange={setFilter} placeholder="Header name" />
          </Field>
        </Box>

        <AddCustomHeader takenNames={takenNames} onAdd={addCustomHeader} />
      </Group>

      {/* Two columns above 1440px. A CSS grid rather than Axiom's Grid, whose
          responsive props only offer 600px and 900px breakpoints — see
          card-grid.css. Editing stays inline: unlike the CSP directive list,
          a header is three fields, which the card has room for. */}
      <Box className="stott-card-grid">
        {visible.map((row) => (
          <HeaderCard
            key={row.id ?? row.headerName}
            row={row}
            onChange={(patch) =>
              row.id === undefined
                ? promoteHeader(row.headerName, patch)
                : updateHeader(row.id, patch)
            }
            // Only a custom header can be deleted. Deleting a standard one would
            // mean the same thing as setting it to Disabled, which is already how
            // a header is turned off.
            onDelete={
              row.canDelete && row.isCustomHeader && row.id !== undefined
                ? () => deleteHeader(row.id as string)
                : undefined
            }
          />
        ))}
      </Box>

      {/* Outside the grid — an empty-state message is not a card. */}
      {visible.length === 0 && <Text>No headers match “{filter}”.</Text>}
    </Group>
  );
}

/**
 * The call to action, and the dialog it opens.
 *
 * The form is mounted only while the dialog is open, so its fields start empty on
 * each open with no effect needed to reset them — the same reason `CspSources`
 * splits its directive dialog in two. Cancelling, including Escape or clicking
 * away, discards whatever was typed.
 */
function AddCustomHeader({
  takenNames,
  onAdd
}: {
  takenNames: ReadonlySet<string>;
  onAdd: (header: Omit<CustomHeaderConfig, 'id'>) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button appearance="primary" onClick={() => setOpen(true)}>
        Add header
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          {open && (
            <AddCustomHeaderForm
              takenNames={takenNames}
              onCancel={() => setOpen(false)}
              onAdd={(header) => {
                onAdd(header);
                setOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Name, behaviour and value together rather than a bare name: a header added as
 * `Add` with no value is a document the backend refuses to save, so collecting
 * all three is what makes a newly added row valid the moment it appears.
 */
function AddCustomHeaderForm({
  takenNames,
  onCancel,
  onAdd
}: {
  takenNames: ReadonlySet<string>;
  onCancel: () => void;
  onAdd: (header: Omit<CustomHeaderConfig, 'id'>) => void;
}): React.JSX.Element {
  const [headerName, setHeaderName] = useState('');
  const [behavior, setBehavior] = useState<CustomHeaderBehaviorValue>(CustomHeaderBehavior.Add);
  const [headerValue, setHeaderValue] = useState('');
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [valueError, setValueError] = useState<string | undefined>(undefined);

  // A `Remove` carries no value — the header is deleted from the response.
  const carriesValue = behavior !== CustomHeaderBehavior.Remove;

  const submit = (): void => {
    const name = headerName.trim();
    const value = headerValue.trim();
    const nameProblem = describeNameProblem(name, takenNames.has(name.toLowerCase()));
    const valueProblem = carriesValue ? describeValueProblem(behavior, value) : undefined;

    setNameError(nameProblem);
    setValueError(valueProblem);

    // The dialog stays open on a problem, with the message against the field
    // that caused it.
    if (nameProblem !== undefined || valueProblem !== undefined) {
      return;
    }

    onAdd({ headerName: name, behavior, headerValue: carriesValue ? value : '' });
  };

  const submitOnEnter = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  };

  return (
    <>
      <DialogHeader description={'Add a custom header that this app does not already list'}>
        Add a custom header
      </DialogHeader>

      <DialogBody>
        <Group flexDirection="column" gap="16" w="full">
          <Field label="Header name" error={nameError} w="full">
            <Input
              value={headerName}
              error={nameError !== undefined}
              fontFamily="mono"
              w="full"
              placeholder="X-Custom-Header"
              onValueChange={(value) => {
                setHeaderName(value);
                setNameError(undefined);
              }}
              onKeyDown={submitOnEnter}
            />
          </Field>

          <Field label="Behaviour" w="full">
            <Select
              options={BEHAVIOURS}
              value={behavior}
              onValueChange={(value: string) => {
                setBehavior(value as CustomHeaderBehaviorValue);
                setValueError(undefined);
              }}
            >
              <SelectTrigger w="full" />
              <SelectContent />
            </Select>
          </Field>

          {carriesValue ? (
            <Field label="Value" error={valueError} w="full">
              <Input
                value={headerValue}
                error={valueError !== undefined}
                fontFamily="mono"
                w="full"
                onValueChange={(value) => {
                  setHeaderValue(value);
                  setValueError(undefined);
                }}
                onKeyDown={submitOnEnter}
              />
            </Field>
          ) : (
            <Text color="fg.tertiary">
              A removed header carries no value — whatever the response holds is deleted.
            </Text>
          )}
        </Group>
      </DialogBody>

      <DialogFooter>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          appearance="primary"
          onClick={submit}
          disabled={headerName.trim().length === 0}
        >
          Add header
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * One header's card.
 *
 * The name is read-only whether it is standard or custom: a custom name is chosen
 * in the add dialog and fixed from then on, the same as one of the eight. Renaming
 * a live header is a delete plus an add — two separate publishes on a customer's
 * site — and offering it as a text field makes it look like one harmless edit.
 *
 * Fields fill the card — each sits on its own row, so capping their widths only
 * made the controls narrower than the labels above them. Width has to be asked
 * for at both ends: `w="full"` on the stack, or it is only as wide as its widest
 * child, and on `SelectTrigger`, which extends `Button` and so sizes to its own
 * content however much room it is given.
 */
function HeaderCard({
  row,
  onChange,
  onDelete
}: {
  row: HeaderRowModel;
  onChange: (patch: Partial<CustomHeaderConfig>) => void;
  onDelete?: () => void;
}): React.JSX.Element {
  const valueError = describeValueProblem(row.behavior, row.headerValue);

  return (
    <Card p="16">
      <Group flexDirection="column" gap="12" w="full">
        <Box>
          <Code fontWeight="600">{row.headerName}</Code>
          {row.description && (
            <Text color="fg.tertiary" mt="4">
              {row.description}
            </Text>
          )}
        </Box>

        <Field label="Behaviour" w="full">
          <Select
            options={BEHAVIOURS}
            value={row.behavior}
            onValueChange={(value: string) =>
              onChange({ behavior: value as CustomHeaderBehaviorValue })
            }
          >
            <SelectTrigger w="full" />
            <SelectContent />
          </Select>
        </Field>

        {row.behavior === CustomHeaderBehavior.Add && (
          <>
            <Field label="Value" error={valueError} w="full">
              <ValueSelector row={row} invalid={valueError !== undefined} onChange={onChange} />
            </Field>
            <Field label="Preview" w="full">
              <Preview>
                {row.headerValue.trim().length > 0 ? (
                  <>
                    <strong>{row.headerName}:</strong> {row.headerValue}
                  </>
                ) : (
                  // Matches the engine, which drops an Add with a blank value
                  // rather than emitting a bare header.
                  <em>No value set — this header will not be sent.</em>
                )}
              </Preview>
            </Field>
          </>
        )}

        {row.behavior === CustomHeaderBehavior.Remove && (
          <Field label="Preview" w="full">
            <Preview>Header will be removed</Preview>
          </Field>
        )}

        {onDelete && (
          <Group>
            {/* "Delete", not "Remove": Remove is a behaviour that strips the
                header from responses, and this discards the configuration. */}
            <Button
              appearance="danger-outline"
              ml="auto"
              onClick={onDelete}
              aria-label={`Delete ${row.headerName}`}
            >
              Delete
            </Button>
          </Group>
        )}
      </Group>
    </Card>
  );
}

/**
 * The value control.
 *
 * For standard headers the dropdown shows the human-readable label only — the
 * raw value is visible in the preview directly beneath, so repeating it here
 * just makes the option list harder to scan. A custom header has no allowed
 * values to offer, so it gets the raw value as free text.
 */
function ValueSelector({
  row,
  invalid,
  onChange
}: {
  row: HeaderRowModel;
  invalid: boolean;
  onChange: (patch: Partial<CustomHeaderConfig>) => void;
}): React.JSX.Element {
  const commit = (headerValue: string): void => onChange({ headerValue });

  // `propertyType` comes from the shared standard-header metadata, so the editor
  // shape is driven by data rather than a switch the console has to maintain.
  if (row.propertyType === 'select' && row.allowedValues) {
    // Label only — the raw value is right beneath in the preview.
    const options = row.allowedValues.map((allowed) => ({
      label: allowed.description,
      value: allowed.value
    }));

    return (
      <Select options={options} value={row.headerValue} onValueChange={commit}>
        <SelectTrigger w="full" />
        <SelectContent />
      </Select>
    );
  }

  return (
    <Input
      value={row.headerValue}
      error={invalid}
      fontFamily="mono"
      w="full"
      onValueChange={commit}
    />
  );
}

/**
 * Why a header name cannot be stored, if it cannot.
 *
 * The rules are the backend's, imported from `shared/`, so the console rejects
 * exactly what a save would — the alternative is an editor typing a name, saving,
 * and being told by the server that it was never allowed.
 */
function describeNameProblem(headerName: string, duplicate: boolean): string | undefined {
  const trimmed = headerName.trim();

  if (trimmed.length === 0) {
    return 'A header name is required.';
  }

  if (!isValidHeaderName(trimmed)) {
    return `Not a valid HTTP header name. ${HEADER_NAME_RULE}`;
  }

  if (duplicate) {
    return 'Another header is already configured with this name.';
  }

  // Headers the engine compiles from another tab. A second header of the same
  // name would compete with it, and nothing here would show that.
  if (RESERVED_HEADER_NAMES.has(trimmed.toLowerCase())) {
    return 'This header is managed by this app. Configure it on its own tab instead.';
  }

  return undefined;
}

function describeValueProblem(
  behavior: CustomHeaderBehaviorValue,
  headerValue: string
): string | undefined {
  if (hasControlCharacters(headerValue)) {
    return 'A header value cannot contain control characters.';
  }

  if (behavior === CustomHeaderBehavior.Add && headerValue.trim().length === 0) {
    return 'A value is required to add a header — the draft cannot be saved without one.';
  }

  return undefined;
}
