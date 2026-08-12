# Lifecycle — onSettingsForm

`onSettingsForm` is called whenever a customer submits a section of the settings form. It is responsible for validating the submitted data and writing it to the settings store.

## Signature

```typescript
import {
  jobs,
  Lifecycle,
  LifecycleSettingsResult,
  storage,
  SubmittedFormData,
} from '@zaiusinc/app-sdk';

export class MyLifecycle extends Lifecycle {
  public async onSettingsForm(
    section: string,
    action: string,
    formData: SubmittedFormData,
  ): Promise<LifecycleSettingsResult> {
    // ...
  }
}
```

## Parameters

| Parameter  | Type                | Description                                                                   |
|------------|---------------------|-------------------------------------------------------------------------------|
| `section`  | `string`            | Name of the submitted form section — matches the section key in `forms/*.yml` |
| `action`   | `string`            | Button action that triggered the call — default save button sends `'save'`    |
| `formData` | `SubmittedFormData` | Hash of field key to submitted value                                          |

## LifecycleSettingsResult

```typescript
const result = new LifecycleSettingsResult();
```

Always construct a fresh instance. Methods are chainable and return `this`.

| Method                         | Description                                                                                                                                   |
|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `.addError(field, message)`    | Attach a validation error to a field. The field name is automatically scoped to `section.field` — pass just the field name, not the full path |
| `.addToast(intent, message)`   | Show a toast notification. Intent: `'info'`, `'success'`, `'warning'`, `'danger'`                                                             |
| `.redirect(url)`               | Redirect the browser to an external URL (e.g. to initiate OAuth)                                                                              |
| `.redirectToSettings(section)` | Navigate the customer to another settings section                                                                                             |

## Persisting settings

The framework does **not** auto-persist form data. Explicitly write to `storage.settings` before returning, only after validation passes.

## Validate and save

When a section has one save button (`action: save`), the `action` parameter never needs to be checked — just validate and persist:

```typescript
public async onSettingsForm(
  section: string,
  action: string,
  formData: SubmittedFormData,
): Promise<LifecycleSettingsResult> {
  const result = new LifecycleSettingsResult();

  if (!formData.api_key) {
    return result.addError('api_key', 'API key is required');
  }

  await storage.settings.put(section, formData);
  return result.addToast('success', 'Settings saved');
}
```

Do not use this pattern for OAuth flows — when a section uses `oauth_button`, the button click goes to `onAuthorizationRequest`, not here.

## Validate and save across multiple sections

Use a `switch` on `section` to apply per-section validation. Sections that need no special logic fall through to the default save.

```typescript
public async onSettingsForm(
  section: string,
  action: string,
  formData: SubmittedFormData,
): Promise<LifecycleSettingsResult> {
  const result = new LifecycleSettingsResult();

  switch (section) {
    case 'credentials':
      if (!formData.api_key) {
        return result.addError('api_key', 'API key is required');
      }
      try {
        await ExternalApi.validate(formData.api_key as string);
      } catch (e) {
        return result.addError('api_key', 'Invalid API key — check and try again');
      }
      await storage.settings.put(section, formData);
      return result.addToast('success', 'Credentials saved');

    case 'sync_config':
      if (!formData.sync_interval) {
        return result.addError('sync_interval', 'Sync interval is required');
      }
      await storage.settings.put(section, formData);
      return result.addToast('success', 'Sync configuration saved');

    default:
      await storage.settings.put(section, formData);
      return result;
  }
}
```

## Mutating formData

`formData` is mutable inside `onSettingsForm`. Set control variables on it before calling `storage.settings.put()` — they are persisted alongside form field values and can drive `visible` and `disabled` predicates in `settings.yml`. See [conditional-logic.md](../settings-forms/conditional-logic.md) for the full predicate syntax.

```typescript
public async onSettingsForm(
  section: string,
  action: string,
  formData: SubmittedFormData,
): Promise<LifecycleSettingsResult> {
  const result = new LifecycleSettingsResult();

  if (section === 'auth' && action === 'authorize') {
    // Set a control variable before persisting so settings.yml can unlock dependent sections
    formData.authConfirmed = true;
    await storage.settings.put(section, formData);
    return result.addToast('success', 'Authorized');
  }

  await storage.settings.put(section, formData);
  return result;
}
```

## Action dispatch for multi-button forms

When a form has multiple sections or buttons, use inline `if` checks on `section` and `action`:

```typescript
public async onSettingsForm(
  section: string,
  action: string,
  formData: SubmittedFormData,
): Promise<LifecycleSettingsResult> {
  const result = new LifecycleSettingsResult();

  if (section === 'auth' && action === 'test_connection') {
    try {
      await ExternalApi.validate(formData.client_id as string, formData.client_secret as string);
    } catch (e) {
      return result.addError('client_id', 'Invalid credentials').addToast('danger', 'Connection failed');
    }
    await storage.settings.put(section, formData);
    return result.addToast('success', 'Connected');
  }

  if (section === 'data_sync' && action === 'fetch_products') {
    await jobs.trigger('fetch_products', {});
    return result.addToast('success', 'Sync started');
  }

  await storage.settings.put(section, formData);
  return result;
}
```

## Reading formData

Each form field produces a specific TypeScript type in `formData`. Fields hidden by a `visible` condition are absent — guard before reading.

| Element        | `formData[key]` type | Notes                                              |
|----------------|----------------------|----------------------------------------------------|
| `text`         | `string`             | Empty field → `''`                                 |
| `secret`       | `string`             | Plain string in handler despite being masked in UI |
| `select`       | `string`             | The option's `value` field, not its display `text` |
| `multi_select` | `string[]`           | Empty selection → `[]`                             |
| `toggle`       | `boolean`            | Unchecked → `false`, never `undefined`             |
| `file`         | `string`             | File content as a string                           |

```typescript
public async onSettingsForm(
  section: string,
  action: string,
  formData: SubmittedFormData,
): Promise<LifecycleSettingsResult> {
  const url      = formData.instance_url as string;
  const region   = formData.region as string;           // select: option value, e.g. 'europe-gcp'
  const langs    = formData.languages as string[];      // multi_select
  const enabled  = formData.enable_webhooks as boolean; // toggle: false when unchecked
  const fileJson = formData.service_account_file as string; // file content

  // guard hidden fields before use
  if (formData.service_account_json) {
    const creds = formData.service_account_json as string;
  }
}
```

## Common mistakes

| Mistake                                             | Fix                                                                                               |
|-----------------------------------------------------|---------------------------------------------------------------------------------------------------|
| Not calling `storage.settings.put(...)`             | Form data is lost — always write to the settings store on success                                 |
| Passing `section.field` to `addError`               | Field errors are already auto-scoped to the section — pass just the field name                    |
| Writing to storage before validation passes         | Only persist after all validation succeeds                                                        |
| Adding `switch (section)` for a single-section app  | Only branch on section name when the app has more than one settings section                       |
| Setting a `formData` control variable after `put()` | Mutate `formData` first, then call `put()` — otherwise the control value is not persisted         |
| Handling `oauth_button` clicks in `onSettingsForm`  | `oauth_button` bypasses `onSettingsForm` entirely — handle it in `onAuthorizationRequest` instead |
