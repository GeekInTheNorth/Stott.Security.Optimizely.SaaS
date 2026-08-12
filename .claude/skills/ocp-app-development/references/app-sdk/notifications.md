# Notifications

`import { notifications } from '@zaiusinc/app-sdk'`

Notifications surface events in the OCP platform — customers see them in the **Activity Log** for the installed app. **This is not a logging API** — notifications are user-visible in the OCP Activity Log, not in developer/app logs. Use them to communicate meaningful events (sync completed, auth failed, action taken), not for debugging.

Four severity levels are available:

```typescript
await notifications.info(activity, title, summary, details?);
await notifications.success(activity, title, summary, details?);
await notifications.warn(activity, title, summary, details?);
await notifications.error(activity, title, summary, details?);
```

| Parameter | Required | Description |
| --- | --- | --- |
| `activity` | Yes | Groups related notifications in the Activity Log — pick a stable, app-defined identifier and keep it consistent (e.g. `'nightly_import'` or `'Nightly Import Job'`) |
| `title` | Yes | Short label for this specific event (e.g. `'Import complete'`) |
| `summary` | Yes | Brief description of what happened |
| `details` | No | Optional extra context — record count, error message, stack trace |

All three required parameters must be non-empty strings. If any are blank, the notification is dropped and an error is logged via the SDK logger.

## Example

```typescript
import { notifications } from '@zaiusinc/app-sdk';

// After a successful sync
await notifications.success(
  'nightly_import',
  'Import complete',
  `Imported ${count} contacts`,
  `Duration: ${duration}s`
);

// On a recoverable issue
await notifications.warn(
  'nightly_import',
  'Partial import',
  'Some records were skipped due to missing required fields'
);

// On a fatal error
await notifications.error(
  'nightly_import',
  'Import failed',
  'Failed to authenticate with ExternalService',
  error.message
);
```

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Passing a blank string for any required param | All three required params must be non-empty |
| Sending a notification for every record processed | Notify at meaningful milestones only — job complete, auth failure, sync error |
