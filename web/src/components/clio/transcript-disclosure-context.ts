import { createContext, useContext, useState } from 'react';

export const TranscriptDisclosureContext = createContext<{
  sessionId?: string;
  opened: ReadonlySet<string>;
  setOpen: (id: string, open: boolean) => void;
} | null>(null);

/** Standalone entries retain local state; conversation entries survive row suspension. */
export function useTranscriptDisclosure(id?: string): [boolean, (open: boolean) => void] {
  const context = useContext(TranscriptDisclosureContext);
  const [local, setLocal] = useState(false);
  return context && id
    ? [context.opened.has(id), (open) => context.setOpen(id, open)]
    : [local, setLocal];
}
