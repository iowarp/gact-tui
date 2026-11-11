import type { Message } from '@clio/core/v3';
import { createContext, useContext } from 'react';

/** The conversation's messages, for a row that refers to others (a compaction's kept turns). */
export const TranscriptMessagesContext = createContext<readonly Message[]>([]);

export function useTranscriptMessages(): readonly Message[] {
  return useContext(TranscriptMessagesContext);
}
