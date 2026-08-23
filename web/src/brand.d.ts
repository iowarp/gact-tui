declare module '@brand' {
  export interface Brand {
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
    logoSvg: string | null;
    logoImage: string | null;
  }
  export const brand: Brand;
  export default brand;
}
