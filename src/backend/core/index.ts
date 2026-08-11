/**
 * The engine's public surface.
 *
 * `compileHeaders` is the single entry point the `compiled_headers` function and
 * the publish path both use. Its output is written to `compiled:v1:{scope}` at
 * publish time and served verbatim thereafter — no compilation happens on the
 * read path.
 */

import type { ConfigDocument, HeaderDto } from '../../shared/config.js';
import type { Diagnostic } from '../../shared/contracts.js';
import { HeaderNames, SPLIT_THRESHOLD, TERMINAL_THRESHOLD } from '../../shared/constants.js';
import { analyseCsp, compileCspHeaders } from './csp.js';
import { compileCustomHeaders } from './headers.js';

export { analyseCsp, compileCspHeaders, type CspOutcome } from './csp.js';
export { compileCustomHeaders, listHeaderRows } from './headers.js';
export { groupDirectives } from './optimizer.js';
export { createDirective, directiveToString, type CspDirective } from './directive.js';

/**
 * Compiles every header for one scope.
 *
 * Ordering mirrors `CompiledHeaderController.ListAsync`: sorted by key, with
 * empty non-removal values already excluded by the individual compilers. Sorting
 * makes the output stable, which matters because it is stored and diffed.
 *
 * The `'nonce-random'` placeholder is left in the CSP for the head to replace
 * per request, and `Strict-Transport-Security` is emitted unconditionally — the
 * head must suppress it on plain HTTP, since only the head knows the scheme of
 * the request it is actually answering.
 */
export function compileHeaders(config: ConfigDocument): HeaderDto[] {
  return [...compileCspHeaders(config), ...compileCustomHeaders(config)].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  );
}

/**
 * Compiles, and explains anything the editor needs to know about the result.
 *
 * The console must call this rather than `compileHeaders` before a publish,
 * because `policy-dropped` has no other way to surface: past the
 * {@link TERMINAL_THRESHOLD} the optimiser emits **nothing** rather than an
 * oversized header, so a site can lose its CSP entirely. PaaS at least leaves a
 * server-side log; on SaaS this diagnostic is the only signal.
 *
 * The outcome comes from {@link analyseCsp} rather than being inferred from an
 * empty header list. Inferring was wrong: "too large to emit", "no directives
 * granted yet", and "sandbox suppressed in report-only mode" all produce zero
 * headers, and reporting a size problem for any of the others is actively
 * misleading.
 */
export function compileWithDiagnostics(config: ConfigDocument): {
  headers: HeaderDto[];
  diagnostics: Diagnostic[];
} {
  const headers = compileHeaders(config);
  const diagnostics: Diagnostic[] = [];
  const outcome = analyseCsp(config);

  if (outcome.kind === 'dropped') {
    diagnostics.push({
      severity: 'error',
      code: 'policy-dropped',
      message:
        'The Content Security Policy is too large to emit and has been dropped entirely — ' +
        `the compiled policy exceeds the ${TERMINAL_THRESHOLD} byte limit even after splitting. ` +
        'No CSP will be applied. Reduce the number of sources, or consolidate domains using ' +
        'wildcards, then publish again.'
    });
  }

  if (outcome.kind === 'no-directives-granted') {
    diagnostics.push({
      severity: 'warning',
      code: 'no-directives-granted',
      message:
        'No Content Security Policy will be emitted: sources have been added but none has ' +
        'been granted a directive yet. Open a source and tick the directives it is allowed ' +
        'to serve.'
    });
  }

  if (outcome.kind === 'emitted' && outcome.headerCount > 1) {
    diagnostics.push({
      severity: 'info',
      code: 'policy-split',
      message:
        `The Content Security Policy has been split across ${outcome.headerCount} headers to ` +
        'stay within CDN header size limits. This is expected and safe.'
    });
  }

  const cspHeaders = headers.filter(
    (h) =>
      h.key === HeaderNames.ContentSecurityPolicy ||
      h.key === HeaderNames.ReportOnlyContentSecurityPolicy
  );
  const largest = Math.max(0, ...cspHeaders.map((h) => h.value.length));

  if (largest > SPLIT_THRESHOLD * 0.9) {
    diagnostics.push({
      severity: 'warning',
      code: 'approaching-size-limit',
      message:
        `The largest Content Security Policy header is ${largest} bytes, close to the ` +
        `${SPLIT_THRESHOLD} byte split threshold. Adding more sources may force further splitting.`
    });
  }

  // Only worth saying when the whole configuration is empty — not when CSP is
  // deliberately off but response headers are doing the work.
  if (headers.length === 0 && config.headers.length === 0) {
    diagnostics.push({
      severity: 'info',
      code: 'no-headers',
      message:
        'Nothing is configured yet, so no headers will be applied. Enable the Content ' +
        'Security Policy or set a response header to Add or Remove.'
    });
  }

  return { headers, diagnostics };
}
