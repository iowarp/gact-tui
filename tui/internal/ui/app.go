package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/bubbles/v2/textarea"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// FocusZone identifies which pane owns the keyboard.
type FocusZone int

const (
	FocusSidebar FocusZone = iota
	FocusBody
	FocusInput
)

// Stage is the high-level UI state.
type Stage int

const (
	StageConnecting Stage = iota
	StageReady
	StageError
)

// App is the root Bubbletea model.
type App struct {
	BackendURL string
	Theme      Theme

	c *client.Client

	width, height int
	stage         Stage
	stageError    string
	focus         FocusZone

	caps       gact.Capabilities
	workspaces []gact.Workspace
	wsID       string
	sessions   []gact.Session
	selected   int // index into sessions; -1 if none
	commands   []gact.Command

	// Loaded messages for the currently selected session.
	messages         []gact.Message
	scrollOffset     int // 0 = stick to bottom; >0 = scrolled up
	stickyToBottom   bool

	// Context files for the currently selected session (fetched on select).
	contextFiles []gact.ContextFile

	// SSE state
	sseEvents <-chan client.SSEEvent
	sseErrs   <-chan error
	sseCancel context.CancelFunc

	// Input — bubbles/textarea handles multi-line, paste, cursor, etc.
	input textarea.Model

	// Pending status (running/waiting_permission)
	currentStatus string

	// Pending permissions for current session (most recent first)
	pendingPermissions []client.PermissionWire

	// Slash command palette state
	paletteOpen   bool
	paletteFilter string
	paletteSel    int

	// Help overlay
	helpOpen bool

	// Settings overlay
	settingsOpen bool
	settings     *settingsState

	// Metrics overlay
	metricsOpen bool
	metrics     *metricsState

	// Set by SSE handlers when the sidebar list might be stale (e.g. a
	// subsession was created). The next Update reads + clears it and
	// dispatches reloadSessionsCmd.
	pendingSidebarRefresh bool
}

// New constructs an App with the default (dark) theme.
func New(backendURL string) *App {
	return NewWithTheme(backendURL, DefaultTheme())
}

// NewWithTheme constructs an App with a specific theme.
func NewWithTheme(backendURL string, theme Theme) *App {
	ta := textarea.New()
	ta.Placeholder = "type a message — Enter to send, Shift+Enter for newline"
	ta.Prompt = "> "
	ta.SetHeight(3)
	ta.SetWidth(80)
	ta.ShowLineNumbers = false
	ta.Focus()
	return &App{
		BackendURL:     backendURL,
		Theme:          theme,
		c:              client.New(backendURL),
		stage:          StageConnecting,
		focus:          FocusInput,
		selected:       -1,
		stickyToBottom: true,
		input:          ta,
	}
}

// Init returns the initial Cmd: connect.
func (a *App) Init() tea.Cmd {
	return connectCmd(a.c)
}

func connectCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		caps, err := c.Capabilities(ctx)
		if err != nil {
			return errMsg{err: err, stage: "capabilities"}
		}
		wss, err := c.ListWorkspaces(ctx)
		if err != nil {
			return errMsg{err: err, stage: "workspaces"}
		}
		var sessions []gact.Session
		var wsID string
		if len(wss) > 0 {
			wsID = wss[0].ID
			sessions, err = c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
			if err != nil {
				return errMsg{err: err, stage: "sessions"}
			}
		}
		commands, _ := c.ListCommands(ctx)
		return connectedMsg{caps: caps, wss: wss, wsID: wsID, sessions: sessions, commands: commands}
	}
}


// loadMessagesCmd fetches messages for a session.
func loadMessagesCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		msgs, _, err := c.ListMessages(ctx, client.MessageFilter{
			SessionID:     sessionID,
			Limit:         100,
			IncludeSystem: true,
		})
		if err != nil {
			return errMsg{err: err, stage: "messages"}
		}
		// Reverse so we have chronological (oldest-first) order for display.
		out := make([]gact.Message, len(msgs))
		for i, m := range msgs {
			out[len(msgs)-1-i] = m
		}
		return messagesLoadedMsg{sessionID: sessionID, messages: out}
	}
}

// loadContextFilesCmd fetches the in-context files for a session.
func loadContextFilesCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		files, err := c.ListContextFiles(ctx, sessionID)
		if err != nil {
			// Don't promote to error stage — context files are optional.
			return contextFilesLoadedMsg{sessionID: sessionID, files: nil}
		}
		return contextFilesLoadedMsg{sessionID: sessionID, files: files}
	}
}

// reloadSessionsCmd is used after subagent.started so the new sub-session
// shows up in the sidebar without the user having to refresh manually.
func reloadSessionsCmd(c *client.Client, wsID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
		if err != nil {
			return errMsg{err: err, stage: "list-sessions"}
		}
		return sessionsRefreshedMsg{sessions: sessions}
	}
}

// startSSECmd opens the SSE stream and returns the first event.
func (a *App) startSSECmd(sessionID string) tea.Cmd {
	if a.sseCancel != nil {
		a.sseCancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.sseCancel = cancel
	events, errs, err := a.c.StreamEvents(ctx, client.EventStreamScope{SessionID: sessionID})
	if err != nil {
		return func() tea.Msg { return errMsg{err: err, stage: "sse"} }
	}
	a.sseEvents = events
	a.sseErrs = errs
	return waitForSSE(events, errs)
}

func waitForSSE(events <-chan client.SSEEvent, errs <-chan error) tea.Cmd {
	return func() tea.Msg {
		select {
		case e, ok := <-events:
			if !ok {
				return sseClosedMsg{}
			}
			return sseEventMsg{Event: e}
		case err, ok := <-errs:
			if !ok {
				return sseClosedMsg{}
			}
			return errMsg{err: err, stage: "sse-read"}
		}
	}
}

// postMessageCmd posts a user message to the current session.
func postMessageCmd(c *client.Client, sessionID, text string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := c.PostMessage(ctx, sessionID, client.PostMessageRequest{
			Parts: []gact.Part{gact.NewTextPart(text)},
		})
		if err != nil {
			return errMsg{err: err, stage: "post"}
		}
		return msgPostedAck{sessionID: sessionID}
	}
}

