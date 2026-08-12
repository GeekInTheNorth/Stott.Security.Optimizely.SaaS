# Logging

`import { logger } from '@zaiusinc/app-sdk'`

The logger writes structured JSON to stdout (or stderr for errors). Messages surface in the **Troubleshooting tab** of the app in the OCP App Directory. Customers can see logs for their own installation only; developers access them via the OCP CLI.

Four log levels are available:

```typescript
logger.debug('starting sync', { page, cursor });
logger.info('webhook received', { method: this.request.method, body });
logger.warn('skipping record — missing required field', { id });
logger.error('failed to call external API', error);
```

- Multiple arguments are concatenated with a space
- Objects are pretty-printed automatically
- `Error` instances automatically extract the stack trace — only when passed as a separate argument; interpolating into a template string loses the stack
- All methods are synchronous — no `await`

## Log level

The active log level determines which calls produce output — calls below it are dropped. Default is `debug` for `-dev` versions and `info` for release and `beta` versions. To change it per installation, see [cli-commands/logging.md](../cli-commands/logging.md).

## Accessing logs

See [cli-commands/logging.md](../cli-commands/logging.md) for the full CLI reference.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Using `logger` to notify customers of sync progress or errors | Use `notifications` — those surface in the Activity Log, not the Troubleshooting tab |
| `` logger.error(`failed: ${err}`) `` | Pass the error as a separate argument: `logger.error('failed:', err)` — interpolation drops the stack trace |
| `await logger.info(...)` | Logger methods are synchronous — no `await` needed |
