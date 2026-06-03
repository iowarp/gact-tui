package ui

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"image/color"
	"math/rand"
	"os"
	"path/filepath"
	"sort"
	"strconv"
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
	FocusRightSidebar
	FocusInput
)

type sidebarSection int

const (
	sidebarSectionSessions sidebarSection = iota
	sidebarSectionAgents
	sidebarSectionFiles
	sidebarSectionContext
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

const modelSwapMarkerKind = "model_provider_swap"

// App is the root Bubbletea model.
type App struct {
	BackendURL string
	// BackendLabel is an optional human-readable deployment identity,
	// such as "myclio (clio)", supplied by `gact connect <name>`.
	BackendLabel string
	Theme        Theme

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

	// InitialWorkspaceSelector is applied on the first backend
	// connection. It accepts a workspace id, exact name, or exact root
	// path. Once the user switches workspaces, reconnects stay pinned to
	// the current workspace id instead of falling back to this value.
	InitialWorkspaceSelector string

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
	localizer     Localizer

	// DisableAltScreen turns off the alternate-screen-buffer mode. Used
	// by tests because teatest's PTY simulation doesn't capture writes
	// while in alt-screen mode. NEVER set this in production.
	DisableAltScreen bool
	// MouseEnabled controls terminal mouse reporting and mouse handlers.
	// It defaults to true, but is persisted as Settings > TUI because
	// some terminals or remote shells make mouse capture intrusive.
	MouseEnabled bool

	c *client.Client

	width, height int
	stage         Stage
	stageError    string
	focus         FocusZone

	caps gact.Capabilities
	// CLIO-BBBBBBBBBB4 (v0.2 §6.19): last-known memory stats from
	// the backend. Populated when capabilities.memory = true and
	// the client fetches GET /v1/memory/stats on session-status
	// changes. Renders as a small cache hit-rate chip in the footer.
	// Zero-value renders as nothing (no chip).
	memoryStats gact.MemoryStats
	workspaces  []gact.Workspace
	wsID        string
	sessions    []gact.Session
	selected    int // index into sessions; -1 if none
	commands    []gact.Command

	// Loaded messages for the currently selected session.
	messages       []gact.Message
	scrollOffset   int // 0 = stick to bottom; >0 = scrolled up
	stickyToBottom bool

	// Context files for the currently selected session (fetched on select).
	contextFiles   []gact.ContextFile
	contextFileSel int

	agentHierarchyAgents   []gact.AgentDef
	agentHierarchyErr      string
	agentHierarchySel      int
	sidebarAgentsCollapsed bool

	// Local file viewer module. This is process-cwd-backed and does not require
	// backend filesystem support.
	fileViewerRoot   string
	fileTreeEntries  []fileTreeEntry
	fileTreeExpanded map[string]bool
	fileTreeSel      int
	fileTreeErr      string
	fileTreeRootMode string

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
	inPaste     bool
	pasteBuffer string

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

	// hits is rebuilt during View() and maps rendered terminal cells
	// back to semantic UI actions. Mouse Update paths consult it first
	// so components can own their own click semantics instead of
	// scattering view-specific coordinate math through mouse.go.
	hits               *uiHitRegistry
	baseHitTargetCount int

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
	fileMentions   []composerFileMention

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
	inputDraftBySession   map[string]string
	fileMentionsBySession map[string][]composerFileMention

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
	paletteOpen      bool
	paletteFilter    string
	paletteCursor    int
	paletteCursorSet bool
	paletteSel       int
	searchMatches    []client.SearchMatch
	searching        bool // true while the SearchMessages cmd is in flight

	// Help overlay
	helpOpen   bool
	helpTab    int // active tab index when helpOpen; see helpTabs
	helpScroll int

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

	// Sidebar layout editor. Opened from Settings > TUI and backed by
	// the same sidebar_layout.left/right config shape.
	sidebarLayoutOpen bool
	sidebarLayoutCol  int
	sidebarLayoutSel  [3]int

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
	// Cached LM provider info (set on every lmConfigFetchedMsg). Powers
	// the header model chip (#363) so we don't need a per-render fetch.
	lmProviderInfo *client.LMProviderInfo
	doctor         *doctorState

	// MCP install / remove overlays. Tied to the /mcp-install +
	// /mcp-remove slash commands. State is intentionally tiny — install
	// is a one-line input, remove is a picker over the current
	// a.mcpServers slice (filtered to third-party).
	mcpInstallOpen   bool
	mcpInstallInput  string
	mcpInstallCursor int
	mcpInstallErr    string
	mcpInstallSaving bool
	mcpRemoveOpen    bool
	mcpRemoveOptions []gact.McpServer
	mcpRemoveSel     int
	mcpRemoveSaving  bool

	// Agent blueprint install / validate overlay. Opened from the
	// /agent-blueprints catalog action rows and shared by both workflows:
	// install accepts a path/URL/source, validate accepts a path.
	agentBlueprintManageOpen   bool
	agentBlueprintManageMode   string
	agentBlueprintManageInput  string
	agentBlueprintManageCursor int
	agentBlueprintManageErr    string
	agentBlueprintManageSaving bool

	// Cached MCP server list, populated each time /mcp opens. The remove
	// modal reads from this so it doesn't need an extra round-trip.
	mcpServers []gact.McpServer

	// Workspace switcher overlay — ↑/↓ to navigate the current
	// a.workspaces slice, Enter to switch, Esc to cancel. Reuses the
	// already-loaded workspace list (connectCmd populates it) so the
	// modal opens without re-hitting the backend.
	workspaceSwitchOpen    bool
	workspaceSwitchSel     int
	workspaceCreateOpen    bool
	workspaceCreateName    string
	workspaceCreateNameCur int
	workspaceCreateRoot    string
	workspaceCreateRootCur int
	workspaceCreateField   int
	workspaceCreateSaving  bool
	workspaceCreateError   string

	// Rename modal — inline prompt to change a session's title.
	// Opened by `e` on a selected session in the sidebar. We roll
	// our own input (not bubbles/textarea) because we want a single-
	// line, single-purpose editor and the full textarea styling would
	// overwhelm this tiny overlay.
	renameOpen   bool
	renameDraft  string
	renameCursor int

	// Session action menu. Opened from a rendered session row's
	// secondary-click target, or with `m` from sidebar focus. It uses
	// the shared selectable-list modal so row-local actions follow the
	// same sizing, button, wheel, and click semantics as the larger
	// catalogs.
	sessionActionsOpen bool
	sessionActionsSel  int

	// Context action menu. Mirrors sessionActions for rendered context
	// rows so file metadata/detail/copy/remove actions share the same
	// selectable modal primitives instead of growing sidebar-specific
	// coordinate branches.
	contextActionsOpen bool
	contextActionsSel  int

	// Conversation action menu. Opened from rendered transcript part
	// secondary-click targets, or `m` in body focus. Keeps transcript
	// row actions on the same shared selectable-list modal primitive
	// as sidebar row-local actions.
	conversationActionsOpen bool
	conversationActionsSel  int

	// Ask-user and retry-note modals. These use separate draft buffers so
	// answering an agent question or retrying with notes never mutates the
	// normal composer draft.
	askUserOpen      bool
	askUserQuestion  gact.AgentQuestion
	askUserDraft     string
	askUserCursor    int
	askUserChoice    int
	retryNotesOpen   bool
	retryMessageID   string
	retryNotesDraft  string
	retryNotesCursor int
	retryModelOpen   bool
	retryModelMsgID  string
	retryModelDraft  string
	retryModelCursor int

	// Context-file add modal — same shape as rename, different
	// purpose. Opened by `o` in sidebar focus. Enter POSTs to
	// /v1/sessions/{id}/context/files; Esc cancels.
	contextAddOpen   bool
	contextAddDraft  string
	contextAddCursor int
	contextAddMode   string

	nextTurnAgentID    string
	nextTurnAgentTitle string

	promptEditOpen    bool
	promptEditID      string
	promptEditProfile string
	promptEditDraft   string
	promptEditCursor  int
	promptEditTitle   string

	agentWriteOpen     bool
	agentWriteMode     string
	agentWriteSourceID string
	agentWriteDraft    string
	agentWriteCursor   int
	agentEditOpen      bool
	agentEditOriginal  string
	agentEditDraft     gact.AgentDef
	agentEditField     int
	agentEditCursor    int
	agentEditErr       string
	agentEditSaving    bool

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

	// showChildSessions expands materialized child/nanoagent sessions
	// in the sidebar. Default is collapsed so benchmark runs with many
	// child sessions keep top-level conversations scannable.
	showChildSessions bool

	// Sidebar sections are independently collapsible so the left pane can grow
	// without becoming a hard-coded sessions/context layout.
	sidebarSessionsCollapsed bool
	sidebarFilesCollapsed    bool
	sidebarContextCollapsed  bool
	sidebarSectionFocus      sidebarSection
	sidebarSectionCursor     bool
	sidebarModuleIDs         []sidebarModuleID
	rightSidebarModuleIDs    []sidebarModuleID
	sidebarLayoutConfigured  bool
	sidebarLayoutGrabbed     bool
	sidebarHitOffsetX        int
	sidebarHitFocus          FocusZone
	bodyHitOffsetX           int

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
	app := &App{
		BackendURL:            backendURL,
		Theme:                 theme,
		localizer:             newLocalizer(os.Getenv("GACT_LOCALE")),
		c:                     client.New(backendURL),
		stage:                 StageConnecting,
		focus:                 FocusInput,
		MouseEnabled:          true,
		selected:              -1,
		stickyToBottom:        true,
		input:                 ta,
		inputHistoryBySession: map[string][]string{},
		historyCursor:         -1,
		bodySelMsgIdx:         -1,
		bodySelPartIdx:        -1,
		previouslyDetached:    map[string]bool{},
	}
	app.initFileViewerFromCwd()
	app.refreshLocalizedPlaceholders()
	return app
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

// SetInitialWorkspace selects the workspace to use on startup. The selector is
// resolved after /v1/workspaces is loaded and may be a workspace id, exact
// workspace name, or exact root path.
func (a *App) SetInitialWorkspace(selector string) {
	a.InitialWorkspaceSelector = strings.TrimSpace(selector)
}

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
	return a.connectCmd()
}

func (a *App) connectCmd() tea.Cmd {
	return connectCmd(a.c, a.connectWorkspaceSelector())
}

func (a *App) connectWorkspaceSelector() string {
	selector := strings.TrimSpace(a.wsID)
	if selector == "" {
		selector = a.InitialWorkspaceSelector
	}
	return strings.TrimSpace(selector)
}

func connectCmd(c *client.Client, workspaceSelector string) tea.Cmd {
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
			wsID, err = selectStartupWorkspaceID(wss, workspaceSelector)
			if err != nil {
				return errMsg{err: err, stage: "workspaces"}
			}
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
		commands, _ := c.ListCommandsScoped(ctx, client.CommandFilter{
			RuntimeScope: client.RuntimeScope{WorkspaceID: wsID},
		})
		return connectedMsg{caps: caps, wss: wss, wsID: wsID, sessions: sessions, commands: commands}
	}
}

func selectStartupWorkspaceID(workspaces []gact.Workspace, selector string) (string, error) {
	if len(workspaces) == 0 {
		return "", nil
	}
	selector = strings.TrimSpace(selector)
	if selector == "" {
		return workspaces[0].ID, nil
	}
	for _, ws := range workspaces {
		if ws.ID == selector {
			return ws.ID, nil
		}
	}
	if id, err := selectWorkspaceByField(workspaces, selector, func(ws gact.Workspace) string {
		return ws.Name
	}, "name"); id != "" || err != nil {
		return id, err
	}
	if id, err := selectWorkspaceByField(workspaces, selector, func(ws gact.Workspace) string {
		return filepath.Clean(ws.RootPath)
	}, "root"); id != "" || err != nil {
		return id, err
	}
	return "", fmt.Errorf("workspace %q not found", selector)
}

func selectWorkspaceByField(
	workspaces []gact.Workspace,
	selector string,
	field func(gact.Workspace) string,
	fieldName string,
) (string, error) {
	selector = filepath.Clean(strings.TrimSpace(selector))
	var matches []gact.Workspace
	for _, ws := range workspaces {
		value := strings.TrimSpace(field(ws))
		if value == "" {
			continue
		}
		if value == selector {
			matches = append(matches, ws)
		}
	}
	switch len(matches) {
	case 0:
		return "", nil
	case 1:
		return matches[0].ID, nil
	default:
		return "", fmt.Errorf("workspace %s %q is ambiguous; use workspace id", fieldName, selector)
	}
}

// CLIO-BBBBBBBBBB4: memoryStatsCmd fetches GET /v1/memory/stats.
// sessionID is optional (pass "" for global-only). Errors land as a
// transient hint rather than blowing up — stats are decorative.
func memoryStatsCmd(c *client.Client, sessionID string) tea.Cmd {
	return memoryStatsScopedCmd(c, client.RuntimeScope{SessionID: sessionID})
}

