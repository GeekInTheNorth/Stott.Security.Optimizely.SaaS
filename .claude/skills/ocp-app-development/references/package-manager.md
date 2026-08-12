# Package manager and package.json scripts

OCP apps can use **npm, yarn (classic), yarn berry, pnpm, or bun**. The package manager is chosen at scaffold time (`ocp app init --package-manager <pm>` — always ask the user which to use) and recorded in `package.json`. This applies to **every** OCP app regardless of type (functions, jobs, data sync, Opal tools, CMS UI Extensions).

## The builder runs your scripts through the declared package manager

At build time the OCP builder detects the package manager from the `packageManager` field in `package.json` (e.g. `"packageManager": "pnpm@9.15.0"`) and invokes the app's `build`, `lint`, and `test` scripts **through it**. Because of this, **the `scripts` must be written for the package manager the app actually uses**. A script that shells out to a *different* manager — e.g. a `build` that runs `yarn ...` in a pnpm app — will fail in the build image, even though it works on a machine where yarn happens to be installed.

## Rules

When scaffolding or modifying an app, **always align the scripts with the chosen package manager** — do not default to `yarn`:

- Set `"packageManager"` in `package.json` to the manager and version the app uses. This is the source of truth the builder reads.
- Write any script that chains another script using **that** manager's run syntax:

  | Package manager | Run-another-script syntax |
  | --- | --- |
  | npm | `npm run <script>` |
  | yarn (classic or berry) | `yarn <script>` |
  | pnpm | `pnpm run <script>` |
  | bun | `bun run <script>` |

- The same rule applies to `build`, `lint`, `test`, and any custom script that invokes another script.

## Prefer manager-agnostic scripts

Where possible, call the tool binary directly rather than nesting a package-manager `run`. Local binaries (`vite`, `eslint`, `vitest`, `tsc`, `rimraf`, …) are on `PATH` during the build regardless of manager, so:

```jsonc
// manager-agnostic — works under any package manager
"build": "rimraf dist && tsc -p tsconfig.json"

// manager-specific — only correct if the app uses pnpm
"build": "pnpm run clean && pnpm run compile"
```

Only the *chained-script* form (`npm run` / `yarn` / `pnpm run` / `bun run`) is manager-specific. Direct binary calls avoid the cross-manager pitfall entirely.

## When modifying an existing app

- Check the `packageManager` field (if present) or the lockfile — `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb` to learn which manager the app uses before editing scripts.
- If you change the package manager, update `"packageManager"` **and** rewrite every chained-script invocation to match — leaving a stale `yarn`/`npm run` in a script is a common cause of build-image failures.
