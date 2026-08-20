/**
 * CSP vocabulary and size thresholds.
 *
 * Ported from Common/CspConstants.cs in the PaaS addon. Values must stay
 * byte-identical to the C# original — the golden-file cross-validation harness
 * compares emitted headers between the two engines, and any divergence here
 * shows up as a header mismatch rather than a compile error.
 *
 * Lives in `shared/` because the console needs directive names for its
 * dropdowns and the engine needs them for compilation.
 */

export const Directives = {
  BaseUri: 'base-uri',
  ChildSource: 'child-src',
  ConnectSource: 'connect-src',
  DefaultSource: 'default-src',
  FontSource: 'font-src',
  FormAction: 'form-action',
  FrameAncestors: 'frame-ancestors',
  FencedFrameSource: 'fenced-frame-src',
  FrameSource: 'frame-src',
  ImageSource: 'img-src',
  ManifestSource: 'manifest-src',
  MediaSource: 'media-src',
  ObjectSource: 'object-src',
  Sandbox: 'sandbox',
  ScriptSourceAttribute: 'script-src-attr',
  ScriptSourceElement: 'script-src-elem',
  ScriptSource: 'script-src',
  StyleSourceAttribute: 'style-src-attr',
  StyleSourceElement: 'style-src-elem',
  StyleSource: 'style-src',
  UpgradeInsecureRequests: 'upgrade-insecure-requests',
  WorkerSource: 'worker-src',
  ReportTo: 'report-to'
} as const;

export const Sources = {
  SchemeBlob: 'blob:',
  SchemeData: 'data:',
  SchemeFileSystem: 'filesystem:',
  SchemeHttp: 'http:',
  SchemeHttps: 'https:',
  SchemeWs: 'ws:',
  SchemeWss: 'wss:',
  SchemeMediaStream: 'mediastream:',
  Self: "'self'",
  UnsafeEval: "'unsafe-eval'",
  WebAssemblyUnsafeEval: "'wasm-unsafe-eval'",
  UnsafeHashes: "'unsafe-hashes'",
  UnsafeInline: "'unsafe-inline'",
  InlineSpeculationRules: "'inline-speculation-rules'",
  None: "'none'",
  /**
   * Placeholder, not a real nonce. The head substitutes a per-request value at
   * the edge — this literal is what the compiled header carries at rest.
   */
  Nonce: "'nonce-random'",
  StrictDynamic: "'strict-dynamic'"
} as const;

export const HeaderNames = {
  ContentSecurityPolicy: 'Content-Security-Policy',
  ReportOnlyContentSecurityPolicy: 'Content-Security-Policy-Report-Only',
  ReportingEndpoints: 'Reporting-Endpoints',
  PermissionsPolicy: 'Permissions-Policy'
} as const;

/**
 * User-assignable directives, in the order the C# `CspConstants.AllDirectives`
 * declares them.
 *
 * **Order is behavioural, not cosmetic.** A source's CSV of directives is
 * filtered against this list, so the emitted directive order derives from it.
 * Reordering changes header bytes and will trip the golden-file harness.
 *
 * Deliberately excludes `fenced-frame-src`, `sandbox`,
 * `upgrade-insecure-requests` and `report-to` — those are not assignable to a
 * source; they come from settings or the sandbox editor.
 */
export const ALL_DIRECTIVES: readonly string[] = [
  Directives.BaseUri,
  Directives.ChildSource,
  Directives.ConnectSource,
  Directives.DefaultSource,
  Directives.FontSource,
  Directives.FormAction,
  Directives.FrameAncestors,
  Directives.FrameSource,
  Directives.ImageSource,
  Directives.ManifestSource,
  Directives.MediaSource,
  Directives.ObjectSource,
  Directives.ScriptSourceAttribute,
  Directives.ScriptSourceElement,
  Directives.ScriptSource,
  Directives.StyleSourceAttribute,
  Directives.StyleSourceElement,
  Directives.StyleSource,
  Directives.WorkerSource
];

/**
 * Keyword sources in sort-precedence order. Sources are ordered by their index
 * here, then alphabetically; anything absent sorts at index 100, i.e. after all
 * keywords. Mirrors `CspConstants.AllSources`.
 */
export const ALL_SOURCES: readonly string[] = [
  Sources.Nonce,
  Sources.StrictDynamic,
  Sources.Self,
  Sources.UnsafeEval,
  Sources.WebAssemblyUnsafeEval,
  Sources.UnsafeInline,
  Sources.UnsafeHashes,
  Sources.InlineSpeculationRules,
  Sources.None,
  Sources.SchemeBlob,
  Sources.SchemeData,
  Sources.SchemeFileSystem,
  Sources.SchemeHttp,
  Sources.SchemeHttps,
  Sources.SchemeWs,
  Sources.SchemeWss,
  Sources.SchemeMediaStream
];

/** Named `report-to` endpoint for an external collector. */
export const EXTERNAL_REPORT_ENDPOINT_NAME = 'stott-security-external-endpoint';

/**
 * Sandbox tokens, emitted in this order when their flag is enabled. Order
 * mirrors `CspService.GetSandboxSettings`.
 */
export const SANDBOX_TOKENS = [
  ['allowDownloads', 'allow-downloads'],
  ['allowDownloadsWithoutGesture', 'allow-downloads-without-user-activation'],
  ['allowForms', 'allow-forms'],
  ['allowModals', 'allow-modals'],
  ['allowOrientationLock', 'allow-orientation-lock'],
  ['allowPointerLock', 'allow-pointer-lock'],
  ['allowPopups', 'allow-popups'],
  ['allowPopupsToEscapeTheSandbox', 'allow-popups-to-escape-sandbox'],
  ['allowPresentation', 'allow-presentation'],
  ['allowSameOrigin', 'allow-same-origin'],
  ['allowScripts', 'allow-scripts'],
  ['allowStorageAccessByUser', 'allow-storage-access-by-user-activation'],
  ['allowTopNavigation', 'allow-top-navigation'],
  ['allowTopNavigationByUser', 'allow-top-navigation-by-user-activation'],
  ['allowTopNavigationToCustomProtocol', 'allow-top-navigation-to-custom-protocols']
] as const satisfies ReadonlyArray<readonly [string, string]>;

/** Start splitting the CSP across multiple headers beyond this many bytes. */
export const SPLIT_THRESHOLD = 8100;

/** Beyond this, collapse directive groups to their primary directive. */
export const SIMPLIFY_THRESHOLD = 12000;

/** Beyond this, emit nothing rather than a broken policy. */
export const TERMINAL_THRESHOLD = 15500;

/**
 * Bytes to reserve per nonce-valued source. The `'nonce-random'` placeholder is
 * shorter than a real base64 nonce, so the split threshold is reduced to leave
 * room for substitution.
 */
export const NONCE_LENGTH_INCREASE = 38;
