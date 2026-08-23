package ui

// session_controller.go manages the session list: selection, sorting, creation, and runtime scope.

import (
	"fmt"
	"sort"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (c *sessionComponent) currentID() string {
	if c.selected < 0 || c.selected >= len(c.sessions) {
		return ""
	}
	return c.sessions[c.selected].ID
}

// applyConnected installs the backend snapshot delivered by the initial
// /connect round-trip: capabilities, the workspace list + active workspace,
// and the session list (sorted by activity). It owns the session-domain
// portion of handleConnected so the coordinator only orchestrates
// cross-component follow-up (file-tree sync, capability-gated fetches).
func (c *sessionComponent) applyConnected(caps gact.Capabilities, workspaces []gact.Workspace, wsID string, sessions []gact.Session) {
	c.caps = caps
	c.workspaces = workspaces
	c.wsID = wsID
	c.sessions = sessions
	c.sortByActivity()
}

func (c *sessionComponent) runtimeScope() client.RuntimeScope {
	return client.RuntimeScope{
		WorkspaceID: c.wsID,
		SessionID:   c.currentID(),
	}
}

func (c *sessionComponent) indexByID(id string) int {
	for i, s := range c.sessions {
		if s.ID == id {
			return i
		}
	}
	return -1
}

type sessionCreatedMsg struct {
	session         gact.Session
	semanticWarning string
}

func (c *sessionComponent) handleCreated(m sessionCreatedMsg) (tea.Model, tea.Cmd) {
	c.sessions = append([]gact.Session{m.session}, c.sessions...)
	c.sortByActivity()
	c.selected = c.indexByID(m.session.ID)
	if c.selected < 0 {
		c.selected = 0
	}
	if strings.TrimSpace(m.semanticWarning) != "" {
		c.app.setHint("session created; setup warning: " + m.semanticWarning)
	}
	return c.app, c.selectIndex(c.selected)
}

func sessionActivityTime(s gact.Session) time.Time {
	if !s.UpdatedAt.IsZero() {
		return s.UpdatedAt
	}
	return s.CreatedAt
}

func (c *sessionComponent) sortByActivity() {
	if len(c.sessions) < 2 {
		return
	}
	sort.SliceStable(c.sessions, func(i, j int) bool {
		left := sessionActivityTime(c.sessions[i])
		right := sessionActivityTime(c.sessions[j])
		if left.Equal(right) {
			return c.sessions[i].ID < c.sessions[j].ID
		}
		return left.After(right)
	})
}

func (c *sessionComponent) appendModelSwapMarker(info *client.LMProviderInfo) {
	if info == nil || !info.Configured || strings.TrimSpace(info.Model) == "" {
		return
	}
	sid := c.currentID()
	if sid == "" {
		return
	}
	label := joinModelLabel(info.Provider, info.Model)
	if label == "" {
		return
	}
	if len(c.app.conversation.messages) > 0 {
		last := c.app.conversation.messages[len(c.app.conversation.messages)-1]
		if isModelSwapMarker(last) && last.Metadata["label"] == label {
			return
		}
	}
	now := time.Now()
	c.app.conversation.appendSwapMarker(gact.Message{
		ID:        fmt.Sprintf("local_model_swap_%d", now.UnixNano()),
		SessionID: sid,
		Role:      gact.RoleSystem,
		CreatedAt: now,
		UpdatedAt: now,
		Metadata: map[string]any{
			"gact_tui_kind": modelSwapMarkerKind,
			"label":         label,
			"provider":      info.Provider,
			"model":         info.Model,
		},
	})
}

// selectIndex switches the active session, loads messages + context files,
// and reopens SSE.
// pickAttachIndex chooses the initial sidebar selection given the
// session list and (optional) AttachSessionID. Returns the chosen
// index plus a missing flag set when an explicit AttachSessionID
// didn't match any session — caller surfaces a transient hint.
// (OOO1; pulled out of connectedMsg so tests can target the
// decision logic without firing the network-bound selectIndex Cmd.)
//
// Matching strategy is precedence-ordered:
//  1. exact id match
//  2. exact title match (case-sensitive — preserves OOO1 behaviour)
//  3. id PREFIX match (so an 8-char `sess_abc1…` resolves)
//  4. title SUBSTRING match, case-insensitive (so `attach refactor`
//     resolves "refactor api auth")
//
// Each precedence level is tried fully across the list before
// falling through. Within a level, first match wins — backends
// typically order sessions newest-first so this picks the most
// recent. missing=true only when no level produced any match.
func (c *sessionComponent) pickAttachIndex() (idx int, missing bool) {
	if c.app.AttachSessionID == "" {
		return 0, false
	}
	target := c.app.AttachSessionID
	targetLower := strings.ToLower(target)
	// 1. exact id.
	for i, s := range c.sessions {
		if s.ID == target {
			return i, false
		}
	}
	// 2. exact title (case-sensitive — explicit > heuristic).
	for i, s := range c.sessions {
		if s.Title == target {
			return i, false
		}
	}
	// 3. id prefix.
	for i, s := range c.sessions {
		if strings.HasPrefix(s.ID, target) {
			return i, false
		}
	}
	// 4. title substring (case-insensitive).
	for i, s := range c.sessions {
		if strings.Contains(strings.ToLower(s.Title), targetLower) {
			return i, false
		}
	}
	return 0, true
}

func (c *sessionComponent) selectIndex(idx int) tea.Cmd {
	if idx < 0 || idx >= len(c.sessions) {
		return nil
	}
	a := c.app
	sid := c.sessions[idx].ID
	a.inputComposer.swapDraftFor(sid)

	a.conversation.resetForSession(nil)
	c.contextFiles = nil
	c.contextFileSel = 0
	c.currentStatus = c.sessions[idx].Status
	c.pendingPermissions = nil
	a.sidebar.pendingDeleteSessionID = ""   // armed delete is per-session; clear on switch
	a.cmdPalette.pendingClearSessionID = "" // same for /clear confirmation
	// New session ⇒ its own event stream. Restore the session-specific
	// high-water mark so revisiting a session does not replay and
	// re-render the same live semantic trace.
	a.connection.lastSeenSeqID = a.connection.lastSeenSeqIDBySession[sid]
	return tea.Batch(
		loadMessagesCmd(a.c, sid),
		loadContextFilesCmd(a.c, sid),
		loadSessionTasksCmd(a.c, sid), // UUU1: refresh task badge
		loadAgentHierarchyCmd(a.c, c.runtimeScope()),
		loadCommandsCmd(a.c, c.runtimeScope()),
		a.session.startSSE(sid),
	)
}

func (c *sessionComponent) mergeContextFiles(files []gact.ContextFile) {
	if len(files) == 0 {
		return
	}
	for _, file := range files {
		if file.Path == "" {
			continue
		}
		replaced := false
		for i := range c.contextFiles {
			if c.contextFiles[i].Path == file.Path {
				c.contextFiles[i] = file
				replaced = true
				break
			}
		}
		if !replaced {
			c.contextFiles = append(c.contextFiles, file)
		}
	}
	c.app.sidebar.clampContextFileSelection()
}
