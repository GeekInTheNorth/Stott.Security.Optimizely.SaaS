---
name: ocp-local-testing
version: 0.1.0
description: Use when running or testing an OCP app locally with `ocp dev` (or the standalone `ocp-local-env` tool) — starting the local dev server and testing functions, jobs, lifecycle and settings form, data sync sources and destinations, or Opal tools in the browser before deploying.
---

# OCP Local Environment

`ocp-local-env` is a local dev server for testing an OCP app before deploying it. It builds and runs the app, watches for changes, and provides a browser UI to exercise every component.

## Run

From the app root (the folder containing `app.yml`):

```bash
ocp dev
```

This auto-installs and updates the dev server, then launches it. It builds the app, opens `http://localhost:3000`, and rebuilds automatically as you edit the app's files.

| Flag | Description |
| --- | --- |
| `--port <n>` | Run on a different port (default 3000) |
| `--no-open` | Don't automatically open the browser |
| `--path <dir>` | Use an app root other than the current folder |
| `--config <file>` | Path to a JSON config file that overrides defaults (see below) |

## Configuration

The `--config` file is a JSON file that overrides the dev server's defaults — include only the fields you want to change. The most useful:

- `app.buildCommand` — the build command (defaults to `yarn build`; set this if your app builds with npm, pnpm, or bun)
- `app.watchPaths` / `app.ignorePaths` — which files to watch for rebuilds, and which to exclude
- `server.port` — the port the server runs on

```json
{
  "server": { "port": 4000 },
  "app": {
    "buildCommand": "npm run build",
    "watchPaths": ["src/**/*"],
    "ignorePaths": ["**/*.test.ts", "node_modules/**"]
  }
}
```

## What you can test

The browser UI has a tab per component:

- **App Settings** — install the app, fill in and save its settings form, and uninstall. (This is the default tab, an embedded OCP directory UI.)
- **Functions** — send a test payload to a webhook/HTTP function and see the response and logs.
- **Jobs** — start a job (optionally with parameters) and watch its execution states and logs.
- **Destinations** — run a destination's readiness check, generate a sample batch, and deliver it to a data sync destination.
- **Sources** — view a source's schema; records the source emits appear in the **Emitted Source Data** tab below.
- **Opal Tools** — invoke an Opal tool, generate mock parameters, and check tool readiness.
- **ODP Schema** — view the custom ODP schema your app defines.
- **Tool Settings** — set an ODP API key so the app's ODP calls (customers, events, objects, GraphQL, lists) run against a real account.

A panel along the bottom has its own tabs:

- **Console** — streaming logs, filterable by origin (your app vs. the dev-server engine), level (pick debug, info, warn, or error to show that level and above), and category (function, lifecycle, jobs, notifications, destination, build, settings, secrets, etc.), with a clear button.
- **Notifications** — notifications the app raises (`notifications.info/success/warn/error`).
- **Settings** — inspect and edit the installation's settings store.
- **Secrets** — view, add, edit, and delete entries in the installation's secrets store.
- **KV Store** — view, add, edit, and delete entries in the per-installation key-value store.
- **Shared KV** — view, add, edit, and delete entries in the app-wide store shared across installations.
- **Emitted Source Data** — records emitted by data sync sources, with a running count.
- **Environment** — shows each `APP_ENV_*` variable the app declares: its value, which file it was loaded from (`.env` or `.env.local` in the app root), and whether it is still missing. Values can be toggled hidden/visible.
