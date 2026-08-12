# CLI — Deployment & Job Management

- [Prepare](#prepare) — package, upload, and build the app
- [Publish](#publish) — make a version available in the App Directory
- [Install](#install) — install a published version into an account
- [List installations](#list-installations) — find tracker IDs for installed accounts
- [List functions](#list-functions) — retrieve deployed webhook URLs
- [Unpublish](#unpublish) — remove a version from the App Directory
- [Uninstall](#uninstall) — remove an installation from an account
- [Job management](#job-management) — trigger, monitor, and stop jobs

Availability zones used by the `-a` flag: `us` (default), `eu`, `au`.

## Prepare

Packages, uploads, and builds the app. The project directory must be inside an initialized Git repository — the command will fail with an error if it is not.

> **Always get explicit user confirmation before running this command.**

```bash
ocp app prepare
```

| Flag                            | Description                                                             |
|---------------------------------|-------------------------------------------------------------------------|
| `--publish`                     | Automatically publish after a successful prepare                        |
| `--use-previous-app-env-values` | Reuse `.env` values from the previous version — local `.env` is ignored |
| `--bump-dev-version`            | Bump the dev version before building                                    |
| `--upgrade-deps`                | Automatically update OCP dependencies                                   |

## Publish

Makes a prepared version available in the OCP App Directory.

> **Always get explicit user confirmation before running this command.**

```bash
ocp directory publish <appId@version>
```

## Install

Installs a published version into a specific account, creating an installation with unique webhook URLs.

> **Always get explicit user confirmation before running this command.**

```bash
ocp directory install <appId@version> <trackerId>
```

| Flag | Description                       |
|------|-----------------------------------|
| `-a` | Availability zone (default: `us`) |

## List installations

Lists all installations of an app, optionally filtered by version.

```bash
ocp directory listInstalls <appId>
ocp directory listInstalls <appId@version>
```

| Flag | Description                       |
|------|-----------------------------------|
| `-a` | Availability zone (default: `us`) |

Use this to find tracker IDs needed for `listFunctions` and `jobs trigger`.

## List functions

Lists the deployed webhook URLs for an installation.

```bash
ocp directory listFunctions <appId> <trackerId>
```

| Flag | Description                       |
|------|-----------------------------------|
| `-a` | Availability zone (default: `us`) |

## Unpublish

Removes a version from the OCP App Directory.

> **Always get explicit user confirmation before running this command.**

```bash
ocp directory unpublish <appId@version> --no-prompt
```

| Flag | Description                       |
|------|-----------------------------------|
| `-a` | Availability zone (default: `us`) |

## Uninstall

Removes an installation from a specific account.

> **Always get explicit user confirmation before running this command.**

```bash
ocp directory uninstall <appId> <trackerId> --no-prompt
```

| Flag | Description                       |
|------|-----------------------------------|
| `-a` | Availability zone (default: `us`) |

## Job management

**Trigger a job manually:**

```bash
ocp jobs trigger <appId> <jobName> <trackerId>
```

| Flag           | Description                                                             |
|----------------|-------------------------------------------------------------------------|
| `--parameters` | JSON string of parameters to pass to the job (e.g. `'{"mode":"full"}'`) |
| `-a`           | Availability zone (default: `us`)                                       |

**List job execution history:**

```bash
ocp jobs list <appId>
```

| Flag          | Description                                                                            |
|---------------|----------------------------------------------------------------------------------------|
| `--trackerId` | Filter by tracker ID                                                                   |
| `--function`  | Filter by job name                                                                     |
| `--status`    | Filter by status: `PENDING`, `SCHEDULED`, `RUNNING`, `COMPLETE`, `ERROR`, `TERMINATED` |
| `--limit`     | Number of results (default: `50`)                                                      |
| `--from`      | Start time — ISO string, epoch, or relative (e.g. `"5m"`, `"7d"`)                      |
| `-a`          | Availability zone (default: `us`)                                                      |

**Show runtime status of a running job:**

```bash
ocp jobs runtimeStatus <jobId>
```

| Flag | Description                       |
|------|-----------------------------------|
| `-a` | Availability zone (default: `us`) |

**Terminate a running job:**

```bash
ocp jobs terminate <jobId>
```

| Flag | Description                       |
|------|-----------------------------------|
| `-a` | Availability zone (default: `us`) |