// --- Update ---------------------------------------------------------------

func (a *App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch m := msg.(type) {
	case tea.WindowSizeMsg:
		a.width = m.Width
		a.height = m.Height
		return a, nil

	case tea.KeyPressMsg:
		return a.handleKey(m)

	case tea.PasteMsg, tea.PasteStartMsg, tea.PasteEndMsg:
		// Forward paste events to the textarea when input has focus.
		if a.focus == FocusInput && !a.helpOpen && !a.paletteOpen && !a.settingsOpen {
			var cmd tea.Cmd
			a.input, cmd = a.input.Update(m)
			return a, cmd
		}
		return a, nil

	case connectedMsg:
		a.stage = StageReady
		a.caps = m.caps
		a.workspaces = m.wss
		a.wsID = m.wsID
		a.sessions = m.sessions
		a.commands = m.commands
		var cmd tea.Cmd
		if len(a.sessions) > 0 {
			a.selected = 0
			cmd = a.selectSession(0)
		}
		return a, cmd

	case errMsg:
		a.stage = StageError
		a.stageError = fmt.Sprintf("%s: %v", m.stage, m.err)
		return a, nil

	case messagesLoadedMsg:
		// Only apply if it's for the currently selected session.
		if a.currentSessionID() == m.sessionID {
			a.messages = m.messages
			a.stickyToBottom = true
		}
		return a, nil

	case contextFilesLoadedMsg:
		if a.currentSessionID() == m.sessionID {
			a.contextFiles = m.files
		}
		return a, nil

	case msgPostedAck:
		// User message is in the store; the SSE stream will reflect it via
		// the message.created event the server publishes.
		return a, nil

	case sseEventMsg:
		a.applySSE(m.Event)
		cmds := []tea.Cmd{waitForSSE(a.sseEvents, a.sseErrs)}
		if a.pendingSidebarRefresh && a.wsID != "" {
			a.pendingSidebarRefresh = false
			cmds = append(cmds, reloadSessionsCmd(a.c, a.wsID))
		}
		return a, tea.Batch(cmds...)

	case sseClosedMsg:
		// Stream ended (cancelled or remote closed). Wait briefly then
		// reopen for current session — this gives a server restart time
		// to come back without a tight reconnect loop.
		if sid := a.currentSessionID(); sid != "" {
			return a, tea.Tick(reconnectDelay, func(time.Time) tea.Msg {
				return reconnectMsg{sessionID: sid}
			})
		}
		return a, nil

	case reconnectMsg:
		if a.currentSessionID() == m.sessionID {
			return a, a.startSSECmd(m.sessionID)
		}
		return a, nil

	case sessionCreatedMsg:
		a.sessions = append([]gact.Session{m.session}, a.sessions...)
		a.selected = 0
		return a, a.selectSession(0)

	case settingsLoadedMsg:
		if a.settings == nil {
			a.settings = &settingsState{}
		}
		a.settings.modelList = m.models
		a.settings.agentList = m.agents
		// Pre-select current model/agent if present.
		if a.selected >= 0 && a.selected < len(a.sessions) {
			cur := a.sessions[a.selected]
			for i, e := range m.models {
				if e.provider == cur.Model.ProviderID && e.model.ID == cur.Model.ModelID {
					a.settings.modelSel = i
					break
				}
			}
			for i, ag := range m.agents {
				if ag.ID == cur.Agent.ID {
					a.settings.agentSel = i
					break
				}
			}
		}
		return a, nil

	case metricsLoadedMsg:
		if a.metrics == nil {
			a.metrics = &metricsState{}
		}
		a.metrics.loading = false
		a.metrics.err = m.err
		a.metrics.data = m.data
		return a, nil

	case sessionUpdatedMsg:
		// Apply the patched session into the local sessions slice.
		for i, s := range a.sessions {
			if s.ID == m.session.ID {
				a.sessions[i] = m.session
				break
			}
		}
		return a, nil

	case diffsAppliedMsg:
		// Mark matching parts as applied locally. Server is source of truth
		// but optimistic update keeps the UI snappy.
		applied := make(map[string]bool, len(m.paths))
		for _, p := range m.paths {
			applied[p] = true
		}
		for i := range a.messages {
			for j := range a.messages[i].Parts {
				p := &a.messages[i].Parts[j]
				if p.Type == gact.PartTypeFileDiff && applied[p.Path] {
					p.Applied = true
				}
			}
		}
		return a, nil

	case diffsRejectedMsg:
		rejected := make(map[string]bool, len(m.paths))
		for _, p := range m.paths {
			rejected[p] = true
		}
		for i := range a.messages {
			for j := range a.messages[i].Parts {
				p := &a.messages[i].Parts[j]
				if p.Type == gact.PartTypeFileDiff && rejected[p.Path] {
					if p.Metadata == nil {
						p.Metadata = map[string]any{}
					}
					p.Metadata["rejected"] = true
				}
			}
		}
		return a, nil

	case sessionsRefreshedMsg:
		// Preserve the current session ID across the refresh so the user
		// doesn't get yanked to a different session when sidebar reloads
		// (e.g. after a subsession is created).
		prevID := a.currentSessionID()
		a.sessions = m.sessions
		if len(a.sessions) == 0 {
			a.selected = -1
			a.messages = nil
			return a, nil
		}
		// Try to find the prior session in the new list.
		newIdx := -1
		for i, s := range a.sessions {
			if s.ID == prevID {
				newIdx = i
				break
			}
		}
		if newIdx >= 0 {
			a.selected = newIdx
			// No need to reload messages — same session.
			return a, nil
		}
		// Prior session is gone — fall back to the first.
		a.selected = 0
		return a, a.selectSession(0)
	}
	return a, nil
}

const reconnectDelay = 750 * time.Millisecond

