# Backend proxy function

CMS UI extensions run in the browser, so they must not hold secrets or call third-party APIs directly. Instead the extension calls a **backend function** in the same OCP app via `context.extension.invokeFunction(...)`. That function is an ordinary `App.Function` marked so extensions may invoke it.

## Declaring the function in `app.yml`

```yaml
functions:
  cms_extension:
    entry_point: CmsUiExtension
    description: Backend proxy for the extensions.
    accepts: cms_ui_extension        # <-- makes it invocable from a CMS UI extension
```

`accepts: cms_ui_extension` is the key line — it authorizes the extension→function call path.

## Implementing the function

The function is a normal `App.Function` (from `@zaiusinc/app-sdk`). It reads the JSON body the extension sent, does the privileged work (external HTTP, secret access), and returns a response. A small `action` + `params` envelope keeps one function serving multiple extension operations.

```ts
import * as App from '@zaiusinc/app-sdk';
import {logger, storage} from '@zaiusinc/app-sdk';

interface RequestBody { action?: unknown; params?: unknown; }

type Envelope<T> =
  | {ok: true; result: T}
  | {ok: false; error: string; message?: string};

export class CmsUiExtension extends App.Function {
  public async perform(): Promise<App.Response> {
    const body = (this.request.bodyJSON ?? {}) as RequestBody;
    const action = typeof body.action === 'string' ? body.action : '';
    const params = (body.params ?? {}) as Record<string, unknown>;

    // Secrets live here — never in the browser bundle.
    const credentials = await storage.settings.get<{accessKey?: string}>('credentials');
    const accessKey = credentials.accessKey?.trim() || process.env.APP_ENV_MY_KEY?.trim();
    if (!accessKey) {
      return new App.Response(400, {ok: false, error: 'missing_access_key'});
    }

    switch (action) {
      case 'search': {
        // ... call external API using accessKey, map errors to status codes ...
        return new App.Response(200, {ok: true, result: /* … */ {}});
      }
      default:
        return new App.Response(400, {ok: false, error: 'unknown_action', message: action});
    }
  }
}
```

## Calling it from the extension

```tsx
const response = await context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, {
  action: 'search',
  params: {query: 'mountains', page: 1, perPage: 30}
});
// response.statusCode, response.data (your Envelope<T>)
```

## Conventions that work well

- **Envelope the response** (`{ok, result}` / `{ok, error, message}`) so the frontend can branch cleanly and surface actionable messages.
- **Map upstream failures to HTTP status codes** (e.g. `429` for rate-limited, `502` for upstream failure) and also carry a machine-readable `error` code in the body.
- **Resolve secrets from settings first, env second** — settings (`storage.settings`) for per-account configuration, `APP_ENV_*` as a fallback/default.
- **Keep one proxy function** per app for CMS UI extensions and switch on `action`, rather than one function per operation — simpler to wire and authorize.
- **Honor any third-party API usage requirements** on the backend (e.g. download/attribution pings) rather than from the browser.

For the general `App.Function` API (request, response, storage, logging), use the `ocp-app-development` skill.
