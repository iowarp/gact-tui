package goose

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// mockGoose returns a test server that pretends to be a Goose
// upstream. /health, /sessions, and /sessions/{id} wired with
// canned bodies the adapter knows how to translate.
func mockGoose(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"healthy":true}`))
	})
	// Two sessions in the canned list — exercises the loop.
	mux.HandleFunc("GET /sessions", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"sessions": [
				{"id":"s1","name":"first","working_dir":"/repos/x","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T01:00:00Z"},
				{"id":"s2","name":"second","working_dir":"/repos/y","created_at":"2026-01-02T00:00:00Z","updated_at":"2026-01-02T01:00:00Z"}
			]
		}`))
	})
	mux.HandleFunc("GET /sessions/s1", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// MMMMMMM1: conversation included so /v1/sessions/{id}/messages
		// has something to translate. Two text turns + one tool
		// request/response pair so each branch of contentToGactPart
		// gets exercised.
		_, _ = w.Write([]byte(`{
			"id":"s1","name":"first","working_dir":"/repos/x",
			"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T01:00:00Z",
			"conversation":[
				{"role":"User","created":1735689600,"content":[{"type":"text","text":"hi"}]},
				{"role":"Assistant","created":1735689601,"content":[
					{"type":"text","text":"running ls"},
					{"type":"toolRequest","id":"tr1","name":"shell","arguments":{"command":"ls"}}
				]},
				{"role":"User","created":1735689602,"content":[
					{"type":"toolResponse","id":"tr1","tool_result":{"Ok":[{"type":"text","text":"file1\nfile2"}]}}
				]}
			]
		}`))
	})
	mux.HandleFunc("GET /sessions/missing", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestHealth(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var got struct {
		Healthy bool `json:"healthy"`
		UptimeS int  `json:"uptime_s"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !got.Healthy {
		t.Error("healthy=false but mock returned 200")
	}
}

func TestHealthFalseWhenUpstreamDown(t *testing.T) {
	// Don't start an upstream — adapter should report healthy=false
	srv := httptest.NewServer(New("http://127.0.0.1:1", "", nil).Handler())
	defer srv.Close()
	resp, err := http.Get(srv.URL + "/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	var got struct {
		Healthy bool `json:"healthy"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Healthy {
		t.Error("healthy=true but upstream is down")
	}
}

func TestCapabilities(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()
	resp, err := http.Get(srv.URL + "/v1/capabilities")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	var got struct {
		ContractVersion string         `json:"contract_version"`
		Backend         map[string]any `json:"backend"`
		Capabilities    map[string]any `json:"capabilities"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v body=%s", err, body)
	}
	if got.ContractVersion != "0.1" {
		t.Errorf("contract_version=%q", got.ContractVersion)
	}
	if got.Backend["name"] != "goose-adapter" {
		t.Errorf("backend name=%v", got.Backend["name"])
	}
	if got.Capabilities["workspaces"] != true {
		t.Errorf("workspaces should be true")
	}
}

func TestWorkspaceListAndGet(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, t.TempDir(), nil).Handler())
	defer srv.Close()

	r, _ := http.Get(srv.URL + "/v1/workspaces")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("list status %d body %s", r.StatusCode, body)
	}
	var listed struct {
		Workspaces []map[string]any `json:"workspaces"`
	}
	if err := json.Unmarshal(body, &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed.Workspaces) != 1 {
		t.Fatalf("want 1 workspace, got %d", len(listed.Workspaces))
	}
	wsID, _ := listed.Workspaces[0]["id"].(string)
	if wsID != "ws_default" {
		t.Errorf("workspace id=%q", wsID)
	}

	r2, _ := http.Get(srv.URL + "/v1/workspaces/" + wsID)
	body2, _ := io.ReadAll(r2.Body)
	r2.Body.Close()
	if r2.StatusCode != 200 {
		t.Fatalf("get status %d body %s", r2.StatusCode, body2)
	}
	if !strings.Contains(string(body2), wsID) {
		t.Errorf("get body missing id: %s", body2)
	}

	r3, _ := http.Get(srv.URL + "/v1/workspaces/ws_nope")
	r3.Body.Close()
	if r3.StatusCode != 404 {
		t.Errorf("bad-ws status %d want 404", r3.StatusCode)
	}
}

func TestSessionsListProxiesAndTranslates(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()

	r, _ := http.Get(srv.URL + "/v1/sessions")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("status %d body %s", r.StatusCode, body)
	}
	var got struct {
		Sessions []map[string]any `json:"sessions"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Sessions) != 2 {
		t.Fatalf("want 2 sessions, got %d", len(got.Sessions))
	}
	first := got.Sessions[0]
	if first["id"] != "s1" {
		t.Errorf("first.id=%v", first["id"])
	}
	if first["title"] != "first" {
		t.Errorf("first.title=%v (expect Goose name → GACT title)", first["title"])
	}
	if first["status"] != "idle" {
		t.Errorf("first.status=%v (expect synthesized idle)", first["status"])
	}
	meta, _ := first["metadata"].(map[string]any)
	if meta["x_goose_working_dir"] != "/repos/x" {
		t.Errorf("metadata.x_goose_working_dir=%v", meta["x_goose_working_dir"])
	}
}

func TestSessionGetEchoesUpstreamShape(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()

	r, _ := http.Get(srv.URL + "/v1/sessions/s1")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("status %d body %s", r.StatusCode, body)
	}
	var got map[string]any
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if got["id"] != "s1" {
		t.Errorf("id=%v", got["id"])
	}
	if got["title"] != "first" {
		t.Errorf("title=%v", got["title"])
	}
}

func TestSessionGet404PropagatesAsSpecError(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()

	r, _ := http.Get(srv.URL + "/v1/sessions/missing")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 404 {
		t.Errorf("status %d want 404", r.StatusCode)
	}
	if !strings.Contains(string(body), `"session_not_found"`) {
		t.Errorf("body missing spec envelope code: %s", body)
	}
}

func TestMessagesListProjectsConversation(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()

	r, _ := http.Get(srv.URL + "/v1/sessions/s1/messages")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("status %d body %s", r.StatusCode, body)
	}
	var got struct {
		Messages []map[string]any `json:"messages"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Messages) != 3 {
		t.Fatalf("want 3 messages, got %d", len(got.Messages))
	}

	// First message: user "hi"
	m0 := got.Messages[0]
	if m0["role"] != "user" {
		t.Errorf("m0.role=%v want user", m0["role"])
	}
	parts0, _ := m0["parts"].([]any)
	if len(parts0) != 1 {
		t.Fatalf("m0 want 1 part, got %d", len(parts0))
	}
	p00, _ := parts0[0].(map[string]any)
	if p00["type"] != "text" || p00["text"] != "hi" {
		t.Errorf("m0.parts[0]=%v", p00)
	}

	// Second: assistant text + tool_call
	m1 := got.Messages[1]
	if m1["role"] != "assistant" {
		t.Errorf("m1.role=%v", m1["role"])
	}
	parts1, _ := m1["parts"].([]any)
	if len(parts1) != 2 {
		t.Fatalf("m1 want 2 parts, got %d", len(parts1))
	}
	p11, _ := parts1[1].(map[string]any)
	if p11["type"] != "tool_call" {
		t.Errorf("m1.parts[1].type=%v want tool_call", p11["type"])
	}
	if p11["call_id"] != "tr1" {
		t.Errorf("m1.parts[1].call_id=%v", p11["call_id"])
	}
	if p11["tool_name"] != "shell" {
		t.Errorf("m1.parts[1].tool_name=%v", p11["tool_name"])
	}

	// Third: user tool_result with embedded text
	m2 := got.Messages[2]
	parts2, _ := m2["parts"].([]any)
	p20, _ := parts2[0].(map[string]any)
	if p20["type"] != "tool_result" {
		t.Errorf("m2.parts[0].type=%v want tool_result", p20["type"])
	}
	if p20["call_id"] != "tr1" {
		t.Errorf("m2.parts[0].call_id=%v", p20["call_id"])
	}
}

func TestMessagesList404OnUnknownSession(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()
	r, _ := http.Get(srv.URL + "/v1/sessions/missing/messages")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 404 {
		t.Errorf("status %d want 404", r.StatusCode)
	}
	if !strings.Contains(string(body), `"session_not_found"`) {
		t.Errorf("body missing spec envelope: %s", body)
	}
}

// mockGooseWithReply extends mockGoose with a /reply endpoint that
// emits a canned SSE stream covering the Message → Finish path.
func mockGooseWithReply(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"healthy":true}`))
	})
	mux.HandleFunc("POST /reply", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		fl := w.(http.Flusher)
		// Two events: an assistant Message + Finish. Mirrors what
		// a typical short Goose turn would emit.
		_, _ = w.Write([]byte("data: " + `{"type":"Message","message":{"role":"Assistant","created":1735689700,"content":[{"type":"text","text":"hi back"}]},"token_state":{}}` + "\n\n"))
		fl.Flush()
		_, _ = w.Write([]byte("data: " + `{"type":"Finish","reason":"end_turn","token_state":{}}` + "\n\n"))
		fl.Flush()
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// TestPostMessageStreamsViaSSE drives the full POST /messages →
// upstream /reply → SSE fan-out path.
func TestPostMessageStreamsViaSSE(t *testing.T) {
	upstream := mockGooseWithReply(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	// Close client connections explicitly so the SSE goroutine
	// (which holds the TCP conn open as long as it can read)
	// doesn't block srv.Close.
	defer func() {
		srv.CloseClientConnections()
		srv.Close()
	}()

	type ev struct {
		Type    string         `json:"type"`
		Payload map[string]any `json:"payload"`
	}
	streamCh := make(chan ev, 16)
	streamReady := make(chan struct{})
	streamCtx, cancelStream := context.WithCancel(context.Background())
	defer cancelStream()
	go func() {
		defer close(streamCh)
		req, _ := http.NewRequestWithContext(streamCtx, "GET", srv.URL+"/v1/sessions/sX/events", nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return
		}
		defer resp.Body.Close()
		close(streamReady)
		var dataBuf strings.Builder
		buf := make([]byte, 4096)
		for {
			n, err := resp.Body.Read(buf)
			if n > 0 {
				dataBuf.Write(buf[:n])
				blob := dataBuf.String()
				for {
					idx := strings.Index(blob, "\n\n")
					if idx < 0 {
						break
					}
					block := blob[:idx]
					blob = blob[idx+2:]
					var evType, dataLine string
					for _, ln := range strings.Split(block, "\n") {
						if strings.HasPrefix(ln, "event: ") {
							evType = strings.TrimPrefix(ln, "event: ")
						}
						if strings.HasPrefix(ln, "data: ") {
							dataLine = strings.TrimPrefix(ln, "data: ")
						}
					}
					if dataLine == "" {
						continue
					}
					var raw map[string]any
					if jErr := json.Unmarshal([]byte(dataLine), &raw); jErr == nil {
						pl, _ := raw["payload"].(map[string]any)
						select {
						case streamCh <- ev{Type: evType, Payload: pl}:
						case <-streamCtx.Done():
							return
						}
					}
				}
				dataBuf.Reset()
				dataBuf.WriteString(blob)
			}
			if err != nil {
				return
			}
		}
	}()
	<-streamReady
	time.Sleep(100 * time.Millisecond)

	postBody := strings.NewReader(`{"parts":[{"type":"text","text":"hi"}]}`)
	r, err := http.Post(srv.URL+"/v1/sessions/sX/messages",
		"application/json", postBody)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != http.StatusAccepted {
		t.Fatalf("post status %d body %s", r.StatusCode, body)
	}

	deadline := time.After(5 * time.Second)
	saw := map[string]bool{}
	var lastStatus string
loop:
	for {
		select {
		case e, ok := <-streamCh:
			if !ok {
				break loop
			}
			saw[e.Type] = true
			if e.Type == "session.status_changed" {
				lastStatus, _ = e.Payload["status"].(string)
			}
			if saw["message.created"] && lastStatus == "idle" {
				break loop
			}
		case <-deadline:
			t.Fatalf("timed out; saw=%v lastStatus=%q", saw, lastStatus)
		}
	}
	if !saw["server.connected"] {
		t.Errorf("missing server.connected handshake")
	}
	if !saw["message.created"] {
		t.Errorf("missing message.created")
	}
	if lastStatus != "idle" {
		t.Errorf("last status %q want idle", lastStatus)
	}
}

func TestPostMessageRejectsEmptyParts(t *testing.T) {
	upstream := mockGooseWithReply(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()
	r, _ := http.Post(srv.URL+"/v1/sessions/sX/messages",
		"application/json", strings.NewReader(`{"parts":[]}`))
	if r.StatusCode != http.StatusBadRequest {
		t.Errorf("status %d want 400", r.StatusCode)
	}
}

// TestMessagesListEmitsFileDiffSibling exercises the QQQQQQQ1
// integration path: a Goose conversation containing a
// developer__text_editor str_replace tool call should produce both
// a tool_call Part AND a sibling file_diff Part in the GACT message
// list, with before/after computed from the on-disk fixture.
func TestMessagesListEmitsFileDiffSibling(t *testing.T) {
	tmp := t.TempDir()
	if err := os.WriteFile(tmp+"/main.py", []byte("hello world\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"healthy":true}`))
	})
	mux.HandleFunc("GET /sessions/sFD", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id":"sFD","name":"diff","working_dir":"` + tmp + `",
			"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T01:00:00Z",
			"conversation":[
				{"role":"Assistant","created":1735689700,"content":[
					{"type":"toolRequest","id":"trX","name":"developer__text_editor","arguments":{
						"command":"str_replace","path":"main.py",
						"old_str":"hello","new_str":"GACT"
					}}
				]}
			]
		}`))
	})
	upstream := httptest.NewServer(mux)
	defer upstream.Close()

	srv := httptest.NewServer(New(upstream.URL, tmp, nil).Handler())
	defer srv.Close()

	r, _ := http.Get(srv.URL + "/v1/sessions/sFD/messages")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("status %d body %s", r.StatusCode, body)
	}
	var got struct {
		Messages []map[string]any `json:"messages"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Messages) != 1 {
		t.Fatalf("want 1 message, got %d", len(got.Messages))
	}
	parts, _ := got.Messages[0]["parts"].([]any)
	if len(parts) != 2 {
		t.Fatalf("want 2 parts (tool_call + file_diff), got %d", len(parts))
	}
	p1, _ := parts[1].(map[string]any)
	if p1["type"] != "file_diff" {
		t.Fatalf("parts[1].type=%v want file_diff", p1["type"])
	}
	if p1["path"] != "main.py" {
		t.Errorf("file_diff path=%v", p1["path"])
	}
	if before, _ := p1["before"].(string); before != "hello world\n" {
		t.Errorf("file_diff before=%q", before)
	}
	if after, _ := p1["after"].(string); after != "GACT world\n" {
		t.Errorf("file_diff after=%q", after)
	}
	if p1["language"] != "python" {
		t.Errorf("file_diff language=%v", p1["language"])
	}
}

// TestDiffsListAggregatesAcrossMessages: GET /v1/sessions/{id}/diffs
// walks every message and pulls out file_diff Parts.
func TestDiffsListAggregatesAcrossMessages(t *testing.T) {
	tmp := t.TempDir()
	_ = os.WriteFile(tmp+"/a.txt", []byte("alpha\n"), 0o644)
	_ = os.WriteFile(tmp+"/b.txt", []byte("beta\n"), 0o644)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /sessions/sAGG", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id":"sAGG","name":"agg","working_dir":"` + tmp + `",
			"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T01:00:00Z",
			"conversation":[
				{"role":"Assistant","created":1,"content":[
					{"type":"toolRequest","id":"a","name":"developer__text_editor","arguments":{
						"command":"str_replace","path":"a.txt","old_str":"alpha","new_str":"AAA"}}
				]},
				{"role":"Assistant","created":2,"content":[
					{"type":"toolRequest","id":"b","name":"developer__text_editor","arguments":{
						"command":"str_replace","path":"b.txt","old_str":"beta","new_str":"BBB"}}
				]}
			]
		}`))
	})
	upstream := httptest.NewServer(mux)
	defer upstream.Close()
	srv := httptest.NewServer(New(upstream.URL, tmp, nil).Handler())
	defer srv.Close()

	r, _ := http.Get(srv.URL + "/v1/sessions/sAGG/diffs")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != 200 {
		t.Fatalf("status %d body %s", r.StatusCode, body)
	}
	var got struct {
		Diffs []map[string]any `json:"diffs"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Diffs) != 2 {
		t.Fatalf("want 2 diffs, got %d", len(got.Diffs))
	}
	paths := []string{got.Diffs[0]["path"].(string), got.Diffs[1]["path"].(string)}
	if !(paths[0] == "a.txt" && paths[1] == "b.txt") {
		t.Errorf("diff paths=%v", paths)
	}
}

func TestNotImplementedReturns501(t *testing.T) {
	upstream := mockGoose(t)
	srv := httptest.NewServer(New(upstream.URL, "", nil).Handler())
	defer srv.Close()
	// /v1/tools isn't wired yet — should hit the catchall.
	r, _ := http.Get(srv.URL + "/v1/tools")
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	if r.StatusCode != http.StatusNotImplemented {
		t.Errorf("status %d want 501", r.StatusCode)
	}
	if !strings.Contains(string(body), `"error"`) {
		t.Errorf("body missing error envelope: %s", body)
	}
}
