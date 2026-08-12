# ODP Lists — `odp.list`

- [Overview](#overview)
- [createList](#createlist)
- [getLists](#getlists)
- [subscribe](#subscribe)
- [unsubscribe](#unsubscribe)
- [updateSubscriptions](#updatesubscriptions)
- [Response handling](#response-handling)
- [Examples](#examples)
- [Common mistakes](#common-mistakes)

## Overview

`odp.list` manages ODP list subscriptions. A list is a named group of customers in ODP — subscribing a customer adds them to that group, making them reachable for campaigns targeting that list.

## createList

Creates a new ODP list. The list name is converted to a `list_id` by lowercasing and replacing non-alphanumerics with `_`. Throws if a list with the same name already exists.

```typescript
await odp.list.createList('My Marketing List');
// creates list with list_id: 'my_marketing_list'
```

## getLists

Returns all ODP lists in the account.

```typescript
const result = await odp.list.getLists();
const lists = result.data.lists;
```

**Response:**
```typescript
{
  lists: Array<{
    list_id: string;
    name: string;
    created_at: string; // ISO 8601
  }>;
}
```

Each list has:

| Property | Type | Description |
| --- | --- | --- |
| `list_id` | string | Unique list identifier — use this when calling `subscribe()` |
| `name` | string | Human-readable list name |
| `created_at` | string | ISO 8601 creation date |

## subscribe

Adds one or more customers to a list. The customer must be identified by at least one identifier.

```typescript
// single customer
await odp.list.subscribe(listId, { email: 'user@example.com' });

// batch — up to 100 per call
await odp.list.subscribe(listId, [
  { email: 'a@example.com' },
  { email: 'b@example.com' },
]);
```

`Identifiers` is a plain object with identifier field names as keys and string values:

```typescript
{ email: 'user@example.com' }
{ acme_loyalty_id: 'loyalty_456' }
{ email: 'user@example.com', acme_loyalty_id: 'loyalty_456' }
```

## unsubscribe

Removes one or more customers from a list.

```typescript
// single customer
await odp.list.unsubscribe(listId, { email: 'user@example.com' });

// batch — up to 100 per call
await odp.list.unsubscribe(listId, [
  { email: 'a@example.com' },
  { email: 'b@example.com' },
]);
```

## updateSubscriptions

Bulk subscribe and unsubscribe in a single call — each update specifies whether the customer should be subscribed or not. Useful when processing a batch that contains a mix of opt-ins and opt-outs. Maximum 100 updates per call.

```typescript
await odp.list.updateSubscriptions(listId, [
  { email: 'a@example.com', subscribed: true },
  { email: 'b@example.com', subscribed: false },
]);
```

Each update must include at least one identifier and a `subscribed` boolean. An optional `list_id` per update overrides the default `listId` argument, allowing a single call to target multiple lists.

## Response handling

All methods return an `HttpResponse` with `{ success, status, data }`. Read calls (`getLists`) — access `result.data` directly; the call throws on failure. Write calls (`subscribe`, `unsubscribe`) — just `await` without checking the return value.

## Examples

### Settings form remote select — populate list dropdown

A regular `App.Function` that returns ODP lists as options. Reference it in the form YAML via `dataSource.function`.

```typescript
import * as App from '@zaiusinc/app-sdk';
import { Schema } from '@zaiusinc/app-forms-schema';
import { odp } from '@zaiusinc/node-sdk';

export class GetLists extends App.Function {
  public async perform(): Promise<App.Response> {
    const result = await odp.list.getLists();

    const options: Schema.SelectOption[] = [
      { text: '[No List]', value: '' },
      ...result.data.lists.map((list) => ({
        text: list.name,
        value: list.list_id,
      })),
    ];

    return new App.Response(200, options);
  }
}
```

**app.yml:**
```yaml
functions:
  get_lists:
    entry_point: GetLists
    description: Lists ODP lists for settings form
```

**forms/settings.yml:**
```yaml
- type: select
  key: list_id
  label: ODP List
  dataSource:
    type: app
    function: get_lists
```

### Ingestion — subscribe a lead to the configured list

After capturing a lead from a webhook, upsert the customer and subscribe them to the ODP list selected in settings:

```typescript
import * as App from '@zaiusinc/app-sdk';
import { storage } from '@zaiusinc/app-sdk';
import { odp } from '@zaiusinc/node-sdk';

export class LeadWebhook extends App.Function {
  public async perform(): Promise<App.Response> {
    const body = this.request.bodyJSON as { email: string; first_name: string };

    // 1. upsert the customer profile
    await odp.customer({
      identifiers: { email: body.email },
      attributes: { first_name: body.first_name },
    });

    // 2. subscribe to the list configured in settings
    const { listId } = await storage.settings.get<{ listId: string }>('config');
    if (listId) {
      await odp.list.subscribe(listId, { email: body.email });
    }

    return new App.Response(200);
  }
}
```

### Unsubscribe a customer from a list

```typescript
import * as App from '@zaiusinc/app-sdk';
import { storage } from '@zaiusinc/app-sdk';
import { odp } from '@zaiusinc/node-sdk';

export class UnsubscribeWebhook extends App.Function {
  public async perform(): Promise<App.Response> {
    const body = this.request.bodyJSON as { email: string };

    const { listId } = await storage.settings.get<{ listId: string }>('config');
    if (listId) {
      await odp.list.unsubscribe(listId, { email: body.email });
    }

    return new App.Response(200);
  }
}
```

### Resolve list by name from settings

When settings store a list name rather than a list ID, look up the ID at runtime:

```typescript
import { odp } from '@zaiusinc/node-sdk';
import { storage } from '@zaiusinc/app-sdk';

const { listName } = await storage.settings.get<{ listName: string }>('config');
const result = await odp.list.getLists();

const list = result.data.lists.find(
  (l) => l.name.toLowerCase() === listName.toLowerCase()
);

if (list) {
  await odp.list.subscribe(list.list_id, { email: customerEmail });
}
```

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Passing `list.name` to `subscribe()` instead of `list.list_id` | `subscribe()` takes the `list_id` — use `getLists()` to find it by name first |
| No identifier in the identifiers object | At least one identifier with a non-empty string value is required |
| Sending more than 100 identifiers in one call | Split into chunks of 100 |
| Subscribing before the customer profile exists in ODP | Call `odp.customer()` first to create the profile, then subscribe |
