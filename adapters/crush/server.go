package crush

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// Server is a thin GACT-front for a Crush upstream. v0.1 scope:
//
//	GET /v1/health
//	GET /v1/capabilities
//	GET /v1/workspaces             ← Crush /v1/workspaces
//	GET /v1/workspaces/{id}        ← Crush /v1/workspaces/{id}
//	GET /v1/sessions?workspace_id= ← Crush /v1/workspaces/{id}/sessions
//	GET /v1/sessions/{id}          ← needs the workspace ID — see below
//
// All other GACT endpoints return 501. The single-session GET path is
// tricky because GACT keys sessions by ID alone but Crush requires the
// workspace too — v0.1 falls back to scanning the configured upstream
// workspace; multi-workspace support is a follow-up.
type Server struct {
	upstream    string // e.g. http://localhost:8080
	defaultWsID string // workspace ID used when GACT request omits one
	client      *http.Client
	mux         *http.ServeMux
	started     time.Time
}

// New constructs the adapter. defaultWsID is used to disambiguate single-
// session lookups when GACT's flat URL doesn't carry the workspace.
func New(upstream, defaultWsID string, httpClient *http.Client) *Server {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	s := &Server{
		upstream:    trimSlash(upstream),
		defaultWsID: defaultWsID,
		client:      httpClient,
		mux:         http.NewServeMux(),
		started:     time.Now(),
	}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler { return s.mux }

func (s *Server) routes() {
	s.mux.HandleFunc("GET /v1/health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/capabilities", s.handleCapabilities)
	s.mux.HandleFunc("GET /v1/workspaces", s.handleListWorkspaces)
	s.mux.HandleFunc("GET /v1/workspaces/{id}", s.handleGetWorkspace)
	s.mux.HandleFunc("GET /v1/sessions", s.handleListSessions)
	s.mux.HandleFunc("GET /v1/sessions/{id}", s.handleGetSession)
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
			Name:    "gact-crush-adapter",
			Version: "0.1.0",
			Vendor:  "gact",
		},
		Capabilities: gact.CapabilityFlags{
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

func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	body, err := s.upstreamGet(r.Context(), "/v1/workspaces")
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	var ws []CrushWorkspace
	if err := json.Unmarshal(body, &ws); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"workspaces": WorkspacesToGact(ws),
	})
}

func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body, err := s.upstreamGet(r.Context(), "/v1/workspaces/"+id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	var cw CrushWorkspace
	if err := json.Unmarshal(body, &cw); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	if cw.ID == "" {
		writeError(w, http.StatusNotFound, "workspace_not_found", "no workspace "+id)
		return
	}
	writeJSON(w, http.StatusOK, WorkspaceToGact(cw))
}

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	wsID := r.URL.Query().Get("workspace_id")
	if wsID == "" {
		wsID = s.defaultWsID
	}
	if wsID == "" {
		writeError(w, http.StatusBadRequest, "missing_workspace",
			"adapter requires workspace_id query (set --default-workspace at startup to make it implicit)")
		return
	}
	body, err := s.upstreamGet(r.Context(), "/v1/workspaces/"+wsID+"/sessions")
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	var cs []CrushSession
	if err := json.Unmarshal(body, &cs); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"sessions": SessionsToGact(cs, wsID),
	})
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	wsID := r.URL.Query().Get("workspace_id")
	if wsID == "" {
		wsID = s.defaultWsID
	}
	if wsID == "" {
		writeError(w, http.StatusBadRequest, "missing_workspace",
			"adapter requires workspace_id query for single-session lookup")
		return
	}
	body, err := s.upstreamGet(r.Context(), "/v1/workspaces/"+wsID+"/sessions/"+id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	var cs CrushSession
	if err := json.Unmarshal(body, &cs); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	if cs.ID == "" {
		writeError(w, http.StatusNotFound, "session_not_found", "no session "+id)
		return
	}
	writeJSON(w, http.StatusOK, SessionToGact(cs, wsID))
}

func (s *Server) handleNotImplemented(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not_implemented",
		fmt.Sprintf("crush adapter v0.1 does not implement %s %s", r.Method, r.URL.Path))
}

func (s *Server) upstreamGet(ctx context.Context, path string) ([]byte, error) {
	if ctx == nil {
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		ctx = c
	}
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
		return []byte(`{}`), nil
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("upstream %s: %d", path, resp.StatusCode)
	}
	const max = 4 * 1024 * 1024
	buf, err := io.ReadAll(io.LimitReader(resp.Body, max))
	if err != nil {
		return nil, err
	}
	return buf, nil
}
