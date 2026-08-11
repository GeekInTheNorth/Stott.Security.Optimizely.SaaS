/**
 * Conformance tests for the ported response-header compiler.
 *
 * Ported from CustomHeaderService.cs / CustomHeaderMapper.cs behaviour.
 */

import { describe, expect, it } from 'vitest';

import {
  CustomHeaderBehavior,
  createEmptyConfig,
  type ConfigDocument,
  type CustomHeaderConfig,
  type CustomHeaderBehaviorValue
} from '../shared/config.js';
import {
  FIXED_HEADER_NAMES,
  STANDARD_HEADERS,
  StandardHeaderNames,
  getDefaultValue,
  getPropertyType
} from '../shared/standard-headers.js';
import { compileCustomHeaders, listHeaderRows } from '../backend/core/headers.js';
import { compileHeaders } from '../backend/core/index.js';

let nextId = 0;
const header = (
  headerName: string,
  behavior: CustomHeaderBehaviorValue,
  headerValue = ''
): CustomHeaderConfig => ({ id: `hdr-${++nextId}`, headerName, behavior, headerValue });

function config(headers: CustomHeaderConfig[]): ConfigDocument {
  return { ...createEmptyConfig(), headers };
}

describe('standard header metadata', () => {
  it('defines exactly the eight fixed headers', () => {
    expect(STANDARD_HEADERS).toHaveLength(8);
    expect(FIXED_HEADER_NAMES).toEqual([
      'X-Xss-Protection',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Cross-Origin-Embedder-Policy',
      'Cross-Origin-Opener-Policy',
      'Cross-Origin-Resource-Policy',
      'Strict-Transport-Security'
    ]);
  });

  it.each([
    [StandardHeaderNames.XssProtection, '0'],
    [StandardHeaderNames.ContentTypeOptions, 'nosniff'],
    [StandardHeaderNames.ReferrerPolicy, 'strict-origin-when-cross-origin'],
    [StandardHeaderNames.FrameOptions, 'SAMEORIGIN'],
    [StandardHeaderNames.CrossOriginEmbedderPolicy, 'require-corp'],
    [StandardHeaderNames.CrossOriginOpenerPolicy, 'same-origin-allow-popups'],
    [StandardHeaderNames.CrossOriginResourcePolicy, 'same-origin'],
    [StandardHeaderNames.StrictTransportSecurity, 'max-age=63072000; includeSubDomains; preload']
  ])('defaults %s to %s', (name, expected) => {
    expect(getDefaultValue(name)).toBe(expected);
  });

  it('drives the console editor via propertyType', () => {
    expect(getPropertyType(StandardHeaderNames.StrictTransportSecurity)).toBe('hsts');
    expect(getPropertyType(StandardHeaderNames.FrameOptions)).toBe('select');
    expect(getPropertyType('X-Custom-Thing')).toBe('string');
  });

  // Split by propertyType rather than branching inside one test: a conditional
  // expect can silently assert nothing if the filter is wrong.
  it.each(STANDARD_HEADERS.filter((h) => h.propertyType === 'select'))(
    '$headerName offers allowed values that include its default',
    (definition) => {
      expect(definition.allowedValues?.length ?? 0).toBeGreaterThan(0);
      // The default must be one of the offered values, or the console would open
      // showing a value its own dropdown rejects.
      expect(definition.allowedValues?.map((v) => v.value)).toContain(definition.defaultValue);
    }
  );

  it.each(STANDARD_HEADERS.filter((h) => h.propertyType !== 'select'))(
    '$headerName uses a bespoke editor and offers no allowed-value list',
    (definition) => {
      expect(definition.allowedValues).toBeUndefined();
    }
  );
});

