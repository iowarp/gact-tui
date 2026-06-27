package ui

// execution_render.go renders the projected execution timeline (agents, handoffs, react steps, tool runs).

import (
	"strconv"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (c *executionComponent) renderConversation(t Theme, width int) (string, bool) {
	turns := c.conversationTurnsForRender()
	if len(turns) == 0 {
		return "", false
	}
	// Per-turn rendered-block cache, scoped to the current session. Only the
	// turn whose nodes changed re-renders; every other block is reused from the
	// last frame — so a streaming token costs one block render, not the whole
	// transcript (the projected-render hot path).
	sid := c.app.session.currentID()
	if c.turnRenderCache == nil || c.turnRenderCacheSID != sid {
		c.turnRenderCache = make(map[string]execTurnRender, len(turns)+1)
		c.turnRenderCacheSID = sid
	}
	cache := c.turnRenderCache
	themeSig := themeRenderSignature(t)

	var rows []string
	var prev *gact.Message
	turnByID := map[string][]executionTimelineNode{}
	var unscoped [][]executionTimelineNode
	supplementsByTurn := c.assistantSupplementNodesByTurn()
	for _, turn := range turns {
		if turn.TurnID == "" {
			unscoped = append(unscoped, turn.Nodes)
			continue
		}
		turnByID[turn.TurnID] = turn.Nodes
	}
	unscopedIdx := 0
	for msgIdx, m := range c.app.conversation.messages {
		if m.Role != gact.RoleUser {
			continue
		}
		turnID := messageTurnID(m)
		nodes := turnByID[turnID]
		if len(nodes) == 0 && unscopedIdx < len(unscoped) {
			nodes = unscoped[unscopedIdx]
			unscopedIdx++
		}
		if supplements := supplementsByTurn[turnID]; len(supplements) > 0 {
			// Copy before appending: `nodes` aliases the memoized projection's
			// backing array, so an in-place append would corrupt the cache.
			dedup := executionDedupSupplementNodes(nodes, supplements)
			combined := make([]executionTimelineNode, 0, len(nodes)+len(dedup))
			combined = append(combined, nodes...)
			combined = append(combined, dedup...)
			nodes = combined
		}
		prevID := ""
		if prev != nil {
			prevID = prev.ID
		}
		selected := c.turnSelected(msgIdx)
		sig := executionTurnBlockSignature(themeSig, width, m, prevID, nodes, selected)
		if entry, ok := cache[m.ID]; ok && entry.sig == sig {
			if entry.row != "" {
				rows = append(rows, entry.row)
			}
		} else {
			block := c.renderProjectedTurnBlock(t, width, m, prev, nodes, selected)
			cache[m.ID] = execTurnRender{sig: sig, row: block}
			if block != "" {
				rows = append(rows, block)
			}
		}
		mm := m
		prev = &mm
	}
	for ; unscopedIdx < len(unscoped); unscopedIdx++ {
		nodes := unscoped[unscopedIdx]
		key := "\x00unscoped:" + strconv.Itoa(unscopedIdx)
		sig := executionTurnBlockSignature(themeSig, width, gact.Message{}, key, nodes, false)
		if entry, ok := cache[key]; ok && entry.sig == sig {
			if entry.row != "" {
				rows = append(rows, entry.row)
			}
			continue
		}
		block := lipgloss.JoinVertical(lipgloss.Left,
			t.renderExecutionTimeline(nodes, width),
			"",
		)
		cache[key] = execTurnRender{sig: sig, row: block}
		rows = append(rows, block)
	}
	return strings.Join(rows, "\n"), true
}

// renderProjectedTurnBlock renders one turn's block: the user message row
// followed by the assistant execution-timeline (header + nodes). Returns "" for
// a turn that renders nothing. Pure given its inputs — the cache key in
// renderConversation captures every one of them.
func (c *executionComponent) renderProjectedTurnBlock(
	t Theme,
	width int,
	m gact.Message,
	prev *gact.Message,
	nodes []executionTimelineNode,
	selected bool,
) string {
	var parts []string
	if rendered := t.renderMessageInContextWithResults(m, prev, width, nil); strings.TrimSpace(rendered) != "" {
		parts = append(parts, rendered)
	}
	if len(nodes) > 0 {
		timeline := t.renderExecutionTimeline(nodes, width)
		if selected {
			timeline = prefixFirstLine(timeline, t.renderProjectedExecutionSelectionMarker())
		}
		parts = append(parts, lipgloss.JoinVertical(lipgloss.Left, timeline, ""))
	}
	return strings.Join(parts, "\n")
}

func prefixFirstLine(s, prefix string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return prefix + s[:i] + "\n" + s[i+1:]
	}
	return prefix + s
}

