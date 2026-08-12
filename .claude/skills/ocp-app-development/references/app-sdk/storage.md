# Storage

- [settings](#settings) — per-installation settings store, primarily for settings form values
- [secrets](#secrets) — per-installation encrypted store for sensitive values the app writes itself
- [kvStore](#kvstore) — per-installation key-value store for non-sensitive state
- [sharedKvStore](#sharedkvstore) — app-wide key-value store shared across all installations
- [Common mistakes](#common-mistakes)

**Which store to use:**

| What you're storing | Use |
| --- | --- |
| Settings submitted by the user via the settings form | `settings` |
| Sensitive values the app generates itself (OAuth tokens, API keys, webhook secrets) — must not appear in the settings form UI | `secrets` |
| Per-installation state — cursors, sync progress, webhook IDs, lookup tables scoped to one customer | `kvStore` |
| State shared across all installations of the app — global routing tables, aggregate counters | `sharedKvStore` |

**Context availability:**

| Store | `Function` / `Job` / Lifecycle | `GlobalFunction` |
| --- | --- | --- |
| `storage.settings` | Yes | No |
| `storage.secrets` | Yes | No |
| `storage.kvStore` | Yes | No |
| `storage.sharedKvStore` | Yes | Yes |

`GlobalFunction` has no installation context — no `installId`, no `trackerId` — so only `sharedKvStore` is accessible from it.

---

## settings

Per-installation settings store. The key is a **section name** — matching the section names in your `forms/*.yml` files.

Writes happen in lifecycle methods — `onSettingsForm` (persisting form submissions) and `onAuthorizationGrant` (persisting the authorization result). Reads can happen anywhere.

| Method | Signature | Returns |
| --- | --- | --- |
| `get` | `get<T>(section, fields?)` | `Promise<T>` — empty object if section does not exist |
| `put` | `put(section, value)` | `Promise<true>` — overwrites entire section |
| `patch` | `patch<T>(section, value \| updater)` | `Promise<T>` — returns previous value |
| `delete` | `delete(section, fields?)` | `Promise<true>` — clears section or specific fields |
| `exists` | `exists(section)` | `Promise<boolean>` |

```typescript
import { storage, ValueHash } from '@zaiusinc/app-sdk';

interface Credentials extends ValueHash {
  api_key: string;
  authorized?: boolean;
}

// Read a full section
const creds = await storage.settings.get<Credentials>('credentials');

// Read specific fields only
const { api_key } = await storage.settings.get<Credentials>('credentials', ['api_key']);

// Write a full section (overwrites)
await storage.settings.put('credentials', { api_key: 'abc123' });

// Partial update (leaves other fields untouched)
await storage.settings.patch('credentials', { authorized: true });
```

---

## secrets

Per-installation encrypted store (Vault-backed). Values are stored in Vault and never exposed in plaintext.

**Key format:** `[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*` — letters, numbers, hyphens, and underscores only. Use `/` as a path separator for namespacing (e.g. `oauth/token`, `webhook/secret`).

| Method | Signature | Returns |
| --- | --- | --- |
| `get` | `get<T>(key, fields?)` | `Promise<T>` — empty object if key does not exist |
| `put` | `put(key, value)` | `Promise<true>` — overwrites entire object |
| `patch` | `patch<T>(key, value \| updater)` | `Promise<T>` — returns previous value |
| `delete` | `delete(key, fields?)` | `Promise<true>` — deletes key or specific fields |
| `exists` | `exists(key)` | `Promise<boolean>` |

```typescript
import { storage, ValueHash } from '@zaiusinc/app-sdk';

interface Token extends ValueHash {
  access_token: string;
  refresh_token: string;
}

// Write a token after OAuth grant
await storage.secrets.put('token', { access_token: token, refresh_token: refresh });

// Read it back
const { access_token } = await storage.secrets.get<Token>('token');

// Partial update (atomic)
await storage.secrets.patch('token', { access_token: newToken });

// Check existence before reading
if (await storage.secrets.exists('token')) { ... }
```

---

## kvStore

Per-installation store for non-sensitive state. Each key always stores an object — never a bare primitive or array.

| Method | Signature | Returns |
| --- | --- | --- |
| `get` | `get<T>(key, fields?)` | `Promise<T>` — empty object if key does not exist |
| `put` | `put<T>(key, value, options?)` | `Promise<T>` — returns previous value |
| `patch` | `patch<T>(key, value \| updater, options?)` | `Promise<T>` — returns previous value |
| `delete` | `delete<T>(key, fields?)` | `Promise<T>` — returns previous value |
| `exists` | `exists(key)` | `Promise<boolean>` |
| `increment` | `increment(key, field, amount?, options?)` | `Promise<number>` — value after increment; amount defaults to `1` |
| `incrementMulti` | `incrementMulti(key, { field: amount }, options?)` | `Promise<{ field: number }>` — values after increment |

```typescript
import { KVHash, storage } from '@zaiusinc/app-sdk';

interface SyncState extends KVHash {
  cursor: string;
  page: number;
}

// Write (overwrites entire object)
await storage.kvStore.put('sync_state', { cursor: 'abc123', page: 3 });

// Write with TTL — expires after 3600 seconds
await storage.kvStore.put('sync_state', { cursor: 'abc123', page: 3 }, { ttl: 3600 });

// Read
const state = await storage.kvStore.get<SyncState>('sync_state');

// Read specific fields only
const { cursor } = await storage.kvStore.get<SyncState>('sync_state', ['cursor']);

// Check existence
if (await storage.kvStore.exists('sync_state')) { ... }

// Partial update — leaves other fields untouched
await storage.kvStore.patch('sync_state', { cursor: 'def456' });

// Atomic update using an updater function — use this instead of read-modify-write when concurrent
// writers may race. The updater is retried automatically until it wins the CAS check.
await storage.kvStore.patch('sync_state', (prev) => ({ ...prev, page: (prev.page as number) + 1 }));

// Updater with options — atomically update value and TTL in one operation
await storage.kvStore.patch('sync_state', (prev, options) => {
  options.ttl = 3600;
  return { ...prev, cursor: 'def456' };
});

// Delete entire object
await storage.kvStore.delete('sync_state');

// Delete specific fields only
await storage.kvStore.delete('sync_state', ['cursor']);

// Atomically increment a numeric field — creates the field if it does not exist
const count = await storage.kvStore.increment('stats', 'events_processed', 1);

// Increment multiple fields in one call
const counts = await storage.kvStore.incrementMulti('stats', { events_processed: 1, bytes_received: 512 });
```

Always use `KVHash` (not `ValueHash`) for types stored in `kvStore` and `sharedKvStore` — `KVHash` adds `StringSet` and `NumberSet` support needed for atomic set operations. Always use `ValueHash` for `settings` and `secrets`.

### Advanced operations

Each key in the kvStore holds an object. Fields within that object can be typed as **lists** or **sets**, enabling atomic queue and membership operations without a read-modify-write cycle.

**List fields** — each field is an ordered list of values. Use `append`/`shift` for FIFO; `unshift`/`shift` for LIFO. The first argument is the key, the second is the field within that key's object holding the list.

| Method | Signature | Returns |
| --- | --- | --- |
| `append` | `append(key, field, value)` | `Promise<void>` |
| `unshift` | `unshift(key, field, value)` | `Promise<void>` — inserts at the front |
| `shift` | `shift<T>(key, field)` | `Promise<T \| undefined>` — removes and returns first element |
| `peek` | `peek<T>(key, field)` | `Promise<T \| undefined>` — reads first element without removing |
| `appendMulti` | `appendMulti(key, { field: value[] })` | `Promise<void>` — append to multiple fields |
| `unshiftMulti` | `unshiftMulti(key, { field: value[] })` | `Promise<void>` — prepend to multiple fields |
| `shiftMulti` | `shiftMulti<T>(key, { field: count })` | `Promise<{ field: T[] }>` — dequeue up to N from each field |
| `peekMulti` | `peekMulti<T>(key, { field: count })` | `Promise<{ field: T[] }>` — read up to N from each field |

```typescript
await storage.kvStore.append('queue', 'items', 'event-1');
await storage.kvStore.append('queue', 'items', 'event-2');
// { items: ['event-1', 'event-2'] }

const item = await storage.kvStore.shift<string>('queue', 'items');
// item = 'event-1', { items: ['event-2'] }

const next = await storage.kvStore.peek<string>('queue', 'items');
// next = 'event-2', list unchanged

// Multi variant — operate on multiple fields in one call
await storage.kvStore.appendMulti('queues', {
  high_priority: ['event-a'],
  low_priority: ['event-b', 'event-c'],
});

const batches = await storage.kvStore.shiftMulti<string>('queues', {
  high_priority: 1,
  low_priority: 2,
});
// batches = { high_priority: ['event-a'], low_priority: ['event-b', 'event-c'] }
```

---

**Set fields** — atomic membership tracking for deduplication or seen-ID tracking. Fields hold either a `StringSet` or `NumberSet`. The type is fixed on first write and cannot change.

| Method | Signature | Returns |
| --- | --- | --- |
| `addString` | `addString(key, field, value)` | `Promise<boolean>` — `true` if newly added |
| `hasString` | `hasString(key, field, value)` | `Promise<boolean>` |
| `removeString` | `removeString(key, field, value)` | `Promise<boolean>` — `true` if removed |
| `addStringMulti` | `addStringMulti(key, { field: value[] })` | `Promise<{ field: StringSet }>` — only newly added values |
| `hasStringMulti` | `hasStringMulti(key, { field: value[] })` | `Promise<{ field: StringSet }>` — only members |
| `removeStringMulti` | `removeStringMulti(key, { field: value[] })` | `Promise<{ field: StringSet }>` — only removed values |
| `addNumber` | `addNumber(key, field, value)` | `Promise<boolean>` — `true` if newly added |
| `hasNumber` | `hasNumber(key, field, value)` | `Promise<boolean>` |
| `removeNumber` | `removeNumber(key, field, value)` | `Promise<boolean>` — `true` if removed |
| `addNumberMulti` | `addNumberMulti(key, { field: value[] })` | `Promise<{ field: NumberSet }>` — only newly added values |
| `hasNumberMulti` | `hasNumberMulti(key, { field: value[] })` | `Promise<{ field: NumberSet }>` — only members |
| `removeNumberMulti` | `removeNumberMulti(key, { field: value[] })` | `Promise<{ field: NumberSet }>` — only removed values |

```typescript
import { NumberSet, StringSet, storage } from '@zaiusinc/app-sdk';

await storage.kvStore.put('processed', { ids: new StringSet(['event-1', 'event-2']) });

const added = await storage.kvStore.addString('processed', 'ids', 'event-3');
// added = true (false if already a member)

const member = await storage.kvStore.hasString('processed', 'ids', 'event-3');
// member = true

await storage.kvStore.removeString('processed', 'ids', 'event-1');

const { ids } = await storage.kvStore.get<{ ids: StringSet }>('processed');

// Multi variant
const newlyAdded = await storage.kvStore.addStringMulti('processed', {
  ids: ['event-4', 'event-5', 'event-2'], // event-2 already exists
});
// newlyAdded = { ids: StringSet{'event-4', 'event-5'} }
```

---

## sharedKvStore

Same API as `kvStore`, but scoped to the app ID rather than a specific installation — data is shared across every installation of the app, across all OCP accounts.

Typical use: a routing table that maps an inbound identifier (e.g. an OCP `trackerId`, or an external system's account ID) to an `installId` so a global function can forward requests to the correct installation endpoint.

```typescript
import { getAppContext, storage } from '@zaiusinc/app-sdk';

// In onInstall — register this installation
const { trackerId, installId } = getAppContext();
await storage.sharedKvStore.put(trackerId, { installId });
```

```typescript
import { functions, KVHash, storage } from '@zaiusinc/app-sdk';

interface InstallEntry extends KVHash {
  installId: number;
}

// In GlobalFunction — look up and route
const { installId } = await storage.sharedKvStore.get<InstallEntry>(trackerId);
const endpoints = await functions.getEndpoints(installId);
```

---

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Storing app-generated sensitive values in `storage.settings` or `storage.kvStore` | Use `storage.secrets` |
| Using `storage.settings`, `storage.secrets`, or `storage.kvStore` in a `GlobalFunction` | Only `sharedKvStore` is accessible without an installation context |
| Using `sharedKvStore` when per-installation isolation is needed | Data in `sharedKvStore` is shared across all customers — use `kvStore` for per-installation state |
| Read-modify-write: `get` → modify → `put` under concurrent writers | Use `patch(key, updater)` — the updater is retried automatically until it wins the CAS check |
| Putting API calls, notifications, or counters inside a `patch` updater | The updater may be called multiple times — keep it pure (transform the value only, no side effects) |
| Assuming `patch` returns the new value | `patch` returns the **previous** value, not the updated one |
| Calling `addString` on a field holding a `NumberSet` or list (or vice versa) | Field types are fixed after first write — throws `Cannot operate on <X> as a <Y>` at runtime |
| Calling `increment` on a non-numeric field | The operation is rejected — ensure the field is numeric or does not exist yet |
