package ui

// sessionSetupState: the new-session setup picker's transient state. A new
// session runs one agent; its plugins are composed by the backend.

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

type sessionSetupState struct {
	loading      bool
	errText      string
	defaultsOnly bool
	agentSel     int
	saveDefault  bool
	agents       []gact.PluginAgent
}

type sessionSetupLoadedMsg struct {
	agents []gact.PluginAgent
	err    error
}

func (c *sessionComponent) handleSetupLoaded(m sessionSetupLoadedMsg) (tea.Model, tea.Cmd) {
	if c.setup == nil {
		return c.app, nil
	}
	c.setup.loading = false
	c.setup.errText = ""
	if m.err != nil {
		c.setup.errText = m.err.Error()
	}
	c.setup.agents = m.agents
	c.seedSetupSelections()
	return c.app, nil
}

func (c *sessionComponent) openSetup(defaultsOnly bool) tea.Cmd {
	c.setupOpen = true
	c.setup = &sessionSetupState{
		loading:      true,
		defaultsOnly: defaultsOnly,
		saveDefault:  defaultsOnly,
	}
	return loadSessionSetupOptionsCmd(c.app.c)
}

func (c *sessionComponent) closeSetup() {
	c.setupOpen = false
	c.setup = nil
}

func (c *sessionComponent) applySetupDefaults() {
	if c.setup == nil {
		return
	}
	c.app.DefaultAgentRef = c.setupSelectedAgentRef()
	c.app.settings.persistPrefs()
}

func (c *sessionComponent) handleSetupKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if c.setup == nil {
		c.closeSetup()
		return c.app, nil
	}
	s := c.setup
	switch k.String() {
	case "esc", "ctrl+c":
		c.closeSetup()
		return c.app, nil
	case "up", "k":
		c.setupStepSelection(-1)
		return c.app, nil
	case "down", "j":
		c.setupStepSelection(+1)
		return c.app, nil
	case " ", "f":
		if !s.defaultsOnly {
			s.saveDefault = !s.saveDefault
		}
		return c.app, nil
	case "enter":
		if s.loading {
			return c.app, nil
		}
		return c.setupPrimaryAction()
	}
	return c.app, nil
}

func (c *sessionComponent) setupStepSelection(delta int) {
	if c.setup == nil || delta == 0 {
		return
	}
	c.setup.agentSel = modulo(c.setup.agentSel+delta, len(c.setup.agents)+1)
}

// setupSelectedAgentRef is the chosen agent's ref, or "" for the backend default.
func (c *sessionComponent) setupSelectedAgentRef() string {
	if c.setup == nil || c.setup.agentSel <= 0 {
		return ""
	}
	idx := c.setup.agentSel - 1
	if idx < 0 || idx >= len(c.setup.agents) {
		return ""
	}
	return strings.TrimSpace(c.setup.agents[idx].Ref)
}

func (c *sessionComponent) setupPrimaryAction() (tea.Model, tea.Cmd) {
	if c.setup == nil {
		return c.app, nil
	}
	if c.setup.defaultsOnly {
		c.applySetupDefaults()
		c.closeSetup()
		c.app.setHint("new-session defaults saved")
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	if c.setup.saveDefault {
		c.applySetupDefaults()
	}
	agentRef := c.setupSelectedAgentRef()
	c.closeSetup()
	return c.app, createSessionWithAgentCmd(c.app.c, c.wsID, agentRef)
}

func (c *sessionComponent) seedSetupSelections() {
	if c.setup == nil {
		return
	}
	c.setup.agentSel = 0
	for i, agent := range c.setup.agents {
		if strings.TrimSpace(agent.Ref) == strings.TrimSpace(c.app.DefaultAgentRef) {
			c.setup.agentSel = i + 1
			break
		}
	}
}

func modulo(n, m int) int {
	if m <= 0 {
		return 0
	}
	n %= m
	if n < 0 {
		n += m
	}
	return n
}
