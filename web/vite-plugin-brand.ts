import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { Plugin } from 'vite';

interface RawBrand {
  name: string;
  wordmark?: string;
  tagline?: string;
  taglineAccent?: string;
  homeUrl?: string;
  taglineAccentUrl?: string;
  markGlyph?: string;
  logoSvg?: string;
  logoImage?: string;
  accent?: string;
  themeTokens?: Record<string, string>;
  landing?: {
    eyebrow?: string;
    headline?: string;
    description?: string;
  };
  workspace?: {
    greeting?: string;
    description?: string;
  };
  starterPrompts?: Array<{
    eyebrow?: string;
    label?: string;
  }>;
}

export interface ResolvedBrand {
  name: string;
  wordmark: string;
  tagline: string;
  taglineAccent: string;
  homeUrl: string | null;
  taglineAccentUrl: string | null;
  markGlyph: string;
  accent: string | null;
  themeTokens: Record<string, string>;
  landing: {
    eyebrow: string;
    headline: string;
    description: string;
  };
  workspace: {
    greeting: string;
    description: string;
  };
  starterPrompts: Array<{
    eyebrow: string;
    label: string;
  }>;
  logoSvg: string | null;
  logoImage: string | null;
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function readAsset(
  profileDirectory: string,
  path: string | undefined,
  inlineSvg: boolean,
): string | null {
  if (!path) return null;
  const absolutePath = resolve(profileDirectory, path);
  if (!existsSync(absolutePath)) {
    throw new Error(`[brand] referenced asset does not exist: ${absolutePath}`);
  }
  if (inlineSvg) return readFileSync(absolutePath, 'utf8');
  return `data:${mimeType(absolutePath)};base64,${readFileSync(absolutePath).toString('base64')}`;
}

export function loadBrand(brandingRoot: string, profile: string): ResolvedBrand {
  const profileDirectory = resolve(brandingRoot, profile);
  const brandPath = resolve(profileDirectory, 'brand.json');
  if (!existsSync(brandPath)) throw new Error(`[brand] profile not found: ${brandPath}`);
  const raw = JSON.parse(readFileSync(brandPath, 'utf8')) as RawBrand;
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    throw new Error(`[brand] ${brandPath} requires a non-empty name`);
  }
  const name = raw.name.trim();
  return {
    name,
    wordmark: raw.wordmark?.trim() || name,
    tagline: raw.tagline?.trim() || '',
    taglineAccent: raw.taglineAccent?.trim() || '',
    homeUrl: raw.homeUrl?.trim() || null,
    taglineAccentUrl: raw.taglineAccentUrl?.trim() || null,
    markGlyph: raw.markGlyph?.trim().slice(0, 1) || name.slice(0, 1).toUpperCase(),
    accent: raw.accent?.trim() || null,
    themeTokens: { ...(raw.themeTokens ?? {}) },
    landing: {
      eyebrow: raw.landing?.eyebrow?.trim() || name,
      headline: raw.landing?.headline?.trim() || `Connect to ${name}`,
      description:
        raw.landing?.description?.trim() || raw.tagline?.trim() || 'Open your agent workspace.',
    },
    workspace: {
      greeting: raw.workspace?.greeting?.trim() || `What would you like to do with ${name}?`,
      description:
        raw.workspace?.description?.trim() ||
        'Start with a question, a workspace resource, or one of these examples.',
    },
    starterPrompts: (raw.starterPrompts ?? [])
      .map((prompt) => ({
        eyebrow: prompt.eyebrow?.trim() || '',
        label: prompt.label?.trim() || '',
      }))
      .filter((prompt) => prompt.label.length > 0),
    logoSvg: readAsset(profileDirectory, raw.logoSvg, true),
    logoImage: readAsset(profileDirectory, raw.logoImage, false),
  };
}

const VIRTUAL_ID = '@brand';
const RESOLVED_ID = '\0@brand';

export function brandPlugin(brandingRoot: string, profile: string): Plugin {
  let cached: ResolvedBrand | undefined;
  const getBrand = () => (cached ??= loadBrand(brandingRoot, profile));
  return {
    name: 'workspace-brand',
    enforce: 'pre',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      return id === RESOLVED_ID
        ? `export const brand = ${JSON.stringify(getBrand())}; export default brand;`
        : null;
    },
    configureServer(server) {
      const profileDirectory = resolve(brandingRoot, profile);
      server.watcher.add(profileDirectory);
      server.watcher.on('change', (path) => {
        if (!resolve(path).startsWith(profileDirectory)) return;
        cached = undefined;
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module) void server.reloadModule(module);
      });
    },
  };
}
