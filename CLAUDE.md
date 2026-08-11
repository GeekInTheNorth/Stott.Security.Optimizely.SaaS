# Working in this repository

An OCP app that puts a security console inside Optimizely CMS (SaaS) and serves
compiled HTTP response headers to a customer's front end. [README.md](README.md)
covers what it is and how to deploy it; this file covers what you need to know
before changing it.

## Commands

```bash
npm run lint && npm run typecheck && npm test && npm run build
npx --yes @optimizely/ocp-cli-v2 app validate
```

Run all of them before deploying. There is no local preview — a CMS UI extension
only runs inside the CMS — so a mistake costs a full publish cycle. The deploy
loop is in the README.

## Architecture

Two halves that never share a process:

```
console (browser)                    backend (OCP functions)
  SecurityConsole.view.tsx             CmsExtension.ts   ← invokeFunction only
  console/*.tsx                          ↕ core/         ← the compile engine
  lib/client.ts  ──invokeFunction──▶     ↕ lib/storage   ← kvStore
                                       CompiledHeaders.ts ← public GET endpoint
            shared/  ← types and constants used by both
```

The console never constructs a URL. It calls
`context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, { action, params })`
and the backend switches on `action`. Adding an operation means adding to
`Actions` in `shared/contracts.ts`, a `case` in `CmsExtension.perform()`, and a
method on the client — **all three**; a missing `case` fails as
`unknown_action` at runtime, which type-checking will not catch.

`shared/` ships to the browser *and* runs in the OCP function sandbox. Types and
pure helpers only: no node builtins, no browser globals, no secrets.

### The compile pipeline

`compileWithDiagnostics(config)` in `backend/core/index.ts` is the single entry
point. It produces `HeaderDto[]` plus diagnostics, and is used by publish,
preview and status alike, so all three agree by construction.

CSP construction (`core/csp.ts`) inverts the domain-based model into
directive-first output, then `core/optimizer.ts` packs directives into as few
headers as will fit. Thresholds, in bytes:

| | |
| --- | --- |
| `SPLIT_THRESHOLD` 8100 | start splitting across multiple headers |
| `SIMPLIFY_THRESHOLD` 12000 | collapse groups to their primary directive |
| `TERMINAL_THRESHOLD` 15500 | emit **nothing** |

That last one is why diagnostics exist at all. Past it a site silently loses its
CSP entirely, and the console is the only place that can ever surface it.

## Invariants

Break these and something quietly stops being true.

**Draft is not live.** Saving writes `config:v1:*`. Only publishing writes
`compiled:v1:*`, which is what the public endpoint serves. Anything that changes
what a customer's site serves must go through publish.

**Anything derived from the stored draft must be refreshed after a save.**
`useSecurityConfig.refreshStatus()` exists for this. Pending headers and
diagnostics both go stale the instant a draft is written, and stale diagnostics
mean a dropped policy goes unreported.

**Diagnostics come from `analyseCsp()`, never inferred.** Several distinct
outcomes produce zero headers — disabled, nothing configured, no directives
granted, dropped for size. Guessing from an empty array reports the wrong one,
which is worse than reporting nothing. Regression tests guard this.

**There are three header actions, not two.** `isRemoval` → delete, `isReplacement`
→ set, neither → **append**. CSP appends because a split policy legitimately
spans several `Content-Security-Policy` headers; treating it as a replacement
would discard all but the last.

**A header name is chosen once.** The add dialog is the only place a custom name
is entered; from then on it is as fixed as one of the standard eight, and every
card shows its name read-only. Renaming a live header is a delete plus an add —
two publishes on a customer's site — and a text field makes that look like one
harmless edit. `isCustomHeader` on `HeaderRowModel` says a name is the customer's,
not that it can be edited; it is what decides deletability and whether there is
metadata to show.

**The headers tab reconciles rows by id, not by name.** `rows` comes from the
backend — it is what knows which headers are standard — and reflects the *stored*
draft, so `ResponseHeaders` overlays the local draft on top of it and appends
anything added since the load. Matching uses `CustomHeaderConfig.id`, the identity
the edit and delete handlers key on; materialised rows have no id and fall back to
the name.

**Validation guards storage.** `CompiledHeaders` serves stored output without
re-validating, and import accepts arbitrary pasted JSON, so `lib/validation.ts`
is the only thing between a customer and a malformed header reaching a live
site. It also rejects a source with no directives, which is why both source
dialogs insist on one: a directive-less source would leave a draft that cannot be
saved, reported by the server rather than the field that caused it. It rejects
non-token header names and control characters for exactly this
reason — response splitting. Those two rules live in `shared/header-rules.ts`
because the console applies them to a custom header name as it is typed; the
backend is still what enforces them, and both halves must reject the same thing
or the console will build a document that the save refuses.

**Nonce and strict-dynamic are *sources*, not settings.** They are granted to
directives like any other source. The `IsNonceEnabled` booleans in the PaaS
project are legacy and read only when remapping old exports; nothing in the
compile path consults them.

**`ALL_DIRECTIVES` order is emission order.** Reordering it changes every
compiled header. The directive list shown in the console
(`console/directives.ts`) is a separate *display* order that matches the PaaS UI
— the two are deliberately different and both have 19 entries.

