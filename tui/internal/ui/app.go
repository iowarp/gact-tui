package ui

// app.go declares App, the root Bubbletea model that embeds component state and coordinates the whole TUI.

import "github.com/JaimeCernuda/gact-tui/tui/internal/client"

// App is the root Bubbletea model.
type App struct {
	appConfigState

	appFeedbackState

	c *client.Client

	width, height int
	stage         Stage
	stageError    string
	focus         FocusZone

	// session owns the session domain: the active session list and
	// selection, backend/runtime data (caps, workspaces, context files,
	// task counts, status, permissions), and the new-session setup +
	// per-row action overlays. It embeds the former appSessionState.
	session sessionComponent

	// agent owns the agents domain: the right-sidebar hierarchy tree, the
	// next-turn agent selection, blueprint/detail actions, and the agent
	// message-handlers. It embeds the former appAgentHierarchyState.
	agent agentComponent

	// fileViewer owns the process-local sidebar file tree (cwd/workspace
	// backed) and its detail-preview rendering.
	fileViewer fileViewerComponent

	// connection owns the backend connect handshake + SSE stream and
	// reconnect lifecycle: the connect/reconnect commands, the SSE message
	// handlers, the backoff schedule, and the stream/replay state (embedded
	// appConnectionState). App.Update routes the connect/SSE messages here.
	connection connectionComponent

	// execution owns the per-session SSE ledger and the projection /
	// rendering / detail behaviour for CLIO's execution transcript.
	execution executionComponent

	// cmdPalette owns the slash-command palette: command/plugin data,
	// the filter/cursor/selection state, message-search, and the
	// open/close lifecycle plus all rendering and dispatch behaviour.
	cmdPalette commandPaletteComponent

	// conversation owns the transcript domain: messages, viewport
	// scroll/selection, render cache, and the conversation action menu. It
	// embeds the former appConversationState.
	conversation conversationComponent

	// interaction owns the per-frame hit-target registry (clickable/
	// scrollable zones) plus the register/activate/lookup behaviour. The
	// top-level mouse-event routing stays on App but delegates here.
	interaction interactionComponent

	// modals is the shared modal-rendering scaffold: the reusable primitives
	// (frame/surface/header/buttons/tabs/lists/text-entry/action-menu and the
	// width/row layout helpers) that every overlay composes. It owns no state
	// and renders via modals.app.
	modals modalkit

	// clipboard owns mouse drag-to-copy selection (conversation + detail
	// overlay), the clipboard command helpers, and the full-transcript copy
	// cache.
	clipboard clipboardComponent

	appInputState

	// inputComposer owns the conversation input surface: textarea, paste
	// handling, the compose modal, per-session drafts, and prompt history.
	inputComposer inputComposerComponent

	// catalog owns the catalog-browser modal (/mcp, /tools, /experts,
	// /prompts, …): its open flag, the drill-down browser stack, and the
	// disabled-tools filter set.
	catalog catalogComponent

	appLifecycleState

	appOverlayState

	// spinnerFrame drives the running-session animation — advanced by
	// spinnerTickMsg as long as any session is non-idle. Cheap (single
	// int, no timers when idle) so it's fine to leave in even when no
	// session is active.
	spinnerFrame int

	// sidebar owns the session/sidebar navigation surface: module panes,
	// filters, section focus, hit-test zones, and reload flags.
	sidebar sidebarComponent

	// ticker owns the two self-rescheduling animation loops — the splash
	// frame advance and the running-session spinner — plus the spinnerChar
	// glyph lookup. The frame counters stay App fields (read by renderers
	// and tests); the ticker advances them through its app back-reference.
	ticker tickerComponent

	// permission owns the pending-permission approval domain: the a/d/s/w
	// banner keys, the inspector-response handler, and the conversation-pane
	// banner rendering + hit geometry. State lives on session.
	permission permissionComponent

	// memory owns the memory-stats domain: it caches the latest
	// /v1/memory/stats snapshot the footer chip renders. State lives on
	// session.
	memory memoryComponent

	// plugins owns the slash-palette plugin domain: command lookup and
	// background-exec result surfacing. The flattened command tuples live on
	// cmdPalette.
	plugins pluginsComponent

	audit *tuiAuditRecorder
}
