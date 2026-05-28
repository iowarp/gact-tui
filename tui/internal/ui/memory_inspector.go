package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func loadMemoryInspectorCmd(c *client.Client, sessionID string, messages []gact.Message) tea.Cmd {
	sessionMessages := append([]gact.Message(nil), messages...)
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		stats, err := c.MemoryStats(ctx, sessionID)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Memory", err: err, standalone: true}
		}
		var search *gact.MemorySearchResponse
		if query := memoryInspectorSearchQuery(sessionMessages); query != "" && sessionID != "" {
			if resp, searchErr := c.MemorySearch(ctx, client.MemorySearchRequest{
				Query: query, SessionID: sessionID, Limit: 5,
			}); searchErr == nil {
				search = &resp
			}
		}
		return catalogDetailLoadedMsg{
			title:      "Memory · ARC context",
			text:       formatMemoryInspectorWithSearch(stats, sessionMessages, search),
			standalone: true,
		}
	}
}

func formatMemoryInspector(stats gact.MemoryStats) string {
	return formatMemoryInspectorWithMessages(stats, nil)
}

func formatMemoryInspectorWithMessages(stats gact.MemoryStats, messages []gact.Message) string {
	return formatMemoryInspectorWithSearch(stats, messages, nil)
}

func formatMemoryInspectorWithSearch(stats gact.MemoryStats, messages []gact.Message, search *gact.MemorySearchResponse) string {
	totalLookups := stats.Cache.Hits + stats.Cache.Misses
	rows := appendDetailSection(nil, "ARC cache",
		detailField{"role", "recent-context retrieval cache"},
		detailField{"hits", fmt.Sprintf("%d", stats.Cache.Hits)},
		detailField{"misses", fmt.Sprintf("%d", stats.Cache.Misses)},
		detailField{"hit_rate", fmt.Sprintf("%.1f%%", stats.Cache.HitRate*100)},
		detailField{"capacity", fmt.Sprintf("%d", stats.Cache.Capacity)},
		detailField{"lookups", fmt.Sprintf("%d", totalLookups)},
	)
	rows = appendDetailSection(rows, "Global memory",
		detailField{"conversations_total", fmt.Sprintf("%d", stats.Global.ConversationsTotal)},
		detailField{"invocations_total", fmt.Sprintf("%d", stats.Global.InvocationsTotal)},
	)
	if stats.Session != nil {
		usage := memoryUsageText(stats.Session.TokensRetained, stats.Session.TokensBudget)
		rows = appendDetailSection(rows, "Current session context",
			detailField{"session_id", stats.Session.SessionID},
			detailField{"messages_retained", fmt.Sprintf("%d", stats.Session.MessagesRetained)},
			detailField{"tokens_retained", fmt.Sprintf("%d", stats.Session.TokensRetained)},
			detailField{"tokens_budget", memoryBudgetText(stats.Session.TokensBudget)},
			detailField{"context_usage", usage},
			detailField{"remaining_budget", memoryRemainingText(stats.Session.TokensRetained, stats.Session.TokensBudget)},
			detailField{"pressure", memoryPressureText(stats.Session.TokensRetained, stats.Session.TokensBudget)},
			detailField{"profiles_attached", fmt.Sprintf("%d", stats.Session.ProfilesAttached)},
		)
	}
	if evidence := transcriptMemoryEvidence(messages); evidence.messages > 0 {
		rows = appendDetailSection(rows, "Transcript evidence",
			detailField{"messages_loaded", fmt.Sprintf("%d", evidence.messages)},
			detailField{"addressable_detail_parts", fmt.Sprintf("%d", evidence.addressableParts)},
			detailField{"tool_calls", fmt.Sprintf("%d", evidence.toolCalls)},
			detailField{"tool_results", fmt.Sprintf("%d", evidence.toolResults)},
			detailField{"tool_errors", fmt.Sprintf("%d", evidence.toolErrors)},
			detailField{"compaction_markers", fmt.Sprintf("%d", evidence.compactions)},
		)
	}
	if search != nil {
		rows = appendDetailSection(rows, "Memory search",
			detailField{"query", search.Query},
			detailField{"scope", memorySearchScopeText(*search)},
			detailField{"searched_sessions", strings.Join(search.SearchedSessions, ", ")},
			detailField{"hits", fmt.Sprintf("%d", len(search.Hits))},
		)
		for i, hit := range search.Hits {
			if i >= 5 {
				break
			}
			label := firstNonEmpty(hit.SessionTitle, hit.SessionID)
			if len(hit.MatchTerms) > 0 {
				label += " · terms: " + strings.Join(hit.MatchTerms, ", ")
			}
			rows = append(rows, detailFieldRows(label, hit.Text)...)
		}
	}
	rows = appendDetailSection(rows, "Compaction",
		detailField{"state", memoryCompactionText(stats.Metadata)},
	)
	if evidence := compactionEvidenceFromMessages(messages); evidence.count > 0 {
		rows = append(rows, detailFieldRows("summary_retained", "yes")...)
		rows = append(rows, detailFieldRows("summary_parts", fmt.Sprintf("%d", evidence.count))...)
		rows = append(rows, detailFieldRows("summary_lines", fmt.Sprintf("%d", evidence.lines))...)
		rows = append(rows, detailFieldRows("detail", "compact summary is retained in the transcript")...)
		rows = append(rows, detailFieldRows("open", "focus conversation; press Ctrl+E on the compaction marker")...)
	}
	if len(stats.Metadata) > 0 {
		rows = appendJSONMapSection(rows, "metadata", stats.Metadata)
	}
	return strings.Join(rows, "\n")
}