func (a *App) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	// Modal layers take precedence: metrics/settings/help/palette → permission keys.
	if a.metricsOpen {
		return a.handleMetricsKey(k)
	}
	if a.settingsOpen {
		return a.handleSettingsKey(k)
	}
	if a.helpOpen {
		switch k.String() {
		case "?", "esc", "ctrl+c":
			a.helpOpen = false
		}
		return a, nil
	}
	if a.paletteOpen {
		return a.handlePaletteKey(k)
	}
	// Permission action keys when a permission is pending. These take
	// precedence so the user can respond without losing focus.
	if len(a.pendingPermissions) > 0 {
		if cmd, handled := a.handlePermissionKey(k); handled {
			return a, cmd
		}
	}

	switch k.String() {
	case "ctrl+c":
		if a.sseCancel != nil {
			a.sseCancel()
		}
		return a, tea.Quit
	case "?":
		a.helpOpen = true
		return a, nil
	case "tab":
		a.focus = (a.focus + 1) % 3
		return a, nil
	case "shift+tab":
		a.focus = (a.focus + 2) % 3
		return a, nil
	case "ctrl+x":
		if sid := a.currentSessionID(); sid != "" {
			return a, cancelCmd(a.c, sid)
		}
		return a, nil
	case "ctrl+n":
		// New session in current workspace.
		if a.wsID != "" {
			return a, createSessionCmd(a.c, a.wsID)
		}
		return a, nil
	case "ctrl+r":
		// Manual reconnect / refresh.
		return a, connectCmd(a.c)
	case "ctrl+s":
		// Open Settings.
		a.settingsOpen = true
		a.settings = &settingsState{}
		return a, loadSettingsCmd(a.c)
	case "ctrl+t":
		// Open Metrics modal.
		a.metricsOpen = true
		a.metrics = &metricsState{loading: true}
		return a, loadMetricsCmd(a.c)
	}
	switch a.focus {
	case FocusSidebar:
		return a.handleSidebarKey(k)
	case FocusBody:
		return a.handleBodyKey(k)
	case FocusInput:
		return a.handleInputKey(k)
	}
	return a, nil
}

// handlePermissionKey processes a/d/s/w on a pending permission.
func (a *App) handlePermissionKey(k tea.KeyPressMsg) (tea.Cmd, bool) {
	if len(a.pendingPermissions) == 0 {
		return nil, false
	}
	id := a.pendingPermissions[0].ID
	switch k.String() {
	case "a":
		return respondPermissionCmd(a.c, id, gact.PermAllow), true
	case "d":
		return respondPermissionCmd(a.c, id, gact.PermDeny), true
	case "s":
		return respondPermissionCmd(a.c, id, gact.PermAllowSession), true
	case "w":
		return respondPermissionCmd(a.c, id, gact.PermAllowWorkspace), true
	}
	return nil, false
}

// handlePaletteKey is the slash-command palette key router.
func (a *App) handlePaletteKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	matches := a.paletteMatches()
	switch k.String() {
	case "esc", "ctrl+c":
		a.paletteOpen = false
		a.paletteFilter = ""
		a.paletteSel = 0
		return a, nil
	case "up":
		if a.paletteSel > 0 {
			a.paletteSel--
		}
	case "down":
		if a.paletteSel < len(matches)-1 {
			a.paletteSel++
		}
	case "enter":
		if a.paletteSel < len(matches) {
			cmd := matches[a.paletteSel]
			a.paletteOpen = false
			a.paletteFilter = ""
			a.paletteSel = 0
			return a, runCommandCmd(a.c, a.currentSessionID(), cmd.ID)
		}
	case "backspace":
		if len(a.paletteFilter) > 0 {
			a.paletteFilter = a.paletteFilter[:len(a.paletteFilter)-1]
			a.paletteSel = 0
		}
	default:
		if k.Text != "" {
			a.paletteFilter += k.Text
			a.paletteSel = 0
		}
	}
	return a, nil
}

func (a *App) paletteMatches() []gact.Command {
	if a.paletteFilter == "" {
		return a.commands
	}
	needle := strings.ToLower(a.paletteFilter)
	out := make([]gact.Command, 0, len(a.commands))
	for _, c := range a.commands {
		hay := strings.ToLower(c.ID + " " + c.Title + " " + c.Description)
		if strings.Contains(hay, needle) {
			out = append(out, c)
		}
	}
	return out
}

func createSessionCmd(c *client.Client, wsID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s, err := c.CreateSession(ctx, client.CreateSessionRequest{
			WorkspaceID: wsID,
			Title:       "new session " + time.Now().UTC().Format("15:04:05"),
		})
		if err != nil {
			return errMsg{err: err, stage: "create-session"}
		}
		return sessionCreatedMsg{session: s}
	}
}

func deleteSessionCmd(c *client.Client, wsID, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := c.DeleteSession(ctx, sessionID); err != nil {
			return errMsg{err: err, stage: "delete-session"}
		}
		// Re-list sessions in the workspace.
		sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
		if err != nil {
			return errMsg{err: err, stage: "list-sessions"}
		}
		return sessionsRefreshedMsg{sessions: sessions}
	}
}

func cancelCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = c.CancelSession(ctx, sessionID)
		return nil
	}
}

func respondPermissionCmd(c *client.Client, permID string, action gact.PermissionAction) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = c.RespondPermission(ctx, permID, action)
		return nil
	}
}

func runCommandCmd(c *client.Client, sessionID, cmdID string) tea.Cmd {
	return func() tea.Msg {
		if sessionID == "" {
			return nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = c.RunCommand(ctx, sessionID, cmdID)
		return nil
	}
}

func (a *App) handleSidebarKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "up", "k":
		if a.selected > 0 {
			a.selected--
			return a, a.selectSession(a.selected)
		}
	case "down", "j":
		if a.selected < len(a.sessions)-1 {
			a.selected++
			return a, a.selectSession(a.selected)
		}
	case "enter":
		a.focus = FocusInput
		return a, nil
	case "n":
		if a.wsID != "" {
			return a, createSessionCmd(a.c, a.wsID)
		}
	case "x":
		// Delete current session.
		if sid := a.currentSessionID(); sid != "" {
			return a, deleteSessionCmd(a.c, a.wsID, sid)
		}
	}
	return a, nil
}

