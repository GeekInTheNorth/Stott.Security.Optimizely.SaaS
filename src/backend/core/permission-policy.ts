/**
 * Compiles the `Permissions-Policy` header from configuration.
 *
 * Ported from Features/PermissionPolicy/Service/PermissionPolicyService.cs
 * (`GetCompiledHeaders`) and `PermissionPolicyRepository.ListDirectiveFragments`.
 * Repository access, caching and the context override chain stay behind in PaaS —
 * on SaaS a scope's whole configuration is one KV document, and caching is
 * handled by precompiling at publish time.
 *
 * The serialiser itself lives in `shared/permission-policy.ts`, because the
 * console's live preview has to render through the same code that emits here.
 */

import { HeaderNames } from '../../shared/constants.js';
import type { ConfigDocument, HeaderDto } from '../../shared/config.js';
import { listPermissionPolicyRows, toPolicyFragment } from '../../shared/permission-policy.js';

/**
 * Why the Permissions Policy compiled to what it did.
 *
 * The console cannot infer this from an empty header list: "switched off" and
 * "on, but every directive left at its browser default" both produce no header
 * and need different remedies. Same reasoning as {@link CspOutcome}.
 */
export type PermissionPolicyOutcome =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'nothing-configured' }
  | { readonly kind: 'emitted'; readonly directiveCount: number; readonly bytes: number };

/**
 * Compiles, and reports the outcome.
 *
 * Shares the exact code path {@link compilePermissionPolicyHeaders} uses, so the
 * explanation can never disagree with what was actually emitted.
 */
export function analysePermissionPolicy(config: ConfigDocument): PermissionPolicyOutcome {
  if (!config.permissionPolicy.isEnabled) {
    return { kind: 'disabled' };
  }

  const value = buildPolicyValue(config);

  if (value.length === 0) {
    return { kind: 'nothing-configured' };
  }

  return {
    kind: 'emitted',
    directiveCount: countFragments(config),
    bytes: value.length
  };
}

/**
 * Compiles the Permissions Policy header for one scope.
 *
 * Returns an empty array when the feature is disabled or when no directive
 * contributes a fragment. The header is never emitted empty: a bare
 * `Permissions-Policy:` is a syntax error rather than a permissive default, and
 * PaaS omits it in both cases too.
 *
 * A replacement rather than an append. Only CSP appends, and only because a
 * split policy legitimately spans several headers; a Permissions Policy is always
 * one header, and appending would let a duplicate from elsewhere in the stack
 * survive alongside it.
 */
export function compilePermissionPolicyHeaders(config: ConfigDocument): HeaderDto[] {
  if (!config.permissionPolicy.isEnabled) {
    return [];
  }

  const value = buildPolicyValue(config);

  if (value.length === 0) {
    return [];
  }

  return [
    {
      key: HeaderNames.PermissionsPolicy,
      value,
      isRemoval: false,
      isReplacement: true
    }
  ];
}

/**
 * The header value: every contributing directive, comma-separated.
 *
 * `', '` including the space is the PaaS separator, pinned by its unit tests as
 * `"Test, Example"`. Directive order comes from the shared directive table via
 * `listPermissionPolicyRows`, not from the stored document.
 */
function buildPolicyValue(config: ConfigDocument): string {
  return fragments(config).join(', ');
}

function fragments(config: ConfigDocument): string[] {
  return listPermissionPolicyRows(config.permissionPolicy.directives)
    .map(toPolicyFragment)
    .filter((fragment) => fragment.length > 0);
}

function countFragments(config: ConfigDocument): number {
  return fragments(config).length;
}
