---
name: ocp-app-development
version: 0.1.0
description: ALWAYS use this skill directly when building, modifying, or debugging an OCP (Optimizely Connect Platform) app — adding functions, jobs, data sync sources or destinations, lifecycle hooks, OAuth flows, settings forms, Opal tools, CMS UI Extensions, ODP schema extensions, or anything that touches app.yml, the @zaiusinc/app-sdk, @zaiusinc/node-sdk, @optimizely-opal/opal-tool-ocp-sdk, @optimizely/cms-extensibility-sdk, or @optimizely/ocp-cms-ui-extensions-sdk. This skill is self-contained and handles all phases including design decisions.
---

# OCP App Development

OCP (Optimizely Connect Platform) is a serverless platform and marketplace for building apps that connect external systems with each other and with Optimizely products. Apps are published to the OCP App Directory as data sync apps, end-to-end apps, or Opal tools.

## App Types

### Data sync app

The app exposes one or more custom **sources**, **destinations**, or both in the OCP **Sync Manager** — the UI where customers pair sources and destinations. A source receives data from an external system and emits it into the **sync pipeline** — the runtime data flow between a paired source and destination; a destination receives data from the pipeline and delivers it to an external system. The app handles authorization and schema for each external system it integrates.

In addition to sources and destinations from OCP apps, the platform provides built-in options that customers can pair with:
- **Built-in sources:** CMP (Content Marketing Platform), OCP database, Optimizely Graph
- **Built-in destinations:** Optimizely Graph, Content Recommendations

**Use when:** you are integrating one or more external systems and want customers to control the pairings in the Sync Manager — connecting your sources or destinations with other OCP apps or Optimizely products.

### End-to-end app

The app defines the complete data flow between two specific, hardcoded systems. It handles authorization and schema for both sides and runs the sync automatically. Customers install, authorize both systems, and the app does the rest. These apps do not appear in the Sync Manager — the pairing is fixed.

**Use when:** both systems are predetermined by the developer — for example, pulling records from a CRM and syncing them to a marketing platform.

### ODP app

The app writes data directly into ODP — customer profiles, events, and custom objects — using the node-sdk from functions or jobs. The app defines any custom ODP schema it needs and owns the complete data flow: what is fetched from the external system, how it is transformed, and where it lands in ODP.

**Use when:** the destination is ODP and you need direct control over what is written — for example, capturing leads, enriching customer profiles from a third-party provider, importing records from a CRM, or subscribing customers to lists.

### Opal tool

The app exposes capabilities of an external service as AI tools in the Opal assistant. No data sync involved — the app receives tool calls from Opal and returns results.

**Use when:** you want Opal users to query or act on an external service through natural language — for example, running reports, searching records, or triggering actions.

### CMS UI Extension app

The app renders custom UI **inside Optimizely CMS (SaaS)** at a designated surface (an *injection point* such as a sidebar panel or a full-page view). See [references/cms-ui-extensions/overview.md](references/cms-ui-extensions/overview.md).

**Use when:** you want to surface app functionality directly in the CMS authoring experience — for example, a media browser, a preview/status panel, or a full-page dashboard for CMS users.

**Decide the app type before writing any code** — it shapes the entire implementation. Ask: who decides which two systems are connected? Developer fixes both → end-to-end. Customer chooses at sync time → data sync. Writing straight to ODP → ODP app. No sync, only AI tool calls → Opal tool. Rendering UI inside Optimizely CMS → CMS UI Extension.

## App Building Blocks

```
my-app/
├── app.yml                # Manifest — declares all components, metadata, runtime
├── package.json
├── tsconfig.json
├── forms/                 # Settings form YAML (forms/settings.yml)
├── assets/                # Static resources
└── src/
    ├── functions/         # Webhook listeners, Opal tools
    ├── jobs/              # Background and scheduled tasks
    ├── lifecycle/         # Install, uninstall, OAuth, settings form handlers
    ├── schema/            # ODP schema extensions (add custom fields to ODP objects)
    ├── sources/           # Data sync source logic and schema definitions
    ├── destinations/      # Data sync destination logic and schema definitions
    ├── cms-ui-extensions/ # CMS UI Extension entry files
    ├── lib/               # Shared utilities, API clients, TypeScript interfaces
    └── tests/             # Unit and integration tests
```

