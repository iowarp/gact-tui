/**
 * Top-level chat layout: composes the sessions column, main column, side
 * panels and overlays. Exports {@link ChatLayout}.
 */
import { Show } from 'solid-js';
import { ChatLayoutOverlays } from './ChatLayoutOverlays.js';
import { ChatLayoutMainColumn } from './ChatLayoutMainColumn.js';
import { ChatLayoutSessionsColumn } from './ChatLayoutSessionsColumn.js';
import { ChatLayoutSidePanels } from './ChatLayoutSidePanels.js';
import { createChatLayoutModel } from './chatLayoutModel.js';
import { ContextFooter } from '../components/ContextFooter.js';
import type { ChatLayoutProps } from './ChatLayoutTypes.js';

export type { ChatLayoutProps } from './ChatLayoutTypes.js';
export function ChatLayout(props: ChatLayoutProps) {
  const {
    activeDiff,
    setActiveDiff,
    paletteOpen,
    setPaletteOpen,
    paletteQuery,
    setPaletteQuery,
    cheatsheetOpen,
    setCheatsheetOpen,
    catalogOpen,
    composeOpen,
    sharedSessionOpen,
    sessionSemanticsOpen,
    draftReloadTick,
    setDraftReloadTick,
    serverSearchOpen,
    setServerSearchOpen,
    tourOpen,
    finishTour,
    topbarOverflow,
    transcriptSearch,
    inspectorOpen,
    setInspectorOpen,
    previewOpen,
    setPreviewOpen,
    previewPath,
    setPreviewPath,
    setSessionsOpen,
    railRoute,
    setRailRoute,
    selectedMessageId,
    setSelectedMessageId,
    transcriptScroll,
    discoveryClient,
    paletteItems,
    activeRow,
    inspectorTarget,
    toolCallsForInspector,
    connectionTone,
    onChat,
    showSessionsColumn,
    previewWorkspaceId,
    openSessionSemanticsPicker,
    handlePick,
    emptyTranscript,
    isNarrowViewport,
    selectFromSessionsColumn,
    secondaryChips,
    setSessionSemanticsOpen,
    setComposeOpen,
    setCatalogOpen,
    setSharedSessionOpen,
  } = createChatLayoutModel(props);

  return (
    <div
      class={
        'chat ' +
        (onChat() ? '' : 'chat--discovery') +
        (onChat() && inspectorOpen() ? ' chat--inspector-open' : '') +
        (onChat() && previewOpen() ? ' chat--preview-open' : '') +
        (onChat() && !showSessionsColumn() ? ' chat--no-sessions' : '') +
        (onChat() && emptyTranscript() ? ' chat--empty-transcript' : '')
      }
      data-testid="chat-screen"
    >
      <ChatLayoutSessionsColumn
        props={props}
        discoveryClient={discoveryClient}
        showSessionsColumn={showSessionsColumn}
        connectionTone={connectionTone}
        isNarrowViewport={isNarrowViewport}
        selectFromSessionsColumn={selectFromSessionsColumn}
        openSessionSemanticsPicker={openSessionSemanticsPicker}
        setSessionsOpen={setSessionsOpen}
      />

      <ChatLayoutMainColumn
        props={props}
        discoveryClient={discoveryClient}
        onChat={onChat}
        railRoute={railRoute}
        setRailRoute={setRailRoute}
        topbarOverflow={topbarOverflow}
        transcriptSearch={transcriptSearch}
        transcriptScroll={transcriptScroll}
        activeRow={activeRow}
        showSessionsColumn={showSessionsColumn}
        previewOpen={previewOpen}
        setPreviewOpen={setPreviewOpen}
        inspectorOpen={inspectorOpen}
        setInspectorOpen={setInspectorOpen}
        setSessionsOpen={setSessionsOpen}
        selectedMessageId={selectedMessageId}
        setSelectedMessageId={setSelectedMessageId}
        draftReloadTick={draftReloadTick}
        setPaletteOpen={setPaletteOpen}
        setActiveDiff={setActiveDiff}
        renderSecondaryChips={secondaryChips}
      />

      <ChatLayoutSidePanels
        props={props}
        discoveryClient={discoveryClient}
        onChat={onChat}
        inspectorOpen={inspectorOpen}
        setInspectorOpen={setInspectorOpen}
        previewOpen={previewOpen}
        setPreviewOpen={setPreviewOpen}
        previewPath={previewPath}
        setPreviewPath={setPreviewPath}
        previewWorkspaceId={previewWorkspaceId}
        inspectorTarget={inspectorTarget}
        toolCallsForInspector={toolCallsForInspector}
        setActiveDiff={setActiveDiff}
      />

      <ChatLayoutOverlays
        props={props}
        discoveryClient={discoveryClient}
        activeDiff={activeDiff}
        setActiveDiff={setActiveDiff}
        paletteOpen={paletteOpen}
        setPaletteOpen={setPaletteOpen}
        paletteQuery={paletteQuery}
        setPaletteQuery={setPaletteQuery}
        paletteItems={paletteItems}
        handlePick={handlePick}
        cheatsheetOpen={cheatsheetOpen}
        setCheatsheetOpen={setCheatsheetOpen}
        tourOpen={tourOpen}
        finishTour={finishTour}
        sharedSessionOpen={sharedSessionOpen}
        setSharedSessionOpen={setSharedSessionOpen}
        sessionSemanticsOpen={sessionSemanticsOpen}
        setSessionSemanticsOpen={setSessionSemanticsOpen}
        composeOpen={composeOpen}
        setComposeOpen={setComposeOpen}
        setDraftReloadTick={setDraftReloadTick}
        catalogOpen={catalogOpen}
        setCatalogOpen={setCatalogOpen}
        serverSearchOpen={serverSearchOpen}
        setServerSearchOpen={setServerSearchOpen}
        setSelectedMessageId={setSelectedMessageId}
      />

      <Show when={onChat() && props.activeId}>
        <div class="chat__context-footer" data-testid="chat-context-footer">
          <ContextFooter
            client={discoveryClient}
            sessionId={props.activeId}
            {...(props.sessionBindings?.pack_id
              ? {
                  activeExpert: props.sessionBindings.pack_id,
                  activeExpertLabel: props.sessionBindings.pack_id,
                }
              : {})}
          />
        </div>
      </Show>
    </div>
  );
}
