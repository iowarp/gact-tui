/**
 * Typing aids for fields that take identifiers, paths, links, hosts, tokens, model
 * names or search queries. macOS WebKit otherwise capitalizes and autocorrects what
 * people type (`root` became `Root`). Prose fields such as the composer opt out by
 * not using these, or by passing their own values.
 */
export const identifierInputProps = {
  autoCapitalize: 'off',
  autoCorrect: 'off',
  autoComplete: 'off',
  spellCheck: false,
} as const;

/** Restores the platform's typing aids on a single-line `Input` that takes prose. */
export const proseInputProps = {
  autoCapitalize: 'sentences',
  autoCorrect: 'on',
  spellCheck: true,
} as const;