**Engine parity with the PaaS project.** `core/optimizer.ts`, `core/csp.ts` and
`core/headers.ts` are faithful ports of `CspOptimizer.cs`, `CspService.cs` and
`CustomHeaderService.cs`. Where behaviour diverges it is commented as such.
Changing packing or directive construction on a hunch will silently produce
different policies from the same configuration.

## What the extension environment allows

The console runs in a **sandboxed, cross-origin iframe** served from the OCP CDN
while the document origin is the CMS. This is not incidental — several obvious
approaches are unavailable:

- **No file downloads.** An anchor carrying `download` does nothing at all: no
  file, no error, nothing to catch. Same for popups and top-level navigation.
  The clipboard works. Export offers copy plus always-visible selectable text.
- **No host fonts.** The frame receives no font CSS from the CMS, and
  `@font-face` does not cascade across documents, so Axiom's bundled Roboto is
  what actually renders. It cannot be dropped without falling back to
  `system-ui`.
- **Fonts cannot be separate files.** Injected CSS resolves relative URLs against
  the CMS origin, not the CDN the bundle came from, so they 404. They are
  inlined as data URIs; `vite.ui.config.mjs` trims them to Latin subsets, which
  roughly halves the gzipped bundle.
- **React cannot be externalised**, despite the host providing an import map for
  `react` and `react-dom`. The extensibility SDK imports `react-dom/client`,
  which the map does not name and has no prefix entry for, so the specifier
  would fail to resolve and the extension would not load. It is also
  all-or-nothing: `react-dom` must match `react` exactly.

## Axiom (`@optiaxiom/react`)

The design system. Use its components and tokens for everything visual; the one
stylesheet, `console/card-grid.css`, exists only because Axiom's breakpoints
cannot express what it needs.

Traps worth knowing before `tsc` finds them for you:

- **`Flex` is deprecated — use `Group`.** Different defaults, so it is never a
  rename: `Flex` is `column` with `gap="16"`, `Group` is `row` with no gap.
  `npx @optiaxiom/codemod flex-to-group src/` materialises the implicit defaults
  correctly but leaves dead imports behind.
- **`Banner` stacks its children.** Its content wrapper is a column flex
  container, so every element among the children lands on its own line. The
  `Notice` wrapper in `console/ui.tsx` handles this — use it rather than
  `Banner` directly, and use its `title` prop for a second line.
- **`Text` renders a `<p>`.** It cannot contain block elements or nest.
- **`Select` is data-driven** — an `options` prop, not `ListboxItem` children.
- **`maxW` takes size tokens** (`xs`/`sm`/`md`/`lg`), not pixel values.
- **`Checkbox` and `Switch` take a `description` natively.** Do not hand-roll a
  label-plus-caption stack.
- **`Textarea` caps `maxRows` at 5.** Too small to review a document in; use a
  scrolling block for anything longer.
- **Breakpoints are `sm` 600px and `md` 900px only**, and cannot be extended.

## Common changes

**A new standard response header.** Add it to `StandardHeaderNames` and
`STANDARD_HEADERS` in `shared/standard-headers.ts` with its description, allowed
values and `propertyType`. Nothing else — the console builds its editor from that
metadata, and the backend materialises unconfigured standard headers as
`Disabled` rows automatically.

**A new CSP directive.** Add it to `Directives` and to `ALL_DIRECTIVES` in
`shared/constants.ts`, in the position it should be emitted. If it belongs to a
directive group, update `groupDirectives()` in `core/optimizer.ts`. Add a
friendly description to `console/directives.ts`, and cover it in
`tests/csp.test.ts`.

**A new console tab.** Add to `TABS` and a `TabsContent` in
`SecurityConsole.view.tsx`, and a component under `console/`. Panels carry
`mt="16"`.

**A new backend operation.** `Actions` in `shared/contracts.ts`, a `case` in
`CmsExtension.perform()`, a method on `createClient()`. Errors should be one of
the typed classes in `backend/lib/errors.ts` so `toErrorResponse` maps them to a
sensible status and an `ErrorCodes` value the console can branch on.

## Rejected alternatives

**Storing configuration as CMS content types.** Periodically attractive, because
CMS content is versioned and would hand back who-changed-what-and-when for free —
the audit trail the PaaS product has and this one does not. It does not work from
here: `context.content` is read-only and returns metadata only, and backend
functions receive no CMS auth token. The app would have to ask every customer to
create an API client in their CMS, store its secret, and drive the Content
Management API itself — a per-customer setup burden and a credential to hold, in
exchange for audit. Key-value storage is the deliberate choice; the export in the
Tools tab is what mitigates its impermanence.

## Conventions

- **UK English**, in code, comments and user-facing copy.
- **Comments explain why, and do not expire.** No TODOs, no "for now", no dates,
  no narration of what the code used to do. If a decision has a rationale worth
  keeping, state it in the present tense.
- **Tests** are Vitest, under `src/tests/`, covering the engine and validation.
  The console is verified in the CMS rather than unit tested — so console changes
  need a real deploy before they are considered done.
