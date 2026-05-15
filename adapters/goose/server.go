// Package goose is a GACT v0.1 → Goose HTTP adapter. Goose is a
// Rust agent (https://github.com/block/goose) with an axum-based
// HTTP server (`/sessions`, `/reply`, `/recipes`, etc.). The adapter
// proxies between GACT v0.1 and that surface.
//
// v0.1 scope: read-only health/capabilities/workspaces. Sessions
// list/get + messages POST + SSE wired in subsequent KKKKKKK
// follow-ups so this PR stays bite-sized and the conformance test
// fixture stays small.
package goose

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

const (
	contractVersion = "0.1"
	backendName     = "goose-adapter"
	backendVersion  = "0.1.0"
)

// Server holds adapter state. Construct with New().
type Server struct {
	mux      *http.ServeMux
	upstream string // Goose HTTP base URL
	client   *http.Client
	wsRoot   string // workspace root path advertised to GACT clients
	started  time.Time

	// OOOOOOO1: per-session SSE subscribers. Each turn from
	// upstream /reply pumps events into the matching subscriber
	// list; gact GET /events readers consume them. Keyed by GACT
	// session id (== Goose session id, since the adapter is a
	// pass-through on the session axis).
	mu          sync.Mutex
	subscribers map[string][]chan map[string]any
}

// New builds a Server bound to the given upstream Goose URL.
// wsRoot is the workspace root (defaults to "/" — single synthetic
// workspace per adapter). cli may be nil for the default client.
func New(upstream, wsRoot string, cli *http.Client) *Server {
	if cli == nil {
		cli = &http.Client{Timeout: 30 * time.Second}
	}
	if wsRoot == "" {
		wsRoot = "/"
	}
	abs, err := filepath.Abs(wsRoot)
	if err == nil {
		wsRoot = abs
	}
	s := &Server{
		mux:         http.NewServeMux(),
		upstream:    strings.TrimRight(upstream, "/"),
		client:      cli,
		wsRoot:      wsRoot,
		started:     time.Now(),
		subscribers: make(map[string][]chan map[string]any),
	}
	s.routes()
	return s
}

// Handler returns the http.Handler for embedding.
func (s *Server) Handler() http.Handler { return s.mux }

func (s *Server) routes() {
	s.mux.HandleFunc("GET /v1/health", s.handleHealth)
	s.mux.HandleFunc("GET /v1/capabilities", s.handleCapabilities)
	s.mux.HandleFunc("GET /v1/workspaces", s.handleListWorkspaces)
	s.mux.HandleFunc("GET /v1/workspaces/{id}", s.handleGetWorkspace)
	s.mux.HandleFunc("GET /v1/sessions", s.handleListSessions)
	s.mux.HandleFunc("GET /v1/sessions/{id}", s.handleGetSession)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages", s.handleListMessages)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/{msg_id}", s.handleGetMessage)
	s.mux.HandleFunc("POST /v1/sessions/{id}/messages", s.handlePostMessage)
	s.mux.HandleFunc("GET /v1/sessions/{id}/events", s.handleSessionEvents)
	s.mux.HandleFunc("GET /v1/sessions/{id}/diffs", s.handleListDiffs)
	s.mux.HandleFunc("GET /v1/sessions/{id}/messages/{msg_id}/diffs", s.handleListMessageDiffs)
	s.mux.HandleFunc("GET /v1/tools", s.handleListTools)
	s.mux.HandleFunc("GET /v1/tools/{id}", s.handleGetTool)
	// Catchall 501 so TUI degrades cleanly for unimplemented sections.
	s.mux.HandleFunc("/v1/", s.handleNotImplemented)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	// Probe upstream to confirm Goose is reachable; surface that as
	// our healthy=false rather than lying to the TUI.
	healthy := true
	if _, err := s.upstreamGet("/health"); err != nil {
		healthy = false
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"healthy":  healthy,
		"uptime_s": int(time.Since(s.started).Seconds()),
	})
}

func (s *Server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"contract_version": contractVersion,
		"backend": map[string]any{
			"name":    backendName,
			"version": backendVersion,
		},
		"capabilities": map[string]any{
			// Wired:
			"workspaces": true,
			"sessions":   true,
			// What's coming:
			"messages":           true,
			"sse":                true,
			"tools":              true,
			"files":              false,
			"diffs":              true,
			"providers":          false,
			"agents":             false,
			"commands":           false,
			"metrics":            false,
			"mcp":                false,
			"voice":              false,
			"lsp":                false,
			"hooks":              false,
			"permissions":        false,
			"session_tasks":      false,
			"search_messages":    false,
			"scheduled_sessions": false,
		},
	})
}

func (s *Server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"workspaces": []gact.Workspace{s.workspace()},
	})
}

