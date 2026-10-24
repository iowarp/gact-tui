import { readThemeFont } from '@/theme/runtime';
import { sanitizeMermaidSvg } from './mermaid-security';

export interface PeleRenderOptions {
  /** Unit: CSS pixels. Default 15. */
  fontSize?: number;
  /** Let Pele turn a left-to-right graph top-down when `maxWidth` is narrow. */
  autoDirection?: boolean;
  /**
   * Leave the palette to the page's CSS variables instead of resolving it into
   * the SVG, so an inline diagram follows a theme change without re-rendering.
   */
  inheritTheme?: boolean;
  /** Adjust the sanitized SVG before it is serialized (for example, mark node states). */
  transform?: (svg: SVGElement) => void;
}

/** Render Mermaid syntax with the bundled Pele engine; preserve legacy syntax through Mermaid. */
export async function renderPeleDiagram(
  source: string,
  idPrefix: string,
  maxWidth?: number,
  options: PeleRenderOptions = {},
): Promise<string | undefined> {
  const { renderAsync, PeleError } = await import('pele/lazy');
  let output: string;
  try {
    output = (
      await renderAsync(source, {
        idPrefix,
        maxWidth,
        links: false,
        images: false,
        fontFamily: readThemeFont('typeface-ui'),
        fontSize: options.fontSize ?? 15,
        ...(options.autoDirection ? { autoDirection: true } : {}),
      })
    ).svg;
  } catch (error) {
    if (error instanceof PeleError) return undefined;
    throw error;
  }
  const svg = sanitizeMermaidSvg(output);
  options.transform?.(svg);
  if (options.inheritTheme) return new XMLSerializer().serializeToString(svg);
  const theme = getComputedStyle(document.documentElement);
  const variables: Record<string, string> = {
    bg: 'background',
    fg: 'foreground',
    muted: 'muted-foreground',
    line: 'muted-foreground',
    surface: 'card',
    'surface-alt': 'muted',
    border: 'border',
    accent: 'primary',
  };
  for (const [name, token] of Object.entries(variables)) {
    const value = theme.getPropertyValue(`--${token}`).trim();
    if (value) svg.style.setProperty(`--pele-${name}`, value);
  }
  // Exports and the shared image canvas have their own SVG document. Retain
  // resolved palette values there rather than depending on parent CSS variables.
  svg.style.setProperty('--pele-font', readThemeFont('typeface-ui'));
  return new XMLSerializer().serializeToString(svg);
}
