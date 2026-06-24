package claudecode

import "net/http"

func (s *Server) captureCatalogs(initEv map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.toolNames) == 0 {
		if tools, _ := initEv["tools"].([]any); len(tools) > 0 {
			for _, t := range tools {
				if name, ok := t.(string); ok {
					s.toolNames = append(s.toolNames, name)
				}
			}
		}
	}
	if len(s.agentNames) == 0 {
		if agents, _ := initEv["agents"].([]any); len(agents) > 0 {
			for _, a := range agents {
				if name, ok := a.(string); ok {
					s.agentNames = append(s.agentNames, name)
				}
			}
		}
	}
	if len(s.slashCmdNames) == 0 {
		if cmds, _ := initEv["slash_commands"].([]any); len(cmds) > 0 {
			for _, c := range cmds {
				if name, ok := c.(string); ok {
					s.slashCmdNames = append(s.slashCmdNames, name)
				}
			}
		}
	}
	if len(s.mcpServers) == 0 {
		if servers, _ := initEv["mcp_servers"].([]any); len(servers) > 0 {
			statusMap := map[string]string{
				"connected":  "ready",
				"needs-auth": "error",
				"failed":     "error",
				"pending":    "connecting",
			}
			for _, raw := range servers {
				m, ok := raw.(map[string]any)
				if !ok {
					continue
				}
				name, _ := m["name"].(string)
				if name == "" {
					continue
				}
				rawStatus, _ := m["status"].(string)
				gactStatus := statusMap[rawStatus]
				if gactStatus == "" {
					gactStatus = "disconnected"
				}
				s.mcpServers = append(s.mcpServers, map[string]any{
					"id":                      slugify(name),
					"name":                    name,
					"transport":               "stdio",
					"status":                  gactStatus,
					"x_claudecode_raw_status": rawStatus,
				})
			}
		}
	}
}

func (s *Server) handleListTools(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	names := append([]string{}, s.toolNames...)
	s.mu.Unlock()
	out := make([]map[string]any, 0, len(names))
	for _, n := range names {
		out = append(out, map[string]any{
			"id": n, "name": n, "source": "builtin",
			"input_schema": map[string]any{"type": "object"},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": out})
}

func (s *Server) handleGetTool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, n := range s.toolNames {
		if n == id {
			writeJSON(w, http.StatusOK, map[string]any{
				"id": n, "name": n, "source": "builtin",
				"input_schema": map[string]any{"type": "object"},
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "tool_not_found", "no tool with id "+id)
}

func (s *Server) handleListAgents(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	names := append([]string{}, s.agentNames...)
	s.mu.Unlock()
	out := make([]map[string]any, 0, len(names))
	for _, n := range names {
		out = append(out, map[string]any{
			"id": n, "source": "builtin", "title": n,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": out})
}

func (s *Server) handleGetAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, n := range s.agentNames {
		if n == id {
			writeJSON(w, http.StatusOK, map[string]any{
				"id": n, "source": "builtin", "title": n,
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "agent_not_found", "no agent with id "+id)
}

func (s *Server) handleListCommands(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	names := append([]string{}, s.slashCmdNames...)
	s.mu.Unlock()
	out := make([]map[string]any, 0, len(names))
	for _, n := range names {
		out = append(out, map[string]any{
			"id": n, "title": n, "source": "builtin",
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"commands": out})
}

func (s *Server) handleListMcp(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	out := append([]map[string]any{}, s.mcpServers...)
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"servers": out})
}

func (s *Server) handleGetMcp(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, srv := range s.mcpServers {
		if srv["id"] == id {
			writeJSON(w, http.StatusOK, srv)
			return
		}
	}
	writeError(w, http.StatusNotFound, "server_not_found", "no mcp server with id "+id)
}

// slugify produces a stable URL-safe id from a free-form name.
// Claude Code only exposes MCP server names, so adapter ids are synthetic.
func slugify(name string) string {
	b := make([]byte, 0, len(name)+4)
	b = append(b, 'm', 'c', 'p', '_')
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b = append(b, byte(r))
		case r >= 'A' && r <= 'Z':
			b = append(b, byte(r-'A'+'a'))
		default:
			b = append(b, '_')
		}
	}
	for len(b) > 4 && b[len(b)-1] == '_' {
		b = b[:len(b)-1]
	}
	return string(b)
}
