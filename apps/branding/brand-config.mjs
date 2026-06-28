// Shared brand-selection resolver.
//
// The brand is selected at COMPILE TIME by a CONFIG FILE — never an env var.
// The tracked default is `apps/brand.config.json`; an embedding project (e.g.
// clio-agent) overrides it WITHOUT mutating the tracked file by dropping an
// `apps/brand.config.local.json` (gitignored), which always wins.
//
// Config shape:
//   {
//     "profile": "<id>",          // profile dir under brandingRoot (non-empty string)
//     "brandingRoot": "branding"  // dir holding <profile>/brand.json; resolved
//                                 // RELATIVE TO THIS CONFIG FILE'S DIRECTORY,
//                                 // or an absolute path
//   }
//
// This is a .mjs so it can be imported by BOTH the .mjs gen script
// (apps/desktop/scripts/gen-brand-backend.mjs) and the TS vite config
// (apps/web/vite.config.ts, executed by vite's node loader).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, isAbsolute } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default tracked config path: `<repo>/apps/brand.config.json`. */
export const DEFAULT_CONFIG_PATH = resolve(__dirname, '..', 'brand.config.json');

/**
 * Resolve the brand selection from the config file.
 *
 * @param {string} [configPath] Explicit config path. Defaults to
 *   {@link DEFAULT_CONFIG_PATH}; when omitted, a sibling
 *   `brand.config.local.json` (if present) WINS over the given/default path.
 * @returns {{ profile: string, brandingRoot: string }} `brandingRoot` is
 *   absolute; `profile` is a non-empty string.
 * @throws if the resolved config is missing or invalid.
 */
export function resolveBrandConfig(configPath) {
  const basePath = configPath ? resolve(configPath) : DEFAULT_CONFIG_PATH;

  // A sibling local override wins, so the embedding project never mutates the
  // tracked config.
  const localPath = resolve(dirname(basePath), 'brand.config.local.json');
  const effectivePath = existsSync(localPath) ? localPath : basePath;

  if (!existsSync(effectivePath)) {
    throw new Error(
      `[brand-config] config file not found: ${effectivePath}. ` +
        `Create apps/brand.config.json (or a brand.config.local.json override).`,
    );
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(effectivePath, 'utf8'));
  } catch (err) {
    throw new Error(
      `[brand-config] cannot parse ${effectivePath}: ${err.message}`,
    );
  }

  const profile = raw.profile;
  if (typeof profile !== 'string' || profile.trim().length === 0) {
    throw new Error(
      `[brand-config] ${effectivePath}: "profile" must be a non-empty string.`,
    );
  }

  const brandingRootRaw = raw.brandingRoot;
  if (typeof brandingRootRaw !== 'string' || brandingRootRaw.length === 0) {
    throw new Error(
      `[brand-config] ${effectivePath}: "brandingRoot" must be a non-empty string.`,
    );
  }

  // brandingRoot is resolved relative to the config file's directory (or used
  // as-is when already absolute).
  const brandingRoot = isAbsolute(brandingRootRaw)
    ? brandingRootRaw
    : resolve(dirname(effectivePath), brandingRootRaw);

  return { profile: profile.trim(), brandingRoot };
}
