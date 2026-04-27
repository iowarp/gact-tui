package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"image/color"
	"math/rand"
	"os"
	"strings"
	"time"

	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/textarea"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
	figure "github.com/common-nighthawk/go-figure"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/intro"
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
	// StageIntro is the splash screen shown before connecting (JJJ1).
	// Any key dismisses it and transitions into StageConnecting.
	StageIntro
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

	// SaveConfig persists the current Settings > TUI preferences (N5)
	// to the config file. Wired by main.go; tests leave it nil and
	// the stepper just updates in-memory state.
	SaveConfig func() error

	// PruneDetachedRegistry drops a session id from the local
	// detached.json so a deleted session doesn't linger in `gact
	// detached` output. Wired by main.go; tests leave it nil and
	// delete is otherwise a no-op for the registry. (BBBBBBBB1)
	PruneDetachedRegistry func(sessionID string)

	// LLLLLLLL1: transientHintAt stamps when transientHint was last
	// set to a non-empty value. handleKey's blanket-clear on any
	// keypress honours a minimum-display floor so hints that arrive
	// BETWEEN keystrokes don't flash for one frame and vanish on
	// the user's next key. setTransientHint wraps the assignment so
	// call sites don't have to remember to update the stamp.
	transientHintAt time.Time

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
	// CLIO-BBBBBBBBBB4 (v0.2 §6.19): last-known memory stats from
	// the backend. Populated when capabilities.memory = true and
	// the client fetches GET /v1/memory/stats on session-status
	// changes. Renders as a small cache hit-rate chip in the footer.
	// Zero-value renders as nothing (no chip).
	memoryStats gact.MemoryStats
	workspaces  []gact.Workspace
	wsID       string
	sessions   []gact.Session
	selected   int // index into sessions; -1 if none
	commands   []gact.Command

	// Loaded messages for the currently selected session.
	messages       []gact.Message
	scrollOffset   int // 0 = stick to bottom; >0 = scrolled up
	stickyToBottom bool

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

	// sseDownSince is the wall-clock time the current SSE outage
	// started (when sseBackoffAttempts went 0→positive); zero when the
	// stream is healthy. Used by renderFooter to suppress the
	// "(reconnecting…)" badge during sub-second blips so the bottom
	// hint bar doesn't flicker on a healthy connection. (DDDDD1)
	sseDownSince time.Time

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

	// inPaste is true between PasteStartMsg and PasteEndMsg. While set,
	// the Enter interceptor stands down so a newline embedded in the
	// paste stream doesn't get treated as "send message" — that was the
	// "paste creates multiple prompts" bug from user testing. When the
	// terminal groups the whole paste into a single PasteMsg (bracketed
	// paste), this flag is incidental; when the terminal splits the
	// paste into individual KeyPressMsg events between Start/End (seen
	// in some tmux + Windows Terminal combos), this flag is what
	// actually prevents message splitting.
	inPaste bool

	// searchHitMessageID marks the message that was jumped to from the
	// palette ?search results. The render layer draws a gutter marker
	// on that row so users can spot their hit. Cleared on the next
	// action (session switch, filter edit, etc.).
	searchHitMessageID string

	// bodySelMsgIdx is the body-focus message cursor. -1 = no
	// selection (the pane behaves as before). `n` / `N` walk it
	// forward/backward. Reset on session switch.
	bodySelMsgIdx int

	// TTTTTTTTT1: bodySelPartIdx is the body cursor's *part* index
	// within the selected message's addressable parts — feedback:
	// "your selector goes conversation turn to conversation turn
	// instead of logical block to logical block". When an assistant
	// reads two files in one turn, each read_file/tool_result is a
	// distinct addressable block; up/down/j/k now walk them flat
	// across message boundaries. -1 = auto (picks the first bulky
	// part at open time, preserves pre-TTTTTTTTT1 Ctrl+E behaviour
	// for the unset case). 0-based; addressablePartsOf() defines
	// what counts as a block.
	bodySelPartIdx int

	// VVVVVVVVV1: set true by every cursor-moving handler
	// (stepPartCursor, g/G, maybeInitBodyCursor
	// on focus-in). On the next render pass, renderBody measures
	// where the ▸ marker fell in the full body string and bumps
	// scrollOffset so the marker stays within the viewport —
	// fixing the "selected block scrolled above the fold" wart
	// from TTTTTTTTT1. Cleared after the one-shot adjustment so
	// subsequent renders don't re-thrash the scroll if the user
	// PgDn'd past the marker deliberately.
	pendingPartScroll bool

	// Compose modal (M5): a full-screen-ish textarea seeded with the
	// current input, for long prompts / expanded paste review. Opened
	// from the input pane via Ctrl+G or Ctrl+Shift+P.
	composeOpen bool
	compose     *composeState

	// @-file picker (M6): fuzzy-search workspace files and insert a
	// ref into the input. Opened when the user types @ at the start
	// of a new word.
	filePickerOpen bool
	filePicker     *filePickerState

	// Catalog browser (L5): /mcp /tools /skills open a read-only list
	// modal backed by the matching catalog endpoint.
	catalogBrowserOpen bool
	catalogBrowser     *catalogBrowserState

	// LLL2: tool ids the user has hidden from the catalog browser. Set
	// from Config.DisabledTools at startup and persisted via SaveConfig
	// when toggled. Today purely a TUI display filter.
	disabledTools map[string]bool

	// JJJ1: ASCII splash. Empty = use baked-in defaults.
	// Loaded from --intro-file or ~/.config/gact/intro.txt at startup.
	IntroLogo []string
	IntroName []string

	// IntroDisabled is the persisted "skip the splash" preference
	// (YYYYY1). Mirrors config.Config.IntroSkip; the CLI flag /
	// env var still wins at startup. Settings → TUI lets users flip
	// it without restarting.
	IntroDisabled bool

	// MMM8b: discovered plugins. Their commands are merged into the
	// slash palette; selecting one execs the plugin's binary instead
	// of POSTing to /v1/sessions/{id}/commands/{id}.
	plugins []pluginCommand

	// UUU1: per-session task counts for the sidebar badge. Keyed by
	// session id; populated lazily on selectSession (and reset to 0
	// for that sid before fetch). Sessions absent from the map render
	// without a badge.
	taskCountBySession map[string]int

	// OOO1: when set (via `gact attach <name|sid>`), the connectedMsg
	// handler picks this session out of the freshly-loaded list
	// instead of defaulting to index 0. Either a literal sess_<id>
	// or a title — both are matched.
	AttachSessionID string

	// IIIII1: when set on Ctrl+Z (clean detach), main.go reads this
	// after p.Run() returns and prints "Detached … Reattach: gact
	// attach <sid>" to stderr. Empty means the TUI exited via Ctrl+C
	// or normal quit. The backend session lives on either way — this
	// is purely a hint mechanism so the user knows the session is
	// retrievable.
	DetachedSessionID string
	// AAAAAAAA1: title + workspace captured at detach time so main.go
	// can persist a richer record into the detached registry — `gact
	// detached` shows title alongside sid so the user doesn't have to
	// memorise an opaque sess_xxxx string to find the session they
	// walked away from.
	DetachedTitle     string
	DetachedWorkspace string
	// BBBBBBBB1: SIDs the user has previously detached from (loaded
	// from the registry at startup, prunes itself when the user
	// destroys a session via x/x). Used by renderSidebar to draw a
	// small marker so the user can spot "this is the one I walked
	// away from" without leaving the TUI.
	previouslyDetached map[string]bool

	// MMMMMMMMM1: introFrameIdx drives the animated splash. Advances
	// on each introTickMsg while stage==StageIntro and loops on
	// len(intro.GRCLogoFrames()). Not persisted — splash dismisses
	// on the first keypress anyway.
	introFrameIdx int

	// NNNNNNNNN1: per-frame delay for the animated splash. Zero
	// means "use the introFrameDelay default". main.go overrides
	// from config.IntroFrameDelayMs. Clamped at the tick site so a
	// typo (e.g. 0 or 10000ms) doesn't freeze or flood the splash.
	IntroFrameDelay time.Duration

	// pendingClearSessionID arms a two-step /clear confirmation on
	// the named session. A first /clear sets this + a toast; the
	// second /clear within the toast window actually wipes. Any
	// other key/command cancels the pending state. Same idea as
	// K5's pendingDeleteSessionID but scoped to messages.
	pendingClearSessionID string

	// inputDraftBySession preserves per-session in-flight drafts so
	// switching away and back doesn't wipe what the user was typing.
	// Lifetime is the app process — restart drops the map (N5 tracks
	// persistence via config.json).
	inputDraftBySession map[string]string

	// lastLoadedSessionID is the session ID the input buffer currently
	// belongs to. selectSession uses this (not currentSessionID which
	// reads a.selected AFTER callers have updated it) to stash the
	// outgoing draft under the correct key.
	lastLoadedSessionID string

	// pastes is a chronological record of multi-line pastes that have
	// been compressed in the input box as `[pasted content: N lines]`
	// placeholders. On send, each placeholder still present in the
	// buffer is expanded back to its full content. Ctrl+P expands the
	// most recent compressed paste in-place so users can see what
	// they're actually sending.
	pastes []pastedSegment

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
	helpTab  int // active tab index when helpOpen; see helpTabs

	// ZZZZZZZZZ1: Ctrl+C confirmation overlay. User feedback: "ctrl+c
	// should have a confirmation window, close? yes no detach". Opens
	// a small 3-option modal on first Ctrl+C; the selected option
	// fires on Enter. Second Ctrl+C while open accepts the current
	// selection so muscle-memory "ctrl+c ctrl+c" still quits.
	quitConfirmOpen     bool
	quitConfirmSelected int // 0=close, 1=cancel-modal, 2=detach

	// Settings overlay
	settingsOpen bool
	settings     *settingsState

	// Metrics overlay
	metricsOpen bool
	metrics     *metricsState

	// Doctor overlay (v0.2 §3.4 — CLIO-BBBBBBBBBB4). Shows the
	// backend's integrations[] array + overall_status in a per-
	// subsystem table. Opens via /doctor; closes with Esc / q.
	doctorOpen bool

	// CLIO-BBBBBBBBBB-D: LM-config modal — opened on first connect
	// when /v1/health reports the agent (or "lm" subsystem) as
	// unavailable, so the user picks a provider/model before they
	// type anything. Backends that don't expose /v1/providers/lm
	// (everything except clio-agent-gact) skip this entirely.
	lmConfigOpen bool
	lmConfig     *lmConfigState
	doctor     *doctorState

	// MCP install / remove overlays. Tied to the /mcp-install +
	// /mcp-remove slash commands. State is intentionally tiny — install
	// is a one-line input, remove is a picker over the current
	// a.mcpServers slice (filtered to third-party).
	mcpInstallOpen   bool
	mcpInstallInput  string
	mcpInstallErr    string
	mcpInstallSaving bool
	mcpRemoveOpen    bool
	mcpRemoveOptions []gact.McpServer
	mcpRemoveSel     int
	mcpRemoveSaving  bool

	// Cached MCP server list, populated each time /mcp opens. The remove
	// modal reads from this so it doesn't need an extra round-trip.
	mcpServers []gact.McpServer

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

	// Floating detail view (L3) — shows a bulky tool_result's full
	// content in a scrollable modal. Opens on Ctrl+E from body focus
	// when there's a collapsed tool_result in the loaded messages.
	detailViewOpen bool
	detailView     *bulkyPartRef
	detailScroll   int

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

	// JJJJJJJJ1: showDetachedOnly narrows the sidebar to sessions
	// the user has previously Ctrl+Z-detached from (match against
	// previouslyDetached). Toggled via `d` in sidebar focus —
	// parallel to the `h` archived toggle. Helps users with many
	// sessions focus on resume candidates.
	showDetachedOnly bool

	// XXXXXXXX1: showBusyOnly narrows the sidebar to sessions whose
	// status is running or waiting_permission — useful when you have
	// many background turns going and want to monitor just the
	// in-progress ones. Toggled via `b` in sidebar focus. Parallels
	// the JJJJJJJJ1 `d` detached-only pattern.
	showBusyOnly bool

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

	// Set by SSE handlers when the current session's message list
	// should be reloaded from scratch (e.g. /clear wiped the backend).
	// The next Update reads + clears it and fires loadMessagesCmd.
	pendingReload bool
}

// New constructs an App with the default (dark) theme.
func New(backendURL string) *App {
	return NewWithTheme(backendURL, DefaultTheme())
}

// NewWithTheme constructs an App with a specific theme.
func NewWithTheme(backendURL string, theme Theme) *App {
	ta := textarea.New()
	// ZZZZZ1: placeholder leads with the always-works newline option
	// (\\<Enter>) because Shift+Enter requires terminal support
	// (kitty/xterm extended modifiers / modifyOtherKeys); not all
	// terminals send the modifier through. \\<Enter> works everywhere
	// since it's just a literal char + Enter the handler intercepts.
	ta.Placeholder = "type a message — Enter to send · \\<Enter> for newline (Shift+Enter on supporting terminals)"
	// VVVVV1: render `> ` only on the first row of the input. Wrapped /
	// multi-line input previously got a `>` gutter on every visible
	// row, which the user called "ugly". Continuation rows now use
	// two spaces so the cursor column stays put but the chevron
	// doesn't repeat. Width 2 matches the `> ` width so the textarea
	// reserves the same horizontal space either way.
	ta.SetPromptFunc(2, func(p textarea.PromptInfo) string {
		if p.LineNumber == 0 {
			return "> "
		}
		return "  "
	})
	ta.SetHeight(3)
	ta.SetWidth(80)
	ta.ShowLineNumbers = false
	// Rebind newline: plain Enter is reserved for "send". Users hit
	// Shift+Enter / Alt+Enter / Ctrl+J to insert a literal newline
	// (common chat-app shortcuts). Without this the textarea's default
	// binding swallows "enter" for newline and Enter would never fire
	// the send path.
	ta.KeyMap.InsertNewline = key.NewBinding(
		key.WithKeys("shift+enter", "alt+enter", "ctrl+j"),
		key.WithHelp("shift+enter", "newline"),
	)
	ta.Focus()
	return &App{
		BackendURL:            backendURL,
		Theme:                 theme,
		c:                     client.New(backendURL),
		stage:                 StageConnecting,
		focus:                 FocusInput,
		selected:              -1,
		stickyToBottom:        true,
		input:                 ta,
		inputHistoryBySession: map[string][]string{},
		historyCursor:         -1,
		bodySelMsgIdx:         -1,
		bodySelPartIdx:        -1,
		previouslyDetached:    map[string]bool{},
	}
}

// LoadDetachedRegistry seeds previouslyDetached from the local
// detached.json registry. Called by main.go before p.Run() so the
// sidebar marker can paint as soon as sessions arrive. Soft-fails:
// a missing or unreadable registry is not a TUI startup failure,
// the marker just won't appear. (BBBBBBBB1)
func (a *App) LoadDetachedRegistry(records []DetachedRegistryEntry) {
	a.previouslyDetached = map[string]bool{}
	for _, r := range records {
		// Only mark sessions that belong to this TUI's backend —
		// the registry stores entries from every backend the user
		// has ever detached from, but the sidebar only shows the
		// current backend's sessions.
		if r.Backend == a.BackendURL {
			a.previouslyDetached[r.SessionID] = true
		}
	}
}

// DetachedRegistryEntry is the slim shape App needs from main.go
// (mirrors config.DetachedRecord without dragging the import into
// internal/ui — keeps the package boundary clean).
type DetachedRegistryEntry struct {
	SessionID string
	Backend   string
}

// EnableIntro flips the initial stage to StageIntro so the splash
// renders before the connect flow starts. Call from main before the
// program is run when intro_skip is not set. (JJJ1)
func (a *App) EnableIntro() { a.stage = StageIntro }

// MMMMMMMMM1: introTickMsg advances the animated splash by one
// frame. introTick returns a cmd that re-fires itself on the
// fixed frame cadence so the splash loops smoothly.
type introTickMsg struct{}

// introFrameDelay is the fallback per-frame delay: 36 frames × 90ms
// ≈ 3.2s per loop. Slowed from the initial 33ms/frame (30 FPS) per
// user feedback on the basic-crop logo — at that rate the rotation
// blurred past before the viewer could appreciate it. NNNNNNNNN1:
// users can override via config.IntroFrameDelayMs; main.go plumbs
// that into App.IntroFrameDelay, which `(a *App).tickDelay()`
// clamps to [20ms, 1s] before handing to tea.Tick.
const introFrameDelay = 90 * time.Millisecond

func (a *App) tickDelay() time.Duration {
	d := a.IntroFrameDelay
	if d <= 0 {
		return introFrameDelay
	}
	if d < 20*time.Millisecond {
		return 20 * time.Millisecond
	}
	if d > 1*time.Second {
		return 1 * time.Second
	}
	return d
}

func (a *App) introTickCmd() tea.Cmd {
	return tea.Tick(a.tickDelay(), func(time.Time) tea.Msg { return introTickMsg{} })
}

