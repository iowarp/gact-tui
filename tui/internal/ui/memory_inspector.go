package ui

// memory_inspector.go formats the memory-inspector view from stats, messages, search, context, and tools.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func formatMemoryInspector(stats gact.MemoryStats) string {
	return formatMemoryInspectorWithMessages(stats, nil)
}

func formatMemoryInspectorWithMessages(stats gact.MemoryStats, messages []gact.Message) string {
	return formatMemoryInspectorWithSearch(stats, messages, nil)
}

func formatMemoryInspectorWithSearch(stats gact.MemoryStats, messages []gact.Message, search *gact.MemorySearchResponse) string {
	return formatMemoryInspectorWithContext(stats, messages, search, nil)
}

func formatMemoryInspectorWithContext(stats gact.MemoryStats, messages []gact.Message, search *gact.MemorySearchResponse, frames []map[string]any) string {
	return formatMemoryInspectorWithTools(stats, messages, search, frames, nil)
}

// formatMemoryInspectorFull is the production entry point: it renders the full
// inspector text and, when a per-expert ContextState is available, prepends the
// Claude /context-style segmented bar + legend (SPEC §6.9) so the memory modal
// shows the same usage visual as the dedicated Context view. theme supplies the
// stable category colours; contextState==nil falls back to the plain text.
func formatMemoryInspectorFull(theme Theme, stats gact.MemoryStats, messages []gact.Message, search *gact.MemorySearchResponse, frames []map[string]any, toolEvidence *memoryToolEvidence, contextState *client.ContextState) string {
	body := formatMemoryInspectorWithTools(stats, messages, search, frames, toolEvidence)
	if contextState == nil {
		return body
	}
	bar := memoryInspectorContextBar(theme, *contextState)
	if bar == "" {
		return body
	}
	return bar + "\n\n" + body
}

// memoryInspectorContextBar renders the segmented bar + header + legend block
// the memory inspector prepends. Returns "" when there's nothing to attribute.
func memoryInspectorContextBar(theme Theme, cs client.ContextState) string {
	segs := orderedContextCategories(cs.Categories)
	if len(segs) == 0 {
		return ""
	}
	total := contextCategoryTotal(cs.Categories)
	barW := 48
	denom := contextBarDenominator(cs, total)
	rows := []string{
		"Context usage (" + valuefmt.FirstNonEmpty(cs.Scope, "session") + ")",
		"  " + contextHeaderText(cs),
		"  " + renderContextBar(theme, barW, segs, denom, cs.AutocompactPct),
	}
	if cs.AutocompactPct != nil {
		rows = append(rows, "  "+autocompactMarkerLegend(*cs.AutocompactPct))
	}
	for _, row := range renderContextLegend(theme, segs, total) {
		rows = append(rows, "  "+row)
	}
	return strings.Join(rows, "\n")
}