| SDK | Purpose |
| --- | --- |
| `@zaiusinc/app-sdk` | Core framework — functions, jobs, lifecycle, destinations, storage, notifications |
| `@zaiusinc/node-sdk` | ODP data access — events, customers, objects, GraphQL |
| `@zaiusinc/app-forms-schema` | Type definitions for settings form elements and payloads |
| `@optimizely-opal/opal-tool-ocp-sdk` | Opal AI tools — `ToolFunction`, `GlobalToolFunction`, `@tool`, `@interaction`, `@resource` decorators |
| `@optimizely/cms-extensibility-sdk` | CMS UI Extensions runtime (browser) — `register`, `ExtensionContext`; see [references/cms-ui-extensions/overview.md](references/cms-ui-extensions/overview.md) |
| `@optimizely/ocp-cms-ui-extensions-sdk` | CMS UI Extensions build tooling — `app.yml` schema/validation, entry-file convention |

`@zaiusinc/node-sdk`'s ODP client is exported as **`odp`** (use in new code) and also as **`z`**, a backward-compatible alias — identical at runtime. Match the existing import when editing an app.

Every component runs in the context of one OCP account and one installation, identified by:

- **`trackerId`** *(string)* — uniquely identifies an **OCP account** (a customer workspace).
- **`installId`** *(number)* — uniquely identifies an **installation** of the app. Each account installs the app at most once, giving a 1:1 mapping between `trackerId` and `installId`.

## Prerequisites

- Node.js 22+ and Git
- Install the OCP CLI: `npm install -g @optimizely/ocp-cli-v2` — provides the `ocp` command. (Note the `-v2`: the older `@optimizely/ocp-cli` is the outdated v1.)
- Provide your API key before running any ocp command: create `~/.ocp/credentials.json` with `{ "apiKey": "<your-key>" }`.

## Developer Journey

The OCP CLI drives the entire lifecycle — from registering the app to invoking deployed functions. Not all steps apply to every app type — follow the steps relevant to what you are building. **Always read the relevant reference file from the table below before acting on any step** — reference files contain exact commands, component types, and options.

1. **Reserve an app ID** *(one-time)* — register the app ID before writing any code
2. **Scaffold the project** — create the project structure with the latest `app-sdk` and `node-sdk`
3. **Add components** — scaffold each component (functions, jobs, sources, destinations)
4. **Settings form** — write `forms/*.yml` for per-account configuration (credentials, toggles, OAuth buttons)
5. **Schema** — write custom ODP fields in `schema/` if the app needs to extend the ODP data model
6. **Lifecycle hooks** — implement install, settings, uninstall, and OAuth lifecycle hooks
7. **Business logic** — write function and job bodies
8. **Validate** — validate the app manifest and type-check the TypeScript
9. **Test locally** — run and test the app locally without deploying (see `ocp-local-testing` skill)
10. **Package and upload** — package and upload the app for publishing
11. **Publish** — make the version available in the OCP App Directory
12. **Install** — install the app into an account, creating unique webhook URLs per installation
13. **Retrieve webhook URLs** — retrieve the webhook URLs for an installation to invoke the functions

## Modifying an Existing App

When a request comes in against an existing app rather than a new one:

1. **Read `app.yml` first** — it is the source of truth for what components exist and what runtime is targeted
2. **Check installed SDK versions in `package.json`** before assuming an API exists
3. **Match `package.json` scripts to the app's package manager** — the builder runs `build`/`lint`/`test` through the manager in the `packageManager` field; a script that calls a different manager fails the build. See [references/package-manager.md](references/package-manager.md)
4. **Use the scaffolding commands for new components** even in an existing app — never hand-edit `app.yml` to add a function/job/source/destination
5. **Bump the version in `app.yml`** when shipping a change; use `-dev.N` suffix during development
6. **Publishing a new version** automatically upgrades existing installations within the same major version; a major version bump (e.g. `1.x → 2.0`) requires a manual upgrade per account via the ocp CLI

## Components and Reference Files

