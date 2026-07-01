/**
 * Derives the transcript's presentation state (streaming target, grouped
 * messages) for rendering. Exports {@link createTranscriptPresentationModel}.
 */
import { createMemo, type Accessor } from 'solid-js';
import type { Message } from '@clio/core';
import { countOccurrences, shouldRenderPart, type TranscriptDensity } from './TranscriptParts.js';
import { messageSearchTexts } from './transcriptDelegationModel.js';

export interface StreamingTarget {
  msgId: string;
  partIdx: number;
}

export interface TranscriptPresentationModel {
  baseIndexFor: (msgId: string) => number;
  streamingTarget: Accessor<StreamingTarget | null>;
}

export function createTranscriptPresentationModel(options: {
  messages: Accessor<Message[]>;
  searchQuery: Accessor<string | undefined>;
  streaming: Accessor<boolean | undefined>;
  density: Accessor<TranscriptDensity>;
}): TranscriptPresentationModel {
  const matchBaseIndexByMessage = createMemo(() => {
    const q = options.searchQuery()?.trim().toLowerCase();
    const baseByMessage = new Map<string, number>();
    if (!q) return baseByMessage;

    let total = 0;
    for (const message of options.messages()) {
      baseByMessage.set(message.id, total);
      for (const text of messageSearchTexts(message)) {
        total += countOccurrences(text.toLowerCase(), q);
      }
    }
    return baseByMessage;
  });

  const streamingTarget = createMemo<StreamingTarget | null>(() => {
    if (!options.streaming()) return null;
    const messages = options.messages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message || message.role !== 'assistant') continue;
      if (message.stop_reason) return null;
      const visibleParts = message.parts.filter((part) =>
        shouldRenderPart(part, options.density()),
      );
      for (let partIdx = visibleParts.length - 1; partIdx >= 0; partIdx--) {
        if (visibleParts[partIdx]?.type === 'text') {
          return { msgId: message.id, partIdx };
        }
      }
      return null;
    }
    return null;
  });

  return {
    baseIndexFor: (msgId) => matchBaseIndexByMessage().get(msgId) ?? 0,
    streamingTarget,
  };
}
