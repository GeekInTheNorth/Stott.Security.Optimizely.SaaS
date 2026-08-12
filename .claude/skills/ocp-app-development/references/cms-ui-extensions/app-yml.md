# `app.yml` — the `ui_extensions` block

CMS UI extensions are declared under a top-level `ui_extensions:` key. The block is validated by the `@optimizely/ocp-cms-ui-extensions-sdk` plugin during `ocp app validate`.

## Shape

```yaml
runtime: node22-cms-ext          # required for CMS UI extensions

ui_extensions:
  <injectionPoint>:              # one of UI_EXTENSION_INJECTION_POINTS (sidebar | view)
    - name: <unique-name>        # unique across the WHOLE ui_extensions block
      entry_point: <EntryPoint>  # unique across the WHOLE block; matches the entry-file <EntryPoint>
      display_name: <label>      # non-blank; shown to CMS users
```

Each injection point maps to a **list** of extension items. Each item has exactly three fields:

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | Stable identifier for the extension. Unique across all injection points. |
| `entry_point` | yes | Matches the `<EntryPoint>` segment of the entry file (`<EntryPoint>.<injectionPoint>.tsx`) and becomes the CDN bundle filename. Unique across all injection points. |
| `display_name` | yes | Human-readable label; must not be blank. |

Unknown injection-point keys and unknown item fields are rejected by the schema (the schema is generated from `UI_EXTENSION_INJECTION_POINTS` with `additionalProperties: false`).

## Full example

```yaml
name: unsplash-viewer
version: 1.0.0
runtime: node22-cms-ext

functions:
  cms_extension:
    entry_point: CmsUiExtension
    description: Backend proxy for the Unsplash extensions.
    accepts: cms_ui_extension          # marks this function as callable from extensions

ui_extensions:
  sidebar:
    - name: unsplash-viewer
      entry_point: UnsplashViewer
      display_name: Unsplash Viewer
  view:
    - name: unsplash-gallery
      entry_point: UnsplashGallery
      display_name: Unsplash Gallery
```

This declares two extensions (one `sidebar`, one `view`) plus a backend function they can call. The entry files would be:
- `src/cms-ui-extensions/unsplash/UnsplashViewer.sidebar.tsx`
- `src/cms-ui-extensions/unsplash/UnsplashGallery.view.tsx`

## The backend function link

A function the extension calls must declare `accepts: cms_ui_extension` in its `functions:` entry. That is what makes it invocable via `context.extension.invokeFunction(...)` from the browser bundle. See backend-proxy.md.
