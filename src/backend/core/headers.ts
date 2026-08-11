/**
 * Compiles response headers — the eight standard security headers plus any
 * customer-defined ones.
 *
 * Ported from Features/CustomHeaders/Service/CustomHeaderService.cs
 * (`GetAllAsync` / `GetCompiledHeaders` / `GetDefaultHeaders`). Repository
 * access, caching and the override/inheritance chain stay behind in PaaS — on
 * SaaS a scope's whole configuration is one KV document, and caching is handled
 * by precompiling at publish time.
 */

import {
  CustomHeaderBehavior,
  type ConfigDocument,
  type CustomHeaderConfig,
  type HeaderDto
} from '../../shared/config.js';
import {
  STANDARD_HEADERS,
  toConfiguredRow,
  toDefaultRow,
  type HeaderRowModel
} from '../../shared/standard-headers.js';

/**
 * Every header the console should show: those the customer has configured, plus
 * a `Disabled` placeholder for each standard header they have not touched.
 *
 * Matching is case-insensitive, so a customer row for `x-frame-options`
 * suppresses the `X-Frame-Options` default rather than duplicating it.
 */
export function listHeaderRows(headers: readonly CustomHeaderConfig[]): HeaderRowModel[] {
  const configured = headers.map(toConfiguredRow);
  const configuredNames = new Set(headers.map((h) => h.headerName.toLowerCase()));

  const defaults = STANDARD_HEADERS.filter(
    (definition) => !configuredNames.has(definition.headerName.toLowerCase())
  ).map(toDefaultRow);

  return [...configured, ...defaults];
}

/**
 * Compiles the response headers for one scope.
 *
 * `Disabled` headers are dropped. `Add` becomes a replacement (`headers.set`)
 * and `Remove` a deletion (`headers.delete`) — see `HeaderDto` for how the head
 * maps these.
 *
 * Standard headers the customer has never configured are `Disabled` by default,
 * so they contribute nothing here. That is deliberate: installing the app must
 * not silently start emitting headers that could break a live site.
 */
export function compileCustomHeaders(config: ConfigDocument): HeaderDto[] {
  return listHeaderRows(config.headers)
    .filter((row) => row.behavior !== CustomHeaderBehavior.Disabled)
    .filter((row) => row.headerName.trim().length > 0)
    // A `Remove` needs no value; an `Add` with a blank value would emit a bare
    // header, which both PaaS consumers discard anyway.
    .filter(
      (row) => row.behavior === CustomHeaderBehavior.Remove || row.headerValue.trim().length > 0
    )
    .map((row) => ({
      key: row.headerName,
      value: row.behavior === CustomHeaderBehavior.Remove ? '' : row.headerValue,
      isRemoval: row.behavior === CustomHeaderBehavior.Remove,
      isReplacement: row.behavior === CustomHeaderBehavior.Add
    }));
}
