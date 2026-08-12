# Opal Interactions

- [interaction decorator](#interaction-decorator)
- [InteractionResult](#interactionresult)
- [Pattern 1 — Proteus action flow](#pattern-1--proteus-action-flow)
- [Pattern 2 — InteractionResult from @tool](#pattern-2--interactionresult-from-tool)
- [Common mistakes](#common-mistakes)

`@interaction` registers a handler triggered when the user clicks a button in a Proteus card. `InteractionResult` is the value it returns — and can also be returned directly from a `@tool` for a soft conversational message.

## interaction decorator

```typescript
@interaction({
  name: 'execute',                       // programmatic identifier
  endpoint: '/interactions/execute',     // Proteus card clicks always route here
})
public async handleInteraction(
  data: { interaction_name?: string; name?: string; parameters?: Record<string, unknown> },
  authData: OptiIdAuthData              // always passed as second argument — guaranteed by the framework
): Promise<InteractionResult> {
  // ...
}
```

```typescript
interface InteractionConfig {
  name: string;
  endpoint: string;
}
```

**Auth** — interactions always require OptiID auth. Auth data is passed as the second argument and is guaranteed by the framework before the handler is called.

**app.yml** — no extra config needed; interactions share the same function entry point as tools.

---

## InteractionResult

```typescript
class InteractionResult {
  constructor(
    public message: string,               // shown to user after the interaction completes
    public link?: string,                 // optional URL — shown as a link in the response
    public dispatch_event?: boolean,      // true = signal frontend to re-render the Proteus card
    public interactions?: unknown,        // @deprecated — only chains Island UI (deprecated)
    public data?: Record<string, unknown> // inner data object — re-renders the Proteus card
  ) {}
}
```

Common usages:
```typescript
// Simple message
return new InteractionResult('Created successfully');

// With a link
return new InteractionResult('Export ready', 'https://example.com/export.csv');

// Re-render the Proteus card in place — dispatch_event: true signals the frontend
// to re-render. Pass the inner data object, not the { data, message } envelope.
const { data } = buildCardPayload(updatedItems);
return new InteractionResult('Updated.', undefined, true, undefined, data);
```

---

## Pattern 1 — Proteus action flow

`@tool` returns plain `{ data, message }` rendered by a `@resource` Proteus card. Buttons in the card use `onClick: { interaction: "name" }` to trigger `@interaction`.

**Use when:** the UI is rendered via `@resource` and buttons need to trigger server-side actions.

**Critical:** Opal always routes Proteus card button clicks to the fixed endpoint `/interactions/execute` — regardless of the interaction name in `onClick`. The name is passed in the request body as `interaction_name`. Always register your handler at `/interactions/execute` and dispatch internally by name.

```typescript
import { tool, interaction, resource, InteractionResult, OptiIdAuthData } from '@optimizely-opal/opal-tool-ocp-sdk';
import { logger } from '@zaiusinc/app-sdk';

export class ReportsTool {
  @tool({
    name: 'run_report',
    endpoint: '/tools/run_report',
    uiResource: 'ui://my-app/report',
    authRequirements: [{ provider: 'OptiID', scopeBundle: 'default', required: true }],
    parameters: [],
  })
  public async runReport() { return { data: await fetchReport(), message: 'Report ready' }; }

  // ALL Proteus card interactions go to /interactions/execute — dispatch by interaction_name
  @interaction({ name: 'execute', endpoint: '/interactions/execute' })
  public async handleInteraction(
    data: { interaction_name?: string; name?: string; parameters?: Record<string, unknown> },
    _authData: OptiIdAuthData,
  ): Promise<InteractionResult> {
    const action = data?.name ?? data?.interaction_name ?? '';
    const params = data?.parameters ?? {};

    try {
      if (action === 'export_report') {
        const reportId = (params as any).reportId ?? '';  // passed via onClick params
        const uri = await buildExportUri(reportId);
        return new InteractionResult('Export ready to download.', uri);
      }
      if (action === 'send_report') {
        await sendReport();
        return new InteractionResult('Report sent successfully.');
      }
      return new InteractionResult(`Unknown action: ${action}`);
    } catch (error) {
      logger.error('[handleInteraction] error:', error);
      return new InteractionResult(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  @resource({ uri: 'ui://my-app/report', name: 'report', description: '...', mimeType: 'application/vnd.opal.proteus+json' })
  public async reportResource(): Promise<string> {
    return JSON.stringify({
      $type: 'Document', appName: 'My App',
      body: [{ $type: 'Text', children: { $type: 'Value', path: '/data/summary' } }],
      actions: {
        $type: 'Group', flexDirection: 'row', gap: '4',
        children: [
          {
            $type: 'Action', children: 'Export',
            onClick: {
              interaction: 'export_report',
              params: { reportId: { $type: 'Value', path: '/data/reportId' } },
            },
          },
          { $type: 'Action', children: 'Send', onClick: { interaction: 'send_report' } },
        ],
      },
    });
  }
}
```

---

## Pattern 2 — InteractionResult from @tool

A `@tool` method can return `InteractionResult` directly (without any `@interaction`) to surface a conversational message when `ToolError` would be too heavy.

**Use when:** the input is structurally valid but the combination doesn't make sense in context — you want Opal to present a plain explanation rather than trigger error-handling behavior.

```typescript
@tool(createAudienceConfig)
public async createAudience(params: CreateAudienceParams): Promise<CreateAudienceResponse | InteractionResult> {
  // Soft messages for combinations that don't make sense in context — not technical errors.
  // Which fields are required depends on the chosen type, so these are returned, not thrown.
  if (params.type === 'realtime' && (!params.id || !params.definition)) {
    return new InteractionResult('For realtime audiences, id and definition are required.');
  }
  if (params.type === 'standard' && (!params.display_name || !params.definition)) {
    return new InteractionResult('For standard audiences, display_name and definition are required.');
  }

  // Genuine technical failures still throw ToolError (API errors, auth, etc.)
  return api.createAudience(params);
}
```

**`InteractionResult` vs `ToolError`** — return `InteractionResult` for conditional/combination param checks where the input is valid in shape but doesn't fit the requested operation. Throw `ToolError` only for hard failures: API errors, missing auth, unrecoverable problems. (Unconditional required params declared with `required: true` are enforced by the SDK before the method runs, so you rarely check those by hand.)

---

## Common mistakes

**`InteractionResult.data` must be the inner data object, not the `{ data, message }` envelope** — passing the envelope double-wraps it (`/data/data/...`) and the card renders blank. Pass `payload.data`, not `payload`.

**@interaction does not declare parameters in its config** — `InteractionConfig` only accepts `name` and `endpoint`. The handler still receives data dynamically; do not add a `parameters` field to the config.

**Interaction errors should return InteractionResult, not throw** — catch errors and return a message so the user sees feedback. Always log first:
```typescript
} catch (error) {
  logger.error('[handlerName] error:', error);
  return new InteractionResult(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
}
```
