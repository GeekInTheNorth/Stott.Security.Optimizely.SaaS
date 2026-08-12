# CLI — Scaffolding

Always use the OCP CLI to register, initialize, and add new components — never write scaffolding code manually or hand-edit `app.yml` to add a function, job, source, or destination. The CLI creates both the TypeScript file and the `app.yml` entry together; doing it by hand risks them going out of sync. Updating existing component code can be done manually.

- [Register](#register)
- [Init](#init)
- [Add function](#add-function)
- [Add job](#add-job)
- [Add source](#add-source)
- [Add destination](#add-destination)

## Register

One-time step. Reserve the app ID before writing any code. **Before running this command, ask the user whether the app ID is already registered. Run it only if the user confirms it has not been registered yet** — running it against an existing ID will fail or conflict.

```bash
ocp app register --appId <value> --name <value> --product <value> --no-personal
```

| Flag                           | Required | Description                                                                                                        |
|--------------------------------|----------|--------------------------------------------------------------------------------------------------------------------|
| `--appId`                      | Yes      | App ID to reserve (e.g. `my_app`)                                                                                  |
| `--name`                       | Yes      | Display name of the app                                                                                            |
| `--product`                    | Yes      | Target product: `HUB` (OCP) or `ODP`                                                                               |
| `--personal` / `--no-personal` | Yes      | Pass `--no-personal` to share with your org, `--personal` to keep it private — always ask the user which they want |

All four flags must be provided — the command goes interactive if any are omitted.

**Conventions:**
- `--appId`: lowercase letters, numbers, and underscores only — no hyphens (e.g. `my_app`, `stripe_odp_sync`)
- `--name`: human-readable display name shown in the App Directory (e.g. `My App`, `Stripe ODP Sync`)

## Init

Scaffold a new app project with the latest `app-sdk` and `node-sdk`.

```bash
ocp app init --app-id <value> --display-name <value> --template <value> \
  --version <value> --summary <value> --support-url <value> \
  --contact-email <value> --category <value> \
  --package-manager <value> --directory <value> --no-prompt
```

Interactive by default — prompts for project details and creates the project directory if needed.
To run non-interactively, pass `--no-prompt` plus every flag marked Required below; skipping a Required flag either hangs at a prompt or produces an `app.yml` that won't pass validation.

| Flag                | Required | Description                                                                                                                                                                                                                                                                                                                   |
|---------------------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `--app-id`          | Yes      | App ID (e.g. `my_app`)                                                                                                                                                                                                                                                                                                        |
| `--display-name`    | Yes      | Display name (e.g. `My App`)                                                                                                                                                                                                                                                                                                  |
| `--template`        | Yes      | Template display name — must be one of the exact strings below                                                                                                                                                                                                                                                                |
| `--version`         | Yes      | Version (e.g. `1.0.0-dev.1`)                                                                                                                                                                                                                                                                                                  |
| `--summary`         | Yes      | Brief app summary                                                                                                                                                                                                                                                                                                             |
| `--support-url`     | Yes      | Support URL                                                                                                                                                                                                                                                                                                                   |
| `--contact-email`   | Yes      | Contact email address                                                                                                                                                                                                                                                                                                         |
| `--category`        | Yes      | App category — see `app-yml.md` for valid values; always ask the user which to use before running the command                                                                                                                                                                                                                 |
| `--package-manager` | No       | Package manager: `yarn` (default), `yarn-berry`, `npm`, `pnpm`, `bun` — always ask the user which to use before running the command                                                                                                                                                                                           |
| `--directory`       | No       | Target directory. If the path doesn't exist, the CLI creates it; if it exists but isn't empty (including hidden files) — the command fails. This applies whether you pass `--directory` or rely on the `--no-prompt` default, which derives the directory from the app-id (underscores → dashes, e.g. `my_app` → `./my-app`). |

Pass the full template display name exactly as listed:

| Template name                | Use for                                                                                                                                             |
|------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| `"Basic OCP Sample"`         | OCP app with example functions and jobs                                                                                                              |
| `"Empty OCP Project"`        | OCP app with no example code                                                                                                                         |
| `"Basic ODP Sample"`         | ODP app with example functions and jobs                                                                                                              |
| `"Empty ODP Project"`        | ODP app with no example code                                                                                                                         |
| `"Opal tool OCP app"`        | OCP app that implements Opal tools                                                                                                                   |
| `"CMS UI Extensions Sample"` | OCP app with CMS UI extensions

## Add function

```bash
ocp add function --name <value> --description <value>
```

| Flag            | Required | Description                                            |
|-----------------|----------|--------------------------------------------------------|
| `--name`        | Yes      | Function name in `snake_case`                          |
| `--description` | Yes      | Function description                                   |
| `--global`      | No       | Create a global function instead of a regular function |

Creates `src/functions/<ClassName>.ts` and adds the entry to `app.yml`.

## Add job

```bash
ocp add job --name <value> --description <value>
```

| Flag            | Required | Description                                   |
|-----------------|----------|-----------------------------------------------|
| `--name`        | Yes      | Job name in `snake_case`                      |
| `--description` | Yes      | Job description                               |
| `--cron`        | No       | Optional cron schedule (e.g. `"0 0 0 ? * *"`) |

Creates `src/jobs/<ClassName>.ts` and adds the entry to `app.yml`.

## Add source

```bash
ocp add source --name <value> --description <value> --schema <static|dynamic> --schema-name <value>
```

| Flag            | Required | Description                                                       |
|-----------------|----------|-------------------------------------------------------------------|
| `--name`        | Yes      | Source name in `snake_case`                                       |
| `--description` | Yes      | Source description                                                |
| `--schema`      | Yes      | Schema type: `static` (YAML file) or `dynamic` (TypeScript class) |
| `--schema-name` | Yes      | Schema file name in `snake_case` (static) or class name in `PascalCase` (dynamic) |

Creates `src/sources/schema/<schemaName>.yml` (static) or `src/sources/<SchemaClass>.ts` (dynamic) and adds the entry to `app.yml`. If `--schema-name` is omitted the command prompts for it (pre-filled with a default) — pass it explicitly to stay non-interactive.

## Add destination

```bash
ocp add destination --name <value> --description <value> --schema <static|dynamic> --schema-name <value>
```

| Flag            | Required | Description                                                       |
|-----------------|----------|-------------------------------------------------------------------|
| `--name`        | Yes      | Destination name in `snake_case`                                  |
| `--description` | Yes      | Destination description                                           |
| `--schema`      | Yes      | Schema type: `static` (YAML file) or `dynamic` (TypeScript class) |
| `--schema-name` | Yes      | Schema file name in `snake_case` (static) or class name in `PascalCase` (dynamic) |

Creates `src/destinations/<ClassName>.ts` and `src/destinations/schema/<schemaName>.yml` (static) or `src/destinations/<SchemaClass>.ts` (dynamic), and adds the entry to `app.yml`. If `--schema-name` is omitted the command prompts for it (pre-filled with a default) — pass it explicitly to stay non-interactive.