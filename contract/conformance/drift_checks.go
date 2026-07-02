package conformance

// CLIO-232: drift-class checks. Each function asserts one of the
// contract-vs-implementation drift classes that actually bit a client
// during the #232 reconciliation (SPEC §15.8):
//
//   1. capability↔route truth — every advertised single-route
//      capability has its route registered (§3.3: "flag false ⇒
//      404/501" now holds in BOTH directions).
//   2. SSE Last-Event-ID replay returns real events (heartbeats are
//      transient and must not evict history — §7.1).
//   3. message.created payloads are the FLAT wire Message, not
//      {message: Message} (§7.3a).
//   4. session.updated carries the full Session object (§7.3a).
//   5. the undo/rewind rollback envelope (§6.2 — `reverted_messages`
//      never existed on the reconciled wire).
//   6. POST /compact accepts a {focus} body (§6.25).
//
// Mutating checks (PATCH title, rollback, compact) run only when the
// suite created the session itself — Run() gates them on
// opts.SessionID == "" so a caller-pinned session is never touched.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// --- 1. capability↔route truth ----------------------------------------------

// capRouteProbe maps a single-route capability flag to a cheap,
// non-destructive probe request for its route. A probe "passes" for
// any status except 404/501 — a 4xx/5xx from a *registered* route
// (validation, readiness) still proves the flag is truthful.
type capRouteProbe struct {
	flag   string
	method string
	path   string // {sid} is substituted
}

var capRouteProbes = []capRouteProbe{
	// The two flags that were over-claimed pre-Phase-0 (clio #760):
	{"session_summary", http.MethodPost, "/v1/sessions/{sid}/summarize"},
	{"attachments_upload", http.MethodPost, "/v1/sessions/{sid}/attachments"},
	// Cheap read probes for the other single-route flags:
	{"session_export", http.MethodGet, "/v1/sessions/{sid}/export"},
	{"search_messages", http.MethodGet, "/v1/sessions/{sid}/messages/search?q=conformance"},
	{"scheduled_sessions", http.MethodGet, "/v1/sessions/{sid}/schedules"},
	{"session_tasks", http.MethodGet, "/v1/sessions/{sid}/tasks"},
	{"hooks", http.MethodGet, "/v1/hooks"},
	{"metrics", http.MethodGet, "/v1/metrics"},
	{"memory", http.MethodGet, "/v1/memory/stats"},
}

// checkCapabilityTruth asserts SPEC §3.3's bidirectional rule for the
// probeable single-route flags: advertised true ⇒ the route must not
// return 404/501. (false ⇒ 404/501 is already the suite-wide gating
// convention.) This is the check that would have caught the
// session_summary / attachments_upload over-claim (§15.2 history).
func checkCapabilityTruth(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	_, capsBody, err := c.get(ctx, "/v1/capabilities")
	if err != nil {
		t.Fatalf("GET /v1/capabilities: %v", err)
	}
	var raw struct {
		Capabilities map[string]any `json:"capabilities"`
	}
	if err := json.Unmarshal(capsBody, &raw); err != nil {
		t.Fatalf("capabilities decode: %v (body=%s)", err, truncForLog(capsBody))
	}

	for _, p := range capRouteProbes {
		claimed, ok := raw.Capabilities[p.flag].(bool)
		if !ok || !claimed {
			continue // absent or false — nothing to prove here
		}
		path := strings.ReplaceAll(p.path, "{sid}", sid)
		status, err := probeStatus(c, p.method, path)
		if err != nil {
			t.Errorf("capability %q probe %s %s: %v", p.flag, p.method, path, err)
			continue
		}
		if status == http.StatusNotFound || status == http.StatusNotImplemented {
			t.Errorf("capability %q is advertised true but %s %s returned %d — SPEC §3.3 requires the flag map to be truthful in both directions",
				p.flag, p.method, path, status)
		}
	}
}

func probeStatus(c *conformClient, method, path string) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	var body io.Reader
	if method != http.MethodGet {
		body = bytes.NewReader([]byte(`{}`))
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return 0, err
	}
	if method != http.MethodGet {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, err
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
	resp.Body.Close()
	return resp.StatusCode, nil
}

// --- 2–4. SSE replay + event payload shapes ----------------------------------

// driftEvent is one parsed SSE event (envelope per SPEC §7.2).
type driftEvent struct {
	Type    string
	Payload map[string]any
	Raw     string
}

