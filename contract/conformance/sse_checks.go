package conformance

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

func checkSSE(t Reporter, c *conformClient, sid, wsID string, budget time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), budget)
	defer cancel()
	path := fmt.Sprintf("/v1/sessions/%s/events", sid)
	if wsID != "" {
		path += "?workspace_id=" + wsID
	}
	req, err := c.newRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Accept", "text/event-stream")
	// Use a fresh client so we aren't bounded by the RPC timeout.
	streamClient := &http.Client{Timeout: 0}
	resp, err := streamClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotImplemented {
		t.Fatal("SSE endpoint returned 501")
	}
	if resp.StatusCode != 200 {
		buf, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		t.Fatalf("status %d body %s", resp.StatusCode, buf)
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/event-stream") {
		t.Fatalf("Content-Type = %q, want text/event-stream", ct)
	}

	// NNNNNN1: read until we see a complete event (terminated by a
	// blank line). Then validate the envelope per SPEC §7.2:
	//   1. `event:` line is present
	//   2. `data:` line parses as JSON with a `type` field
	//   3. `data.type` matches the `event:` value
	// Specific event types and payload shapes are per-backend; we
	// only enforce the envelope shape.
	deadline := time.Now().Add(budget)
	buf := make([]byte, 4096)
	var seen bytes.Buffer
	for time.Now().Before(deadline) {
		if rd, ok := resp.Body.(interface{ SetReadDeadline(time.Time) error }); ok {
			_ = rd.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
		}
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			seen.Write(buf[:n])
			// A complete event ends with "\n\n". Take the first such
			// block and parse it.
			raw := seen.Bytes()
			if idx := bytes.Index(raw, []byte("\n\n")); idx >= 0 {
				validateSSEEvent(t, string(raw[:idx]), seen.String())
				return
			}
		}
		if rerr != nil && rerr != io.EOF {
			// Likely the read deadline — keep polling until the
			// budget deadline is reached.
			continue
		}
		if rerr == io.EOF {
			break
		}
	}
	t.Fatalf("no complete SSE event (terminated by \\n\\n) within %s; saw=%q", budget, seen.String())
}

// validateSSEEvent parses an SSE event block (no trailing \n\n) and
// asserts §7.2 envelope rules: event: line present, data: line parses
// as JSON with `type` + `occurred_at` (RFC3339), and data.type matches
// the event: value. WWWWWW1 also requires id: lines (when present) to
// be non-empty so monotonic-id stream resumption can rely on them.
// Caller passes the full buffer for diagnostics.
func validateSSEEvent(t Reporter, block, fullBuf string) {
	t.Helper()
	var eventName, idLine, dataLine string
	var sawID bool
	for _, line := range strings.Split(block, "\n") {
		switch {
		case strings.HasPrefix(line, "event:"):
			eventName = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "id:"):
			sawID = true
			idLine = strings.TrimSpace(strings.TrimPrefix(line, "id:"))
		case strings.HasPrefix(line, "data:"):
			dataLine = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		}
	}
	if eventName == "" {
		t.Errorf("SSE event missing `event:` line per SPEC §7.2: %q", block)
	}
	if sawID && idLine == "" {
		// WWWWWW1: an empty id: line breaks Last-Event-ID resumption
		// (clients can't tell whether to resume from "" or skip).
		t.Errorf("SSE `id:` line is present but empty per SPEC §7.2: %q", block)
	}
	if dataLine == "" {
		t.Errorf("SSE event missing `data:` line per SPEC §7.2: %q", block)
		return
	}
	var payload struct {
		Type       string `json:"type"`
		OccurredAt string `json:"occurred_at"`
	}
	if err := json.Unmarshal([]byte(dataLine), &payload); err != nil {
		t.Errorf("SSE data: line not valid JSON: %v (data=%q full=%q)", err, dataLine, fullBuf)
		return
	}
	if payload.Type == "" {
		t.Errorf("SSE data.type missing per SPEC §7.2: %q", dataLine)
		return
	}
	// WWWWWW1: occurred_at is part of the documented envelope. Empty
	// string defeats client-side ordering / dedup. Soft-validate as
	// RFC3339 (or the UTC variant); just non-empty + parseable.
	if payload.OccurredAt == "" {
		t.Errorf("SSE data.occurred_at missing per SPEC §7.2: %q", dataLine)
	} else if _, err := time.Parse(time.RFC3339, payload.OccurredAt); err != nil {
		t.Errorf("SSE data.occurred_at %q is not RFC3339: %v", payload.OccurredAt, err)
	}
	if eventName != "" && payload.Type != eventName {
		t.Errorf("SSE event line (%q) does not match data.type (%q) per SPEC §7.2", eventName, payload.Type)
	}
}
