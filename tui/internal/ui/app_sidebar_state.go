package ui

// Sidebar owns the session/sidebar navigation surface: the left/right module
// panes, their filters, collapsible-section focus, hit-test zones, and the
// reload flags that SSE handlers raise. It embeds appSidebarState so its
// methods (and the App back-reference) keep reading the flat fields directly,
// and holds a back-reference to the root App for shared services (client,
// theme, dimensions, focus, cross-domain components) via c.app.
//
// The sidebar has no open/closed lifecycle — it is always part of the main
// chrome — so there is no open flag, just the embedded state.
type sidebarComponent struct {
	app *App
	appSidebarState
}

// beginFilterEdit enters the inline session-filter editor: it marks the filter
// active and snapshots the committed value so a later cancel can roll back. When
// clear is true it also blanks the current filter text. Owns the sidebar filter
// fields so the session controller no longer pokes them directly.
func (c *sidebarComponent) beginFilterEdit(clear bool) {
	c.sessionFilterActive = true
	c.filterSnapshot = c.sessionFilter
	if clear {
		c.sessionFilter = ""
	}
}

// commitFilterEdit ends the filter edit, keeping the current text and dropping
// the snapshot.
func (c *sidebarComponent) commitFilterEdit() {
	c.sessionFilterActive = false
	c.filterSnapshot = ""
}

// cancelFilterEdit ends the filter edit and rolls the text back to the snapshot
// taken when editing began.
func (c *sidebarComponent) cancelFilterEdit() {
	c.sessionFilter = c.filterSnapshot
	c.sessionFilterActive = false
	c.filterSnapshot = ""
}

// setFilter replaces the session-filter text. Used by the inline editor's
// keystroke handler.
func (c *sidebarComponent) setFilter(text string) {
	c.sessionFilter = text
}

// setBodyHitOffset records the horizontal offset the conversation body is
// rendered at so the body's hit registration can subtract it. Returns the
// previous value so the cross-domain caller (conversation render) can restore
// it after rendering. The seam for that caller, which previously poked the
// field directly.
func (c *sidebarComponent) setBodyHitOffset(x int) int {
	prev := c.bodyHitOffsetX
	c.bodyHitOffsetX = x
	return prev
}

// toggleShowArchived flips the archived-sessions view and returns the new value
// so the caller can pick the matching hint / reload command.
func (c *sidebarComponent) toggleShowArchived() bool {
	c.showArchived = !c.showArchived
	return c.showArchived
}

// markPendingRefresh records that the sidebar session list may be stale; the
// next Update drains it via takePendingRefresh and reloads.
func (c *sidebarComponent) markPendingRefresh() {
	c.pendingSidebarRefresh = true
}

// markPendingReload records that the current session's message list should be
// reloaded; the next Update drains it via takePendingReload.
func (c *sidebarComponent) markPendingReload() {
	c.pendingReload = true
}

// takePendingRefresh reports whether a sidebar refresh is pending and clears the
// flag in one step, so the Update loop reads-and-resets through a single seam.
func (c *sidebarComponent) takePendingRefresh() bool {
	if !c.pendingSidebarRefresh {
		return false
	}
	c.pendingSidebarRefresh = false
	return true
}

// takePendingReload reports whether a message reload is pending and clears the
// flag in one step.
func (c *sidebarComponent) takePendingReload() bool {
	if !c.pendingReload {
		return false
	}
	c.pendingReload = false
	return true
}

// appSidebarState groups state that belongs to the session/sidebar navigation
// surface, including its filters, local prompt history, and reload flags.
type appSidebarState struct {
	// pendingDeleteSessionID is the session that the user has armed
	// for deletion by pressing `x` once. The next `x` while this equals
	// the selected session's ID commits; any other key clears it.
	pendingDeleteSessionID string

	// showArchived is true when the sidebar is displaying archived
	// sessions (filter=archived=true) rather than the active list.
	// Toggled via `h` in the sidebar. Refetching the list happens in
	// the toggle handler so the render path can stay pure.
	showArchived bool

	// showDetachedOnly narrows the sidebar to sessions the user has
	// previously Ctrl+Z-detached from. Toggled via `d` in sidebar focus,
	// parallel to the archived toggle.
	showDetachedOnly bool

	// showBusyOnly narrows the sidebar to sessions whose status is
	// running or waiting_permission. Toggled via `b` in sidebar focus.
	showBusyOnly bool

	// showChildSessions expands materialized child/nanoagent sessions
	// in the sidebar. Default is collapsed so benchmark runs with many
	// child sessions keep top-level conversations scannable.
	showChildSessions bool

	// Sidebar sections are independently collapsible so the left pane can grow
	// without becoming a hard-coded sessions/context layout.
	sessionsCollapsed     bool
	filesCollapsed        bool
	contextCollapsed      bool
	sectionFocus          sidebarSection
	sectionCursor         bool
	moduleIDs             []sidebarModuleID
	rightSidebarModuleIDs []sidebarModuleID
	layoutConfigured      bool
	layoutGrabbed         bool
	hitOffsetX            int
	hitFocus              FocusZone
	bodyHitOffsetX        int

	// sessionFilter narrows the sidebar to sessions whose title
	// contains this substring (case-insensitive). Empty means show all.
	// sessionFilterActive is true only while the user is editing the
	// filter text; it commits on Enter and clears on Esc.
	sessionFilter       string
	sessionFilterActive bool
	// filterSnapshot preserves the pre-edit filter value so Esc can roll
	// back the in-progress edit without losing a committed filter.
	filterSnapshot string

	// Set by SSE handlers when the sidebar list might be stale. The next
	// Update reads and clears it, then dispatches reloadSessionsCmd.
	pendingSidebarRefresh bool

	// Set by SSE handlers when the current session's message list should
	// be reloaded from scratch. The next Update reads and clears it, then
	// fires loadMessagesCmd.
	pendingReload bool
}
