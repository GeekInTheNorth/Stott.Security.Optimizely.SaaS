# ODP Objects — `odp.object()`

- [Overview](#overview)
- [Arguments](#arguments)
- [Payload shape](#payload-shape)
- [Batching](#batching)
- [Response handling](#response-handling)
- [Examples](#examples)
- [Common mistakes](#common-mistakes)

## Overview

`odp.object()` upserts one or more records into a custom ODP object. The object type must be defined in `src/schema/` before writing records to it. If a record with the same primary key already exists, the call merges the provided fields into the existing record.

```typescript
import { odp } from '@zaiusinc/node-sdk';

// single record
await odp.object('acme_stores', {
  acme_store_id: 'store_001',
  acme_store_name: 'Downtown Branch',
  acme_store_location: 'New York, US',
});

// batch — up to 100 records per call
await odp.object('acme_stores', [
  { acme_store_id: 'store_001', acme_store_name: 'Downtown Branch' },
  { acme_store_id: 'store_002', acme_store_name: 'Uptown Branch' },
]);
```

## Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `type` | Yes | The object name — must match a `name` in `src/schema/<name>.yml` exactly |
| `payload` | Yes | A single record object or an array of up to 100 records |

## Payload shape

```typescript
{
  [field: string]: string | number | boolean | null;
}
```

Payload keys must be field names defined in the object's schema. Values must be `string`, `number`, `boolean`, or `null`. The primary key field is required in every payload — it identifies which record to create or update.

```typescript
{
  acme_store_id: 'store_001',    // primary key — required
  acme_store_name: 'Main St',   // other fields
  acme_store_active: true,
}
```

## Batching

- Maximum **100 records per call**
- For large imports, split into chunks of 100

```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < records.length; i += BATCH_SIZE) {
  await odp.object('acme_stores', records.slice(i, i + BATCH_SIZE));
}
```

## Response handling

Returns an `HttpResponse` with `{ success, status, data }` but throws on network or auth errors — just `await` the call without checking the return value.

## Examples

### Upserting a single custom object record

```typescript
import * as App from '@zaiusinc/app-sdk';
import { odp } from '@zaiusinc/node-sdk';

export class StoreWebhook extends App.Function {
  public async perform(): Promise<App.Response> {
    const body = this.request.bodyJSON as { id: string; name: string; city: string };

    await odp.object('acme_stores', {
      acme_store_id: body.id,
      acme_store_name: body.name,
      acme_store_location: body.city,
    });

    return new App.Response(200);
  }
}
```

### Importing many records from a job

```typescript
import { odp } from '@zaiusinc/node-sdk';

// Transform external records to ODP object payloads
const payloads = externalStores.map((store) => ({
  acme_store_id: store.id,
  acme_store_name: store.name,
  acme_store_location: store.city,
}));

const BATCH_SIZE = 100;
for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
  await odp.object('acme_stores', payloads.slice(i, i + BATCH_SIZE));
}
```


## Common mistakes

| Mistake | Fix |
| --- | --- |
| Object type does not exist | Define the object in `src/schema/<type>.yml` and deploy before writing records |
| Primary key missing from payload | The primary key field is required in every record — without it ODP cannot upsert |
| Field name not in the object schema | Only fields declared in the schema YAML can be written; unknown fields are ignored or rejected |
| Sending more than 100 records in one call | Split into chunks of 100 |
