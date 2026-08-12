# CMS UI Extensions — overview

CMS UI Extensions let an OCP app render custom UI **inside Optimizely CMS (SaaS)**. The app ships browser code that CMS loads and mounts at a designated surface (an *injection point*), plus optional backend functions the extension calls for data or secrets.

Use this when a request involves rendering app UI inside CMS — anything touching `ui_extensions` in `app.yml`, `*.sidebar.tsx` / `*.view.tsx` entry files, or extension-to-backend calls. For the rest of app development (functions, jobs, data sync, Opal tools, lifecycle), use the corresponding references in this skill.

## The model in one picture

```
Optimizely CMS (host)                     OCP app
┌───────────────────────────┐            ┌────────────────────────────────────┐
│ mounts the extension bundle│  loads .js │ dist/cms-ui-extensions/<Entry>.js   │
│ at an injection point      │◀───────────│  (built from src/.../<Entry>.view.tsx│
│ (sidebar / view)           │            │   with @optimizely/cms-extensibility│
│                            │            │   -sdk `register(...)`)             │
│ calls extension bundle URL │            │                                     │
│ from the Discovery API     │            │ backend function (accepts:          │
│                            │  invoke    │  cms_ui_extension) — proxies to     │
│ extension → backend        │───────────▶│  external APIs, holds secrets       │
└───────────────────────────┘            └────────────────────────────────────┘
```

- The **frontend** is a React bundle authored with `@optimizely/cms-extensibility-sdk` (the runtime SDK the browser code imports). See [frontend-sdk.md](frontend-sdk.md).
- The **build tooling** is `@optimizely/ocp-cms-ui-extensions-sdk` (an app-sdk plugin + Vite helper) that discovers entry files, validates `app.yml`, and produces the bundles CMS loads. See [app-structure.md](app-structure.md).
- The **backend** is an ordinary `App.Function` that `accepts: cms_ui_extension`; the extension calls it via `context.extension.invokeFunction(...)`. Secrets and third-party API calls live here, never in the browser bundle. See [backend-proxy.md](backend-proxy.md).

## Two SDKs — do not confuse them

| Package | Where it runs | Role |
| --- | --- | --- |
| `@optimizely/cms-extensibility-sdk` | Browser (the extension bundle) | Runtime API: `register(factory)`, `ExtensionContext` (`context.extension.invokeFunction`, `setReady`, `getDefinition`) |
| `@optimizely/ocp-cms-ui-extensions-sdk` | Build time (Node) | app-sdk plugin: `app.yml` schema + validation for `ui_extensions`, the `UI_EXTENSION_INJECTION_POINTS` source of truth, and the Vite entry-file convention |

Both are declared in the app's `package.json`. The runtime SDK version an app builds against is what the platform records as the extension's `sdk_version` in the Discovery API.

## Workflow

1. **Scaffold from the CMS template** — for a new app, run `ocp app init` with template `"CMS UI Extensions Sample"` (see [scaffolding.md](../cli-commands/scaffolding.md#init)). It comes preconfigured with `runtime: node22-cms-ext`, both CMS SDKs, the Vite build wiring, and example `*.sidebar.tsx` / `*.view.tsx` entry files — so you don't hand-convert an empty OCP app. Then adapt the example extensions to your needs. **Confirm the runtime** is `node22-cms-ext`.
2. **Declare the extension** in `app.yml` under `ui_extensions.<injectionPoint>` with `name`, `entry_point`, `display_name` — see [app-yml.md](app-yml.md).
3. **Author the entry file** `src/cms-ui-extensions/.../<EntryPoint>.<injectionPoint>.tsx` calling `register(context => <YourComponent context={context} />)` — see [frontend-sdk.md](frontend-sdk.md).
4. **Add a backend function** (if the extension needs data/secrets) that `accepts: cms_ui_extension`, called via `context.extension.invokeFunction(...)` — see [backend-proxy.md](backend-proxy.md).
5. **Set the package manager and align the scripts** — if the user chose a package manager other than the template's default, set `"packageManager"` in `package.json` accordingly and align the `build`/`lint`/`test` scripts with it (a general OCP-app rule — see [../package-manager.md](../package-manager.md)).
6. **Validate** — `ocp app validate` runs the SDK validators over the `ui_extensions` block and entry files — see [validation.md](validation.md).
7. **Test locally** — use the `ocp-local-testing` skill / `ocp dev` to render the extension in a browser before deploying. (The local tool may lag new injection points; verify its support.)
8. **Package, publish, install** — the standard OCP CLI lifecycle (see the CLI references in this skill). On publish the bundles upload to the CDN and become discoverable to CMS.

## Modifying an existing CMS-UI-extension app

1. **Read `app.yml`** — the `ui_extensions` block is the source of truth for what extensions exist and which surfaces they target.
2. **Check both SDK versions** in `package.json` — the runtime API and the build tooling version independently.
3. **Match the entry-file naming convention** exactly — a mismatched injection-point segment or `entry_point` will not be discovered/validated.
4. **Keep secrets and third-party calls in the backend function** — never in the browser bundle.
5. **Keep `package.json` scripts in sync with the app's package manager** — if you change the package manager (or add/adjust `build`/`lint`/`test`), make sure the scripts and the `"packageManager"` field match (see [../package-manager.md](../package-manager.md)).
6. **Bump the app version in `app.yml`** when shipping a change (`-dev.N` during development).

## Reference files (this subtree)

| Need | Reference |
| --- | --- |
| Injection points — `sidebar`, `view`, multiplicity, the `UI_EXTENSION_INJECTION_POINTS` source of truth | [injection-points.md](injection-points.md) |
| App structure — directories, entry-file naming, Vite config, build output | [app-structure.md](app-structure.md) |
| `app.yml` `ui_extensions` block — exact shape and fields | [app-yml.md](app-yml.md) |
| Frontend runtime SDK — `register`, `ExtensionContext`, `invokeFunction`, `setReady`, `getDefinition` | [frontend-sdk.md](frontend-sdk.md) |
| Backend proxy — `App.Function` with `accepts: cms_ui_extension` | [backend-proxy.md](backend-proxy.md) |
| Validation rules and common errors | [validation.md](validation.md) |
