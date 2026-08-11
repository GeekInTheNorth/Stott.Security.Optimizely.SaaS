/**
 * Public endpoint the site head fetches security headers from.
 *
 * Declared **without** `global: true`, which is what makes this work: a
 * `GlobalFunction` has no installation context and could only reach
 * `sharedKvStore`, whereas a regular `App.Function` resolves an installation from
 * the UUID in its public URL and so reads the same per-installation `kvStore`
 * that `CmsExtension` writes to.
 *
 * The response contract is deliberately identical to the PaaS endpoint at
 * `/stott.security.optimizely/api/compiled-headers/list`, so a single consumer
 * implementation can serve both products. Treat it as a public API: it is what
 * a customer's site depends on, and it versions independently of this app.
 *
 * **Anonymous by design**, matching the `[AllowAnonymous]` PaaS endpoint. The
 * consequence is that a scope's compiled header configuration is readable by
 * anyone holding the URL. That is defensible — these headers appear on every
 * response anyway — but it is a deliberate decision a client's security reviewer
 * will ask about, so it is documented rather than incidental.
 */

import * as App from '@zaiusinc/app-sdk';
import { logger } from '@zaiusinc/app-sdk';

import type { HeaderDto } from '../../shared/config.js';
import type { Scope } from '../../shared/contracts.js';
import { readCompiled } from '../lib/storage.js';

/**
 * How long a head may cache the response.
 *
 * Compiled output only changes on publish, so this can be generous. It is the
 * single biggest lever on load: without it, every page request on the head turns
 * into a request here.
 */
const CACHE_SECONDS = 300;

export class CompiledHeaders extends App.Function {
  public async perform(): Promise<App.Response> {
    if (this.request.method !== 'GET') {
      return new App.Response(405, { error: 'Only GET is supported.' });
    }

    const scope: Scope = {
      ...(asString(this.request.params['appId']) ? { appId: asString(this.request.params['appId'])! } : {}),
      ...(asString(this.request.params['hostName'])
        ? { hostName: sanitiseHost(asString(this.request.params['hostName'])!) }
        : {})
    };

    try {
      const compiled = await readCompiled(scope);

      // Nothing published yet is a legitimate state, not an error. Returning an
      // empty array lets the head apply its own defaults and carry on, rather
      // than treating it as a fetch failure and retrying.
      const headers: readonly HeaderDto[] = compiled?.headers ?? [];

      return new App.Response(200, {
        headers,
        publishedAt: compiled?.publishedAt ?? null,
        cacheSeconds: CACHE_SECONDS
      });
    } catch (error) {
      logger.error(`Failed to read compiled headers: ${String(error)}`);

      // Fail closed on shape, open on behaviour: the head must be able to tell a
      // real failure from "nothing published", so it can keep serving with its
      // own fallback headers rather than none.
      return new App.Response(503, { error: 'Compiled headers are temporarily unavailable.' });
    }
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Reduces a host to its domain, mirroring `GetSanitizedHostDomain` in PaaS, so
 * `https://example.com/` and `example.com` resolve to the same scope.
 */
function sanitiseHost(value: string): string {
  const trimmed = value.replace(/\/+$/, '');
  const normalised = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

  try {
    return new URL(normalised).host.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}
