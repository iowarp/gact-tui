package ui

// agent_hierarchy_runtime.go computes per-agent runtime state (idle/running/settled) from parts, semantic events, and provenance.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

type agentHierarchyRuntimeState string

const (
	agentHierarchyStateNone     agentHierarchyRuntimeState = ""
	agentHierarchyStateSession  agentHierarchyRuntimeState = "session"
	agentHierarchyStateObserved agentHierarchyRuntimeState = "observed"
	agentHierarchyStateActive   agentHierarchyRuntimeState = "active"
	agentHierarchyStateLive     agentHierarchyRuntimeState = "live"
)

func (c *agentComponent) agentHierarchyRuntimeState(agentID string) agentHierarchyRuntimeState {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return agentHierarchyStateNone
	}
	best := agentHierarchyStateNone
	settledRunKeys := map[string]bool{}
	if c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions) && c.app.session.sessions[c.app.session.selected].Agent.ID == agentID {
		best = strongerAgentHierarchyState(best, agentHierarchyStateSession)
	}
	for i := len(c.app.conversation.messages) - 1; i >= 0; i-- {
		msg := c.app.conversation.messages[i]
		if rp := mapValue(msg.Metadata["runtime_provenance"]); len(rp) > 0 {
			best = strongerAgentHierarchyState(best, agentStateFromRuntimeProvenance(agentID, rp))
			markAgentHierarchySettledRun(settledRunKeys, runtimeProvenanceRunKeys(rp))
		}
		for j := len(msg.Parts) - 1; j >= 0; j-- {
			part := msg.Parts[j]
			if part.Type == partTypeRuntimeProvenance {
				markAgentHierarchySettledRun(settledRunKeys, runtimeProvenanceRunKeys(mapValue(part.Metadata["runtime_provenance"])))
			}
			state := agentStateFromPart(agentID, part)
			if state == agentHierarchyStateLive && partRunIsSettled(part, settledRunKeys) {
				continue
			}
			best = strongerAgentHierarchyState(best, state)
			if best == agentHierarchyStateLive {
				return best
			}
		}
	}
	// The cleaned-up backend stream delivers the ReAct trajectory only as
	// structural semantic events (recorded into the execution timeline), not
	// as transcript parts. Fold in the latest recorded delegation/lifecycle
	// state per agent so the sidebar still surfaces which experts are live.
	best = strongerAgentHierarchyState(best, c.agentStateFromRecordedExecution(agentID, settledRunKeys))
	return best
}

// agentStateFromRecordedExecution returns the runtime state implied by the most
// recent recorded structural semantic event that references agentID. Latest
// event wins (a completed expert's last event downgrades it from live), and a
// live state whose run has already settled (per final runtime provenance) is
// demoted to observed.
func (c *agentComponent) agentStateFromRecordedExecution(agentID string, settled map[string]bool) agentHierarchyRuntimeState {
	sid := c.app.session.currentID()
	payloads := c.app.execution.recordedSemanticPayloads(sid)
	for i := len(payloads) - 1; i >= 0; i-- {
		pl := payloads[i]
		state := agentStateFromSemanticEvent(agentID, pl)
		if state == agentHierarchyStateNone {
			continue
		}
		if state == agentHierarchyStateLive {
			keys := runtimeRunKeys(stringValue(pl["trace_id"]), stringValue(pl["turn_id"]))
			for _, key := range keys {
				if settled[key] {
					state = agentHierarchyStateObserved
					break
				}
			}
		}
		return state
	}
	return agentHierarchyStateNone
}

func markAgentHierarchySettledRun(settled map[string]bool, keys []string) {
	for _, key := range keys {
		settled[key] = true
	}
}

func partRunIsSettled(part gact.Part, settled map[string]bool) bool {
	if len(settled) == 0 || len(part.Metadata) == 0 {
		return false
	}
	rawEvent := mapValue(part.Metadata["raw_event"])
	keys := runtimeRunKeys(
		firstNonEmpty(stringValue(part.Metadata["trace_id"]), stringValue(rawEvent["trace_id"])),
		firstNonEmpty(stringValue(part.Metadata["turn_id"]), stringValue(rawEvent["turn_id"])),
	)
	for _, key := range keys {
		if settled[key] {
			return true
		}
	}
	return false
}

func runtimeProvenanceRunKeys(rp map[string]any) []string {
	if len(rp) == 0 {
		return nil
	}
	turn := mapValue(rp["turn"])
	return runtimeRunKeys(
		firstNonEmpty(stringValue(turn["trace_id"]), stringValue(rp["trace_id"])),
		firstNonEmpty(stringValue(turn["turn_id"]), stringValue(rp["turn_id"])),
	)
}

func runtimeRunKeys(traceID, turnID string) []string {
	keys := []string{}
	if traceID = strings.TrimSpace(traceID); traceID != "" {
		keys = append(keys, "trace:"+traceID)
	}
	if turnID = strings.TrimSpace(turnID); turnID != "" {
		keys = append(keys, "turn:"+turnID)
	}
	return keys
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
	if eventType == "delegation.parent_resumed" || eventType == "delegation.completed" ||
		strings.HasSuffix(eventType, ".parent_resumed") || strings.HasSuffix(eventType, ".completed") {
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
