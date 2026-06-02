package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type agentHierarchyLoadedMsg struct {
	agents []gact.AgentDef
	err    string
}

type agentHierarchyRow struct {
	agent gact.AgentDef
	depth int
}

type agentHierarchyRuntimeState string

const (
	agentHierarchyStateNone     agentHierarchyRuntimeState = ""
	agentHierarchyStateSession  agentHierarchyRuntimeState = "session"
	agentHierarchyStateObserved agentHierarchyRuntimeState = "observed"
	agentHierarchyStateActive   agentHierarchyRuntimeState = "active"
	agentHierarchyStateLive     agentHierarchyRuntimeState = "live"
)

func loadAgentHierarchyCmd(c *client.Client, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		agents, err := c.ListAgentsScoped(ctx, scope)
		if err != nil {
			return agentHierarchyLoadedMsg{err: err.Error()}
		}
		return agentHierarchyLoadedMsg{agents: agents}
	}
}

func (a *App) visibleAgentHierarchyRows() []agentHierarchyRow {
	agents := make([]gact.AgentDef, 0, len(a.agentHierarchyAgents))
	for _, agent := range a.agentHierarchyAgents {
		if agent.Source == "skill" {
			continue
		}
		agents = append(agents, agent)
	}
	byParent := map[string][]gact.AgentDef{}
	topLevel := make([]gact.AgentDef, 0)
	for _, agent := range agents {
		parent := agentParentID(agent)
		if parent == "" {
			topLevel = append(topLevel, agent)
			continue
		}
		byParent[parent] = append(byParent[parent], agent)
	}
	sortAgentsForCatalog(topLevel)
	for parent := range byParent {
		sortAgentsForCatalog(byParent[parent])
	}
	rows := make([]agentHierarchyRow, 0, len(agents))
	seen := map[string]bool{}
	var appendAgent func(gact.AgentDef, int)
	appendAgent = func(agent gact.AgentDef, depth int) {
		if seen[agent.ID] {
			return
		}
		seen[agent.ID] = true
		rows = append(rows, agentHierarchyRow{agent: agent, depth: depth})
		for _, child := range byParent[agent.ID] {
			appendAgent(child, depth+1)
		}
	}
	for _, agent := range topLevel {
		appendAgent(agent, 0)
	}
	for _, agent := range agents {
		appendAgent(agent, 0)
	}
	return rows
}

func (a *App) clampAgentHierarchySelection() {
	rows := a.visibleAgentHierarchyRows()
	if len(rows) == 0 {
		a.agentHierarchySel = 0
		return
	}
	a.agentHierarchySel = clampSelection(a.agentHierarchySel, len(rows))
}

func (a *App) openSelectedAgentHierarchyDetail() tea.Cmd {
	rows := a.visibleAgentHierarchyRows()
	if len(rows) == 0 {
		return nil
	}
	a.agentHierarchySel = clampSelection(a.agentHierarchySel, len(rows))
	agent := rows[a.agentHierarchySel].agent
	a.catalogBrowserOpen = true
	return a.openAgentDetail(agent.ID, firstNonEmpty(agent.Title, agent.ID))
}

func (a *App) renderAgentHierarchyModuleRows(width int, startRow int, rowBudget int) []string {
	t := a.Theme
	rowsData := a.visibleAgentHierarchyRows()
	title := a.sidebarModuleTitle(sidebarModuleAgents)
	disclosure := "▾ "
	if a.sidebarAgentsCollapsed {
		disclosure = "▸ "
		title += fmt.Sprintf(" (%d)", len(rowsData))
	}
	prefix := ""
	if a.focus == a.sidebarHitFocus && (a.sidebarSessionsCollapsed || a.sidebarSectionCursor) && a.sidebarSectionFocus == sidebarSectionAgents {
		prefix = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
	}
	rows := []string{
		prefix + lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render(disclosure+title),
	}
	a.registerSidebarSectionHeaderHit(startRow, width, sidebarSectionAgents)
	if a.sidebarAgentsCollapsed {
		return rows
	}
	if a.agentHierarchyErr != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).Render(truncate("error: "+a.agentHierarchyErr, width-6)))
		return rows
	}
	if len(rowsData) == 0 {
		rows = append(rows, t.HintLabel.Render("(no agents)"))
		return rows
	}
	a.clampAgentHierarchySelection()
	if rowBudget < 1 {
		rowBudget = 8
	}
	win := selectedItemWindow(len(rowsData), a.agentHierarchySel, rowBudget)
	if win.start > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d above", win.start)))
	}
	for i := win.start; i < win.end; i++ {
		row := startRow + len(rows)
		rows = append(rows, a.renderAgentHierarchyRow(rowsData[i], width, i == a.agentHierarchySel))
		a.registerSidebarAgentHierarchyHit(row, width, i)
	}
	if win.end < len(rowsData) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d below", len(rowsData)-win.end)))
	}
	return rows
}