func (a *App) handleBodyKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "up", "k":
		a.scrollOffset++
		a.stickyToBottom = false
	case "down", "j":
		if a.scrollOffset > 0 {
			a.scrollOffset--
		}
		if a.scrollOffset == 0 {
			a.stickyToBottom = true
		}
	case "g":
		a.scrollOffset = 1 << 20
		a.stickyToBottom = false
	case "G":
		a.scrollOffset = 0
		a.stickyToBottom = true
	case "a":
		// Apply all unapplied diffs in the current session.
		if sid := a.currentSessionID(); sid != "" && a.hasPendingDiffs() {
			return a, applyDiffsCmd(a.c, sid)
		}
	case "r":
		if sid := a.currentSessionID(); sid != "" && a.hasPendingDiffs() {
			return a, rejectDiffsCmd(a.c, sid)
		}
	}
	return a, nil
}

// hasPendingDiffs returns true if any file_diff part in the loaded messages
// is not yet applied. Used to gate the a/r body keys.
func (a *App) hasPendingDiffs() bool {
	for _, m := range a.messages {
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeFileDiff && !p.Applied {
				return true
			}
		}
	}
	return false
}

func applyDiffsCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		applied, err := c.ApplyDiffs(ctx, sessionID, nil)
		if err != nil {
			return errMsg{err: err, stage: "apply-diffs"}
		}
		return diffsAppliedMsg{paths: applied}
	}
}

func rejectDiffsCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		rejected, err := c.RejectDiffs(ctx, sessionID, nil)
		if err != nil {
			return errMsg{err: err, stage: "reject-diffs"}
		}
		return diffsRejectedMsg{paths: rejected}
	}
}

func (a *App) handleInputKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	// Slash on empty input opens the palette.
	if k.String() == "/" && a.input.Value() == "" {
		a.paletteOpen = true
		a.paletteFilter = ""
		a.paletteSel = 0
		return a, nil
	}
	// Plain Enter sends; Shift+Enter (or any modifier) inserts a newline
	// (passes through to textarea).
	if k.String() == "enter" {
		text := strings.TrimSpace(a.input.Value())
		a.input.Reset()
		if text == "" || a.currentSessionID() == "" {
			return a, nil
		}
		return a, postMessageCmd(a.c, a.currentSessionID(), text)
	}
	if k.String() == "esc" {
		a.input.Reset()
		return a, nil
	}
	// Everything else: delegate to textarea.
	var cmd tea.Cmd
	a.input, cmd = a.input.Update(k)
	return a, cmd
}

func (a *App) currentSessionID() string {
	if a.selected < 0 || a.selected >= len(a.sessions) {
		return ""
	}
	return a.sessions[a.selected].ID
}

// selectSession switches the active session, loads messages + context files,
// and reopens SSE.
func (a *App) selectSession(idx int) tea.Cmd {
	if idx < 0 || idx >= len(a.sessions) {
		return nil
	}
	sid := a.sessions[idx].ID
	a.messages = nil
	a.contextFiles = nil
	a.scrollOffset = 0
	a.stickyToBottom = true
	a.currentStatus = a.sessions[idx].Status
	a.pendingPermissions = nil
	return tea.Batch(
		loadMessagesCmd(a.c, sid),
		loadContextFilesCmd(a.c, sid),
		a.startSSECmd(sid),
	)
}

// applySSE folds an incoming event into local state.
//
// SSE wire shape (per emulator's writeSSE): the data: line is a JSON object
// with top-level {type, occurred_at, payload}. The payload subobject carries
// the actual event data, so handlers must read e.Payload["payload"][...].
func (a *App) applySSE(e client.SSEEvent) {
	pl, _ := e.Payload["payload"].(map[string]any)
	switch e.Type {
	case "message.created":
		a.applyMessageCreated(e)
	case "message.part.added":
		a.applyPartAdded(e)
	case "message.part.delta":
		a.applyPartDelta(e)
	case "message.part.completed":
		a.applyPartCompleted(e)
	case "message.completed":
		// Final part-state already in store; the assistant turn is done.
	case "session.status_changed":
		if pl != nil {
			if v, ok := pl["status"].(string); ok {
				a.currentStatus = v
			}
		}
	case "permission.requested":
		a.applyPermissionRequested(e)
	case "permission.resolved":
		a.applyPermissionResolved(e)
	case "subagent.started", "subagent.completed":
		// Refresh sidebar so the new subsession appears (or its status updates).
		a.pendingSidebarRefresh = true
	case "cost.updated":
		a.applyCostUpdated(e)
	}
}

// applyCostUpdated rolls the latest cost/tokens into the local sessions
// slice so the footer's meter and the sidebar status both stay live.
func (a *App) applyCostUpdated(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	sid, _ := pl["session_id"].(string)
	if sid == "" {
		return
	}
	for i := range a.sessions {
		if a.sessions[i].ID != sid {
			continue
		}
		if c, ok := pl["cost_usd"].(float64); ok {
			a.sessions[i].CostUSD = c
		}
		if tokens, ok := pl["tokens"].(map[string]any); ok {
			if v, ok := tokens["input"].(float64); ok {
				a.sessions[i].Tokens.Input = int(v)
			}
			if v, ok := tokens["output"].(float64); ok {
				a.sessions[i].Tokens.Output = int(v)
			}
		}
		return
	}
}

// pendingSidebarRefresh works around the fact that we can't return a Cmd
// from applySSE — it's called from inside Update. The next blink/idle Cmd
// pickup checks the flag and triggers reloadSessionsCmd.

func (a *App) applyMessageCreated(e client.SSEEvent) {
	mp, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	m := decodeMessage(mp)
	// Replace existing message with same ID if present (server may re-emit).
	for i, existing := range a.messages {
		if existing.ID == m.ID {
			a.messages[i] = m
			return
		}
	}
	a.messages = append(a.messages, m)
}