func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ws := s.workspace()
	if ws.ID != id {
		writeError(w, http.StatusNotFound, "workspace_not_found", "no workspace with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) workspace() gact.Workspace {
	return gact.Workspace{
		ID:        "ws_default",
		Name:      filepath.Base(s.wsRoot),
		RootPath:  s.wsRoot,
		CreatedAt: s.started,
		Metadata: map[string]any{
			"x_goose_upstream": s.upstream,
		},
	}
}

// handleListSessions proxies Goose's `GET /sessions`. Workspace
// scoping is collapsed (one synthetic workspace per adapter
// instance) so the workspace_id query param is accepted but ignored.
func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	body, err := s.upstreamGet("/sessions")
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	var raw gooseSessionList
	if err := json.Unmarshal(body, &raw); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	out := make([]gact.Session, 0, len(raw.Sessions))
	wsID := s.workspace().ID
	for _, gs := range raw.Sessions {
		out = append(out, sessionToGact(gs, wsID))
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": out})
}

// handleGetSession proxies Goose's `GET /sessions/{id}`. Returns 404
// when upstream returns 404 too — the SPEC §6.0 envelope is built
// here so the TUI sees a uniform error shape.
func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	resp, err := s.client.Get(s.upstream + "/sessions/" + id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode == http.StatusNotFound {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	if resp.StatusCode != http.StatusOK {
		writeError(w, http.StatusBadGateway, "upstream_error",
			"upstream returned "+resp.Status)
		return
	}
	var gs gooseSession
	if err := json.Unmarshal(body, &gs); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sessionToGact(gs, s.workspace().ID))
}

// handleListMessages reads the conversation off Goose's
// `GET /sessions/{id}` (which already includes the conversation
// inline) and translates each message to GACT shape.
func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	resp, err := s.client.Get(s.upstream + "/sessions/" + id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if resp.StatusCode == http.StatusNotFound {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	if resp.StatusCode != http.StatusOK {
		writeError(w, http.StatusBadGateway, "upstream_error",
			"upstream returned "+resp.Status)
		return
	}
	var gs gooseSession
	if err := json.Unmarshal(body, &gs); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	out := make([]gact.Message, 0, len(gs.Conversation))
	for i, gm := range gs.Conversation {
		out = append(out, messageToGact(gm, id, i, s.wsRoot))
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": out})
}

// handleListDiffs aggregates every file_diff Part across the
// session's conversation. SPEC §6.10: GET /v1/sessions/{id}/diffs
// returns {diffs: FileDiff[]} of "proposed-but-not-applied" diffs.
// Goose doesn't track applied state in the wire shape, so we emit
// every file_diff with applied=false; the gact TUI's a/r handlers
// will resolve them client-side.
func (s *Server) handleListDiffs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	msgs, err := s.fetchMessages(id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
		return
	}
	if msgs == nil {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	var diffs []gact.Part
	for _, m := range msgs {
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeFileDiff {
				diffs = append(diffs, p)
			}
		}
	}
	if diffs == nil {
		diffs = []gact.Part{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"diffs": diffs})
}

// handleListMessageDiffs is the per-message variant of handleListDiffs.
// Walks the requested message's parts and emits its file_diff Parts.
func (s *Server) handleListMessageDiffs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	mid := r.PathValue("msg_id")
	msgs, err := s.fetchMessages(id)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
		return
	}
	if msgs == nil {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+id)
		return
	}
	for _, m := range msgs {
		if m.ID != mid {
			continue
		}
		var diffs []gact.Part
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeFileDiff {
				diffs = append(diffs, p)
			}
		}
		if diffs == nil {
			diffs = []gact.Part{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"diffs": diffs})
		return
	}
	writeError(w, http.StatusNotFound, "message_not_found", "no message with id "+mid)
}

// fetchMessages reads the session conversation off Goose and projects
// it to GACT messages. Returns (nil, nil) when upstream returns 404
// (session unknown) so callers can map that to their own 404 envelope.
func (s *Server) fetchMessages(sid string) ([]gact.Message, error) {
	resp, err := s.client.Get(s.upstream + "/sessions/" + sid)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream %s", resp.Status)
	}
	var gs gooseSession
	if err := json.Unmarshal(body, &gs); err != nil {
		return nil, err
	}
	out := make([]gact.Message, 0, len(gs.Conversation))
	for i, gm := range gs.Conversation {
		out = append(out, messageToGact(gm, sid, i, s.wsRoot))
	}
	return out, nil
}

