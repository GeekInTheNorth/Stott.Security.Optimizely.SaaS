/**
 * OCP key-value persistence for configuration.
 *
 * One document per app/host scope:
 *
 *   config:v1:{appId}:{hostName}    draft   — what the console edits
 *   compiled:v1:{appId}:{hostName}  live    — what `compiled_headers` serves
 *
 * Rows are not modelled individually: KV has no query capability, the console's
 * filters are in-memory over a small set, and the compile path needs the whole
 * scope anyway. One document also makes saves atomic.
 *
 * **Documents are stored as a JSON string in a `json` field, not as structured
 * KV objects.** OCP's `KVHash` demands an index signature
 * (`[field: string]: KVValue | KVValue[] | undefined`), which our domain types
 * deliberately do not have — adding one would let any property through and
 * couple the engine to OCP's storage types, when the whole point of keeping the
 * engine OCP-free is that it stays rehostable. Serialising also makes the size
 * guard exact rather than approximate. We always read whole documents, so the
 * field-level and partial-read APIs are no loss.
 *
 * **Never set a TTL on these keys.** OCP's guidance recommends TTL as a general
 * best practice, but that is aimed at cache-like data. These are the system of
 * record — a TTL would silently delete a customer's configuration.
 */

import { storage, type KVHash } from '@zaiusinc/app-sdk';

import {
  createEmptyConfig,
  normaliseConfig,
  type ConfigDocument,
  type HeaderDto
} from '../../shared/config.js';
import type { Scope } from '../../shared/contracts.js';
import { CorruptDocumentError, DocumentTooLargeError, StaleRevisionError } from './errors.js';

/** Storage envelope. Only primitives, so it satisfies `KVHash` trivially. */
interface StoredDocument extends KVHash {
  json: string;
  revision: number;
}

interface CompiledEnvelope extends KVHash {
  json: string;
  publishedAt: string;
  publishedBy: string;
  /** Draft revision this was compiled from, so staleness is detectable. */
  sourceRevision: number;
}

export interface DraftRecord {
  readonly config: ConfigDocument;
  readonly revision: number;
}

export interface CompiledRecord {
  readonly headers: readonly HeaderDto[];
  readonly publishedAt: string;
  readonly publishedBy: string;
  readonly sourceRevision: number;
}

const SCHEMA_VERSION = 'v1';
const SCOPE_INDEX_KEY = `index:${SCHEMA_VERSION}:scopes`;

/**
 * OCP's per-record limit is ~400 KB. A large site's config is under 50 KB, so this
 * guard exists to fail loudly with a useful message rather than let the platform
 * reject the save with an opaque one.
 */
export const MAX_DOCUMENT_BYTES = 300_000;

function scopeSuffix(scope: Scope): string {
  return `${scope.appId ?? '*'}:${scope.hostName ?? '*'}`;
}

export function draftKey(scope: Scope): string {
  return `config:${SCHEMA_VERSION}:${scopeSuffix(scope)}`;
}

export function compiledKey(scope: Scope): string {
  return `compiled:${SCHEMA_VERSION}:${scopeSuffix(scope)}`;
}

/** Byte length of the serialised config, as stored. */
export function measureConfig(config: ConfigDocument): number {
  return new TextEncoder().encode(JSON.stringify(config)).length;
}

/**
 * The scopes to try, most specific first — host, then app, then global.
 *
 * Mirrors the PaaS inheritance chain, where a host-level record overrides an
 * app-level one which overrides the global default. Nothing in this build writes
 * a scope narrower than global, so every chain terminates there today. The walk
 * is kept so per-host configuration can be added without migrating stored
 * documents or changing how a head calls the endpoint.
 */
export function fallbackChain(scope: Scope): Scope[] {
  const chain: Scope[] = [];

  if (scope.appId && scope.hostName) {
    chain.push({ appId: scope.appId, hostName: scope.hostName });
  }

  if (scope.appId) {
    chain.push({ appId: scope.appId });
  }

  chain.push({});

  return chain;
}

/**
 * Normalised on the way out, because a document written before a section existed
 * would otherwise hand the engine `undefined` where the type promises an object.
 * Every installation predating a new section is in exactly that state.
 */
function parseConfig(key: string, json: string): ConfigDocument {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('not an object');
    }

    return normaliseConfig(parsed as ConfigDocument);
  } catch (cause) {
    throw new CorruptDocumentError(key, cause);
  }
}

/**
 * Reads a draft, falling back through the chain.
 *
 * Returns an empty config at revision 0 when nothing is stored anywhere — a fresh
 * install is a valid state, not an error.
 */
export async function readDraft(scope: Scope): Promise<DraftRecord> {
  for (const candidate of fallbackChain(scope)) {
    const key = draftKey(candidate);
    const stored = await storage.kvStore.get<StoredDocument>(key);
    if (typeof stored?.json === 'string') {
      return { config: parseConfig(key, stored.json), revision: stored.revision ?? 0 };
    }
  }

  return { config: createEmptyConfig(), revision: 0 };
}

