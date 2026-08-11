/**
 * Sandbox directive.
 *
 * Ported from `CSP/SandboxSettings.jsx`. The flag list is derived from
 * `SANDBOX_TOKENS` in shared constants rather than restated, so the editor and
 * the engine cannot drift apart — adding a token there makes it appear here.
 */

import { Grid, Group, Switch } from '@optiaxiom/react';

import type { ConfigDocument, SandboxConfig } from '../../shared/config.js';
import { SANDBOX_TOKENS } from '../../shared/constants.js';
import { Notice, Preview, Section } from './ui.js';

/**
 * Plain-language descriptions. Keyed by token so an unlabelled token still
 * renders (falling back to the raw token) rather than disappearing.
 */
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  'allow-downloads': 'Allow files to be downloaded',
  'allow-downloads-without-user-activation': 'Allow downloads without a user gesture',
  'allow-forms': 'Allow form submission',
  'allow-modals': 'Allow modal dialogs such as alert() and print()',
  'allow-orientation-lock': 'Allow locking screen orientation',
  'allow-pointer-lock': 'Allow the Pointer Lock API',
  'allow-popups': 'Allow popups such as window.open() and target="_blank"',
  'allow-popups-to-escape-sandbox': 'Allow popups to open without inheriting the sandbox',
  'allow-presentation': 'Allow starting a presentation session',
  'allow-same-origin': 'Treat content as same-origin rather than a unique origin',
  'allow-scripts': 'Allow scripts to run',
  'allow-storage-access-by-user-activation': 'Allow requesting storage access',
  'allow-top-navigation': 'Allow navigating the top-level browsing context',
  'allow-top-navigation-by-user-activation': 'Allow top-level navigation after a user gesture',
  'allow-top-navigation-to-custom-protocols': 'Allow top-level navigation to custom protocols'
};

export function CspSandbox({
  config,
  onChange
}: {
  config: ConfigDocument;
  onChange: (mutate: (current: ConfigDocument) => ConfigDocument) => void;
}): React.JSX.Element {
  const { sandbox, settings } = config;

  const set = (patch: Partial<SandboxConfig>): void =>
    onChange((current) => ({ ...current, sandbox: { ...current.sandbox, ...patch } }));

  const enabledTokens = SANDBOX_TOKENS.filter(([flag]) => sandbox[flag] === true).map(
    ([, token]) => token
  );

  // The engine suppresses sandbox in report-only mode, because browsers ignore
  // it there — say so rather than letting an editor configure something inert.
  const suppressedByReportOnly = settings.isEnabled && settings.isReportOnly;

  return (
    <Group flexDirection="column" gap="20">
      <Section
        title="Sandbox"
        description={
          'Applies iframe-style restrictions to your own pages. Everything is denied ' +
          'unless explicitly allowed, so enabling the sandbox without any permissions ' +
          'is highly restrictive.'
        }
      >
        <Switch
          checked={sandbox.isSandboxEnabled}
          onCheckedChange={(isSandboxEnabled) => set({ isSandboxEnabled })}
        >
          Enable sandbox
        </Switch>

        {suppressedByReportOnly && sandbox.isSandboxEnabled && (
          <Notice intent="warning" title="Not emitted while the policy is report-only.">
            Browsers ignore a sandbox directive in a report-only policy, so it is left out
            rather than taking up header space.
          </Notice>
        )}
      </Section>

      {sandbox.isSandboxEnabled && (
        <>
          <Section title="Permissions">
            <Grid gap="8" gridTemplateColumns="2">
              {SANDBOX_TOKENS.map(([flag, token]) => (
                <Switch
                  key={token}
                  checked={sandbox[flag] === true}
                  description={DESCRIPTIONS[token] ?? token}
                  onCheckedChange={(next) => set({ [flag]: next })}
                >
                  {token}
                </Switch>
              ))}
            </Grid>
          </Section>

          <Section title="Preview">
            <Preview>
              {suppressedByReportOnly
                ? 'Not emitted — the policy is report-only.'
                : `sandbox${enabledTokens.length > 0 ? ` ${enabledTokens.join(' ')}` : ''};`}
            </Preview>
          </Section>
        </>
      )}
    </Group>
  );
}