// handleListTools serves /v1/tools by proxying Goose's
// /agent/tools?session_id=X. Tools are session-scoped in Goose;
// we pick the first session from /sessions when no session_id is
// passed in. Returns an empty envelope (rather than 5xx) when no
// session exists yet — the conformance suite + TUI both handle
// empty cleanly.
func (s *Server) handleListTools(w http.ResponseWriter, r *http.Request) {
	sid := r.URL.Query().Get("session_id")
	if sid == "" {
		sid = s.firstSessionID()
	}
	tools, err := s.fetchTools(sid)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
		return
	}
	out := make([]map[string]any, 0, len(tools))
	for _, t := range tools {
		out = append(out, toolToGact(t))
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": out})
}

func (s *Server) handleGetTool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sid := r.URL.Query().Get("session_id")
	if sid == "" {
		sid = s.firstSessionID()
	}
	tools, err := s.fetchTools(sid)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_error", err.Error())
		return
	}
	for _, t := range tools {
		if t.Name == id {
			writeJSON(w, http.StatusOK, toolToGact(t))
			return
		}
	}
	writeError(w, http.StatusNotFound, "tool_not_found", "no tool with id "+id)
}

// firstSessionID returns the first session id from /sessions, or
// empty when none exist / upstream is unreachable. Used as a
// fallback when callers don't pass session_id.
func (s *Server) firstSessionID() string {
	body, err := s.upstreamGet("/sessions")
	if err != nil {
		return ""
	}
	var raw gooseSessionList
	if err := json.Unmarshal(body, &raw); err != nil {
		return ""
	}
	if len(raw.Sessions) == 0 {
		return ""
	}
	return raw.Sessions[0].ID
}

// fetchTools hits Goose's /agent/tools for the given session. Empty
// session id returns an empty list rather than calling upstream
// (Goose's handler requires session_id).
func (s *Server) fetchTools(sid string) ([]gooseTool, error) {
	if sid == "" {
		return nil, nil
	}
	body, err := s.upstreamGet("/agent/tools?session_id=" + sid)
	if err != nil {
		return nil, err
	}
	var tools []gooseTool
	if err := json.Unmarshal(body, &tools); err != nil {
		return nil, err
	}
	return tools, nil
}

// handleGetMessage walks the same conversation array
// handleListMessages does and returns the matching message by id.
// Not the most efficient (we refetch the whole session) but the
// adapter is read-only and the data is small.
func (s *Server) handleGetMessage(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	mid := r.PathValue("msg_id")
	resp, err := s.client.Get(s.upstream + "/sessions/" + sid)
	if err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if resp.StatusCode == http.StatusNotFound {
		writeError(w, http.StatusNotFound, "session_not_found", "no session with id "+sid)
		return
	}
	if resp.StatusCode != http.StatusOK {
		writeError(w, http.StatusBadGateway, "upstream_error",
			"upstream returned "+resp.Status)
		return
	}
	var gs gooseSession
	if err := json.Unmarshal(body, &gs); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_invalid", err.Error())
		return
	}
	for i, gm := range gs.Conversation {
		m := messageToGact(gm, sid, i, s.wsRoot)
		if m.ID == mid {
			writeJSON(w, http.StatusOK, m)
			return
		}
	}
	writeError(w, http.StatusNotFound, "message_not_found", "no message with id "+mid)
}

// OOOOOOO1: postMessageRequest mirrors the GACT POST body shape.
// Only the parts the upstream consumes are decoded.
type postMessageRequest struct {
	Parts []postPart `json:"parts"`
}

type postPart struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

// handlePostMessage accepts a GACT POST, translates the parts into a
// Goose ChatRequest, fires POST /reply on upstream in a background
// goroutine, and returns 202 immediately. The goroutine pumps the
// upstream SSE response into per-session subscribers (handleSessionEvents
// reads them).
func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	var req postMessageRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", err.Error())
		return
	}
	text := extractText(req.Parts)
	if text == "" {
		writeError(w, http.StatusBadRequest, "empty_message",
			"need at least one text part")
		return
	}

	// Fire the upstream POST in a goroutine; the goroutine pumps
	// SSE events into subscribers.
	msgID := "msg_" + sid + "_" + time.Now().UTC().Format("150405.000")
	go s.runUpstreamReply(sid, text)

	writeJSON(w, http.StatusAccepted, map[string]any{
		"message_id":  msgID,
		"accepted_at": time.Now().UTC().Format(time.RFC3339),
	})
}

func extractText(parts []postPart) string {
	var out []string
	for _, p := range parts {
		if p.Type == "text" && p.Text != "" {
			out = append(out, p.Text)
		}
	}
	return strings.Join(out, "")
}

