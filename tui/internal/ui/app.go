package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
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

	// SSE state
	sseEvents <-chan client.SSEEvent
	sseErrs   <-chan error
	sseCancel context.CancelFunc

	// Input
	inputBuf string
	cursorOn bool

	// Pending status (running/waiting_permission)
	currentStatus string

	// Pending permissions for current session (most recent first)
	pendingPermissions []client.PermissionWire
}

// New constructs an App.
func New(backendURL string) *App {
	return &App{
		BackendURL:     backendURL,
		Theme:          DefaultTheme(),
		c:              client.New(backendURL),
		stage:          StageConnecting,
		focus:          FocusInput,
		selected:       -1,
		cursorOn:       true,
		stickyToBottom: true,
	}
}

// Init returns the initial Cmds: connect + start cursor blink.
func (a *App) Init() tea.Cmd {
	return tea.Batch(connectCmd(a.c), blinkCmd())
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

func blinkCmd() tea.Cmd {
	return tea.Tick(500*time.Millisecond, func(time.Time) tea.Msg { return blinkMsg{} })
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

	case blinkMsg:
		a.cursorOn = !a.cursorOn
		return a, blinkCmd()

	case messagesLoadedMsg:
		// Only apply if it's for the currently selected session.
		if a.currentSessionID() == m.sessionID {
			a.messages = m.messages
			a.stickyToBottom = true
		}
		return a, nil

	case msgPostedAck:
		// User message is in the store; the SSE stream will reflect it via
		// the message.created event the server publishes.
		return a, nil

	case sseEventMsg:
		a.applySSE(m.Event)
		return a, waitForSSE(a.sseEvents, a.sseErrs)

	case sseClosedMsg:
		// Stream ended (cancelled or remote closed). Reopen for current session.
		if sid := a.currentSessionID(); sid != "" {
			return a, a.startSSECmd(sid)
		}
		return a, nil
	}
	return a, nil
}

func (a *App) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "ctrl+c":
		if a.sseCancel != nil {
			a.sseCancel()
		}
		return a, tea.Quit
	case "tab":
		a.focus = (a.focus + 1) % 3
		return a, nil
	case "shift+tab":
		a.focus = (a.focus + 2) % 3
		return a, nil
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
		// Already selected; move focus to input for typing.
		a.focus = FocusInput
		return a, nil
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
	}
	return a, nil
}

func (a *App) handleInputKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "backspace":
		if len(a.inputBuf) > 0 {
			a.inputBuf = a.inputBuf[:len(a.inputBuf)-1]
		}
	case "enter":
		text := strings.TrimSpace(a.inputBuf)
		a.inputBuf = ""
		if text == "" || a.currentSessionID() == "" {
			return a, nil
		}
		return a, postMessageCmd(a.c, a.currentSessionID(), text)
	case "esc":
		a.inputBuf = ""
	default:
		if k.Text != "" {
			a.inputBuf += k.Text
		}
	}
	return a, nil
}

func (a *App) currentSessionID() string {
	if a.selected < 0 || a.selected >= len(a.sessions) {
		return ""
	}
	return a.sessions[a.selected].ID
}

// selectSession switches the active session, loads messages, and reopens SSE.
func (a *App) selectSession(idx int) tea.Cmd {
	if idx < 0 || idx >= len(a.sessions) {
		return nil
	}
	sid := a.sessions[idx].ID
	a.messages = nil
	a.scrollOffset = 0
	a.stickyToBottom = true
	a.currentStatus = a.sessions[idx].Status
	a.pendingPermissions = nil
	return tea.Batch(
		loadMessagesCmd(a.c, sid),
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
	}
}

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
	parts := []string{
		t.HeaderTitle.Render(" GACT "),
		t.Header.Render(a.BackendURL),
	}
	if len(a.workspaces) > 0 {
		parts = append(parts, t.Header.Render("ws: "+a.workspaces[0].Name))
	}
	if a.selected >= 0 && a.selected < len(a.sessions) {
		s := a.sessions[a.selected]
		parts = append(parts, t.Header.Render("session: "+s.Title))
	}
	if a.currentStatus != "" {
		parts = append(parts, t.StatusBadge.Render(a.currentStatus))
	}
	line := lipgloss.JoinHorizontal(lipgloss.Top, parts...)
	// Pad right so background extends to full width.
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
		t.HintKey.Render("Tab") + t.HintLabel.Render(" pane"),
		t.HintKey.Render("Enter") + t.HintLabel.Render(" send"),
		t.HintKey.Render("?") + t.HintLabel.Render(" help"),
		t.HintKey.Render("ctrl+c") + t.HintLabel.Render(" quit"),
	}
	hintLine := strings.Join(hints, "  ")
	left := t.HintLabel.Render("focus: " + focusLabel(a.focus))
	right := t.HintLabel.Render(time.Now().UTC().Format("15:04:05Z"))
	gap := a.width - lipgloss.Width(left) - lipgloss.Width(right) - lipgloss.Width(hintLine) - 6
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
		rows = append(rows, t.HintLabel.Render("no sessions"))
	}
	for i, s := range a.sessions {
		marker := "  "
		titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
		statusStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
		if i == a.selected {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
			titleStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
		}
		title := s.Title
		if title == "" {
			title = "untitled"
		}
		titleLine := marker + titleStyle.Render(truncate(title, width-6))
		statusLine := "  " + statusStyle.Render(s.Status)
		rows = append(rows, titleLine, statusLine, "")
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
		body = t.HintLabel.Render("Select a session on the left, or create a new one.")
	} else if len(a.messages) == 0 {
		body = t.HintLabel.Render("(no messages yet — type below to send the first one)")
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

	// Input
	inputStyle := t.Pane.Width(width - 2).Height(inputH - 2)
	if a.focus == FocusInput {
		inputStyle = t.PaneFoc.Width(width - 2).Height(inputH - 2)
	}
	cursor := ""
	if a.focus == FocusInput && a.cursorOn {
		cursor = lipgloss.NewStyle().Background(t.Primary).Foreground(t.Fg).Render(" ")
	}
	prompt := lipgloss.NewStyle().Foreground(t.Secondary).Render("> ")
	inputBody := prompt + a.inputBuf + cursor
	if a.inputBuf == "" && a.focus != FocusInput {
		inputBody = prompt + t.HintLabel.Render("type a message…")
	}
	inputPane := inputStyle.Render(inputBody)

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

type blinkMsg struct{}

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