func (t Theme) renderProjectedExecutionSelectionMarker() string {
	return lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("▌ ")
}

// renderExecutionTimeline renders a turn's projected nodes in the canonical
// transcript grammar (apps/web/CANONICAL-CONVERSATION.md):
//
//	▎agent  — a colored header, shown once atop a block and re-shown when the
//	          root agent resumes after control returned to it.
//	●  …    — one turn (a thought, a tool call, a delegation, or an answer).
//	→ delegates to X  — a turn of the parent; the task is the lines below it and
//	                    the child indents one level deeper.
//	⤶ returns to X    — control handed back, closing the child block.
//	⎿ …    — a tool result under its call.
//
// Depth is indentation only. The walk is stateful: levelAgent tracks which agent
// currently heads each depth so a header prints once, and a drop in depth
// synthesizes the ⤶ returns that the stream models implicitly.
func (t Theme) renderExecutionTimeline(nodes []executionTimelineNode, width int) string {
	w := &execTimelineWriter{t: t, width: width, levelAgent: map[int]string{}}
	for _, node := range nodes {
		w.add(node)
	}
	w.closeTo(0)
	return strings.Join(w.trimRows(), "\n")
}

type execTimelineWriter struct {
	t          Theme
	width      int
	rows       []string
	levelAgent map[int]string
	curDepth   int
	started    bool
}

func execHeaderIndent(d int) string {
	if d < 0 {
		d = 0
	}
	return strings.Repeat(" ", 5*d)
}

func execTurnIndent(d int) string {
	if d < 0 {
		d = 0
	}
	return strings.Repeat(" ", 5*d+2)
}

func execBodyIndent(d int) string {
	if d < 0 {
		d = 0
	}
	return strings.Repeat(" ", 5*d+5)
}

func (w *execTimelineWriter) turnMarker() string {
	return lipgloss.NewStyle().Foreground(w.t.FgMuted).Render("●")
}

// blank appends a separator line, collapsing consecutive blanks.
func (w *execTimelineWriter) blank() {
	if len(w.rows) == 0 || w.rows[len(w.rows)-1] == "" {
		return
	}
	w.rows = append(w.rows, "")
}

func (w *execTimelineWriter) trimRows() []string {
	for len(w.rows) > 0 && w.rows[0] == "" {
		w.rows = w.rows[1:]
	}
	for len(w.rows) > 0 && w.rows[len(w.rows)-1] == "" {
		w.rows = w.rows[:len(w.rows)-1]
	}
	return w.rows
}

func (w *execTimelineWriter) classify(node executionTimelineNode) (depth int, owner string, delegation bool) {
	switch node.Kind {
	case executionNodeHandoff:
		d := node.Depth - 1
		if d < 0 {
			d = 0
		}
		return d, firstNonEmpty(strings.TrimSpace(node.ParentAgent), "main"), true
	default:
		return node.Depth, firstNonEmpty(strings.TrimSpace(node.Agent), "main"), false
	}
}

func (w *execTimelineWriter) add(node executionTimelineNode) {
	depth, owner, delegation := w.classify(node)
	if depth < 0 {
		depth = 0
	}
	if w.started && depth < w.curDepth {
		w.closeTo(depth)
	}
	if owner != "" && w.levelAgent[depth] != owner {
		w.emitHeader(depth, owner)
	}
	if delegation {
		w.emitDelegation(node, depth)
		child := firstNonEmpty(strings.TrimSpace(node.Agent), "expert")
		childDepth := depth + 1
		// Open the child block immediately so even an empty child (its prose
		// missing upstream — see the dev-team gap note) still renders its
		// ▎header and a matching ⤶ returns.
		w.emitHeader(childDepth, child)
		w.curDepth = childDepth
		w.started = true
		return
	}
	w.emitTurns(node, depth)
	w.curDepth = depth
	w.started = true
}

func (w *execTimelineWriter) emitHeader(depth int, agent string) {
	agent = firstNonEmpty(strings.TrimSpace(agent), "main")
	w.blank()
	bar := lipgloss.NewStyle().Foreground(agentColor(w.t, agent)).Bold(true).Render("▎")
	w.rows = append(w.rows, execHeaderIndent(depth)+bar+renderAgentName(w.t, agent))
	w.levelAgent[depth] = agent
}

