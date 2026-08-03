import { readFileSync, existsSync } from 'node:fs';
import { extname, resolve, dirname } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Build-time brand injection.
 *
 * Resolves the virtual module `@brand` to the selected brand profile, chosen
 * via the `GACT_BRAND` env var (default `gact`). The profile lives at
 * `apps/branding/<profile>/brand.json`; optional logo paths are read and
 * inlined so the app never has to fetch an asset at runtime.
 *
 * The exposed `brand` object is fully resolved (defaults applied), so the app
 * can read `brand.name`, `brand.wordmark`, `brand.markGlyph`, `brand.accent`,
 * `brand.themeTokens`, `brand.logoSvg`, `brand.logoImage` without any
 * optional-field juggling.
 */

const VIRTUAL_ID = '@brand';
const RESOLVED_ID = '\0@brand';

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
  starterPrompts?: Array<{
    eyebrow?: string;
    label?: string;
  }>;
  sessionSemantics?: {
    blueprintLabel?: string;
    showExpertPackPicker?: boolean;
    blueprintDisplayNames?: Record<string, string>;
  };
  backendRepository?: {
    label?: string;
    url?: string;
    detail?: string;
  } | null;
  releaseUrl?: string;
  backend?: RawBackend;
}

/** Raw `backend` block — the managed-vs-connect descriptor shared with the
 *  desktop supervisor (apps/desktop/scripts/gen-brand-backend.mjs). */
interface RawBackend {
  mode?: 'managed' | 'connect';
  sidecarName?: string;
  attachPort?: number;
  attachPortEnv?: string;
  attachUrlEnv?: string;
  repoLabel?: string | null;
  install?: {
    ref?: string;
    refEnv?: string;
    forceEnv?: string;
    windowsUrl?: string;
    unixUrl?: string;
    repoLabel?: string;
  } | null;
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
  starterPrompts: Array<{
    eyebrow: string;
    label: string;
  }>;
  sessionSemantics: {
    blueprintLabel: string;
    showExpertPackPicker: boolean;
    blueprintDisplayNames: Record<string, string>;
  };
  backendRepository: {
    label: string;
    url: string;
    detail: string;
  } | null;
  releaseUrl: string | null;
  /** Managed-vs-connect backend descriptor — the SAME resolved shape the
   *  desktop gen-script embeds, so web and desktop read one brand document. */
  backend: ResolvedBackend;
  /** Inlined SVG source, or null when the profile has no logoSvg. */
  logoSvg: string | null;
  /** Inlined bitmap/vector data URL, or null when the profile has no logoImage. */
  logoImage: string | null;
}

export interface ResolvedBackend {
  mode: 'managed' | 'connect';
  sidecarName: string;
  attachPort: number;
  attachPortEnv: string;
  attachUrlEnv: string;
  repoLabel: string | null;
  install: {
    ref: string;
    refEnv: string;
    forceEnv: string;
    windowsUrl: string;
    unixUrl: string;
    repoLabel: string;
  } | null;
}

/**
 * Default backend block — the neutral connect default. Kept literally in sync
 * with `apps/desktop/scripts/gen-brand-backend.mjs` so web and the desktop
 * supervisor resolve the SAME brand document identically.
 */
const DEFAULT_BACKEND: ResolvedBackend = {
  mode: 'connect',
  sidecarName: '',
  attachPort: 17800,
  attachPortEnv: 'GACT_PORT',
  attachUrlEnv: 'GACT_URL',
  repoLabel: null,
  install: null,
};

function resolveBackend(raw: RawBackend | undefined): ResolvedBackend {
  if (!raw) return DEFAULT_BACKEND;
  let install: ResolvedBackend['install'];
  if (raw.install === null) {
    install = null;
  } else if (raw.install === undefined) {
    install = DEFAULT_BACKEND.install;
  } else {
    install = {
      ref: raw.install.ref ?? 'main',
      refEnv: raw.install.refEnv ?? 'GACT_REF',
      forceEnv: raw.install.forceEnv ?? 'GACT_FORCE',
      windowsUrl: raw.install.windowsUrl ?? '',
      unixUrl: raw.install.unixUrl ?? '',
      repoLabel: raw.install.repoLabel ?? 'the configured backend',
    };
  }
  return {
    mode: raw.mode ?? DEFAULT_BACKEND.mode,
    sidecarName: raw.sidecarName ?? DEFAULT_BACKEND.sidecarName,
    attachPort: raw.attachPort ?? DEFAULT_BACKEND.attachPort,
    attachPortEnv: raw.attachPortEnv ?? DEFAULT_BACKEND.attachPortEnv,
    attachUrlEnv: raw.attachUrlEnv ?? DEFAULT_BACKEND.attachUrlEnv,
    repoLabel: raw.repoLabel ?? null,
    install,
  };
}

/** Default accent when a profile omits one — the design-system default. */
const DEFAULT_ACCENT: string | null = null;

const DEFAULT_STARTER_PROMPTS: ResolvedBrand['starterPrompts'] = [
  {
    eyebrow: 'Inspect',
    label: 'Show me the schema of data/sample.h5 and chart the largest 3 datasets.',
  },
  {
    eyebrow: 'Refactor',
    label: 'Find println calls in src/ and rewrite them to log.Info.',
  },
  {
    eyebrow: 'Explain',
    label: 'Walk me through the SSE event flow in this repo.',
  },
  {
    eyebrow: 'Plan',
    label: 'Draft a migration plan from CSV to Parquet for our pipeline.',
  },
];

