/**
 * Live-backend Chat variant: wires the live controllers into ChatLayout.
 * Exports {@link ChatScreenLiveDriven}.
 */
import { activityLabelFromSemanticEvents } from '../activity-label.js';
import { ChatLayout } from './ChatLayout.js';
import {
  createChatScreenLiveController,
  type ChatScreenLiveDrivenProps,
} from './ChatScreenLiveController.js';

export function ChatScreenLiveDriven(props: ChatScreenLiveDrivenProps) {
  const {
    activeId,
    setActiveId,
    density,
    setDensity,
    live,
    liveRuntime,
    workspaceControls,
    turnActions,
    sessionActions,
    sessionList,
    modelControls,
    inspectorData,
    messageActions,
    transcript,
    slashCommands,
    backendGates,
    renameFlash,
  } = createChatScreenLiveController(props);

  return (
    <ChatLayout
      backendUrl={props.backend.url}
      voiceCapable={backendGates().voiceCapable}
      sessions={workspaceControls.filteredRows()}
      sessionsLoading={live.sessions.loading}
      messagesLoading={transcript.messagesLoading()}
      enableOnboarding={true}
      activeId={activeId()}
      workspaces={workspaceControls.workspaces()}
      selectedWorkspaceId={workspaceControls.selectedWorkspaceId()}
      onPickWorkspace={workspaceControls.setSelectedWorkspaceId}
      onSelect={setActiveId}
      density={density()}
      setDensity={setDensity}
      messages={transcript.messages()}
      pendingPermission={transcript.pendingPermission()}
      pendingQuestion={transcript.pendingQuestion()}
      onSubmit={turnActions.sendUserMessage}
      onPermissionDecide={turnActions.decidePermission}
      onAnswerQuestion={turnActions.answerQuestion}
      onCancelQuestion={turnActions.cancelQuestion}
      onStop={turnActions.stopRun}
      onNewSession={workspaceControls.newEmptySession}
      sessionSemanticsOptions={workspaceControls.sessionSemanticsOptions()}
      sessionSemanticsLoading={workspaceControls.sessionSemanticsLoading()}
      onRefreshSessionSemantics={() => void workspaceControls.refetchSessionSemantics()}
      onRefreshSessions={() => live.refetch()}
      onImportSession={sessionActions.importSession}
      onRenameSession={sessionActions.renameSession}
      onDeleteSession={sessionActions.deleteSession}
      onExportSession={sessionActions.exportSession}
      onShareSession={sessionActions.shareSession}
      onForkSession={sessionActions.forkSession}
      onTogglePin={sessionList.togglePin}
      onSummarize={sessionActions.summarizeActive}
      onUndoTurn={sessionActions.undoActive}
      onCompactSession={sessionActions.compactActive}
      models={modelControls.models()}
      modelProviders={modelControls.modelProviders()}
      selectedModelId={modelControls.selectedModelId()}
      onPickModel={modelControls.pickModel}
      permMode={modelControls.permMode()}
      onPickPermMode={modelControls.pickPermMode}
      slashCommands={slashCommands()}
      sessionTasks={inspectorData.sessionTasks()}
      contextFiles={inspectorData.contextFiles()}
      attempts={inspectorData.attempts() ?? []}
      contextFrames={inspectorData.contextFrames()}
      sessionDiffs={inspectorData.sessionDiffs()}
      schedules={inspectorData.schedules()}
      sessionBindings={inspectorData.sessionBindings() ?? undefined}
      inspectorActions={{
        onCycleTaskStatus: inspectorData.cycleTaskStatus,
        // Context-file preview (1.0 item 2). The session-scoped
        // context-file-content endpoint + `x_clio_files_content` flag were
        // removed on clio develop ~2026-06; bytes now come from the
        // workspace-scoped read endpoint, gated on the `files` capability
        // (universally advertised by clio-agent-gact). Resolve the active
        // session's workspace id and read by path.
        onPreviewContextFile: backendGates().contextFilePreviewEnabled
          ? inspectorData.previewContextFile
          : undefined,
        onLoadFrameDetail: inspectorData.loadFrameDetail,
        onApplyAllDiffs: inspectorData.applyAllDiffs,
        onRejectAllDiffs: inspectorData.rejectAllDiffs,
        onCreateSchedule: backendGates().scheduledSessionsEnabled
          ? inspectorData.createSchedule
          : undefined,
        onDeleteSchedule: backendGates().scheduledSessionsEnabled
          ? inspectorData.deleteSchedule
          : undefined,
        onSetBlueprint: inspectorData.bindBlueprint,
        onSetExpertPack: inspectorData.bindExpertPack,
        onRemoveContextFile: inspectorData.removeContextFile,
        onCycleContextFileMode: inspectorData.cycleContextFileMode,
      }}
      detachedSessions={sessionList.detachedSessions()}
      onReattachDetached={sessionList.reattachDetached}
      onWalkAway={sessionList.walkAwayFromActive}
      onRunCommand={sessionActions.runCommand}
      onCopyMessage={messageActions.copyMessageToClipboard}
      onRegenerate={messageActions.regenerateMessage}
      onRegenerateWithNotes={messageActions.regenerateWithNotes}
      onRegenerateWithModel={messageActions.regenerateWithModel}
      onEditMessage={messageActions.editMessage}
      onQuoteMessage={messageActions.quoteMessage}
      onDeleteMessage={messageActions.deleteMessage}
      capsFlags={backendGates().capsFlags}
      onSummarizeWithInstructions={sessionActions.summarizeActiveWithInstructions}
      onExtractAgent={sessionActions.extractAgent}
      onCopyMessagePermalink={messageActions.copyMessagePermalink}
      onSpeakMessage={messageActions.speakMessage}
      onPinFile={inspectorData.pinFileToContext}
      semanticEvents={transcript.semanticEvents()}
      executionEvents={transcript.executionEvents()}
      semanticEventsEnabled={backendGates().semanticEventsEnabled}
      composerDisabled={false}
      renamedSessionId={renameFlash.renamedSessionId()}
      streaming={liveRuntime.streaming()}
      sseStatus={transcript.status()}
      sseReconnectInSec={transcript.reconnectInSec()}
      runningTools={transcript.runningTools()}
      responseActivity={activityLabelFromSemanticEvents(transcript.semanticEvents())}
      streamStats={transcript.streamStats()}
      sessionCostUsd={transcript.costUsd()}
      sessionTokens={transcript.lastCompletion()?.tokens}
      onOpenSettings={workspaceControls.openSettings}
      onAddRemote={props.onAddRemote}
      caps={props.backend.capabilities}
    />
  );
}