func (a *App) renderAgentHierarchyRow(row agentHierarchyRow, width int, selected bool) string {
	t := a.Theme
	agent := row.agent
	runtimeState := a.agentHierarchyRuntimeState(agent.ID)
	marker := " "
	nameStyle := t.HintLabel
	if runtimeState == agentHierarchyStateSession || runtimeState == agentHierarchyStateActive || runtimeState == agentHierarchyStateLive {
		marker = ">"
		nameStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	}
	if selected && a.focus == a.sidebarHitFocus && a.sidebarSectionFocus == sidebarSectionAgents && !a.sidebarSectionCursor {
		marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
		nameStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	}
	indent := strings.Repeat("  ", min(row.depth, 4))
	branch := "• "
	if row.depth > 0 {
		branch = "└─ "
	}
	meta := firstNonEmpty(string(runtimeState), agent.Specialization, agent.Source)
	if agent.Tier > 0 {
		metaParts := []string{fmt.Sprintf("t%d", agent.Tier)}
		if meta != "" {
			metaParts = append(metaParts, meta)
		}
		meta = strings.Join(metaParts, " · ")
	}
	contentW := width - 6
	if contentW < 8 {
		contentW = 8
	}
	metaStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
	metaW := lipgloss.Width(meta)
	title := firstNonEmpty(agent.Title, agent.ID)
	nameBudget := contentW - lipgloss.Width(marker+indent+branch) - metaW - 1
	if nameBudget < 4 {
		nameBudget = 4
	}
	line := marker + indent + branch + nameStyle.Render(truncate(title, nameBudget))
	if meta != "" {
		line += " " + metaStyle.Render(meta)
	}
	return truncate(line, contentW)
}

func (a *App) agentHierarchyRuntimeState(agentID string) agentHierarchyRuntimeState {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return agentHierarchyStateNone
	}
	best := agentHierarchyStateNone
	if a.selected >= 0 && a.selected < len(a.sessions) && a.sessions[a.selected].Agent.ID == agentID {
		best = strongerAgentHierarchyState(best, agentHierarchyStateSession)
	}
	for i := len(a.messages) - 1; i >= 0; i-- {
		msg := a.messages[i]
		best = strongerAgentHierarchyState(best, agentStateFromRuntimeProvenance(agentID, mapValue(msg.Metadata["runtime_provenance"])))
		for j := len(msg.Parts) - 1; j >= 0; j-- {
			best = strongerAgentHierarchyState(best, agentStateFromPart(agentID, msg.Parts[j]))
			if best == agentHierarchyStateLive {
				return best
			}
		}
	}
	return best
}

func strongerAgentHierarchyState(a, b agentHierarchyRuntimeState) agentHierarchyRuntimeState {
	if agentHierarchyStateRank(b) > agentHierarchyStateRank(a) {
		return b
	}
	return a
}

func agentHierarchyStateRank(state agentHierarchyRuntimeState) int {
	switch state {
	case agentHierarchyStateLive:
		return 4
	case agentHierarchyStateActive:
		return 3
	case agentHierarchyStateObserved:
		return 2
	case agentHierarchyStateSession:
		return 1
	default:
		return 0
	}
}

func agentStateFromPart(agentID string, part gact.Part) agentHierarchyRuntimeState {
	state := agentHierarchyStateNone
	if part.Type == gact.PartTypeExpertHandoff {
		state = strongerAgentHierarchyState(state, agentStateFromRuntimeRow(agentID, part.Metadata))
	}
	rawEvent := mapValue(part.Metadata["raw_event"])
	if len(rawEvent) > 0 {
		state = strongerAgentHierarchyState(state, agentStateFromSemanticEvent(agentID, rawEvent))
	}
	if part.Type == partTypeRuntimeProvenance {
		state = strongerAgentHierarchyState(state, agentStateFromRuntimeProvenance(agentID, mapValue(part.Metadata["runtime_provenance"])))
	}
	return state
}

