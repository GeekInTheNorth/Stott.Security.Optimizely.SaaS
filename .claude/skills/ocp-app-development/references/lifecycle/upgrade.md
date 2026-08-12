# Lifecycle — onUpgrade + onFinalizeUpgrade + onAfterUpgrade

An app upgrade deploys new code to an existing installation — it does not reset or reinitialize anything. All data stored per installation (`storage.settings`, `storage.secrets`, `storage.kvStore`) is preserved.

Do not repeat non-idempotent `onInstall` logic (e.g. seeding `kvStore` keys that may hold live customer data, creating ODP schema objects that already exist). Do re-run idempotent setup tasks — re-validating webhook registrations, re-writing generated values like function URLs to `storage.settings` — so the installation stays current after a code change.

Three hooks cover the upgrade sequence. They run in order — each step only executes if the previous one returned `{ success: true }`. A failure at any step rolls the installation back to the previous version.

## Sequence

```
onUpgrade  →  version upgrade  →  onFinalizeUpgrade  →  onAfterUpgrade
```

| Hook                | When                                                    | Old function endpoint URLs | New function endpoint URLs |
|---------------------|---------------------------------------------------------|----------------------------|----------------------------|
| `onUpgrade`         | Start of version upgrade                                | Available                  | Not yet                    |
| `onFinalizeUpgrade` | After version upgrade, once new endpoints are available | Gone                       | Available                  |
| `onAfterUpgrade`    | After version upgrade completes                         | —                          | Available                  |

---

## onUpgrade

```typescript
import { Lifecycle, LifecycleResult, logger } from '@zaiusinc/app-sdk';

public async onUpgrade(fromVersion: string): Promise<LifecycleResult> {
  // ...
}
```

Called at the start of the version upgrade. Old function endpoint URLs are still active. Use this for data migrations, schema updates, and re-verifying any external registrations.

`fromVersion` is not guaranteed to be the immediately preceding version — it may be a beta or a version that was skipped. **All operations must be idempotent** — the platform may retry `onUpgrade` with the same `fromVersion`.

```typescript
public async onUpgrade(_fromVersion: string): Promise<LifecycleResult> {
  try {
    // Data migrations, settings migrations, and schema updates go here.
    // All operations must be idempotent — base them on current state, not fromVersion.
    // Do not register new webhooks here — new function URLs are not available yet.

    return { success: true };
  } catch (e) {
    logger.error('Upgrade failed', e);
    return { success: false, retryable: true };
  }
}
```

---

## onFinalizeUpgrade

```typescript
import { Lifecycle, LifecycleResult, logger } from '@zaiusinc/app-sdk';

public async onFinalizeUpgrade(fromVersion: string): Promise<LifecycleResult> {
  // ...
}
```

Called after the version upgrade, once new function endpoint URLs are available. Use this to register webhooks for functions added in this version.

```typescript
public async onFinalizeUpgrade(_fromVersion: string): Promise<LifecycleResult> {
  try {
    // Register webhooks for any new functions added in this version.
    // New function endpoint URLs are available here — use functions.getEndpoints().

    return { success: true };
  } catch (e) {
    logger.error('FinalizeUpgrade failed', e);
    return { success: false };
  }
}
```

---

## onAfterUpgrade

Optional. Defaults to `{ success: true }` if not implemented. Called after the entire upgrade completes successfully.

```typescript
import { jobs, Lifecycle, LifecycleResult } from '@zaiusinc/app-sdk';

public async onAfterUpgrade(): Promise<LifecycleResult> {
  // ...
}
```

Use this to trigger one-time post-upgrade jobs:

```typescript
public async onAfterUpgrade(): Promise<LifecycleResult> {
  await jobs.trigger('backfill_new_field');
  return { success: true };
}
```

---

## Common mistakes

| Mistake                                                                                 | Fix                                                                                                          |
|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| Non-idempotent operations in `onUpgrade`                                                | The platform may retry with the same `fromVersion` — every operation must be safe to run more than once      |
| Registering new webhooks in `onUpgrade`                                                 | New function URLs do not exist yet — move webhook registration to `onFinalizeUpgrade`                        |
| Version-gating with `if (fromVersion === '1.0.0')`                                      | A customer may skip versions — apply all migrations unconditionally so they are always safe to run           |
| Returning `{ success: false }` for non-critical failures (e.g. webhook re-registration) | Wrap non-critical steps in try-catch and return `{ success: true }` to avoid rolling back the entire upgrade |
