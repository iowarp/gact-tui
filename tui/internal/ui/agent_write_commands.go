package ui

// agent_write_commands.go defines the create/clone/extract/delete agent backend commands and agent-ID/title helpers.

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func createBasicAgentCmd(c *client.Client, agentID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		agent, err := c.CreateAgent(ctx, gact.AgentDef{
			ID:          agentID,
			Source:      "user",
			Title:       titleFromAgentID(agentID),
			Description: "Created from the GACT TUI.",
			Enabled:     true,
			Metadata: map[string]any{
				"created_by": "gact-tui",
			},
		})
		return agentWriteDoneMsg{mode: agentWriteModeCreate, agent: agent, err: err}
	}
}

func cloneAgentCmd(c *client.Client, scope client.RuntimeScope, sourceID, targetID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		source, err := c.GetAgentScoped(ctx, sourceID, scope)
		if err != nil {
			return agentWriteDoneMsg{mode: agentWriteModeClone, err: err}
		}
		source.ID = targetID
		source.Source = "user"
		source.Title = firstNonEmpty(source.Title, titleFromAgentID(sourceID)) + " copy"
		source.Metadata = cloneMetadata(source.Metadata)
		source.Metadata["cloned_from_agent_id"] = sourceID
		source.Metadata["created_by"] = "gact-tui"
		agent, err := c.CreateAgent(ctx, source)
		return agentWriteDoneMsg{mode: agentWriteModeClone, agent: agent, err: err}
	}
}

func extractAgentCmd(c *client.Client, sessionID, agentID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		agent, err := c.ExtractAgent(ctx, gact.AgentExtractRequest{
			SessionIDs: []string{sessionID},
			AgentID:    agentID,
		})
		return agentWriteDoneMsg{mode: agentWriteModeExtract, agent: agent, err: err}
	}
}

func deleteAgentCmd(c *client.Client, agentID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return agentDeletedMsg{agentID: agentID, err: c.DeleteAgent(ctx, agentID)}
	}
}

func sanitizeAgentID(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.ReplaceAll(value, " ", "-")
	var b strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_' || r == '.':
			b.WriteRune(r)
		}
	}
	return strings.Trim(b.String(), "-_.")
}

func titleFromAgentID(agentID string) string {
	words := strings.Fields(strings.NewReplacer("-", " ", "_", " ", ".", " ").Replace(agentID))
	for i, word := range words {
		if word == "" {
			continue
		}
		words[i] = strings.ToUpper(word[:1]) + word[1:]
	}
	if len(words) == 0 {
		return agentID
	}
	return strings.Join(words, " ")
}

func cloneMetadata(in map[string]any) map[string]any {
	out := make(map[string]any, len(in)+2)
	for k, v := range in {
		out[k] = v
	}
	return out
}

func agentWriteHint(mode string, agent gact.AgentDef) string {
	action := mode
	if action == "" {
		action = "saved"
	}
	return fmt.Sprintf("%s expert %s", action, firstNonEmpty(agent.ID, "unknown"))
}
