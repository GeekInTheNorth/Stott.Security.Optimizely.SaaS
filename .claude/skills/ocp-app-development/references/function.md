# Functions

- [App.Function](#appfunction)
- [App.GlobalFunction](#appglobalfunction)
- [Request](#request)
- [Response](#response)
- [Installation Resolution](#installation-resolution)
- [Functions API](#functions-api)
- [Common mistakes](#common-mistakes)

A function in OCP is a webhook listener — it receives inbound requests triggered by external events. Use `App.Function` when the provider supports registering a webhook URL per installation (each account gets its own URL and full execution context). Use `App.GlobalFunction` when the provider only supports a single webhook URL — it executes without an installation context and is typically used to route incoming requests to the correct installation endpoint.

## App.Function

### Example

```typescript
import * as App from '@zaiusinc/app-sdk';
import { logger } from '@zaiusinc/app-sdk';

export class MyWebhook extends App.Function {
  public constructor(request: App.Request) {
    super(request);
  }

  public async perform(): Promise<App.Response> {
    logger.info('received webhook');

    const body = this.request.bodyJSON;  // parsed JSON body, null if empty
    if (!body) {
      return new App.Response(400, { error: 'No body' });
    }

    // ... process ...

    return new App.Response(200, { success: true });
  }
}
```

**app.yml:**
```yaml
functions:
  my_webhook:
    entry_point: MyWebhook
    description: Handles webhooks from ExternalService
```

### Accessing installation context

Call `getAppContext()` only when the handler needs the account or installation context.

```typescript
import * as App from '@zaiusinc/app-sdk';
import { getAppContext } from '@zaiusinc/app-sdk';

export class MyWebhook extends App.Function {
  public async perform(): Promise<App.Response> {
    const { trackerId, installId } = getAppContext();
    // ... use trackerId / installId ...
    return new App.Response(200);
  }
}
```

## App.GlobalFunction

### Example

```typescript
import * as App from '@zaiusinc/app-sdk';
import { storage, functions } from '@zaiusinc/app-sdk';

export class MyGlobalFn extends App.GlobalFunction {
  public constructor(request: App.Request) {
    super(request);
  }

  public async perform(): Promise<App.Response> {
    const trackerId = this.request.params['tracker_id'] as string;
    if (!trackerId) {
      return new App.Response(400, { error: 'Missing tracker_id' });
    }

    const { installId } = await storage.sharedKvStore.get<{ installId: number }>(trackerId);
    if (!installId) {
      return new App.Response(404, { error: 'No installation found' });
    }

    const endpoints = await functions.getEndpoints(installId);
    const response = await fetch(endpoints['my_webhook'], {
      method: this.request.method,
      body: JSON.stringify(this.request.bodyJSON),
      headers: { 'content-type': 'application/json' },
    });

    return new App.Response(response.status);
  }
}
```

**app.yml:**
```yaml
functions:
  my_global_fn:
    entry_point: MyGlobalFn
    description: Routes incoming webhooks to the correct installation
    global: true
```

Global functions have no installation context — only `storage.sharedKvStore` is accessible.

## Request

| Property | Type | Description |
| --- | --- | --- |
| `this.request.method` | `string` | HTTP method (`GET`, `POST`, etc.) |
| `this.request.path` | `string` | Request path |
| `this.request.params` | `QueryParams` | Query string parameters — `params['key']` |
| `this.request.headers` | `Headers` | Request headers — `headers.get('x-signature')` |
| `this.request.bodyJSON` | `any` | Parsed JSON body; `null` if body is empty |
| `this.request.body` | `Uint8Array` | Raw body bytes |
| `this.request.contentType` | `string \| null` | Content-Type header value (without parameters) |

## Response

```typescript
new App.Response(status)              // status only
new App.Response(status, bodyJSON)    // status + JSON body (sets content-type: application/json)
```

**Critical:** status is the **first** argument, body is the **second**. This is the opposite of the web standard `Response` constructor. Using `new App.Response(body, status)` compiles without error but returns a broken response.

## Installation Resolution

Some external providers only support a single webhook URL across all accounts. `installation_resolution` tells the platform how to extract the account's **public API key** (tracker ID) from the incoming request so the function executes with the correct per-installation context.

Declare it in `app.yml` on the function:

```yaml
functions:
  my_webhook:
    entry_point: MyWebhook
    description: Handles webhooks from ExternalService
    installation_resolution:
      type: JSON_BODY_FIELD
      key: "$.api_key"
```

| `type` | `key` | Resolves from |
| --- | --- | --- |
| `HEADER` | header name | An HTTP request header — e.g. `x-ocp-api-key: <trackerId>` |
| `QUERY_PARAM` | parameter name | A URL query parameter — e.g. `?apiKey=<trackerId>` |
| `JSON_BODY_FIELD` | JSONPath expression | A field in the JSON request body — e.g. `"$.apiKey"` → `{"apiKey": "<trackerId>"}` |

**Constraints:**
- The value extracted from the request must be the account's **public API key** (tracker ID)
- Cannot be used on global functions
- For `JSON_BODY_FIELD`, every request must include `Content-Type: application/json` and the `key` must be a valid JSONPath (RFC 9535) expression

### Example

The external system sends all events to one URL and includes the account's tracker ID in the `X-Api-Key` header. No global function is needed — the platform resolves the correct installation from the header automatically.

**`app.yml`:**

```yaml
functions:
  event_handler:
    entry_point: EventHandler
    description: Handles events from ExternalService
    installation_resolution:
      type: HEADER
      key: X-Api-Key
```

**Function runs with the correct installation context:**

```typescript
// src/functions/EventHandler.ts
import * as App from '@zaiusinc/app-sdk';
import { storage } from '@zaiusinc/app-sdk';
import { odp } from '@zaiusinc/node-sdk';

export class EventHandler extends App.Function {
  public async perform(): Promise<App.Response> {
    const payload = this.request.bodyJSON;

    // Platform resolved the installation from X-Api-Key before calling perform() —
    // storage and ODP calls are scoped to the correct account automatically.
    const config = await storage.settings.get<{ api_key: string }>('config');
    await odp.event(payload);

    return new App.Response(200, 'OK');
  }
}
```

## Functions API

`functions` from `@zaiusinc/app-sdk` resolves webhook URLs for any installation of this app. Import and use it inside any function or job.

```typescript
import { functions } from '@zaiusinc/app-sdk';
```

| Method                                 | Returns                               | Description                                                                                                                                                                                       |
|----------------------------------------|---------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `functions.getEndpoints(installId?)`   | `Promise<{ [name: string]: string }>` | Webhook URLs for all functions of an installation. When called from a non-global function, `installId` defaults to the current installation. **From a global function, `installId` is required.** |
| `functions.getGlobalEndpoints()`       | `Promise<{ [name: string]: string }>` | URLs for all global functions of this app                                                                                                                                                         |
| `functions.getAuthorizationGrantUrl()` | `string`                              | The OAuth authorization grant redirect URL for the current installation                                                                                                                           |

The returned objects map function name (as declared in `app.yml`) to its full URL with no trailing slash.

**Typical use — registering the webhook URL with an external service during install:**

```typescript
import { functions } from '@zaiusinc/app-sdk';

// Inside onInstall — get this installation's webhook URL and register it externally
const endpoints = await functions.getEndpoints();
const webhookUrl = endpoints['my_webhook'];
await registerWithExternalService(webhookUrl);
```

**From a global function — routing to the correct installation:**

```typescript
const endpoints = await functions.getEndpoints(installId);
await fetch(endpoints['my_webhook'], { method: 'POST', body: JSON.stringify(payload) });
```

## Common mistakes

| Mistake                                                 | Fix                                                             |
|---------------------------------------------------------|-----------------------------------------------------------------|
| `new App.Response(body, status)`                        | `new App.Response(status, body)` — status is first              |
| `new Response(200, {...})`                              | Must use `App.Response`, not the web standard `Response`        |
| Defining a constructor without calling `super(request)` | Always pass `request` to `super()` when declaring a constructor |
