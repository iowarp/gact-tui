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
  iconSvg?: string;
  faviconSvg?: string;
  wordmarkImage?: string;
  accent?: string;
  /** Native product label, e.g. window/app/installer identity. Defaults to `${name} Desktop`. */
  productName?: string;
  /** What the running agent is called in first-person UI copy. Defaults to `name`. */
  agentName?: string;
  /** The noun for a project/session container, e.g. "workspace". Defaults to "workspace". */
  workspaceNoun?: string;
  /** Release index for the installed desktop product. */
  desktopReleaseUrl?: string;
  /** Release index for the connected agent service. */
  agentReleaseUrl?: string;
  /** Legacy shared release index; used as the default for both products. */
  releaseUrl?: string;
  themeTokens?: Record<string, string>;
  /** Where the agent's port is configured; see desktop/scripts/gen-brand-backend.mjs. */
  backend?: {
    portConfig?: { default?: number };
    attachPort?: number;
  };
  landing?: {
    eyebrow?: string;
    headline?: string;
    description?: string;
  };
  workspace?: {
    greeting?: string;
  };
  /**
   * Product copy in other interface languages, keyed by locale (`es`, `ja`).
   * Each entry may set any of the copy fields; the rest stay as above.
   */
  locales?: Record<string, BrandCopy>;
}