func (a *App) applyPartAdded(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	msgID, _ := pl["message_id"].(string)
	partRaw, _ := pl["part"].(map[string]any)
	if msgID == "" || partRaw == nil {
		return
	}
	part := decodePart(partRaw)
	for i := range a.messages {
		if a.messages[i].ID == msgID {
			a.messages[i].Parts = append(a.messages[i].Parts, part)
			return
		}
	}
}

func (a *App) applyPartDelta(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	msgID, _ := pl["message_id"].(string)
	partID, _ := pl["part_id"].(string)
	delta, _ := pl["delta"].(map[string]any)
	if msgID == "" || partID == "" {
		return
	}
	for i := range a.messages {
		if a.messages[i].ID != msgID {
			continue
		}
		for j := range a.messages[i].Parts {
			if a.messages[i].Parts[j].ID != partID {
				continue
			}
			if v, ok := delta["text_append"].(string); ok {
				a.messages[i].Parts[j].Text += v
			}
			if v, ok := delta["thinking_append"].(string); ok {
				a.messages[i].Parts[j].Thinking += v
			}
			if v, ok := delta["input_json_append"].(string); ok {
				if a.messages[i].Parts[j].Metadata == nil {
					a.messages[i].Parts[j].Metadata = map[string]any{}
				}
				a.messages[i].Parts[j].Metadata["raw_input"] = v
			}
			return
		}
	}
}

// applyPartCompleted finalizes a part — most importantly, parses any
// accumulated input_json_append buffer into the typed Input map so the
// renderer can show structured tool args.
func (a *App) applyPartCompleted(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	msgID, _ := pl["message_id"].(string)
	partID, _ := pl["part_id"].(string)
	for i := range a.messages {
		if a.messages[i].ID != msgID {
			continue
		}
		for j := range a.messages[i].Parts {
			if a.messages[i].Parts[j].ID != partID {
				continue
			}
			p := &a.messages[i].Parts[j]
			if p.Type == gact.PartTypeToolCall && p.Metadata != nil {
				if raw, ok := p.Metadata["raw_input"].(string); ok && raw != "" {
					var parsed map[string]any
					if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
						p.Input = parsed
					}
					delete(p.Metadata, "raw_input")
					if len(p.Metadata) == 0 {
						p.Metadata = nil
					}
				}
			}
			return
		}
	}
}

func (a *App) applyPermissionRequested(e client.SSEEvent) {
	pl, _ := e.Payload["payload"].(map[string]any)
	if pl == nil {
		return
	}
	id, _ := pl["id"].(string)
	summary, _ := pl["summary"].(string)
	if id == "" {
		return
	}
	a.pendingPermissions = append(a.pendingPermissions, client.PermissionWire{
		PermissionRequest: gact.PermissionRequest{ID: id, Summary: summary},
		Status:            "pending",
	})
}

func (a *App) applyPermissionResolved(e client.SSEEvent) {
	pl, _ := e.Payload["payload"].(map[string]any)
	if pl == nil {
		return
	}
	id, _ := pl["permission_id"].(string)
	for i, p := range a.pendingPermissions {
		if p.ID == id {
			a.pendingPermissions = append(a.pendingPermissions[:i], a.pendingPermissions[i+1:]...)
			return
		}
	}
}

// --- View -----------------------------------------------------------------

func (a *App) View() tea.View {
	if a.width == 0 || a.height == 0 {
		v := tea.NewView("…")
		v.AltScreen = true
		return v
	}
	var content string
	switch a.stage {
	case StageConnecting:
		content = a.viewConnecting()
	case StageError:
		content = a.viewError()
	default:
		content = a.viewMain()
	}
	v := tea.NewView(content)
	v.AltScreen = true
	v.BackgroundColor = a.Theme.Bg
	v.ForegroundColor = a.Theme.Fg
	return v
}

func (a *App) viewConnecting() string {
	t := a.Theme
	box := lipgloss.NewStyle().
		Width(a.width).Height(a.height).
		Align(lipgloss.Center, lipgloss.Center).
		Foreground(t.Fg).Background(t.Bg)
	body := lipgloss.JoinVertical(lipgloss.Center,
		t.HeaderTitle.Render(" GACT TUI "),
		"",
		t.HintLabel.Render("Connecting to "+a.BackendURL+"…"),
	)
	return box.Render(body)
}

func (a *App) viewError() string {
	t := a.Theme
	title := lipgloss.NewStyle().Bold(true).Foreground(t.Danger).Render("Connection error")
	hint := t.HintLabel.Render("Backend: " + a.BackendURL)
	body := t.Pane.BorderForeground(t.Danger).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			title, "", a.stageError, "", hint, "", t.HintLabel.Render("press ctrl+c to quit"),
		),
	)
	box := lipgloss.NewStyle().
		Width(a.width).Height(a.height).
		Align(lipgloss.Center, lipgloss.Center).
		Foreground(t.Fg).Background(t.Bg)
	return box.Render(body)
}

func (a *App) viewMain() string {
	base := a.viewMainBase()
	// Overlay layers (last-rendered wins).
	if a.paletteOpen {
		base = overlay(base, a.viewPalette(), a.width, a.height)
	}
	if a.helpOpen {
		base = overlay(base, a.viewHelp(), a.width, a.height)
	}
	if a.settingsOpen {
		base = overlay(base, a.viewSettings(), a.width, a.height)
	}
	if a.metricsOpen {
		base = overlay(base, a.viewMetrics(), a.width, a.height)
	}
	return base
}

func (a *App) viewMainBase() string {
	headerH := 1
	footerH := 1
	bodyH := a.height - headerH - footerH
	if bodyH < 5 {
		bodyH = 5
	}
	sidebarW := 30
	if sidebarW > a.width/3 {
		sidebarW = a.width / 3
	}
	bodyW := a.width - sidebarW
	if bodyW < 20 {
		bodyW = 20
	}

	header := a.renderHeader()
	footer := a.renderFooter()

	sidebar := a.renderSidebar(sidebarW, bodyH)
	body := a.renderBody(bodyW, bodyH)

	row := lipgloss.JoinHorizontal(lipgloss.Top, sidebar, body)
	return lipgloss.JoinVertical(lipgloss.Left, header, row, footer)
}

