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

/** Where a finished or stopped run tells you: the bell's While you were away list, that plus a desktop alert, or nowhere. */
export type FinishedWorkMode = 'bell' | 'desktop' | 'off';

interface NotificationPreferences {
  attentionSound: AttentionSoundMode;
  desktopNotifications: boolean;
  finishedWork: FinishedWorkMode;
}

interface NotificationPreferencesContextValue extends NotificationPreferences {
  setAttentionSound: (mode: AttentionSoundMode) => void;
  setDesktopNotifications: (enabled: boolean) => void;
  setFinishedWork: (mode: FinishedWorkMode) => void;
}

const defaults: NotificationPreferences = {
  attentionSound: 'off',
  desktopNotifications: false,
  finishedWork: 'bell',
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
      setFinishedWork: (finishedWork) => update({ finishedWork }),
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
      value.attentionSound === 'background' || value.attentionSound === 'always'
        ? value.attentionSound
        : 'off',
    desktopNotifications: value.desktopNotifications === true,
    finishedWork:
      value.finishedWork === 'desktop' || value.finishedWork === 'off' ? value.finishedWork : 'bell',
  };
}
