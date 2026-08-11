/**
 * Surfaces compile diagnostics.
 *
 * `policy-dropped` is why this component exists. Past the terminal threshold the
 * optimiser emits *nothing* rather than an oversized header, so a site can lose
 * its CSP entirely. On PaaS that at least leaves a server-side log; on SaaS this
 * panel is the only place it can ever surface.
 */

import { Group } from '@optiaxiom/react';

import type { Diagnostic } from '../../shared/contracts.js';
import { Notice } from './ui.js';

const INTENT = {
  error: 'danger',
  warning: 'warning',
  info: 'information'
} as const;

const SEVERITY_ORDER: Record<Diagnostic['severity'], number> = { error: 0, warning: 1, info: 2 };

export function DiagnosticsPanel({
  diagnostics
}: {
  diagnostics: readonly Diagnostic[];
}): React.JSX.Element | null {
  if (diagnostics.length === 0) {
    return null;
  }

  // Errors first — a dropped policy must not sit below an informational note
  // about splitting.
  const ordered = [...diagnostics].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  return (
    <Group flexDirection="column" asChild gap="8">
      <section aria-label="Diagnostics">
        {ordered.map((diagnostic) => (
          <Notice key={`${diagnostic.code}-${diagnostic.message}`} intent={INTENT[diagnostic.severity]}>
            {diagnostic.message}
          </Notice>
        ))}
      </section>
    </Group>
  );
}
