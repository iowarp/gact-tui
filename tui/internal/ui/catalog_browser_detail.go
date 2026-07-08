package ui

// catalog_browser_detail.go opens catalog detail panes, loads tool detail, and sanitizes detail text.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

type catalogDetailLoadedMsg struct {
	title      string
	text       string
	err        error
	standalone bool
}

func (c *catalogComponent) handleDetailLoaded(m catalogDetailLoadedMsg) (tea.Model, tea.Cmd) {
	if !m.standalone && !c.open {
		return c.app, nil
	}
	text := m.text
	if m.err != nil {
		text = "Unable to load this detail.\n\nReason: " + operatorErrorMessage(m.err)
	}
	if strings.TrimSpace(text) == "" {
		text = "(no detail returned)"
	}
	c.openDetail(m.title, text)
	return c.app, nil
}

func loadToolDetailCmd(c *client.Client, scope client.RuntimeScope, toolID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		tool, err := c.GetTool(ctx, toolID)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Tool · " + toolID, err: err}
		}
		agents, _ := c.ListAgentsScoped(ctx, scope)
		return catalogDetailLoadedMsg{
			title: "Tool · " + valuefmt.FirstNonEmpty(tool.Title, tool.Name, tool.ID),
			text:  formatToolDetailWithAgents(tool, agents),
		}
	}
}

func (c *catalogComponent) openDetail(title, text string) {
	a := c.app
	a.detail.open(&bulkyPartRef{
		messageID: "catalog",
		partID:    strings.ToLower(strings.ReplaceAll(title, " ", "-")),
		title:     title,
		fullText:  sanitizeCatalogDetailText(text),
	})
}

func sanitizeCatalogDetailText(text string) string {
	if strings.TrimSpace(text) == "" {
		return text
	}
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = sanitizeCatalogDetailLine(line)
	}
	return strings.Join(lines, "\n")
}

func sanitizeCatalogDetailLine(line string) string {
	trimmed := strings.TrimLeft(line, " \t")
	indent := line[:len(line)-len(trimmed)]
	if strings.HasPrefix(trimmed, "\"") {
		return line
	}
	key, rest, ok := strings.Cut(trimmed, ":")
	if !ok {
		return line
	}
	label := catalogDetailLabel(key)
	if label == key {
		return line
	}
	return indent + label + ":" + rest
}

func catalogDetailLabel(key string) string {
	switch strings.TrimSpace(key) {
	case "agent_blueprint_id":
		return "workflow"
	case "base64_data":
		return "base64 data"
	case "default_model":
		return "default model"
	case "definition_path":
		return "definition file"
	case "display_path":
		return "display path"
	case "input_schema":
		return "inputs"
	case "installed_path":
		return "installed file"
	case "media_type", "mime_type":
		return "media type"
	case "model_id":
		return "model"
	case "output_schema":
		return "outputs"
	case "owner":
		return "workflow area"
	case "permission_default":
		return "approval needed"
	case "provider_id":
		return "provider"
	case "server_id":
		return "connection"
	case "session_id":
		return "session"
	case "source_path":
		return "source file"
	case "visible_to":
		return "available to"
	case "workspace_id":
		return "workspace"
	default:
		return key
	}
}
