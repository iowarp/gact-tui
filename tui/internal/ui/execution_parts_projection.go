package ui

// execution_parts_projection.go projects the canonical execution timeline from
// the ordered message.part.* atoms — the single persisted transcript — rather
// than the SSE-only semantic.event ledger. Because the same parts come back from
// both the live stream and a GET /messages reload, this makes the live and
// reloaded renders identical by construction (the consistency the wire contract
// promises). The web renders from the same parts; this brings the TUI onto that
// shared foundation.
//
// #233 phase 1: the projection is TOTAL (web precedent 09240c4c — "unify all
// transcript rendering through one path"). Every assistant/tool part of every
// turn projects — plain single-agent turns included — and each node carries its
// source part address so the projected render keeps part-level hit testing.

import (
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// sourcedPart is one transcript part plus its address in the conversation
// (message index + addressable-part index) so projected nodes stay clickable.
type sourcedPart struct {
	part    gact.Part
	msgIdx  int
	addrIdx int // index into addressablePartsOf(message); -1 = not addressable
}

// projectExecutionTimelineFromMessages groups assistant/tool parts by turn and
// emits the per-turn executionTimelineNode lists the canonical renderer
// consumes. An assistant message without its own turn ID attaches to the
// preceding user message's turn (arrival order), so plain prose is never
// dropped; tool-role messages contribute their tool_result parts to the same
// turn (they pair with the calls that requested them).
func projectExecutionTimelineFromMessages(messages []gact.Message) []executionProjectedTurn {
	type turnAcc struct {
		parts []sourcedPart
	}
	accs := map[string]*turnAcc{}
	var order []string
	currentTurnID := ""
	appendParts := func(tid string, msgIdx int, m gact.Message) {
		acc := accs[tid]
		if acc == nil {
			acc = &turnAcc{}
			accs[tid] = acc
			order = append(order, tid)
		}
		addrByPart := map[int]int{}
		for ai, pi := range addressablePartsOf(m) {
			addrByPart[pi] = ai
		}
		for pi, p := range m.Parts {
			addrIdx, ok := addrByPart[pi]
			if !ok {
				addrIdx = -1
			}
			acc.parts = append(acc.parts, sourcedPart{part: p, msgIdx: msgIdx, addrIdx: addrIdx})
		}
	}
	for msgIdx, m := range messages {
		switch m.Role {
		case gact.RoleUser:
			currentTurnID = firstNonEmpty(messageTurnID(m), m.ID)
		case gact.RoleAssistant, gact.RoleTool:
			if isSemanticLiveMessage(m) {
				continue
			}
			tid := firstNonEmpty(messageTurnID(m), currentTurnID, m.ID)
			appendParts(tid, msgIdx, m)
		}
	}
	var turns []executionProjectedTurn
	for _, tid := range order {
		nodes := projectPartsToTimelineNodes(accs[tid].parts)
		if len(nodes) == 0 {
			continue
		}
		turns = append(turns, executionProjectedTurn{TurnID: tid, Nodes: nodes})
	}
	return turns
}

// isProviderThinkingPart reports whether a thinking part carries provider-native
// reasoning (metadata.thinking_source == "provider", e.g. the Claude Code SDK)
// rather than a ReAct next_thought. Shared by the parts projection (which flags
// the node ProviderThinking), the part cursor (which makes the disclosure row
// addressable), and the Ctrl+E detail resolution.
func isProviderThinkingPart(p gact.Part) bool {
	return p.Type == gact.PartTypeThinking &&
		stringValue(p.Metadata["thinking_source"]) == "provider" &&
		strings.TrimSpace(p.Thinking) != ""
}

// messagesHaveExecutionTrajectory reports whether the transcript contains a
// sub-agent delegation. The transcript render no longer gates on it (#233 —
// the parts projection is total); it remains the render-dump/replay marker for
// "this session has a hierarchical execution timeline".
func messagesHaveExecutionTrajectory(messages []gact.Message) bool {
	for _, m := range messages {
		if m.Role != gact.RoleAssistant || isSemanticLiveMessage(m) {
			continue
		}
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeExpertHandoff {
				return true
			}
		}
	}
	return false
}

