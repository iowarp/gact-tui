// Type declarations for the shared brand-config resolver (brand-config.mjs).
// Lets the TS configs (web/vite.config.ts and desktop tooling) import
// the .mjs resolver with full typing while keeping a single runtime module.

/** Default tracked config path: `<repo>/brand.config.json`. */
export declare const DEFAULT_CONFIG_PATH: string;

/**
 * Resolve the brand selection from the config file.
 *
 * @param configPath Explicit config path. Defaults to {@link DEFAULT_CONFIG_PATH};
 *   when omitted, a sibling `brand.config.local.json` (if present) wins.
 * @returns `{ profile, brandingRoot }` where `brandingRoot` is absolute and
 *   `profile` is a non-empty string.
 * @throws if the resolved config is missing or invalid.
 */
export declare function resolveBrandConfig(configPath?: string): {
  profile: string;
  brandingRoot: string;
};
