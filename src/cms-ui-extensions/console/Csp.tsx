/**
 * Content Security Policy tab.
 *
 * Three sub-sections mirroring the PaaS navigation (`csp-settings`, `csp-source`,
 * `csp-sandbox`), which map onto the three things a CSP is made of here:
 * how the policy behaves, which domains are permitted, and what the sandbox
 * restricts.
 */

import { useState } from 'react';

import type { ConfigDocument } from '../../shared/config.js';
import { CspSettings } from './CspSettings.js';
import { CspSources } from './CspSources.js';
import { CspSandbox } from './CspSandbox.js';
import { Group } from '@optiaxiom/react';

import { Notice, SubNav } from './ui.js';

type CspTab = 'settings' | 'sources' | 'sandbox';

const TABS: ReadonlyArray<{ id: CspTab; label: string }> = [
  { id: 'settings', label: 'Settings' },
  { id: 'sources', label: 'Sources' },
  { id: 'sandbox', label: 'Sandbox' }
];

export function Csp({
  config,
  onChange
}: {
  config: ConfigDocument;
  onChange: (mutate: (current: ConfigDocument) => ConfigDocument) => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<CspTab>('settings');

  return (
    <Group flexDirection="column" gap="16">
      <SubNav tabs={TABS} current={tab} onSelect={setTab} />

      {!config.settings.isEnabled && (
        <Notice intent="neutral">
          The Content Security Policy is disabled, so none of this is emitted. Enable it under{' '}
          <strong>Settings</strong> when you are ready.
        </Notice>
      )}

      {tab === 'settings' && <CspSettings config={config} onChange={onChange} />}
      {tab === 'sources' && <CspSources config={config} onChange={onChange} />}
      {tab === 'sandbox' && <CspSandbox config={config} onChange={onChange} />}
    </Group>
  );
}
