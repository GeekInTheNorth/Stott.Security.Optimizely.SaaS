/**
 * Conformance tests for the CSP source rule.
 *
 * The console applies these as a source is typed and the backend applies the
 * same ones on save — shared precisely so the two cannot disagree.
 *
 * The tables are drawn from `SavePermissionModelTestCases.GetValidUrlTestCases`
 * and `GetInValidUrlTestCases` in the PaaS project. Where a case moves from one
 * table to the other, the divergence is commented on the case itself.
 */

import { describe, expect, it } from 'vitest';

import { ALL_SOURCES, Sources } from '../shared/constants.js';
import { isValidCspSource } from '../shared/csp-source-rules.js';
import { isValidPermissionPolicyOrigin } from '../shared/permission-policy.js';

describe('source rules', () => {
  // Both lists, deliberately: a keyword added to one but not the other would
  // otherwise become silently unenterable in the console.
  it.each(Object.values(Sources))('accepts the keyword %j', (keyword) => {
    expect(isValidCspSource(keyword)).toBe(true);
  });

  it.each(ALL_SOURCES)('accepts the sort-order keyword %j', (keyword) => {
    expect(isValidCspSource(keyword)).toBe(true);
  });

  it.each([
    "'sha256-AbCdEf123='",
    "'sha384-AbCdEf123=='",
    "'sha512-abc+def/ghi='",
    "'sha256-abcdef'"
  ])('accepts the hash %j', (hash) => {
    expect(isValidCspSource(hash)).toBe(true);
  });

  it.each([
    'https://example.com',
    'https://example.com/',
    'http://www.example.com',
    'ws://example.com',
    'wss://example.com',
    'http://www.example.com:80',
    'https://example.com:*',
    'https://*.example.com',
    'https://*.example.com/',
    'https://*.example.com/some-child-folder/',
    'https://*.example.com/some-child-folder/file.js',
    'https://*.example.co.uk',
    // A scheme is optional: a bare host is a legal CSP host-source, and it is
    // what the PaaS console taught editors to type.
    'media1.com',
    'x.com',
    '*.trusted.com',
    'wss://localhost:44323',
    'https://localhost:*',
    'https://localhost',
    'http://127.0.0.1:8080',
    'HTTPS://Example.COM',
    // Fixtures the rest of the suite relies on.
    'https://0.example.com',
    'https://subdomain-1.example-customer-domain.com',
    // Real allow-list entries from the PaaS table.
    'https://example.com/Test@test',
    'https://example.com/xyZxYzabcDEFghij-eu1/zaius-min.js',
    'https://abc1d23456de7f890g12-h34ijklm567nop890qr12stu3v4567wx.ssl.cf5.rackcdn.com/1234/v4.3.2iframeResizer.min.js',
    // Padding is trimmed rather than rejected, so a hand-edited export restores.
    ' https://example.com '
  ])('accepts the source %j', (source) => {
    expect(isValidCspSource(source)).toBe(true);
  });

  it.each([
    '',
    '   ',
    // Keywords are matched exactly: `'NONE'` would not trigger the engine's
    // `'none'` override but would still be emitted, showing a blocked directive
    // that is in fact wide open.
    'self',
    "'self",
    "'SELF'",
    "'NONE'",
    "'selff'",
    'blob',
    'notascheme:',
    'HTTPS:',
    'example-com',
    'https://example',
    '//example.com',
    'https://',
    'localhost',
    // A wildcard cannot stand alone or cover a whole TLD. PaaS accepts `*` and
    // `https://*`; both allow-list the entire web.
    '*',
    'https://*',
    'https://*.com',
    'https://www.*.com',
    'https://localhost:123*',
    'https://example.com:',
    'https://example.com:99999999',
    // CSP's host-source grammar has no query or fragment.
    'https://example.com?q=1',
    'https://example.com/p?q=1',
    'https://example.com/#f',
    'https://www.£$.com',
    // Only http, https, ws and wss carry a host. PaaS accepts any scheme.
    'ftp://example.com',
    'javascript:alert(1)',
    'chrome-extension://abcdefghijklmnop',
    // `;` separates directives and `,` separates policies, so either one inside
    // a source injects into the emitted policy.
    'https://example.com/a;script-src *',
    'https://example.com/a,default-src *',
    'https://ex ample.com',
    'https://user:pw@example.com',
    'https://x.com\r\nX-Evil: 1'
  ])('rejects the source %j', (source) => {
    expect(isValidCspSource(source)).toBe(false);
  });

  // Host names are case-insensitive and the engine lower-cases on the way out.
  it('accepts a host source whatever its case', () => {
    expect(isValidCspSource('HTTPS://Example.COM')).toBe(true);
  });

  /**
   * The two rules diverge on purpose — a CSP source may omit its scheme, carry a
   * path, name `localhost` or wildcard its port, and a Permissions Policy origin
   * may do none of those. On the ground they share, they must still agree, or the
   * same host typed into two fields of one product gets two answers.
   */
  it.each([
    'https://www.example.com',
    'https://*.example.com',
    'https://example.com:8080',
    'http://*.com',
    'http://www.*.com',
    'https://www.example.com:',
    'ftp://www.example.com'
  ])('agrees with the Permissions Policy origin rule on %j', (origin) => {
    expect(isValidCspSource(origin)).toBe(isValidPermissionPolicyOrigin(origin));
  });
});
