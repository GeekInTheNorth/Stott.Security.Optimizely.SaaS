# Injection points

An **injection point** is the CMS surface an extension renders at. It is declared as a key under `ui_extensions:` in `app.yml`, and matched by the `.<injectionPoint>.tsx` segment of the entry file name.

## The canonical set

The supported injection points are defined by a single source of truth: the `UI_EXTENSION_INJECTION_POINTS` tuple exported from `@optimizely/ocp-cms-ui-extensions-sdk`. Everything else (the TypeScript union type, the `app.yml` JSON schema, and the Vite entry-file glob) is derived from it.

Currently supported:

| Injection point | Surface | Scoped to a content item? |
| --- | --- | --- |
| `sidebar` | A panel in the CMS content-editing sidebar | Yes — rendered alongside the content being edited |
| `view` | A full-page widget with its own page/route in CMS | No — a standalone page, not tied to one content item |

Other surfaces (e.g. `toolbar`, `content-editor`, `settings`) are **not** currently host-supported and are absent from the tuple. Do not declare them until they appear there — the schema will reject unknown keys and the CMS host will not mount them.

## Multiplicity

Each injection point is a **list**. An app may declare:
- multiple extensions under the same injection point (e.g. two `view` extensions), and
- extensions across several injection points at once.

```yaml
ui_extensions:
  sidebar:
    - name: quick-panel
      entry_point: QuickPanel
      display_name: Quick Panel
  view:
    - name: analytics-dashboard
      entry_point: AnalyticsDashboard
      display_name: Analytics Dashboard
    - name: media-gallery
      entry_point: MediaGallery
      display_name: Media Gallery
```

The only constraint is global uniqueness of `name` and `entry_point` across the whole block (see validation.md).

## `sidebar` vs `view` — choosing

- Use **`sidebar`** when the UI augments the current content item (previews, status, related-record lookups) — it renders in context while editing.
- Use **`view`** for a standalone tool that is not about one specific content item (a browse/gallery page, a dashboard, an admin screen). A `view` gets its own page in CMS, so it should not assume a "current content item" context.

## Why `entry_point` uniqueness matters

The built bundle is uploaded to the CDN at a path keyed only by `entry_point` (`bundles/<app_id>/<version>/<EntryPoint>.js`) — the injection point is **not** part of the path. Two extensions sharing an `entry_point` (even under different injection points) would collide on the same bundle URL. The SDK validator blocks this at build time.
