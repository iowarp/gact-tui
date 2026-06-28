package server

import (
	"net/http"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §6.7 MCP --------------------------------------------------------------

func (s *Server) handleMcpHandshake(w http.ResponseWriter, r *http.Request) {
	if s.cfg.EmptyMcpConnections {
		writeJSON(w, http.StatusOK, map[string]any{"servers": []map[string]any{}})
		return
	}
	servers := []map[string]any{}
	for _, server := range staticMcpServers() {
		reachable := server.Status == "ready"
		tools := []string{}
		for _, tool := range staticTools() {
			if tool.Source == "mcp" && tool.ServerID == server.ID {
				tools = append(tools, tool.Name)
			}
		}
		row := map[string]any{
			"name":        server.ID,
			"reachable":   reachable,
			"state":       server.Status,
			"transport":   server.Transport,
			"tools_count": len(tools),
			"tools":       tools,
			"latency_ms":  6.2,
		}
		if !reachable {
			row["error"] = firstNonEmptyString(server.LastError, "MCP server is not reachable")
		}
		servers = append(servers, row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"servers": servers})
}

func (s *Server) handleListMcpServers(w http.ResponseWriter, r *http.Request) {
	if s.cfg.EmptyMcpConnections {
		writeJSON(w, http.StatusOK, map[string]any{"servers": []gact.McpServer{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"servers": staticMcpServers()})
}

func (s *Server) handleGetMcpServer(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, srv := range staticMcpServers() {
		if srv.ID == id {
			writeJSON(w, http.StatusOK, srv)
			return
		}
	}
	writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
}

func (s *Server) handleDeleteMcpServer(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	if id == "mcp_docs" {
		writeError(w, http.StatusConflict, "mcp_remove_failed", "remove failed: connection is still referenced by a workspace profile")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMcpReconnect(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	if id == "mcp_docs" {
		writeError(w, http.StatusBadGateway, "mcp_reconnect_failed", "probe failed: connection refused")
		return
	}
	// MMM1: surface a notification SSE event so connected clients see
	// the reconnect succeeded without polling. Workspace-scoped so
	// every TUI/SSE listener picks it up.
	s.bus.Publish(events.Event{
		Type: "notification",
		Payload: map[string]any{
			"level": "info",
			"title": "MCP server reconnected",
			"body":  id,
		},
	})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMcpServerTools(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	tools := []gact.Tool{}
	for _, t := range staticTools() {
		if t.Source == "mcp" && t.ServerID == id {
			tools = append(tools, t)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": tools})
}

func (s *Server) handleMcpServerResources(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"resources": staticMcpResources(id)})
}

func (s *Server) handleMcpServerResourceTemplates(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"templates": []gact.McpResourceTemplate{
		{ServerID: id, URITemplate: "file:///docs/{name}.md", Name: "doc", Description: "Demo doc by name"},
	}})
}

type mcpReadRequest struct {
	URI string `json:"uri"`
}

func (s *Server) handleMcpResourceRead(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	var req mcpReadRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.URI == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "uri required")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"contents": []gact.McpContent{
			{URI: req.URI, MimeType: "text/plain", Text: "demo content for " + req.URI},
		},
	})
}

func (s *Server) handleMcpResourceSubscribe(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	var req mcpReadRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMcpServerPrompts(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"prompts": staticMcpPrompts(id)})
}

type mcpPromptGetRequest struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

func (s *Server) handleMcpPromptGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	var req mcpPromptGetRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"description": "Demo prompt for " + req.Name,
		"messages": []gact.McpMessage{
			{Role: gact.RoleUser, Content: []gact.Part{
				gact.NewTextPart("Demo body for prompt " + req.Name),
			}},
		},
	})
}

func mcpExists(id string) bool {
	for _, s := range staticMcpServers() {
		if s.ID == id {
			return true
		}
	}
	return false
}

func staticMcpServers() []gact.McpServer {
	return []gact.McpServer{
		{
			ID: "mcp_docs", Name: "docs-mcp", Version: "0.1.0",
			Transport: "http", ProtocolVersion: "2025-06-18", Status: "error",
			LastError:    "connection refused",
			ServerInfo:   map[string]any{"name": "docs-mcp", "version": "0.1.0"},
			Instructions: "Demo disconnected MCP server used to exercise repair flows.",
			DeclaredCapabilities: gact.McpCapabilities{
				Tools: true,
			},
		},
		{
			ID: "mcp_fake", Name: "fake-mcp", Version: "0.1.0",
			Transport: "stdio", ProtocolVersion: "2025-06-18", Status: "ready",
			ServerInfo:   map[string]any{"name": "fake-mcp", "version": "0.1.0"},
			Instructions: "Demo MCP server. Two tools (fetch, dbquery), one resource, one prompt.",
			DeclaredCapabilities: gact.McpCapabilities{
				Tools:     true,
				Resources: &gact.McpResourcesCapability{Subscribe: true, ListChanged: true},
				Prompts:   &gact.McpPromptsCapability{ListChanged: false},
				Logging:   true,
			},
		},
	}
}

func staticMcpResources(serverID string) []gact.McpResource {
	return []gact.McpResource{
		{ServerID: serverID, URI: "file:///docs/welcome.md", Name: "welcome",
			Title: "Welcome", Description: "Intro doc", MimeType: "text/markdown", Size: 256},
	}
}

func staticMcpPrompts(serverID string) []gact.McpPrompt {
	return []gact.McpPrompt{
		{ServerID: serverID, Name: "summarize", Title: "Summarize",
			Description: "Summarize a chunk of text",
			Arguments: []gact.McpPromptArg{
				{Name: "text", Required: true, Description: "Text to summarize"},
			}},
	}
}
