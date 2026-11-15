/**
 * CLIO's look, handed to MCP App views as `hostContext.styles.variables` (the MCP
 * Apps "Theming" standardized variables, 2026-01-26 and draft).
 *
 * Values come from the notebook surface's design tokens (`web/src/theme/themes.css`)
 * resolved for the theme in use, so a view that reads the variables looks like the
 * conversation around it. The host resends them in `ui/notifications/host-context-changed`
 * whenever the theme changes, so resolved values (rather than `light-dark()`) are exact
 * for every theme family, not only light and dark. A view that ignores them keeps its own look.
 */

type Source =
  /** A CLIO token, resolved on `<html>`. */
  | { token: string }
  /** A tint of a status token over the notebook background. */
  | { tint: string; percent: number }
  /** A literal value. */
  | { value: string };

/** The standardized variable → its CLIO source (recorded in the apps ledger). */
export const MCP_APP_STYLE_SOURCES: Readonly<Record<string, Source>> = {
  '--color-background-primary': { token: '--background' },
  '--color-background-secondary': { token: '--card' },
  '--color-background-tertiary': { token: '--muted' },
  '--color-background-inverse': { token: '--invert' },
  '--color-background-ghost': { value: 'transparent' },
  '--color-background-info': { tint: '--info', percent: 14 },
  '--color-background-danger': { tint: '--destructive', percent: 14 },
  '--color-background-success': { tint: '--success', percent: 14 },
  '--color-background-warning': { tint: '--warning', percent: 14 },
  '--color-background-disabled': { token: '--muted' },
  '--color-text-primary': { token: '--foreground' },
  '--color-text-secondary': { token: '--muted-foreground' },
  '--color-text-tertiary': { token: '--faint' },
  '--color-text-inverse': { token: '--invert-foreground' },
  '--color-text-info': { token: '--info-foreground' },
  '--color-text-danger': { token: '--destructive-text' },
  '--color-text-success': { token: '--success-foreground' },
  '--color-text-warning': { token: '--warning-foreground' },
  '--color-text-disabled': { token: '--faint' },
  '--color-text-ghost': { token: '--muted-foreground' },
  '--color-border-primary': { token: '--border' },
  '--color-border-secondary': { token: '--input' },
  '--color-border-tertiary': { token: '--border' },
  '--color-border-inverse': { token: '--invert' },
  '--color-border-ghost': { value: 'transparent' },
  '--color-border-info': { token: '--info' },
  '--color-border-danger': { token: '--destructive' },
  '--color-border-success': { token: '--success' },
  '--color-border-warning': { token: '--warning' },
  '--color-border-disabled': { token: '--border' },
  '--color-ring-primary': { token: '--ring' },
  '--color-ring-secondary': { token: '--input' },
  '--color-ring-inverse': { token: '--invert-foreground' },
  '--color-ring-info': { token: '--info' },
  '--color-ring-danger': { token: '--destructive' },
  '--color-ring-success': { token: '--success' },
  '--color-ring-warning': { token: '--warning' },
  '--font-sans': { token: '--typeface-ui' },
  '--font-mono': { token: '--typeface-mono' },
  '--font-weight-normal': { value: '400' },
  '--font-weight-medium': { value: '500' },
  '--font-weight-semibold': { value: '600' },
  '--font-weight-bold': { value: '700' },
  '--font-text-xs-size': { value: '0.75rem' },
  '--font-text-sm-size': { value: '0.875rem' },
  '--font-text-md-size': { value: '1rem' },
  '--font-text-lg-size': { value: '1.125rem' },
  '--font-heading-xs-size': { value: '0.875rem' },
  '--font-heading-sm-size': { value: '1rem' },
  '--font-heading-md-size': { value: '1.125rem' },
  '--font-heading-lg-size': { value: '1.25rem' },
  '--font-heading-xl-size': { value: '1.5rem' },
  '--font-heading-2xl-size': { value: '1.875rem' },
  '--font-heading-3xl-size': { value: '2.25rem' },
  '--font-text-xs-line-height': { value: '1rem' },
  '--font-text-sm-line-height': { value: '1.25rem' },
  '--font-text-md-line-height': { value: '1.5rem' },
  '--font-text-lg-line-height': { value: '1.75rem' },
  '--font-heading-xs-line-height': { value: '1.25rem' },
  '--font-heading-sm-line-height': { value: '1.5rem' },
  '--font-heading-md-line-height': { value: '1.75rem' },
  '--font-heading-lg-line-height': { value: '1.75rem' },
  '--font-heading-xl-line-height': { value: '2rem' },
  '--font-heading-2xl-line-height': { value: '2.25rem' },
  '--font-heading-3xl-line-height': { value: '2.5rem' },
  '--border-radius-xs': { value: 'calc(var(--clio-radius) - 6px)' },
  '--border-radius-sm': { value: 'calc(var(--clio-radius) - 4px)' },
  '--border-radius-md': { value: 'calc(var(--clio-radius) - 2px)' },
  '--border-radius-lg': { value: 'var(--clio-radius)' },
  '--border-radius-xl': { value: 'calc(var(--clio-radius) + 4px)' },
  '--border-radius-full': { value: '9999px' },
  '--border-width-regular': { value: '1px' },
  '--shadow-hairline': { value: '0 0 0 1px var(--clio-shadow-color)' },
  '--shadow-sm': { value: '0 1px 2px var(--clio-shadow-color)' },
  '--shadow-md': { value: '0 4px 12px var(--clio-shadow-color)' },
  '--shadow-lg': { value: '0 12px 32px var(--clio-shadow-color)' },
};

/** The standardized variables for the theme in use, resolved from CLIO's tokens. */
export function mcpAppStyleVariables(root: Element = document.documentElement) {
  const computed = window.getComputedStyle(root);
  const read = (token: string) => computed.getPropertyValue(token).trim();
  const background = read('--background');
  const literals: Record<string, string> = {
    'var(--clio-radius)': read('--radius') || '0.5rem',
    'var(--clio-shadow-color)': read('--shadow-color') || 'transparent',
  };
  const variables: Record<string, string> = {};
  for (const [name, source] of Object.entries(MCP_APP_STYLE_SOURCES)) {
    let value = '';
    if ('token' in source) value = read(source.token);
    else if ('tint' in source) {
      const tint = read(source.tint);
      value =
        // i18n-ignore: CSS color-mix expression, not copy
        tint && background ? `color-mix(in oklab, ${tint} ${source.percent}%, ${background})` : '';
    } else {
      value = source.value;
      for (const [reference, literal] of Object.entries(literals))
        value = value.replaceAll(reference, literal);
    }
    // A token the theme lacks is left out: the view falls back to its own value.
    if (value) variables[name] = value;
  }
  return variables;
}
