# Stott Security for Optimizely CMS (SaaS)

An [Optimizely Connect Platform](https://docs.developers.optimizely.com/optimizely-connect-platform)
app that adds a full-page security console to Optimizely CMS (SaaS), and serves
the resulting HTTP response headers to your site's front end.

It manages two things:

- **Content Security Policy** — built from a domain-based permission model
  ("allow scripts from `google.com`") rather than hand-assembled directives,
  with automatic splitting when a policy outgrows what a CDN will carry.
- **Response headers** — the eight standard security headers, plus any custom
  header you want added to or removed from responses.

Editors work on a **draft**. Publishing compiles that draft and writes the result
to a public endpoint; nothing a customer's site serves changes until they do.

This is the SaaS counterpart to
[Stott.Security.Optimizely](https://github.com/GeekInTheNorth/Stott.Security.Optimizely),
the PaaS addon for CMS 12+. The CSP engine here is a faithful TypeScript port of
that project's, and the two are kept aligned deliberately — see
[CLAUDE.md](CLAUDE.md).

---

## How it fits together

Optimizely CMS (SaaS) is headless: the CMS does not serve your pages, and an OCP
app cannot touch your site's HTTP responses. So the work splits in two.

```
 ── control plane, per publish ────────────    ── data plane, per request ──

  console  ──▶  draft  ──▶  publish             your site's front end
  (CMS UI)      (kvStore)      │                        │
                               ▼                        │
                    compiled:v1:{scope}                 │
                               │                        │
                               ▼                        ▼
                    GET /compiled_headers  ─────▶  apply to each response
                    { headers, publishedAt,        delete / set / append
                      cacheSeconds }               substitute a fresh nonce
```

**This repository is the control plane.** The data plane — a middleware package
that fetches, caches and applies the headers — is not included. The console's
**Preview → Integration** tab shows the endpoint URL for an installation and a
worked example of the three-action mapping any consumer must implement.

### Components

| Path | What it is |
| --- | --- |
| `src/cms-ui-extensions/` | The console. A `view` (full-page) CMS UI extension, React + [Axiom](https://axiom.optimizely.com/). |
| `src/backend/functions/CmsExtension.ts` | Private backend for the console. Reachable only via `invokeFunction`; no public URL. |
| `src/backend/functions/CompiledHeaders.ts` | The public endpoint a site's front end fetches. |
| `src/backend/core/` | The compile engine — CSP construction, header optimisation, response headers. |
| `src/backend/lib/` | Key-value storage, validation, typed errors. |
| `src/shared/` | Types and constants shared by both halves. No node or browser globals. |
| `src/tests/` | Vitest suites for the engine and validation. |

### Storage

Configuration lives in OCP key-value storage, per installation:

| Key | Contents |
| --- | --- |
| `config:v1:{appId}:{hostName}` | The draft — the system of record for editing. |
| `compiled:v1:{appId}:{hostName}` | The published output the public endpoint serves. |

**This build has a single global scope.** Per-app and per-host configuration is a
PaaS feature, where a relational database backs an inheritance chain of
host → app → global. OCP provides key-value storage, so the keys above carry the
scope shape and `readCompiled` walks the chain, but the console edits the global
scope and nothing writes a narrower one. A head may pass `appId` and `hostName`
to the endpoint today; both resolve to the global document.

> **There is no backup but the export.** Uninstalling the app deletes its storage
> and there is no restore path. The console's **Tools** tab exists for this
> reason.

---

## Developing

### Prerequisites

- Node.js 22+
- An OCP developer account, and an API key in `~/.ocp/credentials.json`:
  ```json
  { "apiKey": "<your-key>" }
  ```
- An Optimizely CMS (SaaS) instance with extensions enabled, for testing

The OCP CLI is invoked through `npx` throughout. Spell the package out —
`npx ocp` fails with *"could not determine executable to run"*, because npx
resolves the argument as a package name and there is no `ocp` package:

```bash
npx --yes @optimizely/ocp-cli-v2 <command>
```

### Local checks

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npx --yes @optimizely/ocp-cli-v2 app validate
```

`npm run build` produces two bundles: the backend functions, and the console at
`dist/cms-ui-extensions/SecurityConsole.js`. The file name must match the
`entry_point` declared in `app.yml`, and the directory name is fixed — the SDK
validator and the bundle promotion step both look for exactly
`dist/cms-ui-extensions/`.

There is no local preview of the console. A CMS UI extension only runs inside the
CMS, so the loop is deploy-and-look.

### Deploying a development build

`-dev.N` versions are visible only to your own OCP account and are never listed
in the App Directory.

```bash
npm test && npx --yes @optimizely/ocp-cli-v2 app validate

# Package, upload, build all three shards, and publish
npx --yes @optimizely/ocp-cli-v2 app prepare --bump-dev-version --publish

# Point an installation at the new version
npx --yes @optimizely/ocp-cli-v2 directory upgrade <appId> <trackerId> -v <version>
```

Each `app prepare` needs a version bump, which `--bump-dev-version` handles by
editing `app.yml`.

Find your `trackerId` — the OCP account identifier — with:

```bash
npx --yes @optimizely/ocp-cli-v2 directory listInstalls <appId>
```

**Two things that reliably waste time.**

Publishing does not dependably auto-upgrade an existing installation. Always run
`directory upgrade` explicitly with `-v`. It is idempotent, so running it when
the publish already upgraded simply reports the version in place.

And `directory upgrade` reporting the new version does not mean the CMS is
serving it yet. The bundle URL carries the version
(`…/bundles/<appId>/<version>/SecurityConsole.js`), so the frame keeps serving
the previous build until it reloads and the change reaches the CDN. Reload the
extension before concluding a change did not work.

### Installing into a CMS instance

The CMS reads apps from the OCP account it is bound to, which is not necessarily
the account your API key belongs to. If the app does not appear in the CMS, check
that first:

```bash
npx --yes @optimizely/ocp-cli-v2 accounts whoami        # the key's account
npx --yes @optimizely/ocp-cli-v2 directory listInstalls <an-app-that-is-visible>
```

Comparing against an app that *is* visible in the CMS identifies the right
tracker immediately. Then install to that account:

```bash
npx --yes @optimizely/ocp-cli-v2 directory install <appId>@<version> <trackerId>
```

### Version semantics

| Suffix | Who can see it |
| --- | --- |
| `-dev.N` | Your own OCP account only. No review. Not listed in the App Directory. |
| `-beta.N` | Anyone with the share link. |
| `-private` | Named accounts. |
| `1.0.0` | Publicly listed, after Optimizely review. |

---

## Testing

```bash
npm test                                    # all suites
npx vitest run src/tests/optimizer.test.ts  # one suite
```

The suites cover the compile engine — CSP construction, header splitting,
response headers — and validation, including untrusted import payloads and
header-injection defences. The console itself is not unit tested; it is verified
in the CMS.

---

## Licence

MIT.