// Init returns the initial Cmd: connect.
func (a *App) Init() tea.Cmd {
	// JJJ1: defer the connect handshake until the splash dismisses.
	// Without this, connectedMsg can arrive before the user sees the
	// splash and flip straight to StageReady.
	if a.stage == StageIntro {
		// MMMMMMMMM1: start the frame-advance tick as soon as the
		// splash renders, so the animation runs while the user
		// reads "press any key to continue".
		return a.introTickCmd()
	}
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
		// Only hit /v1/workspaces when the backend advertises the
		// capability. Backends that don't model workspaces (e.g.
		// clio-agent-gact) advertise workspaces=false and 501 on
		// the endpoint; the TUI used to blow up on the error
		// before gating. CLIO-BBBBBBBBBB14.
		var wss []gact.Workspace
		if caps.Capabilities.Workspaces {
			wss, err = c.ListWorkspaces(ctx)
			if err != nil {
				return errMsg{err: err, stage: "workspaces"}
			}
		}
		var sessions []gact.Session
		var wsID string
		if len(wss) > 0 {
			wsID = wss[0].ID
			sessions, err = c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
			if err != nil {
				return errMsg{err: err, stage: "sessions"}
			}
		} else if caps.Capabilities.Sessions {
			// No workspace dimension — list sessions scoped only
			// by backend. ListSessions with empty WorkspaceID
			// omits the filter.
			sessions, err = c.ListSessions(ctx, client.SessionFilter{})
			if err != nil {
				return errMsg{err: err, stage: "sessions"}
			}
		}
		commands, _ := c.ListCommands(ctx)
		return connectedMsg{caps: caps, wss: wss, wsID: wsID, sessions: sessions, commands: commands}
	}
}

// CLIO-BBBBBBBBBB4: memoryStatsCmd fetches GET /v1/memory/stats.
// sessionID is optional (pass "" for global-only). Errors land as a
// transient hint rather than blowing up — stats are decorative.
func memoryStatsCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		stats, err := c.MemoryStats(ctx, sessionID)
		if err != nil {
			return errMsg{err: err, stage: "memory_stats"}
		}
		return memoryStatsMsg{stats: stats}
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

// loadSessionTasksCmd fetches §6.18 tasks for a session. Used by
// UUU1 to render a `(N tasks)` badge on the sidebar row. Failures
// are silent — tasks are optional capability and we don't want to
// spam errors on backends that 404 the endpoint.
func loadSessionTasksCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		tasks, err := c.ListSessionTasks(ctx, sessionID)
		if err != nil {
			return sessionTasksLoadedMsg{sessionID: sessionID, tasks: nil}
		}
		return sessionTasksLoadedMsg{sessionID: sessionID, tasks: tasks}
	}
}

