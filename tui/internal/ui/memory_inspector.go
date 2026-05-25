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
			return catalogDetailLoadedMsg{title: "Memory", err: err}
		}
		return catalogDetailLoadedMsg{
			title: "Memory · ARC context",
			text:  formatMemoryInspectorWithMessages(stats, sessionMessages),
		}
	}
}

func formatMemoryInspector(stats gact.MemoryStats) string {
	return formatMemoryInspectorWithMessages(stats, nil)
}

func formatMemoryInspectorWithMessages(stats gact.MemoryStats, messages []gact.Message) string {
	totalLookups := stats.Cache.Hits + stats.Cache.Misses
	rows := []string{
		"ARC cache",
		"role: recent-context retrieval cache",
		fmt.Sprintf("hits: %d", stats.Cache.Hits),
		fmt.Sprintf("misses: %d", stats.Cache.Misses),
		fmt.Sprintf("hit_rate: %.1f%%", stats.Cache.HitRate*100),
		fmt.Sprintf("capacity: %d", stats.Cache.Capacity),
		fmt.Sprintf("lookups: %d", totalLookups),
		"",
		"Global memory",
		fmt.Sprintf("conversations_total: %d", stats.Global.ConversationsTotal),
		fmt.Sprintf("invocations_total: %d", stats.Global.InvocationsTotal),
	}
	if stats.Session != nil {
		usage := memoryUsageText(stats.Session.TokensRetained, stats.Session.TokensBudget)
		rows = append(rows,
			"",
			"Current session context",
			"session_id: "+stats.Session.SessionID,
			fmt.Sprintf("messages_retained: %d", stats.Session.MessagesRetained),
			fmt.Sprintf("tokens_retained: %d", stats.Session.TokensRetained),
			"tokens_budget: "+memoryBudgetText(stats.Session.TokensBudget),
			"context_usage: "+usage,
			"remaining_budget: "+memoryRemainingText(stats.Session.TokensRetained, stats.Session.TokensBudget),
			"pressure: "+memoryPressureText(stats.Session.TokensRetained, stats.Session.TokensBudget),
			fmt.Sprintf("profiles_attached: %d", stats.Session.ProfilesAttached),
		)
	}
	rows = append(rows,
		"",
		"Compaction",
		"state: "+memoryCompactionText(stats.Metadata),
	)
	if evidence := compactionEvidenceFromMessages(messages); evidence.count > 0 {
		rows = append(rows,
			"summary_retained: yes",
			fmt.Sprintf("summary_parts: %d", evidence.count),
			fmt.Sprintf("summary_lines: %d", evidence.lines),
			"detail: compact summary is retained in the transcript",
			"open: focus conversation; press Ctrl+E on the compaction marker",
		)
	}
	if len(stats.Metadata) > 0 {
		rows = appendJSONMapSection(rows, "metadata", stats.Metadata)
	}
	return strings.Join(rows, "\n")
}

type compactionEvidence struct {
	count int
	lines int
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
