package ui

// agentWriteModal: the create/clone agent-definition prompt overlay.

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/widget"
)

const (
	agentWriteModeCreate  = "create"
	agentWriteModeClone   = "clone"
	agentWriteModeExtract = "extract"
)

type agentWriteDoneMsg struct {
	mode  string
	agent gact.AgentDef
	err   error
}

type agentDeletedMsg struct {
	agentID string
	err     error
}

func (m *agentWriteModal) handleDone(msg agentWriteDoneMsg) (tea.Model, tea.Cmd) {
	a := m.app
	if msg.err != nil {
		a.setHint("agent write failed: " + operatorErrorMessage(msg.err))
		return a, scheduleHintExpire(a.transientHint)
	}
	a.setHint(agentWriteHint(msg.mode, msg.agent))
	var cmd tea.Cmd
	if a.catalog.open && a.catalog.current != nil {
		switch a.catalog.current.kind {
		case catalogKindAgents:
			cmd = loadCatalogBrowserCmd(a.c, catalogKindAgents, a.session.runtimeScope())
		case catalogKindAgentDetail:
			cmd = a.catalog.openAgentDetail(msg.agent.ID, valuefmt.FirstNonEmpty(msg.agent.Title, msg.agent.ID))
		}
	}
	return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)
}

func (c *agentComponent) handleAgentDeleted(m agentDeletedMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		c.app.setHint("agent delete failed: " + operatorErrorMessage(m.err))
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	c.app.setHint("deleted expert " + m.agentID)
	var cmd tea.Cmd
	if c.app.catalog.open && c.app.catalog.current != nil && c.app.catalog.current.kind == catalogKindAgents {
		cmd = loadCatalogBrowserCmd(c.app.c, catalogKindAgents, c.app.session.runtimeScope())
	}
	return c.app, tea.Batch(scheduleHintExpire(c.app.transientHint), cmd)
}

func (m *agentWriteModal) openModal(mode, sourceID, seedID string) {
	m.open = true
	m.mode = mode
	m.sourceID = sourceID
	m.input.SetValue(sanitizeAgentID(seedID))
	m.input.SetCursor(len([]rune(m.input.Value())))
}

// agentWriteModal is the agent-definition write prompt's state: the draft body,
// the mode (create vs extract), and the source agent id when extracting. It
// owns its behaviour (open/close/key/insert/commit/view) and a back-reference
// to the root App for shared services.
type agentWriteModal struct {
	app      *App
	open     bool
	mode     string
	sourceID string
	input    widget.TextInput
}

func (m *agentWriteModal) reset() { *m = agentWriteModal{app: m.app} }

func (m *agentWriteModal) close() { m.reset() }

func (m *agentWriteModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c":
		m.close()
		return m.app, nil
	case "enter":
		return m.commit()
	}
	m.input.HandleKey(k)
	return m.app, nil
}

func (m *agentWriteModal) insert(text string) {
	if text == "" {
		return
	}
	text = strings.TrimRight(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	m.input.Insert(text)
}

func (m *agentWriteModal) commit() (tea.Model, tea.Cmd) {
	a := m.app
	mode := m.mode
	sourceID := m.sourceID
	agentID := sanitizeAgentID(m.input.Value())
	m.close()
	if agentID == "" {
		a.setHint("agent write cancelled (empty id)")
		return a, scheduleHintExpire(a.transientHint)
	}
	switch mode {
	case agentWriteModeClone:
		return a, cloneAgentCmd(a.c, a.session.runtimeScope(), sourceID, agentID)
	case agentWriteModeExtract:
		sid := a.session.currentID()
		if sid == "" {
			a.setHint("select a session before extracting an agent")
			return a, scheduleHintExpire(a.transientHint)
		}
		return a, extractAgentCmd(a.c, sid, agentID)
	default:
		return a, createBasicAgentCmd(a.c, agentID)
	}
}
