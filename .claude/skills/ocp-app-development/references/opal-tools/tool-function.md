# Opal Tool Functions

- [ToolFunction vs GlobalToolFunction](#toolfunction-vs-globaltoolfunction)
- [app.yml entry point](#appyml-entry-point)
- [Registering tools via decorators](#registering-tools-via-decorators)
- [ready()](#ready)
- [customizeAuthRequirements()](#customizeauthrequirements)

## ToolFunction vs GlobalToolFunction

|                  | `ToolFunction`                                                 | `GlobalToolFunction`                              |
|------------------|----------------------------------------------------------------|---------------------------------------------------|
| Extends          | `App.Function`                                                 | `App.GlobalFunction`                              |
| Context          | Per-installation — has `trackerId` and `installId`             | Global — no installation context                  |
| Settings storage | `storage.settings`, `storage.kvStore`, `storage.sharedKvStore` | `storage.sharedKvStore` only                      |
| Use when         | Each customer installs the app and has their own credentials   | Tools don't need per-account credentials or state |

```typescript
import { ToolFunction } from '@optimizely-opal/opal-tool-ocp-sdk';
import './index'; // triggers @tool decorator registration

export class MyServiceClient extends ToolFunction {
  // Empty — tools are registered via @tool decorators in imported classes
}
```

```typescript
import { GlobalToolFunction } from '@optimizely-opal/opal-tool-ocp-sdk';
import './index';

export class MyServiceGlobalClient extends GlobalToolFunction {
  // Empty — tools are registered via @tool decorators in imported classes
}
```

**Do not override `perform()`** — it is implemented by the base class and handles routing, auth, and logging. All tool logic lives in `@tool`-decorated methods.

## app.yml entry point

```yaml
functions:
  opal_tool:
    entry_point: MyServiceClient
    description: My service tool for Opal
    opal_tool: true   # required — marks this function as an Opal tool
```

For a global tool:

```yaml
functions:
  opal_tool:
    entry_point: MyServiceGlobalClient
    description: My service global tool for Opal
    global: true
    opal_tool: true   # required — marks this function as an Opal tool
```

## Registering tools via decorators

Tools are registered automatically when their class files are imported. Three files work together:

```typescript
// src/functions/MyServiceClient.ts — entry point, declared in app.yml
import { ToolFunction } from '@optimizely-opal/opal-tool-ocp-sdk';
import './index'; // side-effect import — triggers ALL @tool/@interaction/@resource registrations

export class MyServiceClient extends ToolFunction {}
```

```typescript
// src/functions/index.ts — re-exports all tool classes to trigger their decorators
export * from './Users/UsersTool';
export * from './Reports/ReportsTool';
```

```typescript
// src/functions/Users/UsersTool.ts — @tool, @interaction, @resource can all live here
import { tool } from '@optimizely-opal/opal-tool-ocp-sdk';

export class UsersTool {
  @tool({ name: 'get_user', description: '...', endpoint: '/tools/get_user', parameters: [] })
  public async getUser(params: GetUserParams) { ... }
}
```

`import './index'` is a **side-effect import** — it exists only to cause all decorator registrations to run. Without it, no tools will be available even if the classes exist.

## ready()

Override `ready()` to validate that required credentials or configuration exist before Opal calls any tools. Opal calls `/ready` before using the tool.

```typescript
import { ToolFunction, ReadyResponse } from '@optimizely-opal/opal-tool-ocp-sdk';
import { storage } from '@zaiusinc/app-sdk';

export class MyServiceClient extends ToolFunction {
  protected async ready(): Promise<ReadyResponse | boolean> {
    const auth = await storage.settings.get('authentication');
    if (!auth?.api_key) {
      return { ready: false, reason: 'API key not configured. Please complete the settings form.' };
    }
    return { ready: true };
  }
}
```

Return type is `Promise<ReadyResponse | boolean>`:

```typescript
export interface ReadyResponse {
  ready: boolean;
  reason?: string; // shown to user when ready: false
}
```

## customizeAuthRequirements()

The framework calls this automatically when Opal hits the `/discovery` endpoint to fetch available tools and their auth requirements. Override it in the entry point class to dynamically rewrite provider names — used for instance-level OAuth where each customer configures a different OAuth provider. See [tool.md](tool.md) for the `AuthRequirementConfig` interface and default OptiID behaviour.

```typescript
import { ToolFunction, AuthRequirement } from '@optimizely-opal/opal-tool-ocp-sdk';
import { storage } from '@zaiusinc/app-sdk';

export class MyServiceClient extends ToolFunction {
  public async customizeAuthRequirements(
    authRequirements: AuthRequirement[]
  ): Promise<AuthRequirement[]> {
    const settings = await storage.settings.get<{ oauth_provider: string }>('authentication');
    const providerName = settings?.oauth_provider;

    if (providerName) {
      return AuthRequirement.updateProvider(authRequirements, providerName);
    }

    return authRequirements;
  }
}
```

`AuthRequirement.updateProvider()` is a convenience helper — equivalent to:
```typescript
authRequirements.map(req =>
  new AuthRequirement(providerName, req.scopeBundle, req.required, req.message, req.scopeBundleId)
)
```
Use `.map()` directly when you need to conditionally update only some requirements:

```typescript
const settings = await storage.settings.get<{ provider_id: string }>('ga_settings');
const providerName = settings?.provider_id ?? 'google';

// Rename only analytics-scoped requirements, leave others unchanged
return authRequirements.map(req =>
  req.scopeBundle === 'analytics'
    ? new AuthRequirement(providerName, req.scopeBundle, req.required, req.message, req.scopeBundleId)
    : req
);
```

**Never return fewer requirements than you received** — always `.map()` over the full array. Using `.filter()` removes requirements entirely, which silently drops the default OptiID requirement and breaks auth for those tools.
