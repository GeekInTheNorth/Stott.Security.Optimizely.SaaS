# ODP Customers — `odp.customer()`

- [Overview](#overview)
- [Payload shape](#payload-shape)
- [Identifiers](#identifiers)
- [Attributes](#attributes)
- [Payload options](#payload-options)
- [Batching](#batching)
- [Response handling](#response-handling)
- [Examples](#examples)
- [Common mistakes](#common-mistakes)

## Overview

`odp.customer()` upserts one or more customer profiles in ODP. If a customer with a matching identifier already exists, the call merges the provided attributes into the existing profile.

```typescript
import { odp } from '@zaiusinc/node-sdk';

// single customer
await odp.customer({
  identifiers: { email: 'user@example.com' },
  attributes: { first_name: 'Ada', last_name: 'Lovelace' },
});

// batch — up to 100 customers per call
await odp.customer([
  { identifiers: { email: 'a@example.com' }, attributes: { first_name: 'Ada' } },
  { identifiers: { email: 'b@example.com' }, attributes: { first_name: 'Bob' } },
]);
```

## Payload shape

```typescript
{
  identifiers: { [field: string]: string };              // required, at least one
  attributes: { [field: string]: string | number | boolean | null };
}
```

| Field | Required | Description |
| --- | --- | --- |
| `identifiers` | Yes | Tells ODP which customer to upsert — at least one required |
| `attributes` | Yes | Customer fields to set or update |

## Identifiers

At least one identifier is required. All identifier values must be strings. Use any identifier defined on the `customers` object — built-in (`email`) or custom (e.g. `acme_loyalty_id`).

```typescript
// built-in
identifiers: { email: 'user@example.com' }

// custom (defined in src/schema/customers.yml)
identifiers: { acme_loyalty_id: 'loyalty_456' }

// multiple — ODP merges profiles that share any identifier
identifiers: { email: 'user@example.com', acme_loyalty_id: 'loyalty_456' }
```

## Attributes

Attribute keys must be field names that exist on the ODP `customers` object — either built-in fields or custom fields defined in `src/schema/customers.yml`. Values must be `string`, `number`, `boolean`, or `null`.

```typescript
attributes: {
  first_name: 'Ada',
  last_name: 'Lovelace',
  acme_membership_tier: 'gold',         // custom field prefixed with app_id
  acme_joined_date: 1705312200,         // timestamp as unix epoch
}
```

Setting a field to `null` clears its value (subject to `excludeNulls` option below).

## Payload options

Pass an optional second argument to control how empty strings and null values are handled before sending.

```typescript
await odp.customer(payload, {
  trimToNull: true,    // default true  — converts empty strings to null
  excludeNulls: true,  // default true  — removes null fields from the payload
});
```

Both options are `true` by default. To explicitly clear a field in ODP, set `excludeNulls: false` so the null value is sent.

## Batching

- Maximum **100 customers per call**
- For large imports, split into chunks of 100

```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < customers.length; i += BATCH_SIZE) {
  await odp.customer(customers.slice(i, i + BATCH_SIZE));
}
```

## Response handling

Returns an `HttpResponse` with `{ success, status, data }` but throws on network or auth errors — just `await` the call without checking the return value.

## Examples

### From a webhook — capturing a lead

```typescript
import * as App from '@zaiusinc/app-sdk';
import { odp } from '@zaiusinc/node-sdk';

export class LeadWebhook extends App.Function {
  public async perform(): Promise<App.Response> {
    const body = this.request.bodyJSON as { email: string; first_name: string; company: string };

    await odp.customer({
      identifiers: { email: body.email },
      attributes: {
        first_name: body.first_name,
        acme_company: body.company,
      },
    });

    return new App.Response(200);
  }
}
```

### From a job — importing contacts with a custom identifier

```typescript
import { odp } from '@zaiusinc/node-sdk';

// Map external contacts to ODP customer payloads
const payloads = contacts.map((contact) => ({
  identifiers: {
    email: contact.email,
    acme_crm_contact_id: contact.id,   // custom identifier from src/schema/customers.yml
  },
  attributes: {
    first_name: contact.firstName,
    last_name: contact.lastName,
    acme_membership_tier: contact.tier,
  },
}));

// Send in batches of 100
const BATCH_SIZE = 100;
for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
  await odp.customer(payloads.slice(i, i + BATCH_SIZE));
}
```

## Common mistakes

| Mistake | Fix |
| --- | --- |
| No identifier provided | At least one identifier with a non-empty string value is required |
| Identifier value is not a string | All identifier values must be strings — convert numbers to strings |
| Attribute key does not exist in ODP schema | Define the field in `src/schema/customers.yml` before writing to it |
| Sending more than 100 customers in one call | Split into chunks of 100 |
| Expecting null to clear a field, but excludeNulls is true | Pass `{ excludeNulls: false }` as the second argument to send null values |
