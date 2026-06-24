package ui

// sessionSetupState: the new-session setup picker's transient state.

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

type sessionSetupState struct {
	loading      bool
	errText      string
	defaultsOnly bool
	row          int
	blueprintSel int
	packSel      int
	saveDefault  bool
	blueprints   []gact.AgentBlueprintDefinition
	packs        []gact.ExpertPackDefinition
}

type sessionSetupLoadedMsg struct {
	blueprints []gact.AgentBlueprintDefinition
	packs      []gact.ExpertPackDefinition
	err        error
}

type sessionSetupSelection struct {
	BlueprintID string
	PackID      string
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
	c.setup.blueprints = filterSessionSetupBlueprints(m.blueprints)
	c.setup.packs = m.packs
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
	return loadSessionSetupOptionsCmd(c.app.c, c.runtimeScope())
}

func (c *sessionComponent) closeSetup() {
	c.setupOpen = false
	c.setup = nil
}

func (c *sessionComponent) applySetupDefaults() {
	if c.setup == nil {
		return
	}
	c.app.DefaultAgentBlueprintID = c.setupSelectedBlueprintID()
	c.app.DefaultExpertPackID = c.setupSelectedPackID()
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
	case "tab", "right", "l":
		c.setupFocusNext()
		return c.app, nil
	case "shift+tab", "left", "h":
		c.setupFocusPrev()
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

func (c *sessionComponent) setupFocusNext() {
	if c.setup == nil {
		return
	}
	c.setup.row = modulo(c.setup.row+1, 2)
}

func (c *sessionComponent) setupFocusPrev() {
	if c.setup == nil {
		return
	}
	c.setup.row = modulo(c.setup.row-1, 2)
}

func (c *sessionComponent) setupStepSelection(delta int) {
	if c.setup == nil || delta == 0 {
		return
	}
	s := c.setup
	switch s.row {
	case 0:
		count := len(s.blueprints) + 1
		if count > 0 {
			s.blueprintSel = modulo(s.blueprintSel+delta, count)
		}
	case 1:
		count := len(s.packs) + 1
		if count > 0 {
			s.packSel = modulo(s.packSel+delta, count)
		}
	case 2:
		if !s.defaultsOnly {
			s.saveDefault = !s.saveDefault
		}
	}
}

func (c *sessionComponent) setupSelectedBlueprintID() string {
	if c.setup == nil || c.setup.blueprintSel <= 0 {
		return ""
	}
	idx := c.setup.blueprintSel - 1
	if idx < 0 || idx >= len(c.setup.blueprints) {
		return ""
	}
	return strings.TrimSpace(c.setup.blueprints[idx].ID)
}

func (c *sessionComponent) setupSelectedPackID() string {
	if c.setup == nil || c.setup.packSel <= 0 {
		return ""
	}
	idx := c.setup.packSel - 1
	if idx < 0 || idx >= len(c.setup.packs) {
		return ""
	}
	return strings.TrimSpace(c.setup.packs[idx].ID)
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
	sel := sessionSetupSelection{
		BlueprintID: c.setupSelectedBlueprintID(),
		PackID:      c.setupSelectedPackID(),
	}
	c.closeSetup()
	return c.app, createSessionWithSemanticsCmd(c.app.c, c.wsID, sel)
}

func (c *sessionComponent) seedSetupSelections() {
	if c.setup == nil {
		return
	}
	s := c.setup
	s.blueprintSel = 0
	for i, bp := range s.blueprints {
		if strings.TrimSpace(bp.ID) == strings.TrimSpace(c.app.DefaultAgentBlueprintID) {
			s.blueprintSel = i + 1
			break
		}
	}
	s.packSel = 0
	for i, pack := range s.packs {
		if strings.TrimSpace(pack.ID) == strings.TrimSpace(c.app.DefaultExpertPackID) {
			s.packSel = i + 1
			break
		}
	}
}

func filterSessionSetupBlueprints(in []gact.AgentBlueprintDefinition) []gact.AgentBlueprintDefinition {
	out := make([]gact.AgentBlueprintDefinition, 0, len(in))
	for _, bp := range in {
		if strings.EqualFold(strings.TrimSpace(bp.Kind), "pack") {
			continue
		}
		out = append(out, bp)
	}
	return out
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
