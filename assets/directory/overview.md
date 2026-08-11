# Stott Security

Manage your site's Content Security Policy and HTTP response headers from inside
Optimizely CMS (SaaS), without redeploying your front end.

## What it does

- **Content Security Policy** — grant permissions to domains rather than hand-editing
  directives. Sources, sandbox settings, nonce and `strict-dynamic` support, and
  `upgrade-insecure-requests`.
- **Response headers** — the eight standard security headers with validated values,
  a dedicated HSTS editor, and any custom header you need. Headers can be added or
  actively removed.
- **Automatic header splitting** — large policies are split across multiple
  `Content-Security-Policy` headers to stay under CDN size limits, without losing
  granularity.
- **Draft and publish** — edits never affect your live site until you publish, so a
  mistaken policy cannot take a site down mid-edit.
- **Violation reporting** — point browsers at an external collector such as
  report-uri.com.

## How it works

Configuration is edited in the CMS and compiled when you publish. Your front end
fetches the compiled headers from a public endpoint and applies them in its own
middleware — so the policy is managed by editors in the CMS, while remaining under
your front end's control at request time.

Because your front end applies the headers, it also mints the per-request CSP nonce:
the published policy carries a placeholder that your middleware substitutes.

## Requirements

- Optimizely CMS (SaaS)
- A front end you control — the app publishes header configuration, it does not
  serve your site

## Related

This is the SaaS companion to
[Stott Security for Optimizely CMS 12/13](https://github.com/GeekInTheNorth/Stott.Security.Optimizely),
the NuGet addon for PaaS. The two are separate products: the PaaS addon additionally
covers CORS, Permissions-Policy, security.txt, violation report storage and a full
audit trail.
