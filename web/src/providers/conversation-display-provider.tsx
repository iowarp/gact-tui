import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

export type ConversationDisplayMode = 'chain' | 'full';

interface ConversationDisplayContextValue {
  mode: ConversationDisplayMode;
  setMode: (mode: ConversationDisplayMode) => void;
}

const STORAGE_KEY = 'clio.conversation-display.v1';
const ConversationDisplayContext = createContext<ConversationDisplayContextValue | null>(null);

/** Owns the local default projection for causal conversation activity. */
export function ConversationDisplayProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ConversationDisplayMode>(readStoredMode);

  const setMode = useCallback((nextMode: ConversationDisplayMode) => {
    setModeState(nextMode);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // The preference remains active for this tab when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setModeState(parseMode(event.newValue));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return (
    <ConversationDisplayContext.Provider value={value}>
      {children}
    </ConversationDisplayContext.Provider>
  );
}

/** Returns the user's conversation-detail preference. */
// Provider and hook intentionally share one private context identity.
// oxlint-disable-next-line react/only-export-components
export function useConversationDisplay(): ConversationDisplayContextValue {
  const context = useContext(ConversationDisplayContext);
  if (!context) throw new Error('useConversationDisplay must be used within AppProviders');
  return context;
}

function readStoredMode(): ConversationDisplayMode {
  if (typeof window === 'undefined') return 'chain';
  try {
    return parseMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'chain';
  }
}

function parseMode(value: string | null): ConversationDisplayMode {
  return value === 'full' ? 'full' : 'chain';
}
