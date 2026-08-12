# ODP Schema

- [Overview](#overview)
- [Extending standard objects](#extending-standard-objects)
  - [Custom fields](#custom-fields)
  - [Custom identifiers](#custom-identifiers)
- [Custom objects](#custom-objects)
- [Relations](#relations)
  - [On standard objects](#on-standard-objects)
  - [On custom objects](#on-custom-objects)
- [Field types](#field-types)
- [Validation and constraints](#validation-and-constraints)
- [Reading schema at runtime](#reading-schema-at-runtime)
  - [getObject](#getobject)
  - [getAllObjects](#getallobjects)
  - [Field properties](#field-properties)
  - [Examples](#examples)

## Overview

ODP comes with built-in objects — **customers**, **events**, **products**, and **orders**. Apps extend these with custom fields, identifiers, and relations, and can create entirely new custom objects. Schema is declared as YAML files in `src/schema/` and applied by OCP automatically when the app is installed or upgraded — no code required.

## Extending standard objects

To add fields or identifiers to a built-in ODP object, create a YAML file named after that object in `src/schema/`. The file extends the object — it does not replace it.

### Custom fields

Field names added to standard objects must be prefixed with the app ID (`{app_id}_`). Display names must be prefixed with the app display name.

```yaml
# src/schema/customers.yml
name: customers
fields:
  - name: acme_membership_tier
    display_name: Acme Membership Tier
    type: string
    description: The customer's current membership tier
  - name: acme_joined_date
    display_name: Acme Joined Date
    type: timestamp
    description: Date the customer joined the program
```

The same applies to the `events`, `products`, and `orders` objects — any field added to a standard object must carry the `{app_id}_` prefix.

### Custom identifiers

Identifiers can only be added to the `customers` object. Each identifier becomes a new way to look up and merge customer profiles. Once a customer is upserted with this identifier via `odp.customer()`, ODP uses it for profile resolution.

Identifier names must be prefixed with `{app_id}_` and end with one of: `_id`, `_hash`, `_number`, `_token`, `_alias`, `_address`, `_key`.

```yaml
# src/schema/customers.yml
name: customers
identifiers:
  - name: acme_loyalty_id
    display_name: Acme Loyalty ID
    merge_confidence: high
fields:
  - name: acme_joined_date
    display_name: Acme Joined Date
    type: timestamp
    description: Date the customer joined the loyalty program
```

| Property | Description |
| --- | --- |
| `name` | Prefixed with `{app_id}_`, ends with `_id`, `_hash`, `_number`, `_token`, `_alias`, `_address`, or `_key` |
| `display_name` | Prefixed with the app display name; ends with the matching suffix text (e.g. `" ID"` for `_id`) |
| `merge_confidence` | `high` for deterministic identifiers (user IDs); `low` for shared or probabilistic identifiers (device tokens) |

## Custom objects

Create a YAML file named `<plural_object_name>.yml` in `src/schema/`. The filename must exactly match the object `name`. Custom object names must be prefixed with the app ID (`{app_id}_`), be plural, and be globally unique.

Every custom object requires exactly one field with `primary: true` — this is the unique key used when upserting records via `odp.object()`. Fields on custom objects do **not** need the `{app_id}_` prefix — the object itself is already prefixed, so fields are scoped to it automatically.

```yaml
# src/schema/acme_stores.yml
name: acme_stores
display_name: Acme Stores
alias: acme_store
fields:
  - name: store_id
    display_name: Store ID
    type: string
    description: Unique store identifier
    primary: true
  - name: store_name
    display_name: Store Name
    type: string
    description: Name of the store
  - name: store_location
    display_name: Store Location
    type: string
    description: City and country of the store
```

## Relations

A relation connects records in a parent object to records in a child object via a shared field value. It lets ODP navigate from one object to another — for example, from an order to the store it was placed in, or from a customer record to their associated tickets.

A relation is declared on the parent object and specifies which of its fields matches the primary key of the child object.

### On standard objects

When adding a relation to a standard object, both the linking field and the relation name must be prefixed with `{app_id}_`.

```yaml
# src/schema/orders.yml
name: orders
fields:
  - name: acme_store_id
    display_name: Acme Store ID
    type: string
    description: The store where this order was placed
relations:
  - name: acme_store               # prefixed with app_id
    display_name: Acme Store
    child_object: acme_stores      # the custom object to link to
    join_fields:
      - parent: acme_store_id      # the linking field above (on orders)
        child: store_id            # primary key of acme_stores
```

### On custom objects

When defining a relation on a custom object, no prefix is required — the object itself is already prefixed.

```yaml
# src/schema/acme_orders.yml
name: acme_orders
display_name: Acme Orders
fields:
  - name: order_id
    display_name: Order ID
    type: string
    description: Unique order identifier
    primary: true
  - name: store_id
    display_name: Store ID
    type: string
    description: The store where this order was placed
relations:
  - name: store                    # no prefix required on custom objects
    display_name: Store
    child_object: acme_stores
    join_fields:
      - parent: store_id           # the linking field above (on acme_orders)
        child: store_id            # primary key of acme_stores
```

## Field types

These types apply to all fields on all objects — both standard and custom:

| Type | Description | Example values |
| --- | --- | --- |
| `string` | Text up to 1024 characters | `"gold"`, `"New York"` |
| `number` | Integer or decimal | `42`, `19.99`, `-2.3` |
| `boolean` | True/false | `true`, `false`, `0`, `1` |
| `timestamp` | ISO 8601 or UNIX epoch seconds | `"2024-01-15T10:30:00Z"`, `1705312200` |
| `vector` | Array of floats | `[0.1, -0.4, 0.9, ...]` |

## Validation and constraints

Run `ocp app validate` after changing any schema file to catch errors before deploying.

- Objects and fields **cannot be deleted or renamed** after they are created in ODP.
- Standard objects (`customers`, `events`, `products`, `orders`) can only be extended, never replaced.
- Each object requires exactly one `primary: true` field; its type must be `string`.

## Reading schema at runtime

`odp.schema` provides read-only access to the ODP schema for the current account. Both `getObject` and `getAllObjects` return an `HttpResponse` with `{ success, status, data }` — access `result.data` directly without checking `result.success`; the call throws on failure.

### getObject

Returns the full definition of a single ODP object including all its fields.

```typescript
import { odp } from '@zaiusinc/node-sdk';

const result = await odp.schema.getObject('customers');
const fields = result.data.fields;
```

Common object names: `'customers'`, `'events'`, `'products'`, `'orders'`, or any custom object name (e.g. `'acme_stores'`).

### getAllObjects

Returns definitions for all objects in the account.

```typescript
const result = await odp.schema.getAllObjects();
// result.data — ObjectDefinition[]
```

### Field properties

Each field in `result.data.fields` has:

| Property | Type | Description |
| --- | --- | --- |
| `name` | string | Field name used in API calls and `odp.customer()` / `odp.object()` payloads |
| `display_name` | string | Human-readable label shown in the OCP UI |
| `type` | string | `'string'`, `'number'`, `'boolean'`, `'timestamp'`, `'vector'` |
| `primary` | boolean | `true` if this is the primary key field |
| `auto` | boolean | `true` for system-managed fields (e.g. internal timestamps) — exclude these from user-facing field mapping options. Not in the TypeScript types — access via `field['auto']` |
| `semantic_type` | string | `'identifier'` for identifier fields, otherwise undefined. Not in the TypeScript types — access via `field['semantic_type']` |

### Examples

#### Settings form remote select — list ODP customer fields

A regular `App.Function` that returns options as a JSON array. Reference it in the form YAML via `dataSource.function`.

```typescript
import * as App from '@zaiusinc/app-sdk';
import { Schema } from '@zaiusinc/app-forms-schema';
import { odp } from '@zaiusinc/node-sdk';

export class ListCustomerFields extends App.Function {
  public async perform(): Promise<App.Response> {
    const result = await odp.schema.getObject('customers');

    const options: Schema.SelectOption[] = result.data.fields
      .filter((field) => field.type === 'string' && !field['auto'])
      .map((field) => ({
        text: `${field.display_name} [${field.type}]`,
        value: field.name,
      }))
      .sort((a, b) => a.text.localeCompare(b.text));

    return new App.Response(200, options);
  }
}
```

**app.yml:**
```yaml
functions:
  list_customer_fields:
    entry_point: ListCustomerFields
    description: Lists ODP customer fields for field mapping
```

**forms/settings.yml:**
```yaml
- type: select
  key: odp_field
  label: ODP Field
  dataSource:
    type: app
    function: list_customer_fields
```

#### Dynamic field mapping — match external fields to ODP fields

```typescript
import { odp } from '@zaiusinc/node-sdk';

const result = await odp.schema.getObject('customers');
const odpFieldNames = new Set(result.data.fields.map((f) => f.name));

const attributes = Object.fromEntries(
  Object.entries(externalRecord).filter(([key]) => odpFieldNames.has(key))
);

await odp.customer({ identifiers: { email: externalRecord.email }, attributes });
```