/** Reads a draft for one exact scope, without falling back. */
export async function readDraftExact(scope: Scope): Promise<DraftRecord | undefined> {
  const key = draftKey(scope);
  const stored = await storage.kvStore.get<StoredDocument>(key);

  return typeof stored?.json === 'string'
    ? { config: parseConfig(key, stored.json), revision: stored.revision ?? 0 }
    : undefined;
}

/**
 * Writes a draft under optimistic concurrency.
 *
 * Uses the *updater* form of `patch`, which the platform retries until it wins a
 * CAS check — that is what makes concurrent editors safe without a hand-rolled
 * lock. Two constraints follow, and both are load-bearing:
 *
 *   1. **The updater must be pure.** It may run several times, so no logging, no
 *      API calls, no counters inside it. Validation and serialisation happen
 *      before the call.
 *   2. **`patch` returns the PREVIOUS value**, not the new one. The new revision
 *      is computed here rather than read back.
 *
 * Pass `expectedRevision` to reject a stale editor; omit it to force the write.
 */
export async function writeDraft(
  scope: Scope,
  config: ConfigDocument,
  expectedRevision?: number
): Promise<number> {
  const json = JSON.stringify(config);
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_DOCUMENT_BYTES) {
    throw new DocumentTooLargeError(bytes, MAX_DOCUMENT_BYTES);
  }

  let conflict: StaleRevisionError | undefined;
  let written = 0;

  await storage.kvStore.patch<StoredDocument>(draftKey(scope), (previous: StoredDocument) => {
    const currentRevision = previous?.revision ?? 0;

    if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
      // Recorded rather than thrown: throwing from inside the updater is not a
      // documented contract, and the updater may be retried.
      conflict = new StaleRevisionError(expectedRevision, currentRevision);

      return previous ?? { json, revision: currentRevision };
    }

    conflict = undefined;
    written = currentRevision + 1;

    return { json, revision: written };
  });

  if (conflict) {
    throw conflict;
  }

  return written;
}

/** Writes the compiled output — the only operation that changes what the head serves. */
export async function writeCompiled(
  scope: Scope,
  headers: readonly HeaderDto[],
  publishedBy: string,
  publishedAt: string,
  sourceRevision: number
): Promise<void> {
  await storage.kvStore.put<CompiledEnvelope>(compiledKey(scope), {
    json: JSON.stringify(headers),
    publishedAt,
    publishedBy,
    sourceRevision
  });

  await registerScope(scope);
}

/**
 * Reads compiled output, falling back through the chain.
 *
 * This is the entire hot path for `compiled_headers`: one KV read, no compilation.
 */
export async function readCompiled(scope: Scope): Promise<CompiledRecord | undefined> {
  for (const candidate of fallbackChain(scope)) {
    const key = compiledKey(candidate);
    const stored = await storage.kvStore.get<CompiledEnvelope>(key);
    if (typeof stored?.json !== 'string') {
      continue;
    }

    try {
      return {
        headers: JSON.parse(stored.json) as HeaderDto[],
        publishedAt: stored.publishedAt,
        publishedBy: stored.publishedBy,
        sourceRevision: stored.sourceRevision ?? 0
      };
    } catch (cause) {
      throw new CorruptDocumentError(key, cause);
    }
  }

  return undefined;
}

/**
 * Every scope that has ever been published.
 *
 * kvStore cannot enumerate keys, so the set is tracked explicitly in an index
 * document maintained on publish. `onFinalizeUpgrade` needs this to regenerate
 * compiled output after an app upgrade changes the engine — without it, upgrades
 * silently keep serving headers produced by the previous version.
 */
export async function listPublishedScopes(): Promise<Scope[]> {
  const index = await storage.kvStore.get<StoredDocument>(SCOPE_INDEX_KEY);
  if (typeof index?.json !== 'string') {
    return [];
  }

  try {
    return JSON.parse(index.json) as Scope[];
  } catch {
    // An unreadable index must not block publishing; regeneration degrades to
    // "nothing to regenerate" rather than failing the upgrade.
    return [];
  }
}

/**
 * Records a scope in the index.
 *
 * Uses an updater patch because publishes from different scopes can race, and a
 * read-modify-write here would lose entries.
 */
async function registerScope(scope: Scope): Promise<void> {
  const suffix = scopeSuffix(scope);

  await storage.kvStore.patch<StoredDocument>(SCOPE_INDEX_KEY, (previous: StoredDocument) => {
    let existing: Scope[] = [];
    if (typeof previous?.json === 'string') {
      try {
        existing = JSON.parse(previous.json) as Scope[];
      } catch {
        existing = [];
      }
    }

    const alreadyPresent = existing.some((s) => scopeSuffix(s) === suffix);
    const next = alreadyPresent ? existing : [...existing, scope];

    return { json: JSON.stringify(next), revision: (previous?.revision ?? 0) + 1 };
  });
}
