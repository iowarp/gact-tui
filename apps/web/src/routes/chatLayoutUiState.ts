/**
 * Solid state container for ChatLayout's transient UI flags (open panels,
 * overlays, selection). Exports {@link createChatLayoutUiState}.
 */
import { createSignal, onMount } from 'solid-js';
import type { FileDiff } from '@clio/core';
import type { RailRoute } from '../components/LeftRail.js';
import { markOnboardingDone, shouldShowOnboarding } from '../components/OnboardingTour.js';
import { createPersistedBoolean } from '../persisted.js';
import { firstFileDiff } from './chatScreenUtils.js';
import type { ChatLayoutProps } from './ChatLayoutTypes.js';

export function createChatLayoutUiState(
  props: Pick<ChatLayoutProps, 'enableOnboarding' | 'preOpen' | 'messages'>,
) {
  const [activeDiff, setActiveDiff] = createSignal<FileDiff | null>(null);
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [paletteQuery, setPaletteQuery] = createSignal('');
  const [cheatsheetOpen, setCheatsheetOpen] = createSignal(false);
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [composeOpen, setComposeOpen] = createSignal(false);
  const [sharedSessionOpen, setSharedSessionOpen] = createSignal(false);
  const [sessionSemanticsOpen, setSessionSemanticsOpen] = createSignal(false);
  const [draftReloadTick, setDraftReloadTick] = createSignal(0);
  const [serverSearchOpen, setServerSearchOpen] = createSignal(false);

  const [tourOpen, setTourOpen] = createSignal(!!props.enableOnboarding && shouldShowOnboarding());
  function finishTour() {
    markOnboardingDone();
    setTourOpen(false);
  }

  const [inspectorOpen, setInspectorOpen] = createPersistedBoolean('clio.inspector-open.v1', false);
  const [previewOpen, setPreviewOpen] = createPersistedBoolean('clio.preview-rail-open.v1', false);
  const [previewPath, setPreviewPath] = createSignal<string | undefined>(undefined);
  const defaultSessionsOpen =
    typeof window !== 'undefined' ? !window.matchMedia('(max-width: 760px)').matches : true;
  const [sessionsOpen, setSessionsOpen] = createPersistedBoolean(
    'clio.sessions-open.v1',
    defaultSessionsOpen,
  );
  const [railRoute, setRailRoute] = createSignal<RailRoute>('sessions');
  const [selectedMessageId, setSelectedMessageId] = createSignal<string>('');

  onMount(() => {
    if (props.preOpen === 'diff') {
      const firstDiff = firstFileDiff(props.messages);
      if (firstDiff) setActiveDiff(firstDiff);
    } else if (props.preOpen === 'palette') {
      setPaletteOpen(true);
    } else if (props.preOpen === 'inspector') {
      setInspectorOpen(true);
    } else if (props.preOpen === 'no-inspector') {
      setInspectorOpen(false);
    }
  });

  return {
    activeDiff,
    setActiveDiff,
    paletteOpen,
    setPaletteOpen,
    paletteQuery,
    setPaletteQuery,
    cheatsheetOpen,
    setCheatsheetOpen,
    catalogOpen,
    setCatalogOpen,
    composeOpen,
    setComposeOpen,
    sharedSessionOpen,
    setSharedSessionOpen,
    sessionSemanticsOpen,
    setSessionSemanticsOpen,
    draftReloadTick,
    setDraftReloadTick,
    serverSearchOpen,
    setServerSearchOpen,
    tourOpen,
    finishTour,
    inspectorOpen,
    setInspectorOpen,
    previewOpen,
    setPreviewOpen,
    previewPath,
    setPreviewPath,
    sessionsOpen,
    setSessionsOpen,
    railRoute,
    setRailRoute,
    selectedMessageId,
    setSelectedMessageId,
  };
}
