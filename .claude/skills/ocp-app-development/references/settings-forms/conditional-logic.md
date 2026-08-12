# Settings Form — Conditional Logic

- [required](#required)
- [visible](#visible)
- [disabled](#disabled)
- [validations](#validations)
- [Key scope rules](#key-scope-rules)
- [Common mistakes](#common-mistakes)

Conditional logic in `forms/settings.yml` controls which fields are visible, which are disabled, and when values are considered valid. All conditions are evaluated client-side on each render — they react automatically when form values change.

For element type definitions see [elements.md](elements.md). For the TypeScript handler that persists and reads these values see [lifecycle/settings-form.md](../lifecycle/settings-form.md).

---

## required

Marks a field as required. The form cannot be submitted if the field is empty.

```yaml
- type: text
  key: api_key
  label: API Key
  required: true
```

`required` also accepts a predicate to make it conditional:

```yaml
sections:
  - key: authentication       # "authentication" in required.key comes from here
    label: Authentication
    elements:
      - type: select
        key: auth_method      # "auth_method" in required.key comes from here
        label: Authentication Method
        options:
          - text: Service Account
            value: service_account
          - text: OAuth
            value: oauth

      # Required only when auth_method is service_account
      - type: secret
        key: service_account_json
        label: Service Account JSON
        required:
          key: authentication.auth_method   # section.field → authentication + auth_method
          equals: service_account
```

---

## visible

Shows or hides a field based on another field's current value. Hidden fields are excluded from `formData` when the section is submitted.

```yaml
visible:
  key: section.field
  equals: value
```

`key` always uses the `section.field` format — the section key followed by a dot and the field key.

### Example — show fields based on auth method selection

```yaml
sections:
  - key: authentication       # "authentication" in visible.key comes from here
    label: Authentication
    elements:
      - type: select
        key: auth_method
        label: Authentication Method
        options:
          - text: Service Account
            value: service_account
          - text: OAuth
            value: oauth

      - type: secret
        key: service_account_json
        label: Service Account JSON
        visible:
          key: authentication.auth_method   # section.field → authentication + auth_method
          equals: service_account

      - type: secret
        key: client_id
        label: Client ID
        visible:
          key: authentication.auth_method
          equals: oauth
```

### Example — multi_select visibility

For `multi_select` fields, add an `operation` inside the comparator to check whether `all`, `any`, or `none` of the selected items match:

```yaml
visible:
  key: sync.lists
  operation: any      # visible if ANY selected item equals "premium_list"
  equals: premium_list
```

### Example — combine visible and required

When a field is only shown for a specific selection, pair `visible` and `required` with the same predicate so the field is both hidden and not required when it doesn't apply:

```yaml
sections:
  - key: authentication
    label: Authentication
    elements:
      - type: select
        key: auth_method
        label: Authentication Method
        options:
          - text: Service Account
            value: service_account
          - text: OAuth
            value: oauth

      - type: secret
        key: service_account_json
        label: Service Account JSON
        visible:
          key: authentication.auth_method
          equals: service_account
        required:                            # same predicate as visible — required only when shown
          key: authentication.auth_method
          equals: service_account
```

### Section property visibility

Fields can be shown/hidden based on section `properties` flags set by the lifecycle handler. The flag is readable as `section.propertyName`.

Unlike `visible` on regular fields (which reacts to user input live), property flags are set server-side — they persist across page reloads and only change when the handler updates them.

Any key referenced in a `visible` predicate must be declared in `properties` — this applies whether the value is set via `storage.settings.patch()` or by mutating `formData` before `storage.settings.put()`.

```yaml
# forms/settings.yml
sections:
  - key: auth                 # "auth" in visible.key comes from here
    label: Connection
    properties:
      - authorized            # "authorized" in visible.key comes from here — declare it here first
    elements:
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
    elements:
      - type: toggle
        key: enable_webhooks
        label: Enable Realtime Updates via Webhooks
        visible:
          key: auth.authorized   # section.propertyName → auth + authorized
          equals: true           # only visible after the lifecycle handler sets this flag
```

```typescript
// Lifecycle handler — sets the flag after Connect button succeeds
// section = 'auth', action = 'test_connection'
await storage.settings.patch('auth', { authorized: true });
// Now auth.authorized = true, so enable_webhooks becomes visible in the UI
```

See [elements.md — Section properties](elements.md#section-properties) for how to declare properties on a section.

---

## disabled

Prevents editing a field or clicking a button. Two forms:

### Static disabled

Always disabled — use for read-only display fields.

```yaml
- type: text
  key: webhook_url
  label: Webhook URL
  disabled: true
```

### Conditional disabled

Disabled when a condition is met. Uses `section.field` key format.

```yaml
disabled:
  operation: any
  comparators:
    - key: section.field
      empty: true
```

`operation` controls how comparators are combined:

| Value  | Meaning                                  |
|--------|------------------------------------------|
| `any`  | Disabled if **any** comparator is true   |
| `all`  | Disabled if **all** comparators are true |
| `none` | Disabled if **no** comparator is true    |

### Comparator types

| Comparator       | Meaning                                                                               |
|------------------|---------------------------------------------------------------------------------------|
| `empty: true`    | Field has no value                                                                    |
| `empty: false`   | Field has a value                                                                     |
| `equals: value`  | Field equals the given value                                                          |
| `regex: pattern` | Field value matches the regular expression; optional `flags` string (e.g. `flags: i`) |

### Example — disable button until required fields are filled

```yaml
sections:
  - key: schema               # "schema" in disabled.comparators.key comes from here
    label: Schema
    elements:
      - type: text
        key: source_schema    # "source_schema" in disabled.comparators.key comes from here
        label: Source Schema
        required: true
        help: The name of the source schema

      - type: text
        key: destination_schema   # "destination_schema" in disabled.comparators.key comes from here
        label: Destination Schema
        required: true
        help: The name of the destination schema

      - type: button
        label: Create Schema
        action: createSchema
        style: primary
        disabled:
          operation: any            # disabled if ANY comparator is true
          comparators:
            - key: schema.source_schema       # section.field format
              empty: true
            - key: schema.destination_schema
              empty: true
```

---

## validations

Validates field values before submission. Attach to any form field (`text`, `secret`, `select`, `multi_select`, `toggle`). Multiple rules can be applied to one field — all must pass.

### Regex validation

Validates the field value against regular expressions.

```yaml
validations:
  - regex: "^https://"
    message: URL must start with https://
  - regex: "\\/$"
    message: URL must end with a trailing slash
```

### Predicate validation

Validates based on conditions across multiple fields. Use when a field is only required depending on another field's value.

Comparator keys use `section.field` format — the same as `visible` and `disabled`.

A predicate validation **passes** (no error shown) when the condition is true, and **fails** (shows the message) when the condition is false.

```yaml
sections:
  - key: authentication
    label: Authentication
    elements:
      - type: select
        key: auth_method
        label: Authentication Method
        options:
          - text: Service Account
            value: service_account
          - text: OAuth
            value: oauth

      - type: secret
        key: service_account_json
        label: Service Account JSON
        help: Required when using Service Account authentication
        validations:
          - predicate:
              operation: any      # passes if ANY comparator is true
              comparators:
                - key: authentication.service_account_json   # section.field format
                  empty: false                               # true when the field has a value
                - key: authentication.auth_method
                  equals: oauth                              # true when OAuth is selected (field not needed)
            message: Service Account JSON is required for Service Account authentication
```

The validation on `service_account_json` passes (no error) when **either**:
- The field has a value (`empty: false`), **or**
- `auth_method` is `oauth` — meaning the field is not needed at all

It fails (shows the message) only when the field is empty **and** `auth_method` is `service_account` — i.e. the field is actually needed but not filled in.

**When using `operation: none` with a `multi_select` comparator, an empty selection evaluates to false** — not vacuously true. Add a separate `empty: true` comparator to handle the no-selection case.

Without the guard — fails when nothing is selected even though Products is not selected:

```yaml
- key: config.categories
  operation: none
  equals: products
```

With the guard — passes correctly when nothing is selected:

```yaml
- key: config.categories
  empty: true
- key: config.categories
  operation: none
  equals: products
```

---

## Key scope rules

The key format used in conditions depends on the feature:

| Feature                                 | Key format      | Example                                   |
|-----------------------------------------|-----------------|-------------------------------------------|
| `visible.key`                           | `section.field` | `authentication.auth_method`              |
| `required.key` (conditional)            | `section.field` | `authentication.auth_method`              |
| `disabled.comparators.key`              | `section.field` | `schema.source_schema`                    |
| `validations.predicate.comparators.key` | `section.field` | `authentication.service_account_json`     |

---

## Common mistakes

| Mistake                                                                    | Fix                                                                                                                |
|----------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| Using bare field name in `visible.key`                                     | `visible.key` requires `section.field` format — e.g. `auth.auth_method`, not `auth_method`                         |
| Using bare field name in validation predicate comparators                  | Validation predicate comparators use `section.field` format — e.g. `authentication.auth_method`, not `auth_method` |
| Using `validations` predicate for conditional required                     | Use `required` with an Evaluation directly — it accepts the same predicate syntax as `visible`                     |
| Expecting `disabled` to hide the field                                     | `disabled` greys out the field but keeps it visible — use `visible` to hide it entirely                            |
| Referencing a control variable in `visible` without declaring it           | Declare it in the section's `properties` list                                                                      |
| Using `operation: none` on a `multi_select` without an `empty: true` guard | An empty selection returns false for `none` — add `empty: true` as a separate comparator                           |
