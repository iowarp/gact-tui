package ui

// sessionComponent + appSessionState: the active backend/session runtime data and the new-session setup workflow.

import (
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// sessionComponent owns the session domain: the active session list and
// selection cursor, the backend/runtime data refreshed from the GACT/CLIO API
// (capabilities, memory stats, workspaces, context files, per-session task
// counts, current status, pending permissions), and the new-session setup
// workflow + per-row action menu overlays. It embeds the former App-embedded
// appSessionState so callers keep reading the flat fields via promotion
// (c.sessions, c.selected, …), and holds a back-reference to the root App for
// shared services (client, theme, dimensions, focus, cross-domain components)
// via c.app.
//
// The session list itself has no open/closed lifecycle — it is always part of
// the main chrome — so there is no top-level open flag; the setup overlay
// carries its own setupOpen flag.
type sessionComponent struct {
	app *App
	appSessionState

	// New-session workflow picker. Opened by Ctrl+B, Ctrl+N, /new, and
	// the Settings > Expert defaults row. setupOpen is the visibility
	// authority; setup holds the transient picker state (nil when closed).
	setupOpen bool
	setup     *sessionSetupState

	// Session action menu. Opened from a rendered session row's
	// secondary-click target, or with `m` from sidebar focus. Uses the
	// shared selectable-list modal primitives.
	actions sessionActionsModal
}

// appSessionState groups active backend/session runtime data that is refreshed
// from the GACT/CLIO API while the TUI is running.
type appSessionState struct {
	caps gact.Capabilities

	memoryStats gact.MemoryStats
	workspaces  []gact.Workspace
	wsID        string

	sessions []gact.Session
	selected int

	contextFiles   []gact.ContextFile
	contextFileSel int

	taskCountBySession map[string]int

	currentStatus      string
	pendingPermissions []client.PermissionWire
}

// updateSessionStatus mirrors a backend status update into the cached session
// list so the sidebar status dots track reality. No-op when the id isn't in the
// current list (events can arrive for sibling sessions we don't hold).
func (c *sessionComponent) updateSessionStatus(id, status string) {
	for i := range c.sessions {
		if c.sessions[i].ID == id {
			c.sessions[i].Status = status
			return
		}
	}
}

// setCurrentStatus records the status of the currently-selected session, the
// value the header chip and idle-transition detection read.
func (c *sessionComponent) setCurrentStatus(status string) {
	c.currentStatus = status
}

// setSessions replaces the session list wholesale. The method seam for
// cross-domain callers (workspace switch/refresh) that previously poked
// session.sessions directly; sorting/selection stay the caller's job.
func (c *sessionComponent) setSessions(sessions []gact.Session) {
	c.sessions = sessions
}

// setWorkspaceID records the active workspace id. The method seam for the
// workspace-switch modal, which previously wrote session.wsID directly.
func (c *sessionComponent) setWorkspaceID(id string) {
	c.wsID = id
}

// setMemoryStats caches the latest /v1/memory/stats snapshot that the footer
// chip renders. The seam for the memory component, whose state lives here.
func (c *sessionComponent) setMemoryStats(stats gact.MemoryStats) {
	c.memoryStats = stats
}

// markSessionSettled applies a terminal status to the session with the given
// id and, when it is the current session, updates the header status too. The
// method seam for the conversation component's SSE settle path.
func (c *sessionComponent) markSessionSettled(sid, status string) {
	if sid == "" {
		return
	}
	for i := range c.sessions {
		if c.sessions[i].ID == sid {
			c.sessions[i].Status = status
			break
		}
	}
	if sid == c.currentID() {
		c.currentStatus = status
	}
}

// selectSessionIndex sets the active session selection cursor. The method seam
// for cross-domain callers (sidebar navigation, hit targets) that steer which
// session row is highlighted; it does not load the session — pair it with
// selectIndex when a switch must follow. Raw index assignment, matching the
// former inline pokes (callers stay responsible for range validity).
func (c *sessionComponent) selectSessionIndex(index int) {
	c.selected = index
}

// selectContextFile sets the context-file selection cursor. The method seam
// for cross-domain callers (sidebar nav, mouse, hit targets, context actions)
// that previously wrote session.contextFileSel directly.
func (c *sessionComponent) selectContextFile(index int) {
	c.contextFileSel = index
}

// clearScopedState wipes the session-scoped fields that do not survive a
// workspace switch: the context-file list, any pending permission prompts, and
// the current status. It mirrors the inline writes the workspace modal
// previously performed, the seam for that cross-domain teardown caller.
func (c *sessionComponent) clearScopedState() {
	c.contextFiles = nil
	c.pendingPermissions = nil
	c.currentStatus = ""
}

// addPendingPermission appends a pending permission request awaiting a decision.
func (c *sessionComponent) addPendingPermission(p client.PermissionWire) {
	c.pendingPermissions = append(c.pendingPermissions, p)
}

// removePendingPermission drops the pending permission with the given id, if
// present. No-op for empty ids or unknown ids.
func (c *sessionComponent) removePendingPermission(id string) {
	if id == "" {
		return
	}
	for i, p := range c.pendingPermissions {
		if p.ID == id {
			c.pendingPermissions = append(c.pendingPermissions[:i], c.pendingPermissions[i+1:]...)
			return
		}
	}
}
