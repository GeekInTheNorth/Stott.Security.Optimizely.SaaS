# Opal Tool Decorator

- [Tool decorator](#tool-decorator)
- [ToolConfig](#toolconfig)
- [Parameters](#parameters)
- [ParameterType](#parametertype)
- [Parsing array/object parameters](#parsing-arrayobject-parameters)
- [Writing descriptions for AI agents](#writing-descriptions-for-ai-agents)
- [Auth requirements](#auth-requirements)
- [Tool tags](#tool-tags)
- [Response structure](#response-structure)
- [Error handling](#error-handling)

## Tool decorator

Registers a method as an Opal tool. Applied to methods on a tool class — the class does not need to extend `ToolFunction` directly. Decorators run at import time, so importing a tool class is enough to register its tools. See [tool-function.md](tool-function.md) for how tool classes are wired to the entry point via the import side-effect.

**Requires `"experimentalDecorators": true` in `tsconfig.json`** — `@tool`, `@interaction`, and `@resource` all depend on it.

```typescript
import { tool, ParameterType, ToolError } from '@optimizely-opal/opal-tool-ocp-sdk';

export class UsersTool {
  @tool({
    name: 'get_user',
    description: 'Retrieves a user by ID.',
    endpoint: '/tools/get_user',
    parameters: [
      {
        name: 'user_id',
        type: ParameterType.String,
        description: 'The unique ID of the user.',
        required: true,
      },
    ],
  })
  public async getUser(params: { user_id: string }) {
    if (!params.user_id) {
      throw new ToolError('user_id is required');
    }
    // ... call API, throw ToolError on failure ...
    return { data: result, message: 'User retrieved successfully' };
  }
}
```

## ToolConfig

```typescript
interface ToolConfig {
  name: string;               // snake_case, unique across all tools — e.g. 'zoom_get_user'
  description: string;        // shown to Opal (the AI agent) — see Writing descriptions below
  endpoint: string;           // HTTP endpoint — must be '/tools/{name}'
  parameters: ParameterConfig[];
  authRequirements?: AuthRequirementConfig[]; // defaults to OptiID if omitted
  tags?: string[];            // for enabling/disabling groups of tools via settings
  uiResource?: string;        // URI of an associated UI resource
}
```

**Naming convention:** `{service}_{action}_{resource}` in snake_case — e.g. `zoom_get_current_user`, `ga4_run_report`, `cms_list_content_types`.

**Endpoint convention:** always `/tools/{tool_name}` — e.g. `/tools/zoom_get_current_user`.

**File convention:** every tool config should live in its own `{FunctionName}Config.ts` file — avoid inlining the `ToolConfig` object directly inside the tool class or the entry point.

```typescript
// RunReportConfig.ts
import { ToolConfig } from '@optimizely-opal/opal-tool-ocp-sdk';

export const RunReportToolConfig: ToolConfig = {
  name: 'ga4_run_report',
  description: '...',
  endpoint: '/tools/ga4_run_report',
  parameters: [...],
};

// ReportsTool.ts
import { RunReportToolConfig } from './Run/RunReportConfig';

export class ReportsTool {
  @tool(RunReportToolConfig)
  public async runReport(params: RunReportParams, authData: OAuthAuthData) { ... }
}
```

## Parameters

```typescript
interface ParameterConfig {
  name: string;
  type: ParameterType;
  description: string; // shown to Opal — be explicit, show examples
  required: boolean;
}
```

Mark required vs optional parameters explicitly — always set `required: true` or `required: false`, never omit it.

You can also use the `Parameter` class directly instead of a plain object:

```typescript
import { Parameter, ParameterType } from '@optimizely-opal/opal-tool-ocp-sdk';

parameters: [
  new Parameter('user_id', ParameterType.String, 'The unique user ID.', true),
]
```

## ParameterType

```typescript
enum ParameterType {
  String     = 'string',
  Integer    = 'integer',
  Number     = 'number',
  Boolean    = 'boolean',
  Array      = 'array',
  Dictionary = 'object',
}
```

`ParameterType.List` also exists as a deprecated alias for `ParameterType.Array` — resolves to `'array'`. Use `ParameterType.Array` instead.

## Parsing array/object parameters

Opal sends all parameter values as strings. Declaring `ParameterType.String` for array/object parameters avoids SDK validation failures — then parse manually.

Opal may send non-standard JSON with single quotes or `True`/`False`/`None` instead of standard JSON booleans. Normalise before parsing:

```typescript
function parseJsonParam(value: string): unknown {
  const normalised = value
    .trim()
    .replace(/'/g, '"')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null');
  return JSON.parse(normalised);
}

export async function runReport(params: RunReportParams) {
  let dimensions: string[] = [];
  try {
    const parsed = parseJsonParam(params.dimensions ?? '[]');
    dimensions = Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new ToolError('Invalid dimensions', 400, 'Expected a JSON array, e.g. ["revenue", "clicks"]');
  }
}
```

## Writing descriptions for AI agents

Tools are called by Opal (an AI agent), not humans. Descriptions must be **extremely explicit and concrete** with copy-paste ready examples. Vague descriptions cause the agent to guess formats incorrectly.

### ToolConfig description pattern

```typescript
export const {Function}ToolConfig: ToolConfig = {
  name: '{service}_{function_name}',  // e.g., 'zoom_get_current_user'
  description: `
    {High-level description of what this tool does}

    This tool allows you to:
    - {Use case 1}
    - {Use case 2}
    - {Use case 3}

    Use this for:
    - {Scenario 1}
    - {Scenario 2}

    {Optional: JSON examples showing usage}
  `,
  endpoint: '/tools/{function_name}',
  parameters: [
    {
      name: 'parameter_name',
      type: ParameterType.String,
      description: `
        {Detailed description of the parameter}

        {Format/constraints if applicable}

        Example:
        {Example value or usage}

        Hints:
        - {Helpful hint 1}
        - {Helpful hint 2}
      `,
      required: true,
    },
  ],
};
```

**Key Principles:**
- Comprehensive multi-paragraph descriptions with examples
- Parameter descriptions include format, constraints, examples, and hints
- Use markdown formatting in descriptions for better readability

### Critical rules

**1. Always use Python-style single quotes in all JSON examples** — in both the tool description (`EXAMPLE 1`, `EXAMPLE 2`, ...) and parameter descriptions:

```
"tags": "['sports', 'fitness']"      ✓
"tags": "[\"sports\", \"fitness\"]"  ✗
```

**2. Show multiple complete examples in the tool description:**

```typescript
description: `
  Query data with dimensions and metrics.

  This tool allows you to:
  - Retrieve sessions, users, and revenue metrics
  - Filter by traffic source, country, or device
  - Compare two date ranges side by side

  Use this for:
  - Answering questions about website traffic or conversions
  - Building reports grouped by channel or geography

  EXAMPLE 1 - Simple report:
  {
    "dateRanges": "[{'startDate': '2025-11-01', 'endDate': '2025-11-30'}]",
    "dimensions": "['sessionSource']",
    "metrics": "['sessions']"
  }

  EXAMPLE 2 - With filters:
  {
    "dateRanges": "[{'startDate': '2025-11-01', 'endDate': '2025-11-30'}]",
    "dimensions": "['sessionSource']",
    "metrics": "['sessions']",
    "dimensionFilter": "{'filter': {'fieldName': 'sessionSource',
      'inListFilter': {'values': ['google', 'facebook']}}}"
  }
`,
```

**3. Parameter descriptions — show format first, then every format variation:**

```typescript
{
  name: 'dimensions',
  type: ParameterType.String,
  description: `
    JSON string array of dimension names.

    Single dimension:
    "['sessionSource']"

    Multiple dimensions:
    "['sessionSource', 'city', 'deviceCategory']"

    Common dimensions: sessionSource, country, city, deviceCategory

    Hints:
    - Provide as a JSON string. Python-style single quotes are supported.
    - Use the lookup tool to translate display names to API names.
  `,
  required: true,
}
```

**4. In parameter descriptions, show exact values not abstract descriptions:** `"['sessionSource', 'city']"` not `"an array of dimension names"`

**5. Complex/nested parameters:**

- Add the note: `"Provide as a JSON string (Python-style with single quotes is supported)"`
- Show the exact string format:

```typescript
description: `
  Filter expression to apply to the results.

  Provide as a JSON string (Python-style with single quotes is supported).

  Example:
  "{'filter': {'fieldName': 'source', 'inListFilter':
    {'values': ['google', 'facebook'], 'caseSensitive': false}}}"

  Hints:
  - Ensure braces are balanced — count opening { and closing } carefully.
  - Use inListFilter for OR conditions, andGroup for AND conditions.
`,
```

## Auth requirements

```typescript
interface AuthRequirementConfig {
  provider: string;       // e.g. 'OptiID', 'google', 'microsoft'
  scopeBundle: string;    // e.g. 'default', 'calendar', 'drive'
  required?: boolean;     // defaults to true
  message?: string;       // shown to user when auth is needed
  scopeBundleId?: string; // unique identifier for the scope bundle
}
```

**Default auth:** If `authRequirements` is omitted **or set to `[]`**, OptiID auth is added automatically by the SDK:

```typescript
{ provider: 'OptiID', scopeBundle: 'default', required: true }
```

**OAuth example:**

```typescript
@tool({
  name: 'list_calendar_events',
  description: '...',
  endpoint: '/tools/list_calendar_events',
  parameters: [...],
  authRequirements: [
    { provider: 'google', scopeBundle: 'calendar', required: true }
  ],
})
public async listCalendarEvents(params: ListEventsParams, authData: OAuthAuthData) {
  const token = authData.credentials.access_token;
  // ...
}
```


**Auth data:** When a tool requires authentication, Opal passes the user's credentials as the second argument after `params`. The type depends on the provider — `OptiIdAuthData` for OptiID, `OAuthAuthData` for OAuth:

```typescript
type AuthData = OptiIdAuthData | OAuthAuthData;

interface OptiIdAuthData {
  provider: 'OptiID';
  credentials: { customer_id: string; instance_id: string; access_token: string; product_sku: string; };
}

interface OAuthAuthData {
  provider: string;
  credentials: { access_token: string; token_type: string; expires_at: string; }; // expires_at: ISO 8601 UTC, e.g. "2025-01-31T12:00:00Z"
}
```

## Tool tags

Tags let settings control which tools are active. A tool with tags is only enabled if all its tags are set to `true` in the `tool_tags` settings key. Tools without tags are always enabled.

```typescript
@tool({
  name: 'delete_user',
  tags: ['destructive_tools', 'admin_tools'],
  // ...
})
```

In `forms/settings.yml`, expose a toggle to let admins enable/disable the tag group. Store the result in the `tool_tags` settings section — e.g. `tool_tags.destructive_tools: true`.

## Response structure

Tools with a `@resource` return `{ data, message }` — Proteus binds `/data/...` Value paths against `data`. Tools without a resource may return any typed domain object. Never include a `success` field. For soft messages, return `InteractionResult` (see [interaction.md](interaction.md)).

```typescript
// Backed by a @resource — payload under `data`, referenced as /data/... in the spec
return { data: user, message: 'User retrieved successfully' };
return { data: null, message: 'No results found' };

// No @resource — a typed domain object is fine (optional top-level message)
return { properties, message: '2 properties configured' };
return { id, full_url };

// Wrong — never return success field or error objects
return { success: true, data: user };
return { success: false, error: 'Not found' };
```

## Error handling

Import `ToolError` from `@optimizely-opal/opal-tool-ocp-sdk` for all error cases. Always log before throwing.

```typescript
import { ToolError } from '@optimizely-opal/opal-tool-ocp-sdk';
import { logger } from '@zaiusinc/app-sdk';

export async function getUser(params: GetUserParams): Promise<GetUserResponse> {
  // Validate inputs — throw ToolError immediately
  if (!params.user_id) {
    throw new ToolError('user_id is required');
  }

  try {
    const result = await apiClient.getUser(params.user_id);
    return { data: result, message: 'User retrieved successfully' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[getUser] API error:', { error: message });
    throw new ToolError(`Failed to get user: ${message}`);
  }
}
```

`ToolError` accepts an optional status code, detail string, and field-level validation errors:

```typescript
// Common case — defaults to status 500
throw new ToolError('Something went wrong');

// With HTTP status
throw new ToolError('Resource not found', 404);

// With status + detail
throw new ToolError('Invalid input', 400, 'The priority must be "low", "medium", or "high"');

// With field-level validation errors
throw new ToolError('Validation failed', 400, undefined, [
  { field: 'email', message: 'Invalid email format' },
  { field: 'age', message: 'Must be a positive number' },
]);
```

```typescript
interface ValidationError {
  field: string;
  message: string;
}
```

**Rules:**
- Throw `ToolError` for validation failures and API errors — never return `{ success: false }`
- Log with `logger.error()` (from `@zaiusinc/app-sdk`) before re-throwing — never use `console.log/error`
- Catch API errors, wrap in `ToolError` with a user-readable message
