# Data Sync — Source

- [Concepts](#concepts)
- [app.yml](#appyml)
- [Schema](#schema)
  - [Static schema](#static-schema)
  - [Dynamic schema](#dynamic-schema)
  - [Field types](#field-types)
- [Emitting data](#emitting-data)
  - [From a Function (webhook)](#from-a-function-webhook)
  - [From a Job (historical import)](#from-a-job-historical-import)
  - [Delete events](#delete-events)
- [Common mistakes](#common-mistakes)

## Concepts

A **source** receives data from an external system and emits it into the sync pipeline, where it flows to paired destinations in the Sync Manager.

Any regular `Function` or `Job` can emit data to a source by calling `sources.emit(sourceName, { data: {...} })`. The platform fans out the emitted record to all active data syncs configured for that source. A single call to `sources.emit` reaches every paired destination automatically — no per-sync knowledge required in the emitting code.

The source declaration in `app.yml` defines the schema (what fields the source exposes) and gives the source a key (the identifier used in `sources.emit`). The functions and jobs that feed data into the source are declared at the top level — not nested inside the source.

## app.yml

```yaml
sources:
  my_source:
    description: Products from ExternalService
    schema: my_source_schema        # static — references src/sources/schema/my_source_schema.yml
    # OR dynamic schema:
    # schema:
    #   entry_point: MySourceSchema  # class extends SourceSchemaFunction
```

The key under `sources:` (`my_source` above) is the **source name** — the exact string passed as the first argument to `sources.emit`.

## Schema

The schema declares which fields a source exposes. Customers map these fields to destination fields in the Sync Manager.

### Static schema

Define the schema in a YAML file at `src/sources/schema/<schema-name>.yml`. Reference it in `app.yml` with `schema: <schema-name>`.

```yaml
name: my_source_schema
display_name: My Source Schema
description: Products from ExternalService
fields:
  - name: product_id
    type: string
    display_name: Product ID
    description: Unique product identifier
    primary: true
  - name: title
    type: string
    display_name: Title
    description: Product title
  - name: price
    type: float
    display_name: Price
    description: Product price
  - name: in_stock
    type: boolean
    display_name: In Stock
    description: Whether the product is available
  - name: variant_ids
    type: "[string]"
    display_name: Variant IDs
    description: List of variant identifiers
  - name: info
    type: product_info               # reference to a custom type
    display_name: Product Info
    description: Nested product details
custom_types:
  - name: product_info
    display_name: Product Info
    description: Nested product details
    fields:
      - name: category
        type: string
        display_name: Category
        description: Product category
      - name: tags
        type: "[string]"
        display_name: Tags
        description: Product tags
      - name: manufacturer
        type: manufacturer_info        # reference to a custom type
        display_name: Manufacturer
        description: Who makes the product
  - name: manufacturer_info
    display_name: Manufacturer Info
    description: Details about the product's manufacturer
    fields:
      - name: name
        type: string
        display_name: Name
        description: Manufacturer name
      - name: country
        type: string
        display_name: Country
        description: Country of manufacture
```

### Dynamic schema

Use a dynamic schema when the field list is not known until runtime — for example, when fetching fields from an external API.

```typescript
import { SourceSchema, SourceSchemaFunction } from '@zaiusinc/app-sdk';

export class MySourceSchema extends SourceSchemaFunction {
  public async getSourcesSchema(): Promise<SourceSchema> {
    // this.config.sourceKey is the app.yml source key ('my_source' below).
    const fields = await fetchFieldsFromExternalApi(this.config.sourceKey);

    return {
      name: 'my_source_schema',
      display_name: 'My Source Schema',
      description: 'Products from ExternalService',
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
sources:
  my_source:
    description: Products from ExternalService
    schema:
      entry_point: MySourceSchema
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

One field must have `primary: true` — it is the record identifier used for deduplication.

## Emitting data

Import `sources` from `@zaiusinc/app-sdk` and call `sources.emit(sourceName, { data: {...} })`. The `sourceName` must match the key declared under `sources:` in `app.yml` exactly.

### From a Function (webhook)

```typescript
import { Function, logger, Request, Response, sources } from '@zaiusinc/app-sdk';

interface ProductData {
  product_id: string;
  title: string;
  price: number;
  _isDeleted?: boolean;
}

export class ProductWebhook extends Function {
  public constructor(request: Request) {
    super(request);
  }

  public async perform(): Promise<Response> {
    const body = this.request.bodyJSON as ProductData;
    if (!body?.product_id) {
      return new Response(400, { error: 'Missing product_id' });
    }

    await sources.emit<ProductData>('my_source', { data: body });
    return new Response(200, { success: true });
  }
}
```

**app.yml** — the webhook is a top-level function, not nested under the source:
```yaml
functions:
  product_webhook:
    entry_point: ProductWebhook
    description: Handles product webhooks from ExternalService

sources:
  my_source:
    description: Products from ExternalService
    schema: my_source_schema
```

### From a Job (historical import)

```typescript
import { Job, JobStatus, logger, notifications, sources, storage, ValueHash } from '@zaiusinc/app-sdk';

interface ProductData {
  product_id: string;
  title: string;
  price: number;
}

enum ImportStep {
  FETCH,
  DONE,
}

interface ImportStatus extends JobStatus {
  state: {
    step: ImportStep;
    page: number;
  };
}

export class ImportProductsJob extends Job {
  public async prepare(_params: ValueHash, status?: ImportStatus): Promise<ImportStatus> {
    if (status) return status;
    return { state: { step: ImportStep.FETCH, page: 1 }, complete: false };
  }

  public async perform(status: ImportStatus): Promise<ImportStatus> {
    if (status.state.step === ImportStep.DONE) {
      await notifications.success('Import', 'Import Complete', 'All products imported');
      return { ...status, complete: true };
    }

    const products: ProductData[] = await fetchProductsPage(status.state.page);

    if (products.length === 0) {
      status.state.step = ImportStep.DONE;
      return status;
    }

    for (const product of products) {
      await sources.emit<ProductData>('my_source', { data: product });
    }

    status.state.page++;
    return status;
  }
}
```

**app.yml** — the job is a top-level job, not nested under the source:
```yaml
jobs:
  import_products:
    entry_point: ImportProductsJob
    description: Imports all products from ExternalService

sources:
  my_source:
    description: Products from ExternalService
    schema: my_source_schema
```

### Delete events

Set `_isDeleted: true` on the data payload to signal a delete to paired destinations.

```typescript
await sources.emit('my_source', {
  data: { product_id: '123', _isDeleted: true },
});
```

## Common mistakes

| Mistake                                                               | Fix                                                                                  |
|-----------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| `sourceName` in `sources.emit` does not match the key in `app.yml`    | The source name is the exact key under `sources:` — case-sensitive                   |
| No `primary: true` field in the schema                                | Exactly one field must be marked `primary: true`                                     |
| Calling `sources.emit` outside of a function or job execution context | `sources.emit` is only valid during an active invocation — never at module load time |
