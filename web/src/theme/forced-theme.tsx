import { useLayoutEffect, type PropsWithChildren } from 'react';
import type { ThemePreference } from './contract';
import { applyTheme, DARK_SCHEME_QUERY, resolveTheme } from './preference';

/**
 * Pins the page to one theme regardless of the stored choice, for review
 * fixtures and embedded previews that render outside the app's providers.
 */
export function ForcedTheme({ theme, children }: PropsWithChildren<{ theme: ThemePreference }>) {
  useLayoutEffect(() => {
    applyTheme(
      document.documentElement,
      resolveTheme(theme, window.matchMedia(DARK_SCHEME_QUERY).matches),
    );
  }, [theme]);
  return children;
}