| Need | Reference |
| --- | --- |
| `app.yml` structure and all configuration options | [references/app-yml.md](references/app-yml.md) |
| Webhook listener (`App.Function`); global endpoint (`App.GlobalFunction`) | [references/function.md](references/function.md) |
| Background or scheduled task (`App.Job`) — historical imports, cron scheduling | [references/job.md](references/job.md) |
| Lifecycle hooks — all hooks and when each one is called | [references/lifecycle/overview.md](references/lifecycle/overview.md) |
| `onInstall` — initial setup, generating secrets, registering external webhooks | [references/lifecycle/install.md](references/lifecycle/install.md) |
| `onSettingsForm` — saving settings, button actions, validation | [references/lifecycle/settings-form.md](references/lifecycle/settings-form.md) |
| Settings form elements — text, select, toggle, button, oauth_button | [references/settings-forms/elements.md](references/settings-forms/elements.md) |
| Settings form conditional logic — visibility, required, validation | [references/settings-forms/conditional-logic.md](references/settings-forms/conditional-logic.md) |
| OAuth — `onAuthorizationRequest` + `onAuthorizationGrant` | [references/lifecycle/oauth.md](references/lifecycle/oauth.md) |
| `onUninstall` + `canUninstall` — cleanup, deregistering webhooks | [references/lifecycle/uninstall.md](references/lifecycle/uninstall.md) |
| `onUpgrade` — version migration logic | [references/lifecycle/upgrade.md](references/lifecycle/upgrade.md) |
| Data sync source — static or dynamic schema, `sources.emit()` | [references/data-sync/source.md](references/data-sync/source.md) |
| Data sync destination — `ready()`, `deliver()`, static or dynamic schema | [references/data-sync/destination.md](references/data-sync/destination.md) |
| Opal tool — overview, project structure, how pieces connect | [references/opal-tools/overview.md](references/opal-tools/overview.md) |
| Opal tool function — `ToolFunction`, `GlobalToolFunction` | [references/opal-tools/tool-function.md](references/opal-tools/tool-function.md) |
| Opal `@tool` decorator — `ParameterType`, parameters, OptiID auth | [references/opal-tools/tool.md](references/opal-tools/tool.md) |
| Opal `@interaction` decorator — Proteus card button handlers, `InteractionResult` from `@tool` for soft messages | [references/opal-tools/interaction.md](references/opal-tools/interaction.md) |
| Opal `@resource` decorator — Proteus UI rich result cards, components, data binding | [references/opal-tools/resource.md](references/opal-tools/resource.md) |
| CMS UI Extensions — overview, model, two SDKs, workflow (custom UI inside Optimizely CMS) | [references/cms-ui-extensions/overview.md](references/cms-ui-extensions/overview.md) |
| CMS UI Extensions injection points — `sidebar`, `view`, multiplicity, `UI_EXTENSION_INJECTION_POINTS` | [references/cms-ui-extensions/injection-points.md](references/cms-ui-extensions/injection-points.md) |
| CMS UI Extensions app structure — entry-file naming (`*.sidebar.tsx`/`*.view.tsx`), Vite, build output | [references/cms-ui-extensions/app-structure.md](references/cms-ui-extensions/app-structure.md) |
| CMS UI Extensions `app.yml` — the `ui_extensions` block shape and fields | [references/cms-ui-extensions/app-yml.md](references/cms-ui-extensions/app-yml.md) |
| CMS UI Extensions frontend SDK — `register`, `ExtensionContext`, `invokeFunction`, `setReady` | [references/cms-ui-extensions/frontend-sdk.md](references/cms-ui-extensions/frontend-sdk.md) |
| CMS UI Extensions backend proxy — `App.Function` with `accepts: cms_ui_extension` | [references/cms-ui-extensions/backend-proxy.md](references/cms-ui-extensions/backend-proxy.md) |
| CMS UI Extensions validation — uniqueness rules, common errors | [references/cms-ui-extensions/validation.md](references/cms-ui-extensions/validation.md) |
| Storage — `settings`, `secrets`, `kvStore`, `sharedKvStore` | [references/app-sdk/storage.md](references/app-sdk/storage.md) |
| Notifications — `notifications.info/success/warn/error` | [references/app-sdk/notifications.md](references/app-sdk/notifications.md) |
| Logger — `logger.debug/info/warn/error` | [references/app-sdk/logging.md](references/app-sdk/logging.md) |
| CLI — `ocp app logs`, `get-log-level`, `set-log-level` | [references/cli-commands/logging.md](references/cli-commands/logging.md) |
| ODP schema — define custom fields and objects; read schema at runtime | [references/odp/schema.md](references/odp/schema.md) |
| ODP events — `odp.event()` | [references/odp/events.md](references/odp/events.md) |
| ODP customers — `odp.customer()` | [references/odp/customers.md](references/odp/customers.md) |
| ODP objects — `odp.object()`, custom object operations | [references/odp/objects.md](references/odp/objects.md) |
| ODP GraphQL — `odp.graphql()` queries | [references/odp/graphql.md](references/odp/graphql.md) |
| ODP lists — list membership management | [references/odp/lists.md](references/odp/lists.md) |
| Package manager — choosing it, and keeping `package.json` scripts in sync (npm/yarn/pnpm/bun) | [references/package-manager.md](references/package-manager.md) |
| CLI — register, scaffold, and add components | [references/cli-commands/scaffolding.md](references/cli-commands/scaffolding.md) |
| CLI — validate the app manifest and TypeScript | [references/cli-commands/validation.md](references/cli-commands/validation.md) |
| CLI — deploy, publish, install, list functions and installations, and manage jobs | [references/cli-commands/deployment.md](references/cli-commands/deployment.md) |
