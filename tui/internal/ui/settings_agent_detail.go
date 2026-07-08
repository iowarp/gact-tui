package ui

// settings_agent_detail.go formats agent detail lines/text for the settings agent tab.

import (
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func (c *agentComponent) agentDetailLines(ag gact.AgentDef, width int) []string {
	t := c.app.Theme
	lines := make([]string, 0, 8)
	add := func(label string, value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		line := lipgloss.NewStyle().Foreground(t.FgMuted).Render("  "+label+": ") +
			lipgloss.NewStyle().Foreground(t.Fg).Render(value)
		lines = append(lines, textutil.Truncate(line, width))
	}
	add("Expert", ag.ID)
	add("Comes from", agentSourceLabel(ag.Source))
	if ag.Tier > 0 {
		add("Routing depth", itoa2(ag.Tier))
	}
	add("Role", ag.Specialization)
	add("Reports to", ag.ParentID)
	add("Prompt", agentPromptSummary(ag))
	if routes := stringListFromMetadata(ag.Metadata, "routes_to"); len(routes) > 0 {
		add("Routes to", strings.Join(routes, ", "))
	}
	if delegates := stringListFromMetadata(ag.Metadata, "delegates_to"); len(delegates) > 0 {
		add("Delegates to", strings.Join(delegates, ", "))
	}
	if ag.DefaultModel != nil && ag.DefaultModel.ModelID != "" {
		model := ag.DefaultModel.ModelID
		if ag.DefaultModel.ProviderID != "" {
			model = ag.DefaultModel.ProviderID + "/" + model
		}
		add("Uses model", model)
	} else if ag.DefaultModelName != "" {
		add("Uses model", ag.DefaultModelName)
	} else if ag.DefaultProvider != "" {
		add("Uses provider", ag.DefaultProvider)
	}
	if len(ag.Tools) > 0 {
		add("Can use", strings.Join(ag.Tools, ", "))
	} else {
		add("Can use", "no tools declared")
	}
	if len(ag.Keywords) > 0 {
		add("Good for", strings.Join(ag.Keywords, ", "))
	}
	if len(ag.Skills) > 0 {
		add("Skills", strings.Join(ag.Skills, ", "))
	}
	if len(ag.Commands) > 0 {
		add("Commands", strings.Join(ag.Commands, ", "))
	}
	if refs := agentCapabilityRefLines(ag.CapabilityRefs); len(refs) > 0 {
		add("Capabilities", strings.Join(refs, "; "))
	}
	if len(ag.ValidationErrors) > 0 {
		add("Needs attention", strings.Join(ag.ValidationErrors, "; "))
	}
	add("Prompt source", agentPromptResolutionDescription(ag))
	add("Instruction", ag.SystemPrompt)
	return lines
}

func agentSourceLabel(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "builtin":
		return "built in"
	case "user":
		return "user defined"
	case "skill":
		return "installed skill"
	case "agent_blueprint", "blueprint":
		return "active blueprint"
	case "":
		return ""
	default:
		return source
	}
}

func agentPromptSummary(ag gact.AgentDef) string {
	switch {
	case ag.PromptID != "" && ag.PromptProfile != "":
		return ag.PromptID + " · " + ag.PromptProfile
	case ag.PromptID != "":
		return ag.PromptID
	case ag.PromptProfile != "":
		return ag.PromptProfile
	default:
		return ""
	}
}

func (c *agentComponent) agentDetailText(ag gact.AgentDef) string {
	lines := []string{
		"Title: " + c.app.settings.localizedAgentTitle(ag),
		"ID: " + ag.ID,
		"Source: " + ag.Source,
	}
	if ag.Tier > 0 {
		lines = append(lines, "Tier: "+itoa2(ag.Tier))
	}
	if ag.Specialization != "" {
		lines = append(lines, "Specialization: "+ag.Specialization)
	}
	if routes := stringListFromMetadata(ag.Metadata, "routes_to"); len(routes) > 0 {
		lines = append(lines, "", "Routes to:")
		lines = append(lines, bulletLines(routes)...)
	}
	if delegates := stringListFromMetadata(ag.Metadata, "delegates_to"); len(delegates) > 0 {
		lines = append(lines, "", "Delegates to:")
		lines = append(lines, bulletLines(delegates)...)
	}
	if len(ag.Tools) > 0 {
		lines = append(lines, "", "Tools:")
		lines = append(lines, bulletLines(ag.Tools)...)
	}
	if len(ag.Keywords) > 0 {
		lines = append(lines, "", "Routing keywords:")
		lines = append(lines, bulletLines(ag.Keywords)...)
	}
	if refs := agentCapabilityRefLines(ag.CapabilityRefs); len(refs) > 0 {
		lines = append(lines, "", "Capabilities:")
		lines = append(lines, bulletLines(refs)...)
	}
	if len(ag.ValidationErrors) > 0 {
		lines = append(lines, "", "Validation errors:")
		lines = append(lines, bulletLines(ag.ValidationErrors)...)
	}
	if text := compactJSONDescription(ag.Module); text != "" {
		lines = append(lines, "", "DSPy module:", text)
	}
	if text := compactJSONDescription(ag.Signature); text != "" {
		lines = append(lines, "", "DSPy signature:", text)
	}
	if text := compactJSONDescription(ag.StructuredOutputs); text != "" {
		lines = append(lines, "", "Structured outputs:", text)
	}
	if text := compactJSONDescription(ag.Fanout); text != "" {
		lines = append(lines, "", "Fanout:", text)
	}
	if provenance := agentPromptResolutionDescription(ag); provenance != "" {
		lines = append(lines, "", "Prompt provenance:", provenance)
	}
	if strings.TrimSpace(ag.SystemPrompt) != "" {
		lines = append(lines, "", "Prompt:", strings.TrimSpace(ag.SystemPrompt))
	}
	return strings.Join(lines, "\n")
}

func bulletLines(items []string) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" {
			out = append(out, "  - "+item)
		}
	}
	return out
}

func agentCapabilityRefLines(refs []gact.AgentCapabilityRef) []string {
	out := make([]string, 0, len(refs))
	for _, ref := range refs {
		label := valuefmt.FirstNonEmpty(ref.Title, ref.ID)
		if label == "" {
			continue
		}
		parts := make([]string, 0, 3)
		if ref.Kind != "" {
			parts = append(parts, ref.Kind)
		}
		if ref.Status != "" {
			parts = append(parts, ref.Status)
		}
		if ref.Source != "" {
			parts = append(parts, ref.Source)
		}
		line := label
		if len(parts) > 0 {
			line += " (" + strings.Join(parts, ", ") + ")"
		}
		if text := compactJSONDescription(ref.Metadata); text != "" {
			line += " " + text
		}
		out = append(out, line)
	}
	return out
}

func stringListFromMetadata(metadata map[string]any, key string) []string {
	if len(metadata) == 0 {
		return nil
	}
	raw, ok := metadata[key]
	if !ok {
		return nil
	}
	switch v := raw.(type) {
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}
