package ui

// app_constructor.go constructs App (New/NewWithTheme), wires its sub-components, and exposes startup configuration setters.

import (
	"os"
	"strings"

	"charm.land/bubbles/v2/key"
	"charm.land/bubbles/v2/textarea"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

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
		appConfigState: appConfigState{
			BackendURL:   backendURL,
			Theme:        theme,
			MouseEnabled: true,
		},
		c:     client.New(backendURL),
		stage: StageConnecting,
		focus: FocusInput,
		appLifecycleState: appLifecycleState{
			previouslyDetached: map[string]bool{},
		},
		appFeedbackState: appFeedbackState{
			localizer: newLocalizer(os.Getenv("GACT_LOCALE")),
		},
		session: sessionComponent{
			appSessionState: appSessionState{
				selected: -1,
			},
		},
		inputComposer: inputComposerComponent{
			input: ta,
		},
		conversation: conversationComponent{
			appConversationState: appConversationState{
				stickyToBottom: true,
				bodySelMsgIdx:  -1,
				bodySelPartIdx: -1,
			},
		},
		connection: connectionComponent{
			appConnectionState: appConnectionState{
				lastSeenSeqIDBySession: map[string]uint64{},
			},
		},
		execution: executionComponent{
			executionEventsBySession: map[string][]executionTimelineEvent{},
		},
		audit: newTUIAuditRecorderFromEnv(),
	}
	app.inputComposer.inputHistoryBySession = map[string][]string{}
	app.inputComposer.historyCursor = -1
	app.wireComponents()
	app.fileViewer.initFromCwd()
	app.refreshLocalizedPlaceholders()
	return app
}

// wireComponents sets the back-reference each domain component holds to the
// root App, so a component's methods can reach shared services (client, theme,
// dimensions, focus, cross-domain components) via c.app. Called once at
// construction; every component embedded in App is registered here.
func (a *App) wireComponents() {
	a.agent.app = a
	a.catalog.app = a
	a.chrome.app = a
	a.clipboard.app = a
	a.contextActions.app = a
	a.contextAdd.app = a
	a.contextFiles.app = a
	a.connection.app = a
	a.conversation.app = a
	a.detail.app = a
	a.cmdPalette.app = a
	a.doctor.app = a
	a.help.app = a
	a.expertPackInstall.app = a
	a.mcpInstall.app = a
	a.mcpRemove.app = a
	a.agentBlueprintManage.app = a
	a.agentEdit.app = a
	a.askUser.app = a
	a.rename.app = a
	a.execution.app = a
	a.filePicker.app = a
	a.fileViewer.app = a
	a.inputComposer.app = a
	a.interaction.app = a
	a.modals.app = a
	a.lmConfig.app = a
	a.metrics.app = a
	a.quitConfirm.app = a
	a.session.app = a
	a.settings.app = a
	a.sidebar.app = a
	a.sidebarLayout.app = a
	a.promptEdit.app = a
	a.agentWrite.app = a
	a.retryNotes.app = a
	a.retryModel.app = a
	a.workspace.app = a
	a.ticker.app = a
	a.permission.app = a
	a.memory.app = a
	a.plugins.app = a
	a.contextView.app = a
}

// LoadDetachedRegistry seeds previouslyDetached from the local
// detached.json registry. Called by main.go before p.Run() so the
// sidebar marker can paint as soon as sessions arrive. Soft-fails:
// a missing or unreadable registry is not a TUI startup failure,
// the marker just won't appear.
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
