/**
 * Global CSP settings.
 *
 * Ported from the PaaS `CSP/EditSettings.jsx`, minus what SaaS omits.
 *
 * **Nonce and strict-dynamic are not here.** They are configured as *sources* on
 * the Sources tab (`'nonce-random'`, `'strict-dynamic'`), granted to directives
 * like any other source. The `IsNonceEnabled` / `IsStrictDynamicEnabled` booleans
 * that still exist in PaaS are legacy — `MigrationRepository` reads them only to
 * remap old exports onto sources, and nothing in the compile path consults them.
 *
 * The agency allow list is also omitted: it needed an outbound fetch from an OCP
 * function and could only refresh on publish.
 */

import { Box, Field, Group, Input, Switch } from '@optiaxiom/react';

import type { ConfigDocument, CspSettingsConfig } from '../../shared/config.js';
import { Section } from './ui.js';

export function CspSettings({
  config,
  onChange
}: {
  config: ConfigDocument;
  onChange: (mutate: (current: ConfigDocument) => ConfigDocument) => void;
}): React.JSX.Element {
  const { settings } = config;

  const set = (patch: Partial<CspSettingsConfig>): void =>
    onChange((current) => ({ ...current, settings: { ...current.settings, ...patch } }));

  return (
    <Group flexDirection="column" gap="24">
      <Section
        title="Policy"
        description="Nothing is emitted until the policy is enabled and published."
      >
        <Switch
          checked={settings.isEnabled}
          onCheckedChange={(isEnabled) => set({ isEnabled })}
          description="When off, no CSP header is produced at all."
        >
            Enable Content Security Policy
        </Switch>

        <Switch
          checked={settings.isReportOnly}
          disabled={!settings.isEnabled}
          onCheckedChange={(isReportOnly) => set({ isReportOnly })}
          description={
            'Emits Content-Security-Policy-Report-Only. Violations are reported but ' +
            'nothing is blocked — use this to trial a policy safely.'
          }
        >
            Report only
        </Switch>

        <Switch
          checked={settings.isUpgradeInsecureRequestsEnabled}
          disabled={!settings.isEnabled}
          onCheckedChange={(isUpgradeInsecureRequestsEnabled) => set({ isUpgradeInsecureRequestsEnabled })}
          description="Rewrites http:// subresource requests to https:// before fetching them."
        >
            Upgrade insecure requests
        </Switch>
      </Section>

      <Section
        title="Violation reporting"
        description={
          'Browsers post violation reports directly to the collector. This app neither ' +
          'receives nor stores them.'
        }
      >
        <Switch
          checked={settings.useExternalReporting}
          onCheckedChange={(useExternalReporting) => set({ useExternalReporting })}
        >
            Send violation reports to an external collector
        </Switch>

        {settings.useExternalReporting && (
          <Box maxW="lg">
            <Field
              label="Collector URL"
              description={
                'Must be an absolute https:// URL — browsers will not post reports to ' +
                'plain HTTP from an HTTPS page.'
              }
            >
              <Input
                type="url"
                value={settings.externalReportToUrl}
                placeholder="https://example.report-uri.com/r/d/csp/enforce"
                onChange={(event) => set({ externalReportToUrl: event.target.value })}
              />
            </Field>
          </Box>
        )}
      </Section>

    </Group>
  );
}
