// Exercises brandPlugin's hooks directly (no real Vite server/build), the
// same way desktop/tests/tauri-brand.test.mjs exercises run-tauri-branded.mjs's
// pure functions — every fixture is a real temporary branding root + brand.json
// on disk, consistent with loadBrand's "config file, never an in-memory
// object" contract.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { HtmlTagDescriptor, IndexHtmlTransformContext, Plugin, ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { brandPlugin, loadBrand } from './vite-plugin-brand';

const GACT_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>';

const tmpRoots: string[] = [];
afterEach(() => {
  for (const root of tmpRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A real temporary branding root with one profile, mirroring branding/gact/. */
function makeBrandingRoot(
  profile: string,
  brand: Record<string, unknown>,
  assets: Record<string, string> = {},
): string {
  const root = mkdtempSync(resolve(tmpdir(), 'gact-tui-brand-plugin-'));
  tmpRoots.push(root);
  const profileDir = resolve(root, profile);
  mkdirSync(profileDir, { recursive: true });
  for (const [name, content] of Object.entries(assets)) {
    writeFileSync(resolve(profileDir, name), content);
  }
  writeFileSync(resolve(profileDir, 'brand.json'), `${JSON.stringify(brand, null, 2)}\n`);
  return root;
}

function transformIndexHtml(plugin: Plugin): HtmlTagDescriptor[] {
  const hook = plugin.transformIndexHtml;
  if (!hook) throw new Error('plugin declares no transformIndexHtml hook');
  const fn = typeof hook === 'function' ? hook : hook.handler;
  const result = fn.call(
    {} as never,
    '<html><head></head><body></body></html>',
    {} as IndexHtmlTransformContext,
  );
  return result as HtmlTagDescriptor[];
}

interface EmittedAsset {
  type: string;
  fileName: string;
  source: string;
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
  middleware: (req: { url?: string }, res: { setHeader: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }, next: ReturnType<typeof vi.fn>) => void;
}

function makeFakeServer(): FakeServer {
  let middleware: FakeServer['middleware'] = () => undefined;
  const server = {
    watcher: { add: vi.fn(), on: vi.fn() },
    middlewares: { use: (fn: FakeServer['middleware']) => (middleware = fn) },
  } as unknown as ViteDevServer;
  return {
    server,
    middleware: (...args) => middleware(...args),
  };
}

describe('brandPlugin', () => {
  it('index_html_title_and_favicon_come_from_brand: transformIndexHtml injects the brand name and its own favicon', () => {
    const root = makeBrandingRoot(
      'acme',
      { name: 'Acme Desktop', logoSvg: 'logo.svg' },
      { 'logo.svg': GACT_LOGO_SVG },
    );
    const plugin = brandPlugin(root, 'acme');

    const tags = transformIndexHtml(plugin);

    expect(tags).toContainEqual({ tag: 'title', children: 'Acme Desktop', injectTo: 'head' });
    expect(tags).toContainEqual({
      tag: 'link',
      attrs: { rel: 'icon', type: 'image/svg+xml', href: '/brand-favicon.svg' },
      injectTo: 'head',
    });
  });

  it('falls back to the tracked neutral favicon.svg when the brand declares no logoSvg', () => {
    const root = makeBrandingRoot('bare', { name: 'Bare Brand' });
    const plugin = brandPlugin(root, 'bare');

    const tags = transformIndexHtml(plugin);

    expect(tags).toContainEqual({
      tag: 'link',
      attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      injectTo: 'head',
    });
  });

  it('generateBundle emits brand-favicon.svg from the brand logo at build time', () => {
    const root = makeBrandingRoot(
      'acme',
      { name: 'Acme Desktop', logoSvg: 'logo.svg' },
      { 'logo.svg': GACT_LOGO_SVG },
    );
    const plugin = brandPlugin(root, 'acme');

    const emitted = emitFileFromGenerateBundle(plugin);

    expect(emitted).toEqual([
      { type: 'asset', fileName: 'brand-favicon.svg', source: GACT_LOGO_SVG },
    ]);
  });

  it('generateBundle emits nothing when the brand declares no logoSvg — the neutral favicon.svg is already static', () => {
    const root = makeBrandingRoot('bare', { name: 'Bare Brand' });
    const plugin = brandPlugin(root, 'bare');

    expect(emitFileFromGenerateBundle(plugin)).toEqual([]);
  });

  it('dev: serves the same favicon at /brand-favicon.svg that transformIndexHtml links to', () => {
    const root = makeBrandingRoot(
      'acme',
      { name: 'Acme Desktop', logoSvg: 'logo.svg' },
      { 'logo.svg': GACT_LOGO_SVG },
    );
    const plugin = brandPlugin(root, 'acme');
    const { server, middleware } = makeFakeServer();
    plugin.configureServer?.(server);

    const res = { setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    middleware({ url: '/brand-favicon.svg' }, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/svg+xml');
    expect(res.end).toHaveBeenCalledWith(GACT_LOGO_SVG);
    expect(next).not.toHaveBeenCalled();
  });

  it('dev: falls through to the next middleware for any other path or a brand with no logoSvg', () => {
    const root = makeBrandingRoot('bare', { name: 'Bare Brand' });
    const plugin = brandPlugin(root, 'bare');
    const { server, middleware } = makeFakeServer();
    plugin.configureServer?.(server);

    const res = { setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    middleware({ url: '/brand-favicon.svg' }, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.end).not.toHaveBeenCalled();

    const otherPathNext = vi.fn();
    middleware({ url: '/favicon.svg' }, res, otherPathNext);
    expect(otherPathNext).toHaveBeenCalledOnce();
  });
});

describe('loadBrand vocabulary fields', () => {
  it('defaults productName to "${name} Desktop", agentName to name, and workspaceNoun to "workspace"', () => {
    const root = makeBrandingRoot('acme', { name: 'Acme' });

    const brand = loadBrand(root, 'acme');

    expect(brand.productName).toBe('Acme Desktop');
    expect(brand.agentName).toBe('Acme');
    expect(brand.workspaceNoun).toBe('workspace');
  });

  it('honors an explicit override for each vocabulary field independently', () => {
    const root = makeBrandingRoot('acme', {
      name: 'Acme',
      productName: 'Acme Labs',
      agentName: 'Ace',
      workspaceNoun: 'project',
    });

    const brand = loadBrand(root, 'acme');

    expect(brand.productName).toBe('Acme Labs');
    expect(brand.agentName).toBe('Ace');
    expect(brand.workspaceNoun).toBe('project');
  });

  it('trims whitespace-only overrides back to the default, same as every other brand field', () => {
    const root = makeBrandingRoot('acme', {
      name: 'Acme',
      productName: '   ',
      agentName: '   ',
      workspaceNoun: '   ',
    });

    const brand = loadBrand(root, 'acme');

    expect(brand.productName).toBe('Acme Desktop');
    expect(brand.agentName).toBe('Acme');
    expect(brand.workspaceNoun).toBe('workspace');
  });
});
