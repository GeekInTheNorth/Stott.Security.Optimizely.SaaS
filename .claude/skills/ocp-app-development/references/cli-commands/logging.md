# CLI — Logs

- [View logs](#view-logs)
- [Log level](#log-level)

Availability zones used by the `-a` flag: `us` (default), `eu`, `au`.

## View logs

Stream or query logs produced by your app. Logs are accessible for functions, jobs, and lifecycle hooks — not for global functions.

```bash
# Logs for an installation (last 24h by default)
ocp app logs --appId=<appId> --trackerId=<trackerId>

# Tail live
ocp app logs --appId=<appId> --trackerId=<trackerId> --tail

# Filter by level, time range, or search string
ocp app logs --appId=<appId> --trackerId=<trackerId> --level=ERROR --from=1h --search='failed'

# Logs for a specific job execution
ocp app logs --jobId=<jobId>

# Build logs from ocp app prepare
ocp app logs --buildId=<buildId>
```

One of `--appId`, `--buildId`, or `--jobId` is required. They are mutually exclusive — specify only one.

| Flag | Description |
| --- | --- |
| `--appId` | App ID |
| `--buildId` | Build logs from `ocp app prepare` |
| `--jobId` | Logs for a specific job execution — use `ocp jobs list` to get the job ID |
| `--trackerId` | OCP account tracker ID — required for developers when using `--appId`; not required with `--jobId` or `--buildId` |
| `--appVersion` | Filter by version |
| `--level` | Filter by level: `DEBUG`, `INFO`, `WARN`, `ERROR`. Default: `DEBUG` (all logs shown) |
| `--from` | Start time — ISO string, epoch, or relative (e.g. `"1h"`, `"30m"`). Default: `24h` |
| `--to` | End time — same formats as `--from` |
| `--search` | Search string — can be specified multiple times |
| `--tail` | Stream logs live |
| `-a` | Availability zone (default: `us`) |

## Log level

Default log level is `debug` for `-dev` versions and `info` for release and `beta` versions.

```bash
# Check log level for an installation
ocp app get-log-level <appId@version> --trackerId=<trackerId>

# Set log level for an installation (resets after 2h by default)
ocp app set-log-level <appId@version> debug --trackerId=<trackerId>

# Override the default 2h expiration
ocp app set-log-level <appId@version> debug --trackerId=<trackerId> --ttl=30m
```

Accepted levels: `debug`, `info`, `warn`, `error`.

Without `--trackerId`, the command applies to the app version itself (admin only). With `--trackerId`, it applies to that specific installation (required for non-admin developers).

Both commands accept `-a` for availability zone (default: `us`).
