# Frontend runtime SDK — `@optimizely/cms-extensibility-sdk`

The browser-side SDK the extension bundle imports. It is **injection-point agnostic**: the same `register(...)` API is used for `sidebar` and `view` alike — the surface is decided by `app.yml` + the entry-file name, not by the React code.

## `register`

An entry file registers a factory that returns the React element to mount. The factory receives the `ExtensionContext`.

```tsx
// src/cms-ui-extensions/unsplash/UnsplashGallery.view.tsx
import {AxiomProvider, Box, Button} from '@optiaxiom/react';
import {register, type ExtensionContext} from '@optimizely/cms-extensibility-sdk';

function UnsplashGallery({context}: {context: ExtensionContext}) {
  // ... component using context ...
  return <Box>…</Box>;
}

register((context) => (
  <AxiomProvider>
    <UnsplashGallery context={context} />
  </AxiomProvider>
));
```

- Call `register` exactly once per entry file, at module top level.
- Wrap the UI in the design-system provider (`AxiomProvider` from `@optiaxiom/react`) so it inherits CMS look-and-feel.
- The same pattern is used for a `sidebar` entry (`*.sidebar.tsx`) — only the file name and the `app.yml` injection point differ.

## UI components — build with `@optiaxiom/react`

Axiom (`@optiaxiom/react`) is the Optimizely design system and the **default** way to build extension UI. Prefer Axiom components over raw HTML elements: they match the CMS look-and-feel automatically, handle accessibility and theming, and keep the extension visually consistent with the host — hand-rolled HTML + inline styles will look foreign inside CMS and re-implement what Axiom already provides.

```tsx
// ✅ preferred — Axiom components
import {AxiomProvider, Flex, TextField, Button, Grid} from '@optiaxiom/react';

<Flex flexDirection="row" gap="8">
  <TextField value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
  <Button appearance="primary" onClick={() => void runSearch()}>Search</Button>
</Flex>

// ⚠️ avoid unless Axiom has no equivalent — raw HTML + inline styles
<div style={{display: 'flex', gap: 8}}>
  <input value={query} onChange={(e) => setQuery(e.target.value)} />
  <button type="button" onClick={() => void runSearch()}>Search</button>
</div>
```

- **Default to Axiom.** Reach for a raw HTML element only when Axiom genuinely has no equivalent for what you need (e.g. a plain `<img>` thumbnail, or an element Axiom does not wrap). When you do fall back, keep it minimal and note why.
- `AxiomProvider` must wrap the tree (see the `register` example) for Axiom components to render correctly.
- The sandbox rules below still apply to Axiom: use `<Button onClick={...}>`, never a submit-driven `<form>`.

## `ExtensionContext`

The context handle passed to the factory. Key members on `context.extension`:

| Member | Purpose |
| --- | --- |
| `invokeFunction(functionId, payload)` | Call the app's backend function (the one that `accepts: cms_ui_extension`). Returns `{ statusCode, data }`. This is how the browser reaches external APIs / secrets without exposing them. |
| `setReady()` | Signal to the host that the extension has mounted and is ready. Call once after initial setup (e.g. in a mount effect). |
| `getDefinition()` | Returns the extension's definition (`id`, `displayName`, `type`, …) as registered/discovered. Useful for diagnostics. |

### Calling the backend

```tsx
const response = await context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, {
  action: 'search',
  params: {query, page, perPage}
});
const {statusCode} = response;
const envelope = response.data;   // shape defined by your backend function
```

- `CMS_EXTENSION_FUNCTION_ID` identifies which backend function to call (keep it in a shared constants module).
- Treat the response defensively: check `statusCode` and validate the `data` envelope shape before use.
- Do all secret handling and third-party HTTP in the backend function — the browser bundle is public.

### Signalling readiness

```tsx
useEffect(() => {
  void context.extension.setReady();
}, [context]);
```

## Sandbox constraints — the extension runs in a restricted iframe

CMS mounts the extension bundle inside a **sandboxed iframe** that does **not** grant `allow-forms`. Anything that depends on the browser's default form/navigation behavior is silently blocked — the action just does nothing, and the only signal is a console error like:

```
Blocked form submission to '' because the form's frame is sandboxed and the 'allow-forms' permission is not set.
```

Critically, the browser blocks a native `<form>` submit **before** React's `onSubmit` handler runs, so a submit-driven button appears completely dead with no error surfaced in the UI.

Author the UI so every action is driven by an explicit JS event handler, never by default form/navigation behavior:

```tsx
// ✅ works in the sandbox
const runSearch = async () => { /* ... invokeFunction ... */ };

<input
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(); } }}
/>
<button type="button" onClick={() => void runSearch()}>Search</button>

// ❌ silently blocked — <form> submit never reaches React
<form onSubmit={onSubmit}>
  <button type="submit">Search</button>
</form>
```

Rules of thumb for the sandbox:

- **No `<form>` submission.** Use `<button type="button" onClick={...}>` and handle Enter via the input's `onKeyDown`. If you keep a `<form>` for semantics, it must not rely on submission to do work.
- **Assume the sandbox is restrictive**, not just for forms. Don't rely on top-level navigation, `window.open`/popups, or downloads via anchor `download`. Drive everything through the SDK (`invokeFunction`) and in-app state; open external links with `target="_blank" rel="noopener noreferrer"` (plain links render fine).
- **Surface failures yourself.** Because blocked actions produce only a console error, add visible error state so a dead action is diagnosable.

## `view`-specific guidance

A `view` extension is a full page, not scoped to a content item. Do not assume a "current content item" in a `view`. It can still call the same backend function and use the same context API; it just renders more like a standalone app page (wider layout, its own navigation/pagination).

## Do / don't

- **Do** keep API keys, tokens, and third-party calls in the backend function.
- **Do** name the file `<EntryPoint>.<injectionPoint>.tsx` so it is discovered.
- **Do** build the UI with `@optiaxiom/react` components (wrapped in `AxiomProvider`); drop to raw HTML only where Axiom has no equivalent. See [UI components](#ui-components--build-with-optiaxiomreact).
- **Don't** import Node-only APIs into the browser bundle.
- **Don't** call `register` more than once per entry file.
- **Don't** rely on `<form>` submission (or other default browser behaviors like popups/top-level navigation) — the extension runs in a sandboxed iframe without `allow-forms`; use `onClick`/`onKeyDown` handlers instead. See [Sandbox constraints](#sandbox-constraints--the-extension-runs-in-a-restricted-iframe).
