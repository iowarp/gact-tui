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
    /** Optional substring of tagline rendered with the brand accent. */
    taglineAccent: string;
    /** Optional product/home URL for brand lockups. */
    homeUrl: string | null;
    /** Optional URL for the accented tagline substring. */
    taglineAccentUrl: string | null;
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
    /** Presentation labels for session semantics controls. */
    sessionSemantics: {
      blueprintLabel: string;
      showExpertPackPicker: boolean;
      blueprintDisplayNames: Record<string, string>;
    };
    /** Optional backend repository surfaced in About / install diagnostics. */
    backendRepository: {
      label: string;
      url: string;
      detail: string;
    } | null;
    /** Brand-scoped release page shown from the version/update menu. */
    releaseUrl: string | null;
    /**
     * Managed-vs-connect backend descriptor — the SAME resolved shape the
     * desktop supervisor embeds (apps/desktop/src-tauri/gen/brand-backend.json),
     * so web and desktop read one brand document. The neutral default is
     * connect-mode with no installer.
     */
    backend: {
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
    };
    /** Inlined SVG logo source, or null. Overrides markGlyph when present. */
    logoSvg: string | null;
    /** Inlined logo data URL, or null. Preferred for chrome when present. */
    logoImage: string | null;
  }
  export const brand: Brand;
  export default brand;
}

/** Profile id, defined by the brand plugin. */
declare const __GACT_BRAND__: string;