// runUpstreamReply POSTs to Goose's /reply with a synthesized
// ChatRequest, then reads the SSE response line-by-line. Each
// MessageEvent variant is translated to a GACT event and broadcast
// to the session's subscribers.
func (s *Server) runUpstreamReply(sid, text string) {
	chatReq := map[string]any{
		"user_message": map[string]any{
			"role":    "User",
			"created": time.Now().Unix(),
			"content": []map[string]any{
				{"type": "text", "text": text},
			},
		},
		"session_id": sid,
	}
	payload, _ := json.Marshal(chatReq)

	// Mark session running.
	s.broadcast(sid, eventEnvelope("session.status_changed", map[string]any{
		"session_id":  sid,
		"status":      gact.StatusRunning,
		"prev_status": gact.StatusIdle,
	}))

	resp, err := s.client.Post(s.upstream+"/reply",
		"application/json", bytes.NewReader(payload))
	if err != nil {
		s.broadcast(sid, eventEnvelope("session.status_changed", map[string]any{
			"session_id":  sid,
			"status":      "error",
			"prev_status": "running",
			"error":       err.Error(),
		}))
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
		s.broadcast(sid, eventEnvelope("session.status_changed", map[string]any{
			"session_id":  sid,
			"status":      "error",
			"prev_status": "running",
			"error":       fmt.Sprintf("upstream %d: %s", resp.StatusCode, body),
		}))
		return
	}

	// Read SSE line-by-line. Goose emits LF-only "data: {...}\n\n"
	// frames per the source we audited.
	rd := bufio.NewReaderSize(resp.Body, 64<<10)
	for {
		line, err := rd.ReadString('\n')
		if line != "" {
			line = strings.TrimRight(line, "\r\n")
			if strings.HasPrefix(line, "data: ") {
				rawJSON := []byte(strings.TrimPrefix(line, "data: "))
				var ev map[string]any
				if jErr := json.Unmarshal(rawJSON, &ev); jErr == nil {
					for _, gactEv := range translateMessageEvent(ev, sid, s.wsRoot) {
						s.broadcast(sid, gactEv)
					}
				}
			}
		}
		if err != nil {
			break
		}
	}

	s.broadcast(sid, eventEnvelope("session.status_changed", map[string]any{
		"session_id":  sid,
		"status":      gact.StatusIdle,
		"prev_status": gact.StatusRunning,
	}))
}

// handleSessionEvents writes SSE for the GACT TUI. Subscribes to
// the session's broadcast channel and writes each event as a
// SPEC §7.2 envelope (event:, id:, data:).
func (s *Server) handleSessionEvents(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	ch := make(chan map[string]any, 64)
	s.mu.Lock()
	s.subscribers[sid] = append(s.subscribers[sid], ch)
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		subs := s.subscribers[sid]
		for i, c := range subs {
			if c == ch {
				s.subscribers[sid] = append(subs[:i], subs[i+1:]...)
				break
			}
		}
		s.mu.Unlock()
		close(ch)
	}()

	// Greet with server.connected so clients know the stream is live.
	writeSSE(w, "server.connected", map[string]any{
		"session_id": sid,
	})
	flusher.Flush()

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeat.C:
			writeSSE(w, "server.heartbeat", map[string]any{})
			flusher.Flush()
		case ev, ok := <-ch:
			if !ok {
				return
			}
			t, _ := ev["type"].(string)
			pl, _ := ev["payload"].(map[string]any)
			writeSSE(w, t, pl)
			flusher.Flush()
		}
	}
}

// writeSSE emits a SPEC §7.2 event envelope (event:, id:, data:).
func writeSSE(w io.Writer, eventType string, payload map[string]any) {
	if eventType == "" {
		eventType = "message"
	}
	body := map[string]any{
		"type":        eventType,
		"occurred_at": time.Now().UTC().Format(time.RFC3339),
		"payload":     payload,
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return
	}
	id := time.Now().UnixNano()
	fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", id, eventType, buf)
}

// eventEnvelope wraps a payload in our internal queue shape. The
// SSE writer unwraps it back into the SPEC envelope on emit.
func eventEnvelope(eventType string, payload map[string]any) map[string]any {
	return map[string]any{"type": eventType, "payload": payload}
}

// broadcast pushes an event to every subscriber on this session.
// Non-blocking — subscribers that fall behind drop events rather
// than backpressure the producer.
func (s *Server) broadcast(sid string, ev map[string]any) {
	s.mu.Lock()
	subs := append([]chan map[string]any(nil), s.subscribers[sid]...)
	s.mu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- ev:
		default:
			// subscriber backed up — drop
		}
	}
}

func (s *Server) handleNotImplemented(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not_implemented",
		"endpoint "+r.Method+" "+r.URL.Path+" not yet wired in goose adapter")
}

// upstreamGet hits the Goose HTTP server. Returns the body bytes.
func (s *Server) upstreamGet(path string) ([]byte, error) {
	resp, err := s.client.Get(s.upstream + path)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(io.LimitReader(resp.Body, 4<<20))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		panic(err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}
