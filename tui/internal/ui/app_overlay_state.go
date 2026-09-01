package ui

// appOverlayState: the aggregate of all modal/overlay sub-components hung off App.

import (
	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// appOverlayState groups transient modal and overlay state. It is embedded in
// App so existing handlers keep using direct field access while the root model
// no longer mixes every overlay buffer into its core session/SSE state.
type appOverlayState struct {
	// Chrome: the persistent header + footer frame and pane-focus
	// navigation. A self-owning, stateless component — it renders the
	// visual frame from shared App state and owns no buffers itself; the
	// app back-ref is wired in wireComponents().
	chrome chromeComponent

	// Help overlay
	help helpModal

	// Ctrl+C confirmation overlay. User feedback: "ctrl+c
	// should have a confirmation window, close? yes no detach". Opens
	// a small 3-option modal on first Ctrl+C; the selected option
	// fires on Enter. Second Ctrl+C while open accepts the current
	// selection so muscle-memory "ctrl+c ctrl+c" still quits.
	quitConfirm quitConfirmModal

	// Settings overlay. A self-owning component (state + behaviour +
	// app back-ref). open is the authority for visibility.
	settings settingsComponent

	// Sidebar layout editor. Opened from Settings > TUI and backed by
	// the same sidebar_layout.left/right config shape. Only the transient
	// editor cursor lives here; the persisted module lists + grab/configured
	// flags stay on App proper.
	sidebarLayout sidebarLayoutModal

	// Metrics overlay. A self-owning component (state + TUI latency
	// telemetry + behaviour + app back-ref).
	metrics metricsComponent

	// CLIO-BBBBBBBBBB-D: LM-config modal - opened on first connect
	// when /v1/health reports the agent (or "lm" subsystem) as
	// unavailable, so the user picks a provider/model before they
	// type anything. Backends that don't expose /v1/providers/lm
	// (everything except clio-agent-gact) skip this entirely.
	// A self-owning component (open flag + embedded transient editing
	// state + behaviour + app back-ref).
	lmConfig lmConfigComponent
	// Cached LM provider info (set on every lmConfigFetchedMsg). Powers
	// the header model chip (#363) so we don't need a per-render fetch.
	// Stays on App (not in the component) because the header chip reads
	// it while the modal is closed.
	lmProviderInfo *client.LMProviderInfo

	// Doctor overlay (v0.2 §3.4): /doctor system-readiness
	// view. A self-owning component (state + behaviour + app back-ref).
	doctor doctorComponent

	// MCP install / remove overlays. Tied to the /mcp-install +
	// /mcp-remove slash commands. State is intentionally tiny - install
	// is a one-line input, remove is a picker over the current
	// a.mcpServers slice (filtered to third-party).
	mcpInstall mcpInstallModal
	mcpRemove  mcpRemoveModal

	// Agent blueprint install / validate overlay. Opened from the
	// /agent-blueprints catalog action rows and shared by both workflows:
	// install accepts a path/URL/source, validate accepts a path.
	agentBlueprintManage agentBlueprintManageModal

	// Expert-pack install overlay. Opened from /expert-packs with i so
	// install/update/delete live in the same operator surface.
	expertPackInstall expertPackInstallModal

	// Cached MCP server list, populated each time /mcp opens. The remove
	// modal reads from this so it doesn't need an extra round-trip.
	mcpServers []gact.McpServer

	// Workspace switcher overlay - up/down to navigate the current
	// a.session.workspaces slice, Enter to switch, Esc to cancel. Reuses the
	// already-loaded workspace list (connectCmd populates it) so the
	// modal opens without re-hitting the backend.
	workspace workspaceModal

	// Rename modal - inline prompt to change a session's title.
	// Opened by `e` on a selected session in the sidebar. We roll
	// our own input (not bubbles/textarea) because we want a single-
	// line, single-purpose editor and the full textarea styling would
	// overwhelm this tiny overlay.
	rename renameModal

	// Context action menu. Mirrors sessionActions for rendered context
	// rows so file metadata/detail/copy/remove actions share the same
	// selectable modal primitives instead of growing sidebar-specific
	// coordinate branches.
	contextActions contextActionsModal

	// Ask-user and retry-note modals. These use separate draft buffers so
	// answering an agent question or retrying with notes never mutates the
	// normal composer draft.
	askUser    askUserModal
	retryNotes retryNotesModal
	retryModel retryModelModal

	// Context-file add modal - same shape as rename, different
	// purpose. Opened by `o` in sidebar focus. Enter POSTs to
	// /v1/sessions/{id}/context/files; Esc cancels.
	contextAdd contextAddModal

	// Session context-file domain logic. Owns the message handlers and
	// detail/preview rendering for files attached to the current session.
	// The backing slice (contextFiles) lives on a.session because the
	// sidebar and other components read it directly; this component only
	// carries the behaviour plus an app back-ref.
	contextFiles contextFilesComponent

	promptEdit promptEditModal

	agentWrite agentWriteModal
	agentEdit  agentEditModal

	// Floating detail view (L3) - shows a bulky tool_result's full
	// content in a scrollable modal. Opens on Ctrl+E from body focus
	// when there's a collapsed tool_result in the loaded messages. Named
	// `detail` (not `detailView`) so the struct field and its *bulkyPartRef
	// ref don't share a selector path.
	detail detailViewModal

	// Per-expert Context usage overlay (SPEC §6.9). The dedicated Context
	// view: an expert selector, the Claude /context-style segmented bar +
	// legend + header, and a "Compact now" action. Opened by Ctrl+O or the
	// footer context indicator; gated on capabilities.x_clio_context_state.
	contextView contextViewComponent
}