func (a *App) renderHeader() string {
	t := a.Theme
	// Required parts (badge + URL) always render. Optional parts
	// (workspace + session + status) are dropped when there's no room.
	badge := t.HeaderTitle.Render(" GACT ")
	url := t.Header.Render(a.BackendURL)
	required := lipgloss.JoinHorizontal(lipgloss.Top, badge, url)
	avail := a.width - lipgloss.Width(required)

	optional := []string{}
	if len(a.workspaces) > 0 {
		optional = append(optional, "ws: "+a.workspaces[0].Name)
	}
	if a.selected >= 0 && a.selected < len(a.sessions) {
		optional = append(optional, "session: "+a.sessions[a.selected].Title)
	}
	statusBadge := ""
	if a.currentStatus != "" {
		statusBadge = t.StatusBadge.Render(a.currentStatus)
		avail -= lipgloss.Width(statusBadge)
	}

	rendered := []string{required}
	for _, opt := range optional {
		styled := t.Header.Render(truncate(opt, avail-2))
		w := lipgloss.Width(styled)
		if w > avail {
			break
		}
		rendered = append(rendered, styled)
		avail -= w
	}
	if statusBadge != "" {
		rendered = append(rendered, statusBadge)
	}

	line := lipgloss.JoinHorizontal(lipgloss.Top, rendered...)
	pad := a.width - lipgloss.Width(line)
	if pad < 0 {
		pad = 0
	}
	bg := lipgloss.NewStyle().Background(t.BgSubtle).Render(strings.Repeat(" ", pad))
	return line + bg
}

func (a *App) renderFooter() string {
	t := a.Theme
	hints := []string{
		t.HintKey.Render("Ctrl+N") + t.HintLabel.Render(" new"),
		t.HintKey.Render("Tab") + t.HintLabel.Render(" pane"),
		t.HintKey.Render("Ctrl+S") + t.HintLabel.Render(" settings"),
		t.HintKey.Render("/") + t.HintLabel.Render(" cmd"),
		t.HintKey.Render("?") + t.HintLabel.Render(" help"),
		t.HintKey.Render("ctrl+c") + t.HintLabel.Render(" quit"),
	}
	hintLine := strings.Join(hints, "  ")
	left := t.HintLabel.Render("focus: " + focusLabel(a.focus))
	right := ""
	if a.selected >= 0 && a.selected < len(a.sessions) {
		s := a.sessions[a.selected]
		if s.CostUSD > 0 || s.Tokens.Input > 0 {
			right = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).
				Render(fmt.Sprintf("$%.4f", s.CostUSD)) + " " +
				lipgloss.NewStyle().Foreground(t.FgMuted).
					Render(fmt.Sprintf("(%d in / %d out)", s.Tokens.Input, s.Tokens.Output))
		}
	}
	gap := a.width - lipgloss.Width(left) - lipgloss.Width(hintLine) - lipgloss.Width(right) - 8
	if gap < 1 {
		gap = 1
	}
	return lipgloss.NewStyle().
		Width(a.width).Background(t.BgSubtle).Foreground(t.FgMuted).
		Padding(0, 1).Render(
		left + "  " + hintLine + strings.Repeat(" ", gap) + right,
	)
}

func focusLabel(f FocusZone) string {
	switch f {
	case FocusSidebar:
		return "sidebar"
	case FocusBody:
		return "conversation"
	case FocusInput:
		return "input"
	}
	return "?"
}

func (a *App) renderSidebar(width, height int) string {
	t := a.Theme
	style := t.Pane.Width(width - 2).Height(height - 2)
	if a.focus == FocusSidebar {
		style = t.PaneFoc.Width(width - 2).Height(height - 2)
	}
	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("SESSIONS")
	rows := []string{title, ""}
	if len(a.sessions) == 0 {
		rows = append(rows,
			t.HintLabel.Render("no sessions"),
			"",
			t.HintKey.Render("n")+t.HintLabel.Render(" to create"))
	}

	// Each session takes 3 rows (title + status + spacer). Scroll the
	// session list so the selected entry stays visible. We reserve room
	// for the SESSIONS title (2 rows) + CONTEXT section (~3-N rows)
	// + pane border padding (2 rows). Anything not fitting is hidden,
	// with "↑ N more" / "N more ↓" indicators at the edges.
	const rowsPerSession = 3
	contextLines := 0
	if a.selected >= 0 {
		contextLines = 2 + 1 + len(a.contextFiles) // title+blank, then files (at least 1 placeholder)
		if contextLines < 4 {
			contextLines = 4 // accommodate "(no files)"
		}
	}
	// Available rows for sessions inside the pane (height-2 for border,
	// minus 2 for SESSIONS title+blank, minus contextLines, minus 1 spacer).
	avail := (height - 2) - 2 - contextLines - 1
	if avail < rowsPerSession {
		avail = rowsPerSession
	}
	maxSessions := avail / rowsPerSession
	startIdx := 0
	if a.selected >= 0 && a.selected >= maxSessions {
		startIdx = a.selected - maxSessions + 1
	}
	endIdx := startIdx + maxSessions
	if endIdx > len(a.sessions) {
		endIdx = len(a.sessions)
	}
	if startIdx > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(fmt.Sprintf("  ↑ %d more", startIdx)))
	}
	for i := startIdx; i < endIdx; i++ {
		s := a.sessions[i]
		marker := "  "
		indent := ""
		titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
		statusStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
		if s.ParentSessionID != "" {
			indent = "  └ "
			titleStyle = titleStyle.Foreground(t.FgMuted).Italic(true)
		}
		if i == a.selected {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
			titleStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
		}
		title := s.Title
		if title == "" {
			title = "untitled"
		}
		titleLine := marker + indent + titleStyle.Render(truncate(title, width-6-len(indent)))
		statusLine := "  " + indent + statusStyle.Render(s.Status)
		rows = append(rows, titleLine, statusLine, "")
	}
	if endIdx < len(a.sessions) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(fmt.Sprintf("  %d more ↓", len(a.sessions)-endIdx)))
	}

	// CONTEXT section — show files in the current session's context.
	if a.selected >= 0 && a.selected < len(a.sessions) {
		rows = append(rows,
			lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("CONTEXT"),
			"")
		if len(a.contextFiles) == 0 {
			rows = append(rows, t.HintLabel.Render("(no files)"))
		}
		for _, cf := range a.contextFiles {
			modeChar := "?"
			modeColor := t.FgMuted
			switch cf.Mode {
			case "edit":
				modeChar, modeColor = "E", t.Warning
			case "read":
				modeChar, modeColor = "R", t.RoleUser
			case "pin":
				modeChar, modeColor = "P", t.Secondary
			}
			modeBadge := lipgloss.NewStyle().Foreground(modeColor).Bold(true).Render(modeChar)
			rows = append(rows, "  "+modeBadge+" "+t.HintLabel.Render(truncate(cf.Path, width-10)))
		}
	}

	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	return style.Render(body)
}

