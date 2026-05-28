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

func loadMemoryInspectorCmd(c *client.Client, scope client.RuntimeScope, messages []gact.Message) tea.Cmd {
	sessionMessages := append([]gact.Message(nil), messages...)
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		stats, err := c.MemoryStatsScoped(ctx, scope)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Memory", err: err, standalone: true}
		}
		var search *gact.MemorySearchResponse
		if query := memoryInspectorSearchQuery(sessionMessages); query != "" && scope.SessionID != "" {
			if resp, searchErr := c.MemorySearch(ctx, client.MemorySearchRequest{
				Query: query, SessionID: scope.SessionID, WorkspaceID: scope.WorkspaceID, Limit: 5,
			}); searchErr == nil {
				search = &resp
			}
		}
		var frames []map[string]any
		if scope.SessionID != "" {
			if resp, frameErr := c.ListContextFramesScoped(ctx, scope, 5); frameErr == nil {
				frames = resp.Frames
				if latestID := latestContextFrameID(frames); latestID != "" {
					if frame, detailErr := c.GetContextFrameScoped(ctx, scope, latestID); detailErr == nil && len(frame) > 0 {
						frames = append(frames[:len(frames)-1], frame)
					} else if detailErr != nil {
						frames = append(frames, map[string]any{
							"id":     latestID,
							"status": "detail_error",
							"metadata": map[string]any{
								"detail_error": detailErr.Error(),
							},
						})
					}
				}
			}
		}
		return catalogDetailLoadedMsg{
			title:      "Memory · ARC context",
			text:       formatMemoryInspectorWithContext(stats, sessionMessages, search, frames),
			standalone: true,
		}
	}
}

func latestContextFrameID(frames []map[string]any) string {
	if len(frames) == 0 {
		return ""
	}
	return stringValue(frames[len(frames)-1]["id"])
}

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
	if len(frames) > 0 {
		rows = appendContextFrameRows(rows, frames)
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

func appendContextFrameRows(rows []string, frames []map[string]any) []string {
	latest := frames[len(frames)-1]
	items := contextFrameItems(latest)
	messageItems, fileItems, errorItems := 0, 0, 0
	for _, item := range items {
		switch stringValue(item["kind"]) {
		case "message":
			messageItems++
		case "context_file":
			fileItems++
		}
		if included, ok := item["included"].(bool); ok && !included {
			errorItems++
		}
	}
	rows = appendDetailSection(rows, "Context frame",
		detailField{"frame_id", stringValue(latest["id"])},
		detailField{"status", stringValue(latest["status"])},
		detailField{"turn", firstNonEmpty(stringValue(latest["turn_id"]), stringValue(latest["user_message_id"]))},
		detailField{"assistant_message", stringValue(latest["assistant_message_id"])},
		detailField{"tokens_estimated", scalarText(latest["tokens_estimated"])},
		detailField{"items", fmt.Sprintf("%d messages · %d files · %d excluded", messageItems, fileItems, errorItems)},
	)
	if agent := mapValue(latest["agent"]); len(agent) > 0 {
		if summary := contextMapSummary(agent, "id", "mode", "routing_mode", "session_mode", "edit_mode"); summary != "" {
			rows = append(rows, detailFieldRows("agent", summary)...)
		}
	}
	if prompt := mapValue(latest["prompt"]); len(prompt) > 0 {
		if summary := contextMapSummary(prompt, "id", "profile", "source", "checksum"); summary != "" {
			rows = append(rows, detailFieldRows("prompt", summary)...)
		}
	}
	if model := mapValue(latest["model"]); len(model) > 0 {
		if summary := contextMapSummary(model, "provider_id", "model_id", "variant"); summary != "" {
			rows = append(rows, detailFieldRows("model", summary)...)
		}
	}
	for i, item := range items {
		if i >= 6 {
			rows = append(rows, detailFieldRows("more_items", fmt.Sprintf("%d hidden", len(items)-i))...)
			break
		}
		label := firstNonEmpty(stringValue(item["kind"]), "item")
		if source := firstNonEmpty(stringValue(item["display_path"]), stringValue(item["path"]), stringValue(item["source_id"])); source != "" {
			label += " · " + source
		}
		body := []string{
			"included: " + scalarText(item["included"]),
			"reason: " + stringValue(item["reason"]),
			"tokens: " + scalarText(item["tokens_estimated"]),
		}
		if role := stringValue(item["role"]); role != "" {
			body = append(body, "role: "+role)
		}
		rows = append(rows, detailFieldRows(label, strings.Join(body, "\n"))...)
	}
	if metadata := mapValue(latest["metadata"]); len(metadata) > 0 {
		rows = append(rows, detailFieldRows("frame_metadata", contextMapSummary(metadata, "retained_context_source", "token_estimate", "context_file_injected_chars"))...)
		if detailErr := stringValue(metadata["detail_error"]); detailErr != "" {
			rows = append(rows, detailFieldRows("detail_error", detailErr)...)
		}
	}
	return rows
}

func contextFrameItems(frame map[string]any) []map[string]any {
	raw, _ := frame["items"].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if row := mapValue(item); len(row) > 0 {
			out = append(out, row)
		}
	}
	return out
}

func mapValue(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return nil
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

func contextMapSummary(m map[string]any, keys ...string) string {
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		if value := scalarText(m[key]); strings.TrimSpace(value) != "" {
			parts = append(parts, key+": "+value)
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, "\n")
	}
	return ""
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