func memoryStatsScopedCmd(c *client.Client, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		stats, err := c.MemoryStatsScoped(ctx, scope)
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
			normalizeMessagePresentation(&m)
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

func loadContextFileContentCmd(c *client.Client, sessionID, path string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		content, err := c.ContextFileContent(ctx, sessionID, path)
		return contextFileContentLoadedMsg{sessionID: sessionID, path: path, content: content, err: err}
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

func loadCommandsCmd(c *client.Client, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		commands, err := c.ListCommandsScoped(ctx, client.CommandFilter{RuntimeScope: scope})
		return commandsLoadedMsg{sessionID: scope.SessionID, workspaceID: scope.WorkspaceID, commands: commands, err: err}
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
			if errors.Is(err, context.Canceled) {
				return sseOpenCanceledMsg{sessionID: sessionID}
			}
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

type sseOpenCanceledMsg struct {
	sessionID string
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
	return postMessageWithMentionsAndAgentCmd(c, sessionID, text, text, nil, "")
}

func postMessageWithMentionsCmd(c *client.Client, sessionID, draftText, text string, mentions []composerFileMention) tea.Cmd {
	return postMessageWithMentionsAndAgentCmd(c, sessionID, draftText, text, mentions, "")
}

func postMessageWithMentionsAndAgentCmd(c *client.Client, sessionID, draftText, text string, mentions []composerFileMention, agentID string) tea.Cmd {
	return func() tea.Msg {
		// Real LLM turns can easily run 10s+ (Haiku via a proxy is
		// ~5-15s; Sonnet via a ReAct loop can be minutes). 120s gives
		// the TUI enough patience without hanging forever on a wedged
		// backend — SSE is the source of truth for in-flight
		// progress anyway.
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()
		mentionCopy := cloneComposerFileMentions(mentions)
		seen := map[string]bool{}
		attached := make([]gact.ContextFile, 0, len(mentionCopy))
		for _, mention := range mentionCopy {
			path := strings.TrimSpace(mention.Path)
			if path == "" || seen[path] {
				continue
			}
			seen[path] = true
			mode := mention.Mode
			if mode == "" {
				mode = "read"
			}
			cf, err := c.AddContextFile(ctx, sessionID, path, mode)
			if err != nil {
				return postFailedMsg{
					text:     draftText,
					mentions: mentionCopy,
					err:      fmt.Errorf("attach %s: %w", path, err),
				}
			}
			attached = append(attached, cf)
		}
		text = sanitizeSelectedFileMentions(text, mentionCopy)
		_, err := c.PostMessage(ctx, sessionID, client.PostMessageRequest{
			Parts:   []gact.Part{gact.NewTextPart(text)},
			AgentID: agentID,
		})
		if err != nil {
			return postFailedMsg{text: draftText, mentions: mentionCopy, err: err}
		}
		return msgPostedAck{sessionID: sessionID, text: text, contextFiles: attached}
	}
}

func (a *App) setNextTurnAgent(agentID, title string) {
	a.nextTurnAgentID = strings.TrimSpace(agentID)
	a.nextTurnAgentTitle = strings.TrimSpace(title)
	label := firstNonEmpty(a.nextTurnAgentTitle, a.nextTurnAgentID)
	a.transientHint = "next turn agent: " + label
	a.focus = FocusInput
}

// postFailedMsg is the sole signal that PostMessage failed. Lets the
// Update handler restore the user's text into the textarea so a
// transient network blip doesn't cost them their message.
type postFailedMsg struct {
	text     string
	mentions []composerFileMention
	err      error
}

func (a *App) postFailureHint(err error) string {
	if err == nil {
		return a.localizer.t(msgPostFailureRetry, nil)
	}
	var backendErr *client.Error
	if errors.As(err, &backendErr) && backendErr.Code == "agent_not_available" {
		switch stringDetail(backendErr.Details, "agent_status") {
		case "starting":
			return a.localizer.t(msgPostFailureAgentStarting, nil)
		case "failed":
			return a.localizer.t(msgPostFailureAgentFailed, nil)
		case "not_configured":
			return a.localizer.t(msgPostFailureAgentNotConfigured, nil)
		default:
			return a.localizer.t(msgPostFailureAgentUnknown, nil)
		}
	}
	return a.localizer.t(msgPostFailureRetryWithError, map[string]string{"error": err.Error()})
}

func stringDetail(details map[string]any, key string) string {
	if details == nil {
		return ""
	}
	value, ok := details[key]
	if !ok {
		return ""
	}
	text, _ := value.(string)
	return text
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

	case tea.MouseWheelMsg:
		return a.handleMouseWheel(m)
	case tea.MouseClickMsg:
		return a.handleMouseClick(m)

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
		a.pasteBuffer = ""
		// Don't forward to textarea — PasteStartMsg is a state signal,
		// not content. The textarea handles content via PasteMsg.
		return a, nil
	case tea.PasteEndMsg:
		a.compactBufferedPaste()
		a.inPaste = false
		a.pasteBuffer = ""
		return a, nil
	case tea.PasteMsg:
		m.Content = normalizePasteNewlines(m.Content)
		if a.lmConfigOpen && a.lmConfig != nil {
			return a, a.handleLMConfigPaste(m.Content)
		}
		if a.renameOpen {
			a.insertRenameText(compactSingleLinePaste(m.Content))
			return a, nil
		}
		if a.contextAddOpen {
			a.insertContextAddText(compactTokenPaste(m.Content))
			return a, nil
		}
		if a.promptEditOpen {
			a.insertPromptEditText(compactSingleLinePaste(m.Content))
			return a, nil
		}
		if a.agentWriteOpen {
			a.insertAgentWriteText(compactSingleLinePaste(m.Content))
			return a, nil
		}
		if a.agentEditOpen {
			a.insertAgentEditText(m.Content)
			return a, nil
		}
		if a.agentBlueprintManageOpen {
			a.insertAgentBlueprintManageText(compactPathLikePaste(m.Content))
			return a, nil
		}
		if a.workspaceSwitchOpen && a.workspaceCreateOpen {
			a.insertWorkspaceCreateText(compactSingleLinePaste(m.Content))
			return a, nil
		}
		if a.mcpInstallOpen {
			a.insertMcpInstallText(compactSingleLinePaste(m.Content))
			return a, nil
		}
		if a.askUserOpen {
			a.insertAskUserText(compactSingleLinePaste(m.Content))
			return a, nil
		}
		if a.retryNotesOpen {
			a.insertRetryNotesText(compactSingleLinePaste(m.Content))
			return a, nil
		}
		if a.retryModelOpen {
			a.insertRetryModelText(compactTokenPaste(m.Content))
			return a, nil
		}
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
		a.syncFileViewerRootToWorkspace()
		a.sessions = m.sessions
		a.sortSessionsByActivity()
		a.commands = m.commands
		// Bootstrap the spinner tick loop. The handler gates
		// rescheduling on anySessionRunning(), so this fires exactly
		// once per connect even if nothing is currently active.
		cmds := []tea.Cmd{spinnerCmd()}
		// CLIO-BBBBBBBBBB4 (v0.2 §6.19): if the backend advertises
		// memory, pull an initial snapshot so the footer chip paints
		// right away. Session-scoped refresh happens on status_changed.
		if a.caps.Capabilities.Memory {
			cmds = append(cmds, memoryStatsScopedCmd(a.c, client.RuntimeScope{WorkspaceID: a.wsID}))
		}
		cmds = append(cmds, loadAgentHierarchyCmd(a.c, a.runtimeScope()))
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

	case commandsLoadedMsg:
		if m.err != nil {
			return a, nil
		}
		if m.sessionID != "" && m.sessionID != a.currentSessionID() {
			return a, nil
		}
		if m.workspaceID != "" && m.workspaceID != a.wsID {
			return a, nil
		}
		a.commands = m.commands
		return a, nil

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
		if m.err != nil {
			if a.lmConfigOpen {
				a.lmConfigOpen = false
				a.lmConfig = nil
				a.settingsOpen = true
				if a.settings == nil {
					a.settings = &settingsState{}
				}
				a.settings.tab = 0
				a.settings.loadErr = "provider config unavailable: " + m.err.Error()
			}
			return a, nil
		}
		if m.info == nil {
			if a.lmConfigOpen {
				a.lmConfigOpen = false
				a.lmConfig = nil
				a.settingsOpen = true
				if a.settings == nil {
					a.settings = &settingsState{}
				}
				a.settings.tab = 0
				a.settings.loadErr = "this backend does not support runtime LM provider config (/v1/providers/lm)"
			}
			return a, nil
		}
		previousProviderState := ""
		if a.lmProviderInfo != nil {
			previousProviderState = strings.TrimSpace(a.lmProviderInfo.State)
		}
		// Cache for the header chip (#363) so renderHeader can show the
		// active model without poking lmConfig (which is only populated
		// when the modal is open).
		a.lmProviderInfo = m.info
		if !a.lmConfigOpen && previousProviderState == "configuring" {
			switch m.info.State {
			case "ready":
				if m.info.Configured {
					a.clearLocalSessionModelRefs()
					a.transientHint = "LM configured: " +
						m.info.Provider + "/" + m.info.Model
					a.appendModelSwapMarker(m.info)
					cmds := []tea.Cmd{scheduleHintExpire(a.transientHint)}
					if a.wsID != "" {
						cmds = append(cmds, reloadSessionsCmd(a.c, a.wsID))
					}
					return a, tea.Batch(cmds...)
				}
			case "error":
				msg := strings.TrimSpace(m.info.StatusMessage)
				if msg == "" {
					msg = strings.TrimSpace(m.info.Error)
				}
				if msg == "" {
					msg = "LM provider configuration failed"
				}
				a.transientHint = msg
				return a, scheduleHintExpire(a.transientHint)
			case "configuring":
				return a, lmConfigPollCmd(a.c)
			}
		}
		if a.lmConfigOpen {
			// Modal was opened by the user (Settings → Change provider…)
			// or already showing — populate with the freshly-fetched info.
			if a.lmConfig == nil {
				a.lmConfig = &lmConfigState{}
			}
			a.lmConfig.info = m.info
			if a.lmConfig.saving {
				switch m.info.State {
				case "ready":
					if m.info.Configured {
						a.lmConfig.saving = false
						a.clearLocalSessionModelRefs()
						a.lmConfigOpen = false
						a.lmConfig = nil
						a.transientHint = "LM configured: " +
							m.info.Provider + "/" + m.info.Model
						a.appendModelSwapMarker(m.info)
						cmds := []tea.Cmd{scheduleHintExpire(a.transientHint)}
						if a.wsID != "" {
							cmds = append(cmds, reloadSessionsCmd(a.c, a.wsID))
						}
						return a, tea.Batch(cmds...)
					}
				case "error":
					a.lmConfig.saving = false
					msg := strings.TrimSpace(m.info.StatusMessage)
					if msg == "" {
						msg = strings.TrimSpace(m.info.Error)
					}
					if msg == "" {
						msg = "LM provider configuration failed"
					}
					a.lmConfig.err = errors.New(msg)
					return a, nil
				case "configuring":
					return a, lmConfigPollCmd(a.c)
				}
			}
			a.lmConfigSelectDefaultPreset()
			cmds := []tea.Cmd{}
			if cmd := a.lmConfigSyncFromPreset(); cmd != nil {
				cmds = append(cmds, cmd)
			}
			cmds = append(cmds, a.lmConfigBackgroundProbeCmds()...)
			return a, tea.Batch(cmds...)
		}
		if !m.info.Configured {
			a.lmConfigOpen = true
			a.lmConfig = &lmConfigState{info: m.info}
			a.lmConfigSelectDefaultPreset()
			cmds := []tea.Cmd{}
			if cmd := a.lmConfigSyncFromPreset(); cmd != nil {
				cmds = append(cmds, cmd)
			}
			cmds = append(cmds, a.lmConfigBackgroundProbeCmds()...)
			return a, tea.Batch(cmds...)
		}
		return a, nil

	case lmConfigModelsLoadedMsg:
		// Cache catalog for current provider kind. If still on the
		// matching preset and not typing custom, snap modelIndex to
		// suggested model.
		if a.lmConfig == nil {
			return a, nil
		}
		if a.lmConfig.modelCatalogs == nil {
			a.lmConfig.modelCatalogs = map[string][]gact.Model{}
		}
		if a.lmConfig.modelCatalogWarnings == nil {
			a.lmConfig.modelCatalogWarnings = map[string]string{}
		}
		if a.lmConfig.modelCatalogSources == nil {
			a.lmConfig.modelCatalogSources = map[string]string{}
		}
		if a.lmConfig.modelCatalogPending == nil {
			a.lmConfig.modelCatalogPending = map[string]bool{}
		}
		if a.lmConfig.modelCatalogRetries == nil {
			a.lmConfig.modelCatalogRetries = map[string]int{}
		}
		delete(a.lmConfig.modelCatalogPending, m.presetID)
		preferredModel := ""
		if len(m.models) > 0 {
			preferredModel = strings.TrimSpace(m.models[0].ID)
		}
		if m.err == nil && m.warning == "" {
			a.lmConfig.modelCatalogs[m.presetID] = lmConfigSortModels(m.models)
			a.lmConfig.modelCatalogRetries[m.presetID] = 0
		} else {
			a.lmConfig.modelCatalogs[m.presetID] = nil
		}
		a.lmConfig.modelCatalogSources[m.presetID] = m.source
		// Stash the backend's fallback reason (or transport error) so
		// the picker can render an actionable banner. Empty string
		// when the catalog came back live.
		switch {
		case m.err != nil:
			a.lmConfig.modelCatalogWarnings[m.presetID] =
				"transport error: " + m.err.Error()
		case m.warning != "":
			a.lmConfig.modelCatalogWarnings[m.presetID] = m.warning
		default:
			a.lmConfig.modelCatalogWarnings[m.presetID] = ""
		}
		if a.lmConfigCurrentPresetID() == m.presetID && m.warning == "" && len(m.models) > 0 {
			if p := a.lmConfigCurrentPreset(); p != nil {
				if strings.TrimSpace(a.lmConfig.model) == "" &&
					strings.TrimSpace(p.SuggestedModel) == "" &&
					preferredModel != "" {
					a.lmConfig.model = preferredModel
				}
				a.lmConfigSnapModelToCatalog(*p)
			}
		}
		a.lmConfig.lmConfigEnsureVisibleField()
		if cmd := a.lmConfigMaybeRetryModelFetch(m.presetID); cmd != nil {
			return a, cmd
		}
		return a, nil

	case lmConfigAuthedMsg:
		if a.lmConfig == nil {
			return a, nil
		}
		a.lmConfig.authenticating = false
		if m.err != nil {
			a.lmConfig.authMessage = "auth failed: " + m.err.Error()
			return a, nil
		}
		if m.resp.IsAuthenticated {
			a.lmConfig.authMessage = "ALCF Globus token ready"
			if a.lmConfig.info != nil {
				for i := range a.lmConfig.info.Presets {
					if a.lmConfig.info.Presets[i].ID == m.providerID {
						a.lmConfig.info.Presets[i].Status = "ready"
						a.lmConfig.info.Presets[i].StatusMessage = "Globus token ready"
						a.lmConfig.info.Presets[i].IsAuthenticated = true
						break
					}
				}
			}
			delete(a.lmConfig.modelCatalogs, m.providerID)
			delete(a.lmConfig.modelCatalogWarnings, m.providerID)
			delete(a.lmConfig.modelCatalogSources, m.providerID)
			delete(a.lmConfig.modelCatalogPending, m.providerID)
			if p := a.lmConfigCurrentPreset(); p != nil && p.ID == m.providerID {
				a.lmConfig.lmConfigEnsureVisibleField()
				return a, a.lmConfigQueueModelFetch(*p, a.lmConfig.apiBase)
			}
			return a, nil
		}
		if m.resp.Instructions != "" {
			a.lmConfig.authMessage = m.resp.Instructions
		} else {
			a.lmConfig.authMessage = "ALCF auth did not complete"
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
		if m.info != nil && m.info.State == "configuring" {
			a.lmProviderInfo = m.info
			a.transientHint = "LM configuration in progress: " +
				m.info.Provider + "/" + m.info.Model
			a.lmConfigOpen = false
			a.lmConfig = nil
			return a, tea.Batch(
				scheduleHintExpire(a.transientHint),
				lmConfigPollCmd(a.c),
			)
		}
		if m.info != nil && m.info.State == "error" {
			msg := strings.TrimSpace(m.info.StatusMessage)
			if msg == "" {
				msg = strings.TrimSpace(m.info.Error)
			}
			if msg == "" {
				msg = "LM provider configuration failed"
			}
			a.lmConfig.err = errors.New(msg)
			return a, nil
		}
		// Success: the backend has already loaded/swapped the global
		// LM. Mirror that state locally now, before the next user send,
		// so stale per-session ModelRefs cannot leak into headers,
		// Settings, or a later PATCH flow.
		a.lmProviderInfo = m.info
		a.clearLocalSessionModelRefs()
		a.lmConfigOpen = false
		a.lmConfig = nil
		a.transientHint = "LM configured: " +
			m.info.Provider + "/" + m.info.Model
		a.appendModelSwapMarker(m.info)
		cmds := []tea.Cmd{scheduleHintExpire(a.transientHint)}
		if a.wsID != "" {
			cmds = append(cmds, reloadSessionsCmd(a.c, a.wsID))
		}
		return a, tea.Batch(cmds...)

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
			a.doctor.gaps = m.gaps
		}
		return a, nil

	case sessionSummarizedMsg:
		if m.err != nil {
			a.transientHint = "summary failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		if idx := a.sessionIndexByID(m.sessionID); idx >= 0 {
			a.sessions[idx] = m.session
			a.sortSessionsByActivity()
			if selected := a.sessionIndexByID(m.sessionID); selected >= 0 {
				a.selected = selected
			}
		}
		summary := strings.TrimSpace(m.session.Summary)
		if summary == "" {
			a.transientHint = "summary completed"
		} else {
			a.transientHint = "summary: " + truncate(strings.Join(strings.Fields(summary), " "), 120)
		}
		return a, tea.Batch(scheduleHintExpire(a.transientHint), reloadSessionsCmd(a.c, a.wsID))

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
		if m.stage == "command" {
			a.transientHint = fmt.Sprintf("command failed: %v", m.err)
			return a, scheduleHintExpire(a.transientHint)
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
		return a, a.connectCmd()

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
			a.clampContextFileSelection()
		}
		return a, nil

	case contextFileContentLoadedMsg:
		if a.currentSessionID() != m.sessionID {
			return a, nil
		}
		if !a.detailViewOpen || a.detailView == nil || a.detailView.messageID != "context" || a.detailView.partID != m.path {
			return a, nil
		}
		cf, ok := a.contextFileByPath(m.path)
		if !ok {
			return a, nil
		}
		a.detailView.fullText = strings.Join(a.contextFileDetailRowsWithContent(cf, m.content, m.err), "\n")
		a.detailScroll = 0
		return a, nil

	case postFailedMsg:
		// Transient failure (dial error, backend restart, upstream 5xx).
		// Don't blow away the UI; restore the text so the user can
		// just press Enter again once the backend is back. Surface a
		// transient hint so they know what happened.
		a.input.SetValue(m.text)
		a.fileMentions = cloneComposerFileMentions(m.mentions)
		a.transientHint = a.postFailureHint(m.err)
		return a, nil

	case agentQuestionAnsweredMsg:
		if m.err != nil {
			a.transientHint = "answer failed: " + m.err.Error()
			return a, nil
		}
		a.transientHint = "answer submitted"
		if m.sessionID != "" {
			return a, loadMessagesCmd(a.c, m.sessionID)
		}
		return a, nil

	case retryTurnStartedMsg:
		if m.err != nil {
			a.transientHint = "retry failed: " + m.err.Error()
			return a, nil
		}
		label := shortID(m.attempt.ID)
		if label == "" {
			label = "retry"
		}
		a.transientHint = "retry attempt queued: " + label
		if m.sessionID != "" {
			return a, loadMessagesCmd(a.c, m.sessionID)
		}
		return a, nil

	case msgPostedAck:
		// User message is in the store; the SSE stream will reflect it via
		// the message.created event the server publishes.
		if a.currentSessionID() == m.sessionID && len(m.contextFiles) > 0 {
			a.mergeContextFiles(m.contextFiles)
		}
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
			a.mergeContextFiles([]gact.ContextFile{m.file})
		}
		a.transientHint = "added " + m.file.Path + " to context"
		return a, nil

	case contextFileUploadedMsg:
		if m.err != nil {
			a.transientHint = "upload failed: " + m.err.Error()
			return a, nil
		}
		if a.currentSessionID() == m.sessionID {
			a.mergeContextFiles([]gact.ContextFile{m.file})
		}
		label := firstNonEmpty(m.file.Path, filepath.Base(m.localPath))
		a.transientHint = "uploaded " + label + " to context"
		return a, nil

	case contextFileRemovedMsg:
		if m.err != nil {
			a.transientHint = "remove failed: " + m.err.Error()
			return a, nil
		}
		if a.currentSessionID() == m.sessionID {
			filtered := a.contextFiles[:0]
			for _, cf := range a.contextFiles {
				if cf.Path != m.path {
					filtered = append(filtered, cf)
				}
			}
			a.contextFiles = filtered
			a.clampContextFileSelection()
			if a.detailViewOpen && a.detailView != nil && a.detailView.messageID == "context" && a.detailView.partID == m.path {
				a.closeDetailView()
			}
		}
		a.transientHint = "removed " + m.path + " from context"
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

	case sseOpenCanceledMsg:
		// Expected during fast session/model/provider transitions: opening
		// an old SSE stream can lose the race to the next selection and get
		// cancelled before response headers arrive. Do not show that as a
		// connection error; the newer stream/reconnect path owns recovery.
		return a, nil

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
			cmds = append(cmds, memoryStatsScopedCmd(a.c, a.runtimeScope()))
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
		a.sortSessionsByActivity()
		a.selected = a.sessionIndexByID(m.session.ID)
		if a.selected < 0 {
			a.selected = 0
		}
		return a, a.selectSession(a.selected)

	case filePickerLoadedMsg:
		if a.filePicker == nil {
			return a, nil
		}
		a.filePicker.loaded = true
		if m.err != nil {
			a.filePicker.entries = nil
			a.filePicker.errText = m.err.Error()
			return a, nil
		}
		a.filePicker.entries = m.entries
		a.filePicker.errText = ""
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
		if m.kind == catalogKindAgentDetail && m.mcpServerID != a.catalogBrowser.agentID {
			return a, nil
		}
		if m.kind == catalogKindPromptDetail && m.promptID != a.catalogBrowser.promptID {
			return a, nil
		}
		if m.kind == catalogKindExpertPackDetail && m.expertPackID != a.catalogBrowser.expertPackID {
			return a, nil
		}
		if m.kind == catalogKindAgentBlueprintDetail && m.blueprintID != a.catalogBrowser.blueprintID {
			return a, nil
		}
		a.catalogBrowser.loading = false
		a.catalogBrowser.items = a.applyCapabilityGatesToCatalogItems(m.kind, m.items)
		a.catalogBrowser.errText = m.errText
		if a.catalogBrowser.sel >= len(a.catalogBrowser.items) {
			a.catalogBrowser.sel = 0
		}
		a.catalogBrowser.offset = catalogBrowserClampOffsetForKind(
			a.catalogBrowser.kind,
			a.catalogBrowser.sel,
			a.catalogBrowser.offset,
			len(a.catalogBrowser.items),
		)
		return a, nil

	case catalogDetailLoadedMsg:
		if !m.standalone && !a.catalogBrowserOpen {
			return a, nil
		}
		text := m.text
		if m.err != nil {
			text = "error: " + m.err.Error()
		}
		if strings.TrimSpace(text) == "" {
			text = "(no detail returned)"
		}
		a.openCatalogDetail(m.title, text)
		return a, nil

	case expertPackActivatedMsg:
		if m.err != nil {
			a.transientHint = "expert pack activation failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = "activated expert pack " + m.packID
		var cmds []tea.Cmd
		cmds = append(cmds, scheduleHintExpire(a.transientHint))
		if m.state.Session != nil {
			for i, s := range a.sessions {
				if s.ID == m.state.Session.ID {
					a.sessions[i] = *m.state.Session
					break
				}
			}
		}
		if a.catalogBrowserOpen && a.catalogBrowser != nil && a.catalogBrowser.kind == catalogKindExpertPackDetail {
			cmds = append(cmds, loadExpertPackDetailCmd(a.c, a.runtimeScope(), m.packID))
		}
		return a, tea.Batch(cmds...)

	case promptSavedMsg:
		if m.err != nil {
			a.transientHint = "prompt save failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = "saved prompt profile " + m.profile
		var cmd tea.Cmd
		if a.catalogBrowserOpen && a.catalogBrowser != nil && a.catalogBrowser.kind == catalogKindPromptDetail && a.catalogBrowser.promptID == m.promptID {
			cmd = loadPromptDetailCmd(a.c, m.promptID, a.runtimeScope())
		}
		return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)

	case agentBlueprintActivatedMsg:
		if m.err != nil {
			a.transientHint = "agent blueprint activation failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = "activated agent blueprint " + m.blueprintID
		if m.state.Session != nil {
			if idx := a.sessionIndexByID(m.state.Session.ID); idx >= 0 {
				a.sessions[idx] = *m.state.Session
			}
		} else {
			a.applySessionAgentBlueprintState(m.state)
		}
		var cmd tea.Cmd
		if a.catalogBrowserOpen && a.catalogBrowser != nil && a.catalogBrowser.kind == catalogKindAgentBlueprintDetail && a.catalogBrowser.blueprintID == m.blueprintID {
			cmd = loadAgentBlueprintDetailCmd(a.c, a.runtimeScope(), m.blueprintID)
		}
		return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)

	case agentBlueprintMCPEnabledMsg:
		if m.err != nil {
			a.transientHint = "agent blueprint MCP enable failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = "enabled blueprint MCP " + m.descriptorID
		var cmd tea.Cmd
		if a.catalogBrowserOpen && a.catalogBrowser != nil && a.catalogBrowser.kind == catalogKindAgentBlueprintDetail && a.catalogBrowser.blueprintID == m.blueprintID {
			cmd = loadAgentBlueprintDetailCmd(a.c, a.runtimeScope(), m.blueprintID)
		}
		return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)

	case agentBlueprintHookEnabledMsg:
		if m.err != nil {
			a.transientHint = "agent blueprint hook enable failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = "enabled blueprint hook " + m.hookID
		var cmd tea.Cmd
		if a.catalogBrowserOpen && a.catalogBrowser != nil && a.catalogBrowser.kind == catalogKindAgentBlueprintDetail && a.catalogBrowser.blueprintID == m.blueprintID {
			cmd = loadAgentBlueprintDetailCmd(a.c, a.runtimeScope(), m.blueprintID)
		}
		return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)

	case agentBlueprintManagedMsg:
		if m.err != nil {
			a.transientHint = "agent blueprint " + m.action + " failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = "agent blueprint " + m.action + ": " + m.blueprintID
		var cmd tea.Cmd
		if a.catalogBrowserOpen && a.catalogBrowser != nil {
			switch a.catalogBrowser.kind {
			case catalogKindAgentBlueprints:
				cmd = loadCatalogBrowserCmd(a.c, catalogKindAgentBlueprints, a.runtimeScope())
			case catalogKindAgentBlueprintDetail:
				cmd = loadAgentBlueprintDetailCmd(a.c, a.runtimeScope(), m.blueprintID)
			}
		}
		return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)

	case promptEditLoadedMsg:
		if m.err != nil {
			a.transientHint = "prompt edit failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.openPromptEdit(m.prompt.ID, m.prompt.Profile, m.prompt.Title, m.prompt.Text)
		return a, nil

	case agentWriteDoneMsg:
		if m.err != nil {
			a.transientHint = "agent write failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = agentWriteHint(m.mode, m.agent)
		var cmd tea.Cmd
		if a.catalogBrowserOpen && a.catalogBrowser != nil {
			switch a.catalogBrowser.kind {
			case catalogKindAgents:
				cmd = loadCatalogBrowserCmd(a.c, catalogKindAgents, a.runtimeScope())
			case catalogKindAgentDetail:
				cmd = a.openAgentDetail(m.agent.ID, firstNonEmpty(m.agent.Title, m.agent.ID))
			}
		}
		return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)

	case agentLoadedForEditMsg:
		if m.err != nil {
			a.transientHint = "agent edit failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		if m.agent.Source != "user" {
			a.transientHint = "only user-owned agents can be edited"
			return a, scheduleHintExpire(a.transientHint)
		}
		a.openAgentEdit(m.agent)
		return a, nil

	case agentEditedMsg:
		a.agentEditSaving = false
		if m.err != nil {
			a.agentEditErr = m.err.Error()
			return a, nil
		}
		agentID := firstNonEmpty(m.agent.ID, a.agentEditOriginal)
		a.closeAgentEdit()
		a.transientHint = "updated agent " + agentID
		var cmd tea.Cmd
		if a.catalogBrowserOpen && a.catalogBrowser != nil {
			switch a.catalogBrowser.kind {
			case catalogKindAgents:
				cmd = loadCatalogBrowserCmd(a.c, catalogKindAgents, a.runtimeScope())
			case catalogKindAgentDetail:
				cmd = loadAgentDetailCmd(a.c, agentID, a.runtimeScope())
			}
		}
		return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)

	case agentDeletedMsg:
		if m.err != nil {
			a.transientHint = "agent delete failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = "deleted agent " + m.agentID
		var cmd tea.Cmd
		if a.catalogBrowserOpen && a.catalogBrowser != nil && a.catalogBrowser.kind == catalogKindAgents {
			cmd = loadCatalogBrowserCmd(a.c, catalogKindAgents, a.runtimeScope())
		}
		return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)

	case agentBlueprintManageDoneMsg:
		a.agentBlueprintManageSaving = false
		if m.err != nil {
			a.agentBlueprintManageErr = m.err.Error()
			return a, nil
		}
		a.closeAgentBlueprintManage()
		if m.action == agentBlueprintManageValidate {
			a.transientHint = "agent blueprint validated: " + m.source
			a.openCatalogDetail("Agent blueprint validation", formatAgentBlueprintValidation(m.check))
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = "agent blueprint installed: " + m.source
		var cmd tea.Cmd
		if a.catalogBrowserOpen && a.catalogBrowser != nil && a.catalogBrowser.kind == catalogKindAgentBlueprints {
			cmd = loadCatalogBrowserCmd(a.c, catalogKindAgentBlueprints, a.runtimeScope())
		}
		return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)

	case sessionRewindDoneMsg:
		if m.err != nil {
			a.transientHint = "rewind failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = fmt.Sprintf("rewound %d message(s)", len(m.deleted))
		return a, tea.Batch(scheduleHintExpire(a.transientHint), loadMessagesCmd(a.c, m.sessionID))

	case sessionUndoDoneMsg:
		if m.err != nil {
			a.transientHint = "undo failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = fmt.Sprintf("undid %d message(s)", len(m.reverted))
		return a, tea.Batch(scheduleHintExpire(a.transientHint), loadMessagesCmd(a.c, m.sessionID))

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
		a.mcpInstallCursor = 0
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

	case mcpReconnectDoneMsg:
		if m.err != nil {
			a.transientHint = "mcp reconnect failed: " + m.err.Error()
			return a, scheduleHintExpire(a.transientHint)
		}
		a.transientHint = "reconnected MCP " + m.serverID
		cmds := []tea.Cmd{scheduleHintExpire(a.transientHint), mcpListServersCmd(a.c)}
		if a.catalogBrowserOpen && a.catalogBrowser != nil &&
			a.catalogBrowser.kind == catalogKindMcpDetail &&
			a.catalogBrowser.mcpServerID == m.serverID {
			cmds = append(cmds, loadMcpDetailCmd(a.c, a.runtimeScope(), m.serverID))
		}
		return a, tea.Batch(cmds...)

	case settingsLoadedMsg:
		if a.settings == nil {
			a.settings = &settingsState{}
		}
		a.settings.agentList = selectableSessionAgents(m.agents)
		a.settings.loadErr = m.loadErr
		// Pre-select current agent if present. Model selection lives in
		// the lifecycle LM-config modal, not here — Tab 0 just shows
		// the active model and a "Change provider…" entry point.
		if a.selected >= 0 && a.selected < len(a.sessions) {
			cur := a.sessions[a.selected]
			for i, ag := range a.settings.agentList {
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
		if m.agentID != "" {
			a.transientHint = "agent: " + m.agentID
			return a, scheduleHintExpire(a.transientHint)
		}
		// Close the Settings modal if it was driving the PATCH (the
		// shared LM-config widgets dispatch through here in session-
		// patch mode). Surface a transient hint so the user has a
		// confirmation cue without needing to re-open the modal.
		if a.settingsOpen && a.lmConfig != nil && a.lmConfig.sessionPatchMode {
			a.settingsOpen = false
			a.lmConfig.saving = false
			ref := m.session.Model
			if m.model != nil {
				ref = *m.model
			}
			if ref.ProviderID != "" {
				a.transientHint = "model: " + ref.ProviderID + "/" + ref.ModelID
				return a, scheduleHintExpire(a.transientHint)
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
		// Surface write_errors as a transient hint. Was previously
		// dropped silently — user pressed 'a' on a diff, backend
		// recorded a write_error (e.g. workspace-scope refusal), and
		// the user got no signal the write didn't happen.
		if len(m.writeErrors) > 0 {
			parts := make([]string, 0, len(m.writeErrors))
			for path, err := range m.writeErrors {
				parts = append(parts, fmt.Sprintf("%s: %s", path, err))
			}
			a.transientHint = "⚠ apply failed — " + strings.Join(parts, " · ")
			return a, scheduleHintExpire(a.transientHint)
		}
		if len(m.paths) > 0 {
			a.transientHint = fmt.Sprintf("applied %d file%s", len(m.paths), plural(len(m.paths)))
			return a, scheduleHintExpire(a.transientHint)
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
		a.sortSessionsByActivity()
		if len(a.sessions) == 0 {
			a.selected = -1
			a.messages = nil
			a.currentStatus = ""
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
			a.currentStatus = a.sessions[newIdx].Status
			// No need to reload messages — same session.
			return a, nil
		}
		// Prior session is gone. Keep the cursor on the same visual row
		// when possible, which selects the session below the removed one.
		// If the removed session was the last row, select the new last row.
		newIdx = a.selected
		if newIdx < 0 {
			newIdx = 0
		}
		if newIdx >= len(a.sessions) {
			newIdx = len(a.sessions) - 1
		}
		a.selected = newIdx
		return a, a.selectSession(newIdx)

	case workspaceSwitchedMsg:
		// Ignore stale responses — if the user switched again before
		// this one landed, a.wsID would no longer match.
		if m.wsID != a.wsID {
			return a, nil
		}
		a.sessions = m.sessions
		a.syncFileViewerRootToWorkspace()
		a.sortSessionsByActivity()
		if len(a.sessions) == 0 {
			a.selected = -1
			a.messages = nil
			return a, loadAgentHierarchyCmd(a.c, a.runtimeScope())
		}
		a.selected = 0
		return a, tea.Batch(a.selectSession(0), loadAgentHierarchyCmd(a.c, a.runtimeScope()))

	case workspaceCreatedMsg:
		a.workspaceCreateSaving = false
		if m.err != nil {
			a.workspaceCreateError = m.err.Error()
			a.workspaceCreateOpen = true
			a.workspaceSwitchOpen = true
			return a, nil
		}
		created := m.workspace
		found := false
		for i := range a.workspaces {
			if a.workspaces[i].ID == created.ID {
				a.workspaces[i] = created
				found = true
				break
			}
		}
		if !found {
			a.workspaces = append(a.workspaces, created)
		}
		a.closeWorkspaceSwitchModal()
		if a.sseCancel != nil {
			a.sseCancel()
			a.sseCancel = nil
		}
		a.wsID = created.ID
		a.sessions = nil
		a.selected = -1
		a.messages = nil
		a.contextFiles = nil
		a.pendingPermissions = nil
		a.syncFileViewerRootToWorkspace()
		a.transientHint = "created workspace " + workspaceLabel(created)
		return a, listSessionsCmd(a.c, created.ID)

	case agentHierarchyLoadedMsg:
		a.agentHierarchyAgents = m.agents
		a.agentHierarchyErr = m.err
		a.clampAgentHierarchySelection()
		return a, nil
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
		return a, a.connectCmd()
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
			return a, a.connectCmd()
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
	if a.sessionActionsOpen {
		return a.handleSessionActionsKey(k)
	}
	if a.contextActionsOpen {
		return a.handleContextActionsKey(k)
	}
	if a.conversationActionsOpen {
		return a.handleConversationActionsKey(k)
	}
	if a.askUserOpen {
		return a.handleAskUserKey(k)
	}
	if a.retryNotesOpen {
		return a.handleRetryNotesKey(k)
	}
	if a.retryModelOpen {
		return a.handleRetryModelKey(k)
	}
	if a.contextAddOpen {
		return a.handleContextAddKey(k)
	}
	if a.promptEditOpen {
		return a.handlePromptEditKey(k)
	}
	if a.agentWriteOpen {
		return a.handleAgentWriteKey(k)
	}
	if a.agentEditOpen {
		return a.handleAgentEditKey(k)
	}
	if a.agentBlueprintManageOpen {
		return a.handleAgentBlueprintManageKey(k)
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
	if a.sidebarLayoutOpen {
		return a.handleSidebarLayoutKey(k)
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
			a.helpScroll = 0
		case "left", "h":
			if a.helpTab > 0 {
				a.helpTab--
				a.helpScroll = 0
			}
		case "right", "l", "tab":
			if a.helpTab < helpTabCount-1 {
				a.helpTab++
				a.helpScroll = 0
			}
		case "up", "k":
			a.helpScroll--
		case "down", "j":
			a.helpScroll++
		case "pgup", "ctrl+u":
			a.helpScroll -= a.helpBodyPageSize()
		case "pgdown", "ctrl+d":
			a.helpScroll += a.helpBodyPageSize()
		case "g", "home":
			a.helpScroll = 0
		case "G", "end":
			a.helpScroll = 1 << 30
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
		a.openQuitConfirm()
		return a, nil
	case "?":
		// Open help when there's nothing to type into — covers both
		// "focus is sidebar/body" and the empty-input case so the
		// reflex "press ? to find out what this does" works from any
		// fresh state. Mirrors the same input-empty gate `/` uses to
		// open the palette. Once the user has typed anything, ? falls
		// through to the textarea so messages like "what does this do?"
		// still compose normally.
		if a.focus != FocusInput || a.input.Value() == "" {
			a.helpOpen = true
			a.helpScroll = 0
			return a, nil
		}
		// Fall through to focus dispatch so the textarea consumes it.
	case "tab", "ctrl+i":
		a.focusNextPane()
		return a, nil
	case "shift+tab":
		a.focusPane(-1)
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
		return a, a.connectCmd()
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
		// Tab 0 (Model) is now a thin "Change provider…" entry point —
		// the heavy lmConfig fetch only fires when the user actually
		// presses Enter on that row, not on every Ctrl+S.
		return a, a.openSettingsTab(0)
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
		a.openWorkspaceSwitch()
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
	case FocusSidebar, FocusRightSidebar:
		return a.handleSidebarKey(k)
	case FocusBody:
		return a.handleBodyKey(k)
	case FocusInput:
		return a.handleInputKey(k)
	}
	return a, nil
}

func (a *App) handleMouseWheel(m tea.MouseWheelMsg) (tea.Model, tea.Cmd) {
	if !a.MouseEnabled {
		return a, nil
	}
	mouse := m.Mouse()
	if a.mouseOverlayOpen() {
		if cmd, handled := a.activateOverlayWheelHitAt(mouse.X, mouse.Y, mouse.Button); handled {
			return a, cmd
		}
		if cmd, handled := a.handleOverlayMouseWheel(m); handled {
			return a, cmd
		}
		return a, nil
	}
	if cmd, handled := a.activateWheelHitAt(mouse.X, mouse.Y, mouse.Button); handled {
		return a, cmd
	}
	return a, nil
}

func (a *App) handleConversationWheel(button tea.MouseButton) tea.Cmd {
	if len(a.messages) == 0 {
		return nil
	}
	switch button {
	case tea.MouseWheelUp:
		a.scrollConversationLines(-3)
		if a.focus == FocusBody {
			a.stepPartCursorSelection(-1)
		}
	case tea.MouseWheelDown:
		a.scrollConversationLines(3)
		if a.focus == FocusBody {
			a.stepPartCursorSelection(+1)
		}
	}
	return nil
}

func (a *App) handleSidebarWheel(zone FocusZone, button tea.MouseButton) tea.Cmd {
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	if len(a.sessions) == 0 || a.sidebarSessionsCollapsed {
		a.focus = zone
		a.sidebarSectionCursor = true
		a.sidebarSectionFocus = sidebarSectionSessions
		return nil
	}
	delta := 0
	switch button {
	case tea.MouseWheelUp:
		delta = -1
	case tea.MouseWheelDown:
		delta = 1
	default:
		return nil
	}
	a.focus = zone
	a.sidebarSectionFocus = sidebarSectionSessions
	a.sidebarSectionCursor = false
	if a.stepSelectionVisible(delta) {
		return a.selectSession(a.selected)
	}
	return nil
}

func (a *App) scrollConversationLines(delta int) {
	if delta == 0 {
		return
	}
	a.pendingPartScroll = false
	if delta < 0 {
		a.scrollOffset += -delta
		a.stickyToBottom = false
		return
	}
	if a.scrollOffset <= delta {
		a.scrollOffset = 0
		a.stickyToBottom = true
		return
	}
	a.scrollOffset -= delta
	a.stickyToBottom = false
}

func (a *App) handleMouseClick(m tea.MouseClickMsg) (tea.Model, tea.Cmd) {
	if !a.MouseEnabled {
		return a, nil
	}
	mouse := m.Mouse()
	if a.mouseOverlayOpen() {
		if mouse.Button == tea.MouseLeft && a.mouseClickInsideTopOverlay(mouse) {
			if cmd, handled := a.activateOverlayHitAt(mouse.X, mouse.Y, mouse.Button); handled {
				return a, cmd
			}
		}
		if cmd, handled := a.handleOverlayMouseClick(m); handled {
			return a, cmd
		}
		return a, nil
	}
	if cmd, handled := a.activateHitAt(mouse.X, mouse.Y, mouse.Button); handled {
		return a, cmd
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

type permissionBannerAction struct {
	id     string
	label  string
	action gact.PermissionAction
	col    int
	width  int
}

func permissionBannerActions() []permissionBannerAction {
	return []permissionBannerAction{
		{id: "allow", label: "A:allow", action: gact.PermAllow},
		{id: "deny", label: "D:deny", action: gact.PermDeny},
		{id: "session", label: "S:session", action: gact.PermAllowSession},
		{id: "workspace", label: "W:workspace", action: gact.PermAllowWorkspace},
	}
}

func (a *App) renderPermissionBanner(summary string, contentWidth int) (string, []permissionBannerAction) {
	t := a.Theme
	if contentWidth < 1 {
		contentWidth = 1
	}
	actions := permissionBannerActions()
	actionLabels := make([]string, 0, len(actions))
	for _, action := range actions {
		actionLabels = append(actionLabels, action.label)
	}
	actionText := strings.Join(actionLabels, " ")
	separator := "  "
	message := a.localizer.t(msgConversationPermissionNeeded, map[string]string{"summary": summary})
	if before, _, ok := strings.Cut(message, " — "); ok {
		message = before
	}
	// Keep a small gutter because the conversation pane's outer fitting can
	// wrap styled banner text a few cells before the raw content width.
	messageWidth := contentWidth - 10 - lipgloss.Width(separator) - lipgloss.Width(actionText)
	if messageWidth < 0 {
		messageWidth = 0
	}
	message = truncate(message, messageWidth)
	col := lipgloss.Width(message + separator)
	for i := range actions {
		actions[i].col = col
		actions[i].width = lipgloss.Width(actions[i].label)
		col += actions[i].width + 1
	}
	rendered := message + separator
	for i, action := range actions {
		if i > 0 {
			rendered += " "
		}
		rendered += action.label
	}
	return lipgloss.NewStyle().
		Foreground(t.Bg).
		Background(t.Warning).
		Padding(0, 1).
		Bold(true).
		Render(rendered), actions
}

func (a *App) registerPermissionBannerHits(actions []permissionBannerAction, bodyWidth int) {
	if len(actions) == 0 || len(a.pendingPermissions) == 0 {
		return
	}
	permissionID := a.pendingPermissions[0].ID
	for _, action := range actions {
		a.registerPermissionBannerActionHit(action, bodyWidth, permissionID)
	}
}

func (a *App) permissionBannerActionRect(action permissionBannerAction, bodyWidth int) (mouseRect, bool) {
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	if action.width <= 0 || action.col >= contentW {
		return mouseRect{}, false
	}
	bodyX := a.bodyPaneOffsetX()
	label := action.label
	if label == "" {
		label = strings.Repeat("x", action.width)
	}
	line := strings.Repeat(" ", action.col) + label
	rect, ok := screenTextSpanRect(bodyX+3, 3, line, action.col, label)
	if !ok {
		return mouseRect{}, false
	}
	if rect.x+rect.w > bodyX+3+contentW {
		rect.w = bodyX + 3 + contentW - rect.x
	}
	if rect.w < 1 {
		return mouseRect{}, false
	}
	return rect, true
}

func (a *App) registerPermissionBannerActionHit(action permissionBannerAction, bodyWidth int, permissionID string) {
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	if action.width <= 0 || action.col >= contentW {
		return
	}
	actionCopy := action
	bodyX := a.bodyPaneOffsetX()
	line := strings.Repeat(" ", action.col) + action.label
	a.registerClippedScreenTextSpanHit("permission:"+action.id, bodyX+3, 3, line, action.col, action.label, bodyX+3+contentW, func(app *App) tea.Cmd {
		return respondPermissionCmd(app.c, permissionID, actionCopy.action)
	})
}

// handlePaletteKey is the slash-command palette key router.
func (a *App) handlePaletteKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	searchMode := a.isSearchMode()
	cmdMatches := a.paletteMatches()
	rowCount := len(cmdMatches)
	if searchMode {
		rowCount = len(a.searchMatches)
	}
	a.clampPaletteCursor()

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
			if cmd.Status != "" && cmd.Status != "available" {
				reason := firstNonEmpty(cmd.DisabledReason, cmd.Error, "command unavailable")
				a.transientHint = cmd.ID + ": " + reason
				return a, scheduleHintExpire(a.transientHint)
			}
			// /agents reuses Settings > Agent tab — the richer picker
			// there already shows descriptions + mode + selection.
			if cmd.ID == "/agent" || cmd.ID == "/agents" {
				a.settingsOpen = true
				a.settings = &settingsState{tab: 1}
				return a, loadSettingsCmd(a.c, a.runtimeScope())
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
			if cmd.ID == "/memory" {
				if !a.caps.Capabilities.Memory {
					a.transientHint = "memory inspector unsupported by this backend"
					return a, scheduleHintExpire(a.transientHint)
				}
				return a, loadMemoryInspectorCmd(a.c, a.runtimeScope(), a.messages)
			}
			if cmd.ID == "/permissions" {
				if !a.caps.Capabilities.Permissions {
					a.transientHint = "permission audit unsupported by this backend"
					return a, scheduleHintExpire(a.transientHint)
				}
				return a, loadPermissionsInspectorCmd(a.c, a.currentSessionID())
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
			// sidebar already exercises on 'f' (was '/').
			//
			// Critical: close the palette before handing focus to
			// the sidebar, otherwise subsequent keystrokes keep
			// landing in the palette filter (we just verified this
			// with verify_plan_filter.png — typing 'PLAN' after
			// /sessions ended up as palette filter 'sessionsPLAN').
			if cmd.ID == "/sessions" {
				a.paletteOpen = false
				a.paletteFilter = ""
				a.paletteCursor = 0
				a.paletteCursorSet = false
				a.paletteSel = 0
				a.enterSidebarFilter(true)
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
			case "/mode":
				if sid == "" {
					a.transientHint = "no active session — open or create one first"
					extraCmds = append(extraCmds, scheduleHintExpire(a.transientHint))
					return a, tea.Batch(extraCmds...)
				}
				next := nextRoutingMode(a.currentRoutingMode())
				a.transientHint = "routing mode → " + next
				extraCmds = append(extraCmds,
					scheduleHintExpire(a.transientHint),
					patchRoutingModeCmd(a.c, sid, next),
				)
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
					a.transientHint = "session summary requested"
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
			case "/agent-blueprint-install":
				a.openAgentBlueprintManage(agentBlueprintManageInstall)
				return a, tea.Batch(extraCmds...)
			case "/agent-blueprint-validate":
				a.openAgentBlueprintManage(agentBlueprintManageValidate)
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
		if a.paletteCursor > 0 {
			runes := []rune(a.paletteFilter)
			runes = append(runes[:a.paletteCursor-1], runes[a.paletteCursor:]...)
			a.paletteFilter = string(runes)
			a.paletteCursor--
			a.resetPaletteAfterFilterEdit()
		}
	case "delete":
		runes := []rune(a.paletteFilter)
		if a.paletteCursor < len(runes) {
			runes = append(runes[:a.paletteCursor], runes[a.paletteCursor+1:]...)
			a.paletteFilter = string(runes)
			a.resetPaletteAfterFilterEdit()
		}
	case "left":
		a.paletteCursorSet = true
		if a.paletteCursor > 0 {
			a.paletteCursor--
		}
	case "right":
		a.paletteCursorSet = true
		if a.paletteCursor < len([]rune(a.paletteFilter)) {
			a.paletteCursor++
		}
	case "home", "ctrl+a":
		a.paletteCursorSet = true
		a.paletteCursor = 0
	case "end", "ctrl+e":
		a.paletteCursorSet = true
		a.paletteCursor = len([]rune(a.paletteFilter))
	default:
		if k.Text != "" {
			runes := []rune(a.paletteFilter)
			insert := []rune(k.Text)
			out := make([]rune, 0, len(runes)+len(insert))
			out = append(out, runes[:a.paletteCursor]...)
			out = append(out, insert...)
			out = append(out, runes[a.paletteCursor:]...)
			a.paletteFilter = string(out)
			a.paletteCursor += len(insert)
			a.resetPaletteAfterFilterEdit()
		}
	}
	return a, nil
}

func (a *App) clampPaletteCursor() {
	if !a.paletteCursorSet && a.paletteFilter != "" {
		a.paletteCursor = len([]rune(a.paletteFilter))
	}
	a.paletteCursorSet = true
	max := len([]rune(a.paletteFilter))
	if a.paletteCursor < 0 {
		a.paletteCursor = 0
	}
	if a.paletteCursor > max {
		a.paletteCursor = max
	}
}

func (a *App) paletteCursorValue() int {
	if !a.paletteCursorSet && a.paletteFilter != "" {
		return len([]rune(a.paletteFilter))
	}
	cursor := a.paletteCursor
	if cursor < 0 {
		return 0
	}
	max := len([]rune(a.paletteFilter))
	if cursor > max {
		return max
	}
	return cursor
}

func (a *App) resetPaletteAfterFilterEdit() {
	a.paletteCursorSet = true
	a.paletteSel = 0
	a.searchMatches = nil
	a.searching = false
}

// closePalette resets all palette state — same dance is needed in three
// places (esc, command-Enter, search-Enter) so factor it.
func (a *App) closePalette() {
	a.paletteOpen = false
	a.paletteFilter = ""
	a.paletteCursor = 0
	a.paletteCursorSet = false
	a.paletteSel = 0
	a.searchMatches = nil
	a.searching = false
}

func (a *App) paletteCloseButtons() []menuButton {
	return []menuButton{closeMenuButton("palette:close", func(app *App) { app.closePalette() })}
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
	if a.selectedPartIsBottomBlock() {
		a.scrollOffset = 0
		a.stickyToBottom = true
		a.pendingPartScroll = false
		return
	}
	// VVVVVVVVV1: arm the post-render scroll adjustment so the View
	// path can nudge the viewport to keep the ▸ marker visible. The
	// base message-anchored offset is rough (measures in messages,
	// scrollClip wants lines); the per-part fine-tune reads the
	// rendered body and lines up the marker properly.
	a.pendingPartScroll = true
}

func (a *App) selectedPartIsBottomBlock() bool {
	if a.bodySelMsgIdx < 0 || a.bodySelMsgIdx >= len(a.messages) {
		return false
	}
	_, absorbed := pairToolResults(a.messages)
	lastVisible := -1
	for i := len(a.messages) - 1; i >= 0; i-- {
		if absorbed[i] {
			continue
		}
		if len(addressablePartsOf(a.messages[i])) == 0 {
			continue
		}
		lastVisible = i
		break
	}
	if a.bodySelMsgIdx != lastVisible {
		return false
	}
	addr := addressablePartsOf(a.messages[a.bodySelMsgIdx])
	return len(addr) > 0 && a.bodySelPartIdx == len(addr)-1
}

func (a *App) reattachConversationBottom() {
	a.scrollOffset = 0
	a.stickyToBottom = true
	a.pendingPartScroll = false
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
	if a.stepPartCursorSelection(dir) {
		a.scrollToSelectedMessage()
		return
	}
	if dir > 0 {
		a.scrollOffset = 0
		a.stickyToBottom = true
		a.pendingPartScroll = false
	}
}

func (a *App) stepPartCursorSelection(dir int) bool {
	if len(a.messages) == 0 {
		return false
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
		return true
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
		return true
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
		return true
	}
	// At the conversation end — stay put.
	return false
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
	case "/memory":
		if !a.caps.Capabilities.Memory {
			return "unsupported"
		}
		return "ARC context"
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
	localCmd := func(id, titleKey, descKey string) gact.Command {
		return gact.Command{
			ID:          id,
			Title:       a.localizer.t(messageID(titleKey), nil),
			Description: a.localizer.t(messageID(descKey), nil),
			Source:      "builtin",
		}
	}
	localCmds := []gact.Command{
		localCmd("/metrics", "command.metrics.title", "command.metrics.desc"),
		localCmd("/memory", "command.memory.title", "command.memory.desc"),
		{ID: "/permissions", Title: "Permissions", Description: "Inspect permission audit and policy rows", Source: "builtin"},
		localCmd("/theme", "command.theme.title", "command.theme.desc"),
		localCmd("/theme-export", "command.theme_export.title", "command.theme_export.desc"),
		localCmd("/mcp", "command.mcp.title", "command.mcp.desc"),
		localCmd("/tools", "command.tools.title", "command.tools.desc"),
		localCmd("/catalog", "command.catalog.title", "command.catalog.desc"),
		localCmd("/skills", "command.skills.title", "command.skills.desc"),
		localCmd("/agents-list", "command.agents.title", "command.agents.desc"),
		localCmd("/mode", "command.mode.title", "command.mode.desc"),
		localCmd("/clear", "command.clear.title", "command.clear.desc"),
		localCmd("/copy", "command.copy.title", "command.copy.desc"),
		localCmd("/diff", "command.diff.title", "command.diff.desc"),
		localCmd("/compact", "command.compact.title", "command.compact.desc"),
	}
	if a.caps.Capabilities.XClioPromptRegistry {
		localCmds = append(localCmds, gact.Command{
			ID: "/prompts", Title: "Prompts", Description: "Browse CLIO prompt catalog and profiles", Source: "builtin",
		})
	}
	if a.caps.Capabilities.XClioExpertPacks {
		localCmds = append(localCmds, gact.Command{
			ID: "/expert-packs", Title: "Expert Packs", Description: "Browse and activate CLIO expert-pack runtimes", Source: "builtin",
		})
	}
	if a.caps.Capabilities.XClioAgentBlueprints {
		localCmds = append(localCmds,
			gact.Command{
				ID: "/agent-blueprints", Title: "Agent Blueprints", Description: "Browse and manage CLIO markdown agent blueprints", Source: "builtin",
			},
			gact.Command{
				ID: "/blueprints", Title: "Blueprints", Description: "Open CLIO markdown agent blueprints", Source: "builtin",
			},
			gact.Command{
				ID: "/agent-blueprint-install", Title: "Install Agent Blueprint", Description: "Install a CLIO markdown agent blueprint into the workspace", Source: "builtin",
			},
			gact.Command{
				ID: "/agent-blueprint-validate", Title: "Validate Agent Blueprint", Description: "Validate a CLIO markdown agent blueprint path before installing", Source: "builtin",
			},
		)
	}
	if a.caps.Capabilities.IntegrationHealth {
		localCmds = append(localCmds, localCmd("/doctor", "command.doctor.title", "command.doctor.desc"))
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
	sort.SliceStable(out, func(i, j int) bool {
		return paletteExactCommandMatch(out[i].ID, needle) && !paletteExactCommandMatch(out[j].ID, needle)
	})
	return out
}

func paletteExactCommandMatch(id, filter string) bool {
	id = strings.ToLower(strings.TrimSpace(id))
	filter = strings.ToLower(strings.TrimSpace(filter))
	if id == "" || filter == "" {
		return false
	}
	return id == filter || strings.TrimPrefix(id, "/") == strings.TrimPrefix(filter, "/")
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
		// Default agent only. CLIO-style backends use one global LM
		// configured through /v1/providers/lm; sending an Anthropic
		// per-session ModelRef here makes later global-provider swaps
		// fail because the stale session model no longer matches.
		s, err := c.CreateSession(ctx, client.CreateSessionRequest{
			WorkspaceID: wsID,
			Title:       "new session " + time.Now().UTC().Format("15:04:05"),
			Agent:       &gact.AgentRef{ID: "default"},
		})
		if err != nil {
			return errMsg{err: err, stage: "create-session"}
		}
		return sessionCreatedMsg{session: s}
	}
}

func (a *App) clearLocalSessionModelRefs() {
	for i := range a.sessions {
		a.sessions[i].Model = gact.ModelRef{}
	}
}

// duplicateSessionCmd creates a new session carrying over the source
// session's title + agent but with zero messages. Model refs are not
// copied because CLIO uses a global LM provider; preserving a stale
// per-session model ref makes the next send fail after provider swaps.
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
		if err := c.RunCommand(ctx, sessionID, cmdID); err != nil {
			return errMsg{err: err, stage: "command"}
		}
		return nil
	}
}

// deleteMessageCmd fires a background DELETE for a message. The TUI already
// dropped the message locally so there's no message for us to emit on success;
// failures are silently swallowed because the user's next session switch or
// Ctrl+R will re-sync from the backend. If delete failures become a real
// problem, switch to an errMsg-returning command with a retry UX.
func deleteMessageCmd(c *client.Client, sessionID, messageID string) tea.Cmd {
	return func() tea.Msg {
		if messageID == "" {
			return nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = c.DeleteMessage(ctx, sessionID, messageID)
		return nil
	}
}

type sessionRewindDoneMsg struct {
	sessionID string
	deleted   []string
	err       error
}

type sessionUndoDoneMsg struct {
	sessionID string
	reverted  []string
	err       error
}

func rewindSessionCmd(c *client.Client, sessionID, messageID string, includeTarget bool) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		deleted, err := c.RewindSession(ctx, sessionID, messageID, includeTarget)
		return sessionRewindDoneMsg{sessionID: sessionID, deleted: deleted, err: err}
	}
}

func undoSessionCmd(c *client.Client, sessionID string, count int) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		reverted, err := c.UndoSession(ctx, sessionID, count)
		return sessionUndoDoneMsg{sessionID: sessionID, reverted: reverted, err: err}
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

	if a.sidebarSessionsCollapsed {
		a.sidebarSectionCursor = true
		switch k.String() {
		case "up", "k", "left", "pgup", "ctrl+u", "g", "home":
			a.focusPreviousSidebarSection()
			return a, nil
		case "down", "j", "right", "pgdown", "ctrl+d", "G", "end":
			a.focusNextSidebarSection()
			return a, nil
		case "enter":
			a.toggleFocusedSidebarSection()
			return a, nil
		}
	}

	switch k.String() {
	case "up", "k":
		if a.sidebarSectionCursor {
			a.focusPreviousSidebarSection()
			return a, nil
		}
		if a.sidebarSectionFocus == sidebarSectionContext {
			if a.contextFileSel <= 0 {
				a.contextFileSel = 0
				a.sidebarSectionCursor = true
				return a, nil
			}
			a.contextFileSel--
			return a, nil
		}
		if a.sidebarSectionFocus == sidebarSectionFiles {
			if a.fileTreeSel <= 0 {
				a.fileTreeSel = 0
				a.sidebarSectionCursor = true
				return a, nil
			}
			a.fileTreeSel--
			return a, nil
		}
		if a.sidebarSectionFocus == sidebarSectionAgents {
			if a.agentHierarchySel <= 0 {
				a.agentHierarchySel = 0
				a.sidebarSectionCursor = true
				return a, nil
			}
			a.agentHierarchySel--
			return a, nil
		}
		if a.selected == a.firstVisibleSessionIndex() {
			a.sidebarSectionCursor = true
			a.sidebarSectionFocus = sidebarSectionSessions
			return a, nil
		}
		if a.stepSelectionVisible(-1) {
			a.sidebarSectionCursor = false
			return a, a.selectSession(a.selected)
		}
	case "down", "j":
		if a.sidebarSectionCursor {
			if a.sidebarSectionFocus == sidebarSectionSessions {
				a.sidebarSectionCursor = false
			} else if a.sidebarSectionFocus == sidebarSectionFiles && !a.sidebarFilesCollapsed && len(a.visibleFileTreeEntries()) > 0 {
				a.sidebarSectionCursor = false
				a.clampFileTreeSelection()
			} else if a.sidebarSectionFocus == sidebarSectionAgents && !a.sidebarAgentsCollapsed && len(a.visibleAgentHierarchyRows()) > 0 {
				a.sidebarSectionCursor = false
				a.clampAgentHierarchySelection()
			} else if a.sidebarSectionFocus == sidebarSectionContext && !a.sidebarContextCollapsed && len(a.contextFiles) > 0 {
				a.sidebarSectionCursor = false
				a.clampContextFileSelection()
			} else {
				a.focusNextSidebarSection()
			}
			return a, nil
		}
		if a.sidebarSectionFocus == sidebarSectionContext {
			if a.contextFileSel < len(a.contextFiles)-1 {
				a.contextFileSel++
			}
			return a, nil
		}
		if a.sidebarSectionFocus == sidebarSectionFiles {
			visible := a.visibleFileTreeEntries()
			if a.fileTreeSel < len(visible)-1 {
				a.fileTreeSel++
			}
			return a, nil
		}
		if a.sidebarSectionFocus == sidebarSectionAgents {
			visible := a.visibleAgentHierarchyRows()
			if a.agentHierarchySel < len(visible)-1 {
				a.agentHierarchySel++
			}
			return a, nil
		}
		if a.stepSelectionVisible(+1) {
			a.sidebarSectionCursor = false
			return a, a.selectSession(a.selected)
		}
	case "left":
		a.sidebarSectionCursor = true
		a.focusPreviousSidebarSection()
		return a, nil
	case "right":
		a.sidebarSectionCursor = true
		a.focusNextSidebarSection()
		return a, nil
	case "g", "home":
		// Jump to first VISIBLE session.
		vis := a.visibleSessionIndexes()
		if len(vis) > 0 && a.selected != vis[0] {
			a.sidebarSectionCursor = false
			a.selected = vis[0]
			return a, a.selectSession(a.selected)
		}
	case "G", "end":
		vis := a.visibleSessionIndexes()
		if len(vis) > 0 && a.selected != vis[len(vis)-1] {
			a.sidebarSectionCursor = false
			a.selected = vis[len(vis)-1]
			return a, a.selectSession(a.selected)
		}
	case "pgup", "ctrl+u":
		if a.stepSelectionVisible(-a.sidebarPageSize()) {
			a.sidebarSectionCursor = false
			return a, a.selectSession(a.selected)
		}
	case "pgdown", "ctrl+d":
		if a.stepSelectionVisible(+a.sidebarPageSize()) {
			a.sidebarSectionCursor = false
			return a, a.selectSession(a.selected)
		}
	case "enter":
		if a.sidebarSectionCursor {
			a.toggleFocusedSidebarSection()
			return a, nil
		}
		if a.sidebarSectionFocus == sidebarSectionContext {
			a.clampContextFileSelection()
			if a.contextFileSel >= 0 && a.contextFileSel < len(a.contextFiles) {
				return a, a.openContextFileDetail(a.contextFiles[a.contextFileSel])
			}
			return a, nil
		}
		if a.sidebarSectionFocus == sidebarSectionFiles {
			a.activateFileTreeSelection()
			return a, nil
		}
		if a.sidebarSectionFocus == sidebarSectionAgents {
			return a, a.openSelectedAgentHierarchyDetail()
		}
		a.focus = FocusInput
		return a, nil
	case "m":
		if a.sidebarSectionFocus == sidebarSectionContext && !a.sidebarSectionCursor {
			return a, a.openContextActionsForIndex(a.contextFileSel)
		}
		return a, a.openSessionActionsForIndex(a.selected)
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
		// User feedback: typing /<cmd> from sidebar focus used to
		// enter sidebar filter mode and silently swallow the rest of
		// the slash command (e.g. /clear became filter "clear" with
		// "no matches"). Match the universal TUI convention: '/' opens
		// the global command palette regardless of focus. Sidebar
		// filter is now bound to 'f' (see below).
		a.openCommandPalette()
		return a, nil
	case "f":
		// Sidebar filter — was '/' before. Same semantics: enter
		// inline edit; Enter commits, Esc cancels + restores the
		// previous filter.
		a.enterSidebarFilter(false)
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
		a.contextAddMode = "read"
		return a, nil
	case "h":
		// Toggle archived vs active view. Refetches the session list
		// with the new filter; the result falls into the existing
		// sessionsRefreshedMsg branch which preserves selection where
		// possible.
		return a, a.toggleArchivedView()
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
		a.transientHint = copyTextToClipboard(sid, sid)
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
	case "c":
		a.showChildSessions = !a.showChildSessions
		if a.showChildSessions {
			a.transientHint = "showing child sessions (c to collapse)"
		} else {
			a.transientHint = "child sessions collapsed (c to show)"
		}
		a.ensureSelectedVisible()
	case "S":
		a.sidebarSectionFocus = sidebarSectionSessions
		a.sidebarSectionCursor = true
		a.sidebarSessionsCollapsed = !a.sidebarSessionsCollapsed
		if a.sidebarSessionsCollapsed {
			a.transientHint = "sessions section collapsed (S to expand)"
		} else {
			a.sidebarSectionCursor = false
			a.transientHint = "sessions section expanded"
		}
	case "C":
		a.sidebarSectionFocus = sidebarSectionContext
		a.sidebarSectionCursor = true
		a.sidebarContextCollapsed = !a.sidebarContextCollapsed
		if a.sidebarContextCollapsed {
			a.transientHint = "context section collapsed (C to expand)"
		} else {
			a.transientHint = "context section expanded"
		}
	case "F":
		if !a.sidebarHasEnabledModule(sidebarModuleFiles) {
			return a, nil
		}
		a.sidebarSectionFocus = sidebarSectionFiles
		a.sidebarSectionCursor = true
		a.sidebarFilesCollapsed = !a.sidebarFilesCollapsed
		if a.sidebarFilesCollapsed {
			a.transientHint = "files section collapsed (F to expand)"
		} else {
			a.transientHint = "files section expanded"
		}
	case "r":
		if a.sidebarSectionFocus == sidebarSectionFiles {
			a.reloadFileViewer()
			a.transientHint = "files refreshed"
		} else if a.sidebarSectionFocus == sidebarSectionAgents {
			return a, loadAgentHierarchyCmd(a.c, a.runtimeScope())
		}
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
	const rowsPerSession = 2
	contextLines := 0
	if a.selected >= 0 {
		if a.sidebarContextCollapsed {
			contextLines = 1
		} else if n := len(a.contextFiles); n > 0 {
			contextLines = 1 + n
		} else {
			contextLines = 2
		}
	}
	footerLines := 0
	if len(a.sessions) > 0 {
		footerLines = 2
	}
	fileLines := a.sidebarFileViewerRowCount(8)
	agentLines := a.sidebarAgentHierarchyRowCount(8)
	// a.height includes the header row (1) + footer hints row (1) +
	// optional hint banner row. The pane itself gets a.height-4 outer
	// rows (header + footer + 2 spacer rows per the layout math in
	// renderBody). Same inner-row budget as renderSidebar.
	inner := (a.height - 4) - 2
	avail := inner - contextLines - fileLines - agentLines - footerLines
	if (contextLines > 0 && !a.sidebarContextCollapsed) || (fileLines > 0 && !a.sidebarFilesCollapsed) || (agentLines > 0 && !a.sidebarAgentsCollapsed) {
		avail--
	}
	page := avail / rowsPerSession
	if page < 1 {
		page = 1
	}
	return page
}

func (a *App) clampContextFileSelection() {
	if len(a.contextFiles) == 0 {
		a.contextFileSel = 0
		return
	}
	if a.contextFileSel < 0 {
		a.contextFileSel = 0
	}
	if a.contextFileSel >= len(a.contextFiles) {
		a.contextFileSel = len(a.contextFiles) - 1
	}
}

func (a *App) hasContextSection() bool {
	return a.selected >= 0 && a.selected < len(a.sessions)
}

func (a *App) firstVisibleSessionIndex() int {
	vis := a.visibleSessionIndexes()
	if len(vis) == 0 {
		return -1
	}
	return vis[0]
}

func (a *App) sidebarSections() []sidebarSection {
	return sidebarSectionsFromModules(a.sidebarModules())
}

func (a *App) activeSidebarSections() []sidebarSection {
	if a.focus == FocusRightSidebar {
		return sidebarSectionsFromModules(a.rightSidebarModules())
	}
	return a.sidebarSections()
}

func sidebarSectionsFromModules(modules []resolvedSidebarModule) []sidebarSection {
	sections := make([]sidebarSection, 0, len(modules))
	for _, module := range modules {
		if module.Disabled {
			continue
		}
		sections = append(sections, module.Definition.Section)
	}
	return sections
}

func (a *App) sidebarSectionPosition() int {
	sections := a.activeSidebarSections()
	for i, section := range sections {
		if section == a.sidebarSectionFocus {
			return i
		}
	}
	return 0
}

func (a *App) focusPreviousSidebarSection() {
	sections := a.activeSidebarSections()
	if len(sections) == 0 {
		return
	}
	pos := a.sidebarSectionPosition()
	if pos > 0 {
		pos--
	}
	a.sidebarSectionFocus = sections[pos]
}

func (a *App) focusNextSidebarSection() {
	sections := a.activeSidebarSections()
	if len(sections) == 0 {
		return
	}
	pos := a.sidebarSectionPosition()
	if pos < len(sections)-1 {
		pos++
	}
	a.sidebarSectionFocus = sections[pos]
}

func (a *App) toggleFocusedSidebarSection() {
	switch a.sidebarSectionFocus {
	case sidebarSectionFiles:
		a.activateSidebarSection(sidebarSectionFiles)
	case sidebarSectionContext:
		a.activateSidebarSection(sidebarSectionContext)
	default:
		a.activateSidebarSection(sidebarSectionSessions)
	}
}

func (a *App) sidebarContextTitleRow(height int) (int, bool) {
	if !a.hasContextSection() {
		return 0, false
	}
	row := 2 // SESSIONS title + blank.
	if a.sessionFilterActive || a.sessionFilter != "" {
		row += 2
	}

	visIdx := a.visibleSessionIndexes()
	if !a.sidebarSessionsCollapsed {
		startIdx, endIdx := a.sidebarVisibleSessionRange(height, visIdx)
		if startIdx > 0 {
			row++
		}
		if a.sessionFilter != "" && len(visIdx) == 0 {
			row++
		}
		for i := startIdx; i < endIdx; i++ {
			row += a.sidebarSessionRowCount(visIdx[i])
		}
		if endIdx < len(visIdx) {
			row++
		}
	}
	return row, true
}

func (a *App) sidebarVisibleSessionRange(height int, visIdx []int) (int, int) {
	if a.sidebarSessionsCollapsed || len(visIdx) == 0 {
		return 0, 0
	}
	selVis := -1
	for i, idx := range visIdx {
		if idx == a.selected {
			selVis = i
			break
		}
	}
	startIdx := 0
	anchorVis := selVis
	if selVis >= 0 && a.showChildSessions && a.selected >= 0 && a.selected < len(a.sessions) && !isChildSession(a.sessions[a.selected]) {
		for j := selVis + 1; j < len(visIdx); j++ {
			if !isChildSession(a.sessions[visIdx[j]]) || a.sessions[visIdx[j]].ParentSessionID != a.sessions[a.selected].ID {
				break
			}
			anchorVis = j
		}
	}
	avail := a.sidebarSessionRowsAvailable(height)
	if avail < 1 {
		avail = 1
	}
	if anchorVis >= 0 {
		used := 0
		startIdx = anchorVis
		for startIdx >= 0 {
			next := used + a.sidebarSessionRowCount(visIdx[startIdx])
			if used > 0 && next > avail {
				break
			}
			used = next
			startIdx--
		}
		startIdx++
	}
	endIdx := startIdx
	used := 0
	for endIdx < len(visIdx) {
		next := used + a.sidebarSessionRowCount(visIdx[endIdx])
		if used > 0 && next > avail {
			break
		}
		used = next
		endIdx++
	}
	return startIdx, endIdx
}

func (a *App) sidebarSessionRowsAvailable(height int) int {
	contextLines := a.sidebarContextRowCount()
	fileLines := a.sidebarFileViewerRowCount(8)
	footerLines := 0
	if len(a.sessions) > 0 {
		footerLines = 2
	}
	avail := (height - 2) - 2 - contextLines - fileLines - footerLines
	if contextLines > 0 || fileLines > 0 {
		avail--
	}
	if avail < 1 {
		return 1
	}
	return avail
}

func (a *App) sidebarContextRowCount() int {
	if a.selected < 0 {
		return 0
	}
	if a.sidebarContextCollapsed {
		return 1
	}
	if len(a.contextFiles) == 0 {
		return 2
	}
	rows := 1
	for i := range a.contextFiles {
		rows += a.sidebarContextFileRowCount(i)
	}
	return rows
}

func (a *App) sidebarContextFileRowCount(index int) int {
	if index < 0 || index >= len(a.contextFiles) {
		return 0
	}
	if index == a.contextFileSel {
		return 2
	}
	return 1
}

func (a *App) sidebarSessionRowCount(sessionIndex int) int {
	if sessionIndex < 0 || sessionIndex >= len(a.sessions) {
		return 0
	}
	s := a.sessions[sessionIndex]
	if isChildSession(s) {
		return 1
	}
	rows := 2
	if a.sessionSidebarSummaryText(sessionIndex) != "" {
		rows++
	}
	if a.sessionSidebarActivationText(sessionIndex) != "" {
		rows++
	}
	if !a.showChildSessions && a.childSessionCount(s.ID) > 0 {
		rows++
	}
	return rows
}

func (a *App) sessionSidebarSummaryText(sessionIndex int) string {
	if sessionIndex < 0 || sessionIndex >= len(a.sessions) || sessionIndex != a.selected {
		return ""
	}
	s := a.sessions[sessionIndex]
	if isChildSession(s) {
		return ""
	}
	return strings.TrimSpace(strings.Join(strings.Fields(s.Summary), " "))
}

func (a *App) sessionSidebarActivationText(sessionIndex int) string {
	if sessionIndex < 0 || sessionIndex >= len(a.sessions) || sessionIndex != a.selected {
		return ""
	}
	s := a.sessions[sessionIndex]
	if isChildSession(s) {
		return ""
	}
	meta := mapValue(s.Metadata)
	blueprintID := firstNonEmpty(
		stringValue(meta["active_agent_blueprint_id"]),
		stringValue(meta["agent_blueprint_id"]),
	)
	if blueprintID == "" {
		return ""
	}
	scope := firstNonEmpty(
		stringValue(meta["active_agent_blueprint_scope"]),
		stringValue(meta["agent_blueprint_scope"]),
		"session",
	)
	return fmt.Sprintf("active blueprint: %s · scope: %s", blueprintID, scope)
}

func (a *App) applySessionAgentBlueprintState(state gact.SessionAgentBlueprintState) {
	sessionID := strings.TrimSpace(state.SessionID)
	if sessionID == "" && a.selected >= 0 && a.selected < len(a.sessions) {
		sessionID = a.sessions[a.selected].ID
	}
	idx := a.sessionIndexByID(sessionID)
	if idx < 0 {
		return
	}
	if a.sessions[idx].Metadata == nil {
		a.sessions[idx].Metadata = map[string]any{}
	}
	if state.ActiveAgentBlueprintID != "" {
		a.sessions[idx].Metadata["active_agent_blueprint_id"] = state.ActiveAgentBlueprintID
	}
	if state.ActiveAgentBlueprintPath != "" {
		a.sessions[idx].Metadata["active_agent_blueprint_path"] = state.ActiveAgentBlueprintPath
	}
	if state.WorkspaceID != "" {
		a.sessions[idx].Metadata["active_agent_blueprint_workspace_id"] = state.WorkspaceID
	}
	a.sessions[idx].Metadata["active_agent_blueprint_scope"] = "session"
}

func (a *App) activateSidebarSession(index int) tea.Cmd {
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionSessions
	if index < 0 || index >= len(a.sessions) {
		return nil
	}
	if index != a.selected {
		a.sidebarSectionCursor = false
		a.selected = index
		return a.selectSession(index)
	}
	if a.childSessionCount(a.sessions[index].ID) > 0 {
		a.sidebarSectionCursor = false
		a.showChildSessions = !a.showChildSessions
		if a.showChildSessions {
			a.transientHint = "showing child sessions (c to collapse)"
		} else {
			a.transientHint = "child sessions collapsed (c to show)"
		}
		a.ensureSelectedVisible()
	}
	return nil
}

func (a *App) activateSidebarSection(section sidebarSection) {
	if a.focus != FocusRightSidebar {
		a.focus = FocusSidebar
	}
	a.sidebarSectionFocus = section
	a.sidebarSectionCursor = true
	switch section {
	case sidebarSectionAgents:
		a.sidebarAgentsCollapsed = !a.sidebarAgentsCollapsed
		if a.sidebarAgentsCollapsed {
			a.transientHint = "agents section collapsed"
		} else {
			a.transientHint = "agents section expanded"
		}
	case sidebarSectionFiles:
		a.sidebarFilesCollapsed = !a.sidebarFilesCollapsed
		if a.sidebarFilesCollapsed {
			a.transientHint = "files section collapsed (F to expand)"
		} else {
			a.transientHint = "files section expanded"
		}
	case sidebarSectionContext:
		a.sidebarContextCollapsed = !a.sidebarContextCollapsed
		if a.sidebarContextCollapsed {
			a.transientHint = "context section collapsed (C to expand)"
		} else {
			a.transientHint = "context section expanded"
		}
	default:
		a.sidebarSessionsCollapsed = !a.sidebarSessionsCollapsed
		if a.sidebarSessionsCollapsed {
			a.transientHint = "sessions section collapsed (S to expand)"
		} else {
			a.sidebarSectionCursor = false
			a.transientHint = "sessions section expanded"
		}
	}
}

func (a *App) enterSidebarFilter(clear bool) {
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionSessions
	a.sidebarSectionCursor = true
	a.sessionFilterActive = true
	a.filterSnapshot = a.sessionFilter
	if clear {
		a.sessionFilter = ""
	}
}

func (a *App) toggleArchivedView() tea.Cmd {
	a.showArchived = !a.showArchived
	if a.showArchived {
		a.transientHint = "showing archived sessions (h to go back)"
	} else {
		a.transientHint = "showing active sessions"
	}
	if a.wsID != "" {
		return reloadSessionsForView(a.c, a.wsID, a.showArchived)
	}
	return nil
}

func (a *App) openCommandPalette() {
	a.paletteOpen = true
	a.paletteFilter = ""
	a.paletteCursor = 0
	a.paletteCursorSet = true
	a.paletteSel = 0
}

func (a *App) registerSidebarSectionHeaderHit(row int, width int, section sidebarSection) {
	if a.hits == nil {
		return
	}
	zone := a.sidebarHitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:sessions:header"
	if zone == FocusRightSidebar {
		id = "right-" + id
	}
	if section == sidebarSectionContext {
		id = "sidebar:context:header"
		if zone == FocusRightSidebar {
			id = "right-sidebar:context:header"
		}
	} else if section == sidebarSectionAgents {
		id = "sidebar:agents:header"
		if zone == FocusRightSidebar {
			id = "right-sidebar:agents:header"
		}
	} else if section == sidebarSectionFiles {
		id = "sidebar:files:header"
		if zone == FocusRightSidebar {
			id = "right-sidebar:files:header"
		}
	}
	a.registerSidebarContentHit(id, row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		app.activateSidebarSection(section)
		return nil
	})
}

func (a *App) registerSidebarFocusSurface(width, height int) {
	if a.hits == nil || width <= 0 || height <= 0 {
		return
	}
	zone := a.sidebarHitFocus
	id := "sidebar:focus"
	if zone == FocusRightSidebar {
		id = "right-sidebar:focus"
	} else {
		zone = FocusSidebar
	}
	rect := a.sidebarFocusSurfaceRect(width, height)
	a.registerFocusSurfaceHit(id, rect, zone, nil)
	a.registerScreenWheelHit(id+":wheel", rect, func(app *App, button tea.MouseButton) tea.Cmd {
		return app.handleSidebarWheel(zone, button)
	})
}

func (a *App) sidebarFocusSurfaceRect(width, height int) mouseRect {
	return mouseRect{x: a.sidebarHitOffsetX, y: 1, w: renderedPaneOuterWidth(width), h: height}
}

func (a *App) registerSidebarSessionHit(row int, width int, index int, rowCount int) {
	if a.hits == nil || index < 0 || index >= len(a.sessions) || rowCount <= 0 {
		return
	}
	id := a.sessions[index].ID
	if id == "" {
		id = fmt.Sprintf("%d", index)
	}
	zone := a.sidebarHitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	} else {
		id = "right-" + id
	}
	a.registerSidebarContentHitActions(
		"sidebar:session:"+id,
		row,
		width,
		rowCount,
		func(app *App) tea.Cmd {
			app.focus = zone
			return app.activateSidebarSession(index)
		},
		func(app *App) tea.Cmd {
			app.focus = zone
			return app.openSessionActionsForIndex(index)
		},
	)
}

func (a *App) registerSidebarFilterHit(row int, width int) {
	if a.hits == nil {
		return
	}
	a.registerSidebarContentHit("sidebar:filter", row, width, 1, func(app *App) tea.Cmd {
		app.enterSidebarFilter(false)
		return nil
	})
}

func (a *App) registerSidebarContextHeaderHit(row int, width int) {
	a.registerSidebarSectionHeaderHit(row, width, sidebarSectionContext)
}

func (a *App) registerSidebarContextFileHit(row int, width int, index int, cf gact.ContextFile) {
	if a.hits == nil {
		return
	}
	zone := a.sidebarHitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:context:file:" + cf.Path
	if zone == FocusRightSidebar {
		id = "right-sidebar:context:file:" + cf.Path
	}
	a.registerSidebarContentHitActions(
		id,
		row,
		width,
		a.sidebarContextFileRowCount(index),
		func(app *App) tea.Cmd {
			app.focus = zone
			app.sidebarSectionFocus = sidebarSectionContext
			app.sidebarSectionCursor = true
			app.contextFileSel = index
			return app.openContextFileDetail(cf)
		},
		func(app *App) tea.Cmd {
			return app.openContextActionsForIndexInZone(index, zone)
		},
	)
}

func (a *App) registerSidebarCountsHit(row int, width int) {
	if a.hits == nil {
		return
	}
	zone := a.sidebarHitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	a.registerSidebarContentHit("sidebar:counts", row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		return app.toggleArchivedView()
	})
}

func (a *App) registerSidebarContentHit(id string, row int, width int, height int, action uiHitAction) {
	a.registerSidebarContentHitActions(id, row, width, height, action, nil)
}

func (a *App) registerSidebarContentHitActions(id string, row int, width int, height int, action uiHitAction, secondaryAction uiHitAction) {
	if a.hits == nil {
		return
	}
	rect := a.sidebarContentRect(row, width)
	if height < 1 {
		height = 1
	}
	rect.h = height
	a.registerScreenHitActions(id, rect, action, secondaryAction)
}

func (a *App) sidebarContentRect(row int, width int) mouseRect {
	w := width - 4
	if w < 1 {
		w = 1
	}
	return mouseRect{x: a.sidebarHitOffsetX + 2, y: row + 2, w: w, h: 1}
}

func (a *App) openContextFileDetail(cf gact.ContextFile) tea.Cmd {
	rows := a.contextFileDetailRows(cf)
	a.detailView = &bulkyPartRef{
		messageID: "context",
		partID:    cf.Path,
		title:     "Context file · " + shortContextPath(cf.Path),
		fullText:  strings.Join(rows, "\n"),
	}
	a.detailViewOpen = true
	a.detailScroll = 0
	if a.shouldLoadContextFileContent() {
		return loadContextFileContentCmd(a.c, a.currentSessionID(), cf.Path)
	}
	return nil
}

func (a *App) shouldLoadContextFileContent() bool {
	return a.currentSessionID() != ""
}

func (a *App) contextFileDetailRows(cf gact.ContextFile) []string {
	return a.contextFileDetailRowsWithContent(cf, gact.ContextFileContent{}, nil)
}

func (a *App) contextFileDetailRowsWithContent(cf gact.ContextFile, content gact.ContextFileContent, contentErr error) []string {
	fileFields := []detailField{
		{"path", cf.Path},
		{"mode", contextModeDescription(cf.Mode)},
		{"status", contextFileStatusDescription(cf)},
		{"source", contextFileSourceDescription(cf)},
	}
	if cf.Size > 0 {
		fileFields = append(fileFields, detailField{"size", fmt.Sprintf("%s (%d bytes)", humanBytes(cf.Size), cf.Size)})
	}
	if strings.TrimSpace(cf.Language) != "" {
		fileFields = append(fileFields, detailField{"language", cf.Language})
	}
	if strings.TrimSpace(cf.AddedAt) != "" {
		fileFields = append(fileFields, detailField{"added_at", cf.AddedAt})
	}
	if strings.TrimSpace(cf.LastModified) != "" {
		fileFields = append(fileFields, detailField{"last_modified", cf.LastModified})
	}
	rows := appendDetailSection(nil, "File", fileFields...)
	rows = a.appendContextFilePreviewRows(rows, cf, content, contentErr)
	if a.selected >= 0 && a.selected < len(a.sessions) {
		s := a.sessions[a.selected]
		sessionFields := []detailField{
			{"title", orPlaceholder(s.Title, a.localizer.t(msgSidebarUntitled, nil))},
			{"id", s.ID},
			{"status", orPlaceholder(s.Status, "unknown")},
		}
		if s.WorkspaceID != "" {
			sessionFields = append(sessionFields, detailField{"workspace", s.WorkspaceID})
		}
		if s.ParentSessionID != "" {
			sessionFields = append(sessionFields, detailField{"parent_session_id", s.ParentSessionID})
		}
		if s.Agent.ID != "" {
			sessionFields = append(sessionFields, detailField{"agent", s.Agent.ID})
		}
		if !s.UpdatedAt.IsZero() || !s.CreatedAt.IsZero() {
			activity := sessionActivityTime(s)
			sessionFields = append(sessionFields, detailField{"latest_activity", activity.UTC().Format(time.RFC3339)})
		}
		if s.MessageCount > 0 {
			sessionFields = append(sessionFields, detailField{"messages", fmt.Sprintf("%d", s.MessageCount)})
		}
		rows = appendDetailSection(rows, "Session", sessionFields...)
	}
	rows = appendDetailSection(rows, "Actions",
		detailField{"o", "add another context file"},
		detailField{"Esc / Ctrl+E", "close detail"},
	)
	return rows
}

func (a *App) appendContextFilePreviewRows(rows []string, cf gact.ContextFile, content gact.ContextFileContent, contentErr error) []string {
	if contentErr != nil {
		return appendDetailSection(rows, "Content",
			detailField{"preview_error", contentErr.Error()},
		)
	}
	if strings.TrimSpace(content.Data) == "" {
		if !a.shouldLoadContextFileContent() {
			return appendDetailSection(rows, "Content",
				detailField{"preview", "unavailable (no active session)"},
			)
		}
		if !a.caps.Capabilities.XClioFilesContent {
			return appendDetailSection(rows, "Content",
				detailField{"preview", "loading..."},
				detailField{"capability", "x_clio_files_content not advertised; probing endpoint"},
			)
		}
		return appendDetailSection(rows, "Content",
			detailField{"preview", "loading..."},
		)
	}
	path := firstNonEmpty(content.Path, cf.Path)
	displayPath := firstNonEmpty(content.DisplayPath, path)
	contentFields := []detailField{
		{"path", path},
		{"display_path", displayPath},
	}
	if content.Size > 0 {
		contentFields = append(contentFields, detailField{"size", fmt.Sprintf("%s (%d bytes)", humanBytes(content.Size), content.Size)})
	}
	if strings.TrimSpace(content.MediaType) != "" {
		contentFields = append(contentFields, detailField{"media_type", content.MediaType})
	}
	if strings.TrimSpace(content.Encoding) != "" {
		contentFields = append(contentFields, detailField{"encoding", content.Encoding})
	}
	if !contextFileContentIsText(content.MediaType) {
		contentFields = append(contentFields, detailField{"preview", "binary content not rendered in terminal detail"})
		return appendDetailSection(rows, "Content", contentFields...)
	}
	decoded, err := base64.StdEncoding.DecodeString(content.Data)
	if err != nil {
		contentFields = append(contentFields, detailField{"preview_error", "could not decode base64 content: " + err.Error()})
		return appendDetailSection(rows, "Content", contentFields...)
	}
	text := strings.ReplaceAll(string(decoded), "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	const maxPreviewRunes = 12000
	truncated := false
	if len([]rune(text)) > maxPreviewRunes {
		runes := []rune(text)
		text = string(runes[:maxPreviewRunes])
		truncated = true
	}
	contentFields = append(contentFields, detailField{"preview", text})
	if truncated {
		contentFields = append(contentFields, detailField{"truncated", fmt.Sprintf("shown first %d characters", maxPreviewRunes)})
	}
	return appendDetailSection(rows, "Content", contentFields...)
}

func contextFileContentIsText(mediaType string) bool {
	mediaType = strings.ToLower(strings.TrimSpace(mediaType))
	if strings.HasPrefix(mediaType, "text/") || strings.Contains(mediaType, "charset=utf-8") {
		return true
	}
	for _, prefix := range []string{
		"application/json",
		"application/xml",
		"application/yaml",
		"application/toml",
	} {
		if strings.HasPrefix(mediaType, prefix) {
			return true
		}
	}
	return mediaType == ""
}

func (a *App) contextFileByPath(path string) (gact.ContextFile, bool) {
	for _, cf := range a.contextFiles {
		if cf.Path == path {
			return cf, true
		}
	}
	return gact.ContextFile{}, false
}

func contextModeDescription(mode string) string {
	switch mode {
	case "read":
		return "read (backend may inspect contents)"
	case "edit":
		return "edit (backend may propose changes)"
	case "pin":
		return "pin (always retained in context)"
	case "":
		return "unknown"
	default:
		return mode
	}
}

func contextFileStatusDescription(cf gact.ContextFile) string {
	mode := contextModeDescription(cf.Mode)
	if cf.Uploaded {
		return "uploaded attachment attached to selected session as " + mode
	}
	return "workspace file attached to selected session as " + mode
}

func contextFileSourceDescription(cf gact.ContextFile) string {
	if cf.Uploaded {
		return "uploaded attachment"
	}
	return "workspace context file"
}

func shortContextPath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return "(unknown)"
	}
	parts := strings.Split(path, "/")
	if len(parts) <= 2 {
		return path
	}
	return "…/" + strings.Join(parts[len(parts)-2:], "/")
}

func humanBytes(size int64) string {
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	value := float64(size)
	for _, suffix := range []string{"KiB", "MiB", "GiB", "TiB"} {
		value /= unit
		if value < unit {
			return fmt.Sprintf("%.1f %s", value, suffix)
		}
	}
	return fmt.Sprintf("%.1f PiB", value/unit)
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
		a.reattachConversationBottom()
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
	case "m":
		return a, a.openConversationActionsForSelection()
	case "y":
		// Yank: when the body cursor is on an addressable part, copy
		// that semantic block first (tool result, diff, text, etc.).
		// Fall back to the selected message's text, then latest
		// assistant text. Feedback is a transient toast because
		// clipboard success is otherwise invisible.
		var (
			text string
			ok   bool
		)
		if a.bodySelMsgIdx >= 0 && a.bodySelMsgIdx < len(a.messages) {
			text, ok = selectedConversationBlockText(a.messages, a.bodySelMsgIdx, a.bodySelPartIdx)
			if !ok {
				text, ok = messageText(a.messages[a.bodySelMsgIdx])
			}
		} else {
			text, ok = lastAssistantText(a.messages)
		}
		if !ok {
			a.transientHint = "nothing to copy — selected block has no text"
			return a, nil
		}
		a.transientHint = copyExactTextToClipboard(text, "nothing to copy — selected block has no text", func(chars int) string {
			return fmt.Sprintf("copied %d chars to clipboard", chars)
		})
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
		a.transientHint = copyExactTextToClipboard(text, "nothing to copy — conversation has no text yet", func(chars int) string {
			return fmt.Sprintf("copied full conversation (%d chars) to clipboard", chars)
		})
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
		deleteSessionID := target.SessionID
		if deleteSessionID == "" {
			deleteSessionID = a.currentSessionID()
		}
		return a, tea.Batch(
			deleteMessageCmd(a.c, deleteSessionID, target.ID),
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

func applyDiffsCmd(c *client.Client, sessionID string, paths ...string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		applied, writeErrors, err := c.ApplyDiffs(ctx, sessionID, paths)
		if err != nil {
			return errMsg{err: err, stage: "apply-diffs"}
		}
		return diffsAppliedMsg{paths: applied, writeErrors: writeErrors}
	}
}

func rejectDiffsCmd(c *client.Client, sessionID string, paths ...string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		rejected, err := c.RejectDiffs(ctx, sessionID, paths)
		if err != nil {
			return errMsg{err: err, stage: "reject-diffs"}
		}
		return diffsRejectedMsg{paths: rejected}
	}
}

func (a *App) handleInputKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	key := k.String()
	if a.inPaste {
		a.recordPasteKey(k)
		var cmd tea.Cmd
		a.input, cmd = a.input.Update(k)
		return a, cmd
	}

	// Slash on empty input opens the palette.
	if key == "/" && a.input.Value() == "" {
		a.openCommandPalette()
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
		draftText := strings.TrimSpace(raw)
		text := strings.TrimSpace(a.expandPasteText(raw))
		mentions := activeComposerFileMentions(raw, a.fileMentions)
		a.input.Reset()
		a.fileMentions = nil
		a.pastes = nil
		a.exitHistory()
		// N1: successful dispatch invalidates any saved draft for
		// this session. Drop it now so that coming back later sees
		// a clean slate rather than the already-sent text resurfacing.
		if sid := a.currentSessionID(); sid != "" {
			delete(a.inputDraftBySession, sid)
			delete(a.fileMentionsBySession, sid)
		}
		if text == "" || a.currentSessionID() == "" {
			return a, nil
		}
		a.pushInputHistory(text)
		agentID := a.nextTurnAgentID
		a.nextTurnAgentID = ""
		a.nextTurnAgentTitle = ""
		return a, postMessageWithMentionsAndAgentCmd(a.c, a.currentSessionID(), draftText, text, mentions, agentID)
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
		a.fileMentions = nil
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

func (a *App) runtimeScope() client.RuntimeScope {
	return client.RuntimeScope{
		WorkspaceID: a.wsID,
		SessionID:   a.currentSessionID(),
	}
}

func (a *App) sessionIndexByID(id string) int {
	for i, s := range a.sessions {
		if s.ID == id {
			return i
		}
	}
	return -1
}

func sessionActivityTime(s gact.Session) time.Time {
	if !s.UpdatedAt.IsZero() {
		return s.UpdatedAt
	}
	return s.CreatedAt
}

func (a *App) sortSessionsByActivity() {
	if len(a.sessions) < 2 {
		return
	}
	sort.SliceStable(a.sessions, func(i, j int) bool {
		left := sessionActivityTime(a.sessions[i])
		right := sessionActivityTime(a.sessions[j])
		if left.Equal(right) {
			return a.sessions[i].ID < a.sessions[j].ID
		}
		return left.After(right)
	})
}

func (a *App) appendModelSwapMarker(info *client.LMProviderInfo) {
	if info == nil || !info.Configured || strings.TrimSpace(info.Model) == "" {
		return
	}
	sid := a.currentSessionID()
	if sid == "" {
		return
	}
	label := joinModelLabel(info.Provider, info.Model)
	if label == "" {
		return
	}
	if len(a.messages) > 0 {
		last := a.messages[len(a.messages)-1]
		if isModelSwapMarker(last) && last.Metadata["label"] == label {
			return
		}
	}
	now := time.Now()
	a.messages = append(a.messages, gact.Message{
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
	a.stickyToBottom = true
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
	a.contextFileSel = 0
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
		loadCommandsCmd(a.c, a.runtimeScope()),
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
		a.stashFileMentions(a.lastLoadedSessionID, activeComposerFileMentions(a.input.Value(), a.fileMentions))
	}
	a.input.Reset()
	a.fileMentions = nil
	a.pastes = nil
	if saved, ok := a.inputDraftBySession[newSID]; ok {
		a.input.SetValue(saved)
	}
	if mentions, ok := a.fileMentionsBySession[newSID]; ok {
		a.fileMentions = cloneComposerFileMentions(mentions)
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

func (a *App) stashFileMentions(sid string, mentions []composerFileMention) {
	if sid == "" {
		return
	}
	if len(mentions) == 0 {
		delete(a.fileMentionsBySession, sid)
		return
	}
	if a.fileMentionsBySession == nil {
		a.fileMentionsBySession = map[string][]composerFileMention{}
	}
	a.fileMentionsBySession[sid] = cloneComposerFileMentions(mentions)
}

func (a *App) mergeContextFiles(files []gact.ContextFile) {
	if len(files) == 0 {
		return
	}
	for _, file := range files {
		if file.Path == "" {
			continue
		}
		replaced := false
		for i := range a.contextFiles {
			if a.contextFiles[i].Path == file.Path {
				a.contextFiles[i] = file
				replaced = true
				break
			}
		}
		if !replaced {
			a.contextFiles = append(a.contextFiles, file)
		}
	}
	a.clampContextFileSelection()
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
		a.applyMessageCompleted(e)
		a.applyCostUpdated(e)
	case "session.status_changed":
		if pl != nil {
			v, _ := pl["status"].(string)
			if v != "" {
				targetSID, _ := pl["session_id"].(string)
				if targetSID == "" {
					targetSID = a.currentSessionID()
				}
				if a.shouldIgnoreStatusReplay(targetSID, v, e) {
					return
				}
				// Mirror into a.sessions so the sidebar status dots match
				// reality. Events can arrive for the currently-selected
				// session OR for a sibling (a subagent running elsewhere),
				// so key on session_id from the payload.
				for i := range a.sessions {
					if a.sessions[i].ID == targetSID {
						a.sessions[i].Status = v
						break
					}
				}
				if targetSID == a.currentSessionID() {
					a.currentStatus = v
				}
			}
		}
	case "user_question.created":
		a.applyUserQuestionCreated(e)
	case "user_question.answered", "user_question.cancelled":
		a.applyUserQuestionResolved(e)
	case "permission.requested":
		a.applyPermissionRequested(e)
	case "permission.resolved":
		a.applyPermissionResolved(e)
	case "semantic.event":
		a.applySemanticEvent(e)
	case "tool.call.started":
		a.applyToolCallStarted(e)
	case "tool.call.completed":
		a.applyToolCallCompleted(e)
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

func (a *App) shouldIgnoreStatusReplay(sessionID, incoming string, e client.SSEEvent) bool {
	if incoming != gact.StatusRunning && incoming != gact.StatusWaitingPermission {
		return false
	}
	idx := -1
	for i := range a.sessions {
		if a.sessions[i].ID == sessionID {
			idx = i
			break
		}
	}
	if idx < 0 || !sessionStatusIsTerminal(a.sessions[idx].Status) {
		return false
	}
	eventTime, ok := sseOccurredAt(e)
	if !ok || a.sessions[idx].UpdatedAt.IsZero() {
		return false
	}
	return !eventTime.After(a.sessions[idx].UpdatedAt)
}

func (a *App) shouldIgnoreSessionReplay(sessionID string, e client.SSEEvent) bool {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return false
	}
	idx := -1
	for i := range a.sessions {
		if a.sessions[i].ID == sessionID {
			idx = i
			break
		}
	}
	if idx < 0 || a.sessions[idx].UpdatedAt.IsZero() {
		return false
	}
	eventTime, ok := sseOccurredAt(e)
	if !ok {
		return false
	}
	return !eventTime.After(a.sessions[idx].UpdatedAt)
}

func (a *App) replaySessionID(sessionID string) string {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID != "" {
		return sessionID
	}
	return a.currentSessionID()
}

func sessionStatusIsTerminal(status string) bool {
	switch status {
	case gact.StatusIdle, gact.StatusError, gact.StopReasonCancelled, "completed", "failed":
		return true
	default:
		return false
	}
}

func sseOccurredAt(e client.SSEEvent) (time.Time, bool) {
	raw := strings.TrimSpace(stringValue(e.Payload["occurred_at"]))
	if raw == "" {
		return time.Time{}, false
	}
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

func (a *App) applyMessageCompleted(e client.SSEEvent) {
	pl, ok := e.Payload["payload"].(map[string]any)
	if !ok {
		return
	}
	if sid := a.replaySessionID(stringValue(pl["session_id"])); a.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	msgID, _ := pl["message_id"].(string)
	if msgID == "" {
		return
	}
	for i := range a.messages {
		if a.messages[i].ID != msgID {
			continue
		}
		metadata, ok := pl["metadata"].(map[string]any)
		if !ok || len(metadata) == 0 {
			return
		}
		if a.messages[i].Metadata == nil {
			a.messages[i].Metadata = map[string]any{}
		}
		for k, v := range metadata {
			a.messages[i].Metadata[k] = v
		}
		normalizeMessagePresentation(&a.messages[i])
		return
	}
}

func normalizeMessagePresentation(m *gact.Message) {
	normalizeMessageCompactionSummaries(m)
	normalizeMessageExpertHandoffs(m)
	normalizeMessageErrorInfo(m)
	normalizeMessagePartialAnswerLabels(m)
	normalizeMessageToolEvidence(m)
	normalizeMessageRuntimeProvenance(m)
}

func normalizeMessageCompactionSummaries(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant || messageHasPartType(m, gact.PartTypeCompaction) {
		return
	}
	for i := range m.Parts {
		part := &m.Parts[i]
		if part.Type != gact.PartTypeText {
			continue
		}
		text := strings.TrimSpace(part.Text)
		if !isCompactSummaryPart(*part, text) {
			continue
		}
		part.Type = gact.PartTypeCompaction
		part.Summary = compactSummaryText(text)
		part.Text = ""
		if part.Metadata == nil {
			part.Metadata = map[string]any{}
		}
		part.Metadata["synthetic_from"] = "compact_summary_text"
		return
	}
}

func isCompactSummaryPart(part gact.Part, text string) bool {
	if strings.HasPrefix(strings.ToLower(text), "[compact summary]") {
		return true
	}
	if part.Metadata == nil {
		return false
	}
	return strings.TrimSpace(fmt.Sprint(part.Metadata["synthetic"])) == "compact_summary"
}

func compactSummaryText(text string) string {
	text = strings.TrimSpace(text)
	if strings.HasPrefix(strings.ToLower(text), "[compact summary]") {
		text = strings.TrimSpace(text[len("[compact summary]"):])
	}
	return text
}

func normalizeMessageExpertHandoffs(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant {
		return
	}
	tools := normalizeToolEvidenceRows(m.Metadata["tools_called"])
	if messageHasPartType(m, gact.PartTypeExpertHandoff) {
		filterExistingExpertHandoffParts(m, tools)
		return
	}
	rows := normalizeExpertHandoffRows(m.Metadata["expert_handoffs"])
	rows = filterRedundantDirectToolHandoffRows(rows, tools)
	if len(rows) == 0 {
		return
	}
	synthetic := make([]gact.Part, 0, len(rows))
	for i, row := range rows {
		md := map[string]any{}
		for k, v := range row {
			md[k] = v
		}
		md["synthetic_from"] = "expert_handoffs_metadata"
		synthetic = append(synthetic, gact.Part{
			ID:       fmt.Sprintf("synthetic_expert_handoff_%d", i+1),
			Type:     gact.PartTypeExpertHandoff,
			Text:     expertHandoffSummary(row),
			Metadata: md,
		})
	}
	insertAt := len(m.Parts)
	for i, part := range m.Parts {
		if part.Type == gact.PartTypeThinking || part.Type == gact.PartTypeText {
			insertAt = i
			break
		}
	}
	parts := make([]gact.Part, 0, len(m.Parts)+len(synthetic))
	parts = append(parts, m.Parts[:insertAt]...)
	parts = append(parts, synthetic...)
	parts = append(parts, m.Parts[insertAt:]...)
	m.Parts = parts
}

func messageHasPartType(m *gact.Message, partType string) bool {
	for _, part := range m.Parts {
		if part.Type == partType {
			return true
		}
	}
	return false
}

func shouldRenderConversationMessage(m gact.Message) bool {
	if len(m.Parts) > 0 || isModelSwapMarker(m) || m.ErrorInfo != nil {
		return true
	}
	if len(normalizeToolEvidenceRows(m.Metadata["tools_called"])) > 0 {
		return true
	}
	if len(normalizeExpertHandoffRows(m.Metadata["expert_handoffs"])) > 0 {
		return true
	}
	if hasRuntimeProvenance(m) {
		return true
	}
	return false
}

func normalizeMessageErrorInfo(m *gact.Message) {
	if m == nil || m.ErrorInfo == nil || messageHasPartType(m, gact.PartTypeError) {
		return
	}
	metadata := map[string]any{
		"synthetic_from": "message_error_info",
	}
	if len(m.ErrorInfo.Details) > 0 {
		metadata["details"] = m.ErrorInfo.Details
	}
	if m.ErrorInfo.RetryAfterS != nil {
		metadata["retry_after_s"] = *m.ErrorInfo.RetryAfterS
	}
	part := gact.Part{
		ID:          "synthetic_message_error_info",
		Type:        gact.PartTypeError,
		Code:        m.ErrorInfo.Error,
		Message:     m.ErrorInfo.Message,
		Recoverable: m.ErrorInfo.Recoverable,
		Metadata:    metadata,
	}
	insertAt := len(m.Parts)
	for i, existing := range m.Parts {
		if existing.Type == gact.PartTypeText {
			insertAt = i
			break
		}
	}
	parts := make([]gact.Part, 0, len(m.Parts)+1)
	parts = append(parts, m.Parts[:insertAt]...)
	parts = append(parts, part)
	parts = append(parts, m.Parts[insertAt:]...)
	m.Parts = parts
}

func normalizeMessagePartialAnswerLabels(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant {
		return
	}
	if m.StopReason != gact.StopReasonError && m.ErrorInfo == nil && !messageHasPartType(m, gact.PartTypeError) {
		return
	}
	seenError := false
	hasErrorPart := messageHasPartType(m, gact.PartTypeError)
	for i := range m.Parts {
		part := &m.Parts[i]
		if part.Type == gact.PartTypeError {
			seenError = true
			continue
		}
		if part.Type != gact.PartTypeText {
			continue
		}
		if hasErrorPart && !seenError {
			continue
		}
		if part.Metadata == nil {
			part.Metadata = map[string]any{}
		}
		part.Metadata["partial_after_error"] = true
	}
}

func filterExistingExpertHandoffParts(m *gact.Message, tools []toolEvidenceRow) {
	if m == nil || len(tools) == 0 {
		return
	}
	filtered := m.Parts[:0]
	for _, part := range m.Parts {
		if part.Type == gact.PartTypeExpertHandoff && isRedundantDirectToolHandoff(part.Metadata) {
			continue
		}
		filtered = append(filtered, part)
	}
	m.Parts = filtered
}

func normalizeExpertHandoffRows(raw any) []map[string]any {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	rows := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if row, ok := item.(map[string]any); ok {
			rows = append(rows, row)
		}
	}
	return rows
}

func filterRedundantDirectToolHandoffRows(rows []map[string]any, tools []toolEvidenceRow) []map[string]any {
	if len(rows) == 0 || len(tools) == 0 {
		return rows
	}
	filtered := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if isRedundantDirectToolHandoff(row) {
			continue
		}
		filtered = append(filtered, row)
	}
	return filtered
}

func isRedundantDirectToolHandoff(row map[string]any) bool {
	stage := strings.ToLower(strings.TrimSpace(firstNonEmpty(
		stringValue(row["stage"]),
		stringValue(row["dispatch_target"]),
	)))
	if stage != "direct_tool" {
		return false
	}
	status := strings.ToLower(strings.TrimSpace(firstNonEmpty(stringValue(row["status"]), "observed")))
	if status != "success" && status != "ok" {
		return false
	}
	return firstNonEmpty(
		stringValue(row["output_summary"]),
		stringValue(row["summary"]),
		stringValue(row["error"]),
	) == ""
}

func expertHandoffSummary(row map[string]any) string {
	agent := firstNonEmpty(
		stringValue(row["agent_id"]),
		stringValue(row["expert"]),
		"expert",
	)
	parent := firstNonEmpty(
		stringValue(row["parent_id"]),
		stringValue(row["parent"]),
	)
	stage := firstNonEmpty(
		stringValue(row["stage"]),
		stringValue(row["dispatch_target"]),
	)
	status := firstNonEmpty(stringValue(row["status"]), "observed")
	output := firstNonEmpty(
		stringValue(row["output_summary"]),
		stringValue(row["summary"]),
	)
	route := agent
	if parent != "" {
		route = parent + " -> " + agent
	}
	bits := []string{route, status}
	if stage != "" {
		bits = append(bits, stage)
	}
	if output != "" {
		bits = append(bits, output)
	}
	return strings.Join(bits, " | ")
}

// normalizeMessageToolEvidence promotes CLIO's metadata-only tool telemetry
// into first-class tool_call/tool_result parts so conversation order matches
// execution order and the body cursor can focus/expand the tool details.
func normalizeMessageToolEvidence(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant || assistantCarriedToolCall(m) {
		return
	}
	rows := normalizeToolEvidenceRows(m.Metadata["tools_called"])
	if len(rows) == 0 {
		return
	}
	var synthetic []gact.Part
	for i, row := range rows {
		if row.Name == "" {
			continue
		}
		callID := fmt.Sprintf("tool_evidence_%d", i+1)
		synthetic = append(synthetic, gact.Part{
			ID:       "synthetic_" + callID + "_call",
			Type:     gact.PartTypeToolCall,
			CallID:   callID,
			ToolName: row.Name,
			Input:    toolEvidenceInput(row.Args),
			Metadata: map[string]any{
				"synthetic_from": "tools_called_metadata",
			},
		})
		resultText := toolEvidenceResultText(row.Name, row.Result)
		if row.RepeatCount > 0 {
			repeatNotice := "trace repeated " + strconv.Itoa(row.RepeatCount) + " more time" + plural(row.RepeatCount) + " with the same call/result"
			if strings.TrimSpace(resultText) == "" {
				resultText = repeatNotice
			} else {
				resultText += "\n" + repeatNotice
			}
		}
		resultPart := gact.Part{
			ID:       "synthetic_" + callID + "_result",
			Type:     gact.PartTypeToolResult,
			CallID:   callID,
			ToolName: row.Name,
			IsError:  toolEvidenceRowIsError(row),
			Content: []gact.Part{{
				ID:   "synthetic_" + callID + "_result_text",
				Type: gact.PartTypeText,
				Text: resultText,
			}},
			Metadata: map[string]any{
				"synthetic_from": "tools_called_metadata",
				"raw_result":     row.Result,
			},
		}
		if row.DurationMS != nil {
			resultPart.DurationMS = *row.DurationMS
		}
		if row.Cached != nil {
			resultPart.Cached = *row.Cached
		}
		synthetic = append(synthetic, resultPart)
	}
	if len(synthetic) == 0 {
		return
	}
	insertAt := len(m.Parts)
	for i, part := range m.Parts {
		if part.Type == gact.PartTypeText {
			insertAt = i
			break
		}
	}
	parts := make([]gact.Part, 0, len(m.Parts)+len(synthetic))
	parts = append(parts, m.Parts[:insertAt]...)
	parts = append(parts, synthetic...)
	parts = append(parts, m.Parts[insertAt:]...)
	m.Parts = parts
}

func toolEvidenceInput(raw any) map[string]any {
	if raw == nil {
		return nil
	}
	if input, ok := raw.(map[string]any); ok {
		return input
	}
	return map[string]any{"args": raw}
}

func toolEvidenceResultText(toolName string, raw any) string {
	if raw == nil {
		return ""
	}
	if result, ok := raw.(map[string]any); ok {
		if summary := summarizeErrorResult(result); summary != "" {
			return summary
		}
		if stdout, ok := result["stdout"].(string); ok && strings.TrimSpace(stdout) != "" {
			return strings.TrimSpace(stdout)
		}
		if errorText, ok := result["error"].(string); ok && strings.TrimSpace(errorText) != "" {
			return strings.TrimSpace(errorText)
		}
	}
	if summary := summarizeToolResult(toolName, raw); summary != "" {
		return summary
	}
	if text := compactJSON(raw); text != "" {
		return text
	}
	return fmt.Sprint(raw)
}

func summarizeToolResult(toolName string, raw any) string {
	result, ok := raw.(map[string]any)
	if !ok {
		return ""
	}
	if text := summarizeErrorResult(result); text != "" {
		return text
	}
	lowerTool := strings.ToLower(toolName)
	if strings.HasPrefix(lowerTool, "ndp_") {
		if text := summarizeNDPResult(result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "parquet") {
		if text := summarizeTableLikeResult("parquet", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "csv") {
		if text := summarizeTableLikeResult("csv", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "hdf5") || strings.Contains(lowerTool, "h5") {
		if text := summarizeContainerResult("hdf5", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "adios") || strings.Contains(lowerTool, "bp5") || strings.Contains(lowerTool, "bp4") {
		if text := summarizeContainerResult("adios", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "sac") || strings.Contains(lowerTool, "seismic") {
		if text := summarizeSACResult(result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "shell") || strings.Contains(lowerTool, "bash") || strings.Contains(lowerTool, "command") {
		if text := summarizeShellResult(result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "plot") || strings.Contains(lowerTool, "chart") ||
		strings.Contains(lowerTool, "visual") || strings.Contains(lowerTool, "dashboard") {
		if text := summarizeVisualizationResult(result); text != "" {
			return text
		}
	}
	return ""
}

func summarizeErrorResult(result map[string]any) string {
	errorPayload, ok := result["error"].(map[string]any)
	if !ok {
		return ""
	}
	var rows []string
	rows = append(rows, "error result:")
	if code := firstStringValue(errorPayload, "code", "type"); code != "" {
		rows = append(rows, "code: "+code)
	}
	if message := firstStringValue(errorPayload, "message", "error"); message != "" {
		rows = append(rows, "message: "+shortenKnownPaths(message))
	}
	if nextAction := firstStringValue(errorPayload, "next_action", "recovery"); nextAction != "" {
		rows = append(rows, "next action: "+shortenKnownPaths(nextAction))
	}
	if path := firstStringValue(errorPayload, "path", "filepath", "file"); path != "" {
		rows = append(rows, "path: "+shortenPathForInline(path))
	}
	if field := firstStringValue(errorPayload, "field"); field != "" {
		rows = append(rows, "field: "+field)
	}
	if tool := firstStringValue(errorPayload, "tool"); tool != "" {
		rows = append(rows, "tool: "+tool)
	}
	return strings.Join(rows, "\n")
}

func summarizeTableLikeResult(label string, result map[string]any) string {
	rows := summarizeStatusRows(result)
	if path := firstStringValue(result, "path", "file", "file_path", "dataset_path"); path != "" {
		rows = append(rows, "file: "+path)
	}
	if table := firstStringValue(result, "table", "dataset", "name"); table != "" {
		rows = append(rows, "dataset: "+table)
	}
	dtype := firstStringValue(result, "dtype", "type", "data_type")
	if column := firstStringValue(result, "column", "column_name", "field", "variable"); column != "" {
		line := "column: " + column
		if dtype != "" {
			line += " · type: " + dtype
		}
		rows = append(rows, line)
	}
	stats := summarizeNumericFields(result, []string{
		"rows", "row_count", "count", "nulls", "null_count", "unique", "mean", "std", "min", "median", "max",
	})
	if stats != "" {
		rows = append(rows, stats)
	}
	if dtype != "" && firstStringValue(result, "column", "column_name", "field", "variable") == "" {
		rows = append(rows, "type: "+dtype)
	}
	if cols := summarizeColumnNames(result); cols != "" {
		rows = append(rows, "columns: "+cols)
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{label + " result:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeContainerResult(label string, result map[string]any) string {
	rows := summarizeStatusRows(result)
	if path := firstStringValue(result, "path", "file", "file_path"); path != "" {
		rows = append(rows, "file: "+path)
	}
	if datasets := summarizeNamedItems(result, "datasets", "dataset_paths", "groups"); datasets != "" {
		rows = append(rows, "datasets: "+datasets)
	}
	if variables := summarizeNamedItems(result, "variables", "variable_names"); variables != "" {
		rows = append(rows, "variables: "+variables)
	}
	if attrs := summarizeNamedItems(result, "attributes", "attrs"); attrs != "" {
		rows = append(rows, "attributes: "+attrs)
	}
	if shape := summarizeNamedItems(result, "shape", "dims", "dimensions"); shape != "" {
		rows = append(rows, "shape: "+shape)
	}
	if dtype := firstStringValue(result, "dtype", "type", "data_type"); dtype != "" {
		rows = append(rows, "type: "+dtype)
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{label + " result:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeSACResult(result map[string]any) string {
	rows := summarizeStatusRows(result)
	if artifact := firstStringValue(result, "output_path", "artifact_path", "artifact", "value"); artifact != "" {
		rows = append(rows, "artifact: "+shortenPathForInline(artifact))
	}
	if stats := summarizeNumericFields(result, []string{
		"sac_trace_count", "traces_plotted", "traces_analyzed", "traces", "npts", "sample_rate_hz", "sampling_rate", "delta", "duration_s", "duration", "min", "max", "mean",
	}); stats != "" {
		rows = append(rows, stats)
	}
	if path := firstStringValue(result, "path", "file", "file_path", "filepath"); path != "" {
		rows = append(rows, "file: "+shortenPathForInline(path))
	}
	if station := firstStringValue(result, "station", "kstnm"); station != "" {
		rows = append(rows, "station: "+station)
	}
	if channel := firstStringValue(result, "channel", "kcmpnm", "component"); channel != "" {
		rows = append(rows, "channel: "+channel)
	}
	if members := summarizeNamedItems(result, "members", "sample_members"); members != "" {
		rows = append(rows, "members: "+shortenKnownPaths(members))
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{"sac result:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeShellResult(result map[string]any) string {
	rows := summarizeStatusRows(result)
	if code, ok := floatValue(result["exit_code"]); ok {
		rows = append(rows, fmt.Sprintf("exit_code: %.0f", code))
	}
	for _, key := range []string{"stdout", "stderr", "error"} {
		if text := strings.TrimSpace(stringValue(result[key])); text != "" {
			rows = append(rows, key+": "+truncateString(strings.Join(strings.Fields(text), " "), 220))
		}
	}
	if len(rows) == 0 {
		return ""
	}
	return strings.Join(rows, "\n")
}

func summarizeVisualizationResult(result map[string]any) string {
	rows := summarizeStatusRows(result)
	if path := firstStringValue(result, "output_path", "artifact_path", "artifact", "value", "path", "file", "file_path"); path != "" {
		rows = append(rows, "artifact: "+shortenPathForInline(path))
	}
	if chart := firstStringValue(result, "chart_type", "plot_type", "type"); chart != "" {
		rows = append(rows, "chart: "+chart)
	}
	if x := firstStringValue(result, "x_column", "x", "x_axis"); x != "" {
		rows = append(rows, "x: "+x)
	}
	if y := firstStringValue(result, "y_column", "y", "y_axis"); y != "" {
		rows = append(rows, "y: "+y)
	}
	if summary := firstStringValue(result, "title", "summary", "description"); summary != "" {
		rows = append(rows, "summary: "+truncateString(strings.Join(strings.Fields(summary), " "), 180))
	}
	if len(rows) == 0 {
		return ""
	}
	rows = append([]string{"artifact result:"}, rows...)
	return strings.Join(rows, "\n")
}

func summarizeStatusRows(result map[string]any) []string {
	var rows []string
	if status := firstStringValue(result, "status", "state"); status != "" {
		rows = append(rows, "status: "+status)
	} else if meta, ok := result["_meta"].(map[string]any); ok {
		if status := firstStringValue(meta, "status", "state"); status != "" {
			rows = append(rows, "status: "+status)
		}
	}
	if errText := firstStringValue(result, "error", "message"); errText != "" {
		rows = append(rows, "error: "+errText)
	}
	return rows
}

func firstStringValue(result map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(stringValue(result[key])); value != "" {
			return value
		}
	}
	return ""
}

func summarizeNumericFields(result map[string]any, keys []string) string {
	var bits []string
	for _, key := range keys {
		if value, ok := floatValue(result[key]); ok {
			bits = append(bits, fmt.Sprintf("%s: %s", key, formatCompactFloat(value)))
		}
	}
	return strings.Join(bits, " · ")
}

func formatCompactFloat(value float64) string {
	if value == float64(int64(value)) {
		return fmt.Sprintf("%.0f", value)
	}
	return fmt.Sprintf("%.4g", value)
}

func summarizeColumnNames(result map[string]any) string {
	for _, key := range []string{"columns", "schema", "fields"} {
		if text := summarizeNamedItems(result, key); text != "" {
			return text
		}
	}
	return ""
}

func summarizeNamedItems(result map[string]any, keys ...string) string {
	for _, key := range keys {
		if text := summarizeAnyItems(result[key]); text != "" {
			return text
		}
	}
	return ""
}

func summarizeAnyItems(raw any) string {
	switch value := raw.(type) {
	case nil:
		return ""
	case []any:
		items := make([]string, 0, min(len(value), 5))
		for _, item := range value {
			items = appendSummaryItem(items, item)
			if len(items) >= 5 {
				break
			}
		}
		if len(value) > len(items) {
			items = append(items, fmt.Sprintf("... %d more", len(value)-len(items)))
		}
		return strings.Join(items, ", ")
	case map[string]any:
		if nested, ok := value["items"]; ok {
			return summarizeAnyItems(nested)
		}
		items := make([]string, 0, min(len(value), 5))
		keys := make([]string, 0, len(value))
		for key := range value {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			item := value[key]
			label := strings.TrimSpace(key)
			if label == "" {
				continue
			}
			if itemMap, ok := item.(map[string]any); ok {
				if dtype := firstStringValue(itemMap, "dtype", "type", "data_type"); dtype != "" {
					label += " " + dtype
				}
			}
			items = append(items, label)
			if len(items) >= 5 {
				break
			}
		}
		if len(value) > len(items) {
			items = append(items, fmt.Sprintf("... %d more", len(value)-len(items)))
		}
		return strings.Join(items, ", ")
	case string:
		return strings.TrimSpace(value)
	default:
		return strings.TrimSpace(fmt.Sprint(value))
	}
}

func appendSummaryItem(items []string, item any) []string {
	switch typed := item.(type) {
	case string:
		if text := strings.TrimSpace(typed); text != "" {
			return append(items, text)
		}
	case map[string]any:
		name := firstNonEmpty(
			firstStringValue(typed, "name", "path", "column", "dataset", "variable", "title"),
			"(unnamed)",
		)
		if dtype := firstStringValue(typed, "dtype", "type", "data_type"); dtype != "" {
			name += " " + dtype
		}
		return append(items, name)
	default:
		text := strings.TrimSpace(fmt.Sprint(item))
		if text != "" {
			return append(items, text)
		}
	}
	return items
}

func summarizeNDPResult(result map[string]any) string {
	var rows []string
	if status := stringValue(result["status"]); status != "" {
		rows = append(rows, "status: "+status)
	} else if meta, ok := result["_meta"].(map[string]any); ok {
		if status := stringValue(meta["status"]); status != "" {
			rows = append(rows, "status: "+status)
		}
	}
	if count, ok := floatValue(result["count"]); ok {
		rows = append(rows, fmt.Sprintf("count: %.0f", count))
	}
	if ds, ok := result["datasets"].(map[string]any); ok {
		if items, ok := ds["items"].([]any); ok {
			rows = append(rows, summarizeNDPItems("datasets", items)...)
		}
	}
	if orgs, ok := result["organizations"].(map[string]any); ok {
		if items, ok := orgs["items"].([]any); ok {
			rows = append(rows, summarizeNDPItems("organizations", items)...)
		}
	}
	if len(rows) == 0 {
		return ""
	}
	return strings.Join(rows, "\n")
}

func summarizeNDPItems(label string, items []any) []string {
	rows := []string{fmt.Sprintf("%s:", label)}
	limit := min(len(items), 5)
	for i := 0; i < limit; i++ {
		item, ok := items[i].(map[string]any)
		if !ok {
			continue
		}
		title := firstNonEmpty(
			stringValue(item["title"]),
			stringValue(item["name"]),
			stringValue(item["id"]),
		)
		if title == "" {
			title = "(untitled)"
		}
		var bits []string
		if org := stringValue(item["owner_org"]); org != "" {
			bits = append(bits, "org: "+org)
		}
		if n, ok := floatValue(item["resource_count"]); ok {
			bits = append(bits, fmt.Sprintf("resources: %.0f", n))
		}
		if formats := compactStringItems(item["resource_formats"]); formats != "" {
			bits = append(bits, "formats: "+formats)
		}
		if url := firstCompactStringItem(item["resource_urls"]); url != "" {
			bits = append(bits, "url: "+url)
		}
		suffix := ""
		if len(bits) > 0 {
			suffix = " · " + strings.Join(bits, " · ")
		}
		rows = append(rows, "- "+title+suffix)
	}
	if hidden := len(items) - limit; hidden > 0 {
		rows = append(rows, fmt.Sprintf("... %d more", hidden))
	}
	return rows
}

func compactStringItems(raw any) string {
	container, ok := raw.(map[string]any)
	if !ok {
		return ""
	}
	items, ok := container["items"].([]any)
	if !ok {
		return ""
	}
	values := make([]string, 0, min(len(items), 4))
	for _, item := range items {
		value := strings.TrimSpace(fmt.Sprint(item))
		if value != "" {
			values = append(values, value)
		}
		if len(values) >= 4 {
			break
		}
	}
	return strings.Join(values, ", ")
}

func firstCompactStringItem(raw any) string {
	container, ok := raw.(map[string]any)
	if !ok {
		return ""
	}
	items, ok := container["items"].([]any)
	if !ok || len(items) == 0 {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(items[0]))
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
	if sid := a.replaySessionID(stringValue(mp["session_id"])); a.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	m := decodeMessage(mp)
	normalizeMessagePresentation(&m)
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
	if sid := a.replaySessionID(stringValue(pl["session_id"])); a.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	part := decodePart(partRaw)
	if part.CallID != "" && (part.Type == gact.PartTypeToolCall || part.Type == gact.PartTypeToolResult) {
		a.removeSyntheticSemanticToolParts(part.CallID)
	}
	for i := range a.messages {
		if a.messages[i].ID == msgID {
			for j := range a.messages[i].Parts {
				if part.ID != "" && a.messages[i].Parts[j].ID == part.ID {
					a.messages[i].Parts[j] = part
					normalizeMessagePresentation(&a.messages[i])
					return
				}
			}
			a.messages[i].Parts = append(a.messages[i].Parts, part)
			normalizeMessagePresentation(&a.messages[i])
			return
		}
	}
}

func (a *App) applySemanticEvent(e client.SSEEvent) {
	pl := eventPayload(e)
	if len(pl) == 0 {
		return
	}
	sid := a.replaySessionID(stringValue(pl["session_id"]))
	if sid == "" {
		sid = a.currentSessionID()
	}
	if a.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	eventType := firstNonEmpty(stringValue(pl["event_type"]), e.Type)
	if eventType == "" {
		return
	}
	partID := semanticEventPartID(e, eventType, stringValue(pl["turn_id"]))
	msg := a.ensureSemanticLiveMessage(sid, stringValue(pl["turn_id"]))
	if msg == nil || messageHasPartID(*msg, partID) {
		return
	}
	part := gact.Part{
		ID:       partID,
		Type:     gact.PartTypeThinking,
		Thinking: semanticEventSummary(pl, eventType),
		Metadata: map[string]any{
			"semantic_event": true,
			"event_type":     eventType,
			"trace_id":       stringValue(pl["trace_id"]),
			"turn_id":        stringValue(pl["turn_id"]),
			"status":         stringValue(pl["status"]),
			"detail_level":   stringValue(pl["detail_level"]),
			"stream_source":  "semantic_event",
			"raw_event":      pl,
		},
	}
	msg.Parts = append(msg.Parts, part)
}

func (a *App) applyToolCallStarted(e client.SSEEvent) {
	pl := eventPayload(e)
	if len(pl) == 0 {
		return
	}
	sid := a.replaySessionID(stringValue(pl["session_id"]))
	if sid == "" {
		sid = a.currentSessionID()
	}
	if a.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	callID := firstNonEmpty(stringValue(pl["call_id"]), stringValue(pl["id"]))
	toolName := firstNonEmpty(stringValue(pl["tool"]), stringValue(pl["tool_name"]), "tool")
	if callID == "" {
		callID = "semantic_" + stableIDFragment(toolName+"_"+stringValue(pl["turn_id"])+"_"+e.ID)
	}
	if a.hasToolPart(callID, gact.PartTypeToolCall) {
		return
	}
	msg := a.ensureSemanticLiveMessage(sid, stringValue(pl["turn_id"]))
	if msg == nil {
		return
	}
	msg.Parts = append(msg.Parts, gact.Part{
		ID:       "semantic_" + callID + "_call",
		Type:     gact.PartTypeToolCall,
		CallID:   callID,
		ToolName: toolName,
		Input:    mapValue(pl["args"]),
		Metadata: map[string]any{
			"semantic_event":   true,
			"stream_source":    "semantic_event",
			"telemetry_source": firstNonEmpty(stringValue(pl["telemetry_source"]), "semantic_event"),
			"status":           "running",
			"raw_event":        pl,
		},
	})
}

func (a *App) applyToolCallCompleted(e client.SSEEvent) {
	pl := eventPayload(e)
	if len(pl) == 0 {
		return
	}
	sid := a.replaySessionID(stringValue(pl["session_id"]))
	if sid == "" {
		sid = a.currentSessionID()
	}
	if a.shouldIgnoreSessionReplay(sid, e) {
		return
	}
	callID := firstNonEmpty(stringValue(pl["call_id"]), stringValue(pl["id"]))
	toolName := firstNonEmpty(stringValue(pl["tool"]), stringValue(pl["tool_name"]), "tool")
	if callID == "" {
		callID = "semantic_" + stableIDFragment(toolName+"_"+stringValue(pl["turn_id"])+"_"+e.ID)
	}
	if a.hasToolPart(callID, gact.PartTypeToolResult) {
		return
	}
	msg := a.ensureSemanticLiveMessage(sid, stringValue(pl["turn_id"]))
	if msg == nil {
		return
	}
	errText := firstNonEmpty(stringValue(pl["error"]), stringValue(pl["message"]))
	okResult, okKnown := optionalBoolValue(pl["ok"])
	resultText := firstNonEmpty(errText, stringValue(pl["summary"]), "completed")
	result := gact.Part{
		ID:       "semantic_" + callID + "_result",
		Type:     gact.PartTypeToolResult,
		CallID:   callID,
		ToolName: toolName,
		IsError:  errText != "" || (okKnown && !okResult),
		Content: []gact.Part{{
			ID:   "semantic_" + callID + "_result_text",
			Type: gact.PartTypeText,
			Text: resultText,
		}},
		Metadata: map[string]any{
			"semantic_event":   true,
			"stream_source":    "semantic_event",
			"telemetry_source": firstNonEmpty(stringValue(pl["telemetry_source"]), "semantic_event"),
			"raw_event":        pl,
		},
	}
	if duration, ok := floatValue(pl["duration_ms"]); ok {
		result.DurationMS = duration
	}
	if cached, ok := pl["cached"].(bool); ok {
		result.Cached = cached
	}
	msg.Parts = append(msg.Parts, result)
}

func (a *App) ensureSemanticLiveMessage(sessionID, turnID string) *gact.Message {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		sessionID = a.currentSessionID()
	}
	if sessionID == "" {
		return nil
	}
	msgID := "semantic_live"
	if turnID != "" {
		msgID += "_" + stableIDFragment(turnID)
	} else {
		msgID += "_" + stableIDFragment(sessionID)
	}
	for i := range a.messages {
		if a.messages[i].ID == msgID {
			return &a.messages[i]
		}
	}
	now := time.Now()
	a.messages = append(a.messages, gact.Message{
		ID:        msgID,
		SessionID: sessionID,
		Role:      gact.RoleAssistant,
		CreatedAt: now,
		UpdatedAt: now,
		Metadata: map[string]any{
			"semantic_live_message": true,
			"turn_id":               turnID,
		},
	})
	return &a.messages[len(a.messages)-1]
}

func (a *App) hasToolPart(callID, partType string) bool {
	callID = strings.TrimSpace(callID)
	if callID == "" {
		return false
	}
	for _, msg := range a.messages {
		for _, part := range msg.Parts {
			if part.CallID == callID && part.Type == partType {
				return true
			}
		}
	}
	return false
}

func (a *App) removeSyntheticSemanticToolParts(callID string) {
	callID = strings.TrimSpace(callID)
	if callID == "" {
		return
	}
	for mi := range a.messages {
		parts := a.messages[mi].Parts[:0]
		for _, part := range a.messages[mi].Parts {
			if part.CallID == callID && part.Metadata != nil && part.Metadata["semantic_event"] == true {
				continue
			}
			parts = append(parts, part)
		}
		a.messages[mi].Parts = parts
	}
}

func messageHasPartID(msg gact.Message, partID string) bool {
	partID = strings.TrimSpace(partID)
	if partID == "" {
		return false
	}
	for _, part := range msg.Parts {
		if part.ID == partID {
			return true
		}
	}
	return false
}

func semanticEventPartID(e client.SSEEvent, eventType, turnID string) string {
	if e.ID != "" {
		return "semantic_event_" + stableIDFragment(e.ID)
	}
	if pl := eventPayload(e); stringValue(pl["event_id"]) != "" {
		return "semantic_event_" + stableIDFragment(stringValue(pl["event_id"]))
	}
	return "semantic_event_" + stableIDFragment(eventType+"_"+turnID+"_"+stringValue(e.Payload["occurred_at"]))
}

func eventPayload(e client.SSEEvent) map[string]any {
	if pl, ok := e.Payload["payload"].(map[string]any); ok && len(pl) > 0 {
		return pl
	}
	return e.Payload
}

func semanticEventSummary(payload map[string]any, eventType string) string {
	bits := []string{"event: " + eventType}
	if status := stringValue(payload["status"]); status != "" {
		bits = append(bits, "status: "+status)
	}
	if summary := stringValue(payload["summary"]); summary != "" {
		bits = append(bits, "summary: "+summary)
	}
	if blueprint := compactSemanticMap(payload["blueprint"]); blueprint != "" {
		bits = append(bits, "blueprint: "+blueprint)
	}
	if provider := compactSemanticMap(payload["provider"]); provider != "" {
		bits = append(bits, "provider: "+provider)
	}
	if actor := compactSemanticMap(payload["actor"]); actor != "" {
		bits = append(bits, "actor: "+actor)
	}
	if subject := compactSemanticMap(payload["subject"]); subject != "" {
		bits = append(bits, "subject: "+subject)
	}
	if detail := compactSemanticPayload(payload["payload"]); detail != "" {
		bits = append(bits, "payload: "+detail)
	}
	return strings.Join(bits, " · ")
}

func compactSemanticPayload(raw any) string {
	m := mapValue(raw)
	if len(m) == 0 {
		return ""
	}
	preferred := []string{
		"tool",
		"tool_name",
		"call_id",
		"telemetry_source",
		"duration_ms",
		"cached",
		"ok",
		"error",
		"route",
		"selected_agent",
		"parent_id",
		"agent_id",
		"model",
		"provider",
	}
	seen := map[string]bool{}
	var parts []string
	for _, key := range preferred {
		if value := semanticScalarText(m[key]); value != "" {
			parts = append(parts, key+"="+value)
			seen[key] = true
		}
	}
	if len(parts) >= 4 {
		return strings.Join(parts[:4], ", ")
	}
	keys := make([]string, 0, len(m))
	for key := range m {
		if !seen[key] {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		if value := semanticScalarText(m[key]); value != "" {
			parts = append(parts, key+"="+value)
			if len(parts) >= 4 {
				break
			}
		}
	}
	return strings.Join(parts, ", ")
}

func compactSemanticMap(raw any) string {
	m := mapValue(raw)
	if len(m) == 0 {
		return ""
	}
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var parts []string
	for _, key := range keys {
		if value := semanticScalarText(m[key]); value != "" {
			parts = append(parts, key+"="+value)
		}
	}
	return strings.Join(parts, ", ")
}

func semanticScalarText(v any) string {
	switch value := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(value)
	case bool:
		if value {
			return "true"
		}
		return "false"
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64, json.Number:
		return strings.TrimSpace(fmt.Sprint(value))
	default:
		return ""
	}
}

func optionalBoolValue(v any) (bool, bool) {
	switch b := v.(type) {
	case bool:
		return b, true
	case string:
		b = strings.TrimSpace(strings.ToLower(b))
		switch b {
		case "true", "ok", "success", "completed", "complete", "done":
			return true, true
		case "false", "error", "failed", "failure":
			return false, true
		}
		return false, false
	default:
		return false, false
	}
}

func stableIDFragment(s string) string {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return fmt.Sprintf("%08x", h.Sum32())
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
	if sid := a.replaySessionID(stringValue(pl["session_id"])); a.shouldIgnoreSessionReplay(sid, e) {
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
			if v, ok := pl["stream_source"].(string); ok && v != "" {
				if a.messages[i].Parts[j].Metadata == nil {
					a.messages[i].Parts[j].Metadata = map[string]any{}
				}
				a.messages[i].Parts[j].Metadata["stream_source"] = v
			}
			if v, ok := pl["stream_fallback"].(map[string]any); ok && len(v) > 0 {
				if a.messages[i].Parts[j].Metadata == nil {
					a.messages[i].Parts[j].Metadata = map[string]any{}
				}
				a.messages[i].Parts[j].Metadata["stream_fallback"] = v
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
	if sid := a.replaySessionID(stringValue(pl["session_id"])); a.shouldIgnoreSessionReplay(sid, e) {
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
	a.beginHitFrame()
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
	if a.MouseEnabled {
		v.MouseMode = tea.MouseModeCellMotion
	}
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
	a.registerScreenSurfaceHit("connecting:retry", func(app *App) tea.Cmd {
		app.stage = StageConnecting
		app.connectRetryAttempts = 0
		return app.connectCmd()
	})
	box := lipgloss.NewStyle().
		Width(a.width).Height(a.height).
		Align(lipgloss.Center, lipgloss.Center).
		Foreground(t.Fg).Background(t.Bg)
	body := lipgloss.JoinVertical(lipgloss.Center,
		t.HeaderTitle.Render(" "+a.localizer.t(msgChromeConnectingTitle, nil)+" "),
		"",
		t.HintLabel.Render(a.localizer.t(msgChromeConnectingStatus,
			map[string]string{"backend": a.BackendURL})),
		"",
		t.HintLabel.Italic(true).Render(a.localizer.t(msgChromeConnectingRetry, nil)),
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
	a.registerScreenSurfaceHit("intro:continue", func(app *App) tea.Cmd {
		app.stage = StageConnecting
		return app.connectCmd()
	})
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
	nameText := strings.Join(name, "\n")
	if a.width > 0 && lipgloss.Width(nameText) > a.width-4 {
		nameText = "CLIO"
	}
	box := lipgloss.NewStyle().
		Width(a.width).Height(a.height).
		Align(lipgloss.Center, lipgloss.Center).
		Foreground(t.Fg).Background(t.Bg)
	nameBlock := nameStyle.Render(nameText)
	hint := t.HintLabel.Italic(true).Render("press any key to continue")
	parts := []string{}
	if strings.TrimSpace(ansi.Strip(logoBlock)) != "" {
		parts = append(parts, logoBlock)
	}
	if len(parts) > 0 {
		parts = append(parts, "")
	}
	parts = append(parts, nameBlock, "", hint)
	body := lipgloss.JoinVertical(lipgloss.Center, parts...)
	if a.height > 0 && lipgloss.Height(body) > a.height {
		body = lipgloss.JoinVertical(lipgloss.Center, nameBlock, "", hint)
	}
	if a.height > 0 && lipgloss.Height(body) > a.height {
		body = lipgloss.JoinVertical(lipgloss.Center, nameStyle.Render("CLIO"), hint)
	}
	return box.Render(body)
}

func (a *App) viewError() string {
	t := a.Theme
	modal := a.viewErrorModal()
	return lipgloss.NewStyle().
		Width(a.width).
		Height(a.height).
		Foreground(t.Fg).
		Background(t.Bg).
		Render(overlay(blankScreen(a.width, a.height, t.Bg), modal, a.width, a.height))
}

func (a *App) viewErrorModal() string {
	t := a.Theme
	w := a.modalWidth()
	contentW := modalInsetListWidth(w)
	hint := t.HintLabel.Render(a.localizer.t(msgChromeBackend,
		map[string]string{"backend": a.BackendURL}))
	retryHint := ""
	if a.connectRetryAttempts > 0 {
		retryHint = t.HintLabel.Render(fmt.Sprintf(
			"auto-retry pending (attempt %d)", a.connectRetryAttempts+1))
	}
	errorText := lipgloss.NewStyle().
		Foreground(t.Fg).
		Background(t.BgSubtle).
		Width(contentW).
		Render(a.stageError)
	rows := []string{errorText, "", hint}
	if retryHint != "" {
		rows = append(rows, "", retryHint)
	}
	buttons := []menuButton{
		{
			id:    "error:retry",
			label: "retry",
			action: func(app *App) tea.Cmd {
				app.stage = StageConnecting
				app.connectRetryAttempts = 0
				return app.connectCmd()
			},
		},
		{
			id:    "error:quit",
			label: "quit",
			action: func(app *App) tea.Cmd {
				return tea.Quit
			},
		},
	}
	modal := a.renderModalFrame(modalFrameOptions{
		width:      w,
		title:      a.localizer.t(msgChromeConnectionError, nil),
		titleColor: t.Danger,
		border:     t.Danger,
		buttons:    buttons,
		body:       lipgloss.JoinVertical(lipgloss.Left, rows...),
		footer: t.HintKey.Render("Ctrl+R") + t.HintLabel.Render(" retry now  ") +
			t.HintKey.Render("Ctrl+C") + t.HintLabel.Render(" quit"),
	})
	return modal
}

func blankScreen(width int, height int, bg color.Color) string {
	if width < 1 || height < 1 {
		return ""
	}
	line := lipgloss.NewStyle().Background(bg).Render(strings.Repeat(" ", width))
	lines := make([]string, height)
	for i := range lines {
		lines[i] = line
	}
	return strings.Join(lines, "\n")
}

func (a *App) viewMain() string {
	base := a.viewMainBase()
	if a.hits != nil {
		a.baseHitTargetCount = len(a.hits.targets)
	}
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
	if a.sidebarLayoutOpen {
		base = overlay(base, a.viewSidebarLayoutEditor(), a.width, a.height)
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
	if a.sessionActionsOpen {
		base = overlay(base, a.viewSessionActions(), a.width, a.height)
	}
	if a.contextActionsOpen {
		base = overlay(base, a.viewContextActions(), a.width, a.height)
	}
	if a.conversationActionsOpen {
		base = overlay(base, a.viewConversationActions(), a.width, a.height)
	}
	if a.askUserOpen {
		base = overlay(base, a.viewAskUser(), a.width, a.height)
	}
	if a.retryNotesOpen {
		base = overlay(base, a.viewRetryNotes(), a.width, a.height)
	}
	if a.retryModelOpen {
		base = overlay(base, a.viewRetryModel(), a.width, a.height)
	}
	if a.contextAddOpen {
		base = overlay(base, a.viewContextAdd(), a.width, a.height)
	}
	if a.catalogBrowserOpen {
		base = overlay(base, a.viewCatalogBrowser(), a.width, a.height)
	}
	if a.promptEditOpen {
		base = overlay(base, a.viewPromptEdit(), a.width, a.height)
	}
	if a.agentWriteOpen {
		base = overlay(base, a.viewAgentWrite(), a.width, a.height)
	}
	if a.agentEditOpen {
		base = overlay(base, a.viewAgentEdit(), a.width, a.height)
	}
	if a.agentBlueprintManageOpen {
		base = overlay(base, a.viewAgentBlueprintManage(), a.width, a.height)
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
	sidebarW, bodyH, convH := a.mainPaneGeometry()
	rightSidebarW := a.rightSidebarWidth(sidebarW)
	bodyW := a.width - sidebarW - rightSidebarW
	if bodyW < 20 {
		bodyW = 20
	}

	// LLL5: align the sidebar's bottom border with the conversation
	// pane's bottom border. Previously the sidebar took the full bodyH
	// (which includes the input box + transient hint row), so its
	// bottom corner sat 3+ rows below the conversation pane's corner —
	// the seam between sidebar `╯` and input `╭` looked broken.
	// Compute the same convH that renderBody uses for the left sidebar.
	// The optional right sidebar spans bodyH so its hit target owns the
	// full column beside both the transcript and composer.
	sidebar := a.renderSidebar(sidebarW, convH)
	sidebar = fitLinesWithBackground(sidebar, convH, a.Theme.Bg)

	prevBodyOffset := a.bodyHitOffsetX
	a.bodyHitOffsetX = renderedBlockWidth(sidebar)
	body := a.renderBody(bodyW, bodyH)
	body = fitLinesWithBackground(body, bodyH, a.Theme.Bg)
	a.bodyHitOffsetX = prevBodyOffset

	rightSidebar := ""
	if rightSidebarW > 0 {
		rightOffsetX := renderedBlockWidth(sidebar) + renderedBlockWidth(body)
		rightSidebar = a.renderRightSidebar(rightSidebarW, bodyH, rightOffsetX)
		rightSidebar = fitLinesWithBackground(rightSidebar, bodyH, a.Theme.Bg)
	}

	// CCCCC1: force exact row counts on both stacks. lipgloss's
	// .Height(N) only sets a *minimum* outer height; if the inner
	// content is shorter the pane stays short and the border `╰╯`
	// floats up. fitLines guarantees both stacks span the rows the
	// horizontal layout expects.
	rowParts := []string{sidebar, body}
	if rightSidebarW > 0 {
		rowParts = append(rowParts, rightSidebar)
	}
	row := lipgloss.JoinHorizontal(lipgloss.Top, rowParts...)
	header := a.renderHeaderForWidth(a.width)
	footer := a.renderFooter()
	full := lipgloss.JoinVertical(lipgloss.Left, header, row, footer)
	// Final belt-and-braces clip — if any subpane still overflows
	// (e.g. a stray soft-wrap from an ultra-wide paste) we'd rather
	// lose the first row than let the footer slip off screen.
	return clampLines(full, a.height)
}

func (a *App) mainPaneGeometry() (sidebarW int, bodyH int, convH int) {
	const headerH = 1
	const footerH = 1
	bodyH = a.height - headerH - footerH
	if bodyH < 5 {
		bodyH = 5
	}
	sidebarW = 30
	if sidebarW > a.width/3 {
		sidebarW = a.width / 3
	}
	convH = a.conversationPaneHeight(bodyH)
	return sidebarW, bodyH, convH
}

func (a *App) rightSidebarWidth(leftSidebarW int) int {
	if len(a.rightSidebarModules()) == 0 {
		return 0
	}
	width := 30
	if maxW := a.width / 4; maxW > 0 && width > maxW {
		width = maxW
	}
	if width < 24 {
		width = 24
	}
	if a.width-leftSidebarW-width < 60 {
		return 0
	}
	return width
}

func (a *App) renderHeader() string {
	return a.renderHeaderForWidth(a.width)
}

func (a *App) renderHeaderForWidth(width int) string {
	t := a.Theme
	// Required parts (badge + connection label + SSE health dot) always render.
	// Optional parts (workspace + session + status) are dropped when
	// there's no room.
	actions := a.headerActions()
	actionBar := a.renderHeaderActionBar(actions)
	actionW := lipgloss.Width(ansi.Strip(actionBar))
	badge := t.HeaderTitle.Render(" GACT ")
	dot := t.Header.Render(" " + a.sseHealthDot() + " ")
	backendLabel := a.headerBackendLabel()
	backend := t.Header.Render(backendLabel)
	required := lipgloss.JoinHorizontal(lipgloss.Top, badge, dot, backend)
	if width < 1 {
		width = a.width
	}
	avail := width - lipgloss.Width(required) - actionW

	optional := []headerChip{}
	if workspaceName := a.headerWorkspaceLabel(); workspaceName != "" {
		optional = append(optional, headerChip{
			id: "workspace",
			label: a.localizer.t(msgChromeWorkspace,
				map[string]string{"value": workspaceName}),
			action: func(app *App) tea.Cmd {
				app.openWorkspaceSwitch()
				return nil
			},
		})
	}
	if a.selected >= 0 && a.selected < len(a.sessions) {
		s := a.sessions[a.selected]
		optional = append(optional, headerChip{
			id: "session",
			label: a.localizer.t(msgChromeSession,
				map[string]string{"value": s.Title}),
			action: func(app *App) tea.Cmd {
				app.focus = FocusSidebar
				app.sidebarSectionFocus = sidebarSectionSessions
				app.sidebarSectionCursor = false
				app.ensureSelectedVisible()
				return nil
			},
		})
		if model := a.headerModelLabel(s); model != "" {
			optional = append(optional, headerChip{
				id: "model",
				label: a.localizer.t(msgChromeModel,
					map[string]string{"value": model}),
				action: func(app *App) tea.Cmd {
					return app.openSettingsTab(0)
				},
			})
		}
		if agent := a.headerAgentLabel(s.Agent); agent != "" {
			optional = append(optional, headerChip{
				id:    "agent",
				label: agent,
				action: func(app *App) tea.Cmd {
					return app.openSettingsTab(1)
				},
			})
		}
		if routing := a.headerRoutingLabel(s); routing != "" {
			optional = append(optional, headerChip{
				id:    "routing",
				label: routing,
				action: func(app *App) tea.Cmd {
					return app.openSettingsTab(0)
				},
			})
		}
	}
	statusBadge := ""
	var statusAction uiHitAction
	if a.currentStatus != "" {
		statusBadge = t.StatusBadge.Render(a.currentStatus)
		avail -= lipgloss.Width(statusBadge)
		statusAction = func(app *App) tea.Cmd {
			if app.caps.Capabilities.IntegrationHealth {
				app.doctorOpen = true
				app.doctor = &doctorState{loading: true}
				return doctorFetchCmd(app.c)
			}
			app.metricsOpen = true
			app.metrics = &metricsState{loading: true}
			return loadMetricsCmd(app.c)
		}
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

	rendered := []string{badge, dot, backend}
	hits := []headerChip{{
		id:       "backend",
		rendered: backend,
		action: func(app *App) tea.Cmd {
			app.metricsOpen = true
			app.metrics = &metricsState{loading: true}
			return loadMetricsCmd(app.c)
		},
	}}
	for _, opt := range optional {
		styled := t.Header.Render(truncate(opt.label, avail-2))
		w := lipgloss.Width(styled)
		if w > avail {
			break
		}
		opt.rendered = styled
		rendered = append(rendered, styled)
		hits = append(hits, opt)
		avail -= w
	}
	if detachChip != "" {
		rendered = append(rendered, detachChip)
	}
	if statusBadge != "" {
		rendered = append(rendered, statusBadge)
		hits = append(hits, headerChip{id: "status", rendered: statusBadge, action: statusAction})
	}

	line := lipgloss.JoinHorizontal(lipgloss.Top, rendered...)
	pad := width - lipgloss.Width(line) - actionW
	if pad < 0 {
		pad = 0
	}
	bg := lipgloss.NewStyle().Background(t.BgSubtle).Render(strings.Repeat(" ", pad))
	header := line + bg + actionBar
	a.registerHeaderChipHits(rendered, hits)
	a.registerHeaderActionHits(lipgloss.Width(line)+pad, actions, actionW)
	return header
}

type headerChip struct {
	id       string
	label    string
	rendered string
	action   uiHitAction
}

type headerAction struct {
	id     string
	label  string
	action uiHitAction
}

func (a *App) headerActions() []headerAction {
	return []headerAction{
		{
			id:    "help",
			label: "help",
			action: func(app *App) tea.Cmd {
				app.helpOpen = true
				app.helpTab = 0
				app.helpScroll = 0
				return nil
			},
		},
		{
			id:    "settings",
			label: "settings",
			action: func(app *App) tea.Cmd {
				return app.openSettingsTab(0)
			},
		},
		{
			id:    "quit",
			label: "x",
			action: func(app *App) tea.Cmd {
				app.openQuitConfirm()
				return nil
			},
		},
	}
}

func (a *App) renderHeaderActionBar(actions []headerAction) string {
	if len(actions) == 0 {
		return ""
	}
	cells := make([]string, 0, len(actions))
	for _, action := range actions {
		cells = append(cells, a.renderHeaderActionCell(action.label))
	}
	spacer := lipgloss.NewStyle().Background(a.Theme.BgSubtle).Render(" ")
	return lipgloss.JoinHorizontal(lipgloss.Top, strings.Join(cells, spacer))
}

func (a *App) renderHeaderActionCell(label string) string {
	labelW := lipgloss.Width(label)
	width := lipgloss.Width(label) + 2
	if label == "x" {
		width = 5
	}
	leftPad, rightPad := centeredPadding(labelW, width)
	return lipgloss.NewStyle().
		Foreground(a.Theme.Bg).
		Background(a.Theme.Primary).
		Bold(true).
		PaddingLeft(leftPad).
		PaddingRight(rightPad).
		Render(label)
}

func (a *App) registerHeaderActionHits(startCol int, actions []headerAction, actionBarWidth int) {
	if a.height <= 0 || len(actions) == 0 {
		return
	}
	col := startCol
	for i, action := range actions {
		cell := ansi.Strip(a.renderHeaderActionCell(action.label))
		w := lipgloss.Width(cell)
		if i == len(actions)-1 && actionBarWidth > col-startCol {
			w = actionBarWidth - (col - startCol)
		}
		a.registerScreenHit("header:"+action.id, mouseRect{x: col, y: 0, w: w, h: 1}, action.action)
		col += w
		if i < len(actions)-1 {
			col++
		}
	}
}

func (a *App) registerHeaderChipHits(rendered []string, hits []headerChip) {
	if a.height <= 0 || len(rendered) == 0 || len(hits) == 0 {
		return
	}
	col := 0
	hitIdx := 0
	for _, segment := range rendered {
		w := lipgloss.Width(segment)
		if hitIdx < len(hits) && segment == hits[hitIdx].rendered && hits[hitIdx].action != nil {
			plain := ansi.Strip(segment)
			a.registerScreenTextSpanHit("header:chip:"+hits[hitIdx].id, col, 0, plain, 0, plain, hits[hitIdx].action)
			hitIdx++
		}
		col += w
	}
}

func (a *App) openWorkspaceSwitch() {
	a.workspaceSwitchOpen = true
	a.workspaceSwitchSel = 0
	for i, w := range a.workspaces {
		if w.ID == a.wsID {
			a.workspaceSwitchSel = i
			break
		}
	}
}

func (a *App) openSettingsTab(tab int) tea.Cmd {
	a.settingsOpen = true
	a.settings = &settingsState{tab: tab}
	a.seedSettingsSelections()
	return loadSettingsCmd(a.c, a.runtimeScope())
}

func (a *App) focusNextPane() {
	a.focusPane(1)
}

func (a *App) focusPane(delta int) {
	order := []FocusZone{FocusSidebar, FocusBody}
	if len(a.rightSidebarModules()) > 0 {
		order = append(order, FocusRightSidebar)
	}
	order = append(order, FocusInput)
	pos := 0
	for i, zone := range order {
		if zone == a.focus {
			pos = i
			break
		}
	}
	pos = (pos + delta) % len(order)
	if pos < 0 {
		pos += len(order)
	}
	a.focus = order[pos]
	a.maybeInitBodyCursor()
}

func (a *App) headerBackendLabel() string {
	if label := strings.TrimSpace(a.BackendLabel); label != "" {
		return label
	}
	return a.BackendURL
}

func (a *App) headerWorkspaceLabel() string {
	if len(a.workspaces) == 0 {
		return ""
	}
	for _, w := range a.workspaces {
		if w.ID == a.wsID {
			return workspaceHeaderLabelPlain(w)
		}
	}
	return workspaceHeaderLabelPlain(a.workspaces[0])
}

func (a *App) headerModelLabel(s gact.Session) string {
	// Historical sessions may not have a persisted model ref. In that case,
	// avoid attributing the current backend model to old trace data.
	if s.MessageCount > 0 && s.Model.ModelID == "" {
		return ""
	}
	if a.lmProviderInfo != nil && a.lmProviderInfo.Configured && a.lmProviderInfo.Model != "" {
		return compactModelLabel(a.lmProviderInfo.Provider, a.lmProviderInfo.Model)
	}
	if s.Model.ModelID == "" {
		return ""
	}
	return compactModelLabel(s.Model.ProviderID, s.Model.ModelID)
}

func compactModelLabel(provider, model string) string {
	model = strings.TrimSpace(model)
	if model == "" {
		return ""
	}
	provider = strings.TrimSpace(provider)
	if provider == "" || strings.HasPrefix(model, provider+"/") {
		return model
	}
	return provider + "/" + model
}

func (a *App) headerAgentLabel(agent gact.AgentRef) string {
	id := strings.TrimSpace(agent.ID)
	if id == "" || id == "default" || id == "main" {
		return ""
	}
	if mode := strings.TrimSpace(agent.Mode); mode != "" {
		id += " (" + mode + ")"
	}
	return a.localizer.t(msgChromeAgent, map[string]string{"id": id})
}

func (a *App) headerRoutingLabel(s gact.Session) string {
	mode := strings.TrimSpace(s.RoutingMode)
	if mode == "" {
		mode = strings.TrimSpace(s.Mode)
	}
	if mode == "" {
		return ""
	}
	return a.localizer.t(msgChromeRouting, map[string]string{"value": mode})
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
	focus := a.focusLabel(a.focus)
	if a.lmConfigOpen {
		focus = a.localizer.t(msgChromeFocusProviderSetup, nil)
	}
	left := t.HintLabel.Render(a.localizer.t(msgChromeFocus,
		map[string]string{"value": focus}))
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
				Render(a.localizer.t(msgFooterMemoryHit, nil))
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
	available := a.width - lipgloss.Width(left) - lipgloss.Width(right) - 8
	if available < 1 {
		available = 1
	}
	hintBudget := available - 16
	if hintBudget < 1 {
		hintBudget = 1
	}
	clusters := a.footerHintClusters(mk, hintBudget)
	parts := make([]string, 0, len(clusters))
	for _, c := range clusters {
		if len(c) == 0 {
			continue
		}
		parts = append(parts, strings.Join(c, dot))
	}
	hintLine := strings.Join(parts, pipe)
	gap := a.width - lipgloss.Width(left) - lipgloss.Width(hintLine) - lipgloss.Width(right) - 8
	if gap < 1 {
		gap = 1
	}
	rendered := lipgloss.NewStyle().
		Width(a.width).Background(t.BgSubtle).Foreground(t.FgMuted).
		Padding(0, 1).Render(
		left + "  " + hintLine + strings.Repeat(" ", gap) + right,
	)
	a.registerFooterActionHits(rendered)
	return rendered
}

func (a *App) registerFooterActionHits(rendered string) {
	if a.height <= 0 {
		return
	}
	plain := ansi.Strip(rendered)
	y := a.height - 1
	focus := a.focusLabel(a.focus)
	if a.lmConfigOpen {
		focus = a.localizer.t(msgChromeFocusProviderSetup, nil)
	}
	focusText := a.localizer.t(msgChromeFocus, map[string]string{"value": focus})
	a.registerFooterPlainHit(plain, y, "footer:focus", focusText, func(app *App) tea.Cmd {
		app.focusNextPane()
		return nil
	})
	a.registerFooterPlainHit(plain, y, "footer:reconnect", "(reconnecting…)", func(app *App) tea.Cmd {
		return app.connectCmd()
	})
	a.registerFooterPlainHit(plain, y, "footer:memory", a.localizer.t(msgFooterMemoryHit, nil), func(app *App) tea.Cmd {
		if !app.caps.Capabilities.Memory {
			return nil
		}
		return loadMemoryInspectorCmd(app.c, app.runtimeScope(), app.messages)
	})
	a.registerFooterActionHit(plain, y, "footer:pane", "Tab", a.localizer.t(msgFooterPane, nil), func(app *App) tea.Cmd {
		app.focusNextPane()
		return nil
	})
	a.registerFooterActionHit(plain, y, "footer:settings", "Ctrl+S", a.localizer.t(msgFooterSettings, nil), func(app *App) tea.Cmd {
		return app.openSettingsTab(0)
	})
	a.registerFooterActionHit(plain, y, "footer:command", "/", a.localizer.t(msgFooterCommand, nil), func(app *App) tea.Cmd {
		app.openCommandPalette()
		return nil
	})
	a.registerFooterActionHit(plain, y, "footer:help", "?", a.localizer.t(msgFooterHelp, nil), func(app *App) tea.Cmd {
		app.helpOpen = true
		app.helpTab = 0
		app.helpScroll = 0
		return nil
	})
	a.registerFooterActionHit(plain, y, "footer:conversation:details", "Enter/Ctrl+E", a.localizer.t(msgFooterConversationDetails, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.handleBodyKey(keyMsg("enter"))
		return cmd
	})
	a.registerFooterActionHit(plain, y, "footer:conversation:bottom", "G", a.localizer.t(msgFooterConversationBottom, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.handleBodyKey(keyMsg("G"))
		return cmd
	})
	a.registerFooterActionHit(plain, y, "footer:conversation:copy", "y", a.localizer.t(msgFooterConversationCopy, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.handleBodyKey(keyMsg("y"))
		return cmd
	})
	a.registerFooterActionHit(plain, y, "footer:conversation:copy-full", "Y", a.localizer.t(msgFooterConversationCopyFull, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.handleBodyKey(keyMsg("Y"))
		return cmd
	})
	a.registerFooterActionHit(plain, y, "footer:conversation:retry", "R", a.localizer.t(msgFooterConversationRetry, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.handleBodyKey(keyMsg("R"))
		return cmd
	})
	a.registerFooterActionHit(plain, y, "footer:conversation:delete", "d", a.localizer.t(msgFooterConversationDelete, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.handleBodyKey(keyMsg("d"))
		return cmd
	})
	a.registerFooterActionHit(plain, y, "footer:sidebar:open", "Enter", a.localizer.t(msgFooterSidebarOpen, nil), func(app *App) tea.Cmd {
		return app.routeSidebarFooterKey(keyMsg("enter"))
	})
	a.registerFooterActionHit(plain, y, "footer:sidebar:rename", "e", a.localizer.t(msgFooterSidebarRename, nil), func(app *App) tea.Cmd {
		return app.routeSidebarFooterKey(keyMsg("e"))
	})
	a.registerFooterActionHit(plain, y, "footer:sidebar:delete", "x", a.localizer.t(msgFooterSidebarDelete, nil), func(app *App) tea.Cmd {
		return app.routeSidebarFooterKey(keyMsg("x"))
	})
	a.registerFooterActionHit(plain, y, "footer:sidebar:children", "c", a.localizer.t(msgFooterSidebarChildren, nil), func(app *App) tea.Cmd {
		return app.routeSidebarFooterKey(keyMsg("c"))
	})
	a.registerFooterActionHit(plain, y, "footer:sidebar:context", "o", a.localizer.t(msgFooterSidebarContext, nil), func(app *App) tea.Cmd {
		return app.routeSidebarFooterKey(keyMsg("o"))
	})
	a.registerFooterActionHit(plain, y, "footer:sidebar:archive", "A", a.localizer.t(msgFooterSidebarArchive, nil), func(app *App) tea.Cmd {
		return app.routeSidebarFooterKey(keyMsg("A"))
	})
	a.registerFooterActionHit(plain, y, "footer:sidebar:copy-id", "y", a.localizer.t(msgFooterSidebarCopyID, nil), func(app *App) tea.Cmd {
		return app.routeSidebarFooterKey(keyMsg("y"))
	})
	a.registerFooterActionHit(plain, y, "footer:sidebar:filter", "f", a.localizer.t(msgFooterSidebarFilter, nil), func(app *App) tea.Cmd {
		return app.routeSidebarFooterKey(keyMsg("f"))
	})
	a.registerFooterActionHit(plain, y, "footer:sidebar:filter:apply", "Enter", a.localizer.t(msgFooterSidebarApply, nil), func(app *App) tea.Cmd {
		app.commitSidebarFilter()
		return nil
	})
	a.registerFooterActionHit(plain, y, "footer:sidebar:filter:cancel", "Esc", a.localizer.t(msgFooterSidebarCancel, nil), func(app *App) tea.Cmd {
		app.cancelSidebarFilter()
		return nil
	})
	a.registerFooterActionHit(plain, y, "footer:quit", "Ctrl+C", a.localizer.t(msgFooterQuit, nil), func(app *App) tea.Cmd {
		app.openQuitConfirm()
		return nil
	})
}

func (a *App) registerFooterActionHit(plain string, y int, id string, key string, label string, action uiHitAction) {
	target := key + " " + label
	col := strings.Index(plain, target)
	if col < 0 {
		return
	}
	a.registerScreenTextSpanHit(id, 0, y, plain, col, target, action)
}

func (a *App) routeSidebarFooterKey(k tea.KeyPressMsg) tea.Cmd {
	a.focus = FocusSidebar
	a.sidebarSectionFocus = sidebarSectionSessions
	if !a.sidebarSessionsCollapsed {
		a.sidebarSectionCursor = false
	}
	_, cmd := a.handleSidebarKey(k)
	return cmd
}

func (a *App) registerFooterPlainHit(plain string, y int, id string, target string, action uiHitAction) {
	if target == "" {
		return
	}
	col := strings.Index(plain, target)
	if col < 0 {
		return
	}
	a.registerScreenTextSpanHit(id, 0, y, plain, col, target, action)
}

func (a *App) footerContextHintVariants(mk func(string, string) string) [][]string {
	switch a.focus {
	case FocusSidebar:
		if a.sessionFilterActive {
			return [][]string{
				{
					mk("type", a.localizer.t(msgFooterSidebarFilterType, nil)),
					mk("Enter", a.localizer.t(msgFooterSidebarApply, nil)),
					mk("Esc", a.localizer.t(msgFooterSidebarCancel, nil)),
				},
				{
					mk("Enter", a.localizer.t(msgFooterSidebarApply, nil)),
					mk("Esc", a.localizer.t(msgFooterSidebarCancel, nil)),
				},
			}
		}
		if a.sidebarSessionsCollapsed || a.sidebarSectionCursor {
			return [][]string{
				{
					mk("↑/↓", a.localizer.t(msgFooterSidebarSections, nil)),
					mk("Enter", a.localizer.t(msgFooterSidebarToggle, nil)),
					mk("S/C", a.localizer.t(msgFooterSidebarSections, nil)),
				},
				{
					mk("↑/↓", a.localizer.t(msgFooterSidebarSections, nil)),
					mk("Enter", a.localizer.t(msgFooterSidebarToggle, nil)),
				},
			}
		}
		return [][]string{
			{
				mk("↑/↓", a.localizer.t(msgFooterSidebarSelect, nil)),
				mk("Enter", a.localizer.t(msgFooterSidebarOpen, nil)),
				mk("e", a.localizer.t(msgFooterSidebarRename, nil)),
				mk("x", a.localizer.t(msgFooterSidebarDelete, nil)),
				mk("c", a.localizer.t(msgFooterSidebarChildren, nil)),
				mk("A", a.localizer.t(msgFooterSidebarArchive, nil)),
				mk("y", a.localizer.t(msgFooterSidebarCopyID, nil)),
				mk("f", a.localizer.t(msgFooterSidebarFilter, nil)),
				mk("o", a.localizer.t(msgFooterSidebarContext, nil)),
				mk("S/C", a.localizer.t(msgFooterSidebarSections, nil)),
			},
			{
				mk("↑/↓", a.localizer.t(msgFooterSidebarSelect, nil)),
				mk("Enter", a.localizer.t(msgFooterSidebarOpen, nil)),
				mk("e", a.localizer.t(msgFooterSidebarRename, nil)),
				mk("x", a.localizer.t(msgFooterSidebarDelete, nil)),
				mk("c", a.localizer.t(msgFooterSidebarChildren, nil)),
				mk("A", a.localizer.t(msgFooterSidebarArchive, nil)),
				mk("y", a.localizer.t(msgFooterSidebarCopyID, nil)),
				mk("f", a.localizer.t(msgFooterSidebarFilter, nil)),
				mk("S/C", a.localizer.t(msgFooterSidebarSections, nil)),
			},
			{
				mk("e", a.localizer.t(msgFooterSidebarRename, nil)),
				mk("x", a.localizer.t(msgFooterSidebarDelete, nil)),
				mk("A", a.localizer.t(msgFooterSidebarArchive, nil)),
				mk("y", a.localizer.t(msgFooterSidebarCopyID, nil)),
			},
			{
				mk("↑/↓", a.localizer.t(msgFooterSidebarSelect, nil)),
				mk("Enter", a.localizer.t(msgFooterSidebarOpen, nil)),
				mk("f", a.localizer.t(msgFooterSidebarFilter, nil)),
			},
		}
	case FocusBody:
		return [][]string{
			{
				mk("↑/↓", a.localizer.t(msgFooterConversationSelect, nil)),
				mk("Enter/Ctrl+E", a.localizer.t(msgFooterConversationDetails, nil)),
				mk("y", a.localizer.t(msgFooterConversationCopy, nil)),
				mk("Y", a.localizer.t(msgFooterConversationCopyFull, nil)),
				mk("R", a.localizer.t(msgFooterConversationRetry, nil)),
				mk("d", a.localizer.t(msgFooterConversationDelete, nil)),
				mk("G", a.localizer.t(msgFooterConversationBottom, nil)),
			},
			{
				mk("↑/↓", a.localizer.t(msgFooterConversationSelect, nil)),
				mk("Enter/Ctrl+E", a.localizer.t(msgFooterConversationDetails, nil)),
				mk("y", a.localizer.t(msgFooterConversationCopy, nil)),
				mk("Y", a.localizer.t(msgFooterConversationCopyFull, nil)),
				mk("R", a.localizer.t(msgFooterConversationRetry, nil)),
				mk("d", a.localizer.t(msgFooterConversationDelete, nil)),
			},
			{
				mk("Enter/Ctrl+E", a.localizer.t(msgFooterConversationDetails, nil)),
				mk("y", a.localizer.t(msgFooterConversationCopy, nil)),
				mk("Y", a.localizer.t(msgFooterConversationCopyFull, nil)),
				mk("R", a.localizer.t(msgFooterConversationRetry, nil)),
				mk("d", a.localizer.t(msgFooterConversationDelete, nil)),
			},
			{
				mk("Enter/Ctrl+E", a.localizer.t(msgFooterConversationDetails, nil)),
				mk("y", a.localizer.t(msgFooterConversationCopy, nil)),
				mk("R", a.localizer.t(msgFooterConversationRetry, nil)),
			},
			{
				mk("y", a.localizer.t(msgFooterConversationCopy, nil)),
				mk("R", a.localizer.t(msgFooterConversationRetry, nil)),
				mk("d", a.localizer.t(msgFooterConversationDelete, nil)),
			},
			{
				mk("Enter/Ctrl+E", a.localizer.t(msgFooterConversationDetails, nil)),
				mk("y", a.localizer.t(msgFooterConversationCopy, nil)),
			},
		}
	case FocusInput:
		return [][]string{
			{
				mk("Enter", a.localizer.t(msgFooterInputSend, nil)),
				mk("\\+Enter", a.localizer.t(msgFooterInputNewline, nil)),
				mk("Ctrl+G", a.localizer.t(msgFooterInputCompose, nil)),
			},
			{
				mk("Enter", a.localizer.t(msgFooterInputSend, nil)),
				mk("\\+Enter", a.localizer.t(msgFooterInputNewline, nil)),
			},
		}
	default:
		return [][]string{{}}
	}
}

func (a *App) footerGlobalHintVariants(mk func(string, string) string) [][]string {
	return [][]string{{
		mk("Ctrl+N", a.localizer.t(msgFooterNew, nil)),
		mk("Tab", a.localizer.t(msgFooterPane, nil)),
		mk("Ctrl+S", a.localizer.t(msgFooterSettings, nil)),
		mk("/", a.localizer.t(msgFooterCommand, nil)),
		mk("?", a.localizer.t(msgFooterHelp, nil)),
	}, {
		mk("Ctrl+N", a.localizer.t(msgFooterNew, nil)),
		mk("Ctrl+S", a.localizer.t(msgFooterSettings, nil)),
		mk("/", a.localizer.t(msgFooterCommand, nil)),
		mk("?", a.localizer.t(msgFooterHelp, nil)),
	}, {
		mk("Ctrl+N", a.localizer.t(msgFooterNew, nil)),
		mk("Ctrl+S", a.localizer.t(msgFooterSettings, nil)),
		mk("?", a.localizer.t(msgFooterHelp, nil)),
	}, {
		mk("?", a.localizer.t(msgFooterHelp, nil)),
	}}
}

func (a *App) footerHintClusters(mk func(string, string) string, available int) [][]string {
	contexts := a.footerContextHintVariants(mk)
	globals := a.footerGlobalHintVariants(mk)
	exit := []string{mk("Ctrl+C", a.localizer.t(msgFooterQuit, nil))}
	if a.focus != FocusInput {
		for _, context := range contexts {
			for _, global := range globals {
				clusters := [][]string{context, global, exit}
				if footerClustersWidth(clusters) <= available {
					return clusters
				}
			}
		}
		for _, global := range globals {
			clusters := [][]string{global, exit}
			if footerClustersWidth(clusters) <= available {
				return clusters
			}
		}
		return [][]string{
			{
				mk("Ctrl+N", a.localizer.t(msgFooterNew, nil)),
				mk("?", a.localizer.t(msgFooterHelp, nil)),
			},
			exit,
		}
	}
	for _, global := range globals {
		for _, context := range contexts {
			clusters := [][]string{context, global, exit}
			if footerClustersWidth(clusters) <= available {
				return clusters
			}
		}
		clusters := [][]string{global, exit}
		if footerClustersWidth(clusters) <= available {
			return clusters
		}
	}
	return [][]string{
		{
			mk("Ctrl+N", a.localizer.t(msgFooterNew, nil)),
			mk("?", a.localizer.t(msgFooterHelp, nil)),
		},
		exit,
	}
}

func footerClustersWidth(clusters [][]string) int {
	parts := make([]string, 0, len(clusters))
	for _, cluster := range clusters {
		if len(cluster) == 0 {
			continue
		}
		parts = append(parts, strings.Join(cluster, " · "))
	}
	return lipgloss.Width(strings.Join(parts, "  │  "))
}

func (a *App) focusLabel(f FocusZone) string {
	switch f {
	case FocusSidebar:
		return a.localizer.t(msgChromeFocusSidebar, nil)
	case FocusBody:
		return a.localizer.t(msgChromeFocusConversation, nil)
	case FocusRightSidebar:
		return a.localizer.t(msgChromeFocusRightSidebar, nil)
	case FocusInput:
		return a.localizer.t(msgChromeFocusInput, nil)
	}
	return "?"
}

func (a *App) renderSidebar(width, height int) string {
	prevOffset := a.sidebarHitOffsetX
	prevFocus := a.sidebarHitFocus
	a.sidebarHitOffsetX = 0
	a.sidebarHitFocus = FocusSidebar
	defer func() {
		a.sidebarHitOffsetX = prevOffset
		a.sidebarHitFocus = prevFocus
	}()
	t := a.Theme
	// CCCCC1: lipgloss .Height(N) is OUTER height (border included).
	// Previously we passed Height(height-2) treating it as inner content
	// — that left the bordered pane 2 rows short, so the sidebar's `╰╯`
	// floated up while the conversation pane stayed at its full height.
	style := t.Pane.Width(width - 2).Height(height)
	if a.focus == FocusSidebar {
		style = t.PaneFoc.Width(width - 2).Height(height)
	}
	a.registerSidebarFocusSurface(width, height)
	rows := []string{}
	if a.sidebarHasEnabledModule(sidebarModuleSessions) {
		// Build the filter-filtered view once so the scroll math and the
		// render loop work off the same subset.
		visIdx := a.visibleSessionIndexes()

		// JJJJJJJJ1 + XXXXXXXX1: surface the active sidebar filter in
		// the title so the narrower view is visible even after the
		// transient hint fades. Two mutually-non-exclusive filters —
		// if both d and b were on, stacked suffix.
		titleText := a.sidebarModuleTitle(sidebarModuleSessions)
		switch {
		case a.showDetachedOnly && a.showBusyOnly:
			titleText = a.localizer.t(msgSidebarTitleDetachedBusy, nil)
		case a.showDetachedOnly:
			titleText = a.localizer.t(msgSidebarTitleDetached, nil)
		case a.showBusyOnly:
			titleText = a.localizer.t(msgSidebarTitleBusy, nil)
		}
		if a.showChildSessions && !a.sidebarSessionsCollapsed {
			titleText += " · " + a.localizer.t(msgSidebarTitleChildren, nil)
		}
		disclosure := "▾ "
		if a.sidebarSessionsCollapsed {
			disclosure = "▸ "
			titleText += fmt.Sprintf(" (%d)", len(visIdx))
		}
		titlePrefix := ""
		if a.focus == a.sidebarHitFocus && (a.sidebarSessionsCollapsed || a.sidebarSectionCursor) && a.sidebarSectionFocus == sidebarSectionSessions {
			titlePrefix = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
		}
		title := titlePrefix + lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render(disclosure+titleText)
		rows = append(rows, title, "")
		a.registerSidebarSectionHeaderHit(0, width, sidebarSectionSessions)
		if len(a.sessions) == 0 {
			rows = append(rows,
				t.HintLabel.Render(a.localizer.t(msgSidebarNoSessions, nil)),
				"",
				t.HintKey.Render("n")+t.HintLabel.Render(" "+a.localizer.t(msgSidebarCreate, nil)))
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
			label := a.localizer.t(msgSidebarFilter, nil) + " "
			if a.sessionFilter == "" && a.sessionFilterActive {
				label = a.localizer.t(msgSidebarFilterPrompt, nil)
				filterText = ""
			}
			rows = append(rows,
				lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
					Render(label+filterText),
				"")
			a.registerSidebarFilterHit(len(rows)-2, width)
		}

		// The shared range helper accounts for variable-height parent, child, and
		// collapsed-child rows so visible session rows and semantic hit rows stay in
		// one geometry model.
		startIdx, endIdx := a.sidebarVisibleSessionRange(height, visIdx)
		if !a.sidebarSessionsCollapsed && startIdx > 0 {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
				Render(" "+a.localizer.tf(msgSidebarMoreAbove, map[string]any{"count": startIdx})))
		}
		if !a.sidebarSessionsCollapsed && a.sessionFilter != "" && len(visIdx) == 0 {
			rows = append(rows, t.HintLabel.Render(" "+a.localizer.t(msgSidebarNoMatches, nil)))
		}
		for i := startIdx; i < endIdx; i++ {
			sIdx := visIdx[i]
			s := a.sessions[sIdx]
			row := len(rows)
			a.registerSidebarSessionHit(row, width, sIdx, a.sidebarSessionRowCount(sIdx))
			marker := " "
			titleIndent := ""
			statusIndent := "  "
			titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
			statusStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
			if isChildSession(s) {
				titleIndent = " └─ "
				if i+1 < endIdx {
					next := a.sessions[visIdx[i+1]]
					if isChildSession(next) && next.ParentSessionID == s.ParentSessionID {
						titleIndent = " ├─ "
					}
				}
				statusIndent = "    "
				titleStyle = titleStyle.Foreground(t.FgMuted).Italic(true)
			}
			if sIdx == a.selected && !a.sidebarSectionCursor && a.sidebarSectionFocus == sidebarSectionSessions {
				marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
				titleStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
			}
			title := s.Title
			if title == "" {
				title = a.localizer.t(msgSidebarUntitled, nil)
			}
			if isChildSession(s) {
				title = childSessionDisplayTitle(s, title)
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
			childMeta := ""
			if isChildSession(s) {
				childMeta = childSidebarMeta(s)
			}
			// Reserve room for the actual prefix/badges so title truncation cannot
			// wrap into a second visual row inside the narrow bordered pane.
			prefix := marker + titleIndent + dot
			titleBudget := (width - 6) - lipgloss.Width(prefix) -
				lipgloss.Width(taskBadge) - lipgloss.Width(detachBadge)
			if childMeta != "" {
				titleBudget -= lipgloss.Width(" · " + childMeta)
			}
			minTitleBudget := 6
			if isChildSession(s) {
				minTitleBudget = 4
			}
			if titleBudget < minTitleBudget {
				titleBudget = minTitleBudget
			}
			if titleBudget < 1 {
				titleBudget = 6
			}
			titleLine := prefix + titleStyle.Render(truncate(title, titleBudget)) + detachBadge + taskBadge
			// HHHHHHHH1: append humanized "Nm ago" to the status line so
			// users can tell which sessions are stale at a glance. Sits
			// next to the status word in the same muted italic — same
			// row, no extra vertical space. Zero UpdatedAt (fresh sessions
			// the backend hasn't filled in yet) renders without the age
			// suffix so the row isn't a lie.
			statusText := s.Status
			if tools := sessionToolCount(s); tools > 0 {
				statusText += fmt.Sprintf(" · %d tool%s", tools, plural(tools))
			}
			if !s.UpdatedAt.IsZero() && !isChildSession(s) {
				statusText += " · " + humanAgeShort(time.Since(s.UpdatedAt.UTC()))
			}
			if isChildSession(s) {
				if childMeta != "" {
					titleLine += statusStyle.Render(" · " + childMeta)
				}
				rows = append(rows, titleLine)
				continue
			}
			statusBudget := width - 6 - lipgloss.Width(statusIndent)
			if statusBudget < 4 {
				statusBudget = 4
			}
			statusLine := statusIndent + statusStyle.Render(truncate(statusText, statusBudget))
			rows = append(rows, titleLine, statusLine)
			if summary := a.sessionSidebarSummaryText(sIdx); summary != "" {
				summaryText := "summary: " + summary
				rows = append(rows, statusIndent+statusStyle.Render(truncate(summaryText, statusBudget)))
			}
			if activation := a.sessionSidebarActivationText(sIdx); activation != "" {
				rows = append(rows, statusIndent+statusStyle.Render(truncate(activation, statusBudget)))
			}
			if !a.showChildSessions {
				if children := a.childSessionCount(s.ID); children > 0 {
					childWord := "children"
					if children == 1 {
						childWord = "child"
					}
					childText := fmt.Sprintf("%d %s collapsed", children, childWord)
					rows = append(rows, statusIndent+statusStyle.Render(truncate(childText, statusBudget)))
				}
			}
		}
		if !a.sidebarSessionsCollapsed && endIdx < len(visIdx) {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
				Render(" "+a.localizer.tf(msgSidebarMoreBelow, map[string]any{"count": len(visIdx) - endIdx})))
		}
	}

	for _, module := range a.sidebarDisabledModules() {
		rows = append(rows, "")
		rows = append(rows, a.renderDisabledSidebarModule(module, width)...)
	}

	if a.sidebarHasEnabledModule(sidebarModuleAgents) {
		if len(rows) > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, a.renderAgentHierarchyModuleRows(width, len(rows), 8)...)
	}

	if a.sidebarHasEnabledModule(sidebarModuleFiles) {
		if len(rows) > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, a.renderFileViewerModuleRows(width, len(rows), 8)...)
	}

	// CONTEXT section — show files in the current session's context.
	if a.sidebarHasEnabledModule(sidebarModuleContext) && a.selected >= 0 && a.selected < len(a.sessions) {
		contextLines := a.sidebarContextRowCount()
		footerLines := 0
		if len(a.sessions) > 0 {
			footerLines = 2
		}
		if inner := height - 2; inner > 0 {
			allowedBeforeContext := inner - contextLines - footerLines
			if allowedBeforeContext < 1 {
				allowedBeforeContext = 1
			}
			if len(rows) > allowedBeforeContext {
				rows = rows[:allowedBeforeContext]
				rows[len(rows)-1] = lipgloss.NewStyle().Foreground(t.FgMuted).
					Render(" " + a.localizer.tf(msgSidebarMoreBelow, map[string]any{"count": 1}))
			}
		}
		contextTitle := a.sidebarModuleTitle(sidebarModuleContext)
		contextDisclosure := "▾ "
		if a.sidebarContextCollapsed {
			contextDisclosure = "▸ "
			contextTitle += fmt.Sprintf(" · %d", len(a.contextFiles))
		}
		contextPrefix := ""
		if a.focus == a.sidebarHitFocus && (a.sidebarSessionsCollapsed || a.sidebarSectionCursor) && a.sidebarSectionFocus == sidebarSectionContext {
			contextPrefix = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
		}
		rows = append(rows,
			contextPrefix+lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render(contextDisclosure+contextTitle))
		contextHeaderRow := len(rows) - 1
		a.registerSidebarContextHeaderHit(contextHeaderRow, width)
		if !a.sidebarContextCollapsed {
			if len(a.contextFiles) == 0 {
				rows = append(rows, t.HintLabel.Render(a.localizer.t(msgSidebarNoFiles, nil)))
			}
			for i, cf := range a.contextFiles {
				row := len(rows)
				cf := cf
				marker := " "
				selected := a.focus == a.sidebarHitFocus && a.sidebarSectionFocus == sidebarSectionContext && !a.sidebarSectionCursor && i == a.contextFileSel
				if selected {
					marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
				}
				rows = append(rows, a.renderSidebarContextFileRows(cf, width, marker, selected, i)...)
				a.registerSidebarContextFileHit(row, width, i, cf)
			}
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
		label := a.localizer.tf(msgSidebarCountsActiveFirst, map[string]any{"active": active, "archived": archived})
		if a.showArchived {
			label = a.localizer.tf(msgSidebarCountsArchivedFirst, map[string]any{"active": active, "archived": archived})
		}
		countsRow := len(rows) + 1
		rows = append(rows,
			"",
			lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).Render(label))
		a.registerSidebarCountsHit(countsRow, width)
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

func (a *App) renderRightSidebar(width, height int, offsetX int) string {
	prevOffset := a.sidebarHitOffsetX
	prevFocus := a.sidebarHitFocus
	a.sidebarHitOffsetX = offsetX
	a.sidebarHitFocus = FocusRightSidebar
	defer func() {
		a.sidebarHitOffsetX = prevOffset
		a.sidebarHitFocus = prevFocus
	}()

	t := a.Theme
	style := t.Pane.Width(width - 2).Height(height)
	if a.focus == FocusRightSidebar {
		style = t.PaneFoc.Width(width - 2).Height(height)
	}
	a.registerSidebarFocusSurface(width, height)

	modules := a.rightSidebarModules()
	rows := make([]string, 0, height)
	for _, module := range modules {
		if len(rows) > 0 {
			rows = append(rows, "")
		}
		if module.Disabled {
			rows = append(rows, a.renderDisabledSidebarModule(module, width)...)
			continue
		}
		switch module.Definition.ID {
		case sidebarModuleContext:
			rows = append(rows, a.renderRightContextModuleRows(width)...)
		case sidebarModuleAgents:
			rows = append(rows, a.renderAgentHierarchyModuleRows(width, len(rows), max(8, height-len(rows)-3))...)
		case sidebarModuleFiles:
			rows = append(rows, a.renderFileViewerModuleRows(width, len(rows), max(8, height-len(rows)-3))...)
		case sidebarModuleSessions:
			rows = append(rows, a.renderRightSessionsModuleRows(width)...)
		default:
			rows = append(rows, a.renderDisabledSidebarModule(resolvedSidebarModule{
				Definition: module.Definition,
				Disabled:   true,
				Reason:     "renderer unavailable",
			}, width)...)
		}
	}
	if len(rows) == 0 {
		rows = append(rows, t.HintLabel.Render("no modules"))
	}

	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	if inner := height - 2; inner > 0 {
		body = clampLines(body, inner)
	}
	return style.Render(body)
}

func (a *App) renderRightContextModuleRows(width int) []string {
	t := a.Theme
	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render("▾ " + a.sidebarModuleTitle(sidebarModuleContext))
	rows := []string{title}
	a.registerSidebarContextHeaderHit(0, width)
	if len(a.contextFiles) == 0 {
		return append(rows, t.HintLabel.Render(a.localizer.t(msgSidebarNoFiles, nil)))
	}
	for i, cf := range a.contextFiles {
		row := len(rows)
		marker := " "
		selected := a.focus == a.sidebarHitFocus && a.sidebarSectionFocus == sidebarSectionContext && !a.sidebarSectionCursor && i == a.contextFileSel
		if selected {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
		}
		rows = append(rows, a.renderSidebarContextFileRows(cf, width, marker, selected, i)...)
		a.registerSidebarContextFileHit(row, width, i, cf)
	}
	return rows
}

func (a *App) renderRightSessionsModuleRows(width int) []string {
	t := a.Theme
	visIdx := a.visibleSessionIndexes()
	titleText := a.sidebarModuleTitle(sidebarModuleSessions)
	disclosure := "▾ "
	if a.sidebarSessionsCollapsed {
		disclosure = "▸ "
		titleText += fmt.Sprintf(" (%d)", len(visIdx))
	}
	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render(disclosure + titleText)
	rows := []string{title}
	a.registerSidebarSectionHeaderHit(0, width, sidebarSectionSessions)
	if a.sidebarSessionsCollapsed {
		return append(rows, a.sidebarSessionCountsRow())
	}
	if len(a.sessions) == 0 {
		return append(rows,
			t.HintLabel.Render(a.localizer.t(msgSidebarNoSessions, nil)),
			t.HintKey.Render("n")+t.HintLabel.Render(" "+a.localizer.t(msgSidebarCreate, nil)))
	}
	startIdx, endIdx := a.sidebarVisibleSessionRange(18, visIdx)
	if startIdx > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(" "+a.localizer.tf(msgSidebarMoreAbove, map[string]any{"count": startIdx})))
	}
	for i := startIdx; i < endIdx; i++ {
		sIdx := visIdx[i]
		s := a.sessions[sIdx]
		row := len(rows)
		a.registerSidebarSessionHit(row, width, sIdx, a.sidebarSessionRowCount(sIdx))
		marker := " "
		titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
		if sIdx == a.selected && !a.sidebarSectionCursor && a.sidebarSectionFocus == sidebarSectionSessions {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
			titleStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
		}
		name := s.Title
		if name == "" {
			name = a.localizer.t(msgSidebarUntitled, nil)
		}
		dot := a.sessionStatusDot(s.Status)
		prefix := marker + dot + " "
		nameBudget := width - 6 - lipgloss.Width(prefix)
		if nameBudget < 6 {
			nameBudget = 6
		}
		rows = append(rows, prefix+titleStyle.Render(truncate(name, nameBudget)))
		status := s.Status
		if !s.UpdatedAt.IsZero() {
			status += " · " + humanAgeShort(time.Since(s.UpdatedAt.UTC()))
		}
		rows = append(rows, "  "+lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(truncate(status, width-8)))
		if summary := a.sessionSidebarSummaryText(sIdx); summary != "" {
			rows = append(rows, "  "+lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(truncate("summary: "+summary, width-8)))
		}
		if activation := a.sessionSidebarActivationText(sIdx); activation != "" {
			rows = append(rows, "  "+lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(truncate(activation, width-8)))
		}
	}
	if endIdx < len(visIdx) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(" "+a.localizer.tf(msgSidebarMoreBelow, map[string]any{"count": len(visIdx) - endIdx})))
	}
	rows = append(rows, a.sidebarSessionCountsRow())
	return rows
}

func (a *App) sidebarSessionCountsRow() string {
	active, archived := 0, 0
	for _, s := range a.sessions {
		if s.ArchivedAt != nil {
			archived++
		} else {
			active++
		}
	}
	return lipgloss.NewStyle().Foreground(a.Theme.FgFaint).Italic(true).
		Render(a.localizer.tf(msgSidebarCountsActiveFirst, map[string]any{"active": active, "archived": archived}))
}

func (a *App) renderSidebarContextFileRows(cf gact.ContextFile, width int, marker string, selected bool, index int) []string {
	t := a.Theme
	contentW := width - 6
	if contentW < 1 {
		contentW = 1
	}
	modeLabel, modeColor := contextModeLabelAndColor(cf.Mode, t)
	suffix := modeLabel
	if cf.Size > 0 {
		suffix += " · " + humanBytes(cf.Size)
	}
	suffixStyle := lipgloss.NewStyle().Foreground(modeColor).Italic(true)
	pathStyle := t.HintLabel
	if selected {
		pathStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	}
	suffixW := lipgloss.Width(suffix)
	pathBudget := contentW - lipgloss.Width(marker) - suffixW - 1
	if pathBudget < 6 && cf.Size > 0 {
		suffix = modeLabel
		suffixW = lipgloss.Width(suffix)
		pathBudget = contentW - lipgloss.Width(marker) - suffixW - 1
	}
	if pathBudget < 4 {
		pathBudget = 4
	}
	line := marker + pathStyle.Render(truncate(cf.Path, pathBudget)) + " " + suffixStyle.Render(suffix)
	rows := []string{truncate(line, contentW)}
	if a.sidebarContextFileRowCount(index) < 2 {
		return rows
	}
	meta := a.sidebarContextFileMeta(cf)
	if meta == "" {
		return rows
	}
	metaIndent := strings.Repeat(" ", maxInt(1, lipgloss.Width(marker)))
	metaBudget := contentW - lipgloss.Width(metaIndent)
	if metaBudget < 4 {
		metaBudget = 4
	}
	rows = append(rows, metaIndent+t.HintLabel.Italic(true).Render(truncate(meta, metaBudget)))
	return rows
}

func (a *App) sidebarContextFileMeta(cf gact.ContextFile) string {
	parts := make([]string, 0, 4)
	if lang := strings.TrimSpace(cf.Language); lang != "" {
		parts = append(parts, lang)
	}
	if cf.Uploaded {
		parts = append(parts, "uploaded")
	}
	if a.selected >= 0 && a.selected < len(a.sessions) {
		title := strings.TrimSpace(a.sessions[a.selected].Title)
		if title == "" {
			title = a.sessions[a.selected].ID
		}
		if title != "" {
			parts = append(parts, title)
		}
	}
	if modified := compactContextTimestamp(cf.LastModified); modified != "" {
		parts = append(parts, modified)
	} else if added := compactContextTimestamp(cf.AddedAt); added != "" {
		parts = append(parts, added)
	}
	return strings.Join(parts, " · ")
}

func compactContextTimestamp(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return raw
	}
	return t.UTC().Format("Jan 2 15:04")
}

func contextModeLabelAndColor(mode string, t Theme) (string, color.Color) {
	switch mode {
	case "edit":
		return "edit", t.Warning
	case "read":
		return "read", t.RoleUser
	case "pin":
		return "pin", t.Secondary
	case "":
		return "unknown", t.FgMuted
	default:
		return mode, t.FgMuted
	}
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
	if a.MouseEnabled {
		a.registerConversationFocusSurface(msgH, width)
		a.registerInputFocusSurface(msgH, hintH, inputH, width)
	}

	// Conversation pane. CCCCC1: lipgloss .Height(N) is OUTER (border
	// included); the previous Height(msgH-2) made the bordered region
	// 2 rows shorter than its allotment.
	msgStyle := t.Pane.Width(width - 2).Height(msgH)
	if a.focus == FocusBody {
		msgStyle = t.PaneFoc.Width(width - 2).Height(msgH)
	}

	titleLine := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render(a.localizer.t(msgConversationTitle, nil))
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
	var permActions []permissionBannerAction
	if len(a.pendingPermissions) > 0 {
		p := a.pendingPermissions[0]
		permBanner, permActions = a.renderPermissionBanner(p.Summary, width-4)
		a.registerPermissionBannerHits(permActions, width)
	}

	var body string
	if a.selected < 0 || a.selected >= len(a.sessions) {
		// Big, friendly empty state. Same pattern as a real onboarding.
		callout := lipgloss.NewStyle().
			Bold(true).Foreground(t.Primary).Padding(0, 2).
			Border(lipgloss.RoundedBorder()).
			BorderForeground(t.Primary).
			Render(a.localizer.t(msgConversationFirstPrompt, map[string]string{
				"key": lipgloss.NewStyle().Foreground(t.Bg).Background(t.Primary).Padding(0, 1).Render("Ctrl+N"),
			}))
		// KKKKK1: surface the per-session lifecycle keys here. The user
		// reported they didn't know rename/delete/archive existed —
		// the help overlay had them but the empty-state crib (the
		// thing they actually see first) didn't.
		hints := lipgloss.JoinVertical(lipgloss.Left,
			t.HintLabel.Render(a.localizer.t(msgConversationSidebarIntro, nil)),
			"  "+t.HintKey.Render("n")+t.HintLabel.Render(" "+a.localizer.t(msgConversationNew, nil))+
				"   "+t.HintKey.Render("e")+t.HintLabel.Render(" "+a.localizer.t(msgConversationRename, nil))+
				"   "+t.HintKey.Render("x")+t.HintLabel.Render(" "+a.localizer.t(msgConversationDelete, nil)),
			"  "+t.HintKey.Render("A")+t.HintLabel.Render(" "+a.localizer.t(msgConversationArchive, nil))+
				"   "+t.HintKey.Render("h")+t.HintLabel.Render(" "+a.localizer.t(msgConversationArchived, nil))+
				"   "+t.HintKey.Render("d")+t.HintLabel.Render(" "+a.localizer.t(msgConversationDetached, nil))+
				"   "+t.HintKey.Render("b")+t.HintLabel.Render(" "+a.localizer.t(msgConversationBusy, nil))+
				"   "+t.HintKey.Render("/")+t.HintLabel.Render(" "+a.localizer.t(msgConversationFilter, nil)),
			"  "+t.HintKey.Render("o")+t.HintLabel.Render(" "+a.localizer.t(msgConversationAttachFile, nil))+
				"   "+t.HintKey.Render("↑/↓")+t.HintLabel.Render(" "+a.localizer.t(msgConversationPick, nil)),
			"",
			t.HintLabel.Render(a.localizer.t(msgConversationOtherThings, nil)),
			"  "+t.HintKey.Render("Ctrl+S")+t.HintLabel.Render(" "+a.localizer.t(msgConversationPickModelAgent, nil)),
			"  "+t.HintKey.Render("/")+t.HintLabel.Render(" "+a.localizer.t(msgConversationCommandPalette, nil)+"  ·  ")+
				t.HintKey.Render("?")+t.HintLabel.Render(" "+a.localizer.t(msgConversationHelp, nil)),
			"  "+t.HintKey.Render("Ctrl+Z")+t.HintLabel.Render(" "+a.localizer.t(msgConversationDetachPrefix, nil)+" ")+
				t.HintKey.Render("gact attach <sid>")+t.HintLabel.Render(" "+a.localizer.t(msgConversationReattaches, nil)),
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
				Render(a.localizer.tf(msgConversationDetachedSessions, map[string]any{"count": n})+" ") +
				t.HintKey.Render("gact attach") +
				t.HintLabel.Render(" "+a.localizer.t(msgConversationResumeMostRecent, nil))
		}
		if resumeHint != "" {
			body = lipgloss.JoinVertical(lipgloss.Left, callout, "", resumeHint, "", hints)
		} else {
			body = lipgloss.JoinVertical(lipgloss.Left, callout, "", hints)
		}
	} else if len(a.messages) == 0 {
		body = lipgloss.JoinVertical(lipgloss.Left,
			t.HintLabel.Render(a.localizer.t(msgConversationNoMessages, nil)),
			"",
			"  "+t.HintKey.Render("@")+t.HintLabel.Render(" "+a.localizer.t(msgConversationAttachWorkspace, nil)+"  ·  ")+
				t.HintKey.Render("Ctrl+G")+t.HintLabel.Render(" "+a.localizer.t(msgConversationCompose, nil)),
			"  "+t.HintKey.Render("Ctrl+S")+t.HintLabel.Render(" "+a.localizer.t(msgConversationSettings, nil)+"  ·  ")+
				t.HintKey.Render("/theme")+t.HintLabel.Render(" "+a.localizer.t(msgConversationPickPalette, nil)),
		)
	} else {
		var rows []string
		var hitBlocks []conversationPartHitBlock
		fullLine := 0
		// III1: pair tool_results to their tool_calls so each call's
		// output renders directly under it. Tool messages whose entire
		// payload was absorbed get skipped from standalone rendering
		// (the role header would otherwise be empty noise).
		inlineResults, absorbed := pairToolResults(a.messages)
		lastModelLabel := ""
		var prevRendered *gact.Message
		for i, m := range a.messages {
			if absorbed[i] {
				continue
			}
			if !shouldRenderConversationMessage(m) {
				continue
			}
			if isModelSwapMarker(m) {
				if label := modelSwapMarkerLabel(m); label != "" {
					lastModelLabel = label
				}
			} else if label := modelRefLabel(m); label != "" {
				if lastModelLabel != "" && label != lastModelLabel {
					rows = append(rows, t.renderModelSwapDivider(gact.Message{
						Role: gact.RoleSystem,
						Metadata: map[string]any{
							"gact_tui_kind": modelSwapMarkerKind,
							"label":         label,
						},
					}, width-4))
				}
				lastModelLabel = label
			}
			// TTTTTTTTT1: pass the selected part ID so the per-block
			// `▸ ` marker paints on the currently focused part. Only
			// honoured on the selected message; empty string on every
			// other row so unrelated messages render untouched.
			selPartID := ""
			if i == a.bodySelMsgIdx && a.focus == FocusBody {
				selPartID = a.selectedPartID()
			}
			if len(rows) > 0 {
				fullLine++
			}
			row := t.renderMessageInContextWithResultsSelected(m, prevRendered, width-4, inlineResults[i], selPartID)
			for _, block := range t.conversationPartHitBlocks(m, prevRendered, width-4, inlineResults[i]) {
				block.msgIdx = i
				block.fullStart += fullLine
				hitBlocks = append(hitBlocks, block)
			}
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
			fullLine += renderedStringLineCount(row)
			prevRendered = &a.messages[i]
		}
		// Pending-turn indicator: when the session is running but the latest
		// message hasn't produced any visible parts yet (e.g. user just
		// pressed Enter and the assistant hasn't streamed a delta), show a
		// "● thinking…" stub so the user knows the system isn't dead.
		if a.shouldShowThinkingIndicator() {
			thinkLine := lipgloss.NewStyle().Foreground(t.Warning).Bold(true).
				Render(a.spinnerChar()) + " " +
				lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
					Render(a.localizer.t(msgConversationThinking, nil))
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
		a.registerConversationWheelHit(conversationH, width, permBanner != "")
		a.registerConversationPartHits(hitBlocks, body, conversationH, width, permBanner != "")
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
	msgPane = fitLinesWithBackground(msgPane, msgH, t.Bg)

	// Input — bubbles/textarea handles cursor + multi-line + paste itself.
	inputTextW := width - 4
	if a.MouseEnabled {
		inputTextW -= a.inputCommandChipWidth()
	}
	if inputTextW < 8 {
		inputTextW = 8
	}
	a.input.SetWidth(inputTextW)
	inputInnerH := inputH - 2
	if a.nextTurnAgentID != "" && inputInnerH > 1 {
		inputInnerH--
	}
	a.input.SetHeight(inputInnerH)
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
	inputView := a.input.View()
	if a.nextTurnAgentID != "" {
		label := firstNonEmpty(a.nextTurnAgentTitle, a.nextTurnAgentID)
		inputView = t.HintLabel.Render("agent for next turn: ") +
			t.HintKey.Render(label) + "\n" + inputView
	}
	if a.MouseEnabled {
		inputView = a.renderMouseInputCommand(inputView)
		a.registerInputCommandHit(msgH, hintH)
		a.registerInputTextareaCursorHits(msgH, hintH)
	}
	inputPane := fitLinesWithBackground(inputStyle.Render(inputView), inputH, t.Bg)

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

func normalizePasteNewlines(content string) string {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	return strings.ReplaceAll(content, "\r", "\n")
}

func compactSingleLinePaste(content string) string {
	return strings.Join(strings.Fields(content), " ")
}

func compactTokenPaste(content string) string {
	return strings.Join(strings.Fields(content), "")
}

func compactPathLikePaste(content string) string {
	text := strings.TrimSpace(normalizePasteNewlines(content))
	return strings.ReplaceAll(text, "\n", "")
}

func (a *App) recordPasteKey(k tea.KeyPressMsg) {
	switch k.String() {
	case "enter":
		a.pasteBuffer += "\n"
	case "tab":
		a.pasteBuffer += "\t"
	default:
		if text := k.Key().Text; text != "" {
			a.pasteBuffer += text
		}
	}
}

func (a *App) compactBufferedPaste() {
	content := a.pasteBuffer
	if strings.TrimSpace(content) == "" {
		return
	}
	lineCount := strings.Count(content, "\n") + 1
	threshold := a.Theme.PasteCompressThreshold
	if threshold <= 0 {
		threshold = 3
	}
	if lineCount < threshold {
		return
	}
	raw := a.input.Value()
	if strings.HasSuffix(raw, content) {
		a.input.SetValue(strings.TrimSuffix(raw, content))
	} else if idx := strings.LastIndex(raw, content); idx >= 0 {
		a.input.SetValue(raw[:idx] + raw[idx+len(content):])
	}
	a.insertPastePlaceholder(content, lineCount)
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
	a.expandPasteSegment(len(a.pastes) - 1)
}

func (a *App) expandPasteSegment(idx int) {
	if idx < 0 || idx >= len(a.pastes) {
		return
	}
	seg := a.pastes[idx]
	buf := a.input.Value()
	if !strings.Contains(buf, seg.placeholder) {
		// Placeholder was already deleted manually; drop the record.
		a.pastes = append(a.pastes[:idx], a.pastes[idx+1:]...)
		return
	}
	a.input.SetValue(strings.Replace(buf, seg.placeholder, seg.content, 1))
	a.pastes = append(a.pastes[:idx], a.pastes[idx+1:]...)
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

func sessionChildKind(s gact.Session) string {
	for _, key := range []string{"session_type", "kind", "runtime_type"} {
		if value := stringValue(s.Metadata[key]); value != "" {
			return value
		}
	}
	if s.Agent.Mode != "" {
		return s.Agent.Mode
	}
	return ""
}

func isChildSession(s gact.Session) bool {
	return s.ParentSessionID != ""
}

func (a *App) childSessionCount(parentID string) int {
	if parentID == "" {
		return 0
	}
	count := 0
	for _, s := range a.sessions {
		if s.ParentSessionID == parentID {
			count++
		}
	}
	return count
}

func sessionToolCount(s gact.Session) int {
	for _, key := range []string{"tool_count", "tools_count"} {
		if n, ok := floatValue(s.Metadata[key]); ok && n > 0 {
			return int(n)
		}
	}
	return 0
}

func childSidebarMeta(s gact.Session) string {
	var bits []string
	if s.Status != "" && s.Status != gact.StatusIdle {
		bits = append(bits, s.Status)
	}
	if tools := sessionToolCount(s); tools > 0 {
		bits = append(bits, fmt.Sprintf("%dt", tools))
	}
	if len(bits) == 0 {
		return s.Status
	}
	return strings.Join(bits, " · ")
}

func childSessionDisplayTitle(s gact.Session, fallback string) string {
	title := strings.TrimSpace(fallback)
	if s.Agent.ID != "" {
		title = s.Agent.ID
	}
	for _, suffix := range []string{" subagent", " nanoagent"} {
		title = strings.TrimSuffix(title, suffix)
	}
	title = strings.TrimSuffix(title, "_validator")
	title = strings.ReplaceAll(title, "_", " ")
	switch strings.ToLower(title) {
	case "csv":
		return "CSV"
	case "adios":
		return "ADIOS"
	case "hdf5":
		return "HDF5"
	case "bp5", "bp4":
		return strings.ToUpper(title)
	}
	return title
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
	return fitLinesWithBackground(s, n, nil)
}

func fitLinesWithBackground(s string, n int, bg color.Color) string {
	if n < 1 {
		return ""
	}
	lines := strings.Split(s, "\n")
	if len(lines) > n {
		lines = lines[:n]
	}
	padLine := ""
	if bg != nil {
		width := 0
		for _, line := range lines {
			if w := lipgloss.Width(line); w > width {
				width = w
			}
		}
		if width > 0 {
			padLine = lipgloss.NewStyle().Background(bg).Render(strings.Repeat(" ", width))
		}
	}
	for len(lines) < n {
		lines = append(lines, padLine)
	}
	return strings.Join(lines, "\n")
}

func renderedBlockWidth(s string) int {
	width := 0
	for _, line := range strings.Split(s, "\n") {
		if w := lipgloss.Width(line); w > width {
			width = w
		}
	}
	return width
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
	plainBody := ansi.Strip(body)
	marker := "▌ "
	idx := strings.Index(plainBody, marker)
	if idx < 0 {
		// Older tests and historical render paths used the routing
		// triangle as the cursor marker. Prefer the current bar marker
		// so routing-decision triangles do not steal the scroll target,
		// but keep this fallback for compatibility.
		marker = "▸ "
		idx = strings.Index(plainBody, marker)
	}
	if !strings.Contains(plainBody, marker) {
		return
	}
	// Line index of the first cursor occurrence. We only emit the marker
	// on the selected part's first line, so this is unambiguous.
	markerRow := strings.Count(plainBody[:idx], "\n")
	totalLines := strings.Count(plainBody, "\n") + 1
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
	start := len(lines) - maxRows
	if !a.stickyToBottom {
		start -= a.scrollOffset
	}
	win := boundedScrollWindow(len(lines), maxRows, start)
	return strings.Join(lines[win.start:win.end], "\n")
}

func (a *App) conversationScrollStart(body string, maxRows int) int {
	if maxRows < 1 {
		return 0
	}
	lines := strings.Split(body, "\n")
	if len(lines) <= maxRows {
		return 0
	}
	start := len(lines) - maxRows - a.scrollOffset
	if a.stickyToBottom {
		start = len(lines) - maxRows
	}
	return boundedScrollWindow(len(lines), maxRows, start).start
}

func (a *App) registerConversationPartHits(blocks []conversationPartHitBlock, body string, viewportRows int, bodyWidth int, hasPermissionBanner bool) {
	if len(blocks) == 0 || viewportRows < 1 {
		return
	}
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	visibleStart := a.conversationScrollStart(body, viewportRows)
	visibleEnd := visibleStart + viewportRows
	for _, block := range blocks {
		if block.height <= 0 || block.msgIdx < 0 || block.msgIdx >= len(a.messages) {
			continue
		}
		start := block.fullStart
		end := block.fullStart + block.height
		if end <= visibleStart || start >= visibleEnd {
			continue
		}
		screenStart := max(start, visibleStart)
		screenEnd := min(end, visibleEnd)
		msgIdx := block.msgIdx
		addrIdx := block.addrIdx
		a.registerConversationContentHitActions(
			fmt.Sprintf("conversation:part:%d:%d", msgIdx, addrIdx),
			screenStart-visibleStart,
			0,
			contentW,
			screenEnd-screenStart,
			bodyWidth,
			hasPermissionBanner,
			func(app *App) tea.Cmd {
				if msgIdx < 0 || msgIdx >= len(app.messages) {
					return nil
				}
				addr := addressablePartsOf(app.messages[msgIdx])
				if addrIdx < 0 || addrIdx >= len(addr) {
					return nil
				}
				alreadySelected := app.focus == FocusBody &&
					app.bodySelMsgIdx == msgIdx &&
					app.bodySelPartIdx == addrIdx
				app.focus = FocusBody
				app.bodySelMsgIdx = msgIdx
				app.bodySelPartIdx = addrIdx
				app.stickyToBottom = false
				app.pendingPartScroll = false
				app.searchHitMessageID = ""
				if alreadySelected {
					app.openDetailForSelection()
				}
				return nil
			},
			func(app *App) tea.Cmd {
				return app.openConversationActionsForPart(msgIdx, addrIdx)
			},
		)
		if block.opensDetail && block.detailStart >= 0 {
			detailRow := block.detailStart
			if detailRow >= visibleStart && detailRow < visibleEnd {
				a.registerConversationContentHitActions(
					fmt.Sprintf("conversation:detail:%d:%d", msgIdx, addrIdx),
					detailRow-visibleStart,
					0,
					contentW,
					1,
					bodyWidth,
					hasPermissionBanner,
					func(app *App) tea.Cmd {
						if msgIdx < 0 || msgIdx >= len(app.messages) {
							return nil
						}
						addr := addressablePartsOf(app.messages[msgIdx])
						if addrIdx < 0 || addrIdx >= len(addr) {
							return nil
						}
						app.focus = FocusBody
						app.bodySelMsgIdx = msgIdx
						app.bodySelPartIdx = addrIdx
						app.stickyToBottom = false
						app.pendingPartScroll = false
						app.searchHitMessageID = ""
						app.openDetailForSelection()
						return nil
					},
					func(app *App) tea.Cmd {
						return app.openConversationActionsForPart(msgIdx, addrIdx)
					},
				)
			}
		}
		for _, action := range block.diffActions {
			actionRow := action.row
			if actionRow < visibleStart || actionRow >= visibleEnd {
				continue
			}
			actionPath := action.path
			actionName := action.action
			actionCol := action.col - 1
			if actionCol < 0 {
				actionCol = 0
			}
			actionW := action.width + 2
			if actionW < 1 {
				actionW = 1
			}
			if actionCol+actionW > contentW {
				actionW = contentW - actionCol
			}
			if actionW < 1 {
				continue
			}
			a.registerConversationContentHit(
				fmt.Sprintf("conversation:diff:%s:%s", actionName, actionPath),
				actionRow-visibleStart,
				actionCol,
				actionW,
				1,
				bodyWidth,
				hasPermissionBanner,
				func(app *App) tea.Cmd {
					if msgIdx < 0 || msgIdx >= len(app.messages) {
						return nil
					}
					addr := addressablePartsOf(app.messages[msgIdx])
					if addrIdx >= 0 && addrIdx < len(addr) {
						app.focus = FocusBody
						app.bodySelMsgIdx = msgIdx
						app.bodySelPartIdx = addrIdx
						app.stickyToBottom = false
						app.pendingPartScroll = false
						app.searchHitMessageID = ""
					}
					sid := app.currentSessionID()
					if sid == "" {
						app.transientHint = actionName + " diff: no active session"
						return nil
					}
					switch actionName {
					case "apply":
						return applyDiffsCmd(app.c, sid, actionPath)
					case "reject":
						return rejectDiffsCmd(app.c, sid, actionPath)
					default:
						return nil
					}
				},
			)
		}
	}
}

func (a *App) registerConversationContentHit(id string, row int, col int, width int, height int, bodyWidth int, hasPermissionBanner bool, action uiHitAction) {
	a.registerConversationContentHitActions(id, row, col, width, height, bodyWidth, hasPermissionBanner, action, nil)
}

func (a *App) registerConversationContentHitActions(id string, row int, col int, width int, height int, bodyWidth int, hasPermissionBanner bool, action uiHitAction, secondaryAction uiHitAction) {
	if a.hits == nil {
		return
	}
	a.registerScreenHitActions(id, a.conversationContentRect(row, col, width, height, bodyWidth, hasPermissionBanner), action, secondaryAction)
}

func (a *App) registerConversationContentWheelHit(id string, row int, col int, width int, height int, bodyWidth int, hasPermissionBanner bool, action uiWheelAction) {
	if a.hits == nil {
		return
	}
	a.registerScreenWheelHit(id, a.conversationContentRect(row, col, width, height, bodyWidth, hasPermissionBanner), action)
}

func (a *App) conversationContentRect(row int, col int, width int, height int, bodyWidth int, hasPermissionBanner bool) mouseRect {
	bodyX := a.bodyPaneOffsetX()
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	if col < 0 {
		col = 0
	}
	if col >= contentW {
		col = contentW - 1
	}
	if width < 1 {
		width = 1
	}
	if col+width > contentW {
		width = contentW - col
	}
	if width < 1 {
		width = 1
	}
	if height < 1 {
		height = 1
	}
	bodyTop := 4
	if hasPermissionBanner {
		bodyTop++
	}
	return mouseRect{
		x: bodyX + 2 + col,
		y: bodyTop + row,
		w: width,
		h: height,
	}
}

func (a *App) registerConversationFocusSurface(conversationHeight int, bodyWidth int) {
	if a.hits == nil || conversationHeight <= 0 || bodyWidth <= 0 {
		return
	}
	a.registerFocusSurfaceHit("conversation:body:focus", a.conversationFocusSurfaceRect(conversationHeight, bodyWidth), FocusBody, func(app *App) {
		app.maybeInitBodyCursor()
	})
}

func (a *App) conversationFocusSurfaceRect(conversationHeight int, bodyWidth int) mouseRect {
	return mouseRect{
		x: a.bodyPaneOffsetX(),
		y: 1,
		w: renderedPaneOuterWidth(bodyWidth),
		h: conversationHeight,
	}
}

func (a *App) bodyPaneOffsetX() int {
	if a.bodyHitOffsetX > 0 {
		return a.bodyHitOffsetX
	}
	sidebarW, _, _ := a.mainPaneGeometry()
	return sidebarW
}

func renderedPaneOuterWidth(requested int) int {
	if requested > 2 {
		return requested - 2
	}
	if requested < 1 {
		return 1
	}
	return requested
}

func (a *App) registerConversationWheelHit(viewportRows int, bodyWidth int, hasPermissionBanner bool) {
	if viewportRows < 1 {
		return
	}
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	a.registerConversationContentWheelHit("conversation:body:wheel", 0, 0, contentW, viewportRows, bodyWidth, hasPermissionBanner, func(app *App, button tea.MouseButton) tea.Cmd {
		return app.handleConversationWheel(button)
	})
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
	return ansi.Truncate(s, max, "…")
}

// viewPalette renders the slash-command palette as a centered modal.
func (a *App) viewPalette() string {
	t := a.Theme
	w := a.modalWidth()
	listW := modalInsetListWidth(w)

	if a.isSearchMode() {
		return a.viewPaletteSearch(w)
	}

	matches := a.paletteMatches()
	buttons := a.paletteCloseButtons()
	filterPrefix := a.localizer.t(msgPaletteFilter, nil) + " "
	filterCursor := a.paletteCursorValue()
	rows := []string{
		lipgloss.NewStyle().Foreground(t.FgMuted).Render(filterPrefix + renderPaletteCursorEditor(a.paletteFilter, filterCursor)),
		lipgloss.NewStyle().Foreground(t.FgMuted).Render(a.localizer.t(msgPaletteSearchHint, nil)),
		"",
	}
	if len(matches) == 0 {
		rows = append(rows, t.HintLabel.Render(a.localizer.t(msgPaletteNoMatches, nil)))
	}
	listStartRow := len(rows)
	itemBudget := a.modalListItemBudget(6, 1, 16)
	win := selectedItemWindow(len(matches), a.paletteSel, itemBudget)
	listItems := make([]modalListItem, 0, win.end-win.start)
	var list modalListRender
	for i := win.start; i < win.end; i++ {
		c := matches[i]
		idx := i
		listItems = append(listItems, modalListItem{
			id:       fmt.Sprintf("palette:command:%d", idx),
			title:    c.ID,
			meta:     paletteCommandSubtitle(c),
			status:   a.paletteCurrentValue(c.ID),
			selected: i == a.paletteSel,
			action: func(app *App) tea.Cmd {
				matches := app.paletteMatches()
				if idx < 0 || idx >= len(matches) {
					return nil
				}
				app.paletteSel = idx
				_, cmd := app.handlePaletteKey(keyMsg("enter"))
				return cmd
			},
		})
	}
	if len(listItems) > 0 {
		list = a.renderModalList(listItems, modalListOptions{
			width:            listW,
			rowBudget:        16,
			descriptionLines: 0,
		})
		rows = append(rows, list.rows...)
	}
	rows = append(rows, "", t.HintLabel.Render(a.localizer.t(msgPaletteRunHint, nil)))

	rendered := a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   a.localizer.t(msgPaletteCommandsTitle, nil),
			buttons: buttons,
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		bodyRows:       a.paletteBodyPageSize(),
		window:         win,
		wheelID:        "palette:list:wheel",
		surfaceWheelID: "palette",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.paletteSel = moveSelectionByWheel(app.paletteSel, len(app.paletteMatches()), button)
			return nil
		},
		railAction: func(app *App, index int) tea.Cmd {
			app.paletteSel = clampSelection(index, len(app.paletteMatches()))
			return nil
		},
	})
	if rendered.bodyRow >= 0 {
		a.registerInlineCursorHits(rendered.modal, rendered.bodyRow, "palette-filter", lipgloss.Width(filterPrefix), a.paletteFilter, func(app *App, cursor int) {
			app.paletteCursor = cursor
			app.paletteCursorSet = true
		})
	}
	return rendered.modal
}

func paletteCommandSubtitle(c gact.Command) string {
	id := strings.TrimSpace(c.ID)
	title := strings.TrimSpace(c.Title)
	desc := strings.TrimSpace(c.Description)
	if c.Status != "" && c.Status != "available" {
		reason := strings.TrimSpace(firstNonEmpty(c.DisabledReason, c.Error))
		if reason != "" {
			return c.Status + " · " + reason
		}
		return c.Status
	}
	policy := make([]string, 0, 8)
	if c.CommandSource == "agent_blueprint" {
		label := "agent blueprint"
		if c.AgentBlueprintID != "" {
			label += ": " + c.AgentBlueprintID
		}
		policy = append(policy, label)
	} else if c.CommandSource != "" && c.CommandSource != c.Source {
		policy = append(policy, "source: "+c.CommandSource)
	}
	if c.CommandScope != "" && c.CommandScope != c.CommandSource {
		policy = append(policy, "scope: "+c.CommandScope)
	}
	if c.UserInvocable != nil {
		if *c.UserInvocable {
			policy = append(policy, "user")
		} else {
			policy = append(policy, "not-user")
		}
	}
	if c.AgentInvocable != nil && *c.AgentInvocable {
		policy = append(policy, "agent")
	}
	if c.PlannerVisible != nil && *c.PlannerVisible {
		policy = append(policy, "planner")
	}
	if c.AgentID != "" {
		policy = append(policy, "owner: "+c.AgentID)
	}
	if c.ArgumentHint != "" {
		policy = append(policy, "args: "+c.ArgumentHint)
	}
	if c.CommandPath != "" && c.CommandSource == "agent_blueprint" {
		policy = append(policy, "path: "+shortPathLabel(c.CommandPath))
	}
	if len(policy) > 0 {
		return strings.Join(policy, " · ")
	}
	if desc != "" && !samePaletteCommandText(desc, id) && !samePaletteCommandText(desc, title) {
		return desc
	}
	if c.AgentID != "" {
		return "agent: " + c.AgentID
	}
	if title != "" && !samePaletteCommandText(title, id) {
		return title
	}
	if c.Source != "" {
		return c.Source
	}
	return ""
}

func samePaletteCommandText(a, b string) bool {
	a = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(a)), "/")
	b = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(b)), "/")
	return a != "" && a == b
}

func shortPathLabel(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	path = strings.ReplaceAll(path, "\\", "/")
	const marker = "/commands/"
	if idx := strings.LastIndex(path, marker); idx >= 0 {
		return "commands/" + strings.TrimPrefix(path[idx+len(marker):], "/")
	}
	if idx := strings.LastIndex(path, "/"); idx >= 0 && idx < len(path)-1 {
		return path[idx+1:]
	}
	return path
}

// viewPaletteSearch renders the palette in message-search mode (filter
// starts with `?`). Three sub-states:
//  1. query empty (just `?`) — prompt for input
//  2. query non-empty + no results yet — show "Enter to search" hint
//  3. results loaded — render each match with msg id + snippet
func (a *App) viewPaletteSearch(w int) string {
	t := a.Theme
	queryRaw := strings.TrimPrefix(a.paletteFilter, "?")
	query := strings.TrimSpace(queryRaw)
	queryCursor := a.paletteCursorValue() - 1
	queryRunes := []rune(queryRaw)
	if queryCursor < 0 {
		queryCursor = 0
	}
	if queryCursor > len(queryRunes) {
		queryCursor = len(queryRunes)
	}
	listStartRow := -1
	var list modalListRender
	win := scrollWindow{total: len(a.searchMatches)}
	listW := modalInsetListWidth(w)
	buttons := a.paletteCloseButtons()
	queryPrefix := a.localizer.t(msgPaletteQuery, nil) + " "
	rows := []string{
		lipgloss.NewStyle().Foreground(t.FgMuted).Render(queryPrefix + renderPaletteCursorEditor(queryRaw, queryCursor)),
		"",
	}
	switch {
	case a.searching:
		rows = append(rows, t.HintLabel.Render(a.localizer.t(msgPaletteSearching, nil)))
	case query == "":
		rows = append(rows, t.HintLabel.Render(a.localizer.t(msgPaletteTypeQuery, nil)))
	case len(a.searchMatches) == 0:
		rows = append(rows, t.HintLabel.Render(a.localizer.t(msgPaletteEnterSearch, map[string]string{"query": query})))
	default:
		listStartRow = len(rows)
		itemBudget := a.modalListItemBudget(5, 2, 8)
		win = selectedItemWindow(len(a.searchMatches), a.paletteSel, itemBudget)
		listItems := make([]modalListItem, 0, win.end-win.start)
		for i := win.start; i < win.end; i++ {
			m := a.searchMatches[i]
			idx := i
			listItems = append(listItems, modalListItem{
				id:          fmt.Sprintf("palette:search:%d", idx),
				title:       shortID(m.MessageID),
				description: strings.ReplaceAll(strings.TrimSpace(m.Snippet), "\n", " "),
				selected:    i == a.paletteSel,
				action: func(app *App) tea.Cmd {
					if idx < 0 || idx >= len(app.searchMatches) {
						return nil
					}
					app.paletteSel = idx
					_, cmd := app.handlePaletteKey(keyMsg("enter"))
					return cmd
				},
			})
		}
		list = a.renderModalList(listItems, modalListOptions{
			width:            listW,
			rowBudget:        12,
			descriptionLines: 1,
		})
		rows = append(rows, list.rows...)
	}
	if len(a.searchMatches) > 0 {
		rows = append(rows, "", t.HintLabel.Render(a.localizer.t(msgPaletteJumpHint, nil)))
	} else {
		rows = append(rows, "", t.HintLabel.Render(a.localizer.t(msgPaletteCloseHint, nil)))
	}

	rendered := a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   a.localizer.t(msgPaletteSearchTitle, nil),
			buttons: buttons,
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		bodyRows:       a.paletteBodyPageSize(),
		window:         win,
		wheelID:        "palette:search:list:wheel",
		surfaceWheelID: "palette",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.paletteSel = moveSelectionByWheel(app.paletteSel, len(app.searchMatches), button)
			return nil
		},
		railAction: func(app *App, index int) tea.Cmd {
			app.paletteSel = clampSelection(index, len(app.searchMatches))
			return nil
		},
	})
	if rendered.bodyRow >= 0 {
		a.registerInlineCursorHits(rendered.modal, rendered.bodyRow, "palette-search-query", lipgloss.Width(queryPrefix), queryRaw, func(app *App, cursor int) {
			if strings.HasPrefix(app.paletteFilter, "?") {
				app.paletteCursor = cursor + 1
				app.paletteCursorSet = true
			}
		})
	}
	return rendered.modal
}

func renderPaletteCursorEditor(value string, cursor int) string {
	runes := []rune(value)
	if cursor < 0 {
		cursor = 0
	}
	if cursor > len(runes) {
		cursor = len(runes)
	}
	return string(runes[:cursor]) + "_" + string(runes[cursor:])
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
type helpKey struct {
	key    string
	descID messageID
}

var helpTabs = []struct {
	title string
	keys  []helpKey
}{
	{
		title: "Global",
		keys: []helpKey{
			{"Tab / ⇧Tab", "help.global.cycle_focus"},
			{"Ctrl+N", "help.global.new_session"},
			{"Ctrl+W", "help.global.switch_workspace"},
			{"Ctrl+S", "help.global.settings"},
			{"Ctrl+T", "help.global.metrics"},
			{"Ctrl+Alt+T", "help.global.cycle_theme"},
			{"Ctrl+R", "help.global.refresh"},
			{"Ctrl+L", "help.global.reload_config"},
			{"Ctrl+X", "help.global.cancel_turn"},
			{"Ctrl+Y", "help.global.voice"},
			{"Ctrl+Z", "help.global.detach"},
			{"?", "help.global.toggle_help"},
			{"Esc", "help.global.escape"},
			{"Ctrl+C", "help.global.quit"},
		},
	},
	{
		title: "Sidebar",
		keys: []helpKey{
			{"↑/↓ · j/k", "help.sidebar.pick"},
			{"g / G", "help.sidebar.jump"},
			{"PgUp/PgDn", "help.sidebar.page"},
			{"n", "help.sidebar.new"},
			{"e", "help.sidebar.rename"},
			{"x", "help.sidebar.delete"},
			{"A", "help.sidebar.archive"},
			{"h", "help.sidebar.toggle_archived"},
			{"d", "help.sidebar.toggle_detached"},
			{"b", "help.sidebar.toggle_busy"},
			{"y", "help.sidebar.yank"},
			{"/", "help.sidebar.filter"},
			{"o", "help.sidebar.context"},
		},
	},
	{
		title: "Conversation",
		keys: []helpKey{
			{"↑/↓ · j/k", "help.conversation.move_cursor"},
			{"g / G", "help.conversation.jump"},
			{"PgUp/PgDn · Ctrl+U/D", "help.conversation.page"},
			{"y", "help.conversation.copy_selected"},
			{"Y", "help.conversation.copy_full"},
			{"R", "help.conversation.retry"},
			{"d", "help.conversation.delete"},
			{"t", "help.conversation.timestamps"},
			{"n / N", "help.conversation.next_prev"},
			{"Ctrl+E · Enter", "help.conversation.expand"},
			{"a / r", "help.conversation.diff"},
		},
	},
	{
		title: "Input",
		keys: []helpKey{
			{"Enter", "help.input.send"},
			{"\\<Enter>", "help.input.newline_always"},
			{"Shift+Enter · Alt+Enter · Ctrl+J", "help.input.newline_terminal"},
			{"↑ on empty", "help.input.recall"},
			{"/", "help.input.palette"},
			{"/?<query>", "help.input.search"},
			{"Paste ≥ N lines", "help.input.paste"},
			{"Ctrl+P", "help.input.expand_paste"},
			{"Ctrl+G · Ctrl+⇧P", "help.input.compose"},
			{"@", "help.input.file_picker"},
		},
	},
	{
		// Slash-commands users can type after pressing `/`. Palette
		// shows them all; this tab serves as a quick-reference for
		// the newer ones that might not jump out of the flat list.
		title: "Commands",
		keys: []helpKey{
			{"/clear", "help.commands.clear"},
			{"/cancel", "help.commands.cancel"},
			{"/new", "help.commands.new"},
			{"/rename", "help.commands.rename"},
			{"/mcp", "help.commands.mcp"},
			{"/tools", "help.commands.tools"},
			{"/catalog", "help.commands.catalog"},
			{"/skills", "help.commands.skills"},
			{"/agents", "help.commands.agents"},
			{"/sessions", "help.commands.sessions"},
			{"/theme", "help.commands.theme"},
			{"/theme-export", "help.commands.theme_export"},
			{"/metrics", "help.commands.metrics"},
			{"/memory", "help.commands.memory"},
			{"/theme-next", "help.commands.theme_next"},
			{"/theme-prev", "help.commands.theme_prev"},
			{"/duplicate", "help.commands.duplicate"},
			{"/help", "help.commands.help"},
			{"/diff", "help.commands.diff"},
		},
	},
	{
		title: "Permission",
		keys: []helpKey{
			{"a / d", "help.permission.once"},
			{"s", "help.permission.session"},
			{"w", "help.permission.workspace"},
		},
	},
}

var helpTabCount = len(helpTabs)

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

func (a *App) localizedHelpTabTitle(title string) string {
	switch title {
	case "Global":
		return a.localizer.t(msgHelpTabGlobal, nil)
	case "Sidebar":
		return a.localizer.t(msgHelpTabSidebar, nil)
	case "Conversation":
		return a.localizer.t(msgHelpTabConversation, nil)
	case "Input":
		return a.localizer.t(msgHelpTabInput, nil)
	case "Commands":
		return a.localizer.t(msgHelpTabCommands, nil)
	case "Permission":
		return a.localizer.t(msgHelpTabPermission, nil)
	default:
		return title
	}
}

// viewHelp renders the help overlay as a tabbed modal. Each tab scopes
// keybindings to a pane or mode so the list always fits in-view —
// replacing the older L7 single-scroll layout that users reported as
// overflowing the viewport (issue #7).
//
// Navigation: ←/→ or h/l or Tab cycles tabs; ?/Esc closes.
func (a *App) viewHelp() string {
	t := a.Theme
	w := a.modalWidth()

	tabHits := make([]menuTab, 0, len(helpTabs))
	for i, tab := range helpTabs {
		tabIdx := i
		tabHits = append(tabHits, menuTab{
			id:     "help-" + strings.ToLower(tab.title),
			label:  a.localizedHelpTabTitle(tab.title),
			active: i == a.helpTab,
			action: func(app *App) tea.Cmd {
				app.helpTab = tabIdx
				app.helpScroll = 0
				return nil
			},
		})
	}

	// Body — the current tab's key list. Clamp helpTab defensively so a
	// future out-of-range value doesn't crash the render.
	idx := a.helpTab
	if idx < 0 || idx >= len(helpTabs) {
		idx = 0
	}
	var (
		content   string
		helpList  modalListRender
		helpWidth = modalScrollableBodyWidth(w)
	)
	items := make([]modalListItem, 0, len(helpTabs[idx].keys))
	for _, kp := range helpTabs[idx].keys {
		key := kp.key
		item := modalListItem{
			id:    "help:key:" + strings.NewReplacer("/", "", " ", "-", "⇧", "shift").Replace(strings.ToLower(key)),
			title: key,
			meta:  a.localizer.t(kp.descID, nil),
		}
		if helpTabs[idx].title == "Commands" {
			command := key
			item.id = "help:command:" + strings.TrimPrefix(command, "/")
			item.action = func(app *App) tea.Cmd {
				app.helpOpen = false
				app.helpTab = 0
				app.helpScroll = 0
				app.focus = FocusInput
				app.input.Focus()
				app.input.SetValue(command)
				app.input.CursorEnd()
				app.transientHint = "command staged: " + command
				return nil
			}
		}
		items = append(items, item)
	}
	if len(items) > 0 {
		columns := 1
		if helpTabs[idx].title == "Commands" && helpWidth >= 72 {
			columns = 2
		}
		helpList = a.renderModalList(items, modalListOptions{
			width:            helpWidth,
			rowBudget:        len(items),
			descriptionLines: 0,
			columns:          columns,
			minColumnWidth:   34,
		})
		content = lipgloss.JoinVertical(lipgloss.Left, helpList.rows...)
	} else {
		content = ""
	}
	buttons := []menuButton{closeMenuButton("help:close", func(app *App) {
		app.helpOpen = false
		app.helpTab = 0
		app.helpScroll = 0
	})}
	hintStyle := lipgloss.NewStyle().Italic(true).Foreground(t.FgMuted)
	rendered := a.renderScrollableModalFrame(scrollableModalFrameOptions{
		frame: modalFrameOptions{
			width:      w,
			title:      a.localizer.t(msgHelpTitle, nil),
			buttons:    buttons,
			tabs:       tabHits,
			tabPadding: 1,
			tabSpacing: 0,
		},
		content:     content,
		pageSize:    a.helpBodyPageSize(),
		scroll:      a.helpScroll,
		wheelID:     "help",
		footerHint:  a.localizer.t(msgHelpHint, nil),
		footerStyle: &hintStyle,
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.helpScroll = moveScrollOffsetByWheel(app.helpScroll, button)
			return nil
		},
		scrollTo: func(app *App, scroll int) tea.Cmd {
			app.helpScroll = scroll
			return nil
		},
	})
	a.helpScroll = rendered.window.scroll
	a.registerWindowedModalListHits(rendered, 0, helpWidth, helpList)
	return rendered.modal
}

func (a *App) helpBodyPageSize() int {
	return a.modalBodyRows(14)
}

func (a *App) paletteBodyPageSize() int {
	return a.modalBodyRows(14)
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
	startY := modalOverlayTop(h, tH)
	startX := (w - tW) / 2
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

type commandsLoadedMsg struct {
	sessionID   string
	workspaceID string
	commands    []gact.Command
	err         error
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
	sessionID    string
	text         string // the user message just posted; used by auto-rename
	contextFiles []gact.ContextFile
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

type contextFileContentLoadedMsg struct {
	sessionID string
	path      string
	content   gact.ContextFileContent
	err       error
}

type voiceTranscribedMsg struct {
	text       string
	durationMs int
}

type diffsAppliedMsg struct {
	paths       []string
	writeErrors map[string]string
}

type diffsRejectedMsg struct {
	paths []string
}
