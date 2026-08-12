# Lifecycle — canUninstall + onUninstall

Two hooks govern uninstallation: `canUninstall` (optional) gates whether uninstall is allowed, and `onUninstall` performs the actual cleanup.

---

## canUninstall

Optional. Defaults to `{ uninstallable: true }` if not implemented.

```typescript
import { CanUninstallResult, Lifecycle } from '@zaiusinc/app-sdk';

public async canUninstall(): Promise<CanUninstallResult> {
  // ...
}
```

### CanUninstallResult

```typescript
interface CanUninstallResult {
  uninstallable: boolean;
  message?: string; // shown to the customer when uninstallable is false
}
```

Use this to block uninstall when active resources depend on the installation — for example, a backfill job that must complete first. Always provide a clear `message` explaining what the customer needs to do before uninstalling.

```typescript
public async canUninstall(): Promise<CanUninstallResult> {
  const state = await storage.kvStore.get<{ running: boolean }>('backfill_state');

  if (state?.running) {
    return {
      uninstallable: false,
      message: 'A backfill is currently in progress. Wait for it to complete before uninstalling.',
    };
  }

  return { uninstallable: true };
}
```

---

## onUninstall

Required. Called to clean up external resources when the customer uninstalls the app.

```typescript
import { Lifecycle, LifecycleResult, logger, storage } from '@zaiusinc/app-sdk';

public async onUninstall(): Promise<LifecycleResult> {
  // ...
}
```

`LifecycleResult` — returning `{ success: false }` may cause the platform to retry. For non-critical cleanup failures (webhook already deleted, resource not found), catch the error, log it, and return `{ success: true }` to avoid leaving the installation permanently stuck.

### Example — deregister webhook on uninstall

```typescript
public async onUninstall(): Promise<LifecycleResult> {
  try {
    const { id } = await storage.kvStore.get<{ id: string }>('webhook');

    if (id) {
      await ExternalApi.deregisterWebhook(id);
      await storage.kvStore.delete('webhook');
    }
  } catch (e) {
    logger.error('Failed to deregister webhook during uninstall', e);
    // Do not return false — a cleanup failure should not block uninstall
  }

  return { success: true };
}
```

---

## Common mistakes

| Mistake                                                       | Fix                                                                                                                        |
|---------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| Throwing or returning `{ success: false }` on cleanup failure | Catch errors and return `{ success: true }` — a failed cleanup should not leave the installation permanently uninstallable |
| Not deregistering external webhooks                           | The third-party system will keep sending events to a dead endpoint — always clean up in `onUninstall`                      |
| Blocking uninstall in `canUninstall` with no resolution path  | Always pair a block with a `message` that tells the customer exactly what to do to proceed                                 |
