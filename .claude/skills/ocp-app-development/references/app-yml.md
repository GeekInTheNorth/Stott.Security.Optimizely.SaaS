# app.yml

`app.yml` is the manifest for an OCP app. It declares every component the app exposes and controls how the OCP platform builds, routes, and runs the app.

## Complete structure

```yaml
meta:
  app_id: my_app              # must start with a lowercase letter; lowercase letters, numbers, underscores; 3–32 chars
  display_name: My App        # shown in the App Directory
  version: 1.0.0-dev.1        # semver — see Version format below
  vendor: my_org              # auto-populated from your OCP account during ocp app init — do not set manually
  summary: Short description  # one line, shown in the App Directory
  support_url: https://...
  contact_email: support@example.com
  categories:
    - Marketing               # see Categories below
  availability:
    - all                     # see Availability below

runtime: node22               # always node22 for new apps

functions:
  my_webhook:
    entry_point: MyWebhook    # class extends App.Function
    description: Handles incoming webhooks from ExternalService

  global_fn:
    entry_point: GlobalFn     # class extends App.GlobalFunction
    description: Account-level endpoint — no installation context
    global: true

  opal_tool:
    entry_point: OpalToolFunction  # class extends ToolFunction from @optimizely-opal/opal-tool-ocp-sdk
    description: Opal AI tool
    opal_tool: true                # marks this function as an Opal tool

jobs:
  my_job:
    entry_point: MyJob        # class extends App.Job
    description: Processes records in the background
    cron: 0 0 0 ? * *        # optional — Quartz cron, omit for manually-triggered jobs

sources:
  my_source:
    description: Syncs products from ExternalService
    schema: product           # static — references src/sources/schema/product.yml
    # OR dynamic schema:
    # schema:
    #   entry_point: ProductSchema   # class extends App.SourceSchemaFunction

destinations:
  my_dest:
    entry_point: MyDest       # class extends App.Destination<T>
    description: Sends contacts to ExternalService
    schema: contact           # static — references src/destinations/schema/contact.yml
    # OR dynamic schema:
    # schema:
    #   entry_point: ContactSchema   # class extends App.DestinationSchemaFunction
    supports_delete: true     # optional — set true if the destination handles _isDeleted records

environment:
  - APP_ENV_MY_API_KEY        # values stored in .env (never committed to source)
  - APP_ENV_MY_API_SECRET     # all app env var names must start with APP_ENV_
```

## Version format

| Format          | Visibility                                                        | Review required |
|-----------------|-------------------------------------------------------------------|-----------------|
| `1.0.0-dev.N`   | Developer's own account only                                      | No              |
| `1.0.0-beta.N`  | Accessible via share link only                                    | Yes             |
| `1.0.0-private` | Restricted to specific accounts — not listed in the App Directory | Yes             |
| `1.0.0`         | Publicly listed in the App Directory                              | Yes             |

Bump `-dev.N` during development. Use `ocp app prepare --bump-dev-version` to auto-increment.

`dev`, `beta`, and `private` are mutually exclusive — they cannot be combined. A private app follows the same dev flow as a public one (`1.0.0-dev.N` during development), then releases as `1.0.0-private` instead of `1.0.0`.

## Availability

Determines which regions the app is deployed to. The app is always deployed to `us` — additional zones can be added here.

| Value | Meaning                                              |
|-------|------------------------------------------------------|
| `us`  | US — always required                                 |
| `eu`  | EU                                                   |
| `au`  | APAC                                                 |
| `all` | All regions — cannot be combined with specific zones |

Multiple specific zones can be listed together (e.g. `us` + `eu`, `us` + `au`).

## Categories

`Accounting & Finance`, `Advertising`, `Analytics & Reporting`, `Attribution & Linking`, `Audience Sync`, `CDP / DMP`, `Channel`, `Commerce Platform`, `Content Management`, `CRM`, `Customer Experience`, `Data Quality & Enrichment`, `Lead Capture`, `Loyalty & Rewards`, `Marketing`, `Merchandising & Products`, `Offers`, `Opal`, `Personalization & Content`, `Point of Sale`, `Productivity`, `Reviews & Ratings`, `Site & Content Experience`, `Subscriptions`, `Surveys & Feedback`, `Testing & Utilities`

## Environment

The `environment` list declares which variables the app expects. Values live in `.env` files at the app root — never committed to source. The CLI reads them during `ocp app prepare` and uploads the values securely to OCP. To update values in production, prepare a new version with an updated `.env`; use `--use-previous-app-env-values` to reuse prior values without changes.

**Adding a variable to `environment:` requires a matching entry in `.env` — always edit both files together.**

**`.env` file format:**

```
APP_ENV_MY_API_KEY=abc123
APP_ENV_MY_API_SECRET=supersecret
```

The CLI merges these files in order — later files override earlier ones:

| File                 | When read                                                             |
|----------------------|-----------------------------------------------------------------------|
| `.env`               | Always — base values                                                  |
| `.env.<environment>` | e.g. `.env.staging`, `.env.production` — environment overrides        |
| `.env.<shard>`       | e.g. `.env.us`, `.env.eu` — production only, shard-specific overrides |

Apps with `all` availability cannot use shard-specific `.env.<shard>` files.