func (a *App) renderBody(width, height int) string {
	t := a.Theme
	inputH := 3
	msgH := height - inputH

	// Conversation pane
	msgStyle := t.Pane.Width(width - 2).Height(msgH - 2)
	if a.focus == FocusBody {
		msgStyle = t.PaneFoc.Width(width - 2).Height(msgH - 2)
	}

	titleLine := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("CONVERSATION")
	statusLine := ""
	if a.currentStatus != "" && a.currentStatus != gact.StatusIdle {
		statusLine = lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
			Render("● " + a.currentStatus)
	}
	headerRow := titleLine
	if statusLine != "" {
		headerRow = lipgloss.JoinHorizontal(lipgloss.Top, titleLine, "  ", statusLine)
	}

	// Permission banner takes priority
	permBanner := ""
	if len(a.pendingPermissions) > 0 {
		p := a.pendingPermissions[0]
		permBanner = lipgloss.NewStyle().
			Foreground(t.Bg).
			Background(t.Warning).
			Padding(0, 1).
			Bold(true).
			Render(fmt.Sprintf("⚠ Permission needed: %s — (allow/deny via /v1/permissions)", p.Summary))
	}

	var body string
	if a.selected < 0 || a.selected >= len(a.sessions) {
		// Big, friendly empty state. Same pattern as a real onboarding.
		callout := lipgloss.NewStyle().
			Bold(true).Foreground(t.Primary).Padding(0, 2).
			Border(lipgloss.RoundedBorder()).
			BorderForeground(t.Primary).
			Render("Press " +
				lipgloss.NewStyle().Foreground(t.Bg).Background(t.Primary).Padding(0, 1).Render("Ctrl+N") +
				" to start your first conversation")
		hints := lipgloss.JoinVertical(lipgloss.Left,
			t.HintLabel.Render("Or in sidebar (Tab to focus):"),
			"  "+t.HintKey.Render("n")+t.HintLabel.Render(" new")+
				"   "+t.HintKey.Render("x")+t.HintLabel.Render(" delete")+
				"   "+t.HintKey.Render("↑/↓")+t.HintLabel.Render(" pick"),
			"",
			t.HintLabel.Render("Other things to try:"),
			"  "+t.HintKey.Render("Ctrl+S")+t.HintLabel.Render(" pick a model / agent"),
			"  "+t.HintKey.Render("/")+t.HintLabel.Render(" command palette"),
			"  "+t.HintKey.Render("?")+t.HintLabel.Render(" help"),
		)
		body = lipgloss.JoinVertical(lipgloss.Left, callout, "", hints)
	} else if len(a.messages) == 0 {
		body = lipgloss.JoinVertical(lipgloss.Left,
			t.HintLabel.Render("(no messages yet — type below to send the first one)"),
			"",
			t.HintLabel.Render("Try one of these to see different flows:"),
			"  "+lipgloss.NewStyle().Foreground(t.Secondary).Render("read main.go")+
				"           "+t.HintLabel.Render("normal turn (text + tool call + result)"),
			"  "+lipgloss.NewStyle().Foreground(t.Secondary).Render("delete the temp dir")+
				"    "+t.HintLabel.Render("triggers a permission prompt (a/d/s/w to respond)"),
			"  "+lipgloss.NewStyle().Foreground(t.Secondary).Render("propose an edit to main.go")+
				" "+t.HintLabel.Render("triggers a diff (a/r in body to apply/reject)"),
			"  "+lipgloss.NewStyle().Foreground(t.Secondary).Render("split this with a sub-agent")+
				" "+t.HintLabel.Render("spawns a code_reviewer subagent"),
			"",
			t.HintLabel.Render("Or ")+t.HintKey.Render("Ctrl+S")+t.HintLabel.Render(" to change the model/agent."),
		)
	} else {
		var rows []string
		for _, m := range a.messages {
			rows = append(rows, t.renderMessage(m, width-4))
		}
		body = strings.Join(rows, "\n")
		body = a.scrollClip(body, msgH-3, t)
	}

	pieces := []string{headerRow}
	if permBanner != "" {
		pieces = append(pieces, permBanner)
	}
	pieces = append(pieces, "", body)
	msgPane := msgStyle.Render(lipgloss.JoinVertical(lipgloss.Left, pieces...))

	// Input — bubbles/textarea handles cursor + multi-line + paste itself.
	a.input.SetWidth(width - 4)
	a.input.SetHeight(inputH - 2)
	if a.focus == FocusInput {
		a.input.Focus()
	} else {
		a.input.Blur()
	}
	inputStyle := t.Pane.Width(width - 2).Height(inputH - 2)
	if a.focus == FocusInput {
		inputStyle = t.PaneFoc.Width(width - 2).Height(inputH - 2)
	}
	inputPane := inputStyle.Render(a.input.View())

	return lipgloss.JoinVertical(lipgloss.Left, msgPane, inputPane)
}

