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