func (w *execTimelineWriter) closeTo(depth int) {
	for lvl := w.curDepth; lvl > depth; lvl-- {
		parent := firstNonEmpty(w.levelAgent[lvl-1], "main")
		marker := lipgloss.NewStyle().Foreground(w.t.FgMuted).Render("⤶ returns to ")
		w.rows = append(w.rows, execHeaderIndent(lvl)+marker+renderAgentName(w.t, parent))
		delete(w.levelAgent, lvl)
	}
	if w.curDepth > depth {
		w.blank()
	}
	// The root orchestrator re-announces itself each time control returns to it;
	// a nested expert keeps its single header across its contiguous sub-block.
	if depth == 0 {
		delete(w.levelAgent, 0)
	}
	w.curDepth = depth
}

func (w *execTimelineWriter) emitDelegation(node executionTimelineNode, depth int) {
	child := firstNonEmpty(strings.TrimSpace(node.Agent), "expert")
	arrow := lipgloss.NewStyle().Foreground(w.t.FgMuted).Render("→ delegates to ")
	w.rows = append(w.rows, execTurnIndent(depth)+w.turnMarker()+"  "+arrow+renderAgentName(w.t, child))
	question := strings.TrimSpace(node.Question)
	if semanticPreviewIsRedacted(question) {
		question = ""
	}
	if question != "" {
		if body := executionWrapForPrefix(executionDisplayProse(question), w.width, execBodyIndent(depth)); body != "" {
			w.rows = append(w.rows, body)
		}
	}
}

func (w *execTimelineWriter) emitTurns(node executionTimelineNode, depth int) {
	switch node.Kind {
	case executionNodeAssistantText:
		w.emitProseTurn(depth, node.Agent, node.Text)
	case executionNodeExpertReport:
		report := executionExpertReportPreview(node)
		if report == "" {
			report = executionDisplayProse(firstNonEmpty(node.Text, node.Summary))
		}
		if report != "" {
			w.emitTurnText(depth, report)
		}
	case executionNodeReactStep:
		w.emitReactStep(node, depth)
	case executionNodeToolRun:
		if node.Status == "running" {
			return
		}
		w.emitToolCall(depth, node.ToolName, node.ToolArgs, node.Observation)
	}
}

func (w *execTimelineWriter) emitProseTurn(depth int, agent, text string) {
	body := executionDisplayProse(text)
	if executionPlaceholderAssistantText(body) {
		return
	}
	if preview := executionAgentTextStructuredPreview(agent, body); preview != "" {
		body = preview
	}
	if body == "" {
		return
	}
	w.emitTurnText(depth, body)
}

func (w *execTimelineWriter) emitReactStep(node executionTimelineNode, depth int) {
	if thinking := strings.TrimSpace(node.Thinking); thinking != "" && !semanticPreviewIsRedacted(thinking) {
		thinking = strings.TrimSpace(stripExecutionControlSections(thinking))
		if thinking != "" {
			if node.Reasoning != "" {
				thinking += lipgloss.NewStyle().Foreground(w.t.FgFaint).Render(" · Ctrl+E reasoning trace")
			}
			w.emitTurnText(depth, thinking)
		}
	}
	if strings.TrimSpace(node.ToolName) != "" && !node.IsFinish {
		w.emitToolCall(depth, node.ToolName, node.ToolArgs, node.Observation)
	}
	if node.IsFinish {
		if observation := executionFinishPreview(node); observation != "" {
			w.emitTurnText(depth, observation)
		}
	}
}

func (w *execTimelineWriter) emitToolCall(depth int, toolName string, args, observation any) {
	callW := w.width - lipgloss.Width(execTurnIndent(depth)) - 3
	if callW < 24 {
		callW = 24
	}
	call := w.t.executionToolCallLine(toolName, args, callW)
	w.rows = append(w.rows, execTurnIndent(depth)+w.turnMarker()+"  "+call)
	if preview := w.t.executionObservationPreview(toolName, observation); preview != "" {
		w.rows = append(w.rows, indentText(w.t.executionObservationBlock(preview), execBodyIndent(depth)))
	}
}

// emitTurnText renders prose as one ● turn: the marker leads the first line and
// continuations align under the body indent.
func (w *execTimelineWriter) emitTurnText(depth int, text string) {
	wrapped := executionWrapForPrefix(text, w.width, execBodyIndent(depth))
	if strings.TrimSpace(wrapped) == "" {
		return
	}
	lines := strings.Split(wrapped, "\n")
	lines[0] = execTurnIndent(depth) + w.turnMarker() + "  " + strings.TrimPrefix(lines[0], execBodyIndent(depth))
	w.rows = append(w.rows, strings.Join(lines, "\n"))
}
