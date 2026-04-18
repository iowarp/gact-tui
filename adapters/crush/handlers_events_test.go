package crush

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestTranslateCrushEvent_SessionCreated(t *testing.T) {
	raw := []byte(`{"type":"session","payload":{"type":"created","payload":{"id":"ses_a","title":"new"}}}`)
	ev, payload, sid, ok := translateCrushEvent(raw, "")
	if !ok {
		t.Fatal("expected ok")
	}
	if ev != "session.created" {
		t.Errorf("event = %q", ev)
	}
	if sid != "ses_a" {
		t.Errorf("sid = %q", sid)
	}
	sess := payload["session"].(map[string]any)
	if sess["title"] != "new" {
		t.Errorf("payload session = %+v", sess)
	}
}

func TestTranslateCrushEvent_SessionUpdatedWithStatusBecomesStatusChanged(t *testing.T) {
	raw := []byte(`{"type":"session","payload":{"type":"updated","payload":{"id":"ses_a","status":"running"}}}`)
	ev, payload, _, ok := translateCrushEvent(raw, "")
	if !ok {
		t.Fatal("expected ok")
	}
	if ev != "session.status_changed" {
		t.Errorf("event = %q, want session.status_changed", ev)
	}
	if payload["status"] != "running" {
		t.Errorf("status missing: %+v", payload)
	}
}

func TestTranslateCrushEvent_SessionUpdatedWithoutStatusBecomesUpdated(t *testing.T) {
	raw := []byte(`{"type":"session","payload":{"type":"updated","payload":{"id":"ses_a","title":"renamed"}}}`)
	ev, _, _, ok := translateCrushEvent(raw, "")
	if !ok {
		t.Fatal("expected ok")
	}
	if ev != "session.updated" {
		t.Errorf("event = %q, want session.updated", ev)
	}
}

func TestTranslateCrushEvent_MessageCreated(t *testing.T) {
	raw := []byte(`{"type":"message","payload":{"type":"created","payload":{"id":"msg_1","session_id":"ses_a","role":"user"}}}`)
	ev, payload, sid, ok := translateCrushEvent(raw, "")
	if !ok {
		t.Fatal("expected ok")
	}
	if ev != "message.created" || sid != "ses_a" {
		t.Errorf("ev=%q sid=%q", ev, sid)
	}
	msg := payload["message"].(map[string]any)
	if msg["role"] != "user" {
		t.Errorf("message role = %+v", msg)
	}
}

func TestTranslateCrushEvent_PermissionGranted(t *testing.T) {
	raw := []byte(`{"type":"permission_notification","payload":{"type":"created","payload":{"tool_call_id":"tc_1","granted":true,"denied":false}}}`)
	ev, payload, _, ok := translateCrushEvent(raw, "")
	if !ok {
		t.Fatal("expected ok")
	}
	if ev != "permission.resolved" {
		t.Errorf("ev = %q", ev)
	}
	if payload["action"] != "allow" {
		t.Errorf("action = %v", payload["action"])
	}
}

func TestTranslateCrushEvent_PermissionDeniedDefaultsCorrectly(t *testing.T) {
	raw := []byte(`{"type":"permission_notification","payload":{"type":"created","payload":{"tool_call_id":"tc_1","granted":false,"denied":true}}}`)
	_, payload, _, _ := translateCrushEvent(raw, "")
	if payload["action"] != "deny" {
		t.Errorf("action = %v", payload["action"])
	}
}

func TestTranslateCrushEvent_PermissionRequest(t *testing.T) {
	raw := []byte(`{"type":"permission_request","payload":{"type":"created","payload":{"id":"perm_1","session_id":"ses_a","tool_name":"bash"}}}`)
	ev, _, sid, ok := translateCrushEvent(raw, "")
	if !ok {
		t.Fatal("expected ok")
	}
	if ev != "permission.requested" || sid != "ses_a" {
		t.Errorf("ev=%q sid=%q", ev, sid)
	}
}

func TestTranslateCrushEvent_UnknownPayloadTypePassesThrough(t *testing.T) {
	raw := []byte(`{"type":"lsp_event","payload":{"type":"created","payload":{"name":"gopls","state":"ready"}}}`)
	ev, payload, _, ok := translateCrushEvent(raw, "ses_x")
	if !ok {
		t.Fatal("expected ok")
	}
	if ev != "x.crush.lsp_event" {
		t.Errorf("ev = %q", ev)
	}
	if payload["session_id"] != "ses_x" {
		t.Errorf("session_id should fall back to filter context: %+v", payload)
	}
	if payload["crush_lifecycle"] != "created" {
		t.Errorf("lifecycle missing: %+v", payload)
	}
}

