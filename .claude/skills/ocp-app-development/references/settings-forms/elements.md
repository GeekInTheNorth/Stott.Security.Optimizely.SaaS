# Settings Form — Elements

- [File structure](#file-structure)
- [Element types](#element-types)
- [text](#text)
- [secret](#secret)
- [select](#select)
- [multi\_select](#multi_select)
- [toggle](#toggle)
- [button](#button)
- [oauth\_button](#oauth_button)
- [instructions](#instructions)
- [divider](#divider)
- [link\_button](#link_button)
- [Common mistakes](#common-mistakes)

Settings forms are declared in `forms/settings.yml`. Each form section maps to a tab in the app's settings UI. The file structure, element types, and their properties are covered here. For conditional visibility, disabled states, and validations see [conditional-logic.md](conditional-logic.md). For the TypeScript handler that runs when a section is submitted see [lifecycle/settings-form.md](../lifecycle/settings-form.md).

---

## File structure

A form contains one or more sections. Each section is a collapsible tab — form data is submitted per section, not all at once.

### Example

Sections are common — typically one for credentials, one for configuration, one for sync controls. Later sections can be locked behind `visible` or `disabled` predicates that reference properties set by earlier section handlers.

```yaml
sections:
  - key: auth
    label: Connection
    properties:
      - connected
    elements:
      - type: text
        key: instance_url
        label: Instance URL
        required: true
        help: "`https://{your-company}.example.com/`"
      - type: secret
        key: api_key
        label: API Key
        required: true
        help: Found in Settings > API Clients
      - type: button
        label: Connect
        action: test_connection
        style: primary

  - key: data_sync
    label: Data Sync
    visible:
      key: auth.connected
      equals: true
    elements:
      - type: toggle
        key: enable_webhooks
        label: Enable Realtime Updates via Webhooks
        help: When enabled, the app registers webhooks to receive real-time changes
      - type: button
        label: Save
        action: save
        style: primary
      - type: button
        key: fetch_all
        label: Fetch All Records Now
        action: fetch_all
        help: Trigger a full historical import from the external system
```

### Section properties

| Property     | Required | Description                                                                                                                                                                                     |
|--------------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `key`        | Yes      | Identifier used as the `section` argument in `onSettingsForm` and as the namespace for `storage.settings.get/put`                                                                               |
| `label`      | Yes      | Display name shown as the section tab in the UI                                                                                                                                                 |
| `properties` | No       | List of tracked state flags — values set via `storage.settings.patch(section, { flag: true })` in the lifecycle hook (see [Mutating formData](../lifecycle/settings-form.md#mutating-formdata)) |
| `elements`   | Yes      | Ordered list of UI elements rendered in the section                                                                                                                                             |
| `visible`    | No       | Hides the entire section when the condition is false (see [conditional-logic.md](conditional-logic.md))                                                                                         |
| `disabled`   | No       | Collapses and disables the entire section when the condition is true (see [conditional-logic.md](conditional-logic.md))                                                                         |

### Section `properties`

Named boolean flags set via `storage.settings.patch(section, { flagName: true })` — readable in predicates as `section.flagName`. Use for lifecycle-controlled state (e.g. `authorized`, `connected`), not for user-typed values.

---

## Element types

| Type                 | Purpose                                                                        |
|----------------------|--------------------------------------------------------------------------------|
| `text`               | Single-line or multiline text input                                            |
| `secret`             | Masked input for sensitive values                                              |
| `select`             | Single-select dropdown with static options or a dynamic data source            |
| `multi_select`       | Multi-select with static options or a dynamic data source                      |
| `toggle`             | Boolean on/off switch                                                          |
| `button`             | Action trigger — calls `onSettingsForm` with the button's `action` value       |
| `link_button`        | External link button — navigates to a URL, does not call `onSettingsForm`      |
| `oauth_button`       | OAuth flow trigger — calls `onAuthorizationRequest`, bypasses `onSettingsForm` |
| `instructions`       | Read-only markdown text block                                                  |
| `divider`            | Visual separator                                                               |

---

## text

Single-line or multiline text input. Use `disabled: true` for read-only display fields.

### Properties

| Property      | Required | Description                                                                                                |
|---------------|----------|------------------------------------------------------------------------------------------------------------|
| `key`         | Yes      | Field identifier — becomes the key in `formData` passed to `onSettingsForm`                                |
| `label`       | Yes      | Display label                                                                                              |
| `help`        | Yes      | Help text shown below the field                                                                            |
| `required`    | No       | Mark field as required — static (`true`) or conditional (see [conditional-logic.md](conditional-logic.md)) |
| `multiline`   | No       | Enable multiline input (`true`) — use for JSON or large text                                               |
| `hint`        | No       | Placeholder text shown inside the empty field                                                              |
| `dataType`    | No       | Input mode — `'text'` (default), `'number'`, `'email'`, `'phone'`                                          |
| `disabled`    | No       | Disable the field — static (`true`) or conditional (see [conditional-logic.md](conditional-logic.md))      |
| `readonly`    | No       | Render as read-only — static (`true`) or conditional (see [conditional-logic.md](conditional-logic.md))    |
| `visible`     | No       | Conditional visibility (see [conditional-logic.md](conditional-logic.md))                                  |
| `validations` | No       | Validation rules (see [conditional-logic.md](conditional-logic.md))                                        |

### Example — basic text field

```yaml
- type: text
  key: instance_url
  label: Instance URL
  required: true
  help: "`https://{your-company}.example.com/`"
  validations:
    - regex: "^https:\\/\\/[a-zA-Z0-9-_.]+\\.example\\.com\\/$"
      message: Please enter a valid instance URL.
```

---

## secret

Masked input for sensitive values such as API keys, client secrets, and tokens. The value is never shown in plain text after saving.

### Properties

| Property      | Required | Description                                                                                                |
|---------------|----------|------------------------------------------------------------------------------------------------------------|
| `key`         | Yes      | Field identifier                                                                                           |
| `label`       | Yes      | Display label                                                                                              |
| `help`        | Yes      | Help text                                                                                                  |
| `required`    | No       | Mark field as required — static (`true`) or conditional (see [conditional-logic.md](conditional-logic.md)) |
| `hint`        | No       | Placeholder text shown inside the empty field                                                              |
| `disabled`    | No       | Disable the field — static (`true`) or conditional (see [conditional-logic.md](conditional-logic.md))      |
| `readonly`    | No       | Render as read-only — static (`true`) or conditional (see [conditional-logic.md](conditional-logic.md))    |
| `visible`     | No       | Conditional visibility (see [conditional-logic.md](conditional-logic.md))                                  |
| `validations` | No       | Validation rules (see [conditional-logic.md](conditional-logic.md))                                        |

### Example

```yaml
- type: secret
  key: client_secret
  label: Client Secret
  required: true
  help: The client secret of your API client
```

---

## select

Single-select dropdown with a static option list or dynamic data source.

### Properties

| Property      | Required    | Description                                                                                                |
|---------------|-------------|------------------------------------------------------------------------------------------------------------|
| `key`         | Yes         | Field identifier                                                                                           |
| `label`       | Yes         | Display label                                                                                              |
| `help`        | Yes         | Help text                                                                                                  |
| `required`    | No          | Mark field as required — static (`true`) or conditional (see [conditional-logic.md](conditional-logic.md)) |
| `options`     | Conditional | Static option list — array of `{text, value}` pairs; required if `dataSource` is not set                   |
| `dataSource`  | Conditional | Dynamic option loader — mutually exclusive with `options`                                                  |
| `hint`        | No          | Placeholder text shown inside the empty field                                                              |
| `display`     | No          | Render mode — `'auto'` (default), `'radio'`, `'select'`                                                    |
| `visible`     | No          | Conditional visibility (see [conditional-logic.md](conditional-logic.md))                                  |
| `validations` | No          | Validation rules (see [conditional-logic.md](conditional-logic.md))                                        |

### Example — static options

```yaml
- type: select
  key: region
  label: API Region
  required: true
  help: The geographic region of your project
  options:
    - text: Europe (GCP)
      value: europe-gcp
    - text: North America
      value: us-central
    - text: Australia
      value: australia-east
```

### Example — dynamic data source

```yaml
- type: select
  key: product_type
  label: Product Type
  help: Select the product type to sync
  dataSource:
    type: app
    function: get_product_types
```

```typescript
// src/functions/GetProductTypes.ts
import * as App from '@zaiusinc/app-sdk';

export class GetProductTypes extends App.Function {
  public async perform(): Promise<App.Response> {
    const options = [
      { text: 'Clothing', value: 'clothing' },
      { text: 'Electronics', value: 'electronics' },
    ];
    return new App.Response(200, options);
  }
}
```

---

## multi_select

Multi-select with static options or a dynamic data source.

### Properties

| Property       | Required    | Description                                                                                                |
|----------------|-------------|------------------------------------------------------------------------------------------------------------|
| `key`          | Yes         | Field identifier                                                                                           |
| `label`        | Yes         | Display label                                                                                              |
| `help`         | Yes         | Help text                                                                                                  |
| `required`     | No          | Mark field as required — static (`true`) or conditional (see [conditional-logic.md](conditional-logic.md)) |
| `options`      | Conditional | Static option list — array of `{text, value}` pairs; required if `dataSource` is not set                   |
| `dataSource`   | Conditional | Dynamic option loader — mutually exclusive with `options`                                                  |
| `defaultValue` | No          | Array of pre-selected values                                                                               |
| `hint`         | No          | Placeholder text shown inside the empty field                                                              |
| `display`      | No          | Render mode — `'auto'` (default), `'checkbox'`, `'select'`                                                 |
| `visible`      | No          | Conditional visibility (see [conditional-logic.md](conditional-logic.md))                                  |
| `validations`  | No          | Validation rules (see [conditional-logic.md](conditional-logic.md))                                        |

### Example — static options

```yaml
- type: multi_select
  key: languages
  label: Languages to Sync
  help: Select the languages to synchronize
  defaultValue:
    - en-US
  options:
    - text: English (US)
      value: en-US
    - text: German
      value: de-DE
```

### Example — dynamic data source

Options are loaded at render time by calling an app function declared in `app.yml`. The function must return an array of `{text, value}` objects via `App.Response`.

```yaml
- type: multi_select
  key: custom_attributes
  label: Custom Attributes to Sync
  help: Select custom attributes to include in the schema
  dataSource:
    type: app
    function: get_custom_attributes
```

```typescript
// src/functions/GetCustomAttributes.ts
import * as App from '@zaiusinc/app-sdk';

export class GetCustomAttributes extends App.Function {
  public async perform(): Promise<App.Response> {
    const options = [
      { text: 'Color', value: 'color' },
      { text: 'Size', value: 'size' },
    ];
    return new App.Response(200, options);
  }
}
```

---

## toggle

Boolean on/off switch.

### Properties

| Property      | Required | Description                                                                                            |
|---------------|----------|--------------------------------------------------------------------------------------------------------|
| `key`         | Yes      | Field identifier — value in `formData` is `true` or `false`                                            |
| `label`       | Yes      | Display label                                                                                          |
| `help`        | Yes      | Help text                                                                                              |
| `disabled`    | No       | Disable the toggle — static (`true`) or conditional (see [conditional-logic.md](conditional-logic.md)) |
| `readonly`    | No       | Render as read-only — value is still submitted with `formData`; use `disabled` to exclude it           |
| `visible`     | No       | Conditional visibility (see [conditional-logic.md](conditional-logic.md))                              |
| `validations` | No       | Validation rules (see [conditional-logic.md](conditional-logic.md))                                    |

### Example

```yaml
- type: toggle
  key: enable_webhooks
  label: Enable Realtime Updates via Webhooks
  help: When enabled, the app creates webhooks to receive realtime updates
```

---

## button

Action trigger. Clicking the button calls `onSettingsForm` with the button's `action` value and the current (unsaved) form field values as `formData`. The lifecycle handler receives `action` and decides what to do — validate credentials, trigger a job, save settings, etc.

### Properties

| Property   | Required | Description                                                                             |
|------------|----------|-----------------------------------------------------------------------------------------|
| `label`    | Yes      | Button text                                                                             |
| `action`   | Yes      | Identifier passed as the `action` argument to `onSettingsForm`                          |
| `key`      | No       | Optional field key — makes the button addressable in `formData`                         |
| `help`     | No       | Help text shown below the button                                                        |
| `style`    | No       | Button style — `primary` (main action), `danger` (destructive action), `none` (default) |
| `disabled` | No       | Disable the button — static (`true`) or conditional (see below)                         |
| `visible`  | No       | Conditional visibility (see [conditional-logic.md](conditional-logic.md))               |

### Example — save button

The conventional submit button for a section. Use `action: save` — see [Validate and save](../lifecycle/settings-form.md#validate-and-save) for the corresponding lifecycle handler.

```yaml
- type: button
  label: Save
  action: save
  style: primary
```

### Example — action button

The `action` value is what the lifecycle handler receives to decide what to do. Use a descriptive value (`test_connection`, `fetch_products`) when the button should do something other than save — see [Action dispatch](../lifecycle/settings-form.md#action-dispatch-for-multi-button-forms) for how the handler branches on it.

```yaml
- type: button
  label: Connect
  action: test_connection
  style: primary
  help: Verify your credentials before saving
```

### Example — conditionally disabled button

`disabled` accepts a predicate: `operation` combines the comparators (`any` = disabled if any is true, `all` = disabled if all are true, `none` = disabled if none are true). The button below stays disabled until both schema fields are filled.

```yaml
- type: button
  label: Create Schema
  action: createSchema
  style: primary
  disabled:
    operation: any
    comparators:
      - key: schema.source_schema
        empty: true
      - key: schema.destination_schema
        empty: true
```

---

## oauth_button

Special button type that initiates an OAuth authorization flow. Clicking it calls `onAuthorizationRequest` directly — `onSettingsForm` is **not** called.

### Properties

| Property       | Required | Description                                                                                            |
|----------------|----------|--------------------------------------------------------------------------------------------------------|
| `label`        | Yes      | Button text                                                                                            |
| `key`          | No       | Optional field identifier                                                                              |
| `style`        | No       | Button style — `primary` (main action), `danger` (destructive action), `none` (default)                |
| `help`         | No       | Help text shown below the button                                                                       |
| `icon`         | No       | Icon name to display alongside the label                                                               |
| `iconPosition` | No       | Icon placement — `'left'` (default) or `'right'`                                                       |
| `disabled`     | No       | Disable the button — static (`true`) or conditional (see [conditional-logic.md](conditional-logic.md)) |
| `visible`      | No       | Conditional visibility (see [conditional-logic.md](conditional-logic.md))                              |

No `action` — the element type itself identifies it as an OAuth trigger.

### Example

```yaml
- type: oauth_button
  label: Authorize
  style: primary
```

---

## instructions

Read-only text block. Supports markdown including bold, links, and code spans. Supports `visible` for conditional display.

### Example

```yaml
- type: instructions
  text: Enter your credentials. Found in **Settings > API Clients**.
```

---

## divider

Visual separator. Supports `visible` for conditional display, no other properties.

### Example

```yaml
- type: divider
```

---

## link_button

Renders a styled button that navigates to an external URL. Does **not** call `onSettingsForm` — use it for "Open in dashboard" or "View documentation" links.

### Properties

| Property   | Required | Description                                                                                            |
|------------|----------|--------------------------------------------------------------------------------------------------------|
| `label`    | Yes      | Button text                                                                                            |
| `href`     | Yes      | URL to navigate to when clicked                                                                        |
| `style`    | No       | Button style — `primary` (main action), `danger` (destructive action), `none` (default)                |
| `help`     | No       | Help text shown below the button                                                                       |
| `disabled` | No       | Disable the button — static (`true`) or conditional (see [conditional-logic.md](conditional-logic.md)) |
| `visible`  | No       | Conditional visibility (see [conditional-logic.md](conditional-logic.md))                              |

### Example

```yaml
- type: link_button
  label: Open API Clients
  href: https://example.com/settings/api-clients
  style: none
  help: Opens your account's API Clients page in a new tab
```

---

## Common mistakes

| Mistake                                     | Fix                                                                                                                  |
|---------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| Omitting `action` from a `button`           | Without `action`, the button has no identifier in `onSettingsForm` — always set it                                   |
| Using `secret` for read-only display values | Use `text` with `disabled: true` — `secret` is for input only and masks the value                                    |
| Putting sensitive values in `text` fields   | Use `secret` for API keys, tokens, and passwords — `text` values are visible in the UI                               |
| Omitting `help` on credential fields        | Always add `help` explaining where to find the value and what format is expected                                     |
| Using `disabled` when `readonly` is needed  | `disabled` excludes the value from `formData`; use `readonly` when the value must still be submitted                 |
| Using `link_button` to trigger app logic    | `link_button` navigates to a URL and never calls `onSettingsForm` — use `button` with an `action` for app-side logic |
