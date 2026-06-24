package goose

// gooseTool mirrors goose-server agent.rs's ToolInfo. Only the
// fields we project are decoded.
type gooseTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"input_schema,omitempty"`
	Permission  any            `json:"permission,omitempty"`
}

// toolToGact projects a Goose ToolInfo into the GACT Tool wire shape
// (SPEC §6.6 + §4.6). Goose names already use the "extension__tool"
// convention, which we keep verbatim as both id and name so the
// per-id drill round-trips.
func toolToGact(g gooseTool) map[string]any {
	t := map[string]any{
		"id":          g.Name,
		"name":        g.Name,
		"source":      "builtin",
		"description": g.Description,
	}
	if g.InputSchema != nil {
		t["input_schema"] = g.InputSchema
	} else {
		t["input_schema"] = map[string]any{"type": "object"}
	}
	if g.Permission != nil {
		t["x_goose_permission"] = g.Permission
	}
	return t
}
