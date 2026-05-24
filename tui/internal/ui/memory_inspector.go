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

func loadMemoryInspectorCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		stats, err := c.MemoryStats(ctx, sessionID)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Memory", err: err}
		}
		return catalogDetailLoadedMsg{
			title: "Memory · ARC context",
			text:  formatMemoryInspector(stats),
		}
	}
}

func formatMemoryInspector(stats gact.MemoryStats) string {
	rows := []string{
		"ARC cache",
		fmt.Sprintf("hits: %d", stats.Cache.Hits),
		fmt.Sprintf("misses: %d", stats.Cache.Misses),
		fmt.Sprintf("hit_rate: %.1f%%", stats.Cache.HitRate*100),
		fmt.Sprintf("capacity: %d", stats.Cache.Capacity),
		"",
		"Global memory",
		fmt.Sprintf("conversations_total: %d", stats.Global.ConversationsTotal),
		fmt.Sprintf("invocations_total: %d", stats.Global.InvocationsTotal),
	}
	if stats.Session != nil {
		rows = append(rows,
			"",
			"Current session context",
			"session_id: "+stats.Session.SessionID,
			fmt.Sprintf("messages_retained: %d", stats.Session.MessagesRetained),
			fmt.Sprintf("tokens_retained: %d", stats.Session.TokensRetained),
			"tokens_budget: "+memoryBudgetText(stats.Session.TokensBudget),
			fmt.Sprintf("profiles_attached: %d", stats.Session.ProfilesAttached),
		)
	}
	if len(stats.Metadata) > 0 {
		rows = appendJSONMapSection(rows, "metadata", stats.Metadata)
	}
	return strings.Join(rows, "\n")
}

func memoryBudgetText(v *int) string {
	if v == nil {
		return "unbounded"
	}
	return fmt.Sprintf("%d", *v)
}
