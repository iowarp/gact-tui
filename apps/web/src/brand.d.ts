/**
 * Virtual module injected at build time by `vite-plugin-brand.ts`.
 *
 * The selected brand profile is chosen by the brand config file
 * (`apps/brand.config.json`, or a `brand.config.local.json` override) — not an
 * env var. Its `brand.json` (under `<brandingRoot>/<profile>/`) is read and
 * exposed as a fully-resolved object.
 */
declare module '@brand' {
  export interface Brand {
    /** Product name → window title, copy ("Welcome to <name>"). */
    name: string;
    /** Text wordmark for chrome lockups. Defaults to `name`. */
    wordmark: string;
    /** One-line product description. */
    tagline: string;
    /** Single-character fallback mark. */
    markGlyph: string;
    /** Primary accent CSS color, or null to use the design-system default. */
    accent: string | null;
    /** CSS custom-property overrides merged into the default theme at boot. */
    themeTokens: Record<string, string>;
    /** First-run prompt cards tuned for this brand profile. */
    starterPrompts: Array<{
      eyebrow: string;
      label: string;
    }>;
    /** Optional backend repository surfaced in About / install diagnostics. */
    backendRepository: {
      label: string;
      url: string;
      detail: string;
    } | null;
    /** Inlined SVG logo source, or null. Overrides markGlyph when present. */
    logoSvg: string | null;
    /** Brand-driven backend descriptor consumed by the desktop supervisor. */
    backend: {
      /** managed = supervisor spawns/installs a sidecar; connect = attach-only. */
      mode: 'managed' | 'connect';
      /** externalBin basename → binaries/<sidecarName>-<triple>. */
      sidecarName: string;
      /** Conventional local port to attach-first; 0 disables attach. */
      attachPort: number;
      /** Env var overriding attachPort. */
      attachPortEnv: string;
      /** Env var overriding the full attach URL. */
      attachUrlEnv: string;
      /** Repo label for the connect/no-install hint, or null. */
      repoLabel: string | null;
      /** Installer descriptor, or null for connect-mode brands. */
      install: {
        ref: string;
        refEnv: string;
        forceEnv: string;
        windowsUrl: string;
        unixUrl: string;
        repoLabel: string;
      } | null;
    };
  }
  export const brand: Brand;
  export default brand;
}

/** Profile id, defined by the brand plugin. */
declare const __GACT_BRAND__: string;