func TestTranslateCrushEvent_MalformedJSON(t *testing.T) {
	_, _, _, ok := translateCrushEvent([]byte(`{not json`), "")
	if ok {
		t.Error("expected ok=false on malformed JSON")
	}
}

// fakeCrushSSE emits a fixed sequence of envelopes then closes — used
// to drive the proxy through real net/http (httptest) so we exercise
// the goroutine + context cancellation path the unit tests miss.
func fakeCrushSSE(t *testing.T, lines []string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/v1/workspaces/ws_a/events") {
			http.Error(w, "wrong path "+r.URL.Path, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher := w.(http.Flusher)
		for _, l := range lines {
			fmt.Fprintf(w, "data: %s\n\n", l)
			flusher.Flush()
		}
		// Hold the stream open briefly so the proxy reader has time to
		// drain before the test cancels its context.
		<-r.Context().Done()
	}))
}

// readUntilSSEEvents pulls SSE chunks from r until either every needle
// in needles has appeared in the body or the deadline fires. Returns
// the accumulated body so the test can also assert what *isn't* there.
//
// Reading via the http.Response.Body is the only race-free way to drive
// this proxy in a test — httptest.NewRecorder's bytes.Buffer can't be
// read concurrently with writes, but consuming a real Response.Body
// drives the proxy at the speed of the reader.
func readUntilSSEEvents(t *testing.T, r io.Reader, needles []string, timeout time.Duration) string {
	t.Helper()
	deadline := time.Now().Add(timeout)
	var sb strings.Builder
	buf := make([]byte, 4096)
	remaining := func() map[string]bool {
		m := map[string]bool{}
		body := sb.String()
		for _, n := range needles {
			if !strings.Contains(body, n) {
				m[n] = true
			}
		}
		return m
	}
	for time.Now().Before(deadline) {
		// Use a short read deadline if r supports it.
		if rd, ok := r.(interface{ SetReadDeadline(time.Time) error }); ok {
			_ = rd.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
		}
		n, err := r.Read(buf)
		if n > 0 {
			sb.Write(buf[:n])
		}
		if len(remaining()) == 0 {
			return sb.String()
		}
		if err != nil && err != io.EOF {
			// Network deadline expired — keep polling.
			continue
		}
		if err == io.EOF {
			return sb.String()
		}
	}
	t.Fatalf("timed out waiting for %v; got body=%q", needles, sb.String())
	return ""
}

func TestProxySSE_ForwardsTranslatedEvents(t *testing.T) {
	upstream := fakeCrushSSE(t, []string{
		`{"type":"session","payload":{"type":"created","payload":{"id":"ses_a","title":"first"}}}`,
		`{"type":"message","payload":{"type":"created","payload":{"id":"msg_1","session_id":"ses_a","role":"user"}}}`,
	})
	defer upstream.Close()

	s := New(upstream.URL, "ws_a", nil)
	proxy := httptest.NewServer(s.Handler())
	defer proxy.Close()

	resp, err := http.Get(proxy.URL + "/v1/sessions/ses_a/events")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("proxy status %d", resp.StatusCode)
	}

	body := readUntilSSEEvents(t, resp.Body, []string{"session.created", "message.created"}, 3*time.Second)

	// Every data: line should decode to our envelope shape.
	for _, line := range strings.Split(body, "\n") {
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var env struct {
			Type    string         `json:"type"`
			Payload map[string]any `json:"payload"`
		}
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &env); err != nil {
			t.Errorf("data line not valid JSON envelope: %s (%v)", line, err)
		}
	}
}

func TestProxySSE_FiltersOtherSessionEvents(t *testing.T) {
	upstream := fakeCrushSSE(t, []string{
		// Belongs to a different session — should be dropped.
		`{"type":"message","payload":{"type":"created","payload":{"id":"msg_1","session_id":"ses_other","role":"user"}}}`,
		// Belongs to the requested session.
		`{"type":"message","payload":{"type":"created","payload":{"id":"msg_2","session_id":"ses_a","role":"assistant"}}}`,
	})
	defer upstream.Close()

	s := New(upstream.URL, "ws_a", nil)
	proxy := httptest.NewServer(s.Handler())
	defer proxy.Close()

	resp, err := http.Get(proxy.URL + "/v1/sessions/ses_a/events")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	body := readUntilSSEEvents(t, resp.Body, []string{"msg_2"}, 3*time.Second)
	if strings.Contains(body, "msg_1") {
		t.Errorf("crosstalk: msg_1 from ses_other should have been filtered\nbody=%s", body)
	}
}

func TestSessionEvents_MissingWorkspaceReturns400(t *testing.T) {
	s := New("http://unused", "", nil)
	req := httptest.NewRequest(http.MethodGet, "/v1/sessions/ses_a/events", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status %d, want 400", rec.Code)
	}
}