// isPreambleOrHeartbeat reports whether the event is connection
// plumbing rather than replayed/live history.
func isPreambleOrHeartbeat(typ string) bool {
	switch typ {
	case "server.connected", "session.snapshot", "server.heartbeat":
		return true
	}
	return false
}

// collectSSEEvents connects to the session stream with the given
// Last-Event-ID and parses complete events until the budget elapses
// (or the server closes the stream). Best-effort: returns whatever
// was parsed plus a connection-level error, if any.
func collectSSEEvents(c *conformClient, sid, lastEventID string, budget time.Duration) ([]driftEvent, error) {
	ctx, cancel := context.WithTimeout(context.Background(), budget)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/v1/sessions/"+sid+"/events", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/event-stream")
	if lastEventID != "" {
		req.Header.Set("Last-Event-ID", lastEventID)
	}
	streamClient := &http.Client{Timeout: 0}
	resp, err := streamClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		buf, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("SSE status %d body %s", resp.StatusCode, buf)
	}

	var events []driftEvent
	var pending bytes.Buffer
	buf := make([]byte, 4096)
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			pending.Write(buf[:n])
			for {
				raw := pending.Bytes()
				idx := bytes.Index(raw, []byte("\n\n"))
				if idx < 0 {
					break
				}
				block := string(raw[:idx])
				pending.Next(idx + 2)
				if ev, ok := parseDriftEvent(block); ok {
					events = append(events, ev)
				}
			}
		}
		if rerr != nil {
			// io.EOF = server closed; anything else is almost always
			// the context deadline cancelling the body read. Either
			// way the budget is spent — return what we have.
			return events, nil
		}
	}
}

func parseDriftEvent(block string) (driftEvent, bool) {
	var dataLine string
	for _, line := range strings.Split(block, "\n") {
		if strings.HasPrefix(line, "data:") {
			dataLine = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		}
	}
	if dataLine == "" {
		return driftEvent{}, false
	}
	var envelope struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal([]byte(dataLine), &envelope); err != nil || envelope.Type == "" {
		return driftEvent{}, false
	}
	ev := driftEvent{Type: envelope.Type, Raw: dataLine}
	// Payload may be a non-object for some vendor events; tolerate.
	_ = json.Unmarshal(envelope.Payload, &ev.Payload)
	return ev, true
}

// checkSSEDrift covers three drift classes on one stream read:
//
//   - Last-Event-ID replay must return the session's real history
//     (SPEC §7.1): after a turn was posted, reconnecting with
//     Last-Event-ID: 0 must yield ≥1 non-preamble, non-heartbeat
//     event. Heartbeats are transient and MUST NOT have evicted the
//     turn's events from the replay window (the clio #761 failure
//     mode this locks out).
//   - message.created payloads are FLAT wire Messages (SPEC §7.3a) —
//     top-level id/role, never nested under a `message` key.
//   - session.updated (when observed after the PATCH below) carries
//     the full Session object — top-level id echoing the session
//     (SPEC §7.3a). Emission on PATCH is backend-specific, so shape
//     is asserted only when the event shows up.
//
// The caller guarantees the suite owns the session (a title PATCH is
// a mutation).
func checkSSEDrift(t Reporter, c *conformClient, sid string, budget time.Duration) {
	t.Helper()

	// PATCH the title so backends that publish session.updated have
	// one in history before we connect. Best-effort — a backend
	// without PATCH support still runs the replay assertions.
	patchSessionTitle(c, sid, "conformance drift probe")

	events, err := collectSSEEvents(c, sid, "0", budget)
	if err != nil {
		t.Fatalf("SSE drift stream: %v", err)
	}

	var real, created, updated []driftEvent
	for _, ev := range events {
		if isPreambleOrHeartbeat(ev.Type) {
			continue
		}
		real = append(real, ev)
		switch ev.Type {
		case "message.created":
			created = append(created, ev)
		case "session.updated":
			updated = append(updated, ev)
		}
	}

	if len(real) == 0 {
		t.Errorf("Last-Event-ID: 0 replay returned no real events within %s — SPEC §7.1 requires replay of buffered history (heartbeats are transient and must not evict it)", budget)
		return
	}
	if len(created) == 0 {
		t.Errorf("replay returned %d real events but no message.created — a session with a posted message must replay its turn events (SPEC §7.1)", len(real))
	}
	for i, ev := range created {
		id, _ := ev.Payload["id"].(string)
		role, _ := ev.Payload["role"].(string)
		if _, nested := ev.Payload["message"]; nested && id == "" {
			t.Errorf("message.created[%d] payload nests the message under a `message` key — SPEC §7.3a codifies the FLAT wire Message payload: %s", i, truncForLog([]byte(ev.Raw)))
			continue
		}
		if id == "" {
			t.Errorf("message.created[%d] payload missing top-level id (flat wire Message per SPEC §7.3a): %s", i, truncForLog([]byte(ev.Raw)))
		}
		if role == "" {
			t.Errorf("message.created[%d] payload missing top-level role (flat wire Message per SPEC §7.3a): %s", i, truncForLog([]byte(ev.Raw)))
		}
	}
	for i, ev := range updated {
		id, _ := ev.Payload["id"].(string)
		if id != sid {
			t.Errorf("session.updated[%d] payload.id = %q, want the full Session object echoing %q (SPEC §7.3a)", i, id, sid)
		}
	}
}