/** The brand fields that are words a person reads, which may differ by language. */
export interface BrandCopy {
  tagline?: string;
  taglineAccent?: string;
  agentName?: string;
  workspaceNoun?: string;
  landing?: { eyebrow?: string; headline?: string; description?: string };
  workspace?: { greeting?: string };
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
  productName: string;
  agentName: string;
  workspaceNoun: string;
  desktopReleaseUrl: string | null;
  agentReleaseUrl: string | null;
  /** The agent's default port: the brand's `backend.portConfig.default`. */
  agentPort: number;
  themeTokens: Record<string, string>;
  landing: {
    eyebrow: string;
    headline: string;
    description: string;
  };
  workspace: {
    greeting: string;
  };
  /** Copy for other interface languages; applied by the `@brand` module at load. */
  locales: Record<string, BrandCopy>;
  logoSvg: string | null;
  logoImage: string | null;
  iconSvg: string | null;
  faviconSvg: string | null;
  wordmarkImage: string | null;
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

/** The agent port when a brand names none. Mirrors desktop/scripts/gen-brand-backend.mjs. */
const DEFAULT_AGENT_PORT = 17800;

/** The brand's default agent port, resolved like `resolvePortConfig` in gen-brand-backend.mjs. */
export function resolveAgentPort(backend: RawBrand['backend']): number {
  const port = Number(backend?.portConfig?.default ?? backend?.attachPort ?? DEFAULT_AGENT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[brand] backend.portConfig.default must be a TCP port, got ${port}`);
  }
  return port;
}

function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Keep only the copy fields a brand may translate, dropping empty values. */
export function resolveBrandLocales(
  locales: RawBrand['locales'],
  brandPath = 'brand.json',
): Record<string, BrandCopy> {
  if (locales === undefined) return {};
  if (!locales || typeof locales !== 'object' || Array.isArray(locales)) {
    throw new Error(`[brand] ${brandPath}: locales must map a locale to its copy`);
  }
  const resolved: Record<string, BrandCopy> = {};
  for (const [locale, copy] of Object.entries(locales)) {
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/u.test(locale)) {
      throw new Error(`[brand] ${brandPath}: locales.${locale} is not a language tag`);
    }
    const entry: BrandCopy = {};
    for (const key of ['tagline', 'taglineAccent', 'agentName', 'workspaceNoun'] as const) {
      const value = trimmed(copy?.[key]);
      if (value) entry[key] = value;
    }
    const landing = {
      eyebrow: trimmed(copy?.landing?.eyebrow),
      headline: trimmed(copy?.landing?.headline),
      description: trimmed(copy?.landing?.description),
    };
    if (Object.values(landing).some(Boolean)) {
      entry.landing = Object.fromEntries(Object.entries(landing).filter(([, value]) => value));
    }
    const greeting = trimmed(copy?.workspace?.greeting);
    if (greeting) entry.workspace = { greeting };
    resolved[locale] = entry;
  }
  return resolved;
}

/**
 * The `@brand` module source: the resolved brand with the active interface
 * language's copy laid over it. The language is active before any application
 * module loads (web/src/main.tsx), so every reader sees its own language.
 */
export function brandModuleSource(brand: ResolvedBrand, assets: readonly string[] = []): string {
  const { locales, ...base } = brand;
  return [
    `import { i18n } from '@/i18n/instance';`,
    `const base = ${JSON.stringify(base)};`,
    `const locales = ${JSON.stringify(locales)};`,
    `const copy = locales[i18n.locale] ?? {};`,
    `export const brand = {`,
    `  ...base,`,
    `  ...copy,`,
    `  landing: { ...base.landing, ...copy.landing },`,
    `  workspace: { ...base.workspace, ...copy.workspace },`,
    `};`,
    ...assets,
    `export default brand;`,
  ].join('\n');
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
    productName: raw.productName?.trim() || `${name} Desktop`,
    agentName: raw.agentName?.trim() || name,
    workspaceNoun: raw.workspaceNoun?.trim() || 'workspace',
    desktopReleaseUrl: raw.desktopReleaseUrl?.trim() || raw.releaseUrl?.trim() || null,
    agentReleaseUrl: raw.agentReleaseUrl?.trim() || raw.releaseUrl?.trim() || null,
    agentPort: resolveAgentPort(raw.backend),
    themeTokens: { ...(raw.themeTokens ?? {}) },
    landing: {
      eyebrow: raw.landing?.eyebrow?.trim() || name,
      headline: raw.landing?.headline?.trim() || `Connect to ${name}`,
      description:
        raw.landing?.description?.trim() || raw.tagline?.trim() || 'Open your agent workspace.',
    },
    workspace: {
      greeting: raw.workspace?.greeting?.trim() || 'What can I help you with?',
    },
    locales: resolveBrandLocales(raw.locales, brandPath),
    logoSvg: readAsset(profileDirectory, raw.logoSvg, true),
    logoImage: readAsset(profileDirectory, raw.logoImage, false),
    iconSvg: readAsset(profileDirectory, raw.iconSvg, true),
    faviconSvg: readAsset(profileDirectory, raw.faviconSvg ?? raw.logoSvg, true),
    wordmarkImage: readAsset(profileDirectory, raw.wordmarkImage, false),
  };
}

const VIRTUAL_ID = '@brand';
const RESOLVED_ID = '\0@brand';

/** The build-time-emitted / dev-served path for the brand's own favicon. */
const BRAND_FAVICON_PATH = '/brand-favicon.svg';
/** The tracked, product-neutral fallback shipped in web/public. */
const NEUTRAL_FAVICON_PATH = '/favicon.svg';
/** The theme ids a brand's accent and theme tokens restyle. */
export const BRANDED_THEMES = ['classic-light', 'classic-dark'] as const;

export function brandPlugin(brandingRoot: string, profile: string, inlineAssets = false): Plugin {
  let cached: ResolvedBrand | undefined;
  let production = false;
  const getBrand = () => (cached ??= loadBrand(brandingRoot, profile));
  return {
    name: 'workspace-brand',
    enforce: 'pre',
    configResolved(config) {
      production = config.command === 'build';
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const brand = { ...getBrand() };
      const assets: string[] = [];
      if (production && !inlineAssets) {
        for (const key of ['logoImage', 'wordmarkImage'] as const) {
          const value = brand[key];
          if (!value) continue;
          const comma = value.indexOf(',');
          const mime = value.slice(5, value.indexOf(';'));
          // SVG's MIME suffix is not a file extension; static hosts must serve image/svg+xml.
          const extension = mime === 'image/svg+xml' ? 'svg' : mime.split('/')[1];
          const ref = this.emitFile({
            type: 'asset',
            name: `brand-${key}.${extension}`,
            source: Buffer.from(value.slice(comma + 1), 'base64'),
          });
          brand[key] = null;
          assets.push(`brand.${key} = import.meta.ROLLUP_FILE_URL_${ref};`);
        }
      }
      return brandModuleSource(brand, assets);
    },
    // Brand-drives the document <title> and favicon so a reload never falls
    // back to the tracked-default HTML's own hardcoded values (previously
    // "web" / /favicon.svg — the ONLY favicon path at all, since nothing
    // patched it at runtime, so it survived every reload regardless of
    // brand). index.html carries neither a <title> nor a favicon <link> of
    // its own any more; both come from here, for both dev and build.
    transformIndexHtml() {
      const brand = getBrand();
      // A brand restyles only the Classic themes. Notebook (the `light` and
      // `dark` ids, in which the design spec is drawn) and Debug keep their own
      // values. `html:root` outranks the theme blocks in
      // web/src/theme/themes.css, and the rule is in place before first paint.
      const brandTokens = {
        ...brand.themeTokens,
        ...(brand.accent ? { '--action': brand.accent } : {}),
      };
      const declarations = Object.entries(brandTokens)
        .map(([token, value]) => `${token}: ${value};`)
        .join(' ');
      return [
        { tag: 'title', children: brand.name, injectTo: 'head' },
        ...(declarations
          ? [
              {
                tag: 'style',
                attrs: { 'data-brand-tokens': '' },
                children: `html:root:is(${BRANDED_THEMES.map((id) => `[data-theme='${id}']`).join(', ')}) { ${declarations} }`,
                injectTo: 'head' as const,
              },
            ]
          : []),
        {
          tag: 'link',
          attrs: {
            rel: 'icon',
            type: 'image/svg+xml',
            href: brand.faviconSvg ? BRAND_FAVICON_PATH : NEUTRAL_FAVICON_PATH,
          },
          injectTo: 'head',
        },
      ];
    },
    // Build: emit the brand's logo as the favicon asset transformIndexHtml
    // just linked to. Skipped when the brand declares no logoSvg — the HTML
    // already points at the neutral tracked favicon.svg instead, which vite
    // copies from public/ on its own.
    generateBundle() {
      const brand = getBrand();
      if (!brand.faviconSvg) return;
      this.emitFile({
        type: 'asset',
        fileName: BRAND_FAVICON_PATH.slice(1),
        source: brand.faviconSvg,
      });
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
      // Dev: serve the same favicon transformIndexHtml links to. Registered
      // directly (not returned) so it runs ahead of vite's internal static
      // middleware — there is no real file at this path to conflict with.
      server.middlewares.use((req, res, next) => {
        if (req.url !== BRAND_FAVICON_PATH) {
          next();
          return;
        }
        const brand = getBrand();
        if (!brand.faviconSvg) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'image/svg+xml');
        res.end(brand.faviconSvg);
      });
    },
  };
}
