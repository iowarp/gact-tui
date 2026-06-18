/**
 * Virtual module injected at build time by `vite-plugin-brand.ts`.
 *
 * The selected brand profile (env `GACT_BRAND`, default `gact`) is read from
 * `apps/branding/<profile>/brand.json` and exposed as a fully-resolved object.
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
  }
  export const brand: Brand;
  export default brand;
}

/** Profile id, defined by the brand plugin. */
declare const __GACT_BRAND__: string;
