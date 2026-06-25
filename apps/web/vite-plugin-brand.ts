import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Build-time brand injection.
 *
 * Resolves the virtual module `@brand` to the selected brand profile. The
 * profile + branding root are chosen by a CONFIG FILE (never an env var):
 * `vite.config.ts` reads `apps/brand.config.json` (or an
 * `apps/brand.config.local.json` override) via the shared resolver
 * (`apps/branding/brand-config.mjs`) and passes the resolved `{profile,
 * brandingRoot}` to {@link brandPlugin} / {@link loadBrand}. The profile lives
 * at `<brandingRoot>/<profile>/brand.json`; an optional `logoSvg` path is read
 * and inlined as a string so the app never has to fetch an asset at runtime.
 *
 * The exposed `brand` object is fully resolved (defaults applied), so the app
 * can read `brand.name`, `brand.wordmark`, `brand.markGlyph`, `brand.accent`,
 * `brand.themeTokens`, `brand.logoSvg` without any optional-field juggling.
 */

const VIRTUAL_ID = '@brand';
const RESOLVED_ID = '\0@brand';

interface RawBrand {
  name: string;
  wordmark?: string;
  tagline?: string;
  markGlyph?: string;
  logoSvg?: string;
  accent?: string;
  themeTokens?: Record<string, string>;
  starterPrompts?: Array<{
    eyebrow?: string;
    label?: string;
  }>;
  backendRepository?: {
    label?: string;
    url?: string;
    detail?: string;
  } | null;
  backend?: RawBackend | null;
}

interface RawBackend {
  mode?: 'managed' | 'connect';
  sidecarName?: string;
  attachPort?: number;
  attachPortEnv?: string;
  attachUrlEnv?: string;
  repoLabel?: string;
  install?: {
    ref?: string;
    refEnv?: string;
    forceEnv?: string;
    windowsUrl?: string;
    unixUrl?: string;
    repoLabel?: string;
  } | null;
}

export interface ResolvedBackend {
  mode: 'managed' | 'connect';
  sidecarName: string;
  attachPort: number;
  attachPortEnv: string;
  attachUrlEnv: string;
  /** Top-level label for the connect / no-install hint; null otherwise. */
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

export interface ResolvedBrand {
  name: string;
  wordmark: string;
  tagline: string;
  markGlyph: string;
  accent: string | null;
  themeTokens: Record<string, string>;
  starterPrompts: Array<{
    eyebrow: string;
    label: string;
  }>;
  backendRepository: {
    label: string;
    url: string;
    detail: string;
  } | null;
  /** Resolved backend config (defaults applied); never absent. */
  backend: ResolvedBackend;
  /** Inlined SVG source, or null when the profile has no logoSvg. */
  logoSvg: string | null;
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

/**
 * Default backend block — the neutral connect default. Applied field-by-field
 * whenever a profile omits (parts of) its `backend` block. A brand with no
 * `backend` resolves to connect-mode with no installer: gact-tui makes NO
 * assumption about a managed agent. Projects that ship a managed backend supply
 * an explicit `backend` block in their own brand (selected via the config file).
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

/**
 * Resolve a raw `backend` block into a fully-defaulted {@link ResolvedBackend}.
 *
 * Mirrors the duplicated logic in `apps/desktop/scripts/gen-brand-backend.mjs`
 * (kept literally in sync). When `backend` is absent the neutral connect
 * default is returned (no installer, no managed assumption). An explicit
 * `install: null` yields a connect-mode brand with no installer; an absent
 * `install` inherits the default (which is `null` for the neutral default).
 */
function resolveBackend(raw: RawBrand): ResolvedBackend {
  const b = raw.backend;
  if (!b) return DEFAULT_BACKEND;

  let install: ResolvedBackend['install'];
  if (b.install === null) {
    install = null;
  } else if (b.install === undefined) {
    install = DEFAULT_BACKEND.install;
  } else {
    const di = DEFAULT_BACKEND.install!;
    install = {
      ref: b.install.ref ?? di.ref,
      refEnv: b.install.refEnv ?? di.refEnv,
      forceEnv: b.install.forceEnv ?? di.forceEnv,
      windowsUrl: b.install.windowsUrl ?? di.windowsUrl,
      unixUrl: b.install.unixUrl ?? di.unixUrl,
      repoLabel: b.install.repoLabel ?? di.repoLabel,
    };
  }

  return {
    mode: b.mode ?? DEFAULT_BACKEND.mode,
    sidecarName: b.sidecarName ?? DEFAULT_BACKEND.sidecarName,
    attachPort: b.attachPort ?? DEFAULT_BACKEND.attachPort,
    attachPortEnv: b.attachPortEnv ?? DEFAULT_BACKEND.attachPortEnv,
    attachUrlEnv: b.attachUrlEnv ?? DEFAULT_BACKEND.attachUrlEnv,
    repoLabel: b.repoLabel ?? null,
    install,
  };
}

export function loadBrand(brandingRoot: string, profile: string): ResolvedBrand {
  const dir = resolve(brandingRoot, profile);
  const jsonPath = resolve(dir, 'brand.json');
  if (!existsSync(jsonPath)) {
    throw new Error(
      `[brand] profile "${profile}" not found: ${jsonPath} does not exist. ` +
        `Point apps/brand.config.json (or brand.config.local.json) at a profile ` +
        `under ${brandingRoot}.`,
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

  return {
    name: raw.name,
    wordmark: raw.wordmark ?? raw.name,
    tagline: raw.tagline ?? '',
    markGlyph: raw.markGlyph ?? raw.name.charAt(0).toUpperCase(),
    accent: raw.accent ?? DEFAULT_ACCENT,
    themeTokens,
    starterPrompts: starterPrompts.length > 0 ? starterPrompts : DEFAULT_STARTER_PROMPTS,
    backendRepository,
    backend: resolveBackend(raw),
    logoSvg,
  };
}

/**
 * Vite plugin that resolves the `@brand` virtual module for a profile.
 *
 * The caller (`vite.config.ts`) resolves `{profile, brandingRoot}` from the
 * brand config file (via `apps/branding/brand-config.mjs`) and passes them in —
 * there is no env-var fallback. The default `gact` profile (including under
 * tests) comes from the tracked `apps/brand.config.json`.
 */
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
      return (
        `export const brand = ${JSON.stringify(b)};\n` +
        `export default brand;\n`
      );
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
        if (resolve(file) === jsonPath || dirname(resolve(file)) === resolve(brandingRoot, profile)) {
          resolved = null;
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) server.reloadModule(mod);
        }
      });
    },
  };
}
