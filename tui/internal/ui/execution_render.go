package ui

// execution_render.go renders the projected execution timeline (agents, handoffs, react steps, tool runs).
//
// #233 phase 1: this is THE transcript render. The former flat per-message
// fallback in conversation_view.go is retired (web precedent 09240c4c — one
// total projection for every turn, live and reloaded); part-level hit testing
// now rides the projected nodes' source addresses.

import (
	"strconv"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// renderConversation renders the whole conversation body from the parts-only
// projection and returns the body plus the part-level hit blocks (fullStart
// offsets are body-absolute). ok is false only when there is nothing to render.
func (c *executionComponent) renderConversation(t Theme, width int) (string, []conversationPartHitBlock, bool) {
	messages := c.app.conversation.messages
	if len(messages) == 0 {
		return "", nil, false
	}
	turns := c.conversationTurnsForRender()
	// Per-turn rendered-block cache, scoped to the current session. Only the
	// turn whose inputs changed re-renders; every other block is reused from the
	// last frame — so a streaming token costs one block render, not the whole
	// transcript (the projected-render hot path).
	sid := c.app.session.currentID()
	if c.turnRenderCache == nil || c.turnRenderCacheSID != sid {
		c.turnRenderCache = make(map[string]execTurnRender, len(turns)+1)
		c.turnRenderCacheSID = sid
	}
	themeSig := themeRenderSignature(t)

	turnByID := map[string][]executionTimelineNode{}
	for _, turn := range turns {
		turnByID[turn.TurnID] = turn.Nodes
	}
	supplementsByTurn := c.assistantSupplementNodesByTurn()
	anchored := map[string]bool{}
	for _, m := range messages {
		if m.Role == gact.RoleUser {
			anchored[firstNonEmpty(messageTurnID(m), m.ID)] = true
		}
	}

	conv := c.app.conversation
	selMsgIdx, selAddrIdx := -1, -1
	selPartID := ""
	if c.app.focus == FocusBody {
		selMsgIdx, selAddrIdx = conv.bodySelMsgIdx, conv.bodySelPartIdx
		selPartID = conv.selectedPartID()
	}

	var rows []string
	var blocks []conversationPartHitBlock
	fullLine := 0
	appendRow := func(row string, rowBlocks []conversationPartHitBlock, searchHit bool) {
		if row == "" {
			return
		}
		if searchHit {
			marker := lipgloss.NewStyle().Foreground(t.Warning).Bold(true).Render("▶ ")
			row = prependGutter(row, marker)
		}
		for _, b := range rowBlocks {
			b.fullStart += fullLine
			if b.detailStart >= 0 {
				b.detailStart += fullLine
			}
			for j := range b.diffActions {
				b.diffActions[j].row += fullLine
			}
			blocks = append(blocks, b)
		}
		rows = append(rows, row)
		fullLine += renderedStringLineCount(row)
	}
	// searchHit marks the ▶ jump marker on the block that renders the matched
	// message: the user row for a user match, the owning turn's timeline for an
	// assistant match (assistant prose no longer has a standalone row).
	turnContains := func(nodes []executionTimelineNode, msgID string) bool {
		if msgID == "" {
			return false
		}
		for _, n := range nodes {
			if n.Src.Valid && n.Src.MsgIdx >= 0 && n.Src.MsgIdx < len(messages) && messages[n.Src.MsgIdx].ID == msgID {
				return true
			}
		}
		return false
	}

	emittedTurn := map[string]bool{}
	var prevRendered *gact.Message
	lastUserTurnID := ""
	lastModelLabel := ""
	for msgIdx := range messages {
		m := messages[msgIdx]
		if isSemanticLiveMessage(m) {
			continue
		}
		if isModelSwapMarker(m) {
			if label := modelSwapMarkerLabel(m); label != "" {
				lastModelLabel = label
			}
			appendRow(t.renderModelSwapDivider(m, width), nil, m.ID != "" && m.ID == conv.searchHitMessageID)
			continue
		}
		if label := modelRefLabel(m); label != "" {
			if lastModelLabel != "" && label != lastModelLabel {
				appendRow(t.renderModelSwapDivider(gact.Message{
					Role: gact.RoleSystem,
					Metadata: map[string]any{
						"gact_tui_kind": modelSwapMarkerKind,
						"label":         label,
					},
				}, width), nil, false)
			}
			lastModelLabel = label
		}

		switch m.Role {
		case gact.RoleUser:
			turnID := firstNonEmpty(messageTurnID(m), m.ID)
			lastUserTurnID = turnID
			emittedTurn[turnID] = true
			nodes := c.turnNodesWithSupplements(turnByID[turnID], supplementsByTurn[turnID])
			row, rowBlocks := c.cachedTurnBlockRender(t, themeSig, width, m, msgIdx, prevRendered, nodes, selMsgIdx, selAddrIdx, selPartID)
			hit := m.ID != "" && (m.ID == conv.searchHitMessageID || turnContains(nodes, conv.searchHitMessageID))
			appendRow(row, rowBlocks, hit)
			mm := m
			prevRendered = &mm

		case gact.RoleAssistant:
			// Assistant content renders inside its turn's timeline. Only a turn
			// no user message anchors (assistant-first transcripts, batch
			// imports) emits its timeline standalone at this position.
			tid := firstNonEmpty(messageTurnID(m), lastUserTurnID, m.ID)
			if anchored[tid] || emittedTurn[tid] {
				continue
			}
			emittedTurn[tid] = true
			nodes := c.turnNodesWithSupplements(turnByID[tid], supplementsByTurn[tid])
			if len(nodes) == 0 {
				continue
			}
			row, rowBlocks := c.cachedTurnBlockRender(t, themeSig, width, gact.Message{}, -1, nil, nodes, selMsgIdx, selAddrIdx, selPartID)
			appendRow(row, rowBlocks, turnContains(nodes, conv.searchHitMessageID))
		}
	}
	return strings.Join(rows, "\n"), blocks, len(rows) > 0
}

// turnNodesWithSupplements appends the deduplicated supplement nodes to a
// turn's projected nodes, copying first: nodes aliases the memoized
// projection's backing array, so an in-place append would corrupt the cache.
func (c *executionComponent) turnNodesWithSupplements(nodes, supplements []executionTimelineNode) []executionTimelineNode {
	if len(supplements) == 0 {
		return nodes
	}
	dedup := executionDedupSupplementNodes(nodes, supplements)
	if len(dedup) == 0 {
		return nodes
	}
	combined := make([]executionTimelineNode, 0, len(nodes)+len(dedup))
	combined = append(combined, nodes...)
	combined = append(combined, dedup...)
	return combined
}

// cachedTurnBlockRender renders one turn block (optional user row + execution
// timeline) through the per-turn cache. msgIdx is the user message's index
// (-1 for an unanchored, timeline-only block). Returned blocks are
// block-relative copies safe for the caller to offset.
func (c *executionComponent) cachedTurnBlockRender(
	t Theme,
	themeSig uint64,
	width int,
	m gact.Message,
	msgIdx int,
	prev *gact.Message,
	nodes []executionTimelineNode,
	selMsgIdx int,
	selAddrIdx int,
	selPartID string,
) (string, []conversationPartHitBlock) {
	// Fold selection into the key only when it lands inside this block, so
	// moving the cursor re-renders two blocks (old + new), not the transcript.
	selKey := ""
	if selMsgIdx >= 0 && (selMsgIdx == msgIdx || nodesContainMsg(nodes, selMsgIdx)) {
		selKey = strconv.Itoa(selMsgIdx) + ":" + strconv.Itoa(selAddrIdx) + ":" + selPartID
	}
	prevID := ""
	if prev != nil {
		prevID = prev.ID
	}
	key := m.ID
	if key == "" && len(nodes) > 0 {
		key = "\x00turn:" + strconv.Itoa(nodes[0].Src.MsgIdx)
	}
	sig := executionTurnBlockSignature(themeSig, width, m, msgIdx, prevID, nodes, selKey)
	if entry, ok := c.turnRenderCache[key]; ok && entry.sig == sig {
		return entry.row, entry.blocks
	}
	row, rowBlocks := c.renderProjectedTurnBlock(t, width, m, msgIdx, prev, nodes, selMsgIdx, selAddrIdx, selPartID)
	c.turnRenderCache[key] = execTurnRender{sig: sig, row: row, blocks: rowBlocks}
	return row, rowBlocks
}

func nodesContainMsg(nodes []executionTimelineNode, msgIdx int) bool {
	for _, n := range nodes {
		if n.Src.Valid && n.Src.MsgIdx == msgIdx {
			return true
		}
	}
	return false
}

// renderProjectedTurnBlock renders one turn's block: the user message row
// (when m is a real message) followed by the execution timeline (headers +
// nodes), collecting block-relative part hit regions for both. Returns ""
// for a turn that renders nothing. Pure given its inputs — the cache key in
// cachedTurnBlockRender captures every one of them.
func (c *executionComponent) renderProjectedTurnBlock(
	t Theme,
	width int,
	m gact.Message,
	msgIdx int,
	prev *gact.Message,
	nodes []executionTimelineNode,
	selMsgIdx int,
	selAddrIdx int,
	selPartID string,
) (string, []conversationPartHitBlock) {
	var parts []string
	var blocks []conversationPartHitBlock
	line := 0
	if m.Role != "" {
		sel := ""
		if msgIdx == selMsgIdx {
			sel = selPartID
		}
		row, msgBlocks := t.renderMessageWithHits(m, prev, width, nil, sel)
		if strings.TrimSpace(row) != "" {
			for i := range msgBlocks {
				msgBlocks[i].msgIdx = msgIdx
			}
			blocks = append(blocks, msgBlocks...)
			parts = append(parts, row)
			line += renderedStringLineCount(row)
		}
	}
	if len(nodes) > 0 {
		timeline, tblocks := t.renderExecutionTimelineWithHits(nodes, width, selMsgIdx, selAddrIdx)
		if timeline != "" {
			msgs := c.app.conversation.messages
			for i := range tblocks {
				tblocks[i].fullStart += line
				if tblocks[i].detailStart >= 0 {
					tblocks[i].detailStart += line
				}
				for j := range tblocks[i].diffActions {
					tblocks[i].diffActions[j].row += line
				}
				if tblocks[i].msgIdx >= 0 && tblocks[i].msgIdx < len(msgs) {
					_, opens := findBulkyPartForSelected(msgs[tblocks[i].msgIdx], tblocks[i].addrIdx, msgs, tblocks[i].msgIdx)
					tblocks[i].opensDetail = opens
				}
			}
			blocks = append(blocks, tblocks...)
			parts = append(parts, lipgloss.JoinVertical(lipgloss.Left, timeline, ""))
		}
	}
	return strings.Join(parts, "\n"), blocks
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
	rendered, _ := t.renderExecutionTimelineWithHits(nodes, width, -1, -1)
	return rendered
}

// renderExecutionTimelineWithHits renders the timeline AND reports each
// part-addressed node's line span as a hit block (fullStart relative to the
// timeline's first line). The selected part's node — (selMsgIdx, selAddrIdx)
// against the node's source address — is painted with the ▌ selection cursor.
func (t Theme) renderExecutionTimelineWithHits(nodes []executionTimelineNode, width int, selMsgIdx, selAddrIdx int) (string, []conversationPartHitBlock) {
	w := &execTimelineWriter{
		t: t, width: width, levelAgent: map[int]string{},
		selMsgIdx: selMsgIdx, selAddrIdx: selAddrIdx,
	}
	for _, node := range nodes {
		w.add(node)
	}
	w.closeTo(0)
	return strings.Join(w.trimRows(), "\n"), w.blocks
}

type execTimelineWriter struct {
	t          Theme
	width      int
	rows       []string
	lines      int // total rendered lines across rows (rows join with "\n")
	levelAgent map[int]string
	curDepth   int
	started    bool

	selMsgIdx  int
	selAddrIdx int
	blocks     []conversationPartHitBlock
}

// push appends a row and advances the line cursor by the row's height.
func (w *execTimelineWriter) push(row string) {
	w.rows = append(w.rows, row)
	w.lines += renderedStringLineCount(row)
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
	w.push("")
}

func (w *execTimelineWriter) trimRows() []string {
	for len(w.rows) > 0 && w.rows[len(w.rows)-1] == "" {
		w.rows = w.rows[:len(w.rows)-1]
	}
	// Leading blanks cannot occur (blank() no-ops on an empty writer), so the
	// recorded block offsets stay valid after the trailing trim.
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
		startRow, startLine := len(w.rows), w.lines
		w.emitDelegation(node, depth)
		w.recordNodeSpan(node, startRow, startLine)
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
	startRow, startLine := len(w.rows), w.lines
	w.emitTurns(node, depth)
	w.recordNodeSpan(node, startRow, startLine)
	w.curDepth = depth
	w.started = true
}

// recordNodeSpan turns the rows a node just emitted into a part hit block
// (when the node is part-addressed) and paints the ▌ selection cursor when the
// node is the body cursor's target. Headers/returns around the node are
// deliberately outside the span — they belong to the timeline, not the part.
func (w *execTimelineWriter) recordNodeSpan(node executionTimelineNode, startRow, startLine int) {
	if !node.Src.Valid || w.lines == startLine {
		return
	}
	segment := strings.Join(w.rows[startRow:], "\n")
	if w.selMsgIdx >= 0 && node.Src.MsgIdx == w.selMsgIdx && node.Src.AddrIdx == w.selAddrIdx {
		// Collapse the span into one marked row; row boundaries only matter for
		// the final join, and the line count is unchanged.
		w.rows = append(w.rows[:startRow], markSelectedBlock(segment, w.t))
	}
	block := conversationPartHitBlock{
		msgIdx:      node.Src.MsgIdx,
		addrIdx:     node.Src.AddrIdx,
		partID:      node.Src.PartID,
		fullStart:   startLine,
		height:      w.lines - startLine,
		detailStart: -1,
	}
	if detail := detailAffordanceLine(segment); detail >= 0 {
		block.detailStart = startLine + detail
	}
	if node.Kind == executionNodePassthrough && node.Part != nil && pendingFileDiff(*node.Part) {
		for _, action := range diffActionHits(node.Part.Path, segment) {
			action.row += startLine
			block.diffActions = append(block.diffActions, action)
		}
	}
	w.blocks = append(w.blocks, block)
}

func (w *execTimelineWriter) emitHeader(depth int, agent string) {
	agent = firstNonEmpty(strings.TrimSpace(agent), "main")
	w.blank()
	bar := lipgloss.NewStyle().Foreground(agentColor(w.t, agent)).Bold(true).Render("▎")
	w.push(execHeaderIndent(depth) + bar + renderAgentName(w.t, agent))
	w.levelAgent[depth] = agent
}

func (w *execTimelineWriter) closeTo(depth int) {
	for lvl := w.curDepth; lvl > depth; lvl-- {
		parent := firstNonEmpty(w.levelAgent[lvl-1], "main")
		marker := lipgloss.NewStyle().Foreground(w.t.FgMuted).Render("⤶ returns to ")
		w.push(execHeaderIndent(lvl) + marker + renderAgentName(w.t, parent))
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
	w.push(execTurnIndent(depth) + w.turnMarker() + "  " + arrow + renderAgentName(w.t, child))
	question := strings.TrimSpace(node.Question)
	if semanticPreviewIsRedacted(question) {
		question = ""
	}
	if question != "" {
		if body := executionWrapForPrefix(executionDisplayProse(question), w.width, execBodyIndent(depth)); body != "" {
			w.push(body)
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
		w.emitToolCall(depth, node.ToolName, node.ToolArgs, node.Observation, node.HasRawDetail)
	case executionNodePassthrough:
		w.emitPassthroughPart(node, depth)
	}
}

// emitPassthroughPart renders a part the timeline grammar has no row for
// (file_diff, image, document, …) through its own part view, indented at the
// owning agent's depth, so the unified render never drops transcript content.
func (w *execTimelineWriter) emitPassthroughPart(node executionTimelineNode, depth int) {
	if node.Part == nil {
		return
	}
	indent := execBodyIndent(depth)
	rendered := w.t.renderPart(*node.Part, w.width-lipgloss.Width(indent))
	if strings.TrimSpace(rendered) == "" {
		return
	}
	w.push(indentText(rendered, indent))
}

func (w *execTimelineWriter) emitProseTurn(depth int, agent, text string) {
	body := executionDisplayProseFull(text)
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
		w.emitToolCall(depth, node.ToolName, node.ToolArgs, node.Observation, node.HasRawDetail)
	}
	if node.IsFinish {
		if observation := executionFinishPreview(node); observation != "" {
			w.emitTurnText(depth, observation)
		}
	}
}

func (w *execTimelineWriter) emitToolCall(depth int, toolName string, args, observation any, hasRawDetail bool) {
	callW := w.width - lipgloss.Width(execTurnIndent(depth)) - 3
	if callW < 24 {
		callW = 24
	}
	call := w.t.executionToolCallLine(toolName, args, callW)
	w.push(execTurnIndent(depth) + w.turnMarker() + "  " + call)
	if preview := w.t.executionObservationPreview(toolName, observation); preview != "" {
		// Wrap to the pane width: an overlong observation line would otherwise
		// soft-wrap inside the lipgloss pane and push everything below it off
		// the fixed-height viewport (true-bottom parity with the flat render).
		bodyIndent := execBodyIndent(depth)
		wrapW := w.width - lipgloss.Width(bodyIndent) - 2 // "⎿ " result glyph
		if wrapW < 12 {
			wrapW = 12
		}
		preview = textutil.Wrap(preview, wrapW)
		w.push(indentText(w.t.executionObservationBlock(preview), bodyIndent))
	}
	if hasRawDetail {
		// Flat-render parity: a result with a raw payload beyond the preview
		// keeps its clickable `detail: raw · Ctrl+E expand` affordance line.
		w.push(indentText(w.t.renderToolDetailHint("raw"), execBodyIndent(depth)))
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
	w.push(strings.Join(lines, "\n"))
}
