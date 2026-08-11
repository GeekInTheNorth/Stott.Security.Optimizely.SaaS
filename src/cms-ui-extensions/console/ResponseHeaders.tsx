/**
 * Response headers editor — the eight standard security headers plus custom ones.
 *
 * Ported from the PaaS `CustomHeaders/` components. The behaviour that matters is
 * inherited from the engine rather than reimplemented here: every standard header
 * a customer has not configured is materialised by the backend as a `Disabled`
 * row, so installing the app emits nothing until someone deliberately turns a
 * header on.
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
  Card,
  Code,
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
import { findStandardHeader, type HeaderRowModel } from '../../shared/standard-headers.js';
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

  // Rows come from the backend so the console never has to know which headers
  // are "standard"; configured values are overlaid from the local draft so
  // unsaved edits are reflected immediately.
  const merged = useMemo(() => {
    const configured = new Map(config.headers.map((h) => [h.headerName.toLowerCase(), h]));

    return rows.map((row) => {
      const override = configured.get(row.headerName.toLowerCase());

      return override
        ? { ...row, behavior: override.behavior, headerValue: override.headerValue }
        : row;
    });
  }, [config.headers, rows]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();

    return needle ? merged.filter((r) => r.headerName.toLowerCase().includes(needle)) : merged;
  }, [filter, merged]);

  const setHeader = (headerName: string, patch: Partial<CustomHeaderConfig>): void => {
    onChange((current) => {
      const key = headerName.toLowerCase();
      const existing = current.headers.find((h) => h.headerName.toLowerCase() === key);

      if (existing) {
        return {
          ...current,
          headers: current.headers.map((h) =>
            h.headerName.toLowerCase() === key ? { ...h, ...patch } : h
          )
        };
      }

      // First edit of a standard header: promote it from a materialised default
      // into a real stored row, seeded with its documented default value.
      return {
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
      };
    });
  };

  return (
    <Group flexDirection="column" gap="16">
      <Box maxW="sm">
        <Field label="Filter">
          <SearchInput value={filter} onValueChange={setFilter} placeholder="Header name" />
        </Field>
      </Box>

      {/* Two columns above 1440px. A CSS grid rather than Axiom's Grid, whose
          responsive props only offer 600px and 900px breakpoints — see
          card-grid.css. Editing stays inline: unlike the CSP directive list,
          a header is three fields, which the card has room for. */}
      <Box className="stott-card-grid">
        {visible.map((row) => (
          <HeaderCard key={row.headerName} row={row} onChange={setHeader} />
        ))}
      </Box>

      {/* Outside the grid — an empty-state message is not a card. */}
      {visible.length === 0 && <Text>No headers match “{filter}”.</Text>}
    </Group>
  );
}

function HeaderCard({
  row,
  onChange
}: {
  row: HeaderRowModel;
  onChange: (headerName: string, patch: Partial<CustomHeaderConfig>) => void;
}): React.JSX.Element {
  return (
    <Card p="16">
      <Group flexDirection="column" gap="12">
        <Box>
          <Code fontWeight="600">{row.headerName}</Code>
          {row.description && (
            <Text color="fg.tertiary" mt="4">
              {row.description}
            </Text>
          )}
        </Box>

        <Box maxW="xs">
          <Field label="Behaviour">
            <Select
              options={BEHAVIOURS}
              value={row.behavior}
              onValueChange={(value: string) =>
                onChange(row.headerName, { behavior: value as CustomHeaderBehaviorValue })
              }
            >
              <SelectTrigger />
              <SelectContent />
            </Select>
          </Field>
        </Box>

        {row.behavior === CustomHeaderBehavior.Add && (
          <>
            <Box maxW="md">
              <Field label="Value">
                <ValueSelector row={row} onChange={onChange} />
              </Field>
            </Box>
            <Box maxW="md">
              <Field label="Preview">
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
            </Box>
          </>
        )}

        {row.behavior === CustomHeaderBehavior.Remove && (
          <Box maxW="md">
            <Field label="Preview">
              <Preview>Header will be removed</Preview>
            </Field>
          </Box>
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
 * just makes the option list harder to scan.
 */
function ValueSelector({
  row,
  onChange
}: {
  row: HeaderRowModel;
  onChange: (headerName: string, patch: Partial<CustomHeaderConfig>) => void;
}): React.JSX.Element {
  const commit = (headerValue: string): void => onChange(row.headerName, { headerValue });

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
        <SelectTrigger />
        <SelectContent />
      </Select>
    );
  }

  return <Input value={row.headerValue} onChange={(event) => commit(event.target.value)} />;
}
