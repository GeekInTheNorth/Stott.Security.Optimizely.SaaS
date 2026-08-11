/**
 * Metadata for the eight standard security headers.
 *
 * Ported from Features/CustomHeaders/Repository/CustomHeaderMapper.cs.
 *
 * Lives in `shared/` because both halves need it: the console renders the
 * dropdowns, descriptions and HSTS editor from here, and the backend uses the
 * default values and the fixed-header list when materialising headers the
 * customer has never explicitly configured.
 *
 * Adding a standard header means adding one entry here — nothing else. There is
 * no database change, no new endpoint, and no UI change beyond what
 * `propertyType` already drives.
 */

import {
  CustomHeaderBehavior,
  type CustomHeaderBehaviorValue,
  type CustomHeaderConfig
} from './config.js';

export const StandardHeaderNames = {
  XssProtection: 'X-Xss-Protection',
  FrameOptions: 'X-Frame-Options',
  ContentTypeOptions: 'X-Content-Type-Options',
  ReferrerPolicy: 'Referrer-Policy',
  CrossOriginEmbedderPolicy: 'Cross-Origin-Embedder-Policy',
  CrossOriginOpenerPolicy: 'Cross-Origin-Opener-Policy',
  CrossOriginResourcePolicy: 'Cross-Origin-Resource-Policy',
  StrictTransportSecurity: 'Strict-Transport-Security'
} as const;

/**
 * How the console should edit a header's value.
 *
 * - `select` — a fixed list of allowed values (all standard headers bar HSTS)
 * - `hsts`   — the specialised max-age / includeSubDomains / preload editor
 * - `string` — free text (anything customer-defined)
 */
export type HeaderPropertyType = 'select' | 'hsts' | 'string';

export interface AllowedValue {
  readonly value: string;
  readonly description: string;
}

export interface StandardHeaderDefinition {
  readonly headerName: string;
  readonly defaultValue: string;
  readonly propertyType: HeaderPropertyType;
  readonly description: string;
  readonly allowedValues?: readonly AllowedValue[];
}

/**
 * Declaration order matters only for display; `CustomHeaderService.GetDefaultHeaders`
 * uses the same order, so keeping it identical avoids a needless diff in the
 * golden-file harness.
 */
export const STANDARD_HEADERS: readonly StandardHeaderDefinition[] = [
  {
    headerName: StandardHeaderNames.XssProtection,
    defaultValue: '0',
    propertyType: 'select',
    description:
      'Configures the X-XSS-Protection header to instruct browsers to use XSS filters. ' +
      'Please note that modern browsers have either retired or will not implement XSS ' +
      'filtering. Legacy browsers have been known to contain vulnerabilities within their ' +
      'XSS filters that can compromise otherwise safe websites. It is recommended to set ' +
      "the header to 'Disabled' and to configure a Content Security Policy header. Only " +
      'enable the X-XSS-Protection header if you must support legacy browsers.',
    allowedValues: [
      { value: '0', description: 'Disabled' },
      { value: '1', description: 'Enabled' },
      { value: '1; mode=block', description: 'Enabled With Blocking' }
    ]
  },
  {
    headerName: StandardHeaderNames.FrameOptions,
    defaultValue: 'SAMEORIGIN',
    propertyType: 'select',
    description:
      'Configures the X-Frame-Options header to restrict the embedding of pages within ' +
      'frames on third party sites.',
    allowedValues: [
      { value: 'SAMEORIGIN', description: 'Allow Framing only by this site (SAMEORIGIN)' },
      { value: 'DENY', description: 'Disallow Framing (DENY)' }
    ]
  },
  {
    headerName: StandardHeaderNames.ContentTypeOptions,
    defaultValue: 'nosniff',
    propertyType: 'select',
    description:
      'Configures the X-Content-Type-Options header to prevent styles or scripts being ' +
      'loaded with the incorrect mime types.',
    allowedValues: [{ value: 'nosniff', description: 'No Sniff' }]
  },
  {
    headerName: StandardHeaderNames.ReferrerPolicy,
    defaultValue: 'strict-origin-when-cross-origin',
    propertyType: 'select',
    description:
      'Configures the Referrer-Policy header which instructs the browser on what ' +
      'information it should send in the Referrer header on subsequent requests.',
    allowedValues: [
      { value: 'no-referrer', description: 'No Referrer' },
      {
        value: 'no-referrer-when-downgrade',
        description: 'No referrer When Downgrading (e.g. HTTP → HTTPS)'
      },
      { value: 'origin', description: 'Origin' },
      { value: 'origin-when-cross-origin', description: 'Origin When Cross Origin' },
      { value: 'same-origin', description: 'Same Origin' },
      { value: 'strict-origin', description: 'Strict Origin' },
      {
        value: 'strict-origin-when-cross-origin',
        description: 'Strict Origin When Cross Origin'
      },
      { value: 'unsafe-url', description: 'Unsafe Url' }
    ]
  },
  {
    headerName: StandardHeaderNames.CrossOriginEmbedderPolicy,
    defaultValue: 'require-corp',
    propertyType: 'select',
    description:
      'Configures the Cross-Origin-Embedder-Policy header which is used to prevent third ' +
      'party resources being loaded that have not explicitly granted cross origin ' +
      'permissions.',
    allowedValues: [
      { value: 'unsafe-none', description: 'Unsafe None' },
      { value: 'require-corp', description: 'Requires CORP' },
      { value: 'credentialless', description: 'Credentialless' }
    ]
  },
  {
    headerName: StandardHeaderNames.CrossOriginOpenerPolicy,
    defaultValue: 'same-origin-allow-popups',
    propertyType: 'select',
    description:
      'Configures the Cross-Origin-Opener-Policy header which is used to prevent sharing ' +
      'context with cross origin documents.',
    allowedValues: [
      { value: 'unsafe-none', description: 'Unsafe None' },
      { value: 'same-origin', description: 'Same Origin' },
      { value: 'same-origin-allow-popups', description: 'Same Origin Allow Popups' },
      { value: 'noopener-allow-popups', description: 'Noopener Allow Popups' }
    ]
  },
  {
    headerName: StandardHeaderNames.CrossOriginResourcePolicy,
    defaultValue: 'same-origin',
    propertyType: 'select',
    description:
      'Configures the Cross-Origin-Resource-Policy header which is used to limit what ' +
      'resources can consume the current site.',
    allowedValues: [
      { value: 'same-origin', description: 'Same Origin' },
      { value: 'same-site', description: 'Same Site' },
      { value: 'cross-origin', description: 'Cross Origin' }
    ]
  },
  {
    headerName: StandardHeaderNames.StrictTransportSecurity,
    defaultValue: 'max-age=63072000; includeSubDomains; preload',
    // No allowedValues — the console uses a dedicated editor for max-age,
    // includeSubDomains and preload.
    propertyType: 'hsts',
    description: 'Enforces secure (HTTP over SSL/TLS) connections to the server.'
  }
];

