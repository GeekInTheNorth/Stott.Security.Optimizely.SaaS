# Opal Tool — Overview

- [What an Opal tool is](#what-an-opal-tool-is)
- [Project structure](#project-structure)
- [How the pieces connect](#how-the-pieces-connect)

## What an Opal tool is

An Opal tool app exposes capabilities of an external service as AI tools in the Opal assistant. Opal (the AI agent) calls the tools in response to user requests — the app receives the call, talks to the external API, and returns results. No data sync is involved.

There are two variants — `ToolFunction` (per-installation, each customer has their own credentials) and `GlobalToolFunction` (global, no per-account context). See [tool-function.md](tool-function.md) for the full comparison.

## Project structure

The conventional structure for Opal tool apps:

```
src/
└── functions/
    ├── OpalToolFunction.ts      # Entry point for all tools — extends ToolFunction or GlobalToolFunction, imports index.ts
    ├── index.ts                 # Re-exports all tool classes to trigger @tool registrations
    └── {Resource}/
        ├── {Resource}Tool.ts    # Tool class — @tool and @interaction decorated methods
        └── {Action}/
            ├── {Function}.ts         # Pure implementation function
            └── {Function}Config.ts   # ToolConfig constant
```

## How the pieces connect

An Opal tool is built from three decorators that work together:

**`@tool`** — registers a method as a callable tool. Opal calls it when the user asks for something. Returns `{ data, message }` or `InteractionResult`. See [tool.md](tool.md).

**`@interaction`** — registers a handler triggered when the user clicks a button in a Proteus card. Returns `InteractionResult`. See [interaction.md](interaction.md).

**`@resource`** — registers a Proteus UI spec that the frontend fetches to render a rich result card. Linked to a `@tool` via the `uiResource` field in `ToolConfig`. See [resource.md](resource.md).

All three decorators register automatically via a side-effect import in the entry point class — see [tool-function.md](tool-function.md) for how this wiring works.
