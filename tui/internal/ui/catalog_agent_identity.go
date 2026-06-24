package ui

// catalog_agent_identity.go formats agent identity fields (title, model, parent, prompt resolution) for the catalog.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func stringFromMetadata(metadata map[string]any, key string) string {
	if len(metadata) == 0 {
		return ""
	}
	if value, ok := metadata[key].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func mapFromMetadata(metadata map[string]any, key string) map[string]any {
	if len(metadata) == 0 {
		return nil
	}
	if value, ok := metadata[key].(map[string]any); ok {
		return value
	}
	return nil
}

func agentPromptResolutionDescription(agent gact.AgentDef) string {
	res := mapFromMetadata(agent.Metadata, "prompt_resolution")
	parts := make([]string, 0, 6)
	if res != nil {
		for _, key := range []string{"id", "profile", "scope", "status", "provider", "model"} {
			if value := strings.TrimSpace(fmt.Sprint(res[key])); value != "" && value != "<nil>" {
				parts = append(parts, promptResolutionLabel(key)+": "+value)
			}
		}
		if fallback := strings.TrimSpace(fmt.Sprint(res["fallback_profile"])); fallback != "" && fallback != "<nil>" {
			parts = append(parts, "fallback profile: "+fallback)
		}
	}
	if len(parts) == 0 {
		promptID := firstNonEmpty(agent.PromptID, stringFromMetadata(agent.Metadata, "prompt_id"), stringFromMetadata(agent.Metadata, "prompt"))
		profile := firstNonEmpty(agent.PromptProfile, stringFromMetadata(agent.Metadata, "prompt_profile"))
		if promptID != "" {
			parts = append(parts, "prompt: "+promptID)
		}
		if profile != "" {
			parts = append(parts, "profile: "+profile)
		}
	}
	return strings.Join(parts, " · ")
}

func promptResolutionLabel(key string) string {
	switch key {
	case "id":
		return "prompt"
	case "scope":
		return "scope"
	default:
		return key
	}
}

func agentParentID(agent gact.AgentDef) string {
	if agent.ParentID != "" {
		return agent.ParentID
	}
	if parent := stringFromMetadata(agent.Metadata, "parent"); parent != "" {
		return parent
	}
	return stringFromMetadata(agent.Metadata, "parent_id")
}

func humanizeAgentLabel(label string) string {
	label = strings.TrimSpace(label)
	label = strings.ReplaceAll(label, "_", " ")
	label = strings.ReplaceAll(label, "-", " ")
	return strings.Join(strings.Fields(label), " ")
}

func operatorAgentTitle(agent gact.AgentDef) string {
	title := strings.TrimSpace(firstNonEmpty(agent.Title, agent.ID))
	for _, suffix := range []string{" Agent", " agent"} {
		if strings.HasSuffix(title, suffix) {
			stem := strings.TrimSpace(strings.TrimSuffix(title, suffix))
			if stem != "" {
				return stem + " Expert"
			}
		}
	}
	if strings.EqualFold(title, "agent") {
		return "Expert"
	}
	return title
}

func agentTitleByID(agents []gact.AgentDef, id string) string {
	for _, agent := range agents {
		if agent.ID == id {
			return operatorAgentTitle(agent)
		}
	}
	return id
}

func agentModelText(agent gact.AgentDef) string {
	if agent.DefaultModel == nil && agent.DefaultProvider == "" && agent.DefaultModelName == "" {
		return "backend/session default"
	}
	parts := make([]string, 0, 3)
	if agent.DefaultProvider != "" {
		parts = append(parts, "provider: "+agent.DefaultProvider)
	}
	if agent.DefaultModelName != "" {
		parts = append(parts, "model: "+agent.DefaultModelName)
	}
	if agent.DefaultModel == nil {
		return strings.Join(parts, " · ")
	}
	if agent.DefaultModel.ProviderID != "" {
		parts = append(parts, "provider: "+agent.DefaultModel.ProviderID)
	}
	if agent.DefaultModel.ModelID != "" {
		parts = append(parts, "model: "+agent.DefaultModel.ModelID)
	}
	if agent.DefaultModel.Variant != "" {
		parts = append(parts, "variant: "+agent.DefaultModel.Variant)
	}
	if len(parts) == 0 {
		return "backend/session default"
	}
	return strings.Join(parts, " · ")
}