// scrollClip clamps body to maxRows lines, sticking to bottom by default.
func (a *App) scrollClip(body string, maxRows int, _ Theme) string {
	if maxRows < 1 {
		return ""
	}
	lines := strings.Split(body, "\n")
	if len(lines) <= maxRows {
		return body
	}
	if a.stickyToBottom {
		return strings.Join(lines[len(lines)-maxRows:], "\n")
	}
	start := len(lines) - maxRows - a.scrollOffset
	if start < 0 {
		start = 0
	}
	end := start + maxRows
	if end > len(lines) {
		end = len(lines)
	}
	return strings.Join(lines[start:end], "\n")
}

func truncate(s string, max int) string {
	if max < 1 {
		return ""
	}
	if lipgloss.Width(s) <= max {
		return s
	}
	if max <= 1 {
		return "…"
	}
	return s[:max-1] + "…"
}

// viewPalette renders the slash-command palette as a centered modal.
func (a *App) viewPalette() string {
	t := a.Theme
	matches := a.paletteMatches()

	w := 60
	if w > a.width-8 {
		w = a.width - 8
	}
	rows := []string{
		lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Commands"),
		lipgloss.NewStyle().Foreground(t.FgMuted).Render("filter: " + a.paletteFilter + "_"),
		"",
	}
	if len(matches) == 0 {
		rows = append(rows, t.HintLabel.Render("(no matches)"))
	}
	for i, c := range matches {
		marker := "  "
		titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
		descStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
		if i == a.paletteSel {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
			titleStyle = titleStyle.Foreground(t.Secondary).Bold(true)
		}
		line := marker + titleStyle.Render(c.ID) + "  " + descStyle.Render(c.Title)
		rows = append(rows, truncate(line, w-2))
	}
	rows = append(rows, "", t.HintLabel.Render("↑/↓ select  Enter run  Esc close"))

	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Background(t.BgSubtle).
		Padding(1, 2).
		Width(w).
		Render(body)
}

// viewHelp renders the help overlay.
func (a *App) viewHelp() string {
	t := a.Theme
	rows := []string{
		lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Keybindings"),
		"",
		t.HintKey.Render("Tab/⇧Tab") + "  cycle pane focus",
		t.HintKey.Render("↑/↓") + "       navigate (sidebar / scroll body)",
		t.HintKey.Render("Enter") + "     send message  /  confirm",
		t.HintKey.Render("/") + "         open command palette",
		t.HintKey.Render("?") + "         toggle this help",
		t.HintKey.Render("Esc") + "       close overlay  /  clear input",
		t.HintKey.Render("Ctrl+x") + "    cancel running scenario",
		t.HintKey.Render("Ctrl+n") + "    new session",
		t.HintKey.Render("Ctrl+r") + "    refresh / reconnect",
		t.HintKey.Render("Ctrl+s") + "    settings (model / agent)",
		t.HintKey.Render("Ctrl+t") + "    backend metrics (telemetry)",
		t.HintKey.Render("n / x") + "     (sidebar) new / delete session",
		t.HintKey.Render("Ctrl+c") + "    quit",
		"",
		lipgloss.NewStyle().Bold(true).Foreground(t.Warning).Render("When a permission is pending"),
		t.HintKey.Render("a") + "         allow",
		t.HintKey.Render("d") + "         deny",
		t.HintKey.Render("s") + "         allow for this session",
		t.HintKey.Render("w") + "         allow for this workspace",
	}
	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Background(t.BgSubtle).
		Padding(1, 2).
		Width(56).
		Render(body)
}

// overlay places overlay centered on top of base. Bubbletea v2 doesn't have
// a built-in compositor (the lipgloss Layer API works but is heavier).
// This is a simple character-grid composite: split base into lines, paint
// the overlay's lines starting at the centered offset, return joined string.
func overlay(base, top string, w, h int) string {
	baseLines := strings.Split(base, "\n")
	topLines := strings.Split(top, "\n")
	tH := len(topLines)
	tW := 0
	for _, l := range topLines {
		if w := lipgloss.Width(l); w > tW {
			tW = w
		}
	}
	startY := (h - tH) / 2
	startX := (w - tW) / 2
	if startY < 0 {
		startY = 0
	}
	if startX < 0 {
		startX = 0
	}
	for i, ol := range topLines {
		idx := startY + i
		if idx >= len(baseLines) {
			break
		}
		baseLines[idx] = padOrInsert(baseLines[idx], ol, startX, w)
	}
	return strings.Join(baseLines, "\n")
}

// padOrInsert overlays insert at the given column offset on row, padding
// row with spaces if needed. ANSI codes are not handled gracefully here —
// the user accepts some bleeding around the overlay edges. Acceptable for
// modals because the visible inside is opaque.
func padOrInsert(row, insert string, offset, _ int) string {
	// Strip control runes from row width calculation by relying on lipgloss.Width.
	// Simplest correct approach: just print spaces of width `offset`, then insert.
	prefix := strings.Repeat(" ", offset)
	return prefix + insert
}

// --- Messages -------------------------------------------------------------

type connectedMsg struct {
	caps     gact.Capabilities
	wss      []gact.Workspace
	wsID     string
	sessions []gact.Session
	commands []gact.Command
}

type errMsg struct {
	err   error
	stage string
}


type messagesLoadedMsg struct {
	sessionID string
	messages  []gact.Message
}

type sseEventMsg struct {
	Event client.SSEEvent
}

type sseClosedMsg struct{}

type msgPostedAck struct {
	sessionID string
}

type sessionCreatedMsg struct {
	session gact.Session
}

type sessionsRefreshedMsg struct {
	sessions []gact.Session
}

type reconnectMsg struct {
	sessionID string
}

type contextFilesLoadedMsg struct {
	sessionID string
	files     []gact.ContextFile
}

type diffsAppliedMsg struct {
	paths []string
}

type diffsRejectedMsg struct {
	paths []string
}
