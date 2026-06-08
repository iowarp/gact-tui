import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Build-time brand injection.
 *
 * Resolves the virtual module `@brand` to the selected brand profile, chosen
 * via the `GACT_BRAND` env var (default `gact`). The profile lives at
 * `apps/branding/<profile>/brand.json`; an optional `logoSvg` path is read and
 * inlined as a string so the app never has to fetch an asset at runtime.
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
}

export interface ResolvedBrand {
  name: string;
  wordmark: string;
  tagline: string;
  markGlyph: string;
  accent: string | null;
  themeTokens: Record<string, string>;
  /** Inlined SVG source, or null when the profile has no logoSvg. */
  logoSvg: string | null;
}

/** Default accent when a profile omits one — the design-system default. */
const DEFAULT_ACCENT: string | null = null;

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

  const themeTokens: Record<string, string> = { ...(raw.themeTokens ?? {}) };
  if (raw.accent && !themeTokens['--color-accent']) {
    themeTokens['--color-accent'] = raw.accent;
  }

  return {
    name: raw.name,
    wordmark: raw.wordmark ?? raw.name,
    tagline: raw.tagline ?? '',
    markGlyph: raw.markGlyph ?? raw.name.charAt(0).toUpperCase(),
    accent: raw.accent ?? DEFAULT_ACCENT,
    themeTokens,
    logoSvg,
  };
}

/**
 * Resolve the active brand profile id.
 *
 * Precedence: explicit `GACT_BRAND` always wins. Otherwise the default is
 * `gact` (neutral) — EXCEPT under Vitest, where the existing unit suite is
 * authored against the CLIO product (the brand under test), so it defaults to
 * `clio` to keep those assertions valid. The visual (Playwright) build is run
 * with an explicit `GACT_BRAND=clio` via the `test:visual` script.
 */
export function activeProfile(): string {
  const explicit = process.env['GACT_BRAND'];
  if (explicit) return explicit;
  if (process.env['VITEST']) return 'clio';
  return 'gact';
}

export function brandPlugin(brandingRoot: string): Plugin {
  const profile = activeProfile();
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