export function loadBrand(brandingRoot: string, profile: string): ResolvedBrand {
  const dir = resolve(brandingRoot, profile);
  const jsonPath = resolve(dir, 'brand.json');
  if (!existsSync(jsonPath)) {
    throw new Error(
      `[brand] profile "${profile}" not found: ${jsonPath} does not exist. ` +
        `Set GACT_BRAND to a profile under ${brandingRoot}.`,
    );
  }
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as RawBrand;
  if (!raw.name || typeof raw.name !== 'string') {
    throw new Error(`[brand] profile "${profile}" is missing a string "name".`);
  }

  let logoSvg: string | null = null;
  if (raw.logoSvg) {
    const svgPath = resolve(dir, raw.logoSvg);
    if (!existsSync(svgPath)) {
      throw new Error(
        `[brand] profile "${profile}" references logoSvg "${raw.logoSvg}" ` +
          `but ${svgPath} does not exist.`,
      );
    }
    logoSvg = readFileSync(svgPath, 'utf8');
  }

  let logoImage: string | null = null;
  if (raw.logoImage) {
    const imagePath = resolve(dir, raw.logoImage);
    if (!existsSync(imagePath)) {
      throw new Error(
        `[brand] profile "${profile}" references logoImage "${raw.logoImage}" ` +
          `but ${imagePath} does not exist.`,
      );
    }
    logoImage = `data:${mimeTypeForLogo(imagePath)};base64,${readFileSync(imagePath).toString('base64')}`;
  }

  const themeTokens: Record<string, string> = { ...(raw.themeTokens ?? {}) };
  if (raw.accent && !themeTokens['--color-accent']) {
    themeTokens['--color-accent'] = raw.accent;
  }
  const starterPrompts = Array.isArray(raw.starterPrompts)
    ? raw.starterPrompts
        .map((prompt) => ({
          eyebrow: String(prompt.eyebrow ?? '').trim(),
          label: String(prompt.label ?? '').trim(),
        }))
        .filter((prompt) => prompt.eyebrow.length > 0 && prompt.label.length > 0)
    : [];
  const backendRepository =
    raw.backendRepository && raw.backendRepository.label && raw.backendRepository.url
      ? {
          label: String(raw.backendRepository.label).trim(),
          url: String(raw.backendRepository.url).trim(),
          detail: String(raw.backendRepository.detail ?? 'backend').trim(),
        }
      : null;
  const releaseUrl =
    typeof raw.releaseUrl === 'string' && raw.releaseUrl.trim()
      ? raw.releaseUrl.trim()
      : backendRepository
        ? `${backendRepository.url.replace(/\/+$/, '')}/releases`
        : null;

  return {
    name: raw.name,
    wordmark: raw.wordmark ?? raw.name,
    tagline: raw.tagline ?? '',
    taglineAccent: raw.taglineAccent ?? '',
    homeUrl: raw.homeUrl ?? null,
    taglineAccentUrl: raw.taglineAccentUrl ?? null,
    markGlyph: raw.markGlyph ?? raw.name.charAt(0).toUpperCase(),
    accent: raw.accent ?? DEFAULT_ACCENT,
    themeTokens,
    starterPrompts: starterPrompts.length > 0 ? starterPrompts : DEFAULT_STARTER_PROMPTS,
    sessionSemantics: {
      blueprintLabel:
        typeof raw.sessionSemantics?.blueprintLabel === 'string' &&
        raw.sessionSemantics.blueprintLabel.trim()
          ? raw.sessionSemantics.blueprintLabel.trim()
          : 'Agent blueprint',
      showExpertPackPicker: raw.sessionSemantics?.showExpertPackPicker ?? true,
      blueprintDisplayNames: normalizeDisplayNames(raw.sessionSemantics?.blueprintDisplayNames),
    },
    backendRepository,
    releaseUrl,
    backend: resolveBackend(raw.backend),
    logoSvg,
    logoImage,
  };
}

function normalizeDisplayNames(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const displayNames: Record<string, string> = {};
  for (const [key, label] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.trim();
    const normalizedLabel = typeof label === 'string' ? label.trim() : '';
    if (normalizedKey && normalizedLabel) displayNames[normalizedKey] = normalizedLabel;
  }
  return displayNames;
}

function mimeTypeForLogo(path: string): string {
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

export function brandPlugin(brandingRoot: string, profile: string): Plugin {
  let resolved: ResolvedBrand | null = null;
  const jsonPath = resolve(brandingRoot, profile, 'brand.json');

  function get(): ResolvedBrand {
    if (!resolved) resolved = loadBrand(brandingRoot, profile);
    return resolved;
  }

  return {
    name: 'gact-brand',
    enforce: 'pre',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const b = get();
      // Emit a typed module so the app imports a real `brand` object.
      return `export const brand = ${JSON.stringify(b)};\n` + `export default brand;\n`;
    },
    config() {
      const b = get();
      // Expose the profile id for any define-style consumers (e.g. tests).
      return {
        define: {
          __GACT_BRAND__: JSON.stringify(profile),
        },
      };
    },
    configureServer(server) {
      // Hot-invalidate the virtual module when the profile JSON changes in dev.
      server.watcher.add(jsonPath);
      server.watcher.on('change', (file) => {
        if (
          resolve(file) === jsonPath ||
          dirname(resolve(file)) === resolve(brandingRoot, profile)
        ) {
          resolved = null;
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) server.reloadModule(mod);
        }
      });
    },
  };
}
