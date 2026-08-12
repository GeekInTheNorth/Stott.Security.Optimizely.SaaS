# Jobs

- [Lifecycle](#lifecycle)
- [State machine design](#state-machine-design)
- [App.Job](#appjob)
- [Parameters](#parameters)
- [Cron](#cron)
- [Programmatic triggering](#programmatic-triggering)
- [Sleep](#sleep)
- [Common mistakes](#common-mistakes)

A job in OCP is a unit of work that you can schedule or trigger manually. Jobs are commonly used for handling historical and incremental data imports.

## Lifecycle

1. Job starts — `this.invocation.jobId` is assigned and remains the same across any retry
2. `prepare` is called — set up secrets and connections, then return the incoming `status` unchanged if the job is resuming, or return a fresh initial state if it is not. Runs again whenever the platform interrupts and resumes the job
3. `perform` loops — each iteration receives the state from the previous return, does one unit of work, and returns updated state. The loop ends when `status.complete` is set to `true`
4. On failure — the platform retries the job once with the same `jobId`; a second failure ends the run and the job waits for its next scheduled trigger

## State machine design

Design jobs as state machines where `state` dictates what work to do and how to transition to the next state. Each `perform` call should do a small unit of work and return the updated state — the platform passes that state back into the next iteration.

**Record state before long API calls.** If the job is evicted mid-call, `prepare` is called again with the last returned state. Recording state before the call ensures the resumption point is safe.

**Flush any batchers before returning state.** Data buffered in a batcher is lost if the job is evicted before it is flushed.

## App.Job

### Example — Nightly Import Job

```typescript
import { Job, JobStatus, logger, ValueHash } from '@zaiusinc/app-sdk';

export enum JobState {
  INITIALIZE,
  IMPORTING,
  DONE,
}

// Extend JobStatus to give state a concrete shape — enforced across prepare and perform
interface ImportJobStatus extends JobStatus {
  state: {
    jobState: JobState;
    imports: Import[];
    currentImport?: Import;
  };
}

export class NightlyImportJob extends Job {
  public async prepare(params: ValueHash, status?: ImportJobStatus, resuming?: boolean): Promise<ImportJobStatus> {
    logger.info('Preparing Nightly Import Job with params:', params, 'and status', status);

    // On a rerun, the job will already have a status — return it to resume
    if (status) {
      return status;
    }

    return {
      state: {
        jobState: JobState.INITIALIZE,
        imports: [Vendor.Contact],
        currentImport: undefined,
      },
      complete: false,
    };
  }

  public async perform(status: ImportJobStatus): Promise<ImportJobStatus> {
    switch (status.state.jobState) {
      case JobState.INITIALIZE:
        status.state.jobState = JobState.IMPORTING;
        break;
      case JobState.IMPORTING:
        // do work, then set next state
        logger.info('Setting State:', status.state);
        if (this.noMoreToDo()) {
          status.state.jobState = JobState.DONE;
        }
        break;
      case JobState.DONE:
        status.complete = true;
        break;
    }
    return status;
  }
}
```

**app.yml:**
```yaml
jobs:
  nightly_import:
    entry_point: NightlyImportJob
    description: Nightly import of records from ExternalService
```

### Example — One-shot (manually triggered)

For a job that does one thing and exits — no state machine needed:

```typescript
import { Job, JobStatus, notifications, storage, ValueHash } from '@zaiusinc/app-sdk';

export class SendReportJob extends Job {
  public async prepare(_params: ValueHash, status?: JobStatus): Promise<JobStatus> {
    if (status) return status;
    return { complete: false, state: {} };
  }

  public async perform(status: JobStatus): Promise<JobStatus> {
    const { count = 0 } = await storage.kvStore.get<{ count: number }>('request_stats');
    await notifications.info('report', 'Request Summary', `Total requests: ${count}`);
    return { ...status, complete: true };
  }
}
```

**app.yml:**
```yaml
jobs:
  send_report:
    entry_point: SendReportJob
    description: Sends a request count summary notification
```

## Parameters

Parameters can be supplied from three sources:
- `jobs.trigger()` — passed at trigger time programmatically
- `app.yml` — default values defined on the job
- CLI — passed as a JSON string via `--parameters '{"mode":"full"}'`

Parameters do not need to be declared anywhere. `app.yml` supports an optional `parameters` field only for setting defaults:

```yaml
jobs:
  nightly_import:
    entry_point: NightlyImportJob
    description: Nightly import of records from ExternalService
    parameters:
      mode: full
```

In `prepare`, parameters are available as the `params` argument (which is the same as `this.invocation.parameters`). In `perform`, use `this.invocation.parameters` directly:

```typescript
// in prepare
public async prepare(params: ValueHash, status?: ImportJobStatus): Promise<ImportJobStatus> {
  const mode = params['mode'] as string;
  // ...
}

// in perform
public async perform(status: ImportJobStatus): Promise<ImportJobStatus> {
  const mode = this.invocation.parameters['mode'] as string;
  // ...
}
```

## Cron

Add an optional `cron` field to schedule a job automatically:

```yaml
jobs:
  nightly_sync:
    entry_point: NightlySyncJob
    description: Syncs records every night at midnight UTC
    cron: 0 0 0 ? * *
```

The cron expression uses 6 fields: `seconds minutes hours day-of-month month day-of-week`. Omit `cron` for jobs triggered manually only.

## Programmatic triggering

Trigger a job from a function or lifecycle hook using `jobs.trigger`:

```typescript
import { jobs, logger } from '@zaiusinc/app-sdk';

const detail = await jobs.trigger('nightly_import', { startDate: '2024-01-01', mode: 'full' });
logger.info('Job triggered', { jobId: detail.jobId });
```

## Sleep

```typescript
await this.sleep(milliseconds, { interruptible: true });
```

Use `this.sleep` when waiting for a remote system to complete a task. Pass `{ interruptible: true }` so the job can be safely evicted and resumed while sleeping.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| `prepare` always returns fresh state — ignores the previous `status` parameter | Check `if (status) return status;` so interrupted jobs resume from last known state |
| `perform` blocks for more than 60 seconds | Do a small unit of work per iteration; use `this.sleep` for waits |
| Never setting `complete: true` | The job loops forever — always set `status.complete = true` when the job is done |
| Recording state after a long API call | Record state before the call so eviction mid-call results in a safe resumption point |
