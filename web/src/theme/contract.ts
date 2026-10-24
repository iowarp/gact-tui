/**
 * The core theme contract. Every theme in `themes.css` defines every token
 * listed here, and components read only these tokens (through the Tailwind
 * utilities `index.css` maps onto them, or `var(--token)` in CSS). A theme is
 * one more block of values for this same list; `contract.test.ts` fails when a
 * theme leaves a token out.
 */

/** Color tokens. Each is a CSS color. */
export const COLOR_TOKENS = [
  // Surfaces and ink
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'composer',
  'composer-border',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'border',
  'input',
  'ring',
  'invert',
  'invert-foreground',
  'link',
  // Primary action and live activity
  'primary',
  'primary-foreground',
  'action',
  // Sidebar
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
  // Outcomes. Refuted is a science state, not an error, so it is not `destructive`.
  'destructive',
  'destructive-foreground',
  'info',
  'info-foreground',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
  // Science states: a tint for the chip or node and a text color for its label and icon
  'status-supported',
  'status-supported-foreground',
  'status-running',
  'status-running-foreground',
  'status-refuted',
  'status-refuted-foreground',
  'status-superseded',
  'status-superseded-foreground',
  // Charts: default series, then the category palette shared by charts and maps
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'category-1',
  'category-2',
  'category-3',
  'category-4',
  'category-5',
  'category-6',
  'category-7',
  'category-8',
  'category-9',
  'category-10',
  'category-11',
  'category-12',
  // A continuous value scale, low to high
  'scale-low',
  'scale-mid',
  'scale-high',
  // Terminals and logs
  'terminal',
  'terminal-foreground',
  'terminal-muted',
  'terminal-border',
  'terminal-accent',
  // Code syntax, read by the code highlighter's CSS-variable theme
  'syntax-foreground',
  'syntax-background',
  'syntax-token-keyword',
  'syntax-token-string',
  'syntax-token-string-expression',
  'syntax-token-comment',
  'syntax-token-constant',
  'syntax-token-function',
  'syntax-token-parameter',
  'syntax-token-punctuation',
  'syntax-token-link',
  // Overlays and highlights
  'scrim',
  'shadow-color',
  'highlight',
  'highlight-foreground',
  'media-backdrop',
  'media-foreground',
] as const;

/** Font tokens. Each is a font-family stack. */
export const FONT_TOKENS = [
  'typeface-ui',
  'typeface-voice',
  'typeface-heading',
  'typeface-mono',
] as const;

/** Length tokens. */
export const LENGTH_TOKENS = ['radius'] as const;

export const THEME_TOKENS = [...COLOR_TOKENS, ...FONT_TOKENS, ...LENGTH_TOKENS] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type FontToken = (typeof FONT_TOKENS)[number];
export type ThemeToken = (typeof THEME_TOKENS)[number];

export const STATUS_KINDS = ['supported', 'running', 'refuted', 'superseded'] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

export const CATEGORY_TOKENS = COLOR_TOKENS.filter((token) => token.startsWith('category-'));
export const CHART_TOKENS = COLOR_TOKENS.filter((token) => token.startsWith('chart-'));

/** A theme's id, which `themes.css` selects with `:root[data-theme='<id>']`. */
export type ThemeId = 'light' | 'dark' | 'notebook' | 'debug';
/** What the person picks. `system` follows the OS between Light and Dark. */
export type ThemePreference = 'system' | ThemeId;

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  /** `system` themes have a light and a dark variant and follow `prefers-color-scheme`. */
  scheme: 'light' | 'dark' | 'system';
  /** Shown in the selector only in development builds. */
  development?: boolean;
}

export const THEMES: readonly ThemeDefinition[] = [
  { id: 'light', label: 'Light', scheme: 'light' },
  { id: 'dark', label: 'Dark', scheme: 'dark' },
  { id: 'notebook', label: 'Notebook', scheme: 'system' },
  { id: 'debug', label: 'Debug', scheme: 'system', development: true },
];

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  ...THEMES.map((theme) => theme.id),
];
