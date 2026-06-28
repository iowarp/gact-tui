/**
 * Composition root that instantiates the ChatLayout service objects (session
 * ops, inspector data, actions) from its props. Exports {@link createChatLayoutServices}.
 */
import { createMemo } from 'solid-js';
import { Client } from '@clio/core';
import { type SlashCommand } from '../components/SlashPalette.js';
import { getRequestLocale } from '../locale.js';
import { inTauri, tauriFetch } from '../tauri.js';
import { buildChatPaletteItems } from './chatPaletteItems.js';
import { createTranscriptSearch } from './chatTranscriptSearch.js';
import { createTranscriptScroll } from './chatTranscriptScroll.js';
import { createTopbarOverflow } from './chatTopbarOverflow.js';
import type { ChatLayoutProps } from './ChatLayoutTypes.js';

export function createChatLayoutServices(props: ChatLayoutProps) {
  const topbarOverflow = createTopbarOverflow(() => [
    props.sessionCostUsd,
    props.sessionTokens,
    props.selectedModelId,
    props.permMode,
    props.sseStatus,
    props.runningTools?.length,
  ]);

  const transcriptSearch = createTranscriptSearch(() => props.messages);
  const transcriptScroll = createTranscriptScroll({
    messages: () => props.messages,
    activeId: () => props.activeId,
    pendingPermission: () => props.pendingPermission,
    pendingQuestion: () => props.pendingQuestion,
  });

  const discoveryClient = new Client({
    baseUrl: props.backendUrl,
    fetch: inTauri() ? tauriFetch : undefined,
    getLocale: getRequestLocale,
  });

  const paletteItems = createMemo<SlashCommand[]>(() =>
    buildChatPaletteItems({
      slashCommands: props.slashCommands,
      sessions: props.sessions,
      detachedSessions: props.detachedSessions,
      permMode: props.permMode,
      capsFlags: props.capsFlags,
      activeId: props.activeId,
      density: props.density,
    }),
  );

  return {
    topbarOverflow,
    transcriptSearch,
    transcriptScroll,
    discoveryClient,
    paletteItems,
  };
}
