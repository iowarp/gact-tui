package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
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

	// VoiceCommand is a shell command line that records audio and writes
	// the bytes to stdout. Invoked by Ctrl+Y. Empty ⇒ Ctrl+Y posts a tiny
	// placeholder body so the emulator's canned transcript still fires.
	// Contract: exit 0 + audio/wav on stdout, or non-zero with a short
	// stderr message that surfaces to the user via the error stage.
	// See scripts/voice-record.sh for a reference arecord wrapper.
	VoiceCommand string

	// ReloadConfig is invoked by Ctrl+L to re-read the on-disk config
	// and reapply runtime-tweakable fields (theme, voice command). The
	// returned string is shown to the user as a transient toast.
	// Wired by main.go; tests can leave it nil and Ctrl+L becomes a no-op.
	ReloadConfig func() (string, error)

	// transientHint is a short banner shown above the input for ~3s
	// (cleared by the next key press). Used for non-fatal feedback like
	// config-reload outcomes that don't deserve the full error stage.
	transientHint string

	// DisableAltScreen turns off the alternate-screen-buffer mode. Used
	// by tests because teatest's PTY simulation doesn't capture writes
	// while in alt-screen mode. NEVER set this in production.
	DisableAltScreen bool

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

	// sseBackoffAttempts is the count of consecutive reconnects since
	// the last successful event arrival. Used by nextReconnectDelay()
	// to pick 250 ms → 500 ms → 1 s → … → 30 s. Reset to 0 whenever an
	// event is delivered, so a flaky backend that comes back quickly
	// snaps back to the baseline.
	sseBackoffAttempts int

	// lastSeenSeqID is the highest SSE event SeqID we've processed for
	// the current session. Passed as `Last-Event-ID` on reconnect so
	// the emulator's ring buffer replays events published during the
	// outage instead of the client silently losing them (visible in
	// the conversation as "skipped from thinking straight to done").
	// Reset to 0 whenever the active session changes.
	lastSeenSeqID uint64

	// connectRetryAttempts is the count of consecutive failed
	// connectCmd dispatches. Same backoff schedule as the SSE
	// reconnect; reset on connectedMsg.
	connectRetryAttempts int

	// Input — bubbles/textarea handles multi-line, paste, cursor, etc.
	input textarea.Model

	// Pending status (running/waiting_permission)
	currentStatus string

	// Pending permissions for current session (most recent first)
	pendingPermissions []client.PermissionWire

	// Slash command palette state. When paletteFilter starts with "?",
	// the palette switches to message-search mode: Enter submits the
	// query (everything after "?"), results replace the matches list,
	// a second Enter jumps the conversation viewport to the hit.
	paletteOpen   bool
	paletteFilter string
	paletteSel    int
	searchMatches []client.SearchMatch
	searching     bool // true while the SearchMessages cmd is in flight

	// Help overlay
	helpOpen bool

	// Settings overlay
	settingsOpen bool
	settings     *settingsState

	// Metrics overlay
	metricsOpen bool
	metrics     *metricsState

	// Workspace switcher overlay — ↑/↓ to navigate the current
	// a.workspaces slice, Enter to switch, Esc to cancel. Reuses the
	// already-loaded workspace list (connectCmd populates it) so the
	// modal opens without re-hitting the backend.
	workspaceSwitchOpen bool
	workspaceSwitchSel  int

	// Rename modal — inline prompt to change a session's title.
	// Opened by `e` on a selected session in the sidebar. We roll
	// our own input (not bubbles/textarea) because we want a single-
	// line, single-purpose editor and the full textarea styling would
	// overwhelm this tiny overlay.
	renameOpen   bool
	renameDraft  string
	renameCursor int

	// Context-file add modal — same shape as rename, different
	// purpose. Opened by `o` in sidebar focus. Enter POSTs to
	// /v1/sessions/{id}/context/files; Esc cancels.
	contextAddOpen   bool
	contextAddDraft  string
	contextAddCursor int

	// spinnerFrame drives the running-session animation — advanced by
	// spinnerTickMsg as long as any session is non-idle. Cheap (single
	// int, no timers when idle) so it's fine to leave in even when no
	// session is active.
	spinnerFrame int

	// pendingDeleteSessionID is the session that the user has armed
	// for deletion by pressing `x` once. The next `x` (while this
	// equals the selected session's ID) commits; any other key clears
	// it. Prevents a stray `x` from destroying a conversation silently.
	pendingDeleteSessionID string

	// showArchived is true when the sidebar is displaying archived
	// sessions (filter=archived=true) rather than the active list.
	// Toggled via `h` in the sidebar. Refetching the list happens in
	// the toggle handler so the render path can stay pure.
	showArchived bool

	// sessionFilter narrows the sidebar to sessions whose title
	// contains this substring (case-insensitive). Empty = show all.
	// sessionFilterActive is true only while the user is editing the
	// filter text (via `/` in sidebar focus); it commits on Enter and
	// clears on Esc. The filter itself can persist after commit.
	sessionFilter       string
	sessionFilterActive bool
	// filterSnapshot preserves the pre-edit filter value so Esc can
	// roll back the in-progress edit without losing a previously-
	// committed filter. Set by `/` on entry, cleared on commit/cancel.
	filterSnapshot string

	// inputHistoryBySession tracks the last N prompts the user sent,
	// per session. Keyed on session ID so switching sessions gives
	// you that session's history rather than a shared global. Each
	// slice is oldest-first; appends push to the end and trim from
	// the front when the cap is hit.
	inputHistoryBySession map[string][]string
	// historyCursor is -1 when we're not navigating, else an index
	// into the current session's history slice (most-recent-is-last,
	// so ↑ moves the cursor DOWN numerically from len toward 0).
	historyCursor int
	// historyDraft preserves what the user had typed before entering
	// history mode, so ↓-past-the-end restores it. Set on the first
	// ↑ that enters history mode; cleared on Enter or Esc.
	historyDraft string

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
		selected:              -1,
		stickyToBottom:        true,
		input:                 ta,
		inputHistoryBySession: map[string][]string{},
		historyCursor:         -1,
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
// transcribeCmd captures audio (via voiceCmd, if set) and POSTs it to
// /v1/sessions/{id}/voice/transcribe, returning a voiceTranscribedMsg
// with the recognised text. Empty voiceCmd ⇒ placeholder body so the
// emulator's canned transcript still fires for demos.
func transcribeCmd(c *client.Client, sessionID string, voiceCmd string) tea.Cmd {
	return func() tea.Msg {
		audio, err := captureVoice(voiceCmd)
		if err != nil {
			return errMsg{err: err, stage: "voice-capture"}
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		out, err := c.VoiceTranscribe(ctx, sessionID, audio, "audio/wav")
		if err != nil {
			return errMsg{err: err, stage: "transcribe"}
		}
		return voiceTranscribedMsg{text: out.Text, durationMs: out.DurationMs}
	}
}

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
	events, errs, err := a.c.StreamEvents(ctx, client.EventStreamScope{
		SessionID:   sessionID,
		LastEventID: a.lastSeenSeqID,
	})
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

// postMessageCmd posts a user message to the current session. On
// failure the message returns postFailedMsg rather than errMsg so the
// Update handler can restore the text to the input (rather than
// sending the whole UI to StageError for a transient backend blip).
func postMessageCmd(c *client.Client, sessionID, text string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := c.PostMessage(ctx, sessionID, client.PostMessageRequest{
			Parts: []gact.Part{gact.NewTextPart(text)},
		})
		if err != nil {
			return postFailedMsg{text: text, err: err}
		}
		return msgPostedAck{sessionID: sessionID, text: text}
	}
}

