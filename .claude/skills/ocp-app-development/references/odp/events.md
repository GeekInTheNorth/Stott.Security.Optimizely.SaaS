# ODP Events — `odp.event()`

- [Overview](#overview)
- [Payload shape](#payload-shape)
- [Identifiers](#identifiers)
- [Event data](#event-data)
- [Batching](#batching)
- [Response handling](#response-handling)
- [Examples](#examples)
- [Common mistakes](#common-mistakes)

## Overview

`odp.event()` sends one or more events to ODP. Events record customer interactions and are stored in the built-in `events` object.

```typescript
import { odp } from '@zaiusinc/node-sdk';

// single event
await odp.event({
  type: 'purchase',
  identifiers: { email: 'user@example.com' },
  data: { order_id: 'ord_123', amount: 49.99 },
});

// batch — up to 100 events per call
await odp.event([
  { type: 'pageview', identifiers: { email: 'a@example.com' }, data: { page: '/home' } },
  { type: 'pageview', identifiers: { email: 'b@example.com' }, data: { page: '/pricing' } },
]);
```

## Payload shape

```typescript
{
  type: string;                                           // required
  action?: string;
  identifiers: { [field: string]: string };              // required, at least one
  data: { [field: string]: string | number | boolean | null };
}
```

| Field | Required | Description |
| --- | --- | --- |
| `type` | Yes | Event type — a noun describing the thing that happened (e.g. `'purchase'`, `'pageview'`, `'lead'`) |
| `action` | No | Sub-action on the event type (e.g. `'detail'`, `'add'`, `'remove'`) |
| `identifiers` | Yes | At least one identifier linking the event to a customer profile |
| `data` | Yes | Event payload — field names and values |

## Identifiers

At least one identifier is required. Identifier values must be strings. Use any identifier defined on the `customers` object — built-in or custom.

```typescript
// built-in identifiers
identifiers: { email: 'user@example.com' }
identifiers: { vuid: 'abc123' }   // ODP Web SDK visitor ID — only when forwarding from browser

// custom identifier
identifiers: { acme_loyalty_id: 'loyalty_456' }

// multiple identifiers
identifiers: { email: 'user@example.com', acme_loyalty_id: 'loyalty_456' }
```

## Event data

`data` accepts primitive values — `string`, `number`, `boolean`, or `null` — as well as nested objects and arrays for richer payloads.

```typescript
data: {
  order_id: 'ord_123',
  amount: 49.99,
  currency: 'USD',
  is_first_purchase: true,
}
```

To add optional source attribution fields to any event:

```typescript
data: {
  order_id: 'ord_123',
  data_source_type: 'app',
  data_source: 'Acme App',
  data_source_details: 'NightlyImportJob:2024-01-15',
}
```

## Batching

- Maximum **100 events per call**
- For high-volume imports, collect events into an array and send in chunks of 100

```typescript
const BATCH_SIZE = 100;
for (let i = 0; i < events.length; i += BATCH_SIZE) {
  await odp.event(events.slice(i, i + BATCH_SIZE));
}
```

## Response handling

Returns an `HttpResponse` with `{ success, status, data }` but throws on network or auth errors — just `await` the call without checking the return value.

## Examples

### From a webhook — recording a lead event

```typescript
import * as App from '@zaiusinc/app-sdk';
import { odp } from '@zaiusinc/node-sdk';

export class LeadWebhook extends App.Function {
  public async perform(): Promise<App.Response> {
    const body = this.request.bodyJSON as { email: string; source: string };

    await odp.event({
      type: 'lead',
      action: 'submit',
      identifiers: { email: body.email },
      data: { source: body.source },
    });

    return new App.Response(200);
  }
}
```

### From a job — linking objects via events

Emit a relational event that associates a custom object record with a customer (pattern from Salesforce CRM Sync):

```typescript
await odp.event({
  type: 'acme_opportunity',
  identifiers: { email: contact.email },
  data: {
    acme_opportunity_id: opportunity.id,
    acme_opportunity_name: opportunity.name,
    acme_opportunity_stage: opportunity.stage,
  },
});
```

## Common mistakes

| Mistake | Fix |
| --- | --- |
| No identifier provided | At least one identifier with a non-empty string value is required |
| Identifier value is not a string | All identifier values must be strings — convert numbers to strings before sending |
| Sending more than 100 events in one call | Split into chunks of 100 |
| Using `type` as an action (e.g. `type: 'click'`) | `type` is the noun (what object was acted on); use `action` for the verb (what happened) |
