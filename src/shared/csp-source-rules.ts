/**
 * The rules a Content-Security-Policy source value must satisfy.
 *
 * Lives in `shared/` for the same reason `header-rules.ts` does: both halves
 * need the same answer. The backend is what guards storage — `compiled_headers`
 * serves stored output without re-validating it — but a customer types a source
 * by hand, so the console has to reject as it is typed exactly what the save
 * would reject, or it will happily build a draft that cannot be saved.
 *
 * Judged with patterns rather than `new URL()`, which normalises instead of
 * validating: it deletes a tab from inside a host, accepts user:password, turns
 * a backslash into a slash and accepts a bare `https://*`. Blessing a value
 * because a *different* string parses cleanly is the drift `normaliseConfig`
 * avoids by storing sources verbatim and leaving `validateConfig` as the single
 * judge. A wildcard host is not a URL in any case — `*` parses only because it
 * happens not to be a forbidden host code point.
 */

import { Sources } from './constants.js';

/**
 * Keywords are literal tokens and are matched exactly, unlike the host forms
 * below. Deliberately case-sensitive: `getFetchDirectives` applies the `'none'`
 * override by ordinal comparison with `Sources.None`, *before* it lower-cases,
 * so `'NONE'` would be stored, lower-cased into the header, and emitted
 * alongside the very sources the editor believed it had revoked. Matching
 * exactly puts that out of reach, and keeps the console's keyword notices — which
 * compare the same way — correct by construction. Mirrors the
 * `CspConstants.AllSources.Contains(Source)` short-circuit in PaaS.
 */
const KEYWORD_SOURCES: ReadonlySet<string> = new Set(Object.values(Sources));

/**
 * An integrity hash. Mirrors `CspConstants.RegexPatterns.Hashes`, and is the one
 * form tested against the value as written: base64 is case-sensitive, the same
 * reason `toLowerSource` in `core/csp.ts` exempts hashes from lower-casing.
 */
const HASH_SOURCE_PATTERN = /^'sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}'$/;

/**
 * An optional port, either a number or the any-port wildcard PaaS also accepts.
 */
const PORT = String.raw`(?::(?:[0-9]{1,5}|\*))?`;

/**
 * An optional path: RFC 3986 `pchar` less `;` and `,`.
 *
 * Those two exclusions are not cosmetic. A compiled policy separates directives
 * with `;` and whole policies with `,`, so either character inside a source
 * value breaks out of the directive it was granted to and injects another —
 * the same class of problem as the response-splitting rule in `header-rules.ts`.
 * `?` and `#` are excluded because CSP's host-source grammar has no query or
 * fragment, and a browser discards a source expression it cannot parse, silently
 * narrowing the policy. Whitespace is excluded because it separates sources.
 */
const PATH = String.raw`(?:\/[a-z0-9\-._~%!$&'()*+=:@/]*)?`;

/**
 * A host source: an optional scheme, an optional single leading wildcard label,
 * two or more dot-separated labels, then an optional port and path.
 *
 * Two labels are required, so `https://example` fails and — with the wildcard
 * prefix — so does `https://*.com`: a wildcard cannot cover a whole TLD.
 * Punycode (`xn--`) passes and non-ASCII does not. IP hosts need no branch of
 * their own, since digits are already in the label class.
 *
 * Two deliberate divergences from PaaS's `RegexPatterns.UrlDomain`. It accepts
 * any scheme, letting `ftp://x.com` through; only `http`, `https`, `ws` and
 * `wss` can carry a host, and the other four schemes in `Sources` are keywords
 * in their own right. It also has a bare `*` alternative and lists `https://*`
 * as valid; both allow-list the whole web, which is what a policy exists to
 * avoid.
 */
const HOST_SOURCE_PATTERN = new RegExp(
  String.raw`^(?:(?:http|ws)s?:\/\/)?(?:\*\.)?(?:[a-z0-9-]+\.)+[a-z0-9-]+${PORT}${PATH}$`
);

/**
 * `localhost` needs a branch of its own because it has no dot. A scheme is
 * required here so that a bare `localhost` — far likelier to be a typo than an
 * intended source — does not pass. PaaS's `UrlLocalHost` also makes the port
 * mandatory; it is optional here because `https://localhost` is legitimate.
 */
const LOCALHOST_SOURCE_PATTERN = new RegExp(
  String.raw`^(?:http|ws)s?:\/\/localhost${PORT}${PATH}$`
);

/**
 * What a source may look like, in words. Shared so the console's inline message
 * and the backend's rejection describe the same rule.
 */
export const CSP_SOURCE_RULE =
  "Enter a keyword such as 'self', a scheme such as data:, a domain such as " +
  'https://cdn.example.com — optionally with a leading *. wildcard, a port or a path — ' +
  "or an integrity hash such as 'sha256-…'. Query strings are not allowed.";

/**
 * The host forms are tested lower-cased, as `isValidPermissionPolicyOrigin` is:
 * host names are case-insensitive and `core/csp.ts` lower-cases on the way out
 * anyway. Padding is trimmed rather than rejected — the console trims on add, so
 * only a hand-edited import can carry any, and refusing it would make a
 * customer's own backup unrestorable for no benefit.
 */
export function isValidCspSource(source: string): boolean {
  const trimmed = source.trim();
  const lowered = trimmed.toLowerCase();

  return (
    KEYWORD_SOURCES.has(trimmed) ||
    HASH_SOURCE_PATTERN.test(trimmed) ||
    HOST_SOURCE_PATTERN.test(lowered) ||
    LOCALHOST_SOURCE_PATTERN.test(lowered)
  );
}
