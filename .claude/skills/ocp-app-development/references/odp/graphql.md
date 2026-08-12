# ODP GraphQL — `odp.graphql()`

- [Overview](#overview)
- [Signature](#signature)
- [Query format](#query-format)
- [Response handling](#response-handling)
- [Error handling](#error-handling)
- [Examples](#examples)
- [Common mistakes](#common-mistakes)

## Overview

`odp.graphql()` queries ODP data using the GraphQL API. It is used to read data from ODP — typically to find which customers or records need to be processed before writing back with `odp.customer()` or `odp.object()`.

Use `odp.graphql()` instead of making raw `fetch()` calls to the ODP GraphQL endpoint — the SDK handles authentication and region routing automatically.

## Signature

```typescript
odp.graphql<T>(query: string, variables?: Record<string, any>): Promise<GqlHttpResponse<T>>
```

| Argument    | Required | Description                                                                                                                                                                             |
|-------------|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `query`     | Yes      | GraphQL query string                                                                                                                                                                    |
| `variables` | No       | GraphQL variables to inject into the query — use for typed arguments like `first`, pagination cursors, or field values; not for ODP filter strings (embed those with template literals) |

## Query format

ODP's GraphQL API uses a cursor-based structure. All queries follow this shape:

```graphql
query {
  <object>(filter: "<filter_string>", first: <limit>) {
    edges {
      node {
        field1
        field2
      }
    }
  }
}
```

| Argument | Type | Description |
| --- | --- | --- |
| `filter` | string | ODP filter expression — build as a TypeScript string and embed with a template literal |
| `first` | integer | Maximum number of records to return per query |

`<object>` is the object's `name` — `customers`, `events`, `products`, `orders`, or any custom object name.

`edges { node { ... } }` is ODP's cursor-based pagination shape — `edges` is a list of result wrappers, each containing a `node` (the actual record).

The generic type parameter `T` passed to `odp.graphql<T>()` must match the shape of the response. Define a TypeScript interface that mirrors your query's selection set:

```typescript
// For a customers query selecting email and acme_sync_status
interface CustomerNode {
  email: string;
  acme_sync_status: boolean | null;
}

interface CustomersQuery {
  customers: {
    edges: { node: CustomerNode }[];
  };
}

const result = await odp.graphql<CustomersQuery>(`query { ... }`);
// result.data is typed as CustomersQuery
```

### Filter syntax

| Operator               | Syntax                      | Example                                                    |
|------------------------|-----------------------------|------------------------------------------------------------|
| Equality               | `field=value`               | `"acme_sync_status=false"`                                 |
| Not equal              | `field!=value`              | `"body_html!='null'"`                                      |
| Comparison             | `field>value` `>=` `<` `<=` | `"last_modified_at>=${timestamp}"`                         |
| Missing (null/not set) | `is_missing(field)`         | `"is_missing(acme_sync_status)"`                           |
| Not missing            | `is_not_missing(field)`     | `"is_not_missing(email)"`                                  |
| Logical OR             | `expr or expr`              | `"is_missing(acme_sync_status) or acme_sync_status=false"` |
| Logical AND            | `expr and expr`             | `"is_not_missing(email) and acme_sync_status=false"`       |

String values inside filter expressions use single quotes: `body_html!='null'`. Numbers and booleans are unquoted: `acme_sync_status=false`.

Filters are plain strings — build them in TypeScript and embed with a template literal:

```typescript
const filter = '(is_missing(acme_sync_status) or acme_sync_status=false) and is_not_missing(email)';

const result = await odp.graphql<CustomersQuery>(
  `query {
    customers(filter: "${filter}", first: 100) {
      edges {
        node {
          email
          acme_sync_status
        }
      }
    }
  }`
);
```

## Response handling

Always check `result.success` before reading `result.data`.

### Structure

```typescript
{
  success: boolean;         // true for a successful response
  status: number;           // HTTP status code
  data?: T | null;          // query result — present when success is true
  errors?: GqlError[];      // GraphQL errors — present when the query fails
}
```

```typescript
if (!result.success || !result.data) {
  logger.error('GraphQL query failed', result.errors);
  return;
}

if (!result.data.customers) {
  return; // no records — nothing to process
}

const members = result.data.customers.edges.map((e) => e.node);
```

### Numeric and timestamp fields return as strings

ODP serializes `number` and `timestamp` scalars as JSON **strings**, not numbers — a `lifetime_points` field of `950` comes back as `"950.0"`. Type them as `string | null` in your result interface and coerce with `Number(...)` before any arithmetic or comparison.

```typescript
interface MemberNode {
  email: string;
  lifetime_points: string | null;   // numeric field — arrives as a string like "950.0"
  is_vip: boolean | null;
}

const node = result.data.customers.edges[0]?.node;
const points = Number(node?.lifetime_points ?? 0);   // coerce before using
```

## Error handling

Unlike write calls, GraphQL returns HTTP 200 even when a query fails — errors appear in `result.errors`, not as thrown exceptions. Always check `result.success` before reading `result.data`.

```typescript
const result = await odp.graphql(query);

if (!result.success || result.errors?.length) {
  logger.error('GraphQL query failed', result.errors);
  return;
}

const data = result.data;
```

## Examples

### Query customers who need enrichment

Find customers missing a sync status field — used to drive which records to process in a job:

```typescript
import { Job, JobStatus, logger, ValueHash } from '@zaiusinc/app-sdk';
import { odp } from '@zaiusinc/node-sdk';

interface CustomerNode {
  email: string;
  acme_sync_status: boolean | null;
}

interface CustomersQuery {
  customers: {
    edges: { node: CustomerNode }[];
  };
}

export class EnrichmentJob extends Job {
  public async prepare(_params: ValueHash, status?: JobStatus): Promise<JobStatus> {
    if (status) return status;
    return { complete: false, state: {} };
  }

  public async perform(status: JobStatus): Promise<JobStatus> {
    const filter = 'is_missing(acme_sync_status) or acme_sync_status=false';

    const result = await odp.graphql<CustomersQuery>(
      `query {
        customers(filter: "${filter}", first: 100) {
          edges {
            node {
              email
              acme_sync_status
            }
          }
        }
      }`
    );

    if (!result.success || !result.data) {
      logger.error('Failed to query customers', result.errors);
      return { ...status, complete: true };
    }

    const customers = result.data.customers.edges.map((e) => e.node);

    for (const customer of customers) {
      const enriched = await fetchEnrichmentData(customer.email);

      await odp.customer({
        identifiers: { email: customer.email },
        attributes: {
          acme_sync_status: true,
          acme_enriched_company: enriched.company,
        },
      });
    }

    return { ...status, complete: true };
  }
}
```

### Query with variables

Use variables for typed query arguments such as `first`, pagination cursors, or field values. ODP filter strings are still embedded via template literals.

```typescript
interface ProductNode {
  product_id: string;
  name: string;
  image_url: string;
}

interface ProductsQuery {
  products: {
    edges: { node: ProductNode }[];
  };
}

const limit = 50;

const result = await odp.graphql<ProductsQuery>(
  `query($limit: Int) {
    products(first: $limit, filter: "is_not_missing(image_url)") {
      edges {
        node {
          product_id
          name
          image_url
        }
      }
    }
  }`,
  { limit }
);

if (result.success && result.data) {
  const products = result.data.products.edges.map((e) => e.node);
}
```

### Query with a filter

```typescript
const email = 'user@example.com';

const result = await odp.graphql<{ customers: { edges: { node: { email: string; first_name: string } }[] } }>(
  `query {
    customers(filter: "email='${email}'", first: 1) {
      edges {
        node {
          email
          first_name
        }
      }
    }
  }`
);
```

### Paginating with cursors

For large result sets, select `pageInfo { hasNextPage endCursor }` and pass the cursor back via `after` to fetch the next page. Loop until `hasNextPage` is false. `pageInfo` also exposes `totalCount` (total matching records) if you need it.

```typescript
interface CustomerNode { email: string; }
interface CustomersPage {
  customers: {
    edges: { node: CustomerNode }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

let after: string | null = null;
const all: CustomerNode[] = [];

do {
  const result = await odp.graphql<CustomersPage>(
    `query($first: Int, $after: String) {
      customers(filter: "is_not_missing(email)", first: $first, after: $after) {
        edges { node { email } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    { first: 100, after }
  );

  if (!result.success || !result.data?.customers) break;

  const page = result.data.customers;
  all.push(...page.edges.map((e) => e.node));
  after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
} while (after);
```

## Common mistakes

| Mistake                                                                 | Fix                                                                                                       |
|-------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| Using raw `fetch()` with a manually stored ODP API key                  | Use `odp.graphql()` — it handles auth automatically                                                         |
| Not checking `result.success` before using `result.data`                | Always check `result.success`; `result.data` may be null on failure                                       |
| Querying a field that does not exist on the object                      | Only fields defined in ODP schema can be queried                                                          |
| Typing a `number`/`timestamp` field as `number` in the result interface | These scalars arrive as strings (e.g. `"950.0"`) — type as `string \| null` and coerce with `Number(...)` |
| Assuming `first: N` returns everything                                  | `first` is a per-page cap; page with `pageInfo.endCursor` + `after` for large result sets                 |
