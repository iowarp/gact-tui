package gact

import (
	"bytes"
	"encoding/json"
	"sort"
)

// AgentDef is a reusable agent persona/recipe (SPEC §6.5).
//
// v0.2 (SPEC §4.3.1): Tier, Specialization, Keywords are optional
// fields that let a backend advertise a multi-tier agent hierarchy.
// Backends with capabilities.agent_routing = true populate them on
// tier-2 specialists so the TUI can render a routing badge and
// colour it by specialization.
type AgentDef struct {
	ID                 string               `json:"id"`
	Source             string               `json:"source"` // builtin|user|recipe|skill
	Title              string               `json:"title"`
	Description        string               `json:"description,omitempty"`
	ParentID           string               `json:"parent_id,omitempty"`
	SystemPrompt       string               `json:"system_prompt,omitempty"`
	PromptID           string               `json:"prompt_id,omitempty"`
	PromptProfile      string               `json:"prompt_profile,omitempty"`
	DefaultProvider    string               `json:"default_provider,omitempty"`
	Parameters         []AgentParameter     `json:"parameters,omitempty"`
	DefaultModel       *ModelRef            `json:"default_model,omitempty"`
	DefaultModelName   string               `json:"-"`
	Module             map[string]any       `json:"module,omitempty"`
	Signature          map[string]any       `json:"signature,omitempty"`
	StructuredOutputs  map[string]any       `json:"structured_outputs,omitempty"`
	Fanout             map[string]any       `json:"fanout,omitempty"`
	Tools              []string             `json:"tools,omitempty"`
	Skills             []string             `json:"skills,omitempty"`
	Commands           []string             `json:"commands,omitempty"`
	CapabilityRefs     []AgentCapabilityRef `json:"capability_refs,omitempty"`
	Metadata           map[string]any       `json:"metadata,omitempty"`
	Enabled            bool                 `json:"enabled,omitempty"`
	ValidationWarnings []string             `json:"validation_warnings,omitempty"`
	ValidationErrors   []string             `json:"validation_errors,omitempty"`

	// v0.2 — multi-tier routing (optional; absent = tier-1 or untagged)
	Tier           int      `json:"tier,omitempty"`           // 1 = orchestrator, 2 = specialist, 3 = nanoagent
	Specialization string   `json:"specialization,omitempty"` // free-form tag — UI palette hint (code_editing, data_analysis, research, …)
	Keywords       []string `json:"keywords,omitempty"`       // intent tokens the tier-1 router matches
}

type AgentCapabilityRef struct {
	Kind        string         `json:"kind,omitempty"`
	ID          string         `json:"id,omitempty"`
	Title       string         `json:"title,omitempty"`
	Description string         `json:"description,omitempty"`
	Source      string         `json:"source,omitempty"`
	Status      string         `json:"status,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type AgentExtractRequest struct {
	SessionIDs []string `json:"session_ids"`
	AgentID    string   `json:"agent_id"`
}

// UnmarshalJSON accepts both the shared GACT array shape for
// parameters and CLIO's current object/map shape. Settings must not
// fail the whole agent catalog because one backend serializes
// parameters as {"name": value} instead of [{"name": "..."}].
func (a *AgentDef) UnmarshalJSON(data []byte) error {
	type alias AgentDef
	var raw struct {
		alias
		Parameters   json.RawMessage `json:"parameters,omitempty"`
		DefaultModel json.RawMessage `json:"default_model,omitempty"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	out := AgentDef(raw.alias)
	if len(raw.Parameters) > 0 && !bytes.Equal(raw.Parameters, []byte("null")) {
		params, err := decodeAgentParameters(raw.Parameters)
		if err != nil {
			return err
		}
		out.Parameters = params
	}
	if len(raw.DefaultModel) > 0 && !bytes.Equal(raw.DefaultModel, []byte("null")) {
		var ref ModelRef
		if err := json.Unmarshal(raw.DefaultModel, &ref); err == nil && (ref.ProviderID != "" || ref.ModelID != "" || ref.Variant != "") {
			out.DefaultModel = &ref
		} else {
			var model string
			if err := json.Unmarshal(raw.DefaultModel, &model); err == nil {
				out.DefaultModelName = model
			}
		}
	}
	*a = out
	return nil
}

func decodeAgentParameters(data []byte) ([]AgentParameter, error) {
	var list []AgentParameter
	if err := json.Unmarshal(data, &list); err == nil {
		return list, nil
	}
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]AgentParameter, 0, len(keys))
	for _, key := range keys {
		param := AgentParameter{Name: key, Type: "string"}
		if spec, ok := obj[key].(map[string]any); ok {
			if typ, ok := spec["type"].(string); ok && typ != "" {
				param.Type = typ
			}
			if desc, ok := spec["description"].(string); ok {
				param.Description = desc
			}
			if required, ok := spec["required"].(bool); ok {
				param.Required = required
			}
			if opts, ok := spec["options"].([]any); ok {
				for _, opt := range opts {
					if s, ok := opt.(string); ok {
						param.Options = append(param.Options, s)
					}
				}
			}
		}
		out = append(out, param)
	}
	return out, nil
}

// AgentParameter is a fillable input on an agent recipe.
type AgentParameter struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"` // string|number|select|multiline
	Required    bool     `json:"required,omitempty"`
	Description string   `json:"description,omitempty"`
	Options     []string `json:"options,omitempty"`
}
