import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY = 'clio.appearance.v1';

export type MotionPreference = 'system' | 'reduced';
export type ConversationWidth = 'focused' | 'wide';

interface AppearancePreferences {
  motion: MotionPreference;
  conversationWidth: ConversationWidth;
}

interface AppearanceContextValue extends AppearancePreferences {
  setMotion: (motion: MotionPreference) => void;
  setConversationWidth: (width: ConversationWidth) => void;
}

const defaults: AppearancePreferences = {
  motion: 'system',
  conversationWidth: 'focused',
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
  useEffect(() => {
    document.documentElement.dataset.clioMotion = preferences.motion;
  }, [preferences.motion]);
  const value = useMemo<AppearanceContextValue>(
    () => ({
      ...preferences,
      setMotion: (motion) => update({ motion }),
      setConversationWidth: (conversationWidth) => update({ conversationWidth }),
    }),
    [preferences, update],
  );
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

// Provider and hook intentionally share one private context identity.
// oxlint-disable-next-line react/only-export-components
export function useAppearancePreferences(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearancePreferences must be used inside AppearanceProvider');
  return value;
}

function readPreferences(): AppearancePreferences {
  if (typeof window === 'undefined') return defaults;
  try {
    return parsePreferences(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaults;
  }
}

function parsePreferences(raw: string | null): AppearancePreferences {
  const value = JSON.parse(raw ?? '{}') as Record<string, unknown>;
  return {
    motion: value.motion === 'reduced' ? 'reduced' : 'system',
    conversationWidth: value.conversationWidth === 'wide' ? 'wide' : 'focused',
  };
}
