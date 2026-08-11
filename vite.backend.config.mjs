import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// REQUIRED: OCP_APP_CONFIG_BASENAMES is the canonical list of filenames the
// runtime accepts for `ocp-app.config.{mjs,cjs,js}`. We copy whichever exists
// into dist so Runtime.initialize can find it post-build.
import { OCP_APP_CONFIG_BASENAMES } from '@zaiusinc/app-sdk';
import { defineConfig } from 'vite';

const cwd = path.dirname(fileURLToPath(import.meta.url));

// CONVENTION: backend sources under src/backend/. Free choice as long as
// discoverEntries() picks them up and emits to OUT_DIR.
const BACKEND_ROOT = 'src/backend';
const SHARED_ROOT = 'src/shared';
// REQUIRED: backend artifacts MUST land in dist/. The runtime image copies
// /app/dist into the container; the runtime starts the app from /app/dist.
const OUT_DIR = 'dist';
const SOURCE_PATTERN = /\.(tsx?|jsx?)$/;
const SKIP_PATTERN = /\.(d\.ts|test\.tsx?|spec\.tsx?)$/;
const STATIC_ASSET_PATTERN = /\.(ya?ml|json)$/;

function discoverEntries() {
  const absRoot = path.resolve(cwd, BACKEND_ROOT);
  if (!existsSync(absRoot)) return {};

  const entries = {};
  const dirents = readdirSync(absRoot, {
    recursive: true,
    withFileTypes: true,
  });
  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;
    if (!SOURCE_PATTERN.test(dirent.name) || SKIP_PATTERN.test(dirent.name))
      continue;
    const fullPath = path.join(dirent.parentPath, dirent.name);
    const rel = path.relative(absRoot, fullPath).replace(SOURCE_PATTERN, '');
    entries[rel] = fullPath;
  }
  return entries;
}

// REQUIRED: Vite/Rollup only emit JS bundles. The OCP runtime additionally
// expects app.yml, ocp-app.config.*, and the top-level assets/ + forms/
// trees alongside the bundles in dist/. This plugin restores that file-copy
// behaviour so the runtime can boot.
function copyAppArtifactsPlugin() {
  return {
    name: 'copy-app-artifacts',
    apply: 'build',
    closeBundle() {
      const out = path.resolve(cwd, OUT_DIR);
      mkdirSync(out, { recursive: true });

      // REQUIRED: app.yml MUST sit at /app/dist/app.yml — Runtime.initialize
      // reads it from there.
      copyIfPresent(path.resolve(cwd, 'app.yml'), path.join(out, 'app.yml'));
      // REQUIRED: copy whichever ocp-app.config variant the user authored so
      // the SDK plugin (cmsUiExtensions()) is registered at runtime startup.
      for (const name of OCP_APP_CONFIG_BASENAMES) {
        if (copyIfPresent(path.resolve(cwd, name), path.join(out, name))) break;
      }

      // REQUIRED: backend-side YAML/JSON resources (e.g. dynamic schema
      // files referenced by destinations/sources) must travel with the
      // compiled JS. Skip tsconfig/package.json — those aren't runtime data.
      copyTreeFiltered(
        path.resolve(cwd, BACKEND_ROOT),
        out,
        (rel) =>
          STATIC_ASSET_PATTERN.test(rel) &&
          !/(^|\/)(tsconfig|package)\.json$/.test(rel),
      );

      // REQUIRED if you have an assets/ or forms/ directory: those are
      // app-yml-referenced resources the runtime expects under /app/dist.
      copyDirIfPresent(path.resolve(cwd, 'assets'), path.join(out, 'assets'));
      copyDirIfPresent(path.resolve(cwd, 'forms'), path.join(out, 'forms'));
    },
  };
}

function copyIfPresent(src, dest) {
  if (!existsSync(src)) return false;
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

function copyDirIfPresent(src, dest) {
  if (!existsSync(src) || !statSync(src).isDirectory()) return;
  cpSync(src, dest, { recursive: true });
}

function copyTreeFiltered(srcRoot, destRoot, predicate) {
  if (!existsSync(srcRoot)) return;
  const dirents = readdirSync(srcRoot, {
    recursive: true,
    withFileTypes: true,
  });
  for (const dirent of dirents) {
    if (!dirent.isFile()) continue;
    const fullPath = path.join(dirent.parentPath, dirent.name);
    const rel = path.relative(srcRoot, fullPath);
    if (!predicate(rel)) continue;
    const dest = path.join(destRoot, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(fullPath, dest);
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(cwd, SHARED_ROOT),
    },
  },
  build: {
    // REQUIRED: target must match the runtime image's Node version. The
    // node22-cms-ext runtime ships Node 22.
    target: 'node22',
    // REQUIRED: see OUT_DIR above.
    outDir: path.resolve(cwd, OUT_DIR),
    // REQUIRED: the UI build also writes into dist/. emptyOutDir:false stops
    // either build from wiping the other's output.
    emptyOutDir: false,
    // OPTIONAL: keep sourcemaps for backend debugging. Safe to disable to
    // shrink image size.
    sourcemap: true,
    // REQUIRED: this is a server build. ssr:true tells Vite to externalize
    // node_modules by default and skip browser-only transforms.
    ssr: true,
    rollupOptions: {
      input: discoverEntries(),
      // REQUIRED: bare specifiers (anything not starting with '.' or
      // absolute) are resolved by Node at runtime against the deployed
      // app's node_modules. Bundling them would inline whole packages and
      // break native modules.
      external: (id) => !id.startsWith('.') && !path.isAbsolute(id),
      output: {
        // REQUIRED: the runtime loads backend modules via Node's CommonJS
        // require(). ESM output would fail to load.
        format: 'cjs',
        // REQUIRED: emit `<rel-path-from-src/backend>.js` so the SDK can
        // import functions/jobs/destinations by the entry_point names
        // declared in app.yml.
        entryFileNames: '[name].js',
        // REQUIRED for CJS: use named exports. Matches how the runtime
        // dynamically requires `entry_point` classes.
        exports: 'named',
      },
    },
  },
  plugins: [copyAppArtifactsPlugin()],
});
