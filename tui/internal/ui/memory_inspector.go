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
		var toolEvidence *memoryToolEvidence
		if scope.SessionID != "" {
			toolEvidence = loadMemoryToolEvidence(ctx, c, scope, sessionMessages, frames)
		}
		return catalogDetailLoadedMsg{
			title:      "Memory · context",
			text:       formatMemoryInspectorWithTools(stats, sessionMessages, search, frames, toolEvidence),
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

type memoryToolEvidence struct {
	search  *gact.MemoryToolSearchSessionsResponse
	summary *gact.MemoryToolReadSessionSummaryResponse
	frame   *gact.MemoryToolReadContextFrameResponse
	errors  []string
}

func loadMemoryToolEvidence(ctx context.Context, c *client.Client, scope client.RuntimeScope, messages []gact.Message, frames []map[string]any) *memoryToolEvidence {
	out := &memoryToolEvidence{}
	caller := gact.MemoryToolCaller{"type": "tui", "surface": "memory_inspector"}
	if query := memoryInspectorSearchQuery(messages); query != "" {
		if resp, err := c.MemoryToolSearchSessions(ctx, scope.SessionID, gact.MemoryToolSearchSessionsRequest{
			Query:  query,
			Scope:  "session",
			Limit:  5,
			Caller: caller,
		}); err != nil {
			out.errors = append(out.errors, "search-sessions: "+err.Error())
		} else {
			out.search = &resp
		}
	}
	if resp, err := c.MemoryToolReadSessionSummary(ctx, scope.SessionID, gact.MemoryToolReadSessionSummaryRequest{
		Scope:  "session",
		Caller: caller,
	}); err != nil {
		out.errors = append(out.errors, "read-session-summary: "+err.Error())
	} else {
		out.summary = &resp
	}
	if len(frames) > 0 {
		frameID := stringValue(frames[len(frames)-1]["id"])
		if frameID != "" {
			if resp, err := c.MemoryToolReadContextFrame(ctx, scope.SessionID, gact.MemoryToolReadContextFrameRequest{
				FrameID: frameID,
				Scope:   "session",
				Caller:  caller,
			}); err != nil {
				out.errors = append(out.errors, "read-context-frame: "+err.Error())
			} else {
				out.frame = &resp
			}
		}
	}
	if out.search == nil && out.summary == nil && out.frame == nil && len(out.errors) == 0 {
		return nil
	}
	return out
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
	return formatMemoryInspectorWithTools(stats, messages, search, frames, nil)
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

func metadataString(metadata map[string]any, key string) string {
	if len(metadata) == 0 {
		return ""
	}
	return stringValue(metadata[key])
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
		detailField{"frame id", stringValue(latest["id"])},
		detailField{"status", stringValue(latest["status"])},
		detailField{"turn", firstNonEmpty(stringValue(latest["turn_id"]), stringValue(latest["user_message_id"]))},
		detailField{"assistant message", stringValue(latest["assistant_message_id"])},
		detailField{"estimated tokens", scalarText(latest["tokens_estimated"])},
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
	displayItems := contextFrameDisplayItems(items)
	for i, item := range displayItems {
		if i >= 6 {
			rows = append(rows, detailFieldRows("more items", fmt.Sprintf("%d hidden", len(displayItems)-i))...)
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
		rows = append(rows, detailFieldRows("frame metadata", contextMapSummary(metadata, "retained_context_source", "token_estimate", "context_file_injected_chars"))...)
		if detailErr := stringValue(metadata["detail_error"]); detailErr != "" {
			rows = append(rows, detailFieldRows("detail error", detailErr)...)
		}
	}
	return rows
}

func contextFrameDisplayItems(items []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	appendMatching := func(match func(map[string]any) bool) {
		for _, item := range items {
			if match(item) {
				out = append(out, item)
			}
		}
	}
	appendMatching(func(item map[string]any) bool {
		included, ok := item["included"].(bool)
		return ok && !included
	})
	appendMatching(func(item map[string]any) bool {
		included, ok := item["included"].(bool)
		return stringValue(item["kind"]) == "context_file" && (!ok || included)
	})
	appendMatching(func(item map[string]any) bool {
		included, ok := item["included"].(bool)
		return !((ok && !included) || stringValue(item["kind"]) == "context_file")
	})
	return out
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
			if key == "source" || key == "retained_context_source" {
				value = memorySourceText(value)
			}
			parts = append(parts, memoryContextLabel(key)+": "+value)
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, "\n")
	}
	return ""
}

func memoryContextLabel(key string) string {
	switch key {
	case "id":
		return "id"
	case "provider_id":
		return "provider"
	case "model_id":
		return "model"
	default:
		return strings.ReplaceAll(key, "_", " ")
	}
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
		return "not reported for this session"
	}
	for _, key := range []string{"compaction_state", "compaction", "compact_state", "context_compaction"} {
		if value, ok := metadata[key]; ok && value != nil {
			text := strings.TrimSpace(fmt.Sprint(value))
			if text != "" {
				return text
			}
		}
	}
	return "not reported for this session"
}
