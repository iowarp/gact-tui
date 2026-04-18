package opencode

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages", s.handleListMessages)
	s.mux.HandleFunc("POST /v1/sessions/{id}/messages", s.handlePostMessage)
	s.mux.HandleFunc("GET /v1/events", s.handleEvents)
	s.mux.HandleFunc("GET /v1/sessions/{id}/events", s.handleSessionEvents)
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
			// Honest about scope — adapter currently does sessions + read
			// of messages. POST/SSE/permissions still TBD.
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

// gactPostMessageRequest mirrors the GACT POST shape (parts + optional model).
type gactPostMessageRequest struct {
	Parts []gact.Part    `json:"parts"`
	Model *gact.ModelRef `json:"model,omitempty"`
}

// gactPostMessageResponse mirrors GACT's 202 ack.
type gactPostMessageResponse struct {
	MessageID  string    `json:"message_id"`
	AcceptedAt time.Time `json:"accepted_at"`
}

// handlePostMessage forwards a GACT-shaped message post to OpenCode's
// async-prompt endpoint. We translate GACT parts → OpenCode parts on
// the way out, and return a synthetic 202 with the message ID OpenCode
// allocates (or with the request body's pre-assigned ID if present).
//
// OpenCode's `POST /session/:id/prompt_async` returns 204 (work happens
// in the background). We synthesize a message_id on the GACT side from
// the upstream response if available, or generate one client-side.
func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4*1024*1024))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	var req gactPostMessageRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if len(req.Parts) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_body", "parts must be non-empty")
		return
	}

	// Translate GACT parts → OpenCode parts. v0.1 supports text + tool_call.
	ocParts := make([]map[string]any, 0, len(req.Parts))
	for _, p := range req.Parts {
		switch p.Type {
		case gact.PartTypeText:
			ocParts = append(ocParts, map[string]any{"type": "text", "text": p.Text})
		case gact.PartTypeToolCall:
			ocParts = append(ocParts, map[string]any{
				"type":   "tool",
				"callID": p.CallID,
				"tool":   p.ToolName,
				"state":  map[string]any{"status": "pending", "input": p.Input},
			})
		default:
			// Drop unknown — adapter is best-effort.
		}
	}
	upstreamBody := map[string]any{
		"parts": ocParts,
	}
	if req.Model != nil {
		upstreamBody["providerID"] = req.Model.ProviderID
		upstreamBody["modelID"] = req.Model.ModelID
	}

	upBytes, _ := json.Marshal(upstreamBody)
	upReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		s.upstream+"/session/"+id+"/prompt_async", bytes.NewReader(upBytes))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "upstream_request", err.Error())
		return
	}
	upReq.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(upReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		writeError(w, http.StatusBadGateway, "upstream_error",
			fmt.Sprintf("opencode %d: %s", resp.StatusCode, respBody))
		return
	}

	// OpenCode prompt_async returns 204 with no body. The actual message
	// ID will appear via the SSE stream (handled separately). We give
	// callers a synthetic id so they can correlate locally.
	out := gactPostMessageResponse{
		MessageID:  "msg_pending_" + id,
		AcceptedAt: time.Now().UTC(),
	}
	writeJSON(w, http.StatusAccepted, out)
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	q := url.Values{}
	if l := r.URL.Query().Get("limit"); l != "" {
		q.Set("limit", l)
	}
	if before := r.URL.Query().Get("before"); before != "" {
		q.Set("before", before)
	}
	upPath := "/session/" + id + "/message"
	if len(q) > 0 {
		upPath += "?" + q.Encode()
	}
	body, err := s.upstreamGet(upPath)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	var ms []OcMessageWithParts
	if err := json.Unmarshal(body, &ms); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"messages": MessagesToGact(ms),
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