type sessionTasksLoadedMsg struct {
	sessionID string
	tasks     []gact.SessionTask
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
//
// Connection setup (StreamEvents → http.Client.Do) blocks until the
// server returns the SSE response headers — for a healthy backend
// that's <50 ms, but a wedged or slow-to-accept server can stall the
// Update loop for the full HTTP timeout. Wrap the whole open inside
// the returned tea.Cmd so the goroutine takes the hit, never the
// render thread. The first event lands as a sseConnectedMsg that
// stashes the channels on the app and arms waitForSSE.
func (a *App) startSSECmd(sessionID string) tea.Cmd {
	if a.sseCancel != nil {
		a.sseCancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.sseCancel = cancel
	lastSeen := a.lastSeenSeqID
	c := a.c
	return func() tea.Msg {
		events, errs, err := c.StreamEvents(ctx, client.EventStreamScope{
			SessionID:   sessionID,
			LastEventID: lastSeen,
		})
		if err != nil {
			return errMsg{err: err, stage: "sse"}
		}
		return sseConnectedMsg{events: events, errs: errs}
	}
}

// sseConnectedMsg carries the freshly-opened SSE channels back to the
// Update loop so it can stash them on App and arm waitForSSE.
type sseConnectedMsg struct {
	events <-chan client.SSEEvent
	errs   <-chan error
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
		// Real LLM turns can easily run 10s+ (Haiku via a proxy is
		// ~5-15s; Sonnet via a ReAct loop can be minutes). 120s gives
		// the TUI enough patience without hanging forever on a wedged
		// backend — SSE is the source of truth for in-flight
		// progress anyway.
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
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
	// LLLLLLLL1: snapshot the hint going INTO this Update cycle.
	// If a branch below assigns a different non-empty value we
	// stamp transientHintAt after switch returns. This means the
	// "first seen" time tracks the Update that actually set the
	// hint — not an arbitrary later Update that only read it.
	preHint := a.transientHint
	defer func() {
		if a.transientHint != "" && a.transientHint != preHint {
			a.transientHintAt = time.Now()
		}
		if a.transientHint == "" {
			a.transientHintAt = time.Time{}
		}
	}()
	switch m := msg.(type) {
	case tea.WindowSizeMsg:
		a.width = m.Width
		a.height = m.Height
		return a, nil

	case tea.KeyPressMsg:
		return a.handleKey(m)

	case introTickMsg:
		// MMMMMMMMM1: while the splash is up, advance the logo
		// frame and schedule the next tick. As soon as we leave
		// StageIntro (any keypress), the tick returns nil and the
		// loop dies naturally.
		if a.stage != StageIntro {
			return a, nil
		}
		frames := intro.GRCLogoFrames()
		if len(frames) > 0 {
			a.introFrameIdx = (a.introFrameIdx + 1) % len(frames)
		}
		return a, a.introTickCmd()

	case tea.PasteStartMsg:
		a.inPaste = true
		// Don't forward to textarea — PasteStartMsg is a state signal,
		// not content. The textarea handles content via PasteMsg.
		return a, nil
	case tea.PasteEndMsg:
		a.inPaste = false
		return a, nil
	case tea.PasteMsg:
		// Compose modal takes paste routing whenever it's open — that's
		// the whole point of "pastes render expanded" there.
		if a.composeOpen && a.compose != nil {
			var cmd tea.Cmd
			a.compose.ta, cmd = a.compose.ta.Update(m)
			return a, cmd
		}
		// Forward paste events to the textarea when input has focus.
		// This is the bracketed-paste happy path: one PasteMsg with the
		// whole multi-line content, inserted as a single operation.
		if a.focus == FocusInput && !a.helpOpen && !a.paletteOpen && !a.settingsOpen && !a.metricsOpen && !a.workspaceSwitchOpen && !a.renameOpen && !a.contextAddOpen && !a.detailViewOpen && !a.quitConfirmOpen && !a.doctorOpen && !a.lmConfigOpen {
			// Claude-Code-style compressed paste: multi-line pastes get a
			// [pasted content: N lines] placeholder in the input, with
			// the full content stashed on App. Ctrl+P toggles expand.
			// Threshold is user-configurable via Settings → TUI (YYYYY1).
			threshold := a.Theme.PasteCompressThreshold
			if threshold <= 0 {
				threshold = 3
			}
			if n := strings.Count(m.Content, "\n") + 1; n >= threshold {
				a.insertPastePlaceholder(m.Content, n)
				return a, nil
			}
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
		// CLIO-BBBBBBBBBB4 (v0.2 §6.19): if the backend advertises
		// memory, pull an initial snapshot so the footer chip paints
		// right away. Session-scoped refresh happens on status_changed.
		if a.caps.Capabilities.Memory {
			cmds = append(cmds, memoryStatsCmd(a.c, ""))
		}
		// CLIO-BBBBBBBBBB-D: probe /v1/providers/lm so we know
		// whether the backend exposes runtime LM config + whether
		// it needs the user to configure one. Failures (404 from
		// non-CLIO backends) are silent.
		cmds = append(cmds, lmConfigFetchCmd(a.c))
		if len(a.sessions) > 0 {
			pick, missing := a.pickAttachIndex()
			a.selected = pick
			if missing {
				a.transientHint = "attach: session " + a.AttachSessionID + " not found; showing first row"
				cmds = append(cmds, scheduleHintExpire(a.transientHint))
			}
			cmds = append(cmds, a.selectSession(pick))
		}
		return a, tea.Batch(cmds...)

	case memoryStatsMsg:
		// CLIO-BBBBBBBBBB4: cache the latest snapshot; the footer's
		// render path reads this each frame.
		a.memoryStats = m.stats
		return a, nil

	case lmConfigFetchedMsg:
		// CLIO-BBBBBBBBBB-D: backend's response to GET /v1/providers/lm.
		// Three outcomes:
		//   1. err != nil → backend failed; keep silent (the
		//      adjacent /v1/health probe will surface the failure).
		//   2. info == nil → endpoint not supported (404). Backends
		//      that don't expose runtime LM config (every adapter
		//      except clio-agent-gact today) get here; nothing to do.
		//   3. info != nil + configured == false → pop the modal so
		//      the user can pick a provider before they type.
		if m.err != nil || m.info == nil {
			return a, nil
		}
		if a.lmConfigOpen {
			// Modal was opened by the user (Settings → Change provider…)
			// or already showing — populate with the freshly-fetched info.
			if a.lmConfig == nil {
				a.lmConfig = &lmConfigState{}
			}
			a.lmConfig.info = m.info
			a.lmConfigSyncFromPreset()
			return a, nil
		}
		if !m.info.Configured {
			a.lmConfigOpen = true
			a.lmConfig = &lmConfigState{info: m.info}
			a.lmConfigSyncFromPreset()
		}
		return a, nil

	case lmConfigSavedMsg:
		if a.lmConfig == nil {
			return a, nil
		}
		a.lmConfig.saving = false
		if m.err != nil {
			a.lmConfig.err = m.err
			return a, nil
		}
		// Success: dismiss the modal + retry whatever the user
		// was waiting on. A reconnect refreshes capabilities +
		// sessions in case the agent reload changed something.
		a.lmConfigOpen = false
		a.lmConfig = nil
		a.transientHint = "LM configured: " +
			m.info.Provider + "/" + m.info.Model
		return a, scheduleHintExpire(a.transientHint)

	case doctorFetchedMsg:
		// CLIO-BBBBBBBBBB4: /doctor modal finished its /v1/health
		// fetch. Update the modal state if it's still open (user may
		// have dismissed during the fetch — drop the response in that
		// case to avoid a flash of old data on re-open).
		if a.doctorOpen && a.doctor != nil {
			a.doctor.loading = false
			a.doctor.err = m.err
			a.doctor.health = m.health
			a.doctor.caps = m.caps
		}
		return a, nil

	case errMsg:
		// Search failures shouldn't blow away the whole UI — clear the
		// in-flight flag and surface a single empty result so the user
		// can adjust the query without losing their session view.
		if m.stage == "search" {
			a.searching = false
			a.searchMatches = nil
			return a, nil
		}
		// CLIO-BBBBBBBBBB4: memory stats are decorative; a failure
		// just hides the chip until the next refresh.
		if m.stage == "memory_stats" {
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

	case hintExpireMsg:
		// Only clear if the hint is still the one we scheduled — a
		// newer toast set mid-dwell shouldn't be wiped by the older
		// tick. Equivalent to versioning the hint without carrying a
		// separate counter.
		if a.transientHint == m.text {
			a.transientHint = ""
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

	case pluginExecMsg:
		// MMM8b: surface plugin output (or failure) as a transient
		// hint. The full output stays on the user's terminal in
		// stderr/stdout via the captured combined buffer; first line
		// is enough for the toast.
		first := m.Output
		if i := strings.IndexByte(first, '\n'); i > 0 {
			first = first[:i]
		}
		if m.Err != nil {
			a.transientHint = "plugin " + m.ID + " failed: " + first
		} else if first != "" {
			a.transientHint = "plugin " + m.ID + ": " + first
		} else {
			a.transientHint = "plugin " + m.ID + " done"
		}
		return a, scheduleHintExpire(a.transientHint)

	case messagesLoadedMsg:
		// Only apply if it's for the currently selected session.
		if a.currentSessionID() == m.sessionID {
			a.messages = m.messages
			a.stickyToBottom = true
		}
		return a, nil

	case sessionTasksLoadedMsg:
		// UUU1: stash count for the badge. Pending+running tasks count
		// (treat completed/failed as "done" — irrelevant to the badge).
		if a.taskCountBySession == nil {
			a.taskCountBySession = map[string]int{}
		}
		open := 0
		for _, t := range m.tasks {
			if t.Status == "pending" || t.Status == "running" {
				open++
			}
		}
		a.taskCountBySession[m.sessionID] = open
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

	case sseConnectedMsg:
		// Stream just finished its handshake (off the Update goroutine).
		// Stash the channels on App and start blocking on the first event.
		a.sseEvents = m.events
		a.sseErrs = m.errs
		return a, waitForSSE(m.events, m.errs)

	case sseEventMsg:
		// Event arrival means the stream is healthy — reset the
		// reconnect backoff so the NEXT disconnect waits 250 ms, not
		// whatever the attempts counter had climbed to.
		a.sseBackoffAttempts = 0
		a.sseDownSince = time.Time{} // DDDDD1: clear outage clock
		// Track the highest SeqID we've processed so a reconnect can
		// resume via Last-Event-ID rather than silently dropping
		// events published during the outage. Monotonic under normal
		// operation; a max() guards against a late-arriving out-of-
		// order event from a replay window not dragging us backwards.
		if seq := m.Event.SeqID(); seq > a.lastSeenSeqID {
			a.lastSeenSeqID = seq
		}
		prevRunning := a.anySessionRunning()
		prevStatus := a.currentStatus
		a.applySSE(m.Event)
		cmds := []tea.Cmd{waitForSSE(a.sseEvents, a.sseErrs)}
		// CLIO-BBBBBBBBBB4 (v0.2 §6.19): when a turn just settled
		// back to idle AND the backend has memory, refresh the cache
		// stats. Piggy-backs on the status_changed event loop — one
		// fetch per turn completion, no extra polling.
		if a.caps.Capabilities.Memory &&
			prevStatus != a.currentStatus && a.currentStatus == gact.StatusIdle {
			cmds = append(cmds, memoryStatsCmd(a.c, a.currentSessionID()))
		}
		if a.pendingSidebarRefresh && a.wsID != "" {
			a.pendingSidebarRefresh = false
			cmds = append(cmds, reloadSessionsCmd(a.c, a.wsID))
		}
		if a.pendingReload {
			a.pendingReload = false
			if sid := a.currentSessionID(); sid != "" {
				cmds = append(cmds, loadMessagesCmd(a.c, sid))
			}
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
			// DDDDD1: stamp the start of the outage on the FIRST drop
			// in this run so the renderer can hide the
			// "(reconnecting…)" badge until the disconnect has lasted
			// long enough to be worth surfacing. Subsequent backoff
			// ticks must NOT reset this — that would let a long outage
			// keep flickering as each reconnect attempt cycles.
			if a.sseBackoffAttempts == 0 {
				a.sseDownSince = time.Now()
			}
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

	case filePickerLoadedMsg:
		if a.filePicker == nil {
			return a, nil
		}
		a.filePicker.entries = m.entries
		a.filePicker.loaded = true
		return a, nil

	case catalogBrowserLoadedMsg:
		if a.catalogBrowser == nil || a.catalogBrowser.kind != m.kind {
			return a, nil
		}
		// Late-arriving MCP-detail loads must match the server we're
		// currently viewing — otherwise a fast back-out + forward-in
		// could overwrite with stale data.
		if m.kind == catalogKindMcpDetail && m.mcpServerID != a.catalogBrowser.mcpServerID {
			return a, nil
		}
		a.catalogBrowser.loading = false
		a.catalogBrowser.items = m.items
		a.catalogBrowser.errText = m.errText
		if a.catalogBrowser.sel >= len(m.items) {
			a.catalogBrowser.sel = 0
		}
		return a, nil

	case mcpServersFetchedMsg:
		a.mcpServers = m.servers
		if a.mcpRemoveOpen {
			a.mcpRemoveSaving = false
			if m.err != nil {
				a.transientHint = "mcp list failed: " + m.err.Error()
				a.mcpRemoveOpen = false
				return a, scheduleHintExpire(a.transientHint)
			}
			var removable []gact.McpServer
			for _, s := range m.servers {
				if s.Transport == "in_process" {
					continue
				}
				removable = append(removable, s)
			}
			a.mcpRemoveOptions = removable
			if len(removable) == 0 {
				a.mcpRemoveOpen = false
				a.transientHint = "no third-party MCPs installed (bundled servers cannot be removed)"
				return a, scheduleHintExpire(a.transientHint)
			}
		}
		return a, nil

	case mcpInstallDoneMsg:
		a.mcpInstallSaving = false
		if m.err != nil {
			a.mcpInstallErr = m.err.Error()
			return a, nil
		}
		a.mcpInstallOpen = false
		a.mcpInstallInput = ""
		a.mcpInstallErr = ""
		name, _ := m.result["name"].(string)
		id, _ := m.result["id"].(string)
		a.transientHint = fmt.Sprintf("installed MCP %s (%s)", name, id)
		return a, tea.Batch(scheduleHintExpire(a.transientHint), mcpListServersCmd(a.c))

	case mcpUninstallDoneMsg:
		a.mcpRemoveSaving = false
		if m.err != nil {
			a.transientHint = "uninstall failed: " + m.err.Error()
		} else {
			a.transientHint = "removed " + m.serverID
		}
		a.mcpRemoveOpen = false
		a.mcpRemoveOptions = nil
		return a, tea.Batch(scheduleHintExpire(a.transientHint), mcpListServersCmd(a.c))

	case settingsLoadedMsg:
		if a.settings == nil {
			a.settings = &settingsState{}
		}
		a.settings.modelList = m.models
		a.settings.agentList = m.agents
		a.settings.loadErr = m.loadErr
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
	// DDDDD1: don't surface "(reconnecting…)" until the SSE outage
	// has lasted at least this long. Eliminates the single-frame
	// footer flicker on routine sub-second reconnect blips while
	// keeping real outages visible within a second.
	sseBadgeMinDelay = 800 * time.Millisecond
	// LLLLLLLL1: min dwell before a transient hint is eligible for
	// keystroke-clear. Prevents the "hint set by background event
	// between two keystrokes disappears on the user's next key"
	// flicker. Same 800ms floor as the reconnect badge so the two
	// toast paths use the same "sub-second = not worth flashing" rule.
	transientHintMinDwell = 800 * time.Millisecond
)

// retryConnectMsg fires after the connect-retry backoff elapses and
// triggers another connectCmd if the TUI is still in StageError.
type retryConnectMsg struct{}

// hintExpireMsg fires after the transient-hint dwell delay to auto-
// clear stale toasts. Without this, a hint set by e.g. /clear could
// linger until the next user action. Carries the exact text it was
// scheduled for so a newer hint doesn't get wiped by the old tick.
type hintExpireMsg struct {
	text string
}

// scheduleHintExpire returns a Cmd that fires a hintExpireMsg after
// hintDwell. Callers that set a.transientHint should tea.Batch this
// in so the toast fades out even if the user doesn't touch anything.
func scheduleHintExpire(text string) tea.Cmd {
	return tea.Tick(hintDwell, func(time.Time) tea.Msg {
		return hintExpireMsg{text: text}
	})
}

// hintDwell is how long a transient hint stays on screen before
// auto-clearing. Long enough for the user to read a short toast,
// short enough that they don't feel stuck with stale status.
const hintDwell = 4 * time.Second

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
	// IIIII1: Ctrl+Z is a CLEAN detach, not a SIGTSTP suspend.
	// Sets DetachedSessionID so main.go can print a reattach hint
	// after p.Run() returns, then quits the program. The backend
	// session keeps running by design (sessions are server-side
	// state) — `gact attach <sid>` resumes the conversation in a
	// new TUI process. User explicitly asked for tmux-like detach
	// instead of the previous LLL8b job-control suspend, which
	// "leveraging the linux background execution is just cheap"
	// (lost the session if the terminal closed).
	if k.String() == "ctrl+z" {
		a.DetachedSessionID = a.currentSessionID()
		// AAAAAAAA1: capture title + workspace so main.go can record
		// a useful row in the detached registry.
		if a.selected >= 0 && a.selected < len(a.sessions) {
			s := a.sessions[a.selected]
			a.DetachedTitle = s.Title
			a.DetachedWorkspace = s.WorkspaceID
		}
		return a, tea.Quit
	}
	// Clear any transient hint banner — it's a one-off toast that
	// shouldn't persist past the next interaction. Done before modal
	// dispatch so even hitting "Esc" in a modal dismisses the banner.
	// LLLLLLLL1: but only if the hint has been on-screen long enough
	// for the user to read it. Without the min-display gate, a hint
	// set by a background event (SSE reconnect, session archive
	// confirmation, etc.) between two keystrokes gets clobbered on
	// the very next key, flashing for one frame. 800 ms matches the
	// DDDDD1 reconnect-badge threshold so the two toast paths use the
	// same "sub-second = not worth flashing" rule.
	if k.String() != "ctrl+l" && a.transientHint != "" {
		if a.transientHintAt.IsZero() ||
			time.Since(a.transientHintAt) >= transientHintMinDwell {
			a.transientHint = ""
			a.transientHintAt = time.Time{}
		}
	}
	// Any key other than `x` cancels a pending delete — the two-step
	// confirm is there to catch accidents, not to force the user into
	// a modal dialog, so a natural next action (arrow key, typing,
	// whatever) should back out cleanly. The `x` branch itself
	// distinguishes arm-vs-commit.
	if k.String() != "x" {
		a.pendingDeleteSessionID = ""
	}
	// JJJ1: any key dismisses the splash and starts the connect flow.
	// Ctrl+C still quits.
	if a.stage == StageIntro {
		if k.String() == "ctrl+c" {
			return a, tea.Quit
		}
		a.stage = StageConnecting
		return a, connectCmd(a.c)
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
	// Modal layers take precedence: detail-view/rename/context-add/workspace-switcher/metrics/settings/help/palette → permission keys.
	if a.detailViewOpen {
		return a.handleDetailViewKey(k)
	}
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
	if a.doctorOpen {
		return a.handleDoctorKey(k)
	}
	if a.lmConfigOpen {
		return a.handleLMConfigKey(k)
	}
	if a.mcpInstallOpen {
		return a.handleMcpInstallKey(k)
	}
	if a.mcpRemoveOpen {
		return a.handleMcpRemoveKey(k)
	}
	if a.settingsOpen {
		return a.handleSettingsKey(k)
	}
	if a.quitConfirmOpen {
		return a.handleQuitConfirmKey(k)
	}
	if a.helpOpen {
		switch k.String() {
		case "?", "esc", "ctrl+c":
			a.helpOpen = false
			a.helpTab = 0
		case "left", "h":
			if a.helpTab > 0 {
				a.helpTab--
			}
		case "right", "l", "tab":
			if a.helpTab < helpTabCount-1 {
				a.helpTab++
			}
		}
		return a, nil
	}
	if a.composeOpen {
		return a.handleComposeKey(k)
	}
	if a.filePickerOpen {
		return a.handleFilePickerKey(k)
	}
	if a.catalogBrowserOpen {
		return a.handleCatalogBrowserKey(k)
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
		// ZZZZZZZZZ1: Ctrl+C now opens a confirmation overlay instead
		// of exiting immediately. User feedback: "ctrl+c should have
		// a confirmation window, close? yes no detach". Prevents
		// accidental quit mid-turn and surfaces the detach path
		// (previously buried under Ctrl+Z) as a first-class option.
		//
		// Second Ctrl+C while the confirm is already open accepts
		// the currently-highlighted option — preserves the old
		// "spam ctrl+c to quit" muscle memory.
		if a.quitConfirmOpen {
			return a.applyQuitConfirmSelection()
		}
		a.quitConfirmOpen = true
		a.quitConfirmSelected = 0 // default: close
		return a, nil
	case "?":
		// Only treat ? as help when focus is NOT on the input pane —
		// otherwise we steal '?' from anyone trying to type a question
		// mark. Sidebar/body navigation has no use for typed text.
		if a.focus != FocusInput {
			a.helpOpen = true
			return a, nil
		}
		// Fall through to focus dispatch so the textarea consumes it.
	case "tab":
		a.focus = (a.focus + 1) % 3
		a.maybeInitBodyCursor()
		return a, nil
	case "shift+tab":
		a.focus = (a.focus + 2) % 3
		a.maybeInitBodyCursor()
		return a, nil
	case "ctrl+x":
		if sid := a.currentSessionID(); sid != "" {
			return a, cancelCmd(a.c, sid)
		}
		return a, nil
	case "ctrl+n":
		// New session in current workspace, or against a backend
		// that doesn't model workspaces (CLIO advertises
		// capabilities.workspaces=false). The server defaults
		// missing workspace_id to its own ws_default — passing
		// "" is honest about not having one.
		return a, createSessionCmd(a.c, a.wsID)
	case "ctrl+r":
		// Manual reconnect / refresh.
		return a, connectCmd(a.c)
	case "ctrl+e":
		// Z1: when the body cursor is set and the selected message
		// has a bulky tool_result or text part, expand THAT one.
		// Otherwise fall back to the "latest bulky" heuristic (L3).
		a.openDetailForSelection()
		return a, nil
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
		// Open Settings. Seed themeSel to the currently-active theme
		// so the Theme tab doesn't "reset" to dark on every open.
		a.settingsOpen = true
		a.settings = &settingsState{}
		if themeName(a.Theme) == "light" {
			a.settings.themeSel = 1
		}
		return a, loadSettingsCmd(a.c)
	case "ctrl+t":
		// Open Metrics modal.
		a.metricsOpen = true
		a.metrics = &metricsState{loading: true}
		return a, loadMetricsCmd(a.c)
	case "ctrl+alt+t", "alt+ctrl+t":
		// Q2: cycle to the next theme without opening Settings.
		// Kitty-protocol-only binding — non-Kitty users get the
		// /theme-next slash command as a fallback.
		return a, a.cycleThemeCmd(+1)
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

			// L5: catalog-style commands open a dedicated read-only
			// list modal instead of firing RunCommand. /mcp /tools
			// /skills each route here; everything else keeps the
			// old behaviour.
			if kind, ok := catalogCommandForID(cmd.ID); ok {
				return a, a.openCatalogBrowser(kind)
			}
			// /agents reuses Settings > Agent tab — the richer picker
			// there already shows descriptions + mode + selection.
			if cmd.ID == "/agent" || cmd.ID == "/agents" {
				a.settingsOpen = true
				a.settings = &settingsState{tab: 1}
				return a, loadSettingsCmd(a.c)
			}

			// /theme-next and /theme-prev cycle the palette without
			// opening Settings. Universal alternative to
			// Ctrl+Alt+T which requires the Kitty keyboard protocol.
			if cmd.ID == "/theme-next" {
				return a, a.cycleThemeCmd(+1)
			}
			if cmd.ID == "/theme-prev" {
				return a, a.cycleThemeCmd(-1)
			}

			// /metrics opens the metrics modal inline — same modal
			// Ctrl+T surfaces. Nice for users who live in the palette
			// and don't remember the keybinding.
			if cmd.ID == "/metrics" {
				a.metricsOpen = true
				a.metrics = &metricsState{loading: true}
				return a, loadMetricsCmd(a.c)
			}

			// CLIO-BBBBBBBBBB4 (v0.2 §3.4): /doctor opens the backend
			// health modal — integrations array + overall_status so
			// the user can see at a glance which subsystems are
			// ready/degraded/unavailable. Gated on
			// capabilities.integration_health; unsupported backends
			// get a transient "doctor view unsupported by this
			// backend" hint.
			if cmd.ID == "/doctor" {
				if !a.caps.Capabilities.IntegrationHealth {
					a.transientHint = "doctor view unsupported by this backend (v0.1)"
					return a, scheduleHintExpire(a.transientHint)
				}
				a.doctorOpen = true
				a.doctor = &doctorState{loading: true}
				return a, doctorFetchCmd(a.c)
			}

			// /theme-export writes the currently-active palette to
			// ~/.config/gact/theme.json so users who like a built-in
			// + a couple of tweaks have a starting point to edit. No
			// backend round-trip; pure local file write.
			if cmd.ID == "/theme-export" {
				path, pathErr := CustomThemeDefaultPath()
				if pathErr != nil {
					a.transientHint = "theme export: " + pathErr.Error()
					return a, scheduleHintExpire(a.transientHint)
				}
				if err := SaveCustomTheme(a.Theme, path); err != nil {
					a.transientHint = "theme export failed: " + err.Error()
				} else {
					a.transientHint = "exported " + ThemeModeName(ThemeModeFor(a.Theme)) + " → " + path
				}
				return a, scheduleHintExpire(a.transientHint)
			}

			// /theme opens Settings on the Theme tab with the current
			// palette pre-selected so ↓↑ immediately previews live.
			if cmd.ID == "/theme" || cmd.ID == "/themes" {
				a.settingsOpen = true
				cur := ThemeModeFor(a.Theme)
				sel := 0
				for i, m := range AllThemeModes {
					if m == cur {
						sel = i
						break
					}
				}
				a.settings = &settingsState{tab: 2, themeSel: sel}
				return a, nil
			}

			// /scenarios jumps to the Scenarios help tab. Saves the
			// user from pressing ? then → five times to get the
			// trigger keyword cheat sheet — especially useful mid-
			// conversation after the empty-state crib disappears.
			if cmd.ID == "/scenarios" {
				a.helpOpen = true
				a.helpTab = helpTabIndex("Scenarios")
				return a, nil
			}

			// /new creates a new session inline so users don't have
			// to remember Ctrl+N or tab into the sidebar.
			if cmd.ID == "/new" {
				return a, createSessionCmd(a.c, a.wsID)
			}

			// /duplicate clones the current session's title + model
			// + agent but starts with zero messages. "Same kind of
			// work, fresh context" — common enough that users were
			// reaching for Ctrl+N then manually re-applying settings
			// every time.
			if cmd.ID == "/duplicate" && a.selected >= 0 && a.selected < len(a.sessions) {
				src := a.sessions[a.selected]
				return a, duplicateSessionCmd(a.c, a.wsID, src)
			}

			// /sessions focuses the sidebar and pre-arms the K11
			// title filter so the user can immediately type to
			// narrow the session list. Cheaper than a second
			// dedicated modal and reuses the filter code path the
			// sidebar already exercises on `/`.
			if cmd.ID == "/sessions" {
				a.focus = FocusSidebar
				a.sessionFilterActive = true
				a.filterSnapshot = a.sessionFilter
				return a, nil
			}

			// /rename opens the K2 rename editor on the current
			// session. Equivalent to sidebar `e` but reachable from
			// anywhere.
			if cmd.ID == "/rename" {
				if a.selected >= 0 && a.selected < len(a.sessions) {
					a.renameOpen = true
					a.renameDraft = a.sessions[a.selected].Title
				}
				return a, nil
			}

			// Optimistic local UI updates for commands with instant
			// visible effect. The backend still processes the command
			// (SSE events keep us honest), but the UI shouldn't appear
			// frozen between "Enter" and the SSE round-trip.
			var extraCmds []tea.Cmd
			sid := a.currentSessionID()
			switch cmd.ID {
			case "/clear":
				// Two-step confirmation — /clear is destructive and
				// irreversible (backend wipes messages). First
				// invocation arms a pending state + a toast; second
				// within the dwell window actually wipes. Anything
				// else cancels.
				if a.pendingClearSessionID != sid {
					a.pendingClearSessionID = sid
					a.transientHint = "press /clear again to confirm wipe"
					extraCmds = append(extraCmds, scheduleHintExpire(a.transientHint))
					return a, tea.Batch(extraCmds...)
				}
				a.pendingClearSessionID = ""
				n := len(a.messages)
				a.messages = nil
				a.scrollOffset = 0
				a.stickyToBottom = true
				if n > 0 {
					a.transientHint = fmt.Sprintf("cleared %d messages", n)
				} else {
					a.transientHint = "session already empty"
				}
				extraCmds = append(extraCmds, scheduleHintExpire(a.transientHint))
			case "/cancel":
				a.transientHint = "cancelling run…"
				extraCmds = append(extraCmds, scheduleHintExpire(a.transientHint))
			case "/copy":
				toast := a.copyLastAssistantReplyToClipboard()
				a.transientHint = toast
				extraCmds = append(extraCmds, scheduleHintExpire(toast))
				return a, tea.Batch(extraCmds...)
			case "/diff":
				toast := a.openWorkspaceDiff()
				a.transientHint = toast
				extraCmds = append(extraCmds, scheduleHintExpire(toast))
				return a, tea.Batch(extraCmds...)
			case "/compact":
				if sid == "" {
					a.transientHint = "no active session to compact"
				} else {
					a.transientHint = "compact requested — backend support is provisional"
					extraCmds = append(extraCmds, requestCompactCmd(a.c, sid))
				}
				extraCmds = append(extraCmds, scheduleHintExpire(a.transientHint))
				return a, tea.Batch(extraCmds...)
			case "/mcp-install":
				a.openMcpInstallModal()
				return a, tea.Batch(extraCmds...)
			case "/mcp-remove":
				extraCmds = append(extraCmds, a.openMcpRemoveModal())
				return a, tea.Batch(extraCmds...)
			}
			// Any non-/clear action cancels a pending clear — same
			// anti-accident pattern as K5's armed delete.
			if cmd.ID != "/clear" {
				a.pendingClearSessionID = ""
			}
			// MMM8b: plugin commands exec a local binary instead of
			// hitting the backend's commands endpoint. They're tagged
			// with Source="plugin" by paletteMatches.
			if cmd.Source == "plugin" {
				if pc := a.findPluginCommand(cmd.ID); pc != nil {
					a.transientHint = "running plugin: " + cmd.ID + "…"
					extraCmds = append(extraCmds, runPluginCmd(*pc, sid, a.BackendURL))
					return a, tea.Batch(extraCmds...)
				}
			}
			extraCmds = append(extraCmds, runCommandCmd(a.c, sid, cmd.ID))
			return a, tea.Batch(extraCmds...)
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

// scrollToSelectedMessage shifts scrollOffset so the selected message
// sits inside the visible window. Uses the same bottom-anchored math
// jumpToMessage does.
//
// TTTTTTTTT1: the basic offset only pins the *message*, not the
// selected part within it. For long messages (multi-tool assistants
// with two bulky reads), walking the part cursor up with `k` can
// leave the ▸ marker scrolled above the viewport. The caller can
// detect that with `selectedPartEarlyInMessage` — for now this
// function keeps the pre-TTTTTTTTT1 message-anchoring behaviour and
// the visibility-of-part refinement is punted to a follow-up, since
// doing it right needs per-part row metadata from the renderer.
func (a *App) scrollToSelectedMessage() {
	if a.bodySelMsgIdx < 0 || a.bodySelMsgIdx >= len(a.messages) {
		return
	}
	a.scrollOffset = len(a.messages) - a.bodySelMsgIdx - 1
	a.stickyToBottom = a.scrollOffset == 0
	// VVVVVVVVV1: arm the post-render scroll adjustment so the View
	// path can nudge the viewport to keep the ▸ marker visible. The
	// base message-anchored offset is rough (measures in messages,
	// scrollClip wants lines); the per-part fine-tune reads the
	// rendered body and lines up the marker properly.
	a.pendingPartScroll = true
}

// maybeInitBodyCursor seeds the body message cursor when the user
// enters FocusBody for the first time. Previously the cursor stayed
// at -1 (invisible) until the user explicitly pressed n/N — the user
// reported "I have not seen this, nor can I see it now" because Tab
// alone gave no visual feedback. Default to the latest message so
// the marker is immediately visible AND so Ctrl+E expands the most
// recent bulky output by default (preserves the L3 behaviour).
// (FFFFF1) ZZZZZZZ1: skip past any absorbed tool messages so the
// cursor lands on a row the renderer actually paints — otherwise the
// highlight is invisible because the index targets a message that
// pairToolResults swallowed into its assistant parent.
func (a *App) maybeInitBodyCursor() {
	if a.focus != FocusBody {
		return
	}
	if a.bodySelMsgIdx >= 0 && a.bodySelMsgIdx < len(a.messages) {
		a.bodySelMsgIdx = a.snapToVisibleMsg(a.bodySelMsgIdx, -1)
		// TTTTTTTTT1: reseat the part cursor on the snapped msg. If the
		// old partIdx is still valid for the new msg, keep it; else
		// fall back to last-part so Ctrl+E targets the bulky block at
		// the bottom of the turn (matches pre-TTTTTTTTT1 default).
		addr := addressablePartsOf(a.messages[a.bodySelMsgIdx])
		if a.bodySelPartIdx < 0 || a.bodySelPartIdx >= len(addr) {
			a.bodySelPartIdx = len(addr) - 1
		}
		return
	}
	if len(a.messages) == 0 {
		return
	}
	a.bodySelMsgIdx = a.snapToVisibleMsg(len(a.messages)-1, -1)
	a.bodySelPartIdx = lastAddressablePartIdx(a.messages[a.bodySelMsgIdx])
	a.scrollToSelectedMessage()
}

// snapToVisibleMsg walks from idx in the given direction (+1 forward,
// -1 backward) until it finds a non-absorbed message, then returns
// that index. If none exists in that direction, falls back to the
// other direction. Returns idx itself if everything is absorbed
// (degenerate case — keeps the cursor stable).
func (a *App) snapToVisibleMsg(idx, dir int) int {
	if len(a.messages) == 0 {
		return -1
	}
	_, absorbed := pairToolResults(a.messages)
	if dir == 0 {
		dir = -1
	}
	i := idx
	for i >= 0 && i < len(a.messages) {
		if !absorbed[i] {
			return i
		}
		i += dir
	}
	// Fall back to scanning the other direction.
	i = idx
	dir = -dir
	for i >= 0 && i < len(a.messages) {
		if !absorbed[i] {
			return i
		}
		i += dir
	}
	return idx
}

// TTTTTTTTT1: addressablePartsOf returns the indexes (into m.Parts) of
// parts that count as navigable "logical blocks" for body-cursor
// stepping. Skipped:
//   - thinking parts (too minor, visually muted)
//   - empty text parts (they'd be zero-height blocks)
//   - tool_call parts whose matching tool_result will be inlined under
//     them — the PAIR is one block, so we address it via the tool_call
//     index and let findBulkyPartFor drill to the result
//
// When a message has no addressable parts (e.g. a tool message whose
// result was absorbed), returns an empty slice and the caller should
// skip past it.
func addressablePartsOf(m gact.Message) []int {
	out := make([]int, 0, len(m.Parts))
	for i, p := range m.Parts {
		switch p.Type {
		case gact.PartTypeThinking:
			continue
		case gact.PartTypeText:
			if strings.TrimSpace(p.Text) == "" {
				continue
			}
		}
		out = append(out, i)
	}
	return out
}

// TTTTTTTTT1: selectedPartID returns the gact.Part.ID of the block the
// body cursor currently points at, or "" when no part is selected
// (either the cursor is off, or the selected message has no
// addressable parts). Used by the renderer to draw the per-block
// marker and by Ctrl+E/Enter to route the detail view to the right
// part.
func (a *App) selectedPartID() string {
	if a.bodySelMsgIdx < 0 || a.bodySelMsgIdx >= len(a.messages) {
		return ""
	}
	if a.bodySelPartIdx < 0 {
		return ""
	}
	m := a.messages[a.bodySelMsgIdx]
	addr := addressablePartsOf(m)
	if len(addr) == 0 || a.bodySelPartIdx >= len(addr) {
		return ""
	}
	pi := addr[a.bodySelPartIdx]
	if pi < 0 || pi >= len(m.Parts) {
		return ""
	}
	return m.Parts[pi].ID
}

// TTTTTTTTT1: stepPartCursor walks the body cursor one addressable
// part forward (dir=+1) or backward (dir=-1), crossing message
// boundaries as needed. Called by j/k/↑/↓/n/N on FocusBody.
//
// Semantics:
//   - If the cursor is off (msg < 0), seed to the last message's last
//     part (dir=-1) or first message's first part (dir=+1).
//   - If stepping past the current message's part range, jump to the
//     next visible (non-absorbed) message and land on its boundary
//     part (first when moving forward, last when moving backward).
//   - Absorbed tool messages are skipped silently.
//   - At the conversation ends, stay on the current part (no wrap).
func (a *App) stepPartCursor(dir int) {
	if len(a.messages) == 0 {
		return
	}
	if dir == 0 {
		dir = 1
	}
	// Seed case: cursor is off — park on the natural end and return
	// without further motion, matching the pre-TTTTTTTTT1 behaviour
	// where the first keypress revealed the marker.
	if a.bodySelMsgIdx < 0 {
		if dir < 0 {
			a.bodySelMsgIdx = a.snapToVisibleMsg(len(a.messages)-1, -1)
			a.bodySelPartIdx = lastAddressablePartIdx(a.messages[a.bodySelMsgIdx])
		} else {
			a.bodySelMsgIdx = a.snapToVisibleMsg(0, 1)
			a.bodySelPartIdx = firstAddressablePartIdx(a.messages[a.bodySelMsgIdx])
		}
		a.scrollToSelectedMessage()
		return
	}

	_, absorbed := pairToolResults(a.messages)
	msgIdx := a.bodySelMsgIdx
	partIdx := a.bodySelPartIdx
	addr := addressablePartsOf(a.messages[msgIdx])

	if partIdx < 0 {
		// Unset partIdx — treat the cursor as sitting on the exit
		// boundary for this direction, so the step immediately
		// advances (matching the pre-TTTTTTTTT1 message-walk feel
		// where the first keypress moved the cursor). dir<0 → pretend
		// we were at partIdx=0, so step goes to -1 and crosses back.
		// dir>0 → pretend we were at partIdx=last, so step crosses
		// forward. For empty messages, fall through to cross-message.
		if len(addr) > 0 {
			if dir < 0 {
				partIdx = 0
			} else {
				partIdx = len(addr) - 1
			}
		}
	}

	// Try moving within the current message first.
	next := partIdx + dir
	if next >= 0 && next < len(addr) {
		a.bodySelPartIdx = next
		a.scrollToSelectedMessage()
		return
	}

	// Need to cross to the next/previous non-absorbed message.
	ni := msgIdx + dir
	for ni >= 0 && ni < len(a.messages) {
		if absorbed[ni] {
			ni += dir
			continue
		}
		newAddr := addressablePartsOf(a.messages[ni])
		if len(newAddr) == 0 {
			ni += dir
			continue
		}
		a.bodySelMsgIdx = ni
		if dir > 0 {
			a.bodySelPartIdx = 0
		} else {
			a.bodySelPartIdx = len(newAddr) - 1
		}
		a.scrollToSelectedMessage()
		return
	}
	// At the conversation end — stay put.
}

// firstAddressablePartIdx returns the index into m's addressable parts
// of the first one. -1 when none exist (caller should skip this msg).
func firstAddressablePartIdx(m gact.Message) int {
	if len(addressablePartsOf(m)) == 0 {
		return -1
	}
	return 0
}

// lastAddressablePartIdx returns the index of the last addressable
// part. -1 when none exist.
func lastAddressablePartIdx(m gact.Message) int {
	addr := addressablePartsOf(m)
	if len(addr) == 0 {
		return -1
	}
	return len(addr) - 1
}

// jumpToMessage scrolls the conversation pane so the message with the
// given ID is visible. Implementation: find the index, set scrollOffset
// to (totalMessages - index - 1) so the renderer's bottom-anchored
// math leaves it on screen. Falls back to "stick to bottom" if the ID
// is no longer in the loaded slice (e.g. SSE replaced the list).
//
// V3: also sets searchHitMessageID so the render layer can mark the
// row visually. The marker clears on the next non-jump action via
// clearSearchHit — the row isn't a persistent selection, just a
// "here's what you were looking for" hint.
func (a *App) jumpToMessage(messageID string) {
	for i, m := range a.messages {
		if m.ID == messageID {
			a.scrollOffset = len(a.messages) - i - 1
			a.stickyToBottom = a.scrollOffset == 0
			a.searchHitMessageID = messageID
			return
		}
	}
	a.scrollOffset = 0
	a.stickyToBottom = true
}

// cycleThemeCmd advances the active theme by `step` positions through
// AllThemeModes, wrapping at the ends. Preserves CollapseThreshold +
// cost thresholds across the swap, fires SaveConfig so the new theme
// sticks across restart, and returns a tea.Cmd that schedules a
// transient hint to auto-clear. Same plumbing Settings > Theme uses on
// Enter; the key difference is this path skips the modal.
func (a *App) cycleThemeCmd(step int) tea.Cmd {
	if len(AllThemeModes) == 0 {
		return nil
	}
	cur := ThemeModeFor(a.Theme)
	idx := 0
	for i, m := range AllThemeModes {
		if m == cur {
			idx = i
			break
		}
	}
	idx = (idx + step + len(AllThemeModes)) % len(AllThemeModes)
	next := AllThemeModes[idx]

	prevCT := a.Theme.CollapseThreshold
	prevW := a.Theme.CostWarnTokens
	prevD := a.Theme.CostDangerTokens
	a.Theme = ThemeForMode(next)
	a.Theme.CollapseThreshold = prevCT
	a.Theme.CostWarnTokens = prevW
	a.Theme.CostDangerTokens = prevD
	a.Theme.applyStyles()
	a.transientHint = "theme: " + ThemeModeName(next)
	a.persistPrefs()
	return scheduleHintExpire(a.transientHint)
}

// paletteCurrentValue returns a short summary of the current state
// for settings-style commands so the palette row can show it inline.
// Empty string = no state worth surfacing (the default for most
// commands). Keep these short — they're rendered in ~30 cells after
// the title.
func (a *App) paletteCurrentValue(id string) string {
	switch id {
	case "/theme", "/themes":
		return "current: " + ThemeModeName(ThemeModeFor(a.Theme))
	case "/clear":
		n := len(a.messages)
		if n == 0 {
			return "session empty"
		}
		return fmt.Sprintf("%d messages", n)
	case "/cancel":
		if a.currentStatus == gact.StatusRunning ||
			a.currentStatus == gact.StatusWaitingPermission {
			return "status: " + a.currentStatus
		}
		return "nothing running"
	case "/agent", "/agents":
		if a.selected >= 0 && a.selected < len(a.sessions) {
			if agent := a.sessions[a.selected].Agent.ID; agent != "" {
				return "current: " + agent
			}
		}
	case "/rename":
		if a.selected >= 0 && a.selected < len(a.sessions) {
			return "current: " + a.sessions[a.selected].Title
		}
	}
	return ""
}

func (a *App) paletteMatches() []gact.Command {
	// MMM8b: merge plugin commands in alongside the backend-provided
	// commands. Plugin commands get source="plugin" so the dispatch
	// branch can short-circuit before runCommandCmd.
	all := make([]gact.Command, 0, len(a.commands)+len(a.plugins)+8)
	all = append(all, a.commands...)
	for _, p := range a.plugins {
		all = append(all, gact.Command{
			ID:          p.ID,
			Title:       p.Title,
			Description: p.Description,
			Source:      "plugin",
		})
	}
	// Built-in local commands always show, independent of whether
	// the backend advertises /v1/commands. Skipped for commands the
	// current backend's capabilities don't support (/doctor for
	// backends that don't advertise integration_health, etc.) so
	// the user doesn't see greyed-out entries they can't actually
	// run. CLIO-BBBBBBBBBB17.
	seen := map[string]bool{}
	for _, c := range all {
		seen[c.ID] = true
	}
	localCmds := []gact.Command{
		{ID: "/metrics", Title: "Metrics", Description: "Backend latency/cost/token totals", Source: "builtin"},
		{ID: "/theme", Title: "Theme", Description: "Pick a colour palette (Ctrl+Alt+T cycles without modal)", Source: "builtin"},
		{ID: "/theme-export", Title: "Export theme", Description: "Write active palette to ~/.config/gact/theme.json", Source: "builtin"},
		{ID: "/mcp", Title: "MCP servers", Description: "List bundled + installed MCP servers and their tools", Source: "builtin"},
		{ID: "/mcp-install", Title: "Install MCP server", Description: "POST /v1/mcp/servers — opens a stdio/http install modal", Source: "builtin"},
		{ID: "/mcp-remove", Title: "Remove MCP server", Description: "DELETE /v1/mcp/servers/{id} — pick from installed list", Source: "builtin"},
		{ID: "/tools", Title: "Tools catalog", Description: "Unified catalog of every tool the agent can invoke", Source: "builtin"},
		{ID: "/catalog", Title: "Catalog", Description: "Alias for /tools — same unified view", Source: "builtin"},
		{ID: "/skills", Title: "Skills", Description: "List available skills (backend-dependent)", Source: "builtin"},
		{ID: "/agents-list", Title: "Agents catalog", Description: "Read-only browse of registered agents", Source: "builtin"},
		{ID: "/clear", Title: "Clear conversation", Description: "Wipe the on-screen conversation; session keeps its ID + settings", Source: "builtin"},
		{ID: "/copy", Title: "Copy last reply", Description: "Copy the most recent assistant message to clipboard (or /tmp if no DISPLAY)", Source: "builtin"},
		{ID: "/diff", Title: "Workspace diff", Description: "Show `git diff --stat` of the current working directory in a modal", Source: "builtin"},
		{ID: "/compact", Title: "Compact session", Description: "Ask the backend to summarise the conversation and reclaim context", Source: "builtin"},
	}
	if a.caps.Capabilities.IntegrationHealth {
		localCmds = append(localCmds, gact.Command{
			ID:          "/doctor",
			Title:       "Doctor",
			Description: "Backend health + per-subsystem status",
			Source:      "builtin",
		})
	}
	for _, c := range localCmds {
		if !seen[c.ID] {
			all = append(all, c)
			seen[c.ID] = true
		}
	}
	if a.paletteFilter == "" {
		return all
	}
	needle := strings.ToLower(a.paletteFilter)
	out := make([]gact.Command, 0, len(all))
	for _, c := range all {
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

// duplicateSessionCmd creates a new session carrying over the source
// session's title + model + agent but with zero messages. "Same kind
// of work, fresh context."
func duplicateSessionCmd(c *client.Client, wsID string, src gact.Session) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		title := src.Title
		if title == "" {
			title = "(untitled)"
		}
		title += " (copy)"
		req := client.CreateSessionRequest{
			WorkspaceID: wsID,
			Title:       title,
		}
		if src.Model.ModelID != "" {
			m := src.Model
			req.Model = &m
		}
		if src.Agent.ID != "" {
			ag := src.Agent
			req.Agent = &ag
		}
		s, err := c.CreateSession(ctx, req)
		if err != nil {
			return errMsg{err: err, stage: "duplicate-session"}
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

// deleteMessageCmd fires a background DELETE /v1/messages/{id}. The
// TUI already dropped the message locally so there's no message for
// us to emit on success; failures are silently swallowed because the
// user's next session switch or Ctrl+R will re-sync from the backend.
// If delete failures become a real problem, switch to an errMsg-
// returning command with a retry UX.
func deleteMessageCmd(c *client.Client, messageID string) tea.Cmd {
	return func() tea.Msg {
		if messageID == "" {
			return nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = c.DeleteMessage(ctx, messageID)
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
			// BBBBBBBB1: prune the registry + in-memory set so the
			// ↩ marker disappears immediately and `gact detached`
			// won't list a deleted session next time.
			delete(a.previouslyDetached, sid)
			if a.PruneDetachedRegistry != nil {
				a.PruneDetachedRegistry(sid)
			}
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
	case "d":
		// JJJJJJJJ1: toggle detached-only sidebar view — narrows the
		// list to sessions the user previously Ctrl+Z-walked-away
		// from (match against previouslyDetached). Local filter —
		// no backend refetch needed.
		a.showDetachedOnly = !a.showDetachedOnly
		if a.showDetachedOnly {
			if n := len(a.previouslyDetached); n > 0 {
				a.transientHint = fmt.Sprintf("showing %d detached session(s) (d to go back)", n)
			} else {
				a.transientHint = "no detached sessions on this backend (d to go back)"
			}
		} else {
			a.transientHint = "showing all sessions"
		}
		a.ensureSelectedVisible()
	case "y":
		// OOOOOOOO1: yank the selected session's sess_xxx id to
		// clipboard — useful for piping into `gact log <sid>`,
		// `gact attach <sid>`, etc. without re-typing a 32-char
		// hash. Body-focus `y` still copies message text; the two
		// behaviours split on focus.
		sid := a.currentSessionID()
		if sid == "" {
			a.transientHint = "no session selected to copy"
			return a, nil
		}
		if err := clipboardWrite(sid); err != nil {
			a.transientHint = "copy failed: " + err.Error()
			return a, nil
		}
		a.transientHint = "copied " + sid + " to clipboard"
	case "b":
		// XXXXXXXX1: toggle busy-only sidebar view — narrows the
		// list to sessions whose status is running or
		// waiting_permission. Parallels the JJJJJJJJ1 `d` toggle.
		a.showBusyOnly = !a.showBusyOnly
		if a.showBusyOnly {
			busyCount := 0
			for _, s := range a.sessions {
				if s.Status == gact.StatusRunning ||
					s.Status == gact.StatusWaitingPermission {
					busyCount++
				}
			}
			if busyCount > 0 {
				a.transientHint = fmt.Sprintf("showing %d busy session(s) (b to go back)", busyCount)
			} else {
				a.transientHint = "no busy sessions on this backend (b to go back)"
			}
		} else {
			a.transientHint = "showing all sessions"
		}
		a.ensureSelectedVisible()
	}
	return a, nil
}

// sidebarPageSize returns the number of session entries that fit in the
// visible sidebar pane — used by PgUp/PgDn so the jump matches what the
// user sees. RRRRRRRRR1: reuses the same budget math as renderSidebar
// so keyboard paging stays aligned with what's rendered (previously
// drifted by 1-2 rows depending on context-file count + R2 footer,
// causing PgDn to jump past the last visible session).
func (a *App) sidebarPageSize() int {
	const rowsPerSession = 3
	contextLines := 0
	if a.selected >= 0 {
		if n := len(a.contextFiles); n > 0 {
			contextLines = 2 + n
		} else {
			contextLines = 3
		}
	}
	footerLines := 0
	if len(a.sessions) > 0 {
		footerLines = 2
	}
	// a.height includes the header row (1) + footer hints row (1) +
	// optional hint banner row. The pane itself gets a.height-4 outer
	// rows (header + footer + 2 spacer rows per the layout math in
	// renderBody). Same inner-row budget as renderSidebar.
	inner := (a.height - 4) - 2
	avail := inner - contextLines - footerLines
	if contextLines > 0 {
		avail--
	}
	page := avail / rowsPerSession
	if page < 1 {
		page = 1
	}
	return page
}

func (a *App) handleBodyKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "enter":
		// ZZZZZZZZ1: Enter on body focus opens the floating detail
		// view for the selected message — same code path as Ctrl+E,
		// but mapped to the intuitive "Enter to open" convention
		// (matches file pickers, list navigation, etc.).
		a.openDetailForSelection()
		return a, nil
	case "up", "k":
		// TTTTTTTTT1: up/k walks the body cursor one addressable part
		// backward, crossing message boundaries. User feedback:
		// "selector goes conversation turn to conversation turn
		// instead of logical block to logical block". When an
		// assistant reads two files in one turn, each read_file +
		// matching tool_result is a distinct block; this lets the
		// user step through them individually. Message-jump shortcuts
		// (`[` / `]`) still exist for the coarse-grained case.
		if len(a.messages) == 0 {
			return a, nil
		}
		a.stepPartCursor(-1)
	case "down", "j":
		if len(a.messages) == 0 {
			return a, nil
		}
		a.stepPartCursor(+1)
	case "pgup", "ctrl+u":
		// Page-scroll for the within-message use case. Doesn't move
		// the cursor — when the user wants to read a long single
		// message, the cursor stays on it.
		a.scrollOffset += 10
		a.stickyToBottom = false
	case "pgdown", "ctrl+d":
		a.scrollOffset -= 10
		if a.scrollOffset <= 0 {
			a.scrollOffset = 0
			a.stickyToBottom = true
		}
	case "g":
		// g jumps the cursor to the first addressable block. TTTTTTTTT1:
		// also lands on the first part of that message so the per-block
		// marker is immediately meaningful.
		if len(a.messages) > 0 {
			a.bodySelMsgIdx = a.snapToVisibleMsg(0, 1)
			a.bodySelPartIdx = firstAddressablePartIdx(a.messages[a.bodySelMsgIdx])
			a.scrollToSelectedMessage()
		}
	case "G":
		if len(a.messages) > 0 {
			a.bodySelMsgIdx = a.snapToVisibleMsg(len(a.messages)-1, -1)
			a.bodySelPartIdx = lastAddressablePartIdx(a.messages[a.bodySelMsgIdx])
			a.scrollToSelectedMessage()
		}
	case "n":
		// Y1 + TTTTTTTTT1: n/N advance the part cursor the same way
		// j/k do. Kept as a second binding because the keyboard map
		// long-documented n/N as body-cursor nav.
		if len(a.messages) == 0 {
			return a, nil
		}
		a.stepPartCursor(+1)
	case "N":
		if len(a.messages) == 0 {
			return a, nil
		}
		a.stepPartCursor(-1)
		// XXXXXXXXX1: `[` / `]` removed — user feedback: "i also dont
		// see the value with the message selector and global turn
		// selector rather just have the message selector". The
		// part-by-part j/k is the single selector now; message-jump
		// was redundant with g/G + the per-part walk.
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
		// Yank: when the body cursor is set, copy THAT message's text;
		// otherwise fall back to "latest assistant". Feedback is a
		// transient toast because clipboard success is otherwise
		// invisible.
		var (
			text string
			ok   bool
		)
		if a.bodySelMsgIdx >= 0 && a.bodySelMsgIdx < len(a.messages) {
			text, ok = messageText(a.messages[a.bodySelMsgIdx])
		} else {
			text, ok = lastAssistantText(a.messages)
		}
		if !ok {
			a.transientHint = "nothing to copy — selected message has no text"
			return a, nil
		}
		if err := clipboardWrite(text); err != nil {
			a.transientHint = "copy failed: " + err.Error()
			return a, nil
		}
		a.transientHint = fmt.Sprintf("copied %d chars to clipboard", len(text))
	case "Y":
		// PPPPPPPP1: yank the FULL conversation as role-prefixed
		// markdown so the user can paste an entire turn into a bug
		// report, another LLM, or a teammate. Complements `y` which
		// takes a single message.
		text, ok := fullConversationText(a.messages)
		if !ok {
			a.transientHint = "nothing to copy — conversation has no text yet"
			return a, nil
		}
		if err := clipboardWrite(text); err != nil {
			a.transientHint = "copy failed: " + err.Error()
			return a, nil
		}
		a.transientHint = fmt.Sprintf("copied full conversation (%d chars) to clipboard", len(text))
	case "R":
		// Retry: when the body cursor is on a user message, resend
		// that one's text; otherwise fall back to "latest user".
		// Cursor-on-assistant is a no-op with an explanatory toast.
		sid := a.currentSessionID()
		if sid == "" {
			return a, nil
		}
		var (
			text string
			ok   bool
		)
		if a.bodySelMsgIdx >= 0 && a.bodySelMsgIdx < len(a.messages) {
			sel := a.messages[a.bodySelMsgIdx]
			if sel.Role != gact.RoleUser {
				a.transientHint = "retry: cursor is not on a user message"
				return a, scheduleHintExpire(a.transientHint)
			}
			text, ok = messageText(sel)
		} else {
			text, ok = lastUserText(a.messages)
		}
		if !ok {
			a.transientHint = "no user message to retry"
			return a, nil
		}
		a.transientHint = "retrying…"
		return a, postMessageCmd(a.c, sid, text)
	case "t":
		// S1: toggle per-message timestamps under the role headers.
		// Not persisted — this is a live-debugging aid, not a real
		// preference. Flipping it re-renders the conversation so the
		// change is visible immediately.
		a.Theme.ShowTimestamps = !a.Theme.ShowTimestamps
		state := "off"
		if a.Theme.ShowTimestamps {
			state = "on"
		}
		a.transientHint = "timestamps: " + state
		return a, scheduleHintExpire(a.transientHint)
	case "d":
		// Delete: when the body cursor is set, drop THAT message;
		// otherwise fall back to "latest". Optimistic local removal;
		// background DELETE via deleteMessageCmd. No two-step
		// confirmation — reload re-fetches on failure.
		if len(a.messages) == 0 {
			a.transientHint = "no messages to delete"
			return a, nil
		}
		idx := len(a.messages) - 1
		if a.bodySelMsgIdx >= 0 && a.bodySelMsgIdx < len(a.messages) {
			idx = a.bodySelMsgIdx
		}
		target := a.messages[idx]
		a.messages = append(a.messages[:idx], a.messages[idx+1:]...)
		// Cursor shifts back to previous message (clamped) so the
		// selection stays on-screen after a delete.
		if a.bodySelMsgIdx >= 0 {
			if a.bodySelMsgIdx >= len(a.messages) {
				a.bodySelMsgIdx = len(a.messages) - 1
			}
			// TTTTTTTTT1: re-clamp the part index against the new
			// selected message's addressable-parts list.
			if a.bodySelMsgIdx >= 0 {
				addr := addressablePartsOf(a.messages[a.bodySelMsgIdx])
				if a.bodySelPartIdx >= len(addr) {
					a.bodySelPartIdx = len(addr) - 1
				}
			} else {
				a.bodySelPartIdx = -1
			}
		}
		a.transientHint = "deleted message"
		return a, tea.Batch(
			deleteMessageCmd(a.c, target.ID),
			scheduleHintExpire(a.transientHint),
		)
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

	// `@` at the start of input or after whitespace opens the M6 fuzzy
	// file picker. Passing through @ mid-word (e.g. in an email) is
	// preserved so we don't surprise users who are genuinely typing an
	// @-character. k.Text check guards against synthetic KeyPressMsg
	// without a Text payload (e.g. ctrl-modified).
	if k.Text == "@" {
		cur := a.input.Value()
		if cur == "" || strings.HasSuffix(cur, " ") || strings.HasSuffix(cur, "\n") {
			return a, a.openFilePicker()
		}
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

	// Plain Enter sends; Shift+Enter / Alt+Enter / Ctrl+J insert a
	// newline (the textarea's rebinding picks those up in the Update
	// branch below). We also honour Claude-Code muscle memory: a
	// literal `\` at the end of the buffer + Enter inserts a newline
	// instead of sending — the trailing backslash is dropped and a
	// newline takes its place.
	//
	// If we're in the middle of a paste (PasteStart fired but no
	// PasteEnd yet), DO NOT intercept — route the key to the textarea
	// so embedded newlines become literal newlines instead of
	// triggering multiple "send" actions.
	if key == "enter" && a.inPaste {
		var cmd tea.Cmd
		a.input, cmd = a.input.Update(k)
		return a, cmd
	}
	if key == "enter" {
		raw := a.input.Value()
		if strings.HasSuffix(raw, "\\") {
			// Backslash-escape → newline. Strip the trailing "\" and
			// append "\n". We do this by round-tripping through
			// SetValue because the textarea API doesn't expose a
			// mutation primitive.
			a.input.SetValue(strings.TrimSuffix(raw, "\\") + "\n")
			return a, nil
		}
		// Expand any `[pasted content: N lines]` placeholders in the
		// buffer so the backend sees the real body, not the compressed
		// sigil. Send-time expansion keeps the input readable right up
		// until the moment the message is dispatched.
		text := strings.TrimSpace(a.expandPasteText(raw))
		a.input.Reset()
		a.pastes = nil
		a.exitHistory()
		// N1: successful dispatch invalidates any saved draft for
		// this session. Drop it now so that coming back later sees
		// a clean slate rather than the already-sent text resurfacing.
		if sid := a.currentSessionID(); sid != "" {
			delete(a.inputDraftBySession, sid)
		}
		if text == "" || a.currentSessionID() == "" {
			return a, nil
		}
		a.pushInputHistory(text)
		return a, postMessageCmd(a.c, a.currentSessionID(), text)
	}
	if key == "ctrl+p" {
		// Expand the most recent compressed paste in-place so the user
		// can inspect what's actually queued to send.
		a.expandMostRecentPaste()
		return a, nil
	}
	if key == "ctrl+g" || key == "ctrl+shift+p" {
		// Open the M5 compose modal for long-form editing. Both bindings
		// are accepted — ctrl+shift+p only works on terminals that
		// negotiate the Kitty keyboard protocol, ctrl+g works universally.
		a.openCompose()
		return a, nil
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
// pickAttachIndex chooses the initial sidebar selection given the
// session list and (optional) AttachSessionID. Returns the chosen
// index plus a missing flag set when an explicit AttachSessionID
// didn't match any session — caller surfaces a transient hint.
// (OOO1; pulled out of connectedMsg so tests can target the
// decision logic without firing the network-bound selectSession Cmd.)
//
// RRRRRRRR1: matching strategy is precedence-ordered:
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
func (a *App) pickAttachIndex() (idx int, missing bool) {
	if a.AttachSessionID == "" {
		return 0, false
	}
	target := a.AttachSessionID
	targetLower := strings.ToLower(target)
	// 1. exact id.
	for i, s := range a.sessions {
		if s.ID == target {
			return i, false
		}
	}
	// 2. exact title (case-sensitive — explicit > heuristic).
	for i, s := range a.sessions {
		if s.Title == target {
			return i, false
		}
	}
	// 3. id prefix.
	for i, s := range a.sessions {
		if strings.HasPrefix(s.ID, target) {
			return i, false
		}
	}
	// 4. title substring (case-insensitive).
	for i, s := range a.sessions {
		if strings.Contains(strings.ToLower(s.Title), targetLower) {
			return i, false
		}
	}
	return 0, true
}

func (a *App) selectSession(idx int) tea.Cmd {
	if idx < 0 || idx >= len(a.sessions) {
		return nil
	}
	sid := a.sessions[idx].ID
	a.swapInputDraftFor(sid)

	a.messages = nil
	a.contextFiles = nil
	a.scrollOffset = 0
	a.stickyToBottom = true
	a.currentStatus = a.sessions[idx].Status
	a.pendingPermissions = nil
	a.pendingDeleteSessionID = "" // armed delete is per-session; clear on switch
	a.pendingClearSessionID = ""  // same for /clear confirmation
	a.searchHitMessageID = ""     // V3 marker doesn't travel across sessions
	a.bodySelMsgIdx = -1          // Y1 cursor resets to off on session switch
	a.bodySelPartIdx = -1         // TTTTTTTTT1: part cursor resets too
	// New session ⇒ new event stream, no replay. Starting at 0 makes
	// the adapter/emulator send the full current event history from
	// the ring buffer (per SPEC §7.3 replay semantics).
	a.lastSeenSeqID = 0
	return tea.Batch(
		loadMessagesCmd(a.c, sid),
		loadContextFilesCmd(a.c, sid),
		loadSessionTasksCmd(a.c, sid), // UUU1: refresh task badge
		a.startSSECmd(sid),
	)
}

// swapInputDraftFor is the draft-swap half of a session switch. It
// stashes whatever the input currently holds under the OUTGOING
// session's ID (read from lastLoadedSessionID, not currentSessionID
// which has already flipped to the incoming idx by the time callers
// reach here) and loads whatever draft was saved for `newSID`.
// Exported as its own method so tests can exercise it without
// triggering the SSE startup path selectSession also does.
func (a *App) swapInputDraftFor(newSID string) {
	if a.lastLoadedSessionID != "" && a.lastLoadedSessionID != newSID {
		a.stashDraft(a.lastLoadedSessionID, a.input.Value())
	}
	a.input.Reset()
	a.pastes = nil
	if saved, ok := a.inputDraftBySession[newSID]; ok {
		a.input.SetValue(saved)
	}
	a.lastLoadedSessionID = newSID
}

// stashDraft saves `val` as the draft for `sid`. Empty drafts clear
// any prior entry so leftover state doesn't resurface. Map is lazily
// allocated to avoid burning memory for sessions that never get a
// draft.
func (a *App) stashDraft(sid, val string) {
	if sid == "" {
		return
	}
	if val == "" {
		delete(a.inputDraftBySession, sid)
		return
	}
	if a.inputDraftBySession == nil {
		a.inputDraftBySession = map[string]string{}
	}
	a.inputDraftBySession[sid] = val
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
		// CLIO embeds tokens + cost_usd in the completed payload, but
		// doesn't emit a dedicated cost.updated event — promote those
		// fields into the cost-updated path so the footer's $ meter
		// catches up live without waiting for a session reload.
		a.applyCostUpdated(e)
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
	case "notification":
		// MMM1: backend-pushed banner-worthy message. Surface as a
		// transient hint with the level prefixed, so the user sees
		// "info: MCP server reconnected" / "warning: ..." in the
		// reserved hint row above the input. Best-effort — payload
		// is structured but optional fields can be missing.
		if pl != nil {
			level, _ := pl["level"].(string)
			title, _ := pl["title"].(string)
			body, _ := pl["body"].(string)
			if level == "" {
				level = "info"
			}
			text := level + ": " + title
			if body != "" {
				text += " — " + body
			}
			a.transientHint = text
		}
	case "session.cleared":
		// /clear wiped the backend's messages for this session — drop
		// the local cache so the conversation pane matches. The event
		// carries session_id so we can ignore hits for other sessions.
		if pl != nil {
			sid, _ := pl["session_id"].(string)
			if sid != "" && sid == a.currentSessionID() {
				a.messages = nil
				a.scrollOffset = 0
				a.stickyToBottom = true
				// Reload to be safe — the SSE ring may have stale
				// replay events the emulator hasn't pruned, and a
				// fresh ListMessages is the source of truth.
				a.pendingReload = true
			}
		}
	}
}

// applyCostUpdated rolls the latest cost/tokens into the local sessions
// slice so the footer's meter and the sidebar status both stay live.
//
// Accepts either a dedicated cost.updated event (session_id inside
// the inner payload) OR a message.completed event (session_id at the
// outer envelope level — payload only carries cost_usd + tokens).
// Falls back to the outer envelope's session_id when the inner one
// is absent so both shapes flow through the same accumulator.
func (a *App) applyCostUpdated(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	sid, _ := pl["session_id"].(string)
	if sid == "" {
		// message.completed shape: session_id sits one level up.
		sid, _ = e.Payload["session_id"].(string)
	}
	if sid == "" {
		return
	}
	for i := range a.sessions {
		if a.sessions[i].ID != sid {
			continue
		}
		if c, ok := pl["cost_usd"].(float64); ok {
			// Cumulative meter: add the per-message increment to the
			// session's running total. cost.updated events already
			// carry running totals (treat as set); message.completed
			// carries per-turn delta (treat as add). We can tell
			// them apart by whether ``tokens`` looks like a delta
			// (small) vs total (large) — easier heuristic: if the
			// session already had a non-zero CostUSD and the inner
			// payload omits session_id, it's a delta.
			_, hasInnerSID := pl["session_id"].(string)
			if hasInnerSID {
				a.sessions[i].CostUSD = c
			} else {
				a.sessions[i].CostUSD += c
			}
		}
		if tokens, ok := pl["tokens"].(map[string]any); ok {
			_, hasInnerSID := pl["session_id"].(string)
			if v, ok := tokens["input"].(float64); ok {
				if hasInnerSID {
					a.sessions[i].Tokens.Input = int(v)
				} else {
					a.sessions[i].Tokens.Input += int(v)
				}
			}
			if v, ok := tokens["output"].(float64); ok {
				if hasInnerSID {
					a.sessions[i].Tokens.Output = int(v)
				} else {
					a.sessions[i].Tokens.Output += int(v)
				}
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
			// CLIO ships ``final_text`` on streamed text parts so we
			// can replace the raw streamed buffer (which carries
			// adapter format markers like ``[[ ## answer ## ]]``)
			// with the parsed clean answer once the LM finishes.
			if p.Type == gact.PartTypeText {
				if final, ok := pl["final_text"].(string); ok && final != "" {
					p.Text = final
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
	case StageIntro:
		content = a.viewIntro()
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
	// T1: reflect the active session's title in the terminal window
	// title so tmux / alacritty / kitty / iterm tabs show what the
	// user is looking at. Fallback is the bare "GACT" brand when no
	// session is selected.
	v.WindowTitle = a.windowTitle()
	return v
}

// sseHealthDot renders a single-glyph indicator summarising the
// event-stream state. Green = live, amber = reconnecting (backoff
// in progress), red = still in the connect stage. Used in the
// header so users can glance-verify the stream without scanning
// for the backoff hint in the footer.
func (a *App) sseHealthDot() string {
	t := a.Theme
	switch {
	case a.stage == StageConnecting:
		return lipgloss.NewStyle().Foreground(t.Danger).Render("●")
	case a.sseBackoffAttempts > 0:
		return lipgloss.NewStyle().Foreground(t.Warning).Render("●")
	default:
		return lipgloss.NewStyle().Foreground(t.Success).Render("●")
	}
}

// windowTitle builds the OSC-2 string set on every frame. Intentionally
// cheap — the bubbletea renderer diffs against the previous view and
// only emits the escape sequence when the string actually changes.
// U2: appends a status suffix for running / waiting_permission so
// tab-switchers can tell at a glance which pane needs attention.
// MMMMMMMM1: appends `[↩N]` when the user has detached sessions on
// this backend so an unfocused terminal tab still reminds them
// resumable work exists.
func (a *App) windowTitle() string {
	var title string
	if a.selected < 0 || a.selected >= len(a.sessions) {
		title = "GACT"
	} else {
		s := a.sessions[a.selected]
		if s.Title == "" {
			title = "GACT"
		} else {
			title = "GACT — " + s.Title
		}
		switch s.Status {
		case gact.StatusRunning:
			title += " (running)"
		case gact.StatusWaitingPermission:
			title += " (waiting)"
		}
	}
	if n := len(a.previouslyDetached); n > 0 {
		title += fmt.Sprintf(" [↩%d]", n)
	}
	return title
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

// IntroLogo / IntroName are the ASCII art shown in StageIntro
// (JJJ1). Either can be overridden by loading a file via
// SetIntroFromFile; absent both, the baked-in defaults render.
//
// EEEEE1: defaultIntroName is generated at init() from go-figure
// using the "slant" font instead of being hand-rolled. The
// previous hand art looked off-balance and the user explicitly
// asked for "a ready solution" rather than bespoke ASCII. Logo
// (the small mountain glyph above the name) is now empty by
// default — keep the splash uncluttered; users who want a
// glyph can supply one via intro_file.
var defaultIntroLogo = []string{}

var defaultIntroName = func() []string {
	out := figure.NewFigure("CLIO", "slant", true).String()
	lines := strings.Split(strings.TrimRight(out, "\n"), "\n")
	return lines
}()

// SetIntroFromFile loads a custom splash from disk. Format is two
// blocks separated by a blank line: logo block, then name block.
// Best-effort — bad files are ignored and the baked-in defaults
// remain. Returns the error for callers that want to surface it.
func (a *App) SetIntroFromFile(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	lines := strings.Split(strings.TrimRight(string(b), "\n"), "\n")
	logo := []string{}
	name := []string{}
	hitBlank := false
	for _, l := range lines {
		if !hitBlank {
			if strings.TrimSpace(l) == "" {
				hitBlank = true
				continue
			}
			logo = append(logo, l)
		} else {
			name = append(name, l)
		}
	}
	if len(logo) > 0 {
		a.IntroLogo = logo
	}
	if len(name) > 0 {
		a.IntroName = name
	}
	return nil
}

func (a *App) viewIntro() string {
	t := a.Theme
	// LLLLLLLLL1 + MMMMMMMMM1: when IntroLogo is empty and the
	// terminal has room, render the embedded grc.iit.edu logo. If
	// the animation-frames embed is populated, cycle through the
	// 36-frame truecolor rotation on the introFrameIdx tick; else
	// fall back to the static halfblock render. Closes the splash
	// dep on runtime chafa — frames are chafa-baked once.
	var logoStr string
	if len(a.IntroLogo) > 0 {
		logoStr = strings.Join(a.IntroLogo, "\n")
	} else {
		w := 28
		if a.width > 0 && a.width < 40 {
			w = a.width - 4
			if w < 8 {
				w = 0
			}
		}
		if w > 0 {
			if frames := intro.GRCLogoFrames(); len(frames) > 0 {
				logoStr = frames[a.introFrameIdx%len(frames)]
			} else {
				logoStr = intro.GRCLogo(w)
			}
		}
		if logoStr == "" {
			logoStr = strings.Join(defaultIntroLogo, "\n")
		}
	}
	name := a.IntroName
	if len(name) == 0 {
		name = defaultIntroName
	}
	// GRC logo carries its own ANSI colours — don't re-wrap it in the
	// Primary-bold style that was meant for hand-rolled ASCII art.
	logoBlock := logoStr
	if len(a.IntroLogo) > 0 {
		logoBlock = lipgloss.NewStyle().Foreground(t.Primary).Bold(true).Render(logoStr)
	}
	nameStyle := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	box := lipgloss.NewStyle().
		Width(a.width).Height(a.height).
		Align(lipgloss.Center, lipgloss.Center).
		Foreground(t.Fg).Background(t.Bg)
	body := lipgloss.JoinVertical(lipgloss.Center,
		logoBlock,
		"",
		nameStyle.Render(strings.Join(name, "\n")),
		"",
		t.HintLabel.Italic(true).Render("press any key to continue"),
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
	if a.doctorOpen {
		base = overlay(base, a.viewDoctor(), a.width, a.height)
	}
	if a.lmConfigOpen {
		base = overlay(base, a.viewLMConfig(), a.width, a.height)
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
	if a.detailViewOpen {
		base = overlay(base, a.viewDetailView(), a.width, a.height)
	}
	if a.composeOpen {
		base = overlay(base, a.viewCompose(), a.width, a.height)
	}
	if a.filePickerOpen {
		base = overlay(base, a.viewFilePicker(), a.width, a.height)
	}
	if a.catalogBrowserOpen {
		base = overlay(base, a.viewCatalogBrowser(), a.width, a.height)
	}
	if a.mcpInstallOpen {
		base = overlay(base, a.viewMcpInstall(), a.width, a.height)
	}
	if a.mcpRemoveOpen {
		base = overlay(base, a.viewMcpRemove(), a.width, a.height)
	}
	// ZZZZZZZZZ1: quit-confirm sits on top of every other overlay so
	// Ctrl+C inside (say) the palette always surfaces the "are you
	// sure" prompt, not an ambiguous "quit this modal or the TUI"
	// decision.
	if a.quitConfirmOpen {
		base = overlay(base, a.viewQuitConfirm(), a.width, a.height)
	}
	return base
}

// conversationPaneHeight mirrors the input/hint math inside renderBody
// so other layout code (e.g. sidebar sizing for LLL5) can pick the
// same convH renderBody uses internally. Always returns ≥1.
func (a *App) conversationPaneHeight(bodyH int) int {
	lineCount := strings.Count(a.input.Value(), "\n") + 1
	inputH := 3
	if lineCount > 1 {
		inputH = lineCount + 2
		maxInputH := bodyH / 3
		if maxInputH < 3 {
			maxInputH = 3
		}
		if inputH > maxInputH {
			inputH = maxInputH
		}
	}
	hintH := 0
	if a.transientHint != "" {
		hintH = 1
	}
	convH := bodyH - inputH - hintH
	if convH < 1 {
		convH = 1
	}
	return convH
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

	// LLL5: align the sidebar's bottom border with the conversation
	// pane's bottom border. Previously the sidebar took the full bodyH
	// (which includes the input box + transient hint row), so its
	// bottom corner sat 3+ rows below the conversation pane's corner —
	// the seam between sidebar `╯` and input `╭` looked broken.
	// Compute the same convH that renderBody uses, give the sidebar
	// exactly that, and let JoinHorizontal pad blank rows below it.
	convH := a.conversationPaneHeight(bodyH)

	sidebar := a.renderSidebar(sidebarW, convH)
	body := a.renderBody(bodyW, bodyH)

	// CCCCC1: force exact row counts on both stacks. lipgloss's
	// .Height(N) only sets a *minimum* outer height; if the inner
	// content is shorter the pane stays short and the border `╰╯`
	// floats up. fitLines guarantees both stacks span the rows the
	// horizontal layout expects.
	sidebar = fitLines(sidebar, convH)
	body = fitLines(body, bodyH)

	row := lipgloss.JoinHorizontal(lipgloss.Top, sidebar, body)
	full := lipgloss.JoinVertical(lipgloss.Left, header, row, footer)
	// Final belt-and-braces clip — if any subpane still overflows
	// (e.g. a stray soft-wrap from an ultra-wide paste) we'd rather
	// lose the first row than let the footer slip off screen.
	return clampLines(full, a.height)
}

func (a *App) renderHeader() string {
	t := a.Theme
	// Required parts (badge + URL + SSE health dot) always render.
	// Optional parts (workspace + session + status) are dropped when
	// there's no room.
	badge := t.HeaderTitle.Render(" GACT ")
	dot := t.Header.Render(" " + a.sseHealthDot() + " ")
	url := t.Header.Render(a.BackendURL)
	required := lipgloss.JoinHorizontal(lipgloss.Top, badge, dot, url)
	avail := a.width - lipgloss.Width(required)

	optional := []string{}
	if len(a.workspaces) > 0 {
		optional = append(optional, "ws: "+a.workspaces[0].Name)
	}
	if a.selected >= 0 && a.selected < len(a.sessions) {
		s := a.sessions[a.selected]
		optional = append(optional, "session: "+s.Title)
		// Model/agent surface what's actually running. Drop down to
		// just the model_id so the header stays compact (the provider
		// is rarely ambiguous in practice).
		if s.Model.ModelID != "" {
			optional = append(optional, "model: "+s.Model.ModelID)
		}
		if s.Agent.ID != "" {
			optional = append(optional, "agent: "+s.Agent.ID)
		}
	}
	statusBadge := ""
	if a.currentStatus != "" {
		statusBadge = t.StatusBadge.Render(a.currentStatus)
		avail -= lipgloss.Width(statusBadge)
	}
	// DDDDDDDD1: detached-count chip — always-visible reminder that
	// the user has Ctrl+Z-walked-away sessions on this backend that
	// they can `gact attach` (or pick from the sidebar's ↩ rows).
	// Hidden when the count is 0 to avoid noise on a fresh install.
	detachChip := ""
	if n := len(a.previouslyDetached); n > 0 {
		// Style mirrors StatusBadge so the two chips read as a pair
		// without needing a new palette field. Foreground is Bg
		// (so the glyph reads on the bg-coloured chip), bg is the
		// secondary accent so it picks up the theme.
		detachChip = lipgloss.NewStyle().
			Foreground(t.Bg).Background(t.Secondary).
			Padding(0, 1).Bold(true).
			Render(fmt.Sprintf("↩ %d", n))
		avail -= lipgloss.Width(detachChip)
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
	if detachChip != "" {
		rendered = append(rendered, detachChip)
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
	// LLL6: cluster hints by intent so the eye can chunk them. Each
	// cluster uses `·` (small middle dot) between hints, `│` between
	// clusters. Action cluster comes first (most-used), then nav,
	// then exit. Same chord style throughout (HintKey + HintLabel),
	// no special-casing — the grouping carries the meaning.
	dotStyle := lipgloss.NewStyle().Foreground(t.FgFaint)
	dot := dotStyle.Render(" · ")
	pipe := dotStyle.Render("  │  ")
	mk := func(key, label string) string {
		return t.HintKey.Render(key) + t.HintLabel.Render(" "+label)
	}
	clusters := [][]string{
		{mk("Ctrl+N", "new")},
		{mk("Tab", "pane"), mk("Ctrl+S", "settings"), mk("/", "cmd"), mk("?", "help")},
		{mk("ctrl+c", "quit")},
	}
	parts := make([]string, 0, len(clusters))
	for _, c := range clusters {
		parts = append(parts, strings.Join(c, dot))
	}
	hintLine := strings.Join(parts, pipe)

	left := t.HintLabel.Render("focus: " + focusLabel(a.focus))
	// Surface SSE reconnect state: while the backoff counter is > 0
	// the stream is down and we're waiting to retry. J2's reset-on-
	// event drops this back to nothing as soon as the stream is
	// healthy, so nothing needs to clear it on a separate code path.
	//
	// DDDDD1: only show the badge if the outage has lasted long
	// enough to matter. Without this gate a flaky/transient SSE
	// drop+reconnect (sub-second) makes the badge appear for a
	// single render frame, then vanish — visible flicker on the
	// footer that the user reported as annoying. 800 ms is short
	// enough that real outages still surface within a second; long
	// enough that the routine ~250 ms reconnect blip stays silent.
	if a.sseBackoffAttempts > 0 && !a.sseDownSince.IsZero() &&
		time.Since(a.sseDownSince) >= sseBadgeMinDelay {
		left += "  " + lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
			Render("(reconnecting…)")
	}

	right := ""

	// CLIO-BBBBBBBBBB4 (v0.2 §6.19): memory cache-hit-rate chip.
	// Gated on capabilities.memory so v0.1 backends render nothing.
	// A non-zero memoryStats.Cache (either hits or misses) means we've
	// actually seen stats; until then, don't show the chip.
	if a.caps.Capabilities.Memory {
		total := a.memoryStats.Cache.Hits + a.memoryStats.Cache.Misses
		if total > 0 {
			hr := a.memoryStats.Cache.HitRate
			// Traffic-light the hit rate: green ≥ 0.75, amber ≥ 0.50,
			// red otherwise. Matches the CLIO target of >85%.
			hrColor := t.Danger
			switch {
			case hr >= 0.75:
				hrColor = t.Success
			case hr >= 0.50:
				hrColor = t.Warning
			}
			chip := lipgloss.NewStyle().Background(t.Bg).
				Foreground(t.FgMuted).Padding(0, 1).
				Render("cache")
			rate := lipgloss.NewStyle().Background(t.Bg).
				Foreground(hrColor).Bold(true).Padding(0, 1).
				Render(fmt.Sprintf("%.0f%%", hr*100))
			right = chip + rate + "  "
		}
	}

	if a.selected >= 0 && a.selected < len(a.sessions) {
		s := a.sessions[a.selected]
		if s.CostUSD > 0 || s.Tokens.Input > 0 {
			// Color-code input tokens by how close we are to typical
			// context window limits. Warning at 100K (getting into
			// "summarize soon" territory for most frontier models),
			// danger at 150K (Sonnet/GPT-4 Turbo window limits). Raw
			// counts stay muted.
			tokenColor := t.FgMuted
			switch {
			case s.Tokens.Input >= t.CostDangerTokens:
				tokenColor = t.Danger
			case s.Tokens.Input >= t.CostWarnTokens:
				tokenColor = t.Warning
			}
			// LLL6: render cost as a chip — bg-tinted pill with the
			// $ amount and the in/out counts inside, so it pops away
			// from the dim hint row instead of floating as plain text.
			chipBg := t.Bg
			chip := lipgloss.NewStyle().Background(chipBg).
				Foreground(t.Secondary).Bold(true).Padding(0, 1).
				Render(fmt.Sprintf("$%.4f", s.CostUSD))
			tokens := lipgloss.NewStyle().Background(chipBg).
				Foreground(tokenColor).Padding(0, 1).
				Render(fmt.Sprintf("%s in / %s out",
					humanTokens(s.Tokens.Input),
					humanTokens(s.Tokens.Output)))
			// CLIO-BBBBBBBBBB4: concatenate onto any existing right-
			// side chip (e.g. the v0.2 memory chip) instead of
			// clobbering it.
			right += chip + tokens
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
	// CCCCC1: lipgloss .Height(N) is OUTER height (border included).
	// Previously we passed Height(height-2) treating it as inner content
	// — that left the bordered pane 2 rows short, so the sidebar's `╰╯`
	// floated up while the conversation pane stayed at its full height.
	style := t.Pane.Width(width - 2).Height(height)
	if a.focus == FocusSidebar {
		style = t.PaneFoc.Width(width - 2).Height(height)
	}
	// JJJJJJJJ1 + XXXXXXXX1: surface the active sidebar filter in
	// the title so the narrower view is visible even after the
	// transient hint fades. Two mutually-non-exclusive filters —
	// if both d and b were on, stacked suffix.
	titleText := "SESSIONS"
	switch {
	case a.showDetachedOnly && a.showBusyOnly:
		titleText = "SESSIONS · detached + busy"
	case a.showDetachedOnly:
		titleText = "SESSIONS · detached"
	case a.showBusyOnly:
		titleText = "SESSIONS · busy"
	}
	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render(titleText)
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
	// for the SESSIONS title (2 rows) + CONTEXT section (2 + N rows
	// when N>0, 3 rows for the "(no files)" placeholder) + the R2
	// "N active · M archived" footer (2 rows: blank + label) + pane
	// border padding (2 rows). Anything not fitting is hidden with
	// "↑ N more" / "N more ↓" indicators at the edges. RRRRRRRRR1:
	// the footer used to be unaccounted for, which made certain
	// (sessions × contextFiles) combos overflow the pane and push
	// everything to the right of the sidebar a few rows down.
	const rowsPerSession = 3
	contextLines := 0
	if a.selected >= 0 {
		if n := len(a.contextFiles); n > 0 {
			contextLines = 2 + n // CONTEXT header + blank + N file rows
		} else {
			contextLines = 3 // CONTEXT header + blank + "(no files)"
		}
	}
	// R2 footer = blank + label = 2 rows whenever any session exists.
	footerLines := 0
	if len(a.sessions) > 0 {
		footerLines = 2
	}
	// Available rows for sessions inside the pane: height-2 (border),
	// minus the fixed header (SESSIONS title + blank = 2), minus
	// contextLines, minus footerLines, minus 1 safety spacer between
	// sessions list and CONTEXT when both render.
	avail := (height - 2) - 2 - contextLines - footerLines
	if contextLines > 0 {
		avail-- // blank spacer between session list and CONTEXT
	}
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
		// UUU1: append `(N tasks)` badge when the session has open
		// pending/running §6.18 tasks. Loaded lazily on selectSession.
		taskBadge := ""
		if n := a.taskCountBySession[s.ID]; n > 0 {
			taskBadge = "  " + lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
				Render(fmt.Sprintf("(%d tasks)", n))
		}
		// BBBBBBBB1: ↩ marker for sessions the user has previously
		// detached from (loaded from the local detached.json registry
		// at startup). Tells the user "this is one I walked away
		// from" without leaving the TUI to run `gact detached`.
		detachBadge := ""
		if a.previouslyDetached[s.ID] {
			detachBadge = " " + lipgloss.NewStyle().Foreground(t.Secondary).
				Render("↩")
		}
		// Reserve room for badges so title truncation doesn't collide.
		titleBudget := width - 8 - len(indent) - lipgloss.Width(taskBadge) - lipgloss.Width(detachBadge)
		if titleBudget < 6 {
			titleBudget = 6
		}
		titleLine := marker + indent + dot + titleStyle.Render(truncate(title, titleBudget)) + detachBadge + taskBadge
		// HHHHHHHH1: append humanized "Nm ago" to the status line so
		// users can tell which sessions are stale at a glance. Sits
		// next to the status word in the same muted italic — same
		// row, no extra vertical space. Zero UpdatedAt (fresh sessions
		// the backend hasn't filled in yet) renders without the age
		// suffix so the row isn't a lie.
		statusText := s.Status
		if !s.UpdatedAt.IsZero() {
			statusText += " · " + humanAgeShort(time.Since(s.UpdatedAt.UTC()))
		}
		statusLine := "  " + indent + "  " + statusStyle.Render(statusText)
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

	// R2: sidebar footer — show "N active · M archived" so users
	// can tell at a glance how much history is live vs hidden under
	// the `h` toggle. Placed after CONTEXT so it sits at the bottom
	// of the pane regardless of CONTEXT's length.
	active, archived := 0, 0
	for _, s := range a.sessions {
		if s.ArchivedAt != nil {
			archived++
		} else {
			active++
		}
	}
	if active > 0 || archived > 0 {
		label := fmt.Sprintf("%d active · %d archived", active, archived)
		if a.showArchived {
			label = fmt.Sprintf("%d archived · %d active", archived, active)
		}
		rows = append(rows,
			"",
			lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).Render(label))
	}

	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	// RRRRRRRRR1: safety clamp — budget math above can still be off
	// by one on edge cases (certain session-count × context-file
	// combinations), and lipgloss.Height(h) pads but doesn't
	// truncate, so an over-tall body would draw past the border and
	// push sibling panes down. clampLines hard-caps at the pane's
	// inner height so the border always closes where expected.
	if inner := height - 2; inner > 0 {
		body = clampLines(body, inner)
	}
	return style.Render(body)
}

func (a *App) renderBody(width, height int) string {
	t := a.Theme
	// Input pane grows with multi-line content up to a cap so users
	// can actually see what they're composing. 3 rows is the floor
	// (1 border top + 1 content + 1 border bottom ≈ 1 visible line)
	// and we cap at ~1/3 the viewport so a long paste doesn't crowd
	// out the conversation. lineCount here is 1-based (a 3-line buffer
	// reports 3); we give the pane one extra row for the cursor.
	//
	// LLL5: the conv-height math also lives in conversationPaneHeight
	// so renderSidebar can match. Re-derive inputH/hintH from the same
	// formula here (kept inline so renderBody keeps its single-pass
	// shape and doesn't traverse the helper twice).
	msgH := a.conversationPaneHeight(height)
	hintH := 0
	if a.transientHint != "" {
		hintH = 1
	}
	inputH := height - msgH - hintH

	// Conversation pane. CCCCC1: lipgloss .Height(N) is OUTER (border
	// included); the previous Height(msgH-2) made the bordered region
	// 2 rows shorter than its allotment.
	msgStyle := t.Pane.Width(width - 2).Height(msgH)
	if a.focus == FocusBody {
		msgStyle = t.PaneFoc.Width(width - 2).Height(msgH)
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
		// KKKKK1: surface the per-session lifecycle keys here. The user
		// reported they didn't know rename/delete/archive existed —
		// the help overlay had them but the empty-state crib (the
		// thing they actually see first) didn't.
		hints := lipgloss.JoinVertical(lipgloss.Left,
			t.HintLabel.Render("In sidebar (Tab to focus):"),
			"  "+t.HintKey.Render("n")+t.HintLabel.Render(" new")+
				"   "+t.HintKey.Render("e")+t.HintLabel.Render(" rename")+
				"   "+t.HintKey.Render("x")+t.HintLabel.Render(" delete (x again to confirm)"),
			"  "+t.HintKey.Render("A")+t.HintLabel.Render(" archive")+
				"   "+t.HintKey.Render("h")+t.HintLabel.Render(" archived")+
				"   "+t.HintKey.Render("d")+t.HintLabel.Render(" detached")+
				"   "+t.HintKey.Render("b")+t.HintLabel.Render(" busy")+
				"   "+t.HintKey.Render("/")+t.HintLabel.Render(" filter"),
			"  "+t.HintKey.Render("o")+t.HintLabel.Render(" attach a file as context")+
				"   "+t.HintKey.Render("↑/↓")+t.HintLabel.Render(" pick"),
			"",
			t.HintLabel.Render("Other things to try:"),
			"  "+t.HintKey.Render("Ctrl+S")+t.HintLabel.Render(" pick a model / agent"),
			"  "+t.HintKey.Render("/")+t.HintLabel.Render(" command palette  ·  ")+
				t.HintKey.Render("?")+t.HintLabel.Render(" help"),
			"  "+t.HintKey.Render("Ctrl+Z")+t.HintLabel.Render(" detach (TUI exits; ")+
				t.HintKey.Render("gact attach <sid>")+t.HintLabel.Render(" reattaches)"),
		)
		// EEEEEEEE1: when the user has detached sessions on this
		// backend, surface that on the empty-state callout so the
		// resume path is discoverable on a fresh TUI start. Hidden
		// when count is 0 to keep the empty state clean for new
		// installs.
		var resumeHint string
		if n := len(a.previouslyDetached); n > 0 {
			resumeHint = lipgloss.NewStyle().
				Bold(true).Foreground(t.Secondary).
				Render(fmt.Sprintf("↩ %d detached session(s) on this backend — ", n)) +
				t.HintKey.Render("gact attach") +
				t.HintLabel.Render(" (no args) resumes the most recent")
		}
		if resumeHint != "" {
			body = lipgloss.JoinVertical(lipgloss.Left, callout, "", resumeHint, "", hints)
		} else {
			body = lipgloss.JoinVertical(lipgloss.Left, callout, "", hints)
		}
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
			"  "+lipgloss.NewStyle().Foreground(t.Secondary).Render("write a long explain")+
				"       "+t.HintLabel.Render("long assistant reply (~60 lines)"),
			"  "+lipgloss.NewStyle().Foreground(t.Secondary).Render("dump the log")+
				"              "+t.HintLabel.Render("large tool output (~80 lines)"),
			"  "+lipgloss.NewStyle().Foreground(t.Secondary).Render("many tools please")+
				"         "+t.HintLabel.Render("3 tool calls in one turn"),
			"",
			t.HintLabel.Render("Also try:"),
			"  "+t.HintKey.Render("@")+t.HintLabel.Render(" to attach a workspace file  ·  ")+
				t.HintKey.Render("Ctrl+G")+t.HintLabel.Render(" to compose in a big window"),
			"  "+t.HintKey.Render("Ctrl+S")+t.HintLabel.Render(" settings  ·  ")+
				t.HintKey.Render("/theme")+t.HintLabel.Render(" to pick a palette"),
		)
	} else {
		var rows []string
		// III1: pair tool_results to their tool_calls so each call's
		// output renders directly under it. Tool messages whose entire
		// payload was absorbed get skipped from standalone rendering
		// (the role header would otherwise be empty noise).
		inlineResults, absorbed := pairToolResults(a.messages)
		for i, m := range a.messages {
			if absorbed[i] {
				continue
			}
			var prev *gact.Message
			if i > 0 {
				prev = &a.messages[i-1]
			}
			// TTTTTTTTT1: pass the selected part ID so the per-block
			// `▸ ` marker paints on the currently focused part. Only
			// honoured on the selected message; empty string on every
			// other row so unrelated messages render untouched.
			selPartID := ""
			if i == a.bodySelMsgIdx && a.focus == FocusBody {
				selPartID = a.selectedPartID()
			}
			row := t.renderMessageInContextWithResultsSelected(m, prev, width-4, inlineResults[i], selPartID)
			// XXXXXXXXX1: dropped the full-message █ gutter bar + row tint
			// per user feedback: "i also dont see the value with the
			// message selector and global turn selector rather just have
			// the message selector". The per-block `▸ ` cursor from
			// TTTTTTTTT1 is now the only selection indicator — single
			// selector, clearer signal. Search-hit marker still paints
			// (different colour + glyph, independent UX).
			if m.ID != "" && m.ID == a.searchHitMessageID {
				marker := lipgloss.NewStyle().Foreground(t.Warning).Bold(true).Render("▶ ")
				row = prependGutter(row, marker)
			}
			rows = append(rows, row)
		}
		// Pending-turn indicator: when the session is running but the latest
		// message hasn't produced any visible parts yet (e.g. user just
		// pressed Enter and the assistant hasn't streamed a delta), show a
		// "● thinking…" stub so the user knows the system isn't dead.
		if a.shouldShowThinkingIndicator() {
			thinkLine := lipgloss.NewStyle().Foreground(t.Warning).Bold(true).
				Render(a.spinnerChar()) + " " +
				lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
					Render("CLIO is thinking…")
			rows = append(rows, "", thinkLine)
		}
		body = strings.Join(rows, "\n")
		// The pane's inner content height is msgH-2 (two border rows).
		// We burn 1 row on headerRow, 1 on the blank separator, and
		// optionally 1 more if the permission banner is present. The
		// remaining rows are all the conversation body can occupy —
		// anything beyond that overflows the pane and bleeds into the
		// footer row below.
		conversationH := msgH - 2 - 1 - 1
		if permBanner != "" {
			conversationH--
		}
		if conversationH < 1 {
			conversationH = 1
		}
		// VVVVVVVVV1: one-shot scroll adjustment — if a nav handler
		// flagged pendingPartScroll, find the ▸ marker in the full
		// body and bump scrollOffset so it falls within the viewport
		// (ideally at ~1/3 from top for context). Clear the flag so
		// subsequent renders (e.g. SSE streaming a new message in)
		// don't re-thrash the scroll.
		if a.pendingPartScroll {
			a.adjustScrollForSelectedPart(body, conversationH)
			a.pendingPartScroll = false
		}
		body = a.scrollClip(body, conversationH, t)
	}

	pieces := []string{headerRow}
	if permBanner != "" {
		pieces = append(pieces, permBanner)
	}
	pieces = append(pieces, "", body)
	msgPane := msgStyle.Render(lipgloss.JoinVertical(lipgloss.Left, pieces...))
	// CCCCC1: hard-fit to msgH (truncate AND pad). The previous
	// clamp-only path let lipgloss render a short pane when content
	// was sparse — that left the conversation `╰╯` floating up while
	// the input box stayed pinned to bodyH-inputH, making the bottom
	// of the layout look broken whenever the conversation grew past
	// the original short content.
	msgPane = fitLines(msgPane, msgH)

	// Input — bubbles/textarea handles cursor + multi-line + paste itself.
	a.input.SetWidth(width - 4)
	a.input.SetHeight(inputH - 2)
	if a.focus == FocusInput {
		a.input.Focus()
	} else {
		a.input.Blur()
	}
	// CCCCC1: same OUTER-height correction as sidebar/conversation.
	inputStyle := t.Pane.Width(width - 2).Height(inputH)
	if a.focus == FocusInput {
		inputStyle = t.PaneFoc.Width(width - 2).Height(inputH)
	}
	inputPane := fitLines(inputStyle.Render(a.input.View()), inputH)

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

// pastedSegment represents a single multi-line paste that was
// compressed in the input box. `placeholder` is the exact string
// inserted into the textarea (e.g. `[pasted content: 42 lines]`);
// `content` is the real body that gets expanded either on Ctrl+P or
// implicitly at send time.
type pastedSegment struct {
	placeholder string
	content     string
	lineCount   int
}

// insertPastePlaceholder compresses a paste into a short placeholder
// token in the input textarea and records the real content for later
// substitution. Called from the PasteMsg handler when the paste is
// ≥ 3 lines tall (small pastes flow through as-is because the compress
// overhead isn't worth it).
func (a *App) insertPastePlaceholder(content string, lineCount int) {
	seq := len(a.pastes) + 1
	placeholder := fmt.Sprintf("[pasted content #%d: %d lines]", seq, lineCount)
	a.pastes = append(a.pastes, pastedSegment{
		placeholder: placeholder,
		content:     content,
		lineCount:   lineCount,
	})
	// Append the placeholder to the current buffer. We use InsertString
	// via SetValue round-trip because bubbles/v2's textarea doesn't
	// expose an insert-at-cursor primitive and the append-on-end
	// behaviour is what users actually want for a paste anyway.
	cur := a.input.Value()
	if cur != "" && !strings.HasSuffix(cur, " ") && !strings.HasSuffix(cur, "\n") {
		cur += " "
	}
	a.input.SetValue(cur + placeholder + " ")
}

// expandPasteText returns raw with every recorded paste placeholder
// substituted for its full content. Used at send time so the backend
// receives the pasted material verbatim, and by Ctrl+P to reveal the
// most recent paste inline.
func (a *App) expandPasteText(raw string) string {
	out := raw
	for _, p := range a.pastes {
		out = strings.ReplaceAll(out, p.placeholder, p.content)
	}
	return out
}

// expandMostRecentPaste swaps the last compressed paste's placeholder
// for its full content in the current buffer. Drops the segment from
// the pastes list so a second Ctrl+P expands the next one up.
// No-ops when nothing is compressed.
func (a *App) expandMostRecentPaste() {
	if len(a.pastes) == 0 {
		return
	}
	last := a.pastes[len(a.pastes)-1]
	buf := a.input.Value()
	if !strings.Contains(buf, last.placeholder) {
		// Placeholder was already deleted manually; drop the record.
		a.pastes = a.pastes[:len(a.pastes)-1]
		return
	}
	a.input.SetValue(strings.Replace(buf, last.placeholder, last.content, 1))
	a.pastes = a.pastes[:len(a.pastes)-1]
}

// humanAgeShort renders a duration as a compact 2-3 char age
// stamp for the sidebar's per-session "updated Nm ago" suffix.
// Negative durations (clock skew) clamp to "now" so the row
// doesn't print confusing "-5m ago". (HHHHHHHH1)
func humanAgeShort(d time.Duration) string {
	if d < 0 {
		return "now"
	}
	if d < time.Minute {
		return fmt.Sprintf("%ds ago", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	}
	return fmt.Sprintf("%dd ago", int(d.Hours()/24))
}

// prependGutter inserts gutter at the start of every line of s.
// Used by the V3 search-hit marker so a message's gutter shows up
// on every wrapped row, not just the first.
func prependGutter(s, gutter string) string {
	lines := strings.Split(s, "\n")
	for i := range lines {
		lines[i] = gutter + lines[i]
	}
	return strings.Join(lines, "\n")
}

// tintRowBg paints a background colour across every line of s,
// padding each line to width so the tint fills any short trailing
// cells. Used by the body cursor to make the selected message
// unmistakable — the gutter alone is easy to miss against tool
// output (per feedback_ctrl_e_and_overflow item 5).
func tintRowBg(s string, bg color.Color, width int) string {
	lines := strings.Split(s, "\n")
	style := lipgloss.NewStyle().Background(bg)
	for i, ln := range lines {
		// lipgloss.Width is ANSI-aware; pad with raw spaces and let the
		// outer Background(...).Render colour those cells too.
		w := lipgloss.Width(ln)
		if w < width {
			ln += strings.Repeat(" ", width-w)
		}
		lines[i] = style.Render(ln)
	}
	return strings.Join(lines, "\n")
}

// clampLines hard-truncates a pre-rendered string to at most max newline-
// separated rows. Used as a final safety net so layout siblings (header,
// footer) don't get pushed off-screen when a pane's internal clip math
// underestimates line count (soft-wrap, multi-line ANSI composites, etc.).
func clampLines(s string, max int) string {
	if max < 1 {
		return ""
	}
	lines := strings.Split(s, "\n")
	if len(lines) <= max {
		return s
	}
	return strings.Join(lines[:max], "\n")
}

// fitLines is clampLines + bottom-pad: forces the output to be EXACTLY
// `n` lines. lipgloss's .Height(N) is supposed to pad short content but
// in practice (CCCCC1) empty/sparse panes can render shorter, leaving
// JoinHorizontal to fill the gap with neighbour content. Forcing the
// row count keeps borders from drifting between sidebar and body.
func fitLines(s string, n int) string {
	if n < 1 {
		return ""
	}
	lines := strings.Split(s, "\n")
	if len(lines) > n {
		lines = lines[:n]
	}
	for len(lines) < n {
		lines = append(lines, "")
	}
	return strings.Join(lines, "\n")
}

// VVVVVVVVV1: adjustScrollForSelectedPart finds the ▸ marker in the
// rendered body and re-anchors scrollOffset so the marker lands
// within the viewport. Called one-shot from the View path when a nav
// handler has flagged pendingPartScroll — the base
// scrollToSelectedMessage offset is an approximation (measures in
// messages, scrollClip wants lines), this fine-tunes it to land the
// actual selected row in view.
//
// Strategy:
//   - If no marker (cursor off or part has no rendered content),
//     leave scrollOffset untouched.
//   - Otherwise place the marker at ~1/3 from the top of the viewport
//     so there's context above it. If the marker is already visible
//     within that target range, nudge only when it's outside — never
//     snap the viewport back when the user paged beyond the marker
//     with PgDn/PgUp deliberately.
//
// scrollClip's math is:
//
//	start := len(lines) - maxRows - scrollOffset
//
// So to place `markerRow` at offset `margin` from the top of the
// viewport we solve:
//
//	markerRow == start + margin
//	          == len(lines) - maxRows - scrollOffset + margin
//	scrollOffset = len(lines) - markerRow - maxRows + margin
func (a *App) adjustScrollForSelectedPart(body string, viewportH int) {
	const marker = "▸ "
	if !strings.Contains(body, marker) {
		return
	}
	// Line index of the first ▸ occurrence. We only emit the marker
	// on the selected part's first line, so this is unambiguous.
	idx := strings.Index(body, marker)
	markerRow := strings.Count(body[:idx], "\n")
	totalLines := strings.Count(body, "\n") + 1
	if viewportH < 1 {
		viewportH = 1
	}
	margin := viewportH / 3
	if margin < 2 {
		margin = 2
	}
	if margin >= viewportH {
		margin = viewportH - 1
	}
	// Current visible window:
	var start int
	if a.stickyToBottom {
		start = totalLines - viewportH
	} else {
		start = totalLines - viewportH - a.scrollOffset
	}
	if start < 0 {
		start = 0
	}
	end := start + viewportH
	// If marker is already in the upper-2/3 of the viewport, leave
	// scroll alone — nudging on a visible marker just jitters the UI
	// as the user walks through adjacent parts.
	if markerRow >= start && markerRow < end-margin {
		return
	}
	// Target: markerRow at offset `margin` from start.
	desired := totalLines - markerRow - viewportH + margin
	if desired < 0 {
		desired = 0
	}
	a.scrollOffset = desired
	a.stickyToBottom = a.scrollOffset == 0
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
	w := a.modalWidth()

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
		// Q3: settings-style commands surface their current state
		// inline so users know what they'd be changing before they
		// hit Enter. Rendered as a faint suffix in Secondary so it
		// stands out without competing with the title.
		if hint := a.paletteCurrentValue(c.ID); hint != "" {
			valStyle := lipgloss.NewStyle().Foreground(t.Secondary).Italic(true)
			line += "  " + valStyle.Render("· "+hint)
		}
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

// helpTabs is the fixed list of help-overlay tabs. Keep the slice sorted
// by pane-discovery order (global → where the cursor is → deeper modes).
var helpTabs = []struct {
	title string
	keys  [][2]string // {key, description}
}{
	{
		title: "Global",
		keys: [][2]string{
			{"Tab / ⇧Tab", "cycle focus (sidebar → body → input)"},
			{"Ctrl+N", "new session"},
			{"Ctrl+W", "switch workspace"},
			{"Ctrl+S", "settings (model / agent / theme / TUI)"},
			{"Ctrl+T", "backend metrics"},
			{"Ctrl+Alt+T", "cycle colour theme (Kitty-only; else /theme-next)"},
			{"Ctrl+R", "refresh / reconnect"},
			{"Ctrl+L", "reload config from disk"},
			{"Ctrl+X", "cancel running scenario"},
			{"Ctrl+Y", "voice transcribe"},
			{"Ctrl+Z", "detach (TUI exits; `gact attach <sid>` reattaches)"},
			{"?", "toggle this help"},
			{"Esc", "close overlay / clear input"},
			{"Ctrl+C", "quit (cancels in-flight turn before exit)"},
		},
	},
	{
		title: "Sidebar",
		keys: [][2]string{
			{"↑/↓ · j/k", "pick session (auto-loads messages)"},
			{"g / G", "jump to first / last session"},
			{"PgUp/PgDn", "page up / down"},
			{"n", "new session"},
			{"e", "rename session"},
			{"x", "delete session (press x again to confirm)"},
			{"A", "archive session (un-archive in archived view)"},
			{"h", "toggle archived / active view"},
			{"d", "toggle detached-only view (sessions you Ctrl+Z-walked-away-from)"},
			{"b", "toggle busy-only view (running + waiting_permission sessions)"},
			{"y", "yank selected session id to clipboard (pipe into gact log/attach/etc.)"},
			{"/", "filter sessions by title"},
			{"o", "add file to session context"},
		},
	},
	{
		title: "Conversation",
		keys: [][2]string{
			{"↑/↓ · j/k", "move block cursor — walks part-by-part across turns (▸ marks the selected block)"},
			{"g / G", "cursor to first / last block"},
			{"PgUp/PgDn · Ctrl+U/D", "raw page scroll (cursor stays put)"},
			{"y", "copy selected (or last assistant) message to clipboard"},
			{"Y", "copy full conversation as role-prefixed markdown"},
			{"R", "retry — resend last user message"},
			{"d", "delete last message (optimistic; targets newest)"},
			{"t", "toggle per-message timestamps"},
			{"n / N", "next / prev block (alias for ↓/↑)"},
			{"Ctrl+E · Enter", "expand the cursor's bulky output in floating detail view"},
			{"a / r", "apply / reject pending diff"},
		},
	},
	{
		title: "Input",
		keys: [][2]string{
			{"Enter", "send"},
			{"\\<Enter>", "newline (always works — Claude-Code style)"},
			{"Shift+Enter · Alt+Enter · Ctrl+J", "newline (terminal-dependent)"},
			{"↑ on empty", "recall prior prompt (per-session history)"},
			{"/", "open command palette"},
			{"/?<query>", "search session messages in palette"},
			{"Paste ≥ N lines", "auto-compresses (N = Settings → TUI → paste compress)"},
			{"Ctrl+P", "expand most recent compressed paste in-place"},
			{"Ctrl+G · Ctrl+⇧P", "open compose modal (long-form editor)"},
			{"@", "open fuzzy workspace-file picker (inserts @path)"},
		},
	},
	{
		// Slash-commands users can type after pressing `/`. Palette
		// shows them all; this tab serves as a quick-reference for
		// the newer ones that might not jump out of the flat list.
		title: "Commands",
		keys: [][2]string{
			{"/clear", "wipe messages in this session"},
			{"/cancel", "halt the running assistant turn"},
			{"/new", "create a new session"},
			{"/rename", "rename the current session"},
			{"/mcp", "list connected MCP servers (server health/reconnect)"},
			{"/tools", "unified catalog: built-in tools + every MCP-exposed tool"},
			{"/catalog", "alias for /tools — same unified view"},
			{"/skills", "list available skills (backend-dependent)"},
			{"/agents", "switch agent (opens Settings > Agent)"},
			{"/scenarios", "jump to the Scenarios help tab"},
			{"/sessions", "focus sidebar + start title filter"},
			{"/theme", "open Theme picker (dark/light/dracula/…) "},
			{"/theme-export", "save active palette to ~/.config/gact/theme.json"},
			{"/metrics", "open metrics modal (same as Ctrl+T)"},
			{"/theme-next", "cycle to next theme (Ctrl+Alt+T on Kitty)"},
			{"/theme-prev", "cycle to previous theme"},
			{"/duplicate", "copy current session (title/model/agent; fresh messages)"},
			{"/help", "show help message from backend"},
			{"/diff", "show pending diffs (a/r in body to apply/reject)"},
		},
	},
	{
		title: "Permission",
		keys: [][2]string{
			{"a / d", "allow / deny once"},
			{"s", "allow for this session"},
			{"w", "allow for this workspace"},
		},
	},
	{
		// Scenario triggers — the emulator routes messages by keyword
		// into different scripts. The empty-state crib listed these
		// but disappeared once a message landed. Surfacing them here
		// means users can always remember "how do I get a long reply
		// again?" even mid-conversation (issue #4).
		title: "Scenarios",
		keys: [][2]string{
			{"read main.go", "normal turn (text + tool call + result)"},
			{"delete the temp dir", "triggers a permission prompt (a/d/s/w)"},
			{"propose an edit to main.go", "file_diff part — a / r in body to apply/reject"},
			{"split this with a sub-agent", "spawns a code_reviewer subagent"},
			{"write a long explain", "long assistant reply (~60 lines)"},
			{"dump the log", "large tool output (~80 lines) — Ctrl+E to expand"},
			{"many tools please", "3 tool calls in one turn"},
		},
	},
}

const helpTabCount = 7

// helpTabIndex returns the slice position of the tab with the given
// title, or 0 (Global) if not found. Lets slash-command handlers
// jump to a named tab without hard-coding indexes that drift when
// tabs are added or reordered.
func helpTabIndex(title string) int {
	for i, tab := range helpTabs {
		if tab.title == title {
			return i
		}
	}
	return 0
}

// viewHelp renders the help overlay as a tabbed modal. Each tab scopes
// keybindings to a pane or mode so the list always fits in-view —
// replacing the older L7 single-scroll layout that users reported as
// overflowing the viewport (issue #7).
//
// Navigation: ←/→ or h/l or Tab cycles tabs; ?/Esc closes.
func (a *App) viewHelp() string {
	t := a.Theme
	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render("Keybindings")

	// Tab header — highlight the active tab.
	tabCells := make([]string, 0, len(helpTabs))
	for i, tab := range helpTabs {
		style := lipgloss.NewStyle().Padding(0, 1).Foreground(t.FgMuted)
		if i == a.helpTab {
			style = lipgloss.NewStyle().Padding(0, 1).
				Foreground(t.Bg).Background(t.Primary).Bold(true)
		}
		tabCells = append(tabCells, style.Render(tab.title))
	}
	tabRow := lipgloss.JoinHorizontal(lipgloss.Top, tabCells...)

	// Body — the current tab's key list. Clamp helpTab defensively so a
	// future out-of-range value doesn't crash the render.
	idx := a.helpTab
	if idx < 0 || idx >= len(helpTabs) {
		idx = 0
	}
	rows := make([]string, 0, len(helpTabs[idx].keys))
	for _, kp := range helpTabs[idx].keys {
		rows = append(rows,
			t.HintKey.Render(kp[0])+"  "+t.HintLabel.Render(kp[1]))
	}
	keys := lipgloss.JoinVertical(lipgloss.Left, rows...)

	hint := lipgloss.NewStyle().Italic(true).Foreground(t.FgMuted).
		Render("← →  switch tab    ?  close")

	body := lipgloss.JoinVertical(lipgloss.Left,
		title, "", tabRow, "", keys, "", hint,
	)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Background(t.BgSubtle).
		Padding(1, 2).
		Width(a.modalWidth()).
		Render(body)
}

// overlay places overlay centered on top of base. Bubbletea v2 doesn't have
// a built-in compositor (the lipgloss Layer API works but is heavier).
// This is a simple character-grid composite: split base into lines, paint
// the overlay's lines starting at the centered offset, return joined string.
// overlay splices `top` onto `base` as a centred floating window.
// Rows outside the modal's Y range pass through unchanged; rows
// intersecting the modal are spliced so the base content LEFT of the
// modal and RIGHT of the modal stays visible. The modal's own lines
// are considered opaque (they're pre-styled with a solid-background
// box), so the base behind them doesn't bleed through.
//
// Splicing is ANSI-aware via github.com/charmbracelet/x/ansi so we
// count display cells, not bytes, when cutting the base row. The
// reset-SGR between segments prevents background-colour state from
// leaking past the modal's right edge into the base content.
//
// This fixes the old padOrInsert bug where every modal row returned
// `spaces + modal` and discarded the base entirely — that's what made
// the modal look like a "black bar across the screen" that reviewers
// called out in feedback L2.
func overlay(base, top string, w, h int) string {
	baseLines := strings.Split(base, "\n")
	topLines := strings.Split(top, "\n")
	tH := len(topLines)
	tW := 0
	for _, l := range topLines {
		if wl := lipgloss.Width(l); wl > tW {
			tW = wl
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
		baseLines[idx] = spliceRow(baseLines[idx], ol, startX, tW)
	}
	return strings.Join(baseLines, "\n")
}

// spliceRow overlays `top` starting at column `startX` of `row` while
// preserving the base content to the left and right of the modal.
// Width is in display cells (grapheme-safe via ansi.Width).
//
// If the base row is shorter than startX, the gap is padded with
// spaces so the modal still lands at the intended column. Similarly
// if startX+topW extends past the base row, the right segment is
// empty (nothing to preserve).
//
// The "\x1b[0m" between segments is a reset-SGR escape so the modal's
// background colour can't leak past its right edge into the base.
func spliceRow(row, top string, startX, topW int) string {
	const resetSGR = "\x1b[0m"
	rowW := ansi.StringWidth(row)

	// Left chunk of the base row: first `startX` display cells.
	var left string
	if startX <= 0 {
		left = ""
	} else if rowW >= startX {
		left = ansi.Truncate(row, startX, "")
	} else {
		// Base row too short — pad to startX.
		left = row + strings.Repeat(" ", startX-rowW)
	}

	// Right chunk: everything past (startX + topW) in the base row.
	var right string
	rightCut := startX + topW
	if rowW > rightCut {
		right = ansi.TruncateLeft(row, rightCut, "")
	}

	return left + resetSGR + top + resetSGR + right
}

// --- Messages -------------------------------------------------------------

type connectedMsg struct {
	caps     gact.Capabilities
	wss      []gact.Workspace
	wsID     string
	sessions []gact.Session
	commands []gact.Command
}

// CLIO-BBBBBBBBBB4: memoryStatsMsg carries a fresh /v1/memory/stats
// snapshot. Fired after connect + after every session.status_changed
// → idle event for backends with capabilities.memory = true.
type memoryStatsMsg struct {
	stats gact.MemoryStats
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
