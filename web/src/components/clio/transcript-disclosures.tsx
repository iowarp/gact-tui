import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { TranscriptDisclosureContext } from './transcript-disclosure-context';

/** Keep reader choices above virtualized rows, for this conversation's lifetime. */
export function TranscriptDisclosures({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const setOpen = useCallback((id: string, open: boolean) => {
    setOpened((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ opened, setOpen }), [opened, setOpen]);
  return (
    <TranscriptDisclosureContext.Provider value={value}>
      {children}
    </TranscriptDisclosureContext.Provider>
  );
}