func patchSessionTitle(c *conformClient, sid, title string) {
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch,
		c.baseURL+"/v1/sessions/"+sid,
		bytes.NewReader(mustJSON(map[string]any{"title": title})))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if resp, err := c.http.Do(req); err == nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
	}
}

// --- 5. rollback envelope (undo/rewind) --------------------------------------

// checkRollbackEnvelope exercises POST /rewind (targeting the newest
// message — deletes nothing on a newest-first backend) then POST
// /undo {count: 1}, and asserts the SPEC §6.2 response envelope. The
// key drift this locks out: clients reading `reverted_messages`,
// which never existed on the reconciled wire. Backends still on the
// pre-reconciliation shape (the emulator) pass via the legacy keys;
// backends emitting the codified envelope get the full coherence
// assertions. Mutating — Run() gates this on a suite-created session.
func checkRollbackEnvelope(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()

	_, listBody, err := c.get(ctx, "/v1/sessions/"+sid+"/messages")
	if err != nil {
		t.Fatalf("GET messages: %v", err)
	}
	var list struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(listBody, &list); err != nil || len(list.Messages) == 0 {
		return // nothing to roll back against
	}
	newest := list.Messages[0].ID

	// Rewind to the newest message. `to_message_id` is the one target
	// key every documented dialect accepts (SPEC §6.2: clio reads
	// message_id | target_message_id | to_message_id; the
	// pre-reconciliation shape used to_message_id only). Sending a
	// single key also survives strict decoders that reject unknown
	// fields despite §2.
	rwStatus, rwBody := rollbackPost(t, c, "/v1/sessions/"+sid+"/rewind", map[string]any{
		"to_message_id": newest,
	})
	switch rwStatus {
	case 0, http.StatusNotFound, http.StatusNotImplemented, http.StatusConflict:
		// Route absent / busy — nothing to assert.
	default:
		if rwStatus == http.StatusOK {
			validateRollbackEnvelope(t, rwBody, "rewind", sid)
		} else {
			t.Errorf("POST /rewind status %d body %s", rwStatus, truncForLog(rwBody))
		}
	}

	// Undo the newest message.
	unStatus, unBody := rollbackPost(t, c, "/v1/sessions/"+sid+"/undo", map[string]any{"count": 1})
	switch unStatus {
	case 0, http.StatusNotFound, http.StatusNotImplemented, http.StatusConflict:
		// Route absent / busy — nothing to assert.
	default:
		if unStatus == http.StatusOK {
			validateRollbackEnvelope(t, unBody, "undo", sid)
		} else {
			t.Errorf("POST /undo status %d body %s", unStatus, truncForLog(unBody))
		}
	}
}

func rollbackPost(t Reporter, c *conformClient, path string, body map[string]any) (int, []byte) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, out, err := c.postJSON(ctx, path, body)
	if err != nil {
		t.Errorf("POST %s: %v", path, err)
		return 0, nil
	}
	return resp.StatusCode, out
}

