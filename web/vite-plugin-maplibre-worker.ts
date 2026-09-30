import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);

/**
 * maplibre-gl v6 ships its GeoJSON/vector-tile Web Worker as
 * `maplibre-gl-worker.mjs` (and a `-dev.mjs` variant for unminified builds),
 * which itself does a RELATIVE ES-module import of a sibling
 * `maplibre-gl-shared.mjs` — the code the main thread and the worker share.
 * maplibre-gl's own runtime auto-detects the worker's URL as
 * `new URL('./maplibre-gl-worker.mjs', import.meta.url)`, relative to
 * wherever its OWN bundled chunk ends up at runtime — i.e. it assumes the
 * worker (and its sibling) sit right next to the main bundle, exactly as
 * they do inside the npm package's own `dist/` folder.
 *
 * Vite has no static way to see that assumption: it's a runtime string URL
 * built deep inside a pre-bundled dependency, not a source-level import
 * Vite's analyzer can trace, so neither file is ever emitted as a build
 * output on its own — only folded into the main chunk's own bundled code.
 * The result (#1533 coordinator finding, reproduced live in a real, headed
 * browser under `vite preview`): the worker request either 404s or — behind
 * `vite preview`'s SPA history fallback — is silently served the
 * `index.html` shell with a 200 status, which the browser then refuses to
 * parse as a module; the worker's own `error` event fires with no message
 * (a module-parse failure on a non-JS response body has no useful details to
 * report). maplibre-gl's GeoJSON pipeline runs entirely through this worker,
 * so a GeoJSON source's `isSourceLoaded()` never turns true and its layer
 * never paints a single point — with no error ever reaching the main
 * thread's console, since a `postMessage` into an already-dead worker is a
 * silent no-op.
 *
 * Fixed by serving these files ourselves, at the exact unhashed path
 * maplibre-gl's own auto-detection expects, in both dev and build — read
 * straight from the installed package on every request/build (never a
 * checked-in copy), so a `maplibre-gl` version bump can never leave a stale
 * worker file behind.
 */

const WORKER_FILE_NAMES = [
  'maplibre-gl-worker.mjs',
  'maplibre-gl-worker-dev.mjs',
  'maplibre-gl-shared.mjs',
  'maplibre-gl-shared-dev.mjs',
] as const;

function maplibreDistDir(): string {
  // `require.resolve` (not `import.meta.resolve`) so this keeps working
  // regardless of how vite's own config/plugin loader executes this file —
  // it only resolves a path, never actually loads the ESM-only package.
  const entry = require.resolve('maplibre-gl/dist/maplibre-gl.mjs');
  return dirname(entry);
}

function readWorkerFiles(): Map<string, Buffer> {
  const dir = maplibreDistDir();
  const files = new Map<string, Buffer>();
  for (const name of WORKER_FILE_NAMES) {
    const path = join(dir, name);
    if (existsSync(path)) files.set(name, readFileSync(path));
  }
  return files;
}

export function maplibreWorkerPlugin(): Plugin {
  return {
    name: 'maplibre-worker-passthrough',
    // Build: emit each file at `assets/<name>` unhashed, matching the exact
    // relative URL maplibre-gl's own runtime constructs next to its main
    // bundled chunk.
    generateBundle() {
      for (const [name, source] of readWorkerFiles()) {
        this.emitFile({ type: 'asset', fileName: `assets/${name}`, source });
      }
    },
    // Dev server: serve the same files at the same path. Registered directly
    // (not returned) so it runs ahead of vite's internal middleware — there
    // is no real file at this path in the source tree to conflict with.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.startsWith('/assets/') ? req.url.slice('/assets/'.length) : undefined;
        const file = name && (WORKER_FILE_NAMES as readonly string[]).includes(name)
          ? readWorkerFiles().get(name)
          : undefined;
        if (!file) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'text/javascript');
        res.end(file);
      });
    },
  };
}
