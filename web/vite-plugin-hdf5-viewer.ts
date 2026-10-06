import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Serves the h5web viewer page built by `packages/hdf5-viewer` at
 * `/hdf5-viewer/`, beside the app on the same origin.
 *
 * The viewer is a separate build because h5web needs React 18 and this app is
 * React 19. Build: its files are emitted into this bundle under
 * `hdf5-viewer/`, so the desktop app ships them too. Dev server: they are read
 * from the package's `dist/` on each request, so rebuilding the viewer is
 * enough to pick up a change.
 */

export const HDF5_VIEWER_BASE = '/hdf5-viewer/';

// Resolved on use, not at import: under jsdom (tests) `import.meta.url` is not
// a file URL.
function defaultDist(): string {
  return fileURLToPath(new URL('../packages/hdf5-viewer/dist', import.meta.url));
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

export function hdf5ViewerPlugin(distDir: string = defaultDist()): Plugin {
  return {
    name: 'hdf5-viewer-page',
    generateBundle() {
      if (!existsSync(join(distDir, 'index.html'))) {
        this.error(
          `HDF5 viewer is not built (${distDir}). Run \`pnpm --filter @clio/hdf5-viewer build\`.`,
        );
      }
      for (const path of listFiles(distDir)) {
        const name = relative(distDir, path).split(sep).join('/');
        this.emitFile({
          type: 'asset',
          fileName: `${HDF5_VIEWER_BASE.slice(1)}${name}`,
          source: readFileSync(path),
        });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? '';
        if (!pathname.startsWith(HDF5_VIEWER_BASE)) {
          next();
          return;
        }
        const name = decodeURIComponent(pathname.slice(HDF5_VIEWER_BASE.length)) || 'index.html';
        const path = join(distDir, name);
        if (relative(distDir, path).startsWith('..') || !existsSync(path) || !statSync(path).isFile()) {
          res.statusCode = 404;
          res.end(
            existsSync(distDir)
              ? 'Not found'
              : 'HDF5 viewer is not built. Run `pnpm --filter @clio/hdf5-viewer build`.',
          );
          return;
        }
        res.setHeader('Content-Type', CONTENT_TYPES[extname(path)] ?? 'application/octet-stream');
        res.end(readFileSync(path));
      });
    },
  };
}