func projectPartsToTimelineNodes(parts []sourcedPart) []executionTimelineNode {
	sorted := append([]sourcedPart(nil), parts...)
	sort.SliceStable(sorted, func(i, j int) bool {
		si, sj := sorted[i].part.Sequence, sorted[j].part.Sequence
		if si == 0 || sj == 0 {
			return false // no sequence ⇒ keep arrival/array order
		}
		return si < sj
	})

	agentDepth := map[string]int{"main": 0, "": 0}
	depthOf := func(agent string) int {
		if d, ok := agentDepth[strings.TrimSpace(agent)]; ok {
			return d
		}
		return 0
	}
	// current is the expert that owns control right now (the deepest active
	// delegation child). Tool parts carry a finer-grained tool-owner agent_id
	// (e.g. "geo", "ndp") that is NOT a delegation target — those belong to the
	// current expert, not to a block of their own. A text/thinking part whose
	// agent_id IS a known expert (main or a handoff child) switches control.
	current := "main"
	resolveExpert := func(rawAgent string) string {
		rawAgent = strings.TrimSpace(rawAgent)
		if _, known := agentDepth[rawAgent]; known && rawAgent != "" {
			current = rawAgent
		}
		return current
	}

	var nodes []executionTimelineNode
	callIndex := map[string]int{}
	seenHandoff := map[string]bool{}

	for _, sp := range sorted {
		p := sp.part
		src := executionNodeSource{Valid: sp.addrIdx >= 0, MsgIdx: sp.msgIdx, AddrIdx: sp.addrIdx, PartID: p.ID}
		switch p.Type {
		case gact.PartTypeRoutingDecision:
			// Plumbing chip — suppressed from the transcript (web parity).
			continue

		case gact.PartTypeText:
			text := strings.TrimSpace(p.Text)
			if text == "" {
				continue
			}
			agent := resolveExpert(firstNonEmpty(p.AgentID, stringValue(p.Metadata["agent_id"])))
			nodes = append(nodes, executionTimelineNode{
				Kind:  executionNodeAssistantText,
				Agent: agent,
				Depth: depthOf(agent),
				Text:  text,
				Src:   src,
			})

		case gact.PartTypeThinking:
			text := strings.TrimSpace(p.Thinking)
			if text == "" {
				continue
			}
			agent := resolveExpert(p.AgentID)
			// Provider-native reasoning (Claude Code SDK et al.) carries
			// metadata.thinking_source == "provider". Web renders it ONLY as a
			// collapsed disclosure (transcriptDelegationModel.ts:582); the TUI
			// mirrors that by flagging the node so the renderer emits one muted
			// summary line instead of the full prose. Regular ReAct next_thought
			// (no such metadata) keeps rendering inline.
			nodes = append(nodes, executionTimelineNode{
				Kind:             executionNodeReactStep,
				Agent:            agent,
				Depth:            depthOf(agent),
				Thinking:         text,
				ProviderThinking: isProviderThinkingPart(p),
				Src:              src,
			})

		case gact.PartTypeExpertHandoff:
			parent := firstNonEmpty(stringValue(p.Metadata["parent_id"]), stringValue(p.Metadata["parent"]), strings.TrimSpace(p.AgentID), "main")
			child := firstNonEmpty(stringValue(p.Metadata["delegate_to"]), stringValue(p.Metadata["agent_id"]))
			if child == "" {
				continue
			}
			// "main" is the root orchestrator, never a delegation target; a
			// handoff whose child is main (or itself) is a control-return /
			// resume marker, not a real delegation. Drop the row and restore
			// control to that agent so the following parts attribute correctly.
			// (The /messages reload emits these where the live stream does not —
			// suppressing here keeps both representations rendering identically.)
			if child == "main" || child == parent {
				current = child
				continue
			}
			// Ground depth in the live delegation chain: the child sits one level
			// below wherever its parent already is. (metadata.depth is always 0 —
			// it's the parent's depth in its own frame — so it can't be trusted as
			// an absolute and is used only to seed a parent we've never seen.)
			pd, known := agentDepth[parent]
			if !known {
				pd = timelineIntValue(p.Metadata["depth"], 0)
				agentDepth[parent] = pd
			}
			agentDepth[child] = pd + 1
			current = child
			// A delegation streams twice (delegate.started + delegate.completed).
			// Emit one delegation row; the close is synthesized from the depth drop.
			key := handoffKey(parent, child)
			if seenHandoff[key] {
				continue
			}
			seenHandoff[key] = true
			question := strings.TrimSpace(stringValue(p.Metadata["question"]))
			nodes = append(nodes, executionTimelineNode{
				Kind:        executionNodeHandoff,
				Agent:       child,
				ParentAgent: parent,
				Depth:       pd + 1,
				Question:    question,
				Thinking:    firstNonEmpty(p.Thought, stringValue(p.Metadata["thought"])),
				Src:         src,
			})

		case gact.PartTypeToolCall:
			// Attribute the tool to the expert running it (current), not the
			// finer-grained tool-owner agent_id on the part.
			node := executionTimelineNode{
				Kind:     executionNodeReactStep,
				Agent:    current,
				Depth:    depthOf(current),
				Thinking: firstNonEmpty(p.Thought, stringValue(p.Metadata["thought"])),
				ToolName: p.ToolName,
				CallID:   p.CallID,
				Src:      src,
			}
			if len(p.Input) > 0 {
				node.ToolArgs = anyMap(p.Input)
			}
			nodes = append(nodes, node)
			if p.CallID != "" {
				callIndex[p.CallID] = len(nodes) - 1
			}

		case gact.PartTypeToolResult:
			obs := partToolResultObservation(p)
			if p.CallID != "" {
				if idx, ok := callIndex[p.CallID]; ok {
					nodes[idx].Observation = obs
					nodes[idx].HasRawDetail = nodes[idx].HasRawDetail || partHasRawDetail(p)
					continue
				}
			}
			nodes = append(nodes, executionTimelineNode{
				Kind:         executionNodeToolRun,
				Agent:        current,
				Depth:        depthOf(current),
				ToolName:     p.ToolName,
				Observation:  obs,
				CallID:       p.CallID,
				Status:       "completed",
				HasRawDetail: partHasRawDetail(p),
				Src:          src,
			})

		default:
			// Passthrough: parts the timeline grammar has no row for (file_diff,
			// image, error, document, …) render via their own part view so the
			// unified path never loses transcript content (web parity).
			pp := p
			nodes = append(nodes, executionTimelineNode{
				Kind:  executionNodePassthrough,
				Agent: current,
				Depth: depthOf(current),
				Src:   src,
				Part:  &pp,
			})
		}
	}
	return nodes
}

// partHasRawDetail reports whether a tool_result part carries a raw payload
// worth a detail affordance (flat-render parity: metadata.raw_result).
func partHasRawDetail(p gact.Part) bool {
	return p.Metadata != nil && p.Metadata["raw_result"] != nil
}

func partToolResultObservation(p gact.Part) any {
	if p.Metadata != nil {
		if r, ok := p.Metadata["result"]; ok && r != nil {
			if s, isStr := r.(string); !isStr || strings.TrimSpace(s) != "" {
				return r
			}
		}
	}
	for _, c := range p.Content {
		if c.Type == gact.PartTypeText && strings.TrimSpace(c.Text) != "" {
			return c.Text
		}
	}
	return nil
}

func anyMap(m map[string]any) any {
	if len(m) == 0 {
		return nil
	}
	return m
}
