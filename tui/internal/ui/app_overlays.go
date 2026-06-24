package ui

// overlayViewBinding pairs an "is this overlay active?" predicate with its
// renderer. viewMain paints each active overlay in order (last-rendered wins),
// so the slice order IS the paint/z-order. Note this differs intentionally from
// the key-dispatch order (overlayKeyBindings): quit-confirm paints on top of
// everything so its Ctrl+C prompt is never hidden by another modal.
type overlayViewBinding struct {
	active func(*App) bool
	view   func(*App) string
}

var overlayViewBindings = []overlayViewBinding{
	{func(a *App) bool { return a.cmdPalette.paletteOpen }, func(a *App) string { return a.cmdPalette.view() }},
	{func(a *App) bool { return a.help.open }, func(a *App) string { return a.help.view() }},
	{func(a *App) bool { return a.settings.open }, func(a *App) string { return a.settings.view() }},
	{func(a *App) bool { return a.sidebarLayout.open }, func(a *App) string { return a.sidebar.viewLayoutEditor() }},
	{func(a *App) bool { return a.metrics.open }, func(a *App) string { return a.metrics.view() }},
	{func(a *App) bool { return a.doctor.open }, func(a *App) string { return a.doctor.view() }},
	{func(a *App) bool { return a.lmConfig.open }, func(a *App) string { return a.lmConfig.view() }},
	{func(a *App) bool { return a.workspace.switchOpen }, func(a *App) string { return a.workspace.view() }},
	{func(a *App) bool { return a.rename.open }, func(a *App) string { return a.rename.view() }},
	{func(a *App) bool { return a.session.actions.open }, func(a *App) string { return a.session.viewActions() }},
	{func(a *App) bool { return a.contextActions.open }, func(a *App) string { return a.contextActions.view() }},
	{func(a *App) bool { return a.conversation.actions.open }, func(a *App) string { return a.conversation.viewActions() }},
	{func(a *App) bool { return a.askUser.open }, func(a *App) string { return a.askUser.view() }},
	{func(a *App) bool { return a.retryNotes.open }, func(a *App) string { return a.retryNotes.view() }},
	{func(a *App) bool { return a.retryModel.open }, func(a *App) string { return a.retryModel.view() }},
	{func(a *App) bool { return a.contextAdd.open }, func(a *App) string { return a.contextAdd.view() }},
	{func(a *App) bool { return a.catalog.open }, func(a *App) string { return a.catalog.view() }},
	{func(a *App) bool { return a.promptEdit.open }, func(a *App) string { return a.promptEdit.view() }},
	{func(a *App) bool { return a.agentWrite.open }, func(a *App) string { return a.agentWrite.view() }},
	{func(a *App) bool { return a.agentEdit.open }, func(a *App) string { return a.agentEdit.view() }},
	{func(a *App) bool { return a.agentBlueprintManage.open }, func(a *App) string { return a.agentBlueprintManage.view() }},
	{func(a *App) bool { return a.expertPackInstall.open }, func(a *App) string { return a.expertPackInstall.view() }},
	{func(a *App) bool { return a.session.setupOpen }, func(a *App) string { return a.session.viewSetup() }},
	{func(a *App) bool { return a.detail.visible }, func(a *App) string { return a.detail.view() }},
	{func(a *App) bool { return a.inputComposer.composeOpen }, func(a *App) string { return a.inputComposer.viewCompose() }},
	{func(a *App) bool { return a.filePicker.open }, func(a *App) string { return a.filePicker.view() }},
	{func(a *App) bool { return a.mcpInstall.open }, func(a *App) string { return a.mcpInstall.view() }},
	{func(a *App) bool { return a.mcpRemove.open }, func(a *App) string { return a.mcpRemove.view() }},
	{func(a *App) bool { return a.quitConfirm.open }, func(a *App) string { return a.quitConfirm.view() }},
}

func (a *App) viewMain() string {
	base := a.viewMainBase()
	if a.interaction.hits != nil {
		a.interaction.baseHitTargetCount = len(a.interaction.hits.targets)
	}
	for _, binding := range overlayViewBindings {
		if binding.active(a) {
			base = overlay(base, binding.view(a), a.width, a.height)
		}
	}
	return base
}
