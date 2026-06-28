package ui

// memory_inspector_operator.go builds the operator-facing memory summary and retrieval/policy text.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func appendMemoryOperatorSummary(rows []string, stats gact.MemoryStats, evidence transcriptEvidenceSummary, totalLookups int, hitRate string, note string, search *gact.MemorySearchResponse, frames []map[string]any, toolEvidence *memoryToolEvidence) []string {
	sessionActivity := "no loaded transcript activity yet"
	if evidence.messages > 0 {
		sessionActivity = fmt.Sprintf("%d loaded messages · %d addressable detail parts", evidence.messages, evidence.addressableParts)
	}
	retrieval := "not exercised yet"
	if totalLookups > 0 {
		retrieval = fmt.Sprintf("%s hit rate · %d hits · %d misses", hitRate, stats.Cache.Hits, stats.Cache.Misses)
	} else if strings.TrimSpace(note) != "" {
		retrieval = note
	}
	pressure := "not session-specific yet"
	if stats.Session != nil {
		pressure = memoryPressureText(stats.Session.TokensRetained, stats.Session.TokensBudget)
	}
	transcriptToolEvidence := "none loaded"
	if evidence.toolCalls+evidence.toolResults+evidence.toolErrors > 0 {
		transcriptToolEvidence = fmt.Sprintf("%d calls · %d results · %d errors", evidence.toolCalls, evidence.toolResults, evidence.toolErrors)
	}
	return appendDetailSection(rows, "Operator summary",
		detailField{"current context", memoryCurrentContextText(stats, evidence, frames)},
		detailField{"retrieval status", memoryRetrievalStatusText(totalLookups, hitRate, search, note)},
		detailField{"agent memory access", memoryAgentMemoryAccessText(toolEvidence)},
		detailField{"operator action", memoryOperatorActionText(stats, evidence, frames, toolEvidence)},
		detailField{"session activity", sessionActivity},
		detailField{"retrieval cache", retrieval},
		detailField{"context pressure", pressure},
		detailField{"tool evidence", transcriptToolEvidence},
		detailField{"compaction", memoryCompactionText(stats.Metadata)},
	)
}

func memoryCurrentContextText(stats gact.MemoryStats, evidence transcriptEvidenceSummary, frames []map[string]any) string {
	if len(frames) > 0 {
		latest := frames[len(frames)-1]
		items := contextFrameItems(latest)
		messageItems, fileItems, excludedItems := 0, 0, 0
		for _, item := range items {
			switch stringValue(item["kind"]) {
			case "message":
				messageItems++
			case "context_file":
				fileItems++
			}
			if included, ok := item["included"].(bool); ok && !included {
				excludedItems++
			}
		}
		status := firstNonEmpty(stringValue(latest["status"]), "observed")
		return fmt.Sprintf("latest %s frame · %d messages · %d files · %d excluded", status, messageItems, fileItems, excludedItems)
	}
	if stats.Session != nil && stats.Session.MessagesRetained > 0 {
		return fmt.Sprintf("%d retained session messages · no context frame reported", stats.Session.MessagesRetained)
	}
	if evidence.messages > 0 {
		return fmt.Sprintf("%d visible transcript messages · no context frame reported", evidence.messages)
	}
	return "no session context loaded yet"
}

func memoryRetrievalStatusText(totalLookups int, hitRate string, search *gact.MemorySearchResponse, note string) string {
	if search != nil {
		return fmt.Sprintf("searched %s · %d hits · query %q", memorySearchScopeText(*search), len(search.Hits), search.Query)
	}
	if totalLookups > 0 {
		return fmt.Sprintf("ARC cache exercised · %s · %d lookups", hitRate, totalLookups)
	}
	if strings.TrimSpace(note) != "" {
		return note
	}
	return "not exercised yet"
}

func memoryAgentMemoryAccessText(evidence *memoryToolEvidence) string {
	if evidence == nil {
		return "not checked for this session"
	}
	parts := []string{}
	if evidence.search != nil {
		parts = append(parts, "search "+memoryPolicyDecisionText(metadataString(evidence.search.Metadata, "policy_decision")))
	}
	if evidence.summary != nil {
		parts = append(parts, "summary "+memoryPolicyDecisionText(metadataString(evidence.summary.Metadata, "policy_decision")))
	}
	if evidence.frame != nil {
		parts = append(parts, "frame "+memoryPolicyDecisionText(metadataString(evidence.frame.Metadata, "policy_decision")))
	}
	if len(evidence.errors) > 0 {
		parts = append(parts, fmt.Sprintf("%d errors", len(evidence.errors)))
	}
	if len(parts) == 0 {
		return "checked · no callable memory evidence returned"
	}
	return strings.Join(parts, " · ")
}

func memoryPolicyDecisionText(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "allow_same_session":
		return "session access allowed"
	case "allow_workspace":
		return "workspace access allowed"
	case "allow":
		return "access allowed"
	case "deny", "denied":
		return "access denied"
	case "ask", "pending":
		return "approval required"
	case "":
		return "observed"
	default:
		return strings.ReplaceAll(value, "_", " ")
	}
}

func memoryOperatorActionText(stats gact.MemoryStats, evidence transcriptEvidenceSummary, frames []map[string]any, toolEvidence *memoryToolEvidence) string {
	if toolEvidence != nil && len(toolEvidence.errors) > 0 {
		return "inspect memory tool errors below before relying on recall"
	}
	if stats.Session == nil && evidence.messages == 0 && len(frames) == 0 {
		return "start or attach a session to inspect retained context"
	}
	if stats.Session != nil && strings.HasPrefix(memoryPressureText(stats.Session.TokensRetained, stats.Session.TokensBudget), "over budget") {
		return "review compaction before continuing a long run"
	}
	if len(frames) == 0 {
		return "send a turn to capture the next context frame"
	}
	return "scroll for frame items, search hits, and agent memory access"
}

func appendMemoryToolEvidenceRows(rows []string, evidence *memoryToolEvidence) []string {
	fields := []detailField{}
	if evidence.search != nil {
		fields = append(fields,
			detailField{"search access", memoryPolicyDecisionText(metadataString(evidence.search.Metadata, "policy_decision"))},
			detailField{"search scope", metadataString(evidence.search.Metadata, "policy_scope")},
			detailField{"search hits", fmt.Sprintf("%d", len(evidence.search.Hits))},
			detailField{"search audit", metadataString(evidence.search.Metadata, "audit_id")},
		)
	}
	if evidence.summary != nil {
		fields = append(fields,
			detailField{"summary access", memoryPolicyDecisionText(metadataString(evidence.summary.Metadata, "policy_decision"))},
			detailField{"summary messages", scalarText(evidence.summary.Summary["message_count"])},
			detailField{"summary source", memorySourceText(metadataString(mapValue(evidence.summary.Summary["metadata"]), "source"))},
		)
	}
	if evidence.frame != nil {
		fields = append(fields,
			detailField{"frame access", memoryPolicyDecisionText(metadataString(evidence.frame.Metadata, "policy_decision"))},
			detailField{"frame id", stringValue(evidence.frame.Frame["id"])},
			detailField{"frame source", memorySourceText(metadataString(mapValue(evidence.frame.Frame["metadata"]), "source"))},
		)
	}
	if len(fields) > 0 {
		rows = appendDetailSection(rows, "Agent memory access proof", fields...)
	}
	if len(evidence.errors) > 0 {
		rows = appendDetailSection(rows, "Memory tool errors", detailField{"errors", strings.Join(evidence.errors, "\n")})
	}
	return rows
}
