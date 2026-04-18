package opencode

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// Server is a thin GACT-front for an OpenCode upstream. It exposes a
// subset of the GACT v0.1 contract and translates each request into one
// or more OpenCode HTTP calls.
//
// v0.1 scope:
//   - GET /v1/health
//   - GET /v1/capabilities (advertises only what the adapter actually serves)
//   - GET /v1/workspaces (synthetic — one workspace from OpenCode /path)
//   - GET /v1/sessions (proxied to OpenCode /session)
//   - GET /v1/sessions/{id} (proxied)
//
// Out of v0.1 scope (returns 501 with a clear message): messages, SSE,
// permissions, mcp, providers, commands, metrics. Each is a follow-up.
type Server struct {
	upstream string // OpenCode base URL, e.g. http://localhost:4096
	client   *http.Client
	mux      *http.ServeMux
	started  time.Time
}

// New constructs an adapter Server. upstream is the OpenCode base URL.
// httpClient defaults to a 10s-timeout client.
func New(upstream string, httpClient *http.Client) *Server {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	s := &Server{
		upstream: upstream,
		client:   httpClient,
		mux:      http.NewServeMux(),
		started:  time.Now(),
	}
	s.routes()
	return s
}

// Handler returns the adapter's HTTP handler.
func (s *Server) Handler() http.Handler { return s.mux }

func (s *Server) routes() {
	s.mux.HandleFunc("GET /v1/health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/capabilities", s.handleCapabilities)
	s.mux.HandleFunc("GET /v1/workspaces", s.handleListWorkspaces)
	s.mux.HandleFunc("GET /v1/sessions", s.handleListSessions)
	s.mux.HandleFunc("GET /v1/sessions/{id}", s.handleGetSession)
	// Anything else under /v1/ → 501 with a clear note for the TUI to
	// gracefully degrade. The capabilities response advertises only what
	// the adapter implements so a well-behaved client shouldn't ask.
	s.mux.HandleFunc("/v1/", s.handleNotImplemented)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, gact.Error{Error: gact.ErrorBody{Code: code, Message: msg}})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, gact.HealthResponse{
		Healthy: true,
		UptimeS: int(time.Since(s.started).Seconds()),
	})
}

func (s *Server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, gact.Capabilities{
		ContractVersion: "0.1",
		Backend: gact.BackendInfo{
			Name:    "gact-opencode-adapter",
			Version: "0.1.0",
			Vendor:  "gact",
		},
		Capabilities: gact.CapabilityFlags{
			// Honest about scope — adapter is sessions-only in v0.1.
			Workspaces: true,
			Sessions:   true,
		},
		Transports: gact.TransportFlags{},
		Auth: gact.AuthInfo{
			Schemes: []string{"trust_socket"},
			Current: "trust_socket",
		},
	})
}

// handleListWorkspaces returns one synthetic workspace pulled from
// OpenCode's /path endpoint (which reports {home, state, config, worktree,
// directory}). For v0.1 we collapse that into a single workspace per
// adapter instance.
func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	// OpenCode's /path returns {worktree, directory, home, ...}.
	body, err := s.upstreamGet("/path")
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	var path struct {
		Worktree  string `json:"worktree"`
		Directory string `json:"directory"`
	}
	if err := json.Unmarshal(body, &path); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	root := path.Worktree
	if root == "" {
		root = path.Directory
	}
	w_ws := WorkspaceFromProject(OcProjectInfo{
		ID:       "default",
		Worktree: root,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"workspaces": []gact.Workspace{w_ws},
	})
}

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	// OpenCode supports filtering via query (directory, search, limit).
	// For v0.1 pass the limit through if present and ignore the rest.
	q := url.Values{}
	if l := r.URL.Query().Get("limit"); l != "" {
		q.Set("limit", l)
	}
	upPath := "/session/"
	if len(q) > 0 {
		upPath += "?" + q.Encode()
	}
	body, err := s.upstreamGet(upPath)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	var ocs OcSessionListResponse
	if err := json.Unmarshal(body, &ocs); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"sessions": SessionsToGact(ocs),
	})
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body, err := s.upstreamGet("/session/" + id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	var oc OcSession
	if err := json.Unmarshal(body, &oc); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	if oc.ID == "" {
		writeError(w, http.StatusNotFound, "session_not_found", "no session "+id)
		return
	}
	writeJSON(w, http.StatusOK, SessionToGact(oc))
}

func (s *Server) handleNotImplemented(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not_implemented",
		fmt.Sprintf("adapter v0.1 does not implement %s %s", r.Method, r.URL.Path))
}

func (s *Server) upstreamGet(path string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.upstream+path, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return []byte(`{}`), nil // signal "missing" via empty body
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("upstream %s: %d", path, resp.StatusCode)
	}
	const max = 4 * 1024 * 1024
	buf := make([]byte, 0, 1024)
	tmp := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(tmp)
		if n > 0 {
			if len(buf)+n > max {
				return nil, fmt.Errorf("upstream %s: response too large", path)
			}
			buf = append(buf, tmp[:n]...)
		}
		if err != nil {
			break
		}
	}
	return buf, nil
}
