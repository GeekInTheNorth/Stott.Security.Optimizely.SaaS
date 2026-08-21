/**
 * Permissions Policy vocabulary, rules and serialisation.
 *
 * Ported from Features/PermissionPolicy/ in the PaaS addon —
 * `PermissionPolicyConstants.cs` for the directive table and
 * `PermissionPolicyMapper.ToPolicyFragment` for the serialiser.
 *
 * Lives in `shared/` because both halves need all of it: the console renders the
 * cards and its live preview from here, and the engine compiles the header from
 * the same table and the same `toPolicyFragment`. PaaS keeps a second copy of the
 * fragment logic in `EditPermissionPolicy.jsx` as `getPreviewValue()`; one
 * function used by both is what stops a preview ever disagreeing with what is
 * actually emitted.
 *
 * **The directive list follows MDN, not PaaS.** Three PaaS names do not survive:
 * `opt-credentials` and `identity-credentials` were never real directives (the
 * spec names are `otp-credentials` and `identity-credentials-get`), and
 * `document-domain` is no longer a Permissions Policy directive at all. See
 * `remapLegacyPermissionPolicy` for how a PaaS export is carried across.
 *
 * MDN marks *every* directive in this feature as experimental, so there is
 * deliberately no per-directive status field — a flag with one value on all 48
 * entries tells an editor nothing. The console says it once, on the tab.
 */

import {
  PermissionPolicyState,
  type PermissionPolicyDirectiveConfig,
  type PermissionPolicyStateValue
} from './config.js';

export interface PermissionPolicyDefinition {
  readonly directive: string;
  readonly title: string;
  readonly description: string;
}

/**
 * Every directive the console offers, in emission order.
 *
 * **Order is behavioural.** The compiled header lists directives in this order,
 * so reordering changes the emitted bytes of every configuration. It is plain
 * alphabetical, which is a deliberate divergence: PaaS applies no `ORDER BY` when
 * reading its rows, so its header order is SQL insertion order and varies between
 * two installations holding identical configuration. Stable output matters here
 * because it is stored at publish time and diffed against the live copy.
 *
 * `attribution-reporting` and `browsing-topics` are **absent on purpose**. MDN
 * marks both deprecated *and* non-standard, with a pending-removal notice: Chrome
 * withdrew those Privacy Sandbox features. PaaS offers both, so
 * `remapLegacyPermissionPolicy` drops them on import rather than failing the
 * whole document. Do not restore them from the MDN directive index — that page
 * lists all 50 and shows none of the status flags, which are only on each
 * directive's own page.
 */
