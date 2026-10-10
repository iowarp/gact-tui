import { useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { TranscriptDisclosureContext } from './transcript-disclosure-context';

type TranscriptDisclosuresProps = { children: ReactNode; sessionId?: string };

/** Reuse session choices above responsive layouts and virtualized conversation rows. */
export function TranscriptDisclosures({ children, sessionId }: TranscriptDisclosuresProps) {
  const parent = useContext(TranscriptDisclosureContext);
  if (parent && parent.sessionId === sessionId) return children;
  return (
    <SessionDisclosures key={sessionId ?? ''} sessionId={sessionId}>
      {children}
    </SessionDisclosures>
  );
}

function SessionDisclosures({ children, sessionId }: TranscriptDisclosuresProps) {
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const setOpen = useCallback((id: string, open: boolean) => {
    setOpened((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ sessionId, opened, setOpen }), [sessionId, opened, setOpen]);
  return (
    <TranscriptDisclosureContext.Provider value={value}>
      {children}
    </TranscriptDisclosureContext.Provider>
  );
}
