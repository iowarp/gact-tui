import { createContext, useContext, useState } from 'react';

export const TranscriptDisclosureContext = createContext<{
  sessionId?: string;
  choices: ReadonlyMap<string, boolean>;
  setOpen: (id: string, open: boolean) => void;
} | null>(null);

/**
 * Whether settled runs fold into one summary row. The tour's practice
 * conversation turns it off so the step it points at stays a row of its own.
 */
export const ActivityRunsFold = createContext(true);

/** Reader choices override changing defaults and survive conversation row suspension. */
export function useTranscriptDisclosure(
  id?: string,
  defaultOpen = false,
): [boolean, (open: boolean) => void] {
  const context = useContext(TranscriptDisclosureContext);
  const [local, setLocal] = useState<boolean>();
  return context && id
    ? [context.choices.get(id) ?? defaultOpen, (open) => context.setOpen(id, open)]
    : [local ?? defaultOpen, setLocal];
}