export const PERMISSION_POLICY_DIRECTIVES: readonly PermissionPolicyDefinition[] = [
  {
    directive: 'accelerometer',
    title: 'Accelerometer',
    description:
      'Controls whether the site is allowed to gather information about the acceleration of ' +
      'the device through the Accelerometer interface.'
  },
  {
    directive: 'ambient-light-sensor',
    title: 'Ambient Light Sensor',
    description:
      'Controls whether the site is allowed to gather information about the amount of light ' +
      'in the environment around the device through the AmbientLightSensor interface.'
  },
  {
    directive: 'aria-notify',
    title: 'Screen Reader Announcements',
    description:
      'Controls whether the site is allowed to use the ariaNotify() method to fire screen ' +
      'reader announcements.'
  },
  {
    directive: 'autoplay',
    title: 'Autoplay',
    description: 'Controls whether the site is allowed to autoplay media.'
  },
  {
    directive: 'bluetooth',
    title: 'Bluetooth',
    description: 'Controls whether the site is allowed to access Bluetooth API of the device.'
  },
  {
    directive: 'camera',
    title: 'Camera',
    description:
      'Controls whether the site is allowed to use video input devices such as the device camera.'
  },
  {
    directive: 'captured-surface-control',
    title: 'Captured Surface Control',
    description:
      'Controls whether the site is allowed to use the Captured Surface Control API to scroll ' +
      'and zoom a surface it is capturing.'
  },
  {
    directive: 'ch-ua-high-entropy-values',
    title: 'High Entropy Client Hints',
    description:
      'Controls whether the site is allowed to retrieve detailed user agent data through the ' +
      'getHighEntropyValues() method. When disallowed, only the brand, mobile and platform ' +
      'hints are returned.'
  },
  {
    directive: 'compute-pressure',
    title: 'Compute Pressure',
    description: 'Controls whether the site is allowed to access the Pressure API.'
  },
  {
    directive: 'cross-origin-isolated',
    title: 'Cross-Origin Isolation',
    description: 'Controls whether the site can be treated as cross-origin isolated.'
  },
  {
    directive: 'deferred-fetch',
    title: 'Deferred Fetch',
    description:
      "Controls the allocation of this site's quota for deferred fetches made with " +
      'fetchLater().'
  },
  {
    directive: 'deferred-fetch-minimal',
    title: 'Deferred Fetch (Subframes)',
    description:
      'Controls the allocation of the quota shared by cross-origin subframes for deferred ' +
      'fetches made with fetchLater().'
  },
  {
    directive: 'display-capture',
    title: 'Display Capture',
    description: 'Controls whether the site is allowed to access the Screen Capture API.'
  },
  {
    directive: 'encrypted-media',
    title: 'Encrypted Media',
    description:
      'Controls whether the site is allowed to use the Encrypted Media Extensions API.'
  },
  {
    directive: 'fullscreen',
    title: 'Fullscreen',
    description: 'Controls whether the site is allowed to request the use of the full screen.'
  },
  {
    directive: 'gamepad',
    title: 'Gamepad',
    description: 'Controls whether the site is allowed to access the Gamepad API.'
  },
  {
    directive: 'geolocation',
    title: 'Geolocation',
    description: 'Controls whether the site is allowed to access the Geolocation interface.'
  },
  {
    directive: 'gyroscope',
    title: 'Gyroscope',
    description:
      'Controls whether the site is allowed to gather information about the orientation of ' +
      'the device through the Gyroscope interface.'
  },
  {
    directive: 'hid',
    title: 'HID',
    description:
      'Controls whether the site is allowed to use the WebHID API to connect to uncommon or ' +
      'exotic human interface devices such as alternative keyboards or gamepads.'
  },
  {
    directive: 'identity-credentials-get',
    title: 'Identity Credentials',
    description:
      'Controls whether the site is allowed to use the Federated Credential Management API ' +
      '(FedCM), and more specifically the navigator.credentials.get() method with an identity ' +
      'option.'
  },
  {
    directive: 'idle-detection',
    title: 'Idle Detection',
    description:
      'Controls whether the site is allowed to use the Idle Detection API to detect when ' +
      'users are interacting with their devices. This can be used to report the user as ' +
      'available or away in chat interfaces.'
  },
  {
    directive: 'language-detector',
    title: 'Language Detector',
    description:
      'Controls whether the site is allowed to use the language detection functionality of ' +
      'the Translator and Language Detector APIs.'
  },
  {
    directive: 'language-model',
    title: 'Prompt API',
    description:
      "Controls whether the site is allowed to use the Prompt API to access the browser's " +
      'built-in language model.'
  },
  {
    directive: 'local-fonts',
    title: 'Local Fonts',
    description:
      "Controls whether the site is allowed to gather data on the user's locally-installed fonts."
  },
  {
    directive: 'local-network',
    title: 'Local Network',
    description:
      'Controls whether the site is allowed to make network requests to local addresses.'
  },
  {
    directive: 'local-network-access',
    title: 'Local and Loopback Network',
    description:
      'Controls whether the site is allowed to make network requests to local and loopback ' +
      'addresses. This is an alias for the more granular local-network and loopback-network ' +
      'directives.'
  },
  {
    directive: 'loopback-network',
    title: 'Loopback Network',
    description:
      'Controls whether the site is allowed to make network requests to loopback addresses.'
  },
  {
    directive: 'magnetometer',
    title: 'Magnetometer',
    description:
      'Controls whether the site is allowed to gather information about the orientation of ' +
      'the device through the Magnetometer interface.'
  },
  {
    directive: 'microphone',
    title: 'Microphone',
    description:
      'Controls whether the site is allowed to use audio input devices such as a device ' +
      'microphone.'
  },
  {
    directive: 'midi',
    title: 'MIDI',
    description: 'Controls whether the site is allowed to use the Web MIDI API.'
  },
  {
    directive: 'on-device-speech-recognition',
    title: 'On-Device Speech Recognition',
    description:
      'Controls whether the site is allowed to use the on-device speech recognition ' +
      'functionality of the Web Speech API.'
  },
  {
    directive: 'otp-credentials',
    title: 'OTP Credentials',
    description:
      'Controls whether the site is allowed to use the WebOTP API to request a one-time ' +
      "password (OTP) from a specially-formatted SMS message sent by the website's server."
  },
  {
    directive: 'payment',
    title: 'Payment',
    description: 'Controls whether the site is allowed to use the Payment Request API.'
  },
  {
    directive: 'picture-in-picture',
    title: 'Picture in Picture',
    description:
      'Controls whether the site is allowed to play a video in a Picture-in-Picture mode.'
  },
  {
    directive: 'private-state-token-issuance',
    title: 'Private State Token Issuance',
    description: 'Controls whether the site is allowed to request private state tokens.'
  },
  {
    directive: 'private-state-token-redemption',
    title: 'Private State Token Redemption',
    description:
      'Controls whether the site is allowed to redeem private state tokens and send ' +
      'redemption records.'
  },
  {
    directive: 'publickey-credentials-create',
    title: 'Create Public Key Credentials',
    description:
      'Controls whether the site is allowed to use the Web Authentication API to create new ' +
      'credentials.'
  },
  {
    directive: 'publickey-credentials-get',
    title: 'Retrieve Public Key Credentials',
    description:
      'Controls whether the site is allowed to use the Web Authentication API to retrieve ' +
      'credentials.'
  },
  {
    directive: 'screen-wake-lock',
    title: 'Screen Wake Lock',
    description:
      'Controls whether the site is allowed to use Screen Wake Lock API to indicate that the ' +
      'device should not dim or turn off the screen.'
  },
  {
    directive: 'serial',
    title: 'Serial',
    description:
      'Controls whether the site is allowed to use the Web Serial API to communicate with ' +
      'serial devices.'
  },
  {
    directive: 'speaker-selection',
    title: 'Speaker Selection',
    description:
      'Controls whether the site is allowed to enumerate and select audio output devices.'
  },
  {
    directive: 'storage-access',
    title: 'Storage Access',
    description:
      'Controls whether third party content (i.e. embedded in an iframe) is allowed to use ' +
      'the Storage Access API to request access to unpartitioned cookies.'
  },
  {
    directive: 'summarizer',
    title: 'Summarizer',
    description: 'Controls whether the site is allowed to use the Summarizer API.'
  },
  {
    directive: 'translator',
    title: 'Translator',
    description:
      'Controls whether the site is allowed to use the translation functionality of the ' +
      'Translator and Language Detector APIs.'
  },
  {
    directive: 'usb',
    title: 'USB',
    description: 'Controls whether the site is allowed to use the WebUSB API.'
  },
  {
    directive: 'web-share',
    title: 'Web Share',
    description:
      'Controls whether the site is allowed to use Web Share API to share text, links, ' +
      "images, and other content to arbitrary destinations of the user's choice."
  },
  {
    directive: 'window-management',
    title: 'Window Management',
    description:
      'Controls whether the site is allowed to use the Window Management API to manage ' +
      'windows on multiple displays.'
  },
  {
    directive: 'xr-spatial-tracking',
    title: 'XR Spatial Tracking',
    description: 'Controls whether the site is allowed to use the WebXR Device API.'
  }
];

