package ui

// inputComposerComponent + appInputState: the conversation input surface (textarea, paste, compose modal, drafts).

import "charm.land/bubbles/v2/textarea"

// appInputState holds the @-file-picker overlay state that the file-picker
// domain owns. The composer/paste/compose/draft/history state moved onto
// inputComposerComponent (see app_input_state.go's inputComposerComponent and
// the input_* / paste* / compose / session_drafts files); only the file-picker
// fields remain here because that overlay is allocated and driven by the
// file-picker domain.
type appInputState struct {
	// filePicker is a self-owning component (open flag + embedded
	// filePickerState + behaviour + app back-ref). open is the authority for
	// visibility; the app back-ref is wired in wireComponents().
	filePicker filePickerComponent
}

// inputComposerComponent owns the conversation input surface: the live
// textarea, in-flight paste handling, the compose modal, per-session drafts,
// compressed paste records, and the per-session prompt history ring. It holds
// a back-reference to the root App so its methods can reach shared services
// (client, theme, dimensions, focus, cross-domain overlays) via c.app.
//
// The compose modal still uses a *composeState pointer (nil == closed); the
// composeOpen flag mirrors the existing lifecycle convention.
type inputComposerComponent struct {
	app *App

	input textarea.Model

	inPaste     bool
	pasteBuffer string

	composeOpen bool
	compose     *composeState

	fileMentions []composerFileMention

	inputDraftBySession   map[string]string
	fileMentionsBySession map[string][]composerFileMention
	lastLoadedSessionID   string

	pastes []pastedSegment

	// Per-session prompt history (formerly on appSidebarState). historyCursor
	// is -1 when not navigating; historyDraft preserves the pre-history draft
	// so down-past-the-end restores it.
	inputHistoryBySession map[string][]string
	historyCursor         int
	historyDraft          string
}
