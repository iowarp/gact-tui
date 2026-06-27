package ui

// execution_parts_projection.go projects the canonical execution timeline from
// the ordered message.part.* atoms — the single persisted transcript — rather
// than the SSE-only semantic.event ledger. Because the same parts come back from
// both the live stream and a GET /messages reload, this makes the live and
// reloaded renders identical by construction (the consistency the wire contract
// promises). The web renders from the same parts; this brings the TUI onto that
// shared foundation.

import (
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// projectExecutionTimelineFromMessages groups assistant parts by turn and emits
// the per-turn executionTimelineNode lists the canonical renderer consumes.
func projectExecutionTimelineFromMessages(messages []gact.Message) []executionProjectedTurn {
	type turnAcc struct {
		parts []gact.Part
	}
	accs := map[string]*turnAcc{}
	var order []string
	for _, m := range messages {
		if m.Role != gact.RoleAssistant || isSemanticLiveMessage(m) {
			continue
		}
		tid := firstNonEmpty(m.TurnID, m.ID)
		acc := accs[tid]
		if acc == nil {
			acc = &turnAcc{}
			accs[tid] = acc
			order = append(order, tid)
		}
		acc.parts = append(acc.parts, m.Parts...)
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

// messagesHaveExecutionTrajectory reports whether the transcript contains a
// sub-agent delegation — the case the canonical hierarchical execution timeline
// exists to render. Plain turns (a direct answer, or a single-agent tool call
// with no delegation) return false and keep the existing flat transcript render,
// preserving their role header.
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

func projectPartsToTimelineNodes(parts []gact.Part) []executionTimelineNode {
	sorted := append([]gact.Part(nil), parts...)
	sort.SliceStable(sorted, func(i, j int) bool {
		si, sj := sorted[i].Sequence, sorted[j].Sequence
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

	for _, p := range sorted {
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
			})

		case gact.PartTypeThinking:
			text := strings.TrimSpace(p.Thinking)
			if text == "" {
				continue
			}
			agent := resolveExpert(p.AgentID)
			nodes = append(nodes, executionTimelineNode{
				Kind:     executionNodeReactStep,
				Agent:    agent,
				Depth:    depthOf(agent),
				Thinking: text,
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
					continue
				}
			}
			nodes = append(nodes, executionTimelineNode{
				Kind:        executionNodeToolRun,
				Agent:       current,
				Depth:       depthOf(current),
				ToolName:    p.ToolName,
				Observation: obs,
				CallID:      p.CallID,
				Status:      "completed",
			})
		}
	}
	return nodes
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
