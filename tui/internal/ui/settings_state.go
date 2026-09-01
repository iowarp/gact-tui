package ui

// settingsComponent + settingsState: the Settings modal (model/agent/theme/TUI/language tabs).

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// settingsState holds the Settings modal's internal state. Embedded in
// settingsComponent so callers keep reading c.tab/c.agentSel/… directly.
type settingsState struct {
	tab         int // 0 = Model, 1 = Agent, 2 = Theme, 3 = TUI prefs, 4 = Language
	agentSel    int // index into agentList
	agentScroll int // first visible row in the Agent tab list
	themeSel    int // index into AllThemeModes
	tuiRow      int // TUI tab active row (0 = collapse threshold)
	languageSel int // index into availableLanguageOptions()
	agentList   []gact.AgentDef
	loadErr     string // set when loadSettingsCmd surfaces failures
}

// settingsComponent owns the Settings overlay: its open flag, its backing
// state (embedded settingsState, so callers keep reading c.tab/c.agentSel/…
// directly), and a back-reference to the root App for shared services. It
// replaces the old appOverlayState pair (settingsOpen bool + settings
// *settingsState) — open is the authority for whether the modal is visible.
type settingsComponent struct {
	app  *App
	open bool
	settingsState
}

// close hides the Settings modal without clearing its backing state.
func (c *settingsComponent) close() {
	c.open = false
}

// openTab opens the Settings modal on the given tab, seeds the selection
// indices from current Theme/Locale, and returns the agent-catalog fetch.
func (c *settingsComponent) openTab(tab int) tea.Cmd {
	c.open = true
	c.settingsState = settingsState{tab: tab}
	c.seedSelections()
	return loadSettingsCmd(c.app.c, c.app.session.runtimeScope())
}

// showError opens (or keeps open) the Settings modal on the Model tab and
// surfaces a load error there. Used by the LM-config component when provider
// config is unavailable, so it no longer pokes c.open/tab/loadErr by hand.
func (c *settingsComponent) showError(msg string) {
	c.open = true
	c.tab = 0
	c.loadErr = msg
}

// openState opens the Settings modal on a fully specified state without
// seeding the theme/language selections. It is the cross-component entry
// point (command palette /agent and /theme jumps) so callers no longer poke
// c.open / c.settingsState directly; the caller supplies the exact state and
// keeps ownership of whatever follow-up command it wants to run.
func (c *settingsComponent) openState(state settingsState) {
	c.open = true
	c.settingsState = state
}

// settingsTabCount is the canonical number of tabs — updating the list
// in view() without touching the wrap-around in handleKey caused Tab to
// go stale in past iterations. Single source of truth.
const settingsTabCount = 5

// loadSettingsCmd fetches the agent catalog for the Agent tab. Model
// data is intentionally NOT fetched here — Tab 0 hands off to the
// lifecycle LM-config modal which has its own catalog logic and is the
// single source of truth for provider/model state. Removing the
// per-provider /v1/providers/{id}/models calls also drops Ctrl+S
// latency from seconds (fan-out across every preset) to one
// round-trip.
func loadSettingsCmd(c *client.Client, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		agents, err := c.ListAgentsScoped(ctx, scope)
		if err != nil {
			return settingsLoadedMsg{loadErr: "agents: " + err.Error()}
		}
		return settingsLoadedMsg{agents: agents}
	}
}

// applySettingsCmd PATCHes the session with the chosen model + agent.
func applySettingsCmd(c *client.Client, sessionID string, model *gact.ModelRef, agent *gact.AgentRef) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		req := client.PatchSessionRequest{Model: model, Agent: agent}
		updated, err := c.PatchSession(ctx, sessionID, req)
		if err != nil {
			return errMsg{err: err, stage: "patch-session"}
		}
		msg := sessionUpdatedMsg{session: updated}
		if model != nil {
			ref := *model
			msg.model = &ref
		}
		if agent != nil {
			msg.agentID = agent.ID
		}
		return msg
	}
}

type settingsLoadedMsg struct {
	agents  []gact.AgentDef
	loadErr string
}

type sessionUpdatedMsg struct {
	session gact.Session
	model   *gact.ModelRef
	agentID string
}

func (c *settingsComponent) handleLoaded(m settingsLoadedMsg) (tea.Model, tea.Cmd) {
	c.agentList = selectableSessionAgents(m.agents)
	c.loadErr = m.loadErr
	// Pre-select current agent if present. Model selection lives in
	// the lifecycle LM-config modal, not here — Tab 0 just shows
	// the active model and a "Change provider…" entry point.
	if c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions) {
		cur := c.app.session.sessions[c.app.session.selected]
		for i, ag := range c.agentList {
			if ag.ID == cur.Agent.ID {
				c.agentSel = i
				break
			}
		}
	}
	return c.app, nil
}

func (c *settingsComponent) handleSessionUpdated(m sessionUpdatedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	// Apply the patched session into the local sessions slice.
	for i, s := range a.session.sessions {
		if s.ID == m.session.ID {
			a.session.sessions[i] = m.session
			break
		}
	}
	if m.agentID != "" {
		a.setHint("agent: " + m.agentID)
		return a, scheduleHintExpire(a.transientHint)
	}
	// Close the Settings modal if it was driving the PATCH (the
	// shared LM-config widgets dispatch through here in session-
	// patch mode). Surface a transient hint so the user has a
	// confirmation cue without needing to re-open the modal.
	if c.open && a.lmConfig.open && a.lmConfig.sessionPatchMode {
		c.open = false
		a.lmConfig.saving = false
		ref := m.session.Model
		if m.model != nil {
			ref = *m.model
		}
		if ref.ProviderID != "" {
			a.setHint("model: " + ref.ProviderID + "/" + ref.ModelID)
			return a, scheduleHintExpire(a.transientHint)
		}
	}
	return a, nil
}

func selectableSessionAgents(agents []gact.AgentDef) []gact.AgentDef {
	out := make([]gact.AgentDef, 0, len(agents))
	for _, ag := range agents {
		if ag.Source == "skill" || ag.Tier == 3 {
			continue
		}
		out = append(out, ag)
	}
	return out
}