const BY_DIRECTIVE = new Map(
  PERMISSION_POLICY_DIRECTIVES.map((d) => [d.directive.toLowerCase(), d] as const)
);

export const ALL_PERMISSION_POLICY_DIRECTIVES: readonly string[] =
  PERMISSION_POLICY_DIRECTIVES.map((d) => d.directive);

export function findPermissionPolicyDirective(
  directive: string
): PermissionPolicyDefinition | undefined {
  return BY_DIRECTIVE.get(directive.toLowerCase());
}

/**
 * Directive names PaaS emitted that this app does not offer, and what becomes of
 * them when a PaaS export is imported.
 *
 * `undefined` means the directive is discarded. Without this table a PaaS export
 * would fail validation on three unknown directives and the import — the only
 * migration path between the two products — would be refused outright.
 */
const LEGACY_DIRECTIVES: Readonly<Record<string, string | undefined>> = {
  // Never valid: the spec names are otp-credentials and identity-credentials-get.
  'opt-credentials': 'otp-credentials',
  'identity-credentials': 'identity-credentials-get',
  // No longer a Permissions Policy directive.
  'document-domain': undefined,
  // Deprecated, non-standard and pending removal from browsers.
  'attribution-reporting': undefined,
  'browsing-topics': undefined
};

/**
 * One directive plus everything the console needs to render it. A directive the
 * customer has never configured is materialised as `Disabled`.
 */
