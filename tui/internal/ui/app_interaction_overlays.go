package ui

// app_interaction_overlays.go declares the overlay key-binding table and routes keys to the active overlay/modal.

import (
	tea "charm.land/bubbletea/v2"
)

// overlayKeyBinding pairs an "is this overlay active?" predicate with its key
// handler. handleActiveOverlayKey walks these in z-order (front-most first) and
// dispatches the key to the first active overlay.
type overlayKeyBinding struct {
	active func(*App) bool
	handle func(*App, tea.KeyPressMsg) (tea.Model, tea.Cmd)
}

// overlayKeyBindings is the modal z-order: the first active overlay consumes the
// key. This replaces a 27-branch if-chain — adding an overlay is now one row,
// and the dispatch order is visible in one place. Order is load-bearing and
// must match the historical chain.
var overlayKeyBindings = []overlayKeyBinding{
	{func(a *App) bool { return a.detail.visible }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.detail.handleKey(k) }},
	{func(a *App) bool { return a.rename.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.rename.handleKey(k) }},
	{func(a *App) bool { return a.session.actions.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.session.handleActionsKey(k) }},
	{func(a *App) bool { return a.contextActions.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.contextActions.handleKey(k) }},
	{func(a *App) bool { return a.conversation.actions.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.conversation.handleActionsKey(k) }},
	{func(a *App) bool { return a.askUser.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.askUser.handleKey(k) }},
	{func(a *App) bool { return a.retryNotes.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.retryNotes.handleKey(k) }},
	{func(a *App) bool { return a.retryModel.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.retryModel.handleKey(k) }},
	{func(a *App) bool { return a.contextAdd.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.contextAdd.handleKey(k) }},
	{func(a *App) bool { return a.promptEdit.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.promptEdit.handleKey(k) }},
	{func(a *App) bool { return a.agentWrite.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.agentWrite.handleKey(k) }},
	{func(a *App) bool { return a.agentEdit.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.agentEdit.handleKey(k) }},
	{func(a *App) bool { return a.agentBlueprintManage.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.agentBlueprintManage.handleKey(k) }},
	{func(a *App) bool { return a.expertPackInstall.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.expertPackInstall.handleKey(k) }},
	{func(a *App) bool { return a.session.setupOpen }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.session.handleSetupKey(k) }},
	{func(a *App) bool { return a.workspace.switchOpen }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.workspace.handleKey(k) }},
	{func(a *App) bool { return a.metrics.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.metrics.handleKey(k) }},
	{func(a *App) bool { return a.contextView.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.contextView.handleKey(k) }},
	{func(a *App) bool { return a.doctor.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.doctor.handleKey(k) }},
	{func(a *App) bool { return a.lmConfig.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.lmConfig.handleKey(k) }},
	{func(a *App) bool { return a.mcpInstall.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.mcpInstall.handleKey(k) }},
	{func(a *App) bool { return a.mcpRemove.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.mcpRemove.handleKey(k) }},
	{func(a *App) bool { return a.sidebarLayout.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.sidebar.handleLayoutKey(k) }},
	{func(a *App) bool { return a.settings.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.settings.handleKey(k) }},
	{func(a *App) bool { return a.quitConfirm.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.quitConfirm.handleKey(k) }},
	{func(a *App) bool { return a.help.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
		a.help.handleKey(k)
		return a, nil
	}},
	{func(a *App) bool { return a.inputComposer.composeOpen }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.inputComposer.handleComposeKey(k) }},
	{func(a *App) bool { return a.filePicker.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.filePicker.handleKey(k) }},
	{func(a *App) bool { return a.catalog.open }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.catalog.handleKey(k) }},
	{func(a *App) bool { return a.cmdPalette.paletteOpen }, func(a *App, k tea.KeyPressMsg) (tea.Model, tea.Cmd) { return a.cmdPalette.handleKey(k) }},
}

func (a *App) handleActiveOverlayKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd, bool) {
	for _, binding := range overlayKeyBindings {
		if binding.active(a) {
			model, cmd := binding.handle(a, k)
			return model, cmd, true
		}
	}
	// Permission prompts sit behind the overlays: they only consume the key if
	// the permission handler actually recognizes it, otherwise input falls
	// through to the base layer.
	if len(a.session.pendingPermissions) > 0 {
		if cmd, handled := a.permission.handleKey(k); handled {
			return a, cmd, true
		}
	}
	return a, nil, false
}
