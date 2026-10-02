// Exercises maplibreWorkerPlugin's hooks directly (no real Vite server/build),
// the same way vite-plugin-brand.test.ts exercises brandPlugin — reading the
// real files off the installed maplibre-gl package, never a fixture, since
// the whole point of this plugin is to never drift from whatever version is
// actually installed.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { maplibreWorkerPlugin } from './vite-plugin-maplibre-worker';

const require = createRequire(import.meta.url);
const maplibreDistDir = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));

interface EmittedAsset {
  type: string;
  fileName: string;
  source: Buffer;
}

function emitFileFromGenerateBundle(plugin: Plugin): EmittedAsset[] {
  const hook = plugin.generateBundle;
  if (!hook) throw new Error('plugin declares no generateBundle hook');
  const fn = typeof hook === 'function' ? hook : hook.handler;
  const emitted: EmittedAsset[] = [];
  const context = { emitFile: (asset: EmittedAsset) => emitted.push(asset) };
  fn.call(context as never, {} as never, {} as never, false);
  return emitted;
}

interface FakeServer {
  server: ViteDevServer;
  middleware: (
    req: { url?: string },
    res: { setHeader: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
    next: ReturnType<typeof vi.fn>,
  ) => void;
}

function makeFakeServer(): FakeServer {
  let middleware: FakeServer['middleware'] = () => undefined;
  const server = {
    middlewares: { use: (fn: FakeServer['middleware']) => (middleware = fn) },
  } as unknown as ViteDevServer;
  return { server, middleware: (...args) => middleware(...args) };
}

describe('maplibreWorkerPlugin', () => {
  it('emits maplibre-gl-worker.mjs and its maplibre-gl-shared.mjs sibling at the unhashed assets/ path maplibre-gl auto-detects', () => {
    const emitted = emitFileFromGenerateBundle(maplibreWorkerPlugin());

    const byName = new Map(emitted.map((asset) => [asset.fileName, asset]));
    expect(byName.get('assets/maplibre-gl-worker.mjs')?.type).toBe('asset');
    expect(byName.get('assets/maplibre-gl-worker.mjs')?.source.toString('utf8')).toBe(
      readFileSync(join(maplibreDistDir, 'maplibre-gl-worker.mjs'), 'utf8'),
    );
    expect(byName.get('assets/maplibre-gl-shared.mjs')?.source.toString('utf8')).toBe(
      readFileSync(join(maplibreDistDir, 'maplibre-gl-shared.mjs'), 'utf8'),
    );
  });

  it('also emits the -dev.mjs pair used by an unminified build, when the installed package ships one', () => {
    const emitted = emitFileFromGenerateBundle(maplibreWorkerPlugin());
    const names = emitted.map((asset) => asset.fileName);

    if (existsSync(join(maplibreDistDir, 'maplibre-gl-worker-dev.mjs'))) {
      expect(names).toContain('assets/maplibre-gl-worker-dev.mjs');
    }
    if (existsSync(join(maplibreDistDir, 'maplibre-gl-shared-dev.mjs'))) {
      expect(names).toContain('assets/maplibre-gl-shared-dev.mjs');
    }
  });

  it('dev: serves the worker file at the exact path maplibre-gl requests it from, with a JS content type', () => {
    const plugin = maplibreWorkerPlugin();
    const { server, middleware } = makeFakeServer();
    plugin.configureServer?.(server);

    const res = { setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    middleware({ url: '/assets/maplibre-gl-worker.mjs' }, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/javascript');
    expect(res.end).toHaveBeenCalledWith(readFileSync(join(maplibreDistDir, 'maplibre-gl-worker.mjs')));
    expect(next).not.toHaveBeenCalled();
  });

  it('dev: serves the shared sibling the worker itself imports', () => {
    const plugin = maplibreWorkerPlugin();
    const { server, middleware } = makeFakeServer();
    plugin.configureServer?.(server);

    const res = { setHeader: vi.fn(), end: vi.fn() };
    middleware({ url: '/assets/maplibre-gl-shared.mjs' }, res, vi.fn());

    expect(res.end).toHaveBeenCalledWith(readFileSync(join(maplibreDistDir, 'maplibre-gl-shared.mjs')));
  });

  it('dev: serves optimized-dependency worker URLs beside Vite’s prebundled maplibre entry', () => {
    const plugin = maplibreWorkerPlugin();
    const { server, middleware } = makeFakeServer();
    plugin.configureServer?.(server);

    const res = { setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    middleware({ url: '/node_modules/.vite/deps/maplibre-gl-worker.mjs?v=optimized' }, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/javascript');
    expect(res.end).toHaveBeenCalledWith(readFileSync(join(maplibreDistDir, 'maplibre-gl-worker.mjs')));
    expect(next).not.toHaveBeenCalled();
  });

  it('dev: serves the optimized worker’s shared sibling at the matching URL', () => {
    const plugin = maplibreWorkerPlugin();
    const { server, middleware } = makeFakeServer();
    plugin.configureServer?.(server);

    const res = { setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    middleware(
      { url: '/node_modules/.vite/deps/maplibre-gl-shared.mjs?v=optimized' },
      res,
      next,
    );

    expect(res.end).toHaveBeenCalledWith(readFileSync(join(maplibreDistDir, 'maplibre-gl-shared.mjs')));
    expect(next).not.toHaveBeenCalled();
  });

  it('dev: falls through to the next middleware for any other asset path', () => {
    const plugin = maplibreWorkerPlugin();
    const { server, middleware } = makeFakeServer();
    plugin.configureServer?.(server);

    const res = { setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    middleware({ url: '/assets/index-abc123.js' }, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();
  });
});