func agentStateFromSemanticEvent(agentID string, event map[string]any) agentHierarchyRuntimeState {
	if len(event) == 0 {
		return agentHierarchyStateNone
	}
	eventType := stringValue(event["event_type"])
	status := strings.ToLower(stringValue(event["status"]))
	actor := mapValue(event["actor"])
	subject := mapValue(event["subject"])
	payload := mapValue(event["payload"])
	matchesActor := mapReferencesAgent(actor, agentID)
	matchesSubject := mapReferencesAgent(subject, agentID)
	matchesPayload := mapReferencesAgent(payload, agentID)
	if !matchesActor && !matchesSubject && !matchesPayload {
		return agentHierarchyStateNone
	}
	if strings.HasSuffix(eventType, ".started") || status == "running" {
		return agentHierarchyStateLive
	}
	if eventType == "agent.invocation.completed" || eventType == "llm.response.completed" {
		if matchesActor || matchesPayload {
			return agentHierarchyStateActive
		}
	}
	if eventType == "delegation.parent_resumed" || eventType == "delegation.completed" || strings.HasSuffix(eventType, ".completed") {
		return agentHierarchyStateObserved
	}
	return agentHierarchyStateObserved
}

func agentStateFromRuntimeProvenance(agentID string, rp map[string]any) agentHierarchyRuntimeState {
	if len(rp) == 0 {
		return agentHierarchyStateNone
	}
	state := agentHierarchyStateNone
	agent := mapValue(rp["agent"])
	for _, key := range []string{"active_expert_id", "active_agent_id", "selected_agent_id", "id"} {
		if stringValue(agent[key]) == agentID {
			state = strongerAgentHierarchyState(state, agentHierarchyStateActive)
		}
	}
	delegation := mapValue(rp["delegation"])
	for _, row := range runtimeRowMaps(delegation["events"]) {
		state = strongerAgentHierarchyState(state, agentStateFromFinalRuntimeRow(agentID, row))
	}
	return state
}

func agentStateFromFinalRuntimeRow(agentID string, row map[string]any) agentHierarchyRuntimeState {
	if !mapReferencesAgent(row, agentID) {
		return agentHierarchyStateNone
	}
	stage := strings.ToLower(firstNonEmpty(
		stringValue(row["stage"]),
		stringValue(row["event_type"]),
		stringValue(row["status"]),
	))
	if strings.Contains(stage, "active") {
		return agentHierarchyStateActive
	}
	return agentHierarchyStateObserved
}

func agentStateFromRuntimeRow(agentID string, row map[string]any) agentHierarchyRuntimeState {
	if !mapReferencesAgent(row, agentID) {
		return agentHierarchyStateNone
	}
	stage := strings.ToLower(firstNonEmpty(
		stringValue(row["stage"]),
		stringValue(row["event_type"]),
		stringValue(row["status"]),
	))
	if strings.Contains(stage, "started") || stage == "running" || strings.Contains(stage, "tool.started") {
		return agentHierarchyStateLive
	}
	if strings.Contains(stage, "active") {
		return agentHierarchyStateActive
	}
	return agentHierarchyStateObserved
}

func mapReferencesAgent(m map[string]any, agentID string) bool {
	if len(m) == 0 || agentID == "" {
		return false
	}
	for _, key := range []string{
		"agent_id",
		"active_agent_id",
		"active_expert_id",
		"selected_agent_id",
		"child_id",
		"parent_id",
		"resumed_from",
		"dispatch_target",
		"agent",
		"id",
	} {
		if stringValue(m[key]) == agentID {
			return true
		}
	}
	return false
}

func (a *App) sidebarAgentHierarchyRowCount(rowBudget int) int {
	if !a.sidebarHasEnabledModule(sidebarModuleAgents) {
		return 0
	}
	rows := 1
	if a.sidebarAgentsCollapsed {
		return rows
	}
	if a.agentHierarchyErr != "" || len(a.visibleAgentHierarchyRows()) == 0 {
		return rows + 1
	}
	visible := len(a.visibleAgentHierarchyRows())
	if visible > rowBudget {
		rows += rowBudget
		if a.agentHierarchySel > 0 {
			rows++
		}
		if a.agentHierarchySel < visible-1 {
			rows++
		}
		return rows
	}
	return rows + visible
}

func (a *App) registerSidebarAgentHierarchyHit(row int, width int, visibleIndex int) {
	if a.hits == nil {
		return
	}
	zone := a.sidebarHitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:agents:item:" + itoa2(visibleIndex)
	if zone == FocusRightSidebar {
		id = "right-sidebar:agents:item:" + itoa2(visibleIndex)
	}
	a.registerSidebarContentHit(id, row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		app.sidebarSectionFocus = sidebarSectionAgents
		app.sidebarSectionCursor = false
		app.agentHierarchySel = visibleIndex
		return app.openSelectedAgentHierarchyDetail()
	})
}
