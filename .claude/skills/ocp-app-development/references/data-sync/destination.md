# Data Sync — Destination

- [Concepts](#concepts)
- [app.yml](#appyml)
- [Schema](#schema)
  - [Static schema](#static-schema)
  - [Dynamic schema](#dynamic-schema)
  - [Field types](#field-types)
- [Destination class](#destination-class)
  - [ready()](#ready)
  - [deliver()](#deliver)
  - [Delete handling](#delete-handling)
- [Common mistakes](#common-mistakes)

## Concepts

A **destination** receives data from the sync pipeline and delivers it to an external system. Customers pair a source with a destination in the Sync Manager and map source fields to destination fields. The platform calls `ready()` first to validate credentials and configuration, then calls `deliver(batch)` in a loop, passing one batch of records at a time.

## app.yml

```yaml
destinations:
  my_destination:
    entry_point: MyDestination      # class extends Destination<T>
    description: Sends products to ExternalService
    schema: my_destination_schema   # static — references src/destinations/schema/my_destination_schema.yml
    # OR dynamic schema:
    # schema:
    #   entry_point: MyDestinationSchema  # class extends DestinationSchemaFunction
    supports_delete: true           # optional — include if the destination handles _isDeleted records
```

## Schema

The schema declares which fields the destination accepts. Customers map source fields to these fields in the Sync Manager.

### Static schema

Define the schema in a YAML file at `src/destinations/schema/<schema-name>.yml`. Reference it in `app.yml` by the file's base name (without `.yml`).

**app.yml:**
```yaml
destinations:
  my_destination:
    entry_point: MyDestination
    description: Sends products to ExternalService
    schema: my_destination_schema   # matches src/destinations/schema/my_destination_schema.yml
```

**src/destinations/schema/my_destination_schema.yml** — flat fields:
```yaml
name: my_destination_schema
display_name: My Destination Schema
description: Products in ExternalService
fields:
  - name: id
    type: string
    display_name: ID
    description: Unique identifier
    primary: true
  - name: name
    type: string
    display_name: Name
    description: Product name
  - name: price
    type: float
    display_name: Price
    description: Product price
  - name: active
    type: boolean
    display_name: Active
    description: Whether the product is active
  - name: tag_list
    type: "[string]"
    display_name: Tags
    description: Product tags
```

**Nested fields with `custom_types`** — use when the destination accepts structured objects or arrays of objects:

```yaml
name: my_destination_schema
display_name: My Destination Schema
description: Products in ExternalService
fields:
  - name: id
    type: string
    display_name: ID
    description: Unique identifier
    primary: true
  - name: name
    type: string
    display_name: Name
    description: Product name
  - name: metadata
    type: product_metadata          # reference to a custom type
    display_name: Metadata
    description: Additional product details
  - name: variants
    type: "[product_variant]"       # array of a custom type
    display_name: Variants
    description: Product variants
custom_types:
  - name: product_metadata
    display_name: Product Metadata
    description: Additional product details
    fields:
      - name: category
        type: string
        display_name: Category
        description: Product category
      - name: brand
        type: string
        display_name: Brand
        description: Product brand
  - name: product_variant
    display_name: Product Variant
    description: A product variant
    fields:
      - name: variant_id
        type: string
        display_name: Variant ID
        description: Unique variant identifier
      - name: sku
        type: string
        display_name: SKU
        description: Stock keeping unit
      - name: price
        type: float
        display_name: Price
        description: Variant price
      - name: dimensions
        type: variant_dimensions       # reference to a custom type
        display_name: Dimensions
        description: Physical dimensions of the variant
  - name: variant_dimensions
    display_name: Variant Dimensions
    description: Physical dimensions of a variant
    fields:
      - name: width
        type: float
        display_name: Width
        description: Variant width
      - name: height
        type: float
        display_name: Height
        description: Variant height
      - name: unit
        type: string
        display_name: Unit
        description: Unit the dimensions are measured in
```

Custom types can reference other custom types (nested nesting). The `type` field on a custom-type field uses the same `name` value declared in `custom_types`.

### Dynamic schema

Use a dynamic schema when the field list is not known until runtime — for example, when reading schema configuration stored in settings, or fetching it from an external API.

```typescript
import { DestinationSchema, DestinationSchemaFunction } from '@zaiusinc/app-sdk';

export class MyDestinationSchema extends DestinationSchemaFunction {
  public async getDestinationsSchema(): Promise<DestinationSchema> {
    // this.config.destinationKey is the app.yml destination key ('my_destination' below).
    const fields = await fetchFieldsFromExternalApi(this.config.destinationKey);

    return {
      name: 'my_destination_schema',
      display_name: 'My Destination Schema',
      description: 'Products in ExternalService',
      fields: fields.map((f) => ({
        name: f.id,
        display_name: f.label,
        description: f.label,
        type: f.type,
        primary: f.id === 'id',
      })),
    };
  }
}
```

**app.yml:**
```yaml
destinations:
  my_destination:
    entry_point: MyDestination
    description: Sends products to ExternalService
    schema:
      entry_point: MyDestinationSchema
```

### Field types

| Type        | Description                                          |
|-------------|------------------------------------------------------|
| `string`    | Text value                                           |
| `int`       | Whole number                                         |
| `boolean`   | True/false                                           |
| `float`     | Floating-point number                                |
| `long`      | Large whole number                                   |
| `[string]`  | Array of strings                                     |
| `[int]`     | Array of whole numbers                               |
| `[boolean]` | Array of booleans                                    |
| `[float]`   | Array of floating-point numbers                      |
| `[MyType]`  | Array of a custom type                               |
| `MyType`    | Reference to a custom type defined in `custom_types` |

The only valid primitive types are `string`, `int`, `long`, `float`, and `boolean`. Any other bare word (e.g. `integer` or `decimal`) is treated as a custom-type reference and fails validation unless declared in `custom_types`.

One field must have `primary: true` — it is the record identifier.

## Destination class

```typescript
import { Destination, DestinationBatch, DestinationDeliverResult, DestinationReadyResult, logger } from '@zaiusinc/app-sdk';
import { storage } from '@zaiusinc/app-sdk';

interface ProductData {
  id: string;
  name: string;
  price: number;
  _isDeleted?: boolean;
}

export class MyDestination extends Destination<ProductData> {
  public async ready(): Promise<DestinationReadyResult> {
    const credentials = await storage.settings.get('credentials');
    if (!credentials?.api_key) {
      return { ready: false, message: 'API key is not configured' };
    }
    // Optionally verify the key against the external API
    return { ready: true };
  }

  public async deliver(batch: DestinationBatch<ProductData>): Promise<DestinationDeliverResult> {
    logger.info(`Delivering batch for sync ${batch.sync.name}`, {
      count: batch.items.length,
      attempt: batch.attempt,
    });

    try {
      for (const item of batch.items) {
        if (item._isDeleted) {
          await deleteFromExternalApi(item.id);
        } else {
          await upsertToExternalApi(item);
        }
      }
      return { success: true };
    } catch (error: any) {
      logger.error('Delivery failed', error);
      return {
        success: false,
        retryable: true,
        failureReason: error.message,
      };
    }
  }
}
```

### ready()

Called before delivery begins to validate credentials and configuration. Return `{ ready: false, message: '...' }` to block delivery with a user-visible message. Return `{ ready: true }` to allow delivery to proceed.

`ready()` may be called more than once, so cache any external validation result to avoid excessive requests to the external system.

### deliver()

Called in a loop — each invocation receives one batch of records. The platform handles retries by calling `deliver` again with the same batch if the previous call returned `{ success: false, retryable: true }`.

| `batch` property  | Type     | Description                                                  |
|-------------------|----------|--------------------------------------------------------------|
| `batch.items`     | `T[]`    | Records in this batch. Each item may have `_isDeleted: true` |
| `batch.sync.id`   | `string` | Unique identifier for the data sync configuration            |
| `batch.sync.name` | `string` | Human-readable name of the data sync                         |
| `batch.attempt`   | `number` | Delivery attempt number — `1` on the first try               |

| Return field    | Type      | Description                                              |
|-----------------|-----------|----------------------------------------------------------|
| `success`       | `boolean` | Whether delivery succeeded                               |
| `retryable`     | `boolean` | When `success: false`, whether the platform should retry |
| `failureReason` | `string`  | Optional user-visible failure message                    |

### Delete handling

When a source emits a record with `_isDeleted: true`, the platform delivers it to destinations that declare `supports_delete: true` in `app.yml`. Destinations without `supports_delete: true` never receive delete records.

Always check `item._isDeleted` before upserting. If the destination cannot delete records, return `{ success: true }` and skip the item — do not return an error.

```typescript
for (const item of batch.items) {
  if (item._isDeleted) {
    await client.delete(item.id);
  } else {
    await client.upsert(item);
  }
}
```

## Common mistakes

| Mistake                                                                | Fix                                                                                                                |
|------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| No `primary: true` field in the schema                                 | Exactly one field must be marked `primary: true`                                                                   |
| `deliver()` returns `{ success: false }` without `retryable`           | Set `retryable: true` for transient failures; without it the platform does not retry                               |
| Processing delete records without `supports_delete: true` in `app.yml` | Delete records are only delivered when `supports_delete: true` is set; add it if the destination handles deletions |
| Treating `batch.attempt` as a zero-indexed retry count                 | `batch.attempt` starts at `1` on the first delivery attempt                                                        |