const BY_NAME = new Map(
  STANDARD_HEADERS.map((h) => [h.headerName.toLowerCase(), h] as const)
);

/** Header names the customer cannot rename. Mirrors `CustomHeaderMapper.FixedHeaders`. */
export const FIXED_HEADER_NAMES: readonly string[] = STANDARD_HEADERS.map((h) => h.headerName);

export function findStandardHeader(headerName: string): StandardHeaderDefinition | undefined {
  return BY_NAME.get(headerName.toLowerCase());
}

export function isFixedHeader(headerName: string): boolean {
  return BY_NAME.has(headerName.toLowerCase());
}

export function getPropertyType(headerName: string): HeaderPropertyType {
  return findStandardHeader(headerName)?.propertyType ?? 'string';
}

export function getDefaultValue(headerName: string): string | undefined {
  return findStandardHeader(headerName)?.defaultValue;
}

/**
 * The console's row model for a header — a configured one, or a standard one the
 * customer has not touched yet. Mirrors `CustomHeaderModel`.
 */
export interface HeaderRowModel {
  readonly id?: string;
  readonly headerName: string;
  readonly headerValue: string;
  readonly behavior: CustomHeaderBehaviorValue;
  readonly description?: string;
  readonly allowedValues?: readonly AllowedValue[];
  readonly propertyType: HeaderPropertyType;
  /**
   * A name the customer chose rather than one of the standard eight. Named for
   * what it is, not for an affordance: PaaS calls the equivalent field
   * `IsHeaderNameEditable`, but a name here is chosen once when the header is
   * added and immutable thereafter, exactly like a standard one. What varies is
   * whether the row can be deleted and whether it has metadata to show.
   */
  readonly isCustomHeader: boolean;
  /** False for unconfigured standard headers — there is nothing stored to delete. */
  readonly canDelete: boolean;
}

/**
 * A header the customer has configured, enriched with whatever standard-header
 * metadata its name attracts. A custom name matches nothing, so it gets a free
 * text value editor and no description — which is precisely what a header of the
 * customer's own choosing needs.
 *
 * Shared rather than backend-only because the console needs the same row for a
 * custom header added since the draft loaded: the backend has not seen it yet,
 * and a second, subtly different row model in the browser is how the two drift.
 */
export function toConfiguredRow(header: CustomHeaderConfig): HeaderRowModel {
  const definition = findStandardHeader(header.headerName);

  return {
    id: header.id,
    headerName: header.headerName,
    headerValue: header.headerValue,
    behavior: header.behavior,
    ...(definition?.description ? { description: definition.description } : {}),
    ...(definition?.allowedValues ? { allowedValues: definition.allowedValues } : {}),
    propertyType: definition?.propertyType ?? 'string',
    isCustomHeader: !isFixedHeader(header.headerName),
    canDelete: true
  };
}

/**
 * A standard header the customer has not configured: shown in the console with
 * its default value, but `Disabled`, so it is not emitted.
 */
export function toDefaultRow(definition: StandardHeaderDefinition): HeaderRowModel {
  return {
    headerName: definition.headerName,
    headerValue: definition.defaultValue,
    behavior: CustomHeaderBehavior.Disabled,
    description: definition.description,
    ...(definition.allowedValues ? { allowedValues: definition.allowedValues } : {}),
    propertyType: definition.propertyType,
    isCustomHeader: false,
    canDelete: false
  };
}
