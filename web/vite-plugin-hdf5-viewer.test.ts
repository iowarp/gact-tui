// Exercises hdf5ViewerPlugin's hooks directly against a fixture dist
// directory, the same way vite-plugin-maplibre-worker.test.ts does.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hdf5ViewerPlugin } from './vite-plugin-hdf5-viewer';

interface EmittedAsset {
  type: string;
  fileName: string;
  source: Buffer;
}

function generateBundle(plugin: Plugin) {
  const hook = plugin.generateBundle;
  if (!hook) throw new Error('plugin declares no generateBundle hook');
  const fn = typeof hook === 'function' ? hook : hook.handler;
  const emitted: EmittedAsset[] = [];
  const context = {
    emitFile: (asset: EmittedAsset) => emitted.push(asset),
    error: (message: string) => {
      throw new Error(message);
    },
  };
  fn.call(context as never, {} as never, {} as never, false);
  return emitted;
}

type Middleware = (
  req: { url?: string },
  res: { statusCode?: number; setHeader: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
  next: ReturnType<typeof vi.fn>,
) => void;

function devMiddleware(plugin: Plugin): Middleware {
  let middleware: Middleware = () => undefined;
  const server = {
    middlewares: { use: (fn: Middleware) => (middleware = fn) },
  } as unknown as ViteDevServer;
  const hook = plugin.configureServer;
  const fn = typeof hook === 'function' ? hook : hook?.handler;
  fn?.call({} as never, server);
  return middleware;
}

function request(middleware: Middleware, url: string) {
  const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
  const next = vi.fn();
  middleware({ url }, res, next);
  return { res, next };
}

describe('hdf5ViewerPlugin', () => {
  let dist: string;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'hdf5-viewer-dist-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>viewer</title>');
    writeFileSync(join(dist, 'assets', 'index-abc.js'), 'console.log(1)');
  });

  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  it('emits every viewer file under hdf5-viewer/', () => {
    const emitted = generateBundle(hdf5ViewerPlugin(dist));
    expect(emitted.map((asset) => asset.fileName).sort()).toEqual([
      'hdf5-viewer/assets/index-abc.js',
      'hdf5-viewer/index.html',
    ]);
    expect(emitted.every((asset) => asset.type === 'asset')).toBe(true);
  });

  it('fails the build when the viewer has not been built', () => {
    expect(() => generateBundle(hdf5ViewerPlugin(join(dist, 'missing')))).toThrow(
      'HDF5 viewer is not built',
    );
  });

  it('serves the viewer files in dev with a content type', () => {
    const middleware = devMiddleware(hdf5ViewerPlugin(dist));

    const page = request(middleware, '/hdf5-viewer/index.html?x=1');
    expect(page.res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(String(page.res.end.mock.calls[0]?.[0])).toContain('<title>viewer</title>');

    const script = request(middleware, '/hdf5-viewer/assets/index-abc.js');
    expect(script.res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/javascript');

    expect(request(middleware, '/hdf5-viewer/').res.end).toHaveBeenCalled();
  });

  it('passes other paths through and refuses to leave the dist directory', () => {
    const middleware = devMiddleware(hdf5ViewerPlugin(dist));
    expect(request(middleware, '/src/main.tsx').next).toHaveBeenCalled();

    const escape = request(middleware, '/hdf5-viewer/..%2F..%2Fetc%2Fpasswd');
    expect(escape.res.statusCode).toBe(404);
    expect(escape.next).not.toHaveBeenCalled();
  });
});