describe('listing rows for the console', () => {
  it('materialises all eight standard headers as Disabled when nothing is configured', () => {
    const rows = listHeaderRows([]);

    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.behavior === CustomHeaderBehavior.Disabled)).toBe(true);
    // Nothing stored, so nothing to delete.
    expect(rows.every((r) => r.canDelete === false)).toBe(true);
    expect(rows.every((r) => r.isHeaderNameEditable === false)).toBe(true);
  });

  it('does not duplicate a standard header the customer has configured', () => {
    const rows = listHeaderRows([
      header(StandardHeaderNames.FrameOptions, CustomHeaderBehavior.Add, 'DENY')
    ]);

    expect(rows).toHaveLength(8);
    expect(rows.filter((r) => r.headerName === StandardHeaderNames.FrameOptions)).toHaveLength(1);
  });

  it('matches configured standard headers case-insensitively', () => {
    const rows = listHeaderRows([header('x-frame-options', CustomHeaderBehavior.Add, 'DENY')]);

    expect(rows).toHaveLength(8);
  });

  it('keeps custom headers editable and deletable, and carries no metadata', () => {
    const rows = listHeaderRows([header('X-Netcel-Trace', CustomHeaderBehavior.Add, 'on')]);
    const custom = rows.find((r) => r.headerName === 'X-Netcel-Trace');

    expect(custom?.isHeaderNameEditable).toBe(true);
    expect(custom?.canDelete).toBe(true);
    expect(custom?.propertyType).toBe('string');
    expect(custom?.allowedValues).toBeUndefined();
  });

  it('enriches a configured standard header with its metadata', () => {
    const rows = listHeaderRows([
      header(StandardHeaderNames.ReferrerPolicy, CustomHeaderBehavior.Add, 'no-referrer')
    ]);
    const row = rows.find((r) => r.headerName === StandardHeaderNames.ReferrerPolicy);

    expect(row?.description).toContain('Referrer-Policy');
    expect(row?.allowedValues?.length).toBe(8);
    expect(row?.isHeaderNameEditable).toBe(false);
    expect(row?.canDelete).toBe(true);
  });
});

describe('compiling response headers', () => {
  // Installing the app must not silently start emitting headers on a live site.
  it('emits nothing when only defaults exist', () => {
    expect(compileCustomHeaders(config([]))).toEqual([]);
  });

  it('emits an Add as a replacement', () => {
    const result = compileCustomHeaders(
      config([header(StandardHeaderNames.FrameOptions, CustomHeaderBehavior.Add, 'DENY')])
    );

    expect(result).toEqual([
      { key: 'X-Frame-Options', value: 'DENY', isRemoval: false, isReplacement: true }
    ]);
  });

  it('emits a Remove as a deletion with no value and no replacement', () => {
    const result = compileCustomHeaders(
      config([header('Server', CustomHeaderBehavior.Remove, 'ignored')])
    );

    expect(result).toEqual([
      { key: 'Server', value: '', isRemoval: true, isReplacement: false }
    ]);
  });

  it('drops Disabled headers', () => {
    const result = compileCustomHeaders(
      config([header('X-Thing', CustomHeaderBehavior.Disabled, 'value')])
    );

    expect(result).toEqual([]);
  });

  it('drops an Add with a blank value but keeps a valueless Remove', () => {
    const result = compileCustomHeaders(
      config([
        header('X-Blank', CustomHeaderBehavior.Add, '   '),
        header('X-Gone', CustomHeaderBehavior.Remove, '')
      ])
    );

    expect(result.map((h) => h.key)).toEqual(['X-Gone']);
  });

  it('drops headers with a blank name', () => {
    expect(compileCustomHeaders(config([header('  ', CustomHeaderBehavior.Add, 'x')]))).toEqual([]);
  });

  it('emits HSTS unconditionally — the head decides whether the request is HTTPS', () => {
    const result = compileCustomHeaders(
      config([
        header(
          StandardHeaderNames.StrictTransportSecurity,
          CustomHeaderBehavior.Add,
          'max-age=63072000; includeSubDomains; preload'
        )
      ])
    );

    expect(result[0]?.key).toBe('Strict-Transport-Security');
    expect(result[0]?.isReplacement).toBe(true);
  });
});

describe('compileHeaders', () => {
  it('combines CSP and response headers, sorted by key', () => {
    const base = createEmptyConfig();
    const doc: ConfigDocument = {
      ...base,
      settings: { ...base.settings, isEnabled: true },
      sources: [{ id: 's1', source: 'https://example.com', directives: ['default-src'] }],
      headers: [
        header(StandardHeaderNames.FrameOptions, CustomHeaderBehavior.Add, 'DENY'),
        header('Server', CustomHeaderBehavior.Remove)
      ]
    };

    const result = compileHeaders(doc);

    expect(result.map((h) => h.key)).toEqual([
      'Content-Security-Policy',
      'Server',
      'X-Frame-Options'
    ]);
  });

  it('returns response headers even when CSP is disabled', () => {
    const doc: ConfigDocument = {
      ...createEmptyConfig(),
      headers: [header(StandardHeaderNames.FrameOptions, CustomHeaderBehavior.Add, 'DENY')]
    };

    expect(compileHeaders(doc).map((h) => h.key)).toEqual(['X-Frame-Options']);
  });
});