// postFailedMsg is the sole signal that PostMessage failed. Lets the
// Update handler restore the user's text into the textarea so a
// transient network blip doesn't cost them their message.
type postFailedMsg struct {
	text string
	err  error
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
		if a.focus == FocusInput && !a.helpOpen && !a.paletteOpen && !a.settingsOpen && !a.metricsOpen && !a.workspaceSwitchOpen && !a.renameOpen && !a.contextAddOpen {
			var cmd tea.Cmd
			a.input, cmd = a.input.Update(m)
			return a, cmd
		}
		return a, nil

	case connectedMsg:
		a.stage = StageReady
		// Successful connect — reset retry attempts so the NEXT
		// connect failure retries on the baseline delay, not whatever
		// we'd climbed to during the prior outage.
		a.connectRetryAttempts = 0
		a.caps = m.caps
		a.workspaces = m.wss
		a.wsID = m.wsID
		a.sessions = m.sessions
		a.commands = m.commands
		// Bootstrap the spinner tick loop. The handler gates
		// rescheduling on anySessionRunning(), so this fires exactly
		// once per connect even if nothing is currently active.
		cmds := []tea.Cmd{spinnerCmd()}
		if len(a.sessions) > 0 {
			a.selected = 0
			cmds = append(cmds, a.selectSession(0))
		}
		return a, tea.Batch(cmds...)

	case errMsg:
		// Search failures shouldn't blow away the whole UI — clear the
		// in-flight flag and surface a single empty result so the user
		// can adjust the query without losing their session view.
		if m.stage == "search" {
			a.searching = false
			a.searchMatches = nil
			return a, nil
		}
		a.stage = StageError
		a.stageError = fmt.Sprintf("%s: %v", m.stage, m.err)
		// Connect-stage failures are usually transient (backend booting,
		// network blip). Auto-retry on the same exponential backoff
		// schedule the SSE reconnect uses — same UX shape, same code
		// path. Other stages (selectSession, post-message, etc.) come
		// from user actions and shouldn't loop in the background.
		if isConnectStage(m.stage) {
			delay := a.nextConnectRetryDelay()
			a.connectRetryAttempts++
			return a, tea.Tick(delay, func(time.Time) tea.Msg {
				return retryConnectMsg{}
			})
		}
		return a, nil

	case retryConnectMsg:
		// Only retry while we're still in StageError — the user might
		// have already manually reconnected via Ctrl+R or the backend
		// might be healthy now via some other path.
		if a.stage != StageError {
			return a, nil
		}
		a.stage = StageConnecting
		return a, connectCmd(a.c)

	case spinnerTickMsg:
		a.spinnerFrame++
		// Re-arm only while something is active. When everything
		// goes idle the loop drains naturally; the next non-idle
		// transition restarts it via the branch below.
		if a.anySessionRunning() {
			return a, spinnerCmd()
		}
		return a, nil

	case searchResultsMsg:
		a.searching = false
		a.searchMatches = m.matches
		a.paletteSel = 0
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

	case postFailedMsg:
		// Transient failure (dial error, backend restart, upstream 5xx).
		// Don't blow away the UI; restore the text so the user can
		// just press Enter again once the backend is back. Surface a
		// transient hint so they know what happened.
		a.input.SetValue(m.text)
		a.transientHint = "message not sent — press Enter to retry · " + m.err.Error()
		return a, nil

	case msgPostedAck:
		// User message is in the store; the SSE stream will reflect it via
		// the message.created event the server publishes.
		//
		// Auto-rename: if this was the first user message AND the
		// session still carries the default "new session …" title,
		// patch it to a truncated version of the message so the
		// sidebar becomes self-describing. Silent: no toast if the
		// PATCH fails (the rename is a nicety, not load-bearing).
		if title, ok := autoRenameTitle(a, m.sessionID, m.text); ok {
			return a, patchSessionTitleCmd(a.c, m.sessionID, title)
		}
		return a, nil

	case sessionTitleRenamedMsg:
		// Rename failed — swallow silently. Title stays at the default.
		if m.err != nil {
			return a, nil
		}
		// Mirror the new title into a.sessions so the sidebar updates
		// without a full list refetch.
		for i, s := range a.sessions {
			if s.ID == m.sessionID {
				a.sessions[i].Title = m.title
				break
			}
		}
		return a, nil

	case contextFileAddedMsg:
		if m.err != nil {
			a.transientHint = "add failed: " + m.err.Error()
			return a, nil
		}
		// Mirror the new file into the sidebar only if it's for the
		// session we're currently showing — stale responses from a
		// since-switched session get dropped.
		if a.currentSessionID() == m.sessionID {
			a.contextFiles = append(a.contextFiles, m.file)
		}
		a.transientHint = "added " + m.file.Path + " to context"
		return a, nil

	case sessionArchivedMsg:
		if m.err != nil {
			// Soft-fail: J5 pattern. Keep the session in the sidebar;
			// the user can retry. Don't promote to StageError.
			verb := "archive"
			if !m.archived {
				verb = "un-archive"
			}
			a.transientHint = verb + " failed: " + m.err.Error()
			return a, nil
		}
		// Remove the session from the current view (it no longer
		// matches the view's filter — archived sessions disappear from
		// the active view, un-archived from the archived view).
		idx := -1
		for i, s := range a.sessions {
			if s.ID == m.sessionID {
				idx = i
				break
			}
		}
		if idx < 0 {
			// Already gone (stale event?). Nothing to do.
			return a, nil
		}
		wasSelected := idx == a.selected
		a.sessions = append(a.sessions[:idx], a.sessions[idx+1:]...)
		if m.archived {
			a.transientHint = "session archived"
		} else {
			a.transientHint = "session un-archived"
		}
		if !wasSelected {
			// Adjust selection index if the removed session was above
			// the selected one.
			if idx < a.selected {
				a.selected--
			}
			return a, nil
		}
		// We were on the archived session — tear down its SSE stream
		// and pick a new one. Prefer the previous sibling (visually
		// less disorienting than jumping down).
		if a.sseCancel != nil {
			a.sseCancel()
			a.sseCancel = nil
		}
		if len(a.sessions) == 0 {
			a.selected = -1
			a.messages = nil
			a.contextFiles = nil
			a.currentStatus = ""
			return a, nil
		}
		newIdx := idx - 1
		if newIdx < 0 {
			newIdx = 0
		}
		a.selected = newIdx
		return a, a.selectSession(newIdx)

	case sseEventMsg:
		// Event arrival means the stream is healthy — reset the
		// reconnect backoff so the NEXT disconnect waits 250 ms, not
		// whatever the attempts counter had climbed to.
		a.sseBackoffAttempts = 0
		// Track the highest SeqID we've processed so a reconnect can
		// resume via Last-Event-ID rather than silently dropping
		// events published during the outage. Monotonic under normal
		// operation; a max() guards against a late-arriving out-of-
		// order event from a replay window not dragging us backwards.
		if seq := m.Event.SeqID(); seq > a.lastSeenSeqID {
			a.lastSeenSeqID = seq
		}
		prevRunning := a.anySessionRunning()
		a.applySSE(m.Event)
		cmds := []tea.Cmd{waitForSSE(a.sseEvents, a.sseErrs)}
		if a.pendingSidebarRefresh && a.wsID != "" {
			a.pendingSidebarRefresh = false
			cmds = append(cmds, reloadSessionsCmd(a.c, a.wsID))
		}
		// Restart the spinner loop if this event flipped a session
		// into a running state. The spinnerTickMsg handler drains
		// itself when nothing's running, so idle→running needs to
		// re-arm the tick; running→running is fine because the loop
		// is still alive.
		if !prevRunning && a.anySessionRunning() {
			cmds = append(cmds, spinnerCmd())
		}
		return a, tea.Batch(cmds...)

	case sseClosedMsg:
		// Stream ended (cancelled or remote closed). Wait per the
		// backoff schedule then reopen for current session. A tight
		// fixed-delay loop hammers the backend on a long outage; this
		// schedule plays nicer and still reconnects fast on transient
		// blips (first retry at ~250 ms).
		if sid := a.currentSessionID(); sid != "" {
			delay := a.nextReconnectDelay()
			a.sseBackoffAttempts++
			return a, tea.Tick(delay, func(time.Time) tea.Msg {
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

	case voiceTranscribedMsg:
		// Insert the transcribed text at the textarea cursor.
		a.input.InsertString(m.text)
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

	case workspaceSwitchedMsg:
		// Ignore stale responses — if the user switched again before
		// this one landed, a.wsID would no longer match.
		if m.wsID != a.wsID {
			return a, nil
		}
		a.sessions = m.sessions
		if len(a.sessions) == 0 {
			a.selected = -1
			a.messages = nil
			return a, nil
		}
		a.selected = 0
		return a, a.selectSession(0)
	}
	return a, nil
}

// SSE reconnect backoff constants. baseReconnectDelay is the first
// retry's target; each subsequent attempt doubles (250 ms, 500 ms, 1 s,
// 2 s, 4 s, 8 s, 16 s, 30 s…). maxReconnectDelay caps the ceiling so a
// user coming back to a long-idle TUI gets a reconnect within half a
// minute, not 20.
const (
	baseReconnectDelay = 250 * time.Millisecond
	maxReconnectDelay  = 30 * time.Second
)

// retryConnectMsg fires after the connect-retry backoff elapses and
// triggers another connectCmd if the TUI is still in StageError.
type retryConnectMsg struct{}

// isConnectStage reports whether the errMsg.stage value came from
// connectCmd. The connect path emits exactly three stages — bumping
// this list when a new stage is added is intentional friction so
// retry doesn't accidentally fire for unrelated user actions.
func isConnectStage(stage string) bool {
	switch stage {
	case "capabilities", "workspaces", "sessions":
		return true
	}
	return false
}

// nextConnectRetryDelay reuses the SSE backoff schedule but reads
// from connectRetryAttempts. Same shape, same constants — this keeps
// the user-visible reconnect rhythm consistent across both paths.
func (a *App) nextConnectRetryDelay() time.Duration {
	saved := a.sseBackoffAttempts
	a.sseBackoffAttempts = a.connectRetryAttempts
	d := a.nextReconnectDelay()
	a.sseBackoffAttempts = saved
	return d
}

// nextReconnectDelay computes the wait before the next SSE reconnect
// attempt. Pure function of a.sseBackoffAttempts so tests can walk
// the schedule directly. Adds ±25% jitter so multiple TUI instances
// reconnecting after the same backend restart don't thunder in lockstep.
func (a *App) nextReconnectDelay() time.Duration {
	n := a.sseBackoffAttempts
	if n < 0 {
		n = 0
	}
	// Cap the shift so we don't overflow on pathologically large n.
	if n > 20 {
		n = 20
	}
	d := baseReconnectDelay * (1 << n)
	if d > maxReconnectDelay {
		d = maxReconnectDelay
	}
	// ±25% jitter. rand.Int63n is fine here — not a security context.
	jitter := time.Duration(rand.Int63n(int64(d/2))) - d/4
	result := d + jitter
	if result < baseReconnectDelay {
		result = baseReconnectDelay
	}
	return result
}

func (a *App) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	// Clear any transient hint banner — it's a one-off toast that
	// shouldn't persist past the next interaction. Done before modal
	// dispatch so even hitting "Esc" in a modal dismisses the banner.
	if k.String() != "ctrl+l" {
		a.transientHint = ""
	}
	// Any key other than `x` cancels a pending delete — the two-step
	// confirm is there to catch accidents, not to force the user into
	// a modal dialog, so a natural next action (arrow key, typing,
	// whatever) should back out cleanly. The `x` branch itself
	// distinguishes arm-vs-commit.
	if k.String() != "x" {
		a.pendingDeleteSessionID = ""
	}
	// StageError is a special case: Ctrl+R retries immediately (skips
	// the auto-retry backoff), Ctrl+C still quits, every other key is
	// swallowed so users don't accidentally trigger something against
	// the unconnected backend.
	if a.stage == StageError {
		switch k.String() {
		case "ctrl+c":
			return a, tea.Quit
		case "ctrl+r":
			a.stage = StageConnecting
			a.connectRetryAttempts = 0
			return a, connectCmd(a.c)
		}
		return a, nil
	}
	// Modal layers take precedence: rename/context-add/workspace-switcher/metrics/settings/help/palette → permission keys.
	if a.renameOpen {
		return a.handleRenameKey(k)
	}
	if a.contextAddOpen {
		return a.handleContextAddKey(k)
	}
	if a.workspaceSwitchOpen {
		return a.handleWorkspaceSwitchKey(k)
	}
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
	case "ctrl+l":
		// Reload on-disk config without restarting. Hot-applies theme +
		// voice command; backend changes are flagged but not applied
		// (would need to reconnect SSE, refetch caps, drop sessions).
		if a.ReloadConfig != nil {
			toast, err := a.ReloadConfig()
			if err != nil {
				a.transientHint = "config reload failed: " + err.Error()
			} else {
				a.transientHint = toast
			}
		}
		return a, nil
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
	case "ctrl+w":
		// Open Workspace switcher. Reuses the already-loaded workspace
		// list — connectCmd populates a.workspaces at startup and
		// refreshCmd keeps it fresh — so the modal opens without a
		// round-trip. Selection defaults to the current workspace so
		// Enter is a no-op unless the user moves off it.
		if len(a.workspaces) == 0 {
			a.transientHint = "no workspaces available"
			return a, nil
		}
		a.workspaceSwitchOpen = true
		a.workspaceSwitchSel = 0
		for i, w := range a.workspaces {
			if w.ID == a.wsID {
				a.workspaceSwitchSel = i
				break
			}
		}
		return a, nil
	case "ctrl+y":
		// "Yo" — voice transcribe. If VoiceCommand is set, run it to
		// capture WAV bytes; otherwise post a tiny placeholder so the
		// emulator's canned transcript still fires for demos.
		// See scripts/voice-record.sh for a reference arecord wrapper.
		if sid := a.currentSessionID(); sid != "" {
			return a, transcribeCmd(a.c, sid, a.VoiceCommand)
		}
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
	searchMode := a.isSearchMode()
	cmdMatches := a.paletteMatches()
	rowCount := len(cmdMatches)
	if searchMode {
		rowCount = len(a.searchMatches)
	}

	switch k.String() {
	case "esc", "ctrl+c":
		a.closePalette()
		return a, nil
	case "up":
		if a.paletteSel > 0 {
			a.paletteSel--
		}
	case "down":
		if a.paletteSel < rowCount-1 {
			a.paletteSel++
		}
	case "enter":
		if searchMode {
			query := strings.TrimSpace(a.paletteFilter[1:])
			// First Enter submits the search; second Enter (when matches
			// are loaded) jumps the conversation viewport to the hit.
			if len(a.searchMatches) == 0 {
				if sid := a.currentSessionID(); sid != "" && query != "" {
					a.searching = true
					return a, searchMessagesCmd(a.c, sid, query)
				}
				return a, nil
			}
			if a.paletteSel < len(a.searchMatches) {
				match := a.searchMatches[a.paletteSel]
				a.closePalette()
				a.jumpToMessage(match.MessageID)
				return a, nil
			}
			return a, nil
		}
		if a.paletteSel < len(cmdMatches) {
			cmd := cmdMatches[a.paletteSel]
			a.closePalette()
			return a, runCommandCmd(a.c, a.currentSessionID(), cmd.ID)
		}
	case "backspace":
		if len(a.paletteFilter) > 0 {
			a.paletteFilter = a.paletteFilter[:len(a.paletteFilter)-1]
			a.paletteSel = 0
			// Any edit invalidates a previously-fetched result list.
			a.searchMatches = nil
		}
	default:
		if k.Text != "" {
			a.paletteFilter += k.Text
			a.paletteSel = 0
			a.searchMatches = nil
		}
	}
	return a, nil
}

// closePalette resets all palette state — same dance is needed in three
// places (esc, command-Enter, search-Enter) so factor it.
func (a *App) closePalette() {
	a.paletteOpen = false
	a.paletteFilter = ""
	a.paletteSel = 0
	a.searchMatches = nil
	a.searching = false
}

// isSearchMode reports whether the palette filter is in message-search
// mode (`?` prefix).
func (a *App) isSearchMode() bool {
	return strings.HasPrefix(a.paletteFilter, "?")
}

// jumpToMessage scrolls the conversation pane so the message with the
// given ID is visible. Implementation: find the index, set scrollOffset
// to (totalMessages - index - 1) so the renderer's bottom-anchored
// math leaves it on screen. Falls back to "stick to bottom" if the ID
// is no longer in the loaded slice (e.g. SSE replaced the list).
func (a *App) jumpToMessage(messageID string) {
	for i, m := range a.messages {
		if m.ID == messageID {
			a.scrollOffset = len(a.messages) - i - 1
			a.stickyToBottom = a.scrollOffset == 0
			return
		}
	}
	a.scrollOffset = 0
	a.stickyToBottom = true
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

// searchMessagesCmd POSTs to /v1/sessions/{id}/messages/search and
// returns a searchResultsMsg with the hits (or an errMsg).
func searchMessagesCmd(c *client.Client, sessionID, query string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		matches, err := c.SearchMessages(ctx, sessionID, query)
		if err != nil {
			return errMsg{err: err, stage: "search"}
		}
		return searchResultsMsg{matches: matches}
	}
}

type searchResultsMsg struct {
	matches []client.SearchMatch
}

func createSessionCmd(c *client.Client, wsID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		// Default model + agent so the user can send a message immediately
		// without first opening Settings. The defaults match the emulator's
		// best-tier capabilities (Anthropic Claude Opus 4.7) — adapters
		// for other backends should fall through gracefully if they don't
		// know this model and either map it or surface an error.
		s, err := c.CreateSession(ctx, client.CreateSessionRequest{
			WorkspaceID: wsID,
			Title:       "new session " + time.Now().UTC().Format("15:04:05"),
			Model:       &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Agent:       &gact.AgentRef{ID: "default"},
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
	// Filter edit mode: keystrokes go into sessionFilter instead of
	// navigating/acting on the list. Enter commits (keeps the filter
	// but exits edit mode), Esc cancels AND clears the filter back to
	// whatever it was when `/` was pressed.
	if a.sessionFilterActive {
		return a.handleSidebarFilterKey(k)
	}

	switch k.String() {
	case "up", "k":
		if a.stepSelectionVisible(-1) {
			return a, a.selectSession(a.selected)
		}
	case "down", "j":
		if a.stepSelectionVisible(+1) {
			return a, a.selectSession(a.selected)
		}
	case "g", "home":
		// Jump to first VISIBLE session.
		vis := a.visibleSessionIndexes()
		if len(vis) > 0 && a.selected != vis[0] {
			a.selected = vis[0]
			return a, a.selectSession(a.selected)
		}
	case "G", "end":
		vis := a.visibleSessionIndexes()
		if len(vis) > 0 && a.selected != vis[len(vis)-1] {
			a.selected = vis[len(vis)-1]
			return a, a.selectSession(a.selected)
		}
	case "pgup", "ctrl+u":
		if a.stepSelectionVisible(-a.sidebarPageSize()) {
			return a, a.selectSession(a.selected)
		}
	case "pgdown", "ctrl+d":
		if a.stepSelectionVisible(+a.sidebarPageSize()) {
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
		// Two-step delete: first `x` arms, second `x` executes.
		// Prevents a stray keystroke from silently destroying a
		// conversation. Any other key clears the arm via the
		// fall-through in handleKey.
		sid := a.currentSessionID()
		if sid == "" {
			return a, nil
		}
		if a.pendingDeleteSessionID == sid {
			a.pendingDeleteSessionID = ""
			a.transientHint = ""
			return a, deleteSessionCmd(a.c, a.wsID, sid)
		}
		a.pendingDeleteSessionID = sid
		a.transientHint = "press x again to confirm delete (any other key cancels)"
		return a, nil
	case "e":
		// Rename the selected session. Opens an inline prompt
		// pre-filled with the current title; Enter commits, Esc
		// cancels. Complements J6's auto-rename — there the title
		// derives from the first message heuristically; here the
		// user can pick what they actually want.
		if a.selected < 0 || a.selected >= len(a.sessions) {
			return a, nil
		}
		a.renameOpen = true
		a.renameDraft = a.sessions[a.selected].Title
		a.renameCursor = len(a.renameDraft)
		return a, nil
	case "/":
		// Enter filter mode. Remember the current filter so Esc can
		// restore it (the slash wasn't meant as a destructive action).
		a.sessionFilterActive = true
		a.filterSnapshot = a.sessionFilter
		return a, nil
	case "A":
		// Archive toggle — PATCH archived to the opposite of the
		// current view's filter. In the active view (showArchived=
		// false), `A` archives; in the archived view, it un-archives.
		// Either way the session drops from the current list.
		if sid := a.currentSessionID(); sid != "" {
			return a, archiveSessionCmd(a.c, sid, !a.showArchived)
		}
	case "o":
		// Open the "add to context" prompt. No-op if there's no
		// current session to add the file to.
		if a.currentSessionID() == "" {
			return a, nil
		}
		a.contextAddOpen = true
		a.contextAddDraft = ""
		a.contextAddCursor = 0
		return a, nil
	case "h":
		// Toggle archived vs active view. Refetches the session list
		// with the new filter; the result falls into the existing
		// sessionsRefreshedMsg branch which preserves selection where
		// possible.
		a.showArchived = !a.showArchived
		if a.showArchived {
			a.transientHint = "showing archived sessions (h to go back)"
		} else {
			a.transientHint = "showing active sessions"
		}
		if a.wsID != "" {
			return a, reloadSessionsForView(a.c, a.wsID, a.showArchived)
		}
	}
	return a, nil
}

// sidebarPageSize returns the number of session entries that fit in the
// visible sidebar pane — used by PgUp/PgDn so the jump matches what the
// user sees. Mirrors the math in renderSidebar (rowsPerSession=3, plus
// borders/title/CONTEXT block); we always return at least 1 so paging
// still moves on a tiny window.
func (a *App) sidebarPageSize() int {
	const rowsPerSession = 3
	contextLines := 0
	if a.selected >= 0 {
		contextLines = 4 + len(a.contextFiles)
	}
	avail := (a.height - 4) - 2 - contextLines - 1 // -4: header+footer rows
	page := avail / rowsPerSession
	if page < 1 {
		page = 1
	}
	return page
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
	case "y":
		// Yank — copy the most recent assistant message's text to the
		// system clipboard. Users reach for this to grab code the
		// agent just produced; picking "most recent assistant" rather
		// than "focused message" is a pragmatic first cut (no message-
		// level cursor exists yet). Feedback is a transient toast
		// because clipboard success is otherwise invisible.
		text, ok := lastAssistantText(a.messages)
		if !ok {
			a.transientHint = "nothing to copy — no assistant messages yet"
			return a, nil
		}
		if err := clipboardWrite(text); err != nil {
			a.transientHint = "copy failed: " + err.Error()
			return a, nil
		}
		a.transientHint = fmt.Sprintf("copied %d chars to clipboard", len(text))
	case "R":
		// Retry — resend the most recent user message's text. J5 made
		// post failures preserve the draft in the input; this is the
		// complement for the case where the draft was already sent,
		// accepted, and the agent's response went sideways.
		sid := a.currentSessionID()
		if sid == "" {
			return a, nil
		}
		text, ok := lastUserText(a.messages)
		if !ok {
			a.transientHint = "no user message to retry"
			return a, nil
		}
		a.transientHint = "retrying…"
		return a, postMessageCmd(a.c, sid, text)
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
	key := k.String()

	// Slash on empty input opens the palette.
	if key == "/" && a.input.Value() == "" {
		a.paletteOpen = true
		a.paletteFilter = ""
		a.paletteSel = 0
		return a, nil
	}

	// Input history: ↑ on empty input (or while already navigating)
	// recalls prior prompts; ↓ walks forward and eventually restores
	// the pre-history draft. When the input has content AND we're NOT
	// already navigating, arrow keys pass through to the textarea so
	// multi-line cursor nav still works.
	if key == "up" && (a.input.Value() == "" || a.historyCursor >= 0) {
		if txt, ok := a.historyPrev(); ok {
			a.input.SetValue(txt)
			return a, nil
		}
	}
	if key == "down" && a.historyCursor >= 0 {
		if txt, ok := a.historyNext(); ok {
			a.input.SetValue(txt)
			return a, nil
		}
	}

	// Plain Enter sends; Shift+Enter (or any modifier) inserts a newline
	// (passes through to textarea).
	if key == "enter" {
		text := strings.TrimSpace(a.input.Value())
		a.input.Reset()
		a.exitHistory()
		if text == "" || a.currentSessionID() == "" {
			return a, nil
		}
		a.pushInputHistory(text)
		return a, postMessageCmd(a.c, a.currentSessionID(), text)
	}
	if key == "esc" {
		a.input.Reset()
		a.exitHistory()
		return a, nil
	}
	// Any other key implies editing — drop out of history mode so the
	// user's keystrokes replace whatever history text is currently in
	// the buffer (rather than the next ↑/↓ jumping back to history).
	if a.historyCursor >= 0 {
		a.exitHistory()
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
	a.pendingDeleteSessionID = "" // armed delete is per-session; clear on switch
	// New session ⇒ new event stream, no replay. Starting at 0 makes
	// the adapter/emulator send the full current event history from
	// the ring buffer (per SPEC §7.3 replay semantics).
	a.lastSeenSeqID = 0
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
			v, _ := pl["status"].(string)
			if v != "" {
				// Update the header's view of the currently-selected
				// session…
				a.currentStatus = v
				// …and mirror into a.sessions so the sidebar status
				// dots match reality. Events can arrive for the
				// currently-selected session OR for a sibling (a
				// subagent running on another session), so key on
				// session_id from the payload rather than assuming
				// it's always the selected one.
				targetSID, _ := pl["session_id"].(string)
				if targetSID == "" {
					targetSID = a.currentSessionID()
				}
				for i := range a.sessions {
					if a.sessions[i].ID == targetSID {
						a.sessions[i].Status = v
						break
					}
				}
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
	v.AltScreen = !a.DisableAltScreen
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
	keys := t.HintKey.Render("Ctrl+R") + t.HintLabel.Render(" retry now  ") +
		t.HintKey.Render("Ctrl+C") + t.HintLabel.Render(" quit")
	retryHint := ""
	if a.connectRetryAttempts > 0 {
		retryHint = t.HintLabel.Render(fmt.Sprintf(
			"auto-retry pending (attempt %d)", a.connectRetryAttempts+1))
	}
	body := t.Pane.BorderForeground(t.Danger).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			title, "", a.stageError, "", hint, "", retryHint, "", keys,
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
	if a.workspaceSwitchOpen {
		base = overlay(base, a.viewWorkspaceSwitch(), a.width, a.height)
	}
	if a.renameOpen {
		base = overlay(base, a.viewRename(), a.width, a.height)
	}
	if a.contextAddOpen {
		base = overlay(base, a.viewContextAdd(), a.width, a.height)
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

	// Filter indicator row — shown above the session list whenever a
	// filter is active. "editing" while sessionFilterActive, static
	// after commit. Blank when no filter so existing layout is
	// unchanged.
	if a.sessionFilterActive || a.sessionFilter != "" {
		filterText := a.sessionFilter
		if a.sessionFilterActive {
			filterText += "_"
		}
		label := "filter: "
		if a.sessionFilter == "" && a.sessionFilterActive {
			label = "filter: (type to filter)"
			filterText = ""
		}
		rows = append(rows,
			lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
				Render(label+filterText),
			"")
	}

	// Build the filter-filtered view once so the scroll math and the
	// render loop work off the same subset.
	visIdx := a.visibleSessionIndexes()

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

	// Find the selected session's position within the visible list.
	selVis := -1
	for i, idx := range visIdx {
		if idx == a.selected {
			selVis = i
			break
		}
	}
	startIdx := 0
	if selVis >= 0 && selVis >= maxSessions {
		startIdx = selVis - maxSessions + 1
	}
	endIdx := startIdx + maxSessions
	if endIdx > len(visIdx) {
		endIdx = len(visIdx)
	}
	if startIdx > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(fmt.Sprintf("  ↑ %d more", startIdx)))
	}
	if a.sessionFilter != "" && len(visIdx) == 0 {
		rows = append(rows, t.HintLabel.Render("  (no matches)"))
	}
	for i := startIdx; i < endIdx; i++ {
		sIdx := visIdx[i]
		s := a.sessions[sIdx]
		marker := "  "
		indent := ""
		titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
		statusStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
		if s.ParentSessionID != "" {
			indent = "  └ "
			titleStyle = titleStyle.Foreground(t.FgMuted).Italic(true)
		}
		if sIdx == a.selected {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
			titleStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
		}
		title := s.Title
		if title == "" {
			title = "untitled"
		}
		// Sidebar row layout: marker · indent · dot+space · title (truncated)
		// The status dot replaces the old second-line italic status text,
		// collapsing two lines into one and giving the status a splash of
		// colour/motion (spinner for running, ⚠ for waiting_permission,
		// muted · for idle). The raw status word is preserved on the second
		// line as a muted caption so accessibility doesn't lose information.
		dot := a.sessionStatusDot(s.Status)
		titleLine := marker + indent + dot + titleStyle.Render(truncate(title, width-8-len(indent)))
		statusLine := "  " + indent + "  " + statusStyle.Render(s.Status)
		rows = append(rows, titleLine, statusLine, "")
	}
	if endIdx < len(visIdx) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(fmt.Sprintf("  %d more ↓", len(visIdx)-endIdx)))
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
		// Running sessions get the animated spinner; waiting_permission
		// gets a static ⚠ so it doesn't compete for attention with the
		// actual running turns. Idle never reaches this branch.
		glyph := a.spinnerChar()
		if a.currentStatus == gact.StatusWaitingPermission {
			glyph = "⚠"
		}
		statusLine = lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
			Render(glyph + " " + a.currentStatus)
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

	// Surface a transient hint (e.g. config-reload result) above the
	// input so the user sees the outcome without losing their place.
	if a.transientHint != "" {
		hint := lipgloss.NewStyle().
			Foreground(t.Secondary).
			Italic(true).
			Render("· " + a.transientHint)
		return lipgloss.JoinVertical(lipgloss.Left, msgPane, hint, inputPane)
	}
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
	w := 60
	if w > a.width-8 {
		w = a.width - 8
	}

	if a.isSearchMode() {
		return a.viewPaletteSearch(w)
	}

	matches := a.paletteMatches()
	rows := []string{
		lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Commands"),
		lipgloss.NewStyle().Foreground(t.FgMuted).Render("filter: " + a.paletteFilter + "_"),
		lipgloss.NewStyle().Foreground(t.FgMuted).Render("(start with ? to search session messages)"),
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

// viewPaletteSearch renders the palette in message-search mode (filter
// starts with `?`). Three sub-states:
//  1. query empty (just `?`) — prompt for input
//  2. query non-empty + no results yet — show "Enter to search" hint
//  3. results loaded — render each match with msg id + snippet
func (a *App) viewPaletteSearch(w int) string {
	t := a.Theme
	query := strings.TrimSpace(a.paletteFilter[1:])
	rows := []string{
		lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Search messages"),
		lipgloss.NewStyle().Foreground(t.FgMuted).Render("query: " + query + "_"),
		"",
	}
	switch {
	case a.searching:
		rows = append(rows, t.HintLabel.Render("searching…"))
	case query == "":
		rows = append(rows, t.HintLabel.Render("(type a query, then Enter to search)"))
	case len(a.searchMatches) == 0:
		rows = append(rows, t.HintLabel.Render("Enter to search this session for: "+query))
	default:
		for i, m := range a.searchMatches {
			marker := "  "
			titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
			snippetStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
			if i == a.paletteSel {
				marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
				titleStyle = titleStyle.Foreground(t.Secondary).Bold(true)
			}
			head := marker + titleStyle.Render(shortID(m.MessageID))
			snippet := snippetStyle.Render(strings.ReplaceAll(strings.TrimSpace(m.Snippet), "\n", " "))
			rows = append(rows, truncate(head+"  "+snippet, w-2))
		}
	}
	if len(a.searchMatches) > 0 {
		rows = append(rows, "", t.HintLabel.Render("↑/↓ select  Enter jump  Esc close"))
	} else {
		rows = append(rows, "", t.HintLabel.Render("Esc close"))
	}

	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Background(t.BgSubtle).
		Padding(1, 2).
		Width(w).
		Render(body)
}

// shortID truncates a message ID for display (e.g. "msg_1a2b3c4d…").
func shortID(id string) string {
	if len(id) <= 12 {
		return id
	}
	return id[:12] + "…"
}

// viewHelp renders the help overlay.
func (a *App) viewHelp() string {
	t := a.Theme
	rows := []string{
		lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Keybindings"),
		"",
		t.HintKey.Render("Tab/⇧Tab") + "  cycle pane focus",
		t.HintKey.Render("↑/↓") + "       navigate (sidebar / scroll body)",
		t.HintKey.Render("↑ (empty)") + " recall prior prompt (per-session history)",
		t.HintKey.Render("Enter") + "     send message  /  confirm",
		t.HintKey.Render("/") + "         open command palette",
		t.HintKey.Render("/?…") + "       in palette: search session messages",
		t.HintKey.Render("?") + "         toggle this help",
		t.HintKey.Render("Esc") + "       close overlay  /  clear input",
		t.HintKey.Render("Ctrl+x") + "    cancel running scenario",
		t.HintKey.Render("y") + "         (body) copy last assistant message to clipboard",
		t.HintKey.Render("R") + "         (body) retry — resend last user message",
		t.HintKey.Render("Ctrl+n") + "    new session",
		t.HintKey.Render("Ctrl+r") + "    refresh / reconnect",
		t.HintKey.Render("Ctrl+l") + "    reload config (theme + voice cmd)",
		t.HintKey.Render("Ctrl+s") + "    settings (model / agent)",
		t.HintKey.Render("Ctrl+w") + "    switch workspace",
		t.HintKey.Render("Ctrl+t") + "    backend metrics (telemetry)",
		t.HintKey.Render("Ctrl+y") + "    voice transcribe (insert at cursor)",
		t.HintKey.Render("n / x / e") + " (sidebar) new / delete / rename session",
		t.HintKey.Render("A") + "         (sidebar) archive session (or un-archive in archived view)",
		t.HintKey.Render("o") + "         (sidebar) add a file to session context",
		t.HintKey.Render("h") + "         (sidebar) toggle archived view",
		t.HintKey.Render("/") + "         (sidebar) filter sessions by title",
		t.HintKey.Render("g / G") + "     (sidebar) jump to first / last session",
		t.HintKey.Render("PgUp/PgDn") + " (sidebar) page up / down",
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
	text      string // the user message just posted; used by auto-rename
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

type voiceTranscribedMsg struct {
	text       string
	durationMs int
}

type diffsAppliedMsg struct {
	paths []string
}

type diffsRejectedMsg struct {
	paths []string
}
