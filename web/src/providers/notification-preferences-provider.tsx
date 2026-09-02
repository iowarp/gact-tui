import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY = 'clio.notifications.v1';

export type AttentionSoundMode = 'off' | 'background' | 'always';

interface NotificationPreferences {
  attentionSound: AttentionSoundMode;
  desktopNotifications: boolean;
}

interface NotificationPreferencesContextValue extends NotificationPreferences {
  setAttentionSound: (mode: AttentionSoundMode) => void;
  setDesktopNotifications: (enabled: boolean) => void;
}

const defaults: NotificationPreferences = {
  attentionSound: 'background',
  desktopNotifications: false,
};

const NotificationPreferencesContext = createContext<NotificationPreferencesContextValue | null>(
  null,
);

export function NotificationPreferencesProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState(readPreferences);
  const update = useCallback((next: Partial<NotificationPreferences>) => {
    setPreferences((current) => ({ ...current, ...next }));
  }, []);
  // Persisting belongs in an effect, not the setState updater above: React
  // Strict Mode calls a functional updater twice to check it stays pure, so a
  // side effect (the storage write) living inside it would double-write for
  // one logical preference change.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Keep preferences active for this tab when storage is unavailable.
    }
  }, [preferences]);
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
  const value = useMemo<NotificationPreferencesContextValue>(
    () => ({
      ...preferences,
      setAttentionSound: (attentionSound) => update({ attentionSound }),
      setDesktopNotifications: (desktopNotifications) => update({ desktopNotifications }),
    }),
    [preferences, update],
  );
  return (
    <NotificationPreferencesContext.Provider value={value}>
      {children}
    </NotificationPreferencesContext.Provider>
  );
}

// Provider and hook intentionally share one private context identity.
// oxlint-disable-next-line react/only-export-components
export function useNotificationPreferences(): NotificationPreferencesContextValue {
  const value = useContext(NotificationPreferencesContext);
  if (!value) {
    throw new Error(
      'useNotificationPreferences must be used inside NotificationPreferencesProvider',
    );
  }
  return value;
}

function readPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return defaults;
  try {
    return parsePreferences(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaults;
  }
}

function parsePreferences(raw: string | null): NotificationPreferences {
  const value = JSON.parse(raw ?? '{}') as Record<string, unknown>;
  return {
    attentionSound:
      value.attentionSound === 'off' || value.attentionSound === 'always'
        ? value.attentionSound
        : 'background',
    desktopNotifications: value.desktopNotifications === true,
  };
}
