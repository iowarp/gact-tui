import { createContext, useContext } from 'react';
import { noAnswer } from '@/lib/connection-attempt';

const AgentUnansweredContext = createContext(false);

/** Set by the Infrastructure page while it reports that the connected agent did not answer. */
export const AgentUnansweredProvider = AgentUnansweredContext.Provider;

/**
 * True when the page already reports this same failure, so one unreachable
 * agent reads as one error rather than one per panel.
 */
export function useShownByPage(error: Error | null | undefined): boolean {
  return useContext(AgentUnansweredContext) && noAnswer(error);
}