export interface PermissionPolicyRowModel {
  readonly directive: string;
  readonly title: string;
  readonly description: string;
  readonly state: PermissionPolicyStateValue;
  readonly origins: readonly string[];
}

/**
 * Every directive, configured or not — the "sparse storage, dense presentation"
 * model PaaS uses, where the table holds only configured rows and the read path
 * synthesises the rest.
 *
 * Order comes from {@link PERMISSION_POLICY_DIRECTIVES} rather than from the
 * stored document, which is what makes the compiled header stable regardless of
 * the order an editor happened to configure things in. Matching is
 * case-insensitive, so an imported `CAMERA` configures `camera` rather than being
 * silently ignored.
 */
export function listPermissionPolicyRows(
  configured: readonly PermissionPolicyDirectiveConfig[]
): PermissionPolicyRowModel[] {
  const byDirective = new Map(
    configured.map((entry) => [entry.directive.toLowerCase(), entry] as const)
  );

  return PERMISSION_POLICY_DIRECTIVES.map((definition) => {
    const entry = byDirective.get(definition.directive.toLowerCase());

    return {
      directive: definition.directive,
      title: definition.title,
      description: definition.description,
      state: entry?.state ?? PermissionPolicyState.Disabled,
      origins: entry?.origins ?? []
    };
  });
}

/**
 * One directive's contribution to the header, or an empty string if it makes none.
 *
 * Faithful port of `PermissionPolicyMapper.ToPolicyFragment`, with two deliberate
 * differences, both noted below. Note that `self` is unquoted while origins are
 * quoted, and that `All` emits a bare `*` with no parentheses — that asymmetry is
 * the spec's, not a mistake.
 */
export function toPolicyFragment(row: {
  directive: string;
  state: PermissionPolicyStateValue;
  origins: readonly string[];
}): string {
  const origins = quoteOrigins(row.origins);

  switch (row.state) {
  case PermissionPolicyState.None:
    return `${row.directive}=()`;

  case PermissionPolicyState.All:
    return `${row.directive}=*`;

  case PermissionPolicyState.ThisSite:
    return `${row.directive}=(self)`;

  case PermissionPolicyState.ThisAndSpecificSites:
    // DIVERGENCE from PaaS, which interpolates unconditionally and so emits
    // `camera=(self )` with a trailing space when the origin list is empty — a
    // quirk one of its unit tests pins. Identical meaning, two bytes shorter.
    return origins.length > 0
      ? `${row.directive}=(self ${origins})`
      : `${row.directive}=(self)`;

  case PermissionPolicyState.SpecificSites:
    // Matches PaaS: an empty list collapses to `()`, which blocks the feature.
    // Failing closed is the right way round, and `validateConfig` rejects this
    // state without origins anyway, so it can only arrive through an import.
    return `${row.directive}=(${origins})`;

  default:
    // `Disabled`, and anything a malformed document smuggled past the type. PaaS
    // falls back to `None` here, which silently *blocks* a feature on the
    // strength of an unrecognised string; omitting the directive leaves the
    // browser default in place instead. Validation is what actually guards this —
    // an unknown state cannot be saved or imported.
    return '';
  }
}

