import { useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { TranscriptDisclosureContext } from './transcript-disclosure-context';

type TranscriptDisclosuresProps = { children: ReactNode; sessionId?: string };

/**
 * Reuse session choices above responsive layouts and virtualized conversation rows.
 * The outermost one wraps the whole workspace shell, so a new conversation clears its
 * choices in place instead of remounting the shell and left bar; a nested one (another
 * conversation shown inside) still starts fresh by remounting its own rows.
 */
export function TranscriptDisclosures({ children, sessionId }: TranscriptDisclosuresProps) {
  const parent = useContext(TranscriptDisclosureContext);
  if (parent && parent.sessionId === sessionId) return children;
  return (
    <SessionDisclosures key={parent ? (sessionId ?? '') : undefined} sessionId={sessionId}>
      {children}
    </SessionDisclosures>
  );
}

type SessionChoices = { sessionId?: string; choices: ReadonlyMap<string, boolean> };

function SessionDisclosures({ children, sessionId }: TranscriptDisclosuresProps) {
  const [state, setState] = useState<SessionChoices>(() => ({ sessionId, choices: new Map() }));
  let current = state;
  if (state.sessionId !== sessionId) {
    current = { sessionId, choices: new Map() };
    setState(current);
  }
  const { choices } = current;
  const setOpen = useCallback((id: string, open: boolean) => {
    setState((current) => {
      if (current.choices.get(id) === open) return current;
      const next = new Map(current.choices);
      next.set(id, open);
      return { sessionId: current.sessionId, choices: next };
    });
  }, []);
  const value = useMemo(() => ({ sessionId, choices, setOpen }), [sessionId, choices, setOpen]);
  return (
    <TranscriptDisclosureContext.Provider value={value}>
      {children}
    </TranscriptDisclosureContext.Provider>
  );
}
