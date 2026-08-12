# App structure and build

For a new app, scaffold with the `"CMS UI Extensions Sample"` template (`ocp app init --template "CMS UI Extensions Sample"`, see [scaffolding.md](../cli-commands/scaffolding.md#init)) — it produces the layout below already wired (runtime, both SDKs, Vite configs, example entry files), so you adapt rather than build it from scratch. The rest of this doc describes what that layout is and why.

## Directory layout

```
my-app/
├── app.yml                       # runtime: node22-cms-ext + ui_extensions block
├── package.json                  # both SDKs + vite; build script builds the UI (and backend)
├── vite.ui.config.mjs            # UI bundle build — entry discovery via the SDK convention
├── vite.backend.config.mjs       # backend build (if the app has backend functions)
└── src/
    ├── cms-ui-extensions/        # FRONTEND: extension entry files + shared UI code
    │   ├── <group>/
    │   │   ├── <Entry>.sidebar.tsx
    │   │   └── <Entry>.view.tsx
    │   └── common/               # shared helpers (runtime helpers, clipboard, etc.)
    └── backend/
        ├── functions/
        │   └── CmsUiExtension.ts # App.Function, accepts: cms_ui_extension
        └── lib/                  # API clients, secrets access
```

Only `cms-ui-extensions/` is special to this skill. `backend/` follows ordinary OCP app conventions (see the `ocp-app-development` skill).

## Entry-file naming convention

The single most important convention:

```
<EntryPoint>.<injectionPoint>.tsx
```

- `<EntryPoint>` must match the `entry_point` value in `app.yml` (e.g. `UnsplashGallery`).
- `<injectionPoint>` must match the injection point key (e.g. `view`), and must be one of `UI_EXTENSION_INJECTION_POINTS`.

Example: `app.yml` entry `{ entry_point: UnsplashGallery }` under `view:` ⇒ file `src/cms-ui-extensions/unsplash/UnsplashGallery.view.tsx`.

Because the Vite entry glob is built from `UI_EXTENSION_INJECTION_POINTS`, a correctly named file is discovered automatically — you do **not** edit the Vite config to register each extension.

## Runtime

`app.yml` must set:

```yaml
runtime: node22-cms-ext
```

This is the node22 runtime variant that adds CMS-extension build handling (the app's `build` script — run through whichever package manager the app declares — emits per-extension bundles; the builder extracts, hashes, and uploads them to the CDN at publish).

## Build output

The UI build emits one bundle per extension:

```
dist/cms-ui-extensions/<EntryPoint>.js
dist/cms-ui-extensions/manifest.json
dist/cms-ui-extensions/assets/…        # optional shared assets (icons, css)
```

At publish, these are uploaded to the OCP CDN under `bundles/<app_id>/<version>/`. CMS loads a bundle by its CDN URL, which it obtains from the Discovery API. The bundles are stripped from the running container image — they are served only from the CDN.

## package.json

Both SDKs appear in `dependencies`:

```json
{
  "dependencies": {
    "@optimizely/cms-extensibility-sdk": "1.0.1",
    "@optimizely/ocp-cms-ui-extensions-sdk": "1.0.0-beta.4"
  }
}
```

### The build script

A CMS-UI-extension app builds the backend and the UI bundles. The `vite build` calls below are package-manager-agnostic, so a two-step build is the same across managers:

```json
"build": "rimraf dist && vite build --config vite.backend.config.mjs && vite build --config vite.ui.config.mjs"
```

Make sure that the scripts are aligned in the package.json — see [../package-manager.md](../package-manager.md).

The **resolved** version of `@optimizely/cms-extensibility-sdk` (from the app's lockfile / installed `node_modules`) is what the platform records as the extension's `sdk_version` in the Discovery API.
