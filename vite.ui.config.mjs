import {existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// REQUIRED: EXTENSIONS_ROOT is the directory name (`cms-ui-extensions`) the
// SDK validator and the bundle-promotion step both look for under dist/.
// UI_EXTENSION_INJECTION_POINTS drives the entry-file regex below so we
// don't re-declare which surfaces are valid.
import {EXTENSIONS_ROOT, UI_EXTENSION_INJECTION_POINTS} from '@optimizely/ocp-cms-ui-extensions-sdk';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

const cwd = path.dirname(fileURLToPath(import.meta.url));

/**
 * Drops non-Latin font subsets from Axiom's bundled web fonts.
 *
 * Every Axiom component imports `Box`, which has a side-effect
 * `import "@optiaxiom/globals/fonts"` pulling in three variable families
 * (Roboto, Roboto Condensed, Roboto Mono) across 22 `@font-face` blocks — one
 * per unicode subset. Combined with `assetsInlineLimit` below, which inlines
 * every woff2 as a data URI, all 22 land in the bundle as base64 — around
 * 705 kB, over half of it. Because woff2 is already compressed it barely gzips,
 * so it costs far more over the wire than its share of the raw size suggests.
 *
 * Keeping Latin and Latin-Extended and dropping Cyrillic, Greek, Vietnamese,
 * math and symbols roughly halves the gzipped bundle with no change to how the
 * console renders. The console's own text is English; the dropped subsets apply
 * only to glyphs inside a customer's own values, such as an internationalised
 * domain name, which fall back to the system font.
 *
 * The fonts cannot simply be dropped: the extension iframe receives no font CSS
 * from the CMS, so Axiom's stack would fall through to `system-ui`.
 *
 * Runs `pre` so it sees the fontsource CSS before Vite resolves the `url()`
 * references in it.
 */
function latinFontSubsetsOnly() {
  const KEEP = /unicode-range:[^;]*U\+0(000-00FF|100-02)/;

  return {
    name: 'latin-font-subsets-only',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@fontsource-variable') || !id.endsWith('.css')) return null;

      return {
        code: code.replace(/@font-face\s*\{[^}]*\}/g, (block) =>
          KEEP.test(block) ? block : ''
        ),
        map: null,
      };
    },
  };
}

// CONVENTION (not enforced by the SDK): keep UI sources under
// src/cms-ui-extensions/. Any layout works as long as discoverEntries()
// keys each input by basename and emits to UI_OUT_DIR.
const EXTENSIONS_SOURCE_ROOT = `src/${EXTENSIONS_ROOT}`;
const SHARED_ROOT = 'src/shared';
// REQUIRED: bundles MUST land in dist/cms-ui-extensions/. Bundle promotion
// expects this exact path.
const UI_OUT_DIR = `dist/${EXTENSIONS_ROOT}`;
// Pattern: <basename>.<injection-point>.<ts|tsx|js|jsx> — e.g.
// `sample.sidebar.tsx`. The injection-point list is the SDK's source of
// truth so this regex stays in sync as new surfaces are added.
const ENTRY_PATTERN = new RegExp(
  `\\.(${UI_EXTENSION_INJECTION_POINTS.join('|')})\\.(tsx?|jsx?)$`
);

// REQUIRED naming contract: input keys are `<basename>` so emitted bundles
// land at `<basename>.js` (via entryFileNames: '[name].js' below), matching
// the entry_point declared in app.yml. The SDK validator and bundle
// promotion both look for dist/cms-ui-extensions/<entry_point>.js.
function discoverEntries() {
  const absRoot = path.resolve(cwd, EXTENSIONS_SOURCE_ROOT);
  if (!existsSync(absRoot)) return {};

  const entries = {};
  const dirents = readdirSync(absRoot, {recursive: true, withFileTypes: true});
  for (const dirent of dirents) {
    if (!dirent.isFile() || !ENTRY_PATTERN.test(dirent.name)) continue;
    const basename = dirent.name.replace(ENTRY_PATTERN, '');
    const fullPath = path.join(dirent.parentPath, dirent.name);
    if (entries[basename]) {
      throw new Error(`Duplicate UI extension entry '${basename}': ${entries[basename]} and ${fullPath}`);
    }
    entries[basename] = fullPath;
  }
  return entries;
}

export default defineConfig({
  // REQUIRED for CDN-served bundles: assets get URLs relative to the bundle
  // file itself, e.g. `new URL('./assets/foo-<hash>.svg', import.meta.url).href`,
  // so each bundle resolves them against whatever CDN host it's served from.
  // `base` alone doesn't achieve this in JS bundles — renderBuiltUrl
  // (officially supported, namespaced as experimental) forces relative URLs.
  base: './',
  // REQUIRED for React extensions:
  // - react() enables JSX/TSX transform and Fast Refresh in dev.
  // - cssInjectedByJsPlugin folds emitted CSS (e.g. Optiaxiom's styles) into
  //   the JS bundle and injects it at runtime, so a single <script type="module">
  //   is fully self-contained — no separate .css request that would 404 when
  //   served from the CDN inside the CMS iframe. relativeCSSInjection keeps the
  //   injection scoped per-entry when multiple bundles load on one page.
  plugins: [
    latinFontSubsetsOnly(),
    react(),
    cssInjectedByJsPlugin({ relativeCSSInjection: true }),
  ],
  experimental: {
    renderBuiltUrl: () => ({ relative: true }),
  },
  resolve: {
    alias: {
      '@shared': path.resolve(cwd, SHARED_ROOT),
    },
  },
  build: {
    // REQUIRED: see UI_OUT_DIR above.
    outDir: path.resolve(cwd, UI_OUT_DIR),
    // REQUIRED when both vite builds (backend + UI) write into dist/.
    emptyOutDir: false,
    // OPTIONAL: sourcemaps make the CSS-in-JS bundle debuggable in the
    // browser. Safe to disable to shrink bundle size.
    sourcemap: true,
    // Inline web fonts as data URIs so the CSS-in-JS bundle is self-contained
    // when served inside the CMS iframe (relative font URLs would 404). Every
    // OTHER asset still lands as a hashed file under
    // dist/cms-ui-extensions/assets/ (see assetFileNames below), so the CDN
    // can serve them with long cache headers.
    assetsInlineLimit: (filePath) => /\.(woff2?|ttf|otf|eot)$/i.test(filePath),
    rollupOptions: {
      // REQUIRED: each declared entry must be its own self-contained bundle.
      preserveEntrySignatures: 'strict',
      input: discoverEntries(),
      // Needed external dependencies (e.g. React, Tiptap) are provided by the CMS host 
      // so they must not be bundled. The CMS host provides them as ESM modules, 
      // so the bundle format must be ES (see output.format below).
      external: [
        '@tiptap/extension-table-row',
        '@tiptap/extension-table-header',
        '@tiptap/extension-table-cell',
        '@tiptap/extension-table',
        '@tiptap/extension-link',
        '@tiptap/extension-placeholder',
        '@tiptap/react',
        '@tiptap/starter-kit',
      ],
      output: {
        // REQUIRED: the CMS host loads each bundle via
        // `<script type="module">`, so the format MUST be ES.
        format: 'es',
        // REQUIRED: emit `<basename>.js` so the file matches the entry_point
        // declared in app.yml.
        entryFileNames: '[name].js',
        // CONVENTION: namespace shared chunks under shared/. Path is free
        // choice.
        chunkFileNames: 'shared/[name]-[hash].js',
        // CONVENTION: namespace static assets under assets/ with content
        // hashes so the CDN can serve them with long cache headers.
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
