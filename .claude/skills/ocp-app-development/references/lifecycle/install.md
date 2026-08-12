# Lifecycle — onInstall

`onInstall` runs once when a customer installs the app, before any function or job can execute.

## Signature

```typescript
import { Lifecycle, LifecycleResult, logger, storage } from '@zaiusinc/app-sdk';

export class MyLifecycle extends Lifecycle {
  public async onInstall(): Promise<LifecycleResult> {
    // ...
  }
}
```

## LifecycleResult

```typescript
interface LifecycleResult {
  success: boolean;
  message?: string;    // shown to the customer in the install UI
  retryable?: boolean; // if true, the platform retries the install on failure
}
```

Return `{ success: false }` to abort installation — the platform deletes the installation data. Return `{ success: false, retryable: true }` for transient failures (external API temporarily unreachable) so the platform retries automatically instead of failing permanently.

**ODP schema changes made inside `onInstall` are not rolled back on failure.** Design schema creation to be idempotent so a retry does not conflict with a partially completed install.

## What to do here

- Initialize `storage.kvStore` with default state
- Seed default settings with `storage.settings.put()` if the app needs initial values before the customer configures anything
- Register webhooks with external systems and store the returned IDs for later cleanup
- Create ODP schema objects the app depends on
- Call `functions.getEndpoints()` to retrieve your own function URLs and store them if external systems or customers need them (e.g. a webhook listener URL)

## Example

```typescript
import { Lifecycle, LifecycleResult, logger, storage } from '@zaiusinc/app-sdk';

export class MyLifecycle extends Lifecycle {
  public async onInstall(): Promise<LifecycleResult> {
    try {
      // Seed default state
      await storage.kvStore.put('sync_state', { cursor: null, totalSynced: 0 });

      // Seed default settings (optional — only if the app needs initial values)
      await storage.settings.put('data_sync', { enabled: false });

      // Register webhook with external system
      const webhookId = await ExternalApi.registerWebhook(webhookUrl);
      await storage.kvStore.put('webhook', { id: webhookId });

      return { success: true, message: 'Installation complete. Configure your API key in Settings.' };
    } catch (e) {
      logger.error('Install failed', e);
      return { success: false, retryable: true };
    }
  }
}
```

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Assuming ODP schema changes are rolled back on `success: false` | They are not — make schema creation idempotent so retries do not conflict |
| Returning `{ success: false }` without `retryable: true` for transient failures | Add `retryable: true` — otherwise the install fails permanently and the customer must reinstall |
| Not storing webhook IDs returned by external systems | Store them in `kvStore` so `onUninstall` can deregister them later |