func formatMemoryInspectorWithTools(stats gact.MemoryStats, messages []gact.Message, search *gact.MemorySearchResponse, frames []map[string]any, toolEvidence *memoryToolEvidence) string {
	totalLookups := stats.Cache.Hits + stats.Cache.Misses
	hitRate := fmt.Sprintf("%.1f%%", stats.Cache.HitRate*100)
	note := "recall cache telemetry only"
	if len(messages) == 0 && (stats.Session == nil || stats.Session.MessagesRetained == 0) {
		hitRate = "not session-specific yet"
		note = "no loaded transcript activity yet"
	} else if totalLookups == 0 {
		hitRate = "no lookups yet"
	}
	evidence := transcriptMemoryEvidence(messages)
	rows := appendMemoryOperatorSummary(nil, stats, evidence, totalLookups, hitRate, note, search, frames, toolEvidence)
	rows = appendDetailSection(rows, "Context state",
		detailField{"scope", memoryContextStateScope(stats, evidence, frames)},
		detailField{"cache hit rate", hitRate},
		detailField{"loaded messages", fmt.Sprintf("%d", evidence.messages)},
		detailField{"addressable details", fmt.Sprintf("%d", evidence.addressableParts)},
		detailField{"tool evidence", fmt.Sprintf("%d calls · %d results · %d errors", evidence.toolCalls, evidence.toolResults, evidence.toolErrors)},
		detailField{"compaction", memoryCompactionText(stats.Metadata)},
	)
	if stats.Session != nil {
		rows = append(rows, detailFieldRows("pressure", memoryPressureText(stats.Session.TokensRetained, stats.Session.TokensBudget))...)
		rows = append(rows, detailFieldRows("remaining budget", memoryRemainingText(stats.Session.TokensRetained, stats.Session.TokensBudget))...)
	}
	rows = appendDetailSection(rows, "Context cache",
		detailField{"purpose", "recent-context recall"},
		detailField{"scope", note},
		detailField{"hits", fmt.Sprintf("%d", stats.Cache.Hits)},
		detailField{"misses", fmt.Sprintf("%d", stats.Cache.Misses)},
		detailField{"hit rate", hitRate},
		detailField{"capacity", fmt.Sprintf("%d", stats.Cache.Capacity)},
		detailField{"lookups", fmt.Sprintf("%d", totalLookups)},
	)
	rows = appendDetailSection(rows, "Global memory",
		detailField{"conversations", fmt.Sprintf("%d", stats.Global.ConversationsTotal)},
		detailField{"invocations", fmt.Sprintf("%d", stats.Global.InvocationsTotal)},
	)
	if stats.Session != nil {
		usage := memoryUsageText(stats.Session.TokensRetained, stats.Session.TokensBudget)
		rows = appendDetailSection(rows, "Current session context",
			detailField{"session", stats.Session.SessionID},
			detailField{"messages retained", fmt.Sprintf("%d", stats.Session.MessagesRetained)},
			detailField{"tokens retained", fmt.Sprintf("%d", stats.Session.TokensRetained)},
			detailField{"token budget", memoryBudgetText(stats.Session.TokensBudget)},
			detailField{"context usage", usage},
			detailField{"remaining budget", memoryRemainingText(stats.Session.TokensRetained, stats.Session.TokensBudget)},
			detailField{"pressure", memoryPressureText(stats.Session.TokensRetained, stats.Session.TokensBudget)},
			detailField{"profiles attached", fmt.Sprintf("%d", stats.Session.ProfilesAttached)},
		)
	}
	if evidence.messages > 0 {
		rows = appendDetailSection(rows, "Transcript evidence",
			detailField{"messages loaded", fmt.Sprintf("%d", evidence.messages)},
			detailField{"addressable detail parts", fmt.Sprintf("%d", evidence.addressableParts)},
			detailField{"tool calls", fmt.Sprintf("%d", evidence.toolCalls)},
			detailField{"tool results", fmt.Sprintf("%d", evidence.toolResults)},
			detailField{"tool errors", fmt.Sprintf("%d", evidence.toolErrors)},
			detailField{"compaction markers", fmt.Sprintf("%d", evidence.compactions)},
		)
	}
	if search != nil {
		rows = appendDetailSection(rows, "Memory search",
			detailField{"query", search.Query},
			detailField{"scope", memorySearchScopeText(*search)},
			detailField{"searched sessions", strings.Join(search.SearchedSessions, ", ")},
			detailField{"hits", fmt.Sprintf("%d", len(search.Hits))},
		)
		for i, hit := range search.Hits {
			if i >= 5 {
				break
			}
			label := valuefmt.FirstNonEmpty(hit.SessionTitle, hit.SessionID)
			if len(hit.MatchTerms) > 0 {
				label += " · terms: " + strings.Join(hit.MatchTerms, ", ")
			}
			rows = append(rows, detailFieldRows(label, hit.Text)...)
		}
	}
	if len(frames) > 0 {
		rows = appendContextFrameRows(rows, frames)
	}
	if toolEvidence != nil {
		rows = appendMemoryToolEvidenceRows(rows, toolEvidence)
	}
	rows = appendDetailSection(rows, "Compaction",
		detailField{"state", memoryCompactionText(stats.Metadata)},
	)
	if evidence := compactionEvidenceFromMessages(messages); evidence.count > 0 {
		rows = append(rows, detailFieldRows("summary retained", "yes")...)
		rows = append(rows, detailFieldRows("summary parts", fmt.Sprintf("%d", evidence.count))...)
		rows = append(rows, detailFieldRows("summary lines", fmt.Sprintf("%d", evidence.lines))...)
		rows = append(rows, detailFieldRows("detail", "compact summary is retained in the transcript")...)
		rows = append(rows, detailFieldRows("open", "focus conversation; press Ctrl+E on the compaction marker")...)
	}
	if len(stats.Metadata) > 0 {
		rows = appendJSONMapSection(rows, "metadata", stats.Metadata)
	}
	return strings.Join(rows, "\n")
}

func memoryContextStateScope(stats gact.MemoryStats, evidence transcriptEvidenceSummary, frames []map[string]any) string {
	switch {
	case len(frames) > 0:
		return "latest context frame"
	case stats.Session != nil:
		return "current session"
	case evidence.messages > 0:
		return "visible transcript"
	default:
		return "no session context yet"
	}
}

func metadataString(metadata map[string]any, key string) string {
	if len(metadata) == 0 {
		return ""
	}
	return valuefmt.StringValue(metadata[key])
}

func scalarText(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}

func memorySourceText(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "gact_visible_transcript_summary":
		return "visible transcript summary"
	case "gact_context_frame":
		return "captured context frame"
	case "visible_gact_transcript":
		return "visible transcript"
	case "":
		return ""
	default:
		return strings.ReplaceAll(source, "_", " ")
	}
}

func memorySearchScopeText(resp gact.MemorySearchResponse) string {
	if resp.IncludeCrossSession {
		return "cross-session opt-in"
	}
	return "current session"
}
