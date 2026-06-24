package server

import (
	"net/http"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §6.6 Tools ------------------------------------------------------------

func (s *Server) handleListTools(w http.ResponseWriter, r *http.Request) {
	if s.cfg.EmptyTools {
		writeJSON(w, http.StatusOK, map[string]any{"tools": []gact.Tool{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": staticTools()})
}

func (s *Server) handleGetTool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "legacy_waveform_fetch" {
		writeError(w, http.StatusServiceUnavailable, "tool_unavailable", "tool unavailable: the EarthScope connector is not loaded in this workspace")
		return
	}
	for _, t := range staticTools() {
		if t.ID == id {
			writeJSON(w, http.StatusOK, t)
			return
		}
	}
	writeError(w, http.StatusNotFound, "tool_not_found", "no tool with id "+id)
}

func staticTools() []gact.Tool {
	stringSchema := func() map[string]any {
		return map[string]any{"type": "string"}
	}
	return []gact.Tool{
		{
			ID: "bash", Source: "builtin", Name: "bash", Title: "Run shell command",
			Description: "Execute a bash command in the workspace.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"command": stringSchema(),
				},
				"required": []string{"command"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Run shell command", DestructiveHint: true, OpenWorldHint: false},
			PermissionDefault: "ask",
		},
		{
			ID: "read_file", Source: "builtin", Name: "read_file", Title: "Read file",
			Description: "Read the contents of a file.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"path": stringSchema()},
				"required":   []string{"path"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Read file", ReadOnlyHint: true},
			PermissionDefault: "allow",
		},
		{
			ID: "edit_file", Source: "builtin", Name: "edit_file", Title: "Edit file",
			Description: "Modify a file in place. Returns a diff.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"path":  stringSchema(),
					"patch": stringSchema(),
				},
				"required": []string{"path", "patch"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Edit file", DestructiveHint: true},
			PermissionDefault: "ask",
		},
		{
			ID: "web_search", Source: "builtin", Name: "web_search", Title: "Search the web",
			Description: "Search the web for relevant pages.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"query": stringSchema()},
				"required":   []string{"query"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Web search", ReadOnlyHint: true, OpenWorldHint: true},
			PermissionDefault: "allow",
		},
		{
			ID: "legacy_waveform_fetch", Source: "extension", Name: "legacy_waveform_fetch", Title: "Legacy waveform fetch",
			Description: "Stale extension entry used to exercise unavailable tool handling.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"station": stringSchema()},
				"required":   []string{"station"},
			},
			PermissionDefault: "ask",
			Tags:              []string{"seismic", "unavailable"},
		},
		{
			ID: "fake-mcp.fetch", Source: "mcp", ServerID: "mcp_fake", Name: "fetch", Title: "Fetch URL",
			Description: "(MCP) Download a URL and return its contents.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"url": stringSchema()},
				"required":   []string{"url"},
			},
			PermissionDefault: "allow",
		},
		{
			ID: "fake-mcp.dbquery", Source: "mcp", ServerID: "mcp_fake", Name: "dbquery", Title: "Database query",
			Description: "(MCP) Run a read-only query against the demo database.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"sql": stringSchema()},
				"required":   []string{"sql"},
			},
			PermissionDefault: "allow",
		},
	}
}
