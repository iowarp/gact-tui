package ui

// app_update_dispatch.go dispatches incoming Bubbletea messages to the owning component's handler.

import tea "charm.land/bubbletea/v2"

func (a *App) dispatchUpdateMessage(msg tea.Msg) (tea.Model, tea.Cmd) {
	if model, cmd, ok := a.inputComposer.dispatch(msg); ok {
		return model, cmd
	}
	switch m := msg.(type) {
	case connectedMsg:
		return a.connection.handleConnected(m)

	case commandsLoadedMsg:
		return a.cmdPalette.handleCommandsLoaded(m)

	case memoryStatsMsg:
		return a.memory.handleStats(m)

	case lmConfigFetchedMsg:
		return a.lmConfig.handleFetched(m)

	case lmConfigModelsLoadedMsg:
		return a.lmConfig.handleModelsLoaded(m)

	case lmConfigAuthedMsg:
		return a.lmConfig.handleAuthed(m)

	case lmConfigSavedMsg:
		return a.lmConfig.handleSaved(m)

	case doctorFetchedMsg:
		return a.doctor.handleFetched(m)

	case sessionSummarizedMsg:
		return a.session.handleSummarized(m)

	case errMsg:
		return a.chrome.handleErr(m)

	case hintExpireMsg:
		return a.chrome.handleHintExpire(m)

	case retryConnectMsg:
		return a.connection.handleRetryConnect(m)

	case spinnerTickMsg:
		return a.ticker.handleSpinnerTick(m)

	case fileViewerRefreshTickMsg:
		return a.fileViewer.handleRefreshTick(m)

	case searchResultsMsg:
		return a.cmdPalette.handleSearchResults(m)

	case pluginExecMsg:
		return a.plugins.handleExec(m)

	case messagesLoadedMsg:
		return a.connection.handleMessagesLoaded(m)

	case sessionTasksLoadedMsg:
		return a.session.handleTasksLoaded(m)

	case contextFilesLoadedMsg:
		return a.contextFiles.handleFilesLoaded(m)

	case contextFileContentLoadedMsg:
		return a.contextFiles.handleContentLoaded(m)

	case postFailedMsg:
		return a.conversation.handlePostFailed(m)

	case agentQuestionAnsweredMsg:
		return a.agent.handleAgentQuestionAnswered(m)

	case agentQuestionCancelledMsg:
		return a.agent.handleAgentQuestionCancelled(m)

	case retryTurnStartedMsg:
		return a.conversation.handleRetryTurnStarted(m)

	case msgPostedAck:
		return a.conversation.handleMsgPostedAck(m)

	case sessionTitleRenamedMsg:
		return a.session.handleTitleRenamed(m)

	case contextFileAddedMsg:
		return a.contextFiles.handleAdded(m)

	case contextFileUploadedMsg:
		return a.contextFiles.handleUploaded(m)

	case localFileExternalOpenMsg:
		return a.detail.handleLocalFileExternalOpen(m)

	case contextFileRemovedMsg:
		return a.contextFiles.handleRemoved(m)

	case sessionArchivedMsg:
		return a.session.handleArchived(m)

	case sseConnectedMsg:
		return a.connection.handleSSEConnected(m)

	case sseOpenCanceledMsg:
		return a.connection.handleSSEOpenCanceled(m)

	case sseEventMsg:
		return a.connection.handleSSEEvent(m)

	case sseBatchMsg:
		return a.connection.handleSSEBatch(m)

	case sseClosedMsg:
		return a.connection.handleSSEClosed(m)

	case reconnectMsg:
		return a.connection.handleReconnect(m)

	case sessionCreatedMsg:
		return a.session.handleCreated(m)

	case sessionSetupLoadedMsg:
		return a.session.handleSetupLoaded(m)

	case filePickerLoadedMsg:
		return a.filePicker.handleLoaded(m)

	case catalogBrowserLoadedMsg:
		return a.catalog.handleLoaded(m)

	case catalogDetailLoadedMsg:
		return a.catalog.handleDetailLoaded(m)

	case permissionInspectorRespondedMsg:
		return a.permission.handleInspectorResponded(m)

	case expertPackActivatedMsg:
		return a.catalog.handleExpertPackActivated(m)

	case expertPackManagedMsg:
		return a.catalog.handleExpertPackManaged(m)

	case promptSavedMsg:
		return a.catalog.handlePromptSaved(m)

	case agentBlueprintActivatedMsg:
		return a.agent.handleAgentBlueprintActivated(m)

	case agentBlueprintMCPEnabledMsg:
		return a.agent.handleAgentBlueprintMCPEnabled(m)

	case agentBlueprintHookEnabledMsg:
		return a.agent.handleAgentBlueprintHookEnabled(m)

	case agentBlueprintManagedMsg:
		return a.agent.handleAgentBlueprintManaged(m)

	case agentBlueprintSourceManagedMsg:
		return a.agent.handleAgentBlueprintSourceManaged(m)

	case promptEditLoadedMsg:
		return a.promptEdit.handleLoaded(m)

	case agentWriteDoneMsg:
		return a.agentWrite.handleDone(m)

	case agentLoadedForEditMsg:
		return a.agent.handleAgentLoadedForEdit(m)

	case agentEditedMsg:
		return a.agent.handleAgentEdited(m)

	case agentDeletedMsg:
		return a.agent.handleAgentDeleted(m)

	case agentBlueprintManageDoneMsg:
		return a.agent.handleAgentBlueprintManageDone(m)

	case sessionRewindDoneMsg:
		return a.session.handleRewindDone(m)

	case sessionUndoDoneMsg:
		return a.session.handleUndoDone(m)

	case mcpServersFetchedMsg:
		return a.mcpRemove.handleServersFetched(m)

	case mcpInstallDoneMsg:
		return a.mcpInstall.handleInstallDone(m)

	case mcpUninstallDoneMsg:
		return a.mcpRemove.handleUninstallDone(m)

	case mcpReconnectDoneMsg:
		return a.mcpRemove.handleReconnectDone(m)

	case settingsLoadedMsg:
		return a.settings.handleLoaded(m)

	case voiceTranscribedMsg:
		return a.inputComposer.handleVoiceTranscribed(m)

	case metricsLoadedMsg:
		return a.metrics.handleLoaded(m)

	case sessionUpdatedMsg:
		return a.settings.handleSessionUpdated(m)

	case diffsAppliedMsg:
		return a.conversation.handleDiffsApplied(m)

	case diffsRejectedMsg:
		return a.conversation.handleDiffsRejected(m)

	case sessionsRefreshedMsg:
		return a.session.handleRefreshed(m)

	case sessionDeletedMsg:
		return a.session.handleSessionDeleted(m)

	case workspaceSwitchedMsg:
		return a.workspace.handleSwitched(m)

	case workspaceCreatedMsg:
		return a.workspace.handleCreated(m)

	case workspaceDeletedMsg:
		return a.workspace.handleDeleted(m)

	case agentHierarchyLoadedMsg:
		return a.agent.handleAgentHierarchyLoaded(m)

	case contextStateLoadedMsg:
		return a.contextView.handleLoaded(m)

	case footerContextStateMsg:
		return a.contextView.handleFooterState(m)
	}
	return a, nil
}
