import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { DEFAULT_PASTE_SOURCE_THRESHOLD } from '@/lib/composer-paste';
import type { ThemePreference } from '@/theme/contract';
import {
  APPEARANCE_STORAGE_KEY as STORAGE_KEY,
  DARK_SCHEME_QUERY,
  DEFAULT_THEME_PREFERENCE,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  switchTheme,
  type ResolvedTheme,
} from '@/theme/preference';

export type MotionPreference = 'system' | 'reduced';
export type ConversationWidth = 'focused' | 'wide';
export type InterfaceSize = 100 | 125 | 150;

interface AppearancePreferences {
  theme: ThemePreference;
  motion: MotionPreference;
  conversationWidth: ConversationWidth;
  collapseThreshold: number;
  hideDotFiles: boolean;
  interfaceSize: InterfaceSize;
  pasteSourceThreshold: number;
}

interface AppearanceContextValue extends AppearancePreferences {
  /** The applied theme: the choice, with System and Notebook following the OS scheme. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  setMotion: (motion: MotionPreference) => void;
  setConversationWidth: (width: ConversationWidth) => void;
  setCollapseThreshold: (lines: number) => void;
  setHideDotFiles: (hideDotFiles: boolean) => void;
  setInterfaceSize: (size: InterfaceSize) => void;
  setPasteSourceThreshold: (characters: number) => void;
}

const defaults: AppearancePreferences = {
  theme: DEFAULT_THEME_PREFERENCE,
  motion: 'system',
  conversationWidth: 'focused',
  collapseThreshold: 5,
  // Owner ruling: the Files view shows ALL dot files/folders (including .clio) by
  // default — there is no reason to hide a workspace's own agent state from itself.
  // This toggle is opt-in.
  hideDotFiles: false,
  interfaceSize: 100,
  pasteSourceThreshold: DEFAULT_PASTE_SOURCE_THRESHOLD,
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState(readPreferences);
  const update = useCallback((next: Partial<AppearancePreferences>) => {
    setPreferences((current) => {
      const value = { ...current, ...next };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        // Keep the preference active for this tab when storage is unavailable.
      }
      return value;
    });
  }, []);
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      try {
        setPreferences(parsePreferences(event.newValue));
      } catch {
        setPreferences(defaults);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);
  const systemDark = useSyncExternalStore(subscribeSystemScheme, systemPrefersDark, () => false);
  const resolvedTheme = useMemo(
    () => resolveTheme(preferences.theme, systemDark),
    [preferences.theme, systemDark],
  );
  // The boot script applied the stored theme before first paint; this keeps
  // <html> in step with later choices and OS scheme changes, without a reload.
  useEffect(() => {
    switchTheme(document.documentElement, resolvedTheme);
  }, [resolvedTheme]);
  useEffect(() => {
    document.documentElement.dataset.clioMotion = preferences.motion;
  }, [preferences.motion]);
  useEffect(() => {
    document.documentElement.dataset.clioInterfaceSize = String(preferences.interfaceSize);
  }, [preferences.interfaceSize]);
  const value = useMemo<AppearanceContextValue>(
    () => ({
      ...preferences,
      resolvedTheme,
      setTheme: (theme) => update({ theme }),
      setMotion: (motion) => update({ motion }),
      setConversationWidth: (conversationWidth) => update({ conversationWidth }),
      setCollapseThreshold: (lines) =>
        update({ collapseThreshold: Math.max(1, Math.min(50, Math.round(lines) || 5)) }),
      setHideDotFiles: (hideDotFiles) => update({ hideDotFiles }),
      setInterfaceSize: (interfaceSize) => update({ interfaceSize }),
      setPasteSourceThreshold: (characters) =>
        update({
          pasteSourceThreshold: Number.isFinite(characters)
            ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(characters)))
            : DEFAULT_PASTE_SOURCE_THRESHOLD,
        }),
    }),
    [preferences, resolvedTheme, update],
  );
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

// Provider and hook intentionally share one private context identity.
/** Dialogs outside a workspace preview use the focused transcript width. */
// oxlint-disable-next-line react/only-export-components
export function useConversationWidth(): ConversationWidth {
  return useContext(AppearanceContext)?.conversationWidth ?? defaults.conversationWidth;
}

// oxlint-disable-next-line react/only-export-components
export function useAppearancePreferences(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearancePreferences must be used inside AppearanceProvider');
  return value;
}

function readPreferences(): AppearancePreferences {
  if (typeof window === 'undefined') return defaults;
  try {
    return {
      ...parsePreferences(window.localStorage.getItem(STORAGE_KEY)),
      theme: readThemePreference(window.localStorage),
    };
  } catch {
    return defaults;
  }
}

function subscribeSystemScheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_SCHEME_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_SCHEME_QUERY).matches;
}

/** The theme choice and the theme applied to the page. */
// oxlint-disable-next-line react/only-export-components
export function useTheme(): Pick<AppearanceContextValue, 'theme' | 'resolvedTheme' | 'setTheme'> {
  const { theme, resolvedTheme, setTheme } = useAppearancePreferences();
  return { theme, resolvedTheme, setTheme };
}

// oxlint-disable-next-line react/only-export-components
export function useTranscriptPreviewLines(): number {
  return useContext(AppearanceContext)?.collapseThreshold ?? 5;
}

/** A zero threshold keeps every text paste inline. */
// oxlint-disable-next-line react/only-export-components
export function usePasteSourceThreshold(): number {
  return useContext(AppearanceContext)?.pasteSourceThreshold ?? defaults.pasteSourceThreshold;
}

function parsePreferences(raw: string | null): AppearancePreferences {
  const value = JSON.parse(raw ?? '{}') as Record<string, unknown>;
  return {
    theme: parseThemePreference(value.theme),
    motion: value.motion === 'reduced' ? 'reduced' : 'system',
    conversationWidth: value.conversationWidth === 'wide' ? 'wide' : 'focused',
    collapseThreshold:
      typeof value.collapseThreshold === 'number' &&
      Number.isInteger(value.collapseThreshold) &&
      value.collapseThreshold >= 1 &&
      value.collapseThreshold <= 50
        ? value.collapseThreshold
        : 5,
    hideDotFiles: value.hideDotFiles === true,
    interfaceSize:
      value.interfaceSize === 125 || value.interfaceSize === 150 ? value.interfaceSize : 100,
    pasteSourceThreshold:
      typeof value.pasteSourceThreshold === 'number' &&
      Number.isSafeInteger(value.pasteSourceThreshold) &&
      value.pasteSourceThreshold >= 0
        ? value.pasteSourceThreshold
        : DEFAULT_PASTE_SOURCE_THRESHOLD,
  };
}
