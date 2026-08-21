/**
 * The Stott Security console — a full-page (`view`) CMS UI extension.
 *
 * `register()` must be called exactly once, at module top level — never inside a
 * component or an effect.
 *
 * Navigation is in-app view state rather than routing: a `view` extension is a
 * single mounted bundle, and the PaaS app's `hashchange` router has no host to
 * cooperate with here.
 */

import { useEffect, useMemo, useState } from 'react';

import { register, type ExtensionContext } from '@optimizely/cms-extensibility-sdk';

import type { Scope } from '../shared/contracts.js';
import { useSecurityConfig } from './console/useSecurityConfig.js';
import { DiagnosticsPanel } from './console/DiagnosticsPanel.js';
import { ResponseHeaders } from './console/ResponseHeaders.js';
import { Csp } from './console/Csp.js';
import { PermissionPolicy } from './console/PermissionPolicy.js';
import { HeaderPreview } from './console/HeaderPreview.js';
import { Tools } from './console/Tools.js';
import {
  AxiomProvider,
  Badge,
  Button,
  Group,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text
} from '@optiaxiom/react';

import { Notice } from './console/ui.js';

type Tab = 'headers' | 'csp' | 'permissions' | 'preview' | 'tools';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'headers', label: 'Response headers' },
  { id: 'csp', label: 'Content Security Policy' },
  { id: 'permissions', label: 'Permissions Policy' },
  { id: 'preview', label: 'Preview' },
  { id: 'tools', label: 'Tools' }
];

function SecurityConsole({ context }: { context: ExtensionContext }): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('headers');

  // This build has one scope, the global one. Per-app and per-host configuration
  // is a PaaS feature backed by a relational database; here there is key-value
  // storage and no application registry an extension could enumerate to populate
  // a switcher. The storage keys and fallback chain carry the scope shape so it
  // can be added without migrating documents, but nothing writes a narrower one.
  const scope = useMemo<Scope>(() => ({}), []);

  // Publish attribution. The extension context carries no user identity, so
  // this is a fixed label rather than a name — the alternative is asking the
  // backend to invent one, which would be worse than an honest placeholder.
  const state = useSecurityConfig(context, scope, 'cms-editor');

  useEffect(() => {
    void context.extension.setReady();
  }, [context]);

  if (state.loading) {
    return (
      <Shell>
        <Text>Loading…</Text>
      </Shell>
    );
  }

  if (!state.config) {
    return (
      <Shell>
        <Notice intent="danger">{state.error ?? 'Configuration could not be loaded.'}</Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* No title of our own — the CMS extension chrome already shows one, and
          repeating it spends the most valuable row on the page saying nothing.
          The publish state takes that space instead.

          Sticky, because this row carries the only two actions in the console
          and the lists below it are long — 48 permissions policy cards, or a
          site's worth of CSP sources. Scrolled twenty cards down, an editor
          would otherwise have to scroll back to the top to save, which is how
          unsaved work gets lost.

          `position`, `top` and `zIndex` are inline because `Group` exposes no
          sprinkle for any of them. That is within the house rule: inline styles
          are for one-off layout with no token, and the reason to avoid them —
          they cannot express `:hover`, `:focus-visible` or `:disabled` — does
          not apply to positioning.

          `bg.page` rather than `bg.default`: it is the token Axiom paints
          page-level surfaces with, so the row matches the body instead of
          sitting on it as a white band. The background is load-bearing rather
          than decoration — without one the cards would show straight through
          the row as they scrolled under it. Matching the body then leaves no
          edge at all, which reads as text being clipped mid-glyph, so
          `shadow` supplies one. */}
      <Group
        gap="16"
        alignItems="center"
        flexWrap="wrap"
        bg="bg.page"
        shadow="sm"
        py="12"
        style={{ position: 'sticky', top: 0, zIndex: 10 }}
      >
        {state.publishedAt && (
          <Text color="fg.tertiary">
            Live since {new Date(state.publishedAt).toLocaleString('en-GB')}
            {state.publishedBy ? ` — published by ${state.publishedBy}` : ''}
          </Text>
        )}

        {/* ml="auto" rather than justifyContent="space-between": the status text
            is conditional, and space-between would swing the actions across to
            the left whenever nothing has been published yet. */}
        <Group alignItems="center" gap="12" ml="auto">
          {state.hasUnpublishedChanges && (
            <Badge intent="warning">Unpublished changes</Badge>
          )}

          <Button onClick={() => void state.save()} disabled={!state.dirty || state.saving}>
            {state.saving ? 'Saving…' : 'Save draft'}
          </Button>

          {/* Publishing is the only action that changes the live site. */}
          <Button
            appearance="primary"
            onClick={() => void state.publish()}
            disabled={state.publishing || state.dirty}
            title={state.dirty ? 'Save your draft before publishing' : 'Make the draft live'}
          >
            {state.publishing ? 'Publishing…' : 'Publish'}
          </Button>
        </Group>
      </Group>

      {state.error && <Notice intent="danger">{state.error}</Notice>}

      {state.notice && <Notice intent="success">{state.notice}</Notice>}

      <DiagnosticsPanel diagnostics={state.diagnostics} />

      <Tabs value={tab} onValueChange={(value: string) => setTab(value as Tab)}>
        <TabsList>
          {TABS.map((entry) => (
            <TabsTrigger key={entry.id} value={entry.id}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="headers" mt="16">
          <ResponseHeaders config={state.config} rows={state.rows} onChange={state.update} />
        </TabsContent>

        <TabsContent value="csp" mt="16">
          <Csp config={state.config} onChange={state.update} />
        </TabsContent>

        <TabsContent value="permissions" mt="16">
          <PermissionPolicy config={state.config} onChange={state.update} />
        </TabsContent>

        <TabsContent value="preview" mt="16">
          <HeaderPreview
            client={state.client}
            liveHeaders={state.liveHeaders}
            pendingHeaders={state.pendingHeaders}
            hasUnpublishedChanges={state.hasUnpublishedChanges}
            dirty={state.dirty}
          />
        </TabsContent>

        <TabsContent value="tools" mt="16">
          <Tools
            dirty={state.dirty}
            exportDocument={state.exportDocument}
            importDocument={state.importDocument}
            importing={state.importing}
          />
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  // AxiomProvider supplies the design tokens and theming every Axiom component
  // reads from; without it they render unstyled.
  return (
    <AxiomProvider>
      <Group flexDirection="column" asChild gap="16" p="24" alignItems="stretch">
        <main>{children}</main>
      </Group>
    </AxiomProvider>
  );
}

register((context) => <SecurityConsole context={context} />);