/**
 * Origins as the header wants them: double-quoted, space-separated.
 *
 * Blank entries are dropped rather than emitted as `""`, which would be a syntax
 * error in the header. The console can leave an empty row behind when someone
 * adds an origin field and does not fill it in.
 */
function quoteOrigins(origins: readonly string[]): string {
  return origins
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => `"${origin}"`)
    .join(' ');
}

/** True for the two states whose meaning depends on an origin list. */
export function stateRequiresOrigins(state: PermissionPolicyStateValue): boolean {
  return (
    state === PermissionPolicyState.SpecificSites ||
    state === PermissionPolicyState.ThisAndSpecificSites
  );
}

/**
 * What an origin may look like. Ported from `SavePermissionPolicyModel.SourceRegEx`.
 *
 * Scheme must be `http`, `https`, `ws` or `wss`; an optional single `*.` wildcard
 * label; two or more dot-separated labels; an optional port; an optional trailing
 * slash. **No path** — a path in a Permissions Policy allow-list is meaningless,
 * and browsers reject the whole directive rather than the one entry.
 *
 * The wildcard form is kept deliberately. MDN documents `("https://*.example.com")`
 * for the header, and PaaS accepts it, so rejecting it here would both diverge
 * from the spec and break imports.
 */
const ORIGIN_PATTERN = /^(?:http|ws)s?:\/\/(?:\*\.)?(?:[a-z0-9-]+\.)+[a-z0-9-]+(?::[0-9]{1,5})?\/?$/;

/** Shared so the console's inline message and the backend's rejection agree. */
export const PERMISSION_POLICY_ORIGIN_RULE =
  'Enter a scheme and domain such as https://www.example.com, optionally with a leading *. ' +
  'wildcard or a port. Paths are not allowed.';

/**
 * Tested against the lower-cased value: host names are case-insensitive, so
 * refusing `https://WWW.Example.com` would be pedantry, and PaaS's own import
 * path does not normalise case before storing.
 */
export function isValidPermissionPolicyOrigin(origin: string): boolean {
  return ORIGIN_PATTERN.test(origin.trim().toLowerCase());
}

/**
 * Brings a PaaS document's directive names up to date, reporting what it had to
 * discard.
 *
 * Applied on import only. Filling in a missing section on read is safe;
 * rewriting and dropping a customer's directives is a migration that should
 * happen once, on the way in, and be reported when it does — otherwise someone
 * moving from PaaS silently loses directives they had configured.
 *
 * Renames that collide with a directive the document already carries are dropped
 * rather than overwriting it: the correctly-named entry is the one the editor
 * last saw in a console.
 */
export function remapLegacyPermissionPolicy(
  directives: readonly PermissionPolicyDirectiveConfig[]
): { directives: PermissionPolicyDirectiveConfig[]; dropped: string[] } {
  const dropped: string[] = [];
  const remapped: PermissionPolicyDirectiveConfig[] = [];
  // `entry?.` and not `entry.`: this runs on an untrusted import *before*
  // `validateConfig`, so a null row or a non-string name has to survive the walk
  // and reach validation. Throwing here would surface a malformed payload as a
  // generic 500 rather than the 400 that names the offending row.
  const taken = new Set(
    directives
      .map((entry) => entry?.directive)
      .filter((name): name is string => typeof name === 'string')
      .map((name) => name.toLowerCase())
  );

  for (const entry of directives) {
    const name = typeof entry?.directive === 'string' ? entry.directive.toLowerCase() : '';

    if (!(name in LEGACY_DIRECTIVES)) {
      remapped.push(entry);
      continue;
    }

    const replacement = LEGACY_DIRECTIVES[name];

    if (replacement === undefined || taken.has(replacement)) {
      dropped.push(entry.directive);
      continue;
    }

    taken.add(replacement);
    remapped.push({ ...entry, directive: replacement });
  }

  return { directives: remapped, dropped };
}
