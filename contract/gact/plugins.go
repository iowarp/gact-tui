package gact

// PluginAgent is one installed agent as GET /v1/agents lists it on a backend
// advertising x_clio_agent_plugins (SPEC §6.21): an identity, a flow and a set
// of plugins. A user agent (Kind "user") is a parent agent plus a delta.
type PluginAgent struct {
	Ref         string      `json:"ref"`
	ID          string      `json:"id"`
	Name        string      `json:"name,omitempty"`
	Description string      `json:"description,omitempty"`
	Role        string      `json:"role,omitempty"`
	Version     string      `json:"version,omitempty"`
	Marketplace string      `json:"marketplace,omitempty"`
	Kind        string      `json:"kind,omitempty"`
	Extends     string      `json:"extends,omitempty"`
	Delta       *AgentDelta `json:"delta,omitempty"`
}

// AgentDelta is the plugins a user agent or session adds to and removes from its parent.
type AgentDelta struct {
	Add    []string `json:"add"`
	Remove []string `json:"remove"`
}

// Definition is the agent as a catalog definition: its ID is the ref a
// session names to run it, and Source says whether it is installed ("plugin")
// or the person's own ("user").
func (a PluginAgent) Definition() AgentDef {
	source := "plugin"
	if a.Kind == "user" {
		source = "user"
	}
	title := a.Name
	if title == "" {
		title = a.ID
	}
	return AgentDef{
		ID:          a.Ref,
		Source:      source,
		Title:       title,
		Description: a.Description,
		Enabled:     true,
		Metadata:    map[string]any{"marketplace": a.Marketplace, "version": a.Version, "extends": a.Extends},
	}
}

// PluginSkill is one skill a session agent's plugins bring
// (GET /v1/sessions/{id}/agent, resolution.skills).
type PluginSkill struct {
	ID          string `json:"id"`
	Plugin      string `json:"plugin"`
	Description string `json:"description,omitempty"`
}