func memoryInspectorSearchQuery(messages []gact.Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		msg := messages[i]
		if msg.Role != gact.RoleUser && msg.Role != gact.RoleAssistant {
			continue
		}
		for _, part := range msg.Parts {
			text := strings.TrimSpace(part.Text)
			if text == "" {
				text = strings.TrimSpace(part.Summary)
			}
			terms := memorySearchQueryTerms(text)
			if len(terms) >= 2 {
				return strings.Join(terms[:min(3, len(terms))], " ")
			}
		}
	}
	return ""
}

func memorySearchQueryTerms(text string) []string {
	stop := map[string]bool{
		"about": true, "after": true, "again": true, "answer": true, "because": true,
		"before": true, "could": true, "from": true, "have": true, "into": true,
		"should": true, "that": true, "their": true, "there": true, "this": true,
		"with": true, "would": true,
	}
	fields := strings.Fields(strings.ToLower(text))
	out := make([]string, 0, 4)
	seen := map[string]bool{}
	for _, field := range fields {
		field = strings.Trim(field, ".,:;!?()[]{}\"'")
		if len(field) < 4 || stop[field] || seen[field] {
			continue
		}
		seen[field] = true
		out = append(out, field)
		if len(out) >= 4 {
			break
		}
	}
	return out
}

func memorySearchScopeText(resp gact.MemorySearchResponse) string {
	if resp.IncludeCrossSession {
		return "cross-session opt-in"
	}
	return "current session"
}

type compactionEvidence struct {
	count int
	lines int
}

type transcriptEvidenceSummary struct {
	messages         int
	addressableParts int
	toolCalls        int
	toolResults      int
	toolErrors       int
	compactions      int
}

func transcriptMemoryEvidenceFromPart(part gact.Part, out *transcriptEvidenceSummary) {
	switch part.Type {
	case gact.PartTypeToolCall:
		out.toolCalls++
	case gact.PartTypeToolResult:
		out.toolResults++
		if part.IsError {
			out.toolErrors++
		}
	case gact.PartTypeCompaction:
		out.compactions++
	default:
		if text := strings.TrimSpace(part.Text); isCompactSummaryPart(part, text) {
			out.compactions++
		}
	}
	for _, child := range part.Content {
		transcriptMemoryEvidenceFromPart(child, out)
	}
}

func transcriptMemoryEvidence(messages []gact.Message) transcriptEvidenceSummary {
	var out transcriptEvidenceSummary
	for _, msg := range messages {
		out.messages++
		out.addressableParts += len(addressablePartsOf(msg))
		for _, part := range msg.Parts {
			transcriptMemoryEvidenceFromPart(part, &out)
		}
	}
	return out
}

func compactionEvidenceFromMessages(messages []gact.Message) compactionEvidence {
	var out compactionEvidence
	for _, msg := range messages {
		if msg.Role != gact.RoleAssistant {
			continue
		}
		for _, part := range msg.Parts {
			summary := strings.TrimSpace(part.Summary)
			if part.Type != gact.PartTypeCompaction {
				text := strings.TrimSpace(part.Text)
				if !isCompactSummaryPart(part, text) {
					continue
				}
				summary = compactSummaryText(text)
			}
			out.count++
			out.lines += lineCount(summary)
		}
	}
	return out
}

func memoryBudgetText(v *int) string {
	if v == nil {
		return "unbounded"
	}
	return fmt.Sprintf("%d", *v)
}

func memoryUsageText(tokens int, budget *int) string {
	if budget == nil || *budget <= 0 {
		return fmt.Sprintf("%d tokens retained / unbounded", tokens)
	}
	pct := float64(tokens) / float64(*budget) * 100
	return fmt.Sprintf("%d / %d tokens (%.1f%%)", tokens, *budget, pct)
}

func memoryRemainingText(tokens int, budget *int) string {
	if budget == nil {
		return "unbounded"
	}
	remaining := *budget - tokens
	if remaining < 0 {
		return fmt.Sprintf("0 tokens (%d over budget)", -remaining)
	}
	return fmt.Sprintf("%d tokens", remaining)
}

func memoryPressureText(tokens int, budget *int) string {
	if budget == nil || *budget <= 0 {
		return "unbounded"
	}
	ratio := float64(tokens) / float64(*budget)
	switch {
	case ratio >= 1:
		return fmt.Sprintf("over budget (%.1f%%)", ratio*100)
	case ratio >= 0.85:
		return fmt.Sprintf("high (%.1f%%)", ratio*100)
	case ratio >= 0.60:
		return fmt.Sprintf("moderate (%.1f%%)", ratio*100)
	default:
		return fmt.Sprintf("low (%.1f%%)", ratio*100)
	}
}

func memoryCompactionText(metadata map[string]any) string {
	if len(metadata) == 0 {
		return "not reported by backend"
	}
	for _, key := range []string{"compaction_state", "compaction", "compact_state", "context_compaction"} {
		if value, ok := metadata[key]; ok && value != nil {
			text := strings.TrimSpace(fmt.Sprint(value))
			if text != "" {
				return text
			}
		}
	}
	return "not reported by backend"
}
