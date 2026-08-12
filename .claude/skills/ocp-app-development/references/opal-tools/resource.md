# Opal @resource Decorator and Proteus UI

- [How it works](#how-it-works)
- [resource decorator](#resource-decorator)
- [Proteus document structure](#proteus-document-structure)
- [Components](#components)
- [Data binding](#data-binding) — static vs Value-bindable props, `Value`, `Map`, `MapIndex`, `Show`, `Zip`, `Concat`
- [Event handlers (onClick)](#event-handlers-onclick)
- [Styling props and design tokens](#styling-props-and-design-tokens)
- [Common mistakes](#common-mistakes)

## How it works

Proteus is a declarative UI framework that renders rich result cards in the Opal chat frontend. Instead of showing raw JSON, tool results are rendered as formatted cards with charts, tables, badges, and action buttons.

1. The `@tool` method executes and returns raw data (`{ data, message }`) as normal
2. The `@resource` method returns a **Proteus spec** — a JSON document describing how to render that data
3. The tool's `ToolConfig` has a `uiResource` field (set to the `@resource` URI — see [resource decorator](#resource-decorator) below) that links them
4. After the tool executes, Opal fetches the Proteus spec and renders the card, binding the tool's response data into it

**SDK requirement:** `@optimizely-opal/opal-tool-ocp-sdk` **v1.1.6+**

## resource decorator

```typescript
import { resource } from '@optimizely-opal/opal-tool-ocp-sdk';
import { APP_ICON_DATA_URI } from '../lib/constants';

export class MyTool {
  @resource({
    uri: 'ui://my-app/results',
    name: 'results',
    description: 'Display template for tool results',
    mimeType: 'application/vnd.opal.proteus+json',
  })
  public async getResults(): Promise<string> {
    return JSON.stringify({
      $type: 'Document',
      appName: 'My App',           // must match display_name in app.yml
      appIcon: APP_ICON_DATA_URI,  // base64-encoded icon from src/lib/constants.ts
      title: { $type: 'Value', path: '/data/title' },
      body: [
        { $type: 'Text', children: { $type: 'Value', path: '/message' } },
      ],
    });
  }
}
```

```typescript
interface ResourceConfig {
  uri: string;         // 'ui://my-app/resource-name' — must be unique, matches uiResource in ToolConfig
  name: string;        // programmatic name
  description: string; // describes the resource
  mimeType: string;    // always 'application/vnd.opal.proteus+json' for Proteus
}
```

The resource handler must return a JSON **string** — serialize the Proteus spec with `JSON.stringify()`.

`@resource` methods follow the same side-effect import registration pattern as `@tool` — they can be on any class re-exported from `index.ts`, not just the entry point class itself.

**App icon:** `APP_ICON_DATA_URI` is the app icon base64-encoded as a data URI string. If the constant doesn't exist in `src/lib/constants.ts`, generate it:
```bash
echo "export const APP_ICON_DATA_URI = 'data:image/svg+xml;base64,$(base64 < assets/icon.svg | tr -d '\n')';" >> src/lib/constants.ts
```

Link the resource to a `@tool` by setting `uiResource` in `ToolConfig` to the same `uri` — it must match exactly:

```typescript
@tool({
  name: 'myapp_run_report',
  description: '...',
  endpoint: '/tools/myapp_run_report',
  uiResource: 'ui://my-app/results',  // must match @resource uri exactly
  parameters: [...],
})
public async runReport(params: RunReportParams) {
  return { data: { title: 'Q1 Report', rows: [...] }, message: 'Report generated' };
}
```

## Proteus document structure

```typescript
{
  $type: 'Document',         // REQUIRED — missing this renders an empty card silently
  body: ProteusNode,         // REQUIRED — main content
  title?: ProteusNode,
  subtitle?: ProteusNode,
  titleIcon?: string,        // data URI or URL for an icon displayed next to the title
  appName?: string,          // must match display_name in app.yml
  appIcon?: string,          // data URI — use APP_ICON_DATA_URI constant
  appearance?: 'default' | 'inline', // 'default' = card chrome, 'inline' = no chrome
  actions?: ProteusNode,  // single node — wrap multiple buttons in a Group
  blocking?: boolean,        // hides chat prompt until user interacts
  compact?: boolean,         // constrains body height with scroll
  data?: object,             // initial data for state management (rarely needed)
  meta?: any,                // metadata not consumed by Proteus
}
```

Every component in Proteus — whether it goes in `body`, `title`, `subtitle`, or `actions` — follows the same structure:

```typescript
{ $type: 'ComponentName', children: ..., ...props }
```

- `$type` identifies what the component is (`'Text'`, `'Group'`, `'Map'`, `'Badge'`, etc.)
- `children` is its content — a string, another component, or an array of components
- Additional props are component-specific (`flexDirection`, `gap`, `path`, etc.)

Components nest inside each other. `Group` wraps layout, `Map` iterates an array, `Value` reads from the tool response. The full list of available components is in the [Components](#components) section below.

Here is what a complete document looks like:

```typescript
{
  $type: 'Document',
  appName: 'My App',
  appIcon: APP_ICON_DATA_URI,

  // title and subtitle: static string or a Value node pulled from tool response
  title: { $type: 'Value', path: '/data/title' },
  subtitle: 'Report Summary',

  // body: array of components — the main content of the card
  body: [
    { $type: 'Text', children: { $type: 'Value', path: '/message' } },
    {
      $type: 'Map',
      path: '/data/rows',         // iterates over tool response data.rows
      children: {
        $type: 'Group',
        flexDirection: 'row',
        gap: '4',
        children: [
          { $type: 'Text', children: { $type: 'Value', path: 'name' } },
          { $type: 'Badge', children: { $type: 'Value', path: 'status' } },
        ],
      },
    },
  ],

  // actions: single node — wrap multiple buttons in a Group
  actions: {
    $type: 'Group',
    flexDirection: 'row',
    gap: '4',
    children: [
      { $type: 'Action', appearance: 'default', children: 'Cancel', onClick: { message: 'Cancelled' } },
      { $type: 'Action', appearance: 'primary', children: 'Confirm', onClick: { interaction: 'confirm' } },
    ],
  },
}
```

**Critical rules:**
- Root `$type` must be `"Document"` — without it nothing renders, no error is shown
- All components use `$type` (with `$`) — NOT `type`. The `type` field is for component-specific props (e.g., Chart `type: "bar"`)
- `appName` must match `display_name` from `app.yml` exactly

## Components

Components are the building blocks placed inside `body`, `title`, `subtitle`, and `actions`. They fall into four groups:

- **Layout** — structure and arrange other components on the card (`Group`, `Card`, `Separator`)
- **Display** — render text, images, and labels from the tool response (`Text`, `Badge`, `Image`, etc.)
- **Data** — visualise structured data as charts or tables (`Chart`, `DataTable`)
- **Form** — buttons and inputs for user interaction (`Action`, `Field`, `Input`, etc.)

**Component selection guide — always use the richest appropriate component:**
- Date or timestamp field → `Time` (not a pre-formatted string)
- Email address or URL → `Link` with `href` (not plain `Text`)
- Status, category, or label → `Badge` with `intent` (not plain `Text`)
- Person or user name → `Avatar` alongside `Text`
- Image URL → `Image`
- Labeled section of content → `Card` + `CardHeader` (not just `Heading` + `Separator`) — `Card` must only contain the `CardHeader`; place any `Map` or `Chart` that follows as a sibling directly in `body`, not inside the `Card`
- Entire card that navigates somewhere → `CardLink` (not an `Action` button)
- Formatted number or currency → `{ $type: "Value", path: "...", formatter: "Number" }` (not a pre-formatted string)

### Layout

Used in `body` to arrange other components. `Group` is the primary container — it works like a CSS flexbox row or column.

```typescript
// Row of items with spacing
{ $type: 'Group', flexDirection: 'row', alignItems: 'center', gap: '4', children: [
  { $type: 'Text', children: { $type: 'Value', path: 'name' } },
  { $type: 'Badge', children: { $type: 'Value', path: 'status' } },
] }
```

| Component | Key props | Notes |
|-----------|-----------|-------|
| `Group` | `flexDirection`, `alignItems`, `gap`, `children` | Flex container. `gap` only supports even values: `'2'`, `'4'`, `'6'`, `'8'` — odd values silently drop children |
| `Card` | `children` | Card container |
| `CardHeader` | `children`, `description`, `addonBefore`, `addonAfter` | Must be inside `Card`, not `CardLink` |
| `CardLink` | `children`, `href` | Clickable card — does NOT provide Card context, cannot contain CardHeader |
| `Separator` | — | Horizontal divider |

### Display

Used in `body` (or inside a `Group`) to render values from the tool response as text, labels, or media.

```typescript
// Text with a value from tool response
{ $type: 'Text', fontSize: 'sm', color: 'fg.tertiary',
  children: { $type: 'Value', path: '/data/description' } }

// Badge showing a status
{ $type: 'Badge', intent: 'success', children: 'Active' }

// Avatar — size uses token values, NOT numeric pixels
{ $type: 'Avatar', name: { $type: 'Value', path: '/data/userName' }, size: 'md' }

// Image — size uses numeric pixel values
{ $type: 'Image', src: { $type: 'Value', path: '/data/imageUrl' }, alt: 'Photo', size: '32' }
```

| Component | Key props | Notes |
|-----------|-----------|-------|
| `Text` | `children`, `fontSize`, `fontWeight`, `color`, `lineClamp` | |
| `Heading` | `children`, `level` (`"1"`–`"4"`) | |
| `Link` | `children`, `href`, `target` | `target: '_blank'` for new tab |
| `Badge` | `children`, `intent` | `intent`: `information`, `success`, `warning`, `danger`, `neutral`, `primary` |
| `Avatar` | `name`, `src`, `size`, `colorScheme` | Pass the **full name** (e.g. `'Alice Johnson'`) — Avatar generates initials from it automatically. Do NOT pre-compute and pass initials (e.g. `'AJ'`) — a single word has no space so Avatar only shows one letter. Empty `name` renders a neutral placeholder. `size` token values: `'xs'`–`'xl'`. `colorScheme`: `'purple'` or `'neutral'` — static, not Value-bindable. |
| `Image` | `src`, `alt`, `size` | `size` uses numeric pixel values e.g. `'32'`. Use `size` prop — `maxH` with px values is not supported |
| `Time` | `date`, `showDate`, `showTime` | Crashes if `date` is `undefined` |

### Data

Used in `body` to visualise arrays of data from the tool response as charts or tables.

```typescript
// Bar chart — only `data` supports Value paths; xAxisKey and series must be static
// Normalize tool response rows to fixed keys (e.g. label/value) so static spec always matches
{ $type: 'Chart', type: 'bar', layout: 'vertical', xAxisKey: 'label',
  data: { $type: 'Value', path: '/data/rows' },
  series: [{ dataKey: 'value', name: 'Sessions' }] }  // series must be a static array

// Table — columns use { header, accessorKey }; only data supports Value paths
{ $type: 'DataTable',
  columns: [{ header: 'Name', accessorKey: 'name' }, { header: 'Count', accessorKey: 'count' }],
  data: { $type: 'Value', path: '/data/rows' } }
```

| Component       | Key props                                      | Notes                                                                                                                                                      |
|-----------------|------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Chart`         | `type`, `layout`, `xAxisKey`, `data`, `series` | Only `data` supports Value paths — `xAxisKey` and `series` must be static. Place directly in `body` — do NOT wrap in any container (`Group`, `Card`, etc.) |
| `DataTable`     | `columns`, `data`                              | Only `data` supports Value paths. `columns` must be a static array of `{ header, accessorKey }` objects                                                    |
| `ImageCarousel` | `images`, `title`                              | Carousel of images                                                                                                                                         |

**Chart notes:**
- `type`: `"bar"` or `"line"`
- `layout`: `"horizontal"` (default) or `"vertical"` — vertical recommended for 5+ items or long labels
- Max 10 items — bucket overflow into an "Other" bar with the summed value
- `layout` requires `@optiaxiom/proteus` v0.1.24+
- Because `xAxisKey` and `series` must be static, normalize the tool response to use fixed keys (e.g. always `label` and `value`) so the static spec always matches

### Form

Used in `body` or `actions` for buttons and user input. `Action` is the most common — it triggers an `@interaction` or opens a link when clicked.

```typescript
// Primary button in actions — sends a message when clicked
{ $type: 'Action', appearance: 'primary', onClick: { message: 'Done' }, children: 'Done' }

// Button inside a Map row — passes the current row's id to an interaction
{ $type: 'Action', children: 'View',
  onClick: { interaction: 'view_item', params: { id: { $type: 'Value', path: 'id' } } } }
```

| Component | Key props | Notes |
|-----------|-----------|-------|
| `Action` | `children`, `appearance`, `onClick` | Button. `appearance`: `default`, `primary`, `danger`, `subtle` |
| `CancelAction` | `children` | Cancel/dismiss button |
| `Field` | `label`, `children`, `description`, `required` | Label/description wrapper for inputs |
| `Input` | `name`, `placeholder`, `type`, `required` | `type` supports `text`, `number`, `email`, `password`, `url`, `date`, `search`, `hidden` |
| `Textarea` | `name`, `placeholder`, `rows`, `required` | |
| `Select` | `name`, `options`, `required` | Dropdown — visual trigger is broken; use `Input` instead |
| `Switch` | `name`, `children`, `description` | Toggle |
| `Range` | `min`, `max`, `step`, `marks` | Range slider |

**Note:** Forms with data submission do not fully work — use display-only cards when no user interaction is needed.

## Data binding

Use `{ $type: "Value", path: "..." }` to read a value from the tool's response and render it in the card. The path follows the shape of the response object — a tool returning `{ data: { title: 'Q1 Report', rows: [...] }, message: 'Done' }` would use:

- `"/data/title"` → `"Q1 Report"` — fields inside `data` need the `/data/` prefix
- `"/message"` → `"Done"` — root-level fields are accessed directly
- `"/title"` → nothing — common mistake; `title` lives inside `data`, not at root

### Static props vs Value-bindable props

Not all props support `{ $type: "Value" }` dynamic binding:

**Value-bindable** — content and data props: `children`, `href`, `src`, `name`, `date`, and the `data` prop on `Chart`/`DataTable`.

**Static only** — `intent`, `colorScheme`, `appearance`, `color`, `size`, `fontSize`, `fontWeight`, `xAxisKey`, `series`, `columns`, `description` (CardHeader). Binding these via `Value` fails silently — the card does not render.

For token variation that depends on data (e.g. a badge colour per status), pre-compute the token in the tool function and render one `Show`-gated component per variant:

```json
{ "$type": "Show", "when": { "==": [{ "$type": "Value", "path": "/data/status" }, "active"] },
  "children": { "$type": "Badge", "intent": "success", "children": "Active" } }
```

### Value — read from tool response

```json
{ "$type": "Value", "path": "/message" }
{ "$type": "Value", "path": "/data/title" }
{ "$type": "Value", "path": "/data/items/0/name" }
```

Inside a `Map`, paths are **relative** to the current item — no leading `/`. Given a tool that returns `{ data: { rows: [{ name: 'Alice', status: 'active' }, ...] } }`:

```json
{
  "$type": "Map",
  "path": "/data/rows",
  "children": {
    "$type": "Group",
    "flexDirection": "row",
    "gap": "4",
    "children": [
      { "$type": "Text", "children": { "$type": "Value", "path": "name" } },
      { "$type": "Badge", "children": { "$type": "Value", "path": "status" } }
    ]
  }
}
```

`path: "name"` and `path: "status"` are relative — they refer to fields on each item in the `rows` array, not the full response root.

`Map` also accepts `separator` (a component rendered between items) and `flat` (flattens nested arrays before iterating).

Formatters:
```json
{ "$type": "Value", "path": "/data/count", "formatter": "Number" }
{ "$type": "Value", "path": "/data/createdAt", "formatter": "DateTime" }
{ "$type": "Value", "path": "/data/price", "formatter": { "type": "Number", "options": { "style": "currency", "currency": "USD" } } }
```

### MapIndex — current iteration index

Inside a `Map`, use `MapIndex` to get the zero-based index of the current item:

```json
{ "$type": "Map", "path": "/data/rows", "children": {
  "$type": "Group", "flexDirection": "row", "gap": "4", "children": [
    { "$type": "MapIndex" },
    { "$type": "Text", "children": { "$type": "Value", "path": "name" } }
  ]
} }
```

Use `MapIndex` when items need to be numbered sequentially — no position field needed in the tool response. `MapIndex` is zero-based — if 1-based numbering is required, add a pre-computed `position` field to the data instead.

### Zip — combine multiple arrays

Merges multiple arrays row-wise into a single array of objects. Useful when the tool response has parallel arrays that need to be combined for a `Chart` or `DataTable`:

```json
{ "$type": "Zip", "sources": {
  "label": { "$type": "Value", "path": "/data/labels" },
  "value": { "$type": "Value", "path": "/data/values" }
} }
```

### Show — conditional rendering

Binary operators (`==`, `!=`, `<`, `<=`, `>`, `>=`) take an array of two values:
```json
{ "==": [{ "$type": "Value", "path": "/data/count" }, 0] }
```

`!!` (truthy check) is unary — it takes a **single value**, not an array:
```json
{ "!!": { "$type": "Value", "path": "/data/isActive" } }
```

Combine multiple conditions with `and` / `or`:
```json
{ "and": [
  { "!!": { "$type": "Value", "path": "/data/hasData" } },
  { ">":  [{ "$type": "Value", "path": "/data/count" }, 0] }
] }
```
→ show when `hasData` is truthy **and** `count > 0`

**`!` (falsy) does not work reliably** — use `{ "==": [value, false] }` instead.

### Concat — join strings

```json
{ "$type": "Concat", "children": ["Hello ", { "$type": "Value", "path": "/data/name" }] }
```

**Do not use `Concat` inside `Text` children** — renders empty. Pre-compute concatenated strings in the tool function instead.

## Event handlers (onClick)

`onClick` is a prop on the `Action` component. It tells Opal what to do when the user clicks the button — call a server-side `@interaction`, send a message, or open a URL.

```typescript
// In the Proteus spec — Action with onClick
{
  $type: 'Action',
  children: 'Open Report',
  appearance: 'primary',
  onClick: { action: 'openLink', url: { $type: 'Value', path: '/data/reportUrl' } }
}
```

When the button is inside a `Map`, use `params` to pass the current row's data to the interaction handler:

```typescript
// Inside a Map — each row gets its own button with row-specific data
{
  $type: 'Map',
  path: '/data/rows',
  children: {
    $type: 'Action',
    children: 'View',
    onClick: {
      interaction: 'view_item',           // must be a plain string — no Value here
      params: { id: { $type: 'Value', path: 'id' } }  // passes current row's id
    }
  }
}
```

All `onClick` handler types:

| Type                 | Syntax                                                  | Dynamic values               | Use for                           |
|----------------------|---------------------------------------------------------|------------------------------|-----------------------------------|
| Interaction          | `{ "interaction": "name" }`                             | No — plain string only       | Server-side action with form data |
| Interaction + params | `{ "interaction": "name", "params": { "key": Value } }` | Yes — `params` support Value | Row-specific data inside `Map`    |
| Message (static)     | `{ "message": "static string" }`                        | No                           | Simple confirmation message       |
| Message (dynamic)    | `{ "message": { "$type": "Map", ... } }`                | Yes — via `Map`/`Concat`/`Value` | Dynamic message built from tool response |
| Open link            | `{ "action": "openLink", "url": Value }`                | Yes                          | Open URL in new tab               |

**Interaction handler receives** the `params` values merged into `data.parameters`. In the handler:
```typescript
const params = data?.parameters ?? {};
const itemId = params?.itemId ?? '';  // from onClick params
```

**`interaction` field only accepts plain strings** — `Value`, `Concat`, or any template expression silently breaks rendering.

## Styling props and design tokens

All components accept Axiom sprinkle props for inline styling:

| Category   | Props                                                 | Example values                                                                                                             |
|------------|-------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| Spacing    | `p`, `px`, `py`, `m`, `mx`, `my`, `gap`               | `'2'`, `'4'`, `'8'`, `'12'`, `'16'`                                                                                        |
| Color      | `color`, `bg`, `borderColor`                          | `'fg.default'`, `'fg.secondary'`, `'fg.tertiary'`, `'fg.error.strong'`, `'bg.page'`, `'bg.secondary'`, `'border.tertiary'` |
| Size       | `w`, `h`, `maxW`, `maxH`, `size`, `flex`              | `'full'`, `'sm'`, `'md'`, `'lg'`, `'xl'`                                                                                   |
| Typography | `fontSize`, `fontWeight`                              | `'xs'`, `'sm'`, `'md'`, `'lg'`, `'xl'`, `'500'`, `'600'`                                                                   |
| Border     | `border`, `rounded`, `shadow`                         | `'1'`, `'sm'`, `'md'`, `'lg'`, `'full'`                                                                                    |
| Layout     | `display`, `overflow`, `justifyContent`, `alignItems` | `'grid'`, `'hidden'`, `'flex-end'`, `'center'`                                                                             |

**Image CSP:** `Image` `src` only allows `*.optimizely.com`, `data:`, and `blob:` URLs. Use `data:` URIs when testing with external images.

## Common mistakes

These all fail with **no error** — the card renders blank or partially:

| Issue                                                          | Symptom                                                  | Fix                                                                                 |
|----------------------------------------------------------------|----------------------------------------------------------|-------------------------------------------------------------------------------------|
| Missing `$type: "Document"` on root                            | Empty card                                               | Add `$type: "Document"`                                                             |
| Using `type` instead of `$type` on components                  | Components don't render                                  | Use `$type` everywhere                                                              |
| Wrong Value path — `/title` instead of `/data/title`           | `undefined`, shows nothing                               | Always use `/data/` prefix for nested fields                                        |
| `Group` with odd `gap` value (`'1'`, `'3'`)                    | Children silently dropped                                | Use only even values: `'2'`, `'4'`, `'6'`, `'8'`                                    |
| `Image` with `maxH: '32px'`                                    | Image not shown                                          | Use `size: '32'` instead                                                            |
| `rounded: true`                                                | Broken styling                                           | Use string tokens: `'sm'`, `'md'`, `'lg'`, `'full'`                                 |
| `Chart` inside any container (`Group`, `Card`, etc.)           | Overflow/overlap                                         | Place `Chart` directly in `body` array — never wrapped                              |
| `CardHeader` inside `CardLink`                                 | Crash                                                    | Use `Card` + `CardHeader` instead of `CardLink`                                     |
| `Time` with `undefined` date                                   | Crash                                                    | Guard: only render `Time` when date exists                                          |
| `Concat` inside `Text` children                                | Empty paragraph                                          | Pre-compute strings in the tool function                                            |
| `Card`/`CardHeader` inside `Map`                               | Empty card containers                                    | Use `Group` + `Text` + `Badge` instead                                              |
| `Map` inside `Card`                                            | Inner `Group` row layout broken — items stack vertically | Move `Map` out of `Card` into `body` directly; `Card` should only wrap `CardHeader` |
| `interaction` field using Value/Concat                         | Show block doesn't render                                | `interaction` must be a plain string                                                |
| Using `Select` component                                       | Dropdown doesn't open                                    | Visual trigger is broken — use `Input` instead                                      |
| Binding a static prop via `Value`                              | Prop ignored or entire card doesn't render — no error    | See Static props section in Data binding                                            |
| `Avatar` `colorScheme` set to an invalid token (e.g. `'blue'`) | Silent fail                                              | Only `'purple'` or `'neutral'` are valid; omit to render initials from `name`       |
| `actions` set to an array of components                        | Buttons don't render or only first shows                 | `actions` takes one node — wrap multiple buttons in a `Group`                       |
| Frontend caching                                               | Old spec shows after deploy                              | Hard-refresh (Cmd+Shift+R), start new chat thread                                   |