// validateRollbackEnvelope asserts the SPEC §6.2 rollback envelope.
// When the codified `deleted_message_ids` key is present, the full
// eight-key envelope must cohere; otherwise a legacy ID-array key is
// tolerated (pre-reconciliation backends). A response with neither is
// a failure — that's the drift class where a client has no key to
// read at all.
func validateRollbackEnvelope(t Reporter, body []byte, op, sid string) {
	t.Helper()
	var env map[string]any
	if err := json.Unmarshal(body, &env); err != nil {
		t.Errorf("%s response not JSON: %v (body=%s)", op, err, truncForLog(body))
		return
	}

	if ids, ok := env["deleted_message_ids"]; ok {
		// Codified envelope (SPEC §6.2).
		if _, isArr := ids.([]any); !isArr {
			t.Errorf("%s deleted_message_ids is %T, want array: %s", op, ids, truncForLog(body))
		}
		if got, _ := env["operation"].(string); got != op {
			t.Errorf("%s envelope operation = %q, want %q (SPEC §6.2)", op, got, op)
		}
		if got, _ := env["session_id"].(string); got != sid {
			t.Errorf("%s envelope session_id = %q, want %q (SPEC §6.2)", op, got, sid)
		}
		if _, isNum := env["message_count"].(float64); !isNum {
			t.Errorf("%s envelope missing numeric message_count (SPEC §6.2): %s", op, truncForLog(body))
		}
		sess, _ := env["session"].(map[string]any)
		if id, _ := sess["id"].(string); id != sid {
			t.Errorf("%s envelope session.id = %q, want full Session echoing %q (SPEC §6.2)", op, id, sid)
		}
		for _, alias := range []string{"deleted_messages", "reverted_message_ids"} {
			if _, isArr := env[alias].([]any); !isArr {
				t.Errorf("%s envelope alias %q missing or not an ID array (SPEC §6.2): %s", op, alias, truncForLog(body))
			}
		}
		if _, ghost := env["reverted_messages"]; ghost {
			t.Errorf("%s envelope carries `reverted_messages` — SPEC §6.2 codifies that this key does not exist on the reconciled wire", op)
		}
		return
	}

	// Legacy shapes: {reverted_messages: [...]} (undo) or
	// {deleted_messages: [...]} (rewind). Tolerated so
	// pre-reconciliation backends still pass; the value must at least
	// be an ID array.
	for _, legacy := range []string{"reverted_messages", "deleted_messages"} {
		if v, ok := env[legacy]; ok {
			if _, isArr := v.([]any); !isArr {
				t.Errorf("%s legacy key %q is %T, want array: %s", op, legacy, v, truncForLog(body))
			}
			return
		}
	}
	t.Errorf("%s response carries none of deleted_message_ids (SPEC §6.2) / reverted_messages / deleted_messages — clients have no ID list to read: %s",
		op, truncForLog(body))
}

// --- 6. /compact accepts {focus} ---------------------------------------------

// checkCompactFocus asserts SPEC §6.25: POST /compact takes
// `{focus?: string}` — NOT the v0.1 `{auto?, instructions?}` sketch.
// The route is probe-gated (no capability flag): 404/501 skips.
// 5xx readiness errors (agent_unavailable / upstream_error /
// memory_update_failed) prove the route exists and accepted the body,
// which is all this drift class needs; a 400/422 means the body was
// rejected and fails. Mutating on success — Run() gates this on a
// suite-created session.
func checkCompactFocus(t Reporter, c *conformClient, sid string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), c.http.Timeout)
	defer cancel()
	resp, body, err := c.postJSON(ctx, "/v1/sessions/"+sid+"/compact",
		map[string]any{"focus": "conformance probe"})
	if err != nil {
		t.Fatalf("POST /compact: %v", err)
	}
	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusNotImplemented:
		return // route not offered by this backend
	case resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusUnprocessableEntity:
		t.Errorf("POST /compact rejected {focus} body with %d — SPEC §6.25 body is {focus?: string}: %s",
			resp.StatusCode, truncForLog(body))
	case resp.StatusCode/100 == 5:
		return // agent_unavailable / upstream_error etc. — route + body accepted
	case resp.StatusCode == http.StatusOK:
		var env struct {
			SessionID string `json:"session_id"`
			Compacted *bool  `json:"compacted"`
		}
		if err := json.Unmarshal(body, &env); err != nil {
			t.Errorf("compact response decode: %v (body=%s)", err, truncForLog(body))
			return
		}
		if env.SessionID != sid {
			t.Errorf("compact response session_id = %q, want %q (SPEC §6.25)", env.SessionID, sid)
		}
		if env.Compacted == nil {
			t.Errorf("compact response missing `compacted` bool (SPEC §6.25): %s", truncForLog(body))
		}
	default:
		t.Errorf("POST /compact unexpected status %d body %s", resp.StatusCode, truncForLog(body))
	}
}
