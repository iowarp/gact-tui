package client

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// collectSSE drives the scanner over a raw byte string and returns every
// dispatched event.
func collectSSE(t *testing.T, raw string) []SSEEvent {
	t.Helper()
	sc := newSSEScanner(strings.NewReader(raw))
	var out []SSEEvent
	for {
		ev, err := sc.next()
		if err == io.EOF {
			return out
		}
		if err != nil {
			t.Fatalf("scan: %v", err)
		}
		out = append(out, ev)
	}
}

func TestSSEScanner_FieldParsing(t *testing.T) {
	tests := []struct {
		name     string
		raw      string
		wantID   string
		wantType string
		wantRaw  string
	}{
		{
			name:     "no-space fields",
			raw:      "id:9\nevent:message.created\ndata:{\"type\":\"message.created\"}\n\n",
			wantID:   "9",
			wantType: "message.created",
			wantRaw:  `{"type":"message.created"}`,
		},
		{
			name:     "with-space fields",
			raw:      "id: 9\nevent: message.created\ndata: {\"type\":\"message.created\"}\n\n",
			wantID:   "9",
			wantType: "message.created",
			wantRaw:  `{"type":"message.created"}`,
		},
		{
			name:     "multi-line data accumulates with newline joins",
			raw:      "data:{\"type\":\"x\",\ndata:\"k\":1}\n\n",
			wantType: "x",
			wantRaw:  "{\"type\":\"x\",\n\"k\":1}",
		},
		{
			name:     "CRLF line endings",
			raw:      "id: 3\r\nevent: server.heartbeat\r\ndata: {\"type\":\"server.heartbeat\"}\r\n\r\n",
			wantID:   "3",
			wantType: "server.heartbeat",
			wantRaw:  `{"type":"server.heartbeat"}`,
		},
		{
			name:     "type falls back to data.type when no event field",
			raw:      "data: {\"type\":\"cost.updated\"}\n\n",
			wantType: "cost.updated",
			wantRaw:  `{"type":"cost.updated"}`,
		},
		{
			name:     "id-less event has empty id",
			raw:      "event: server.heartbeat\ndata: {\"type\":\"server.heartbeat\"}\n\n",
			wantID:   "",
			wantType: "server.heartbeat",
			wantRaw:  `{"type":"server.heartbeat"}`,
		},
		{
			name:     "comments and unknown fields are ignored",
			raw:      ": keep-alive comment\nretry: 5000\nx-vendor: whatever\nid:7\ndata: {\"type\":\"message.completed\"}\n\n",
			wantID:   "7",
			wantType: "message.completed",
			wantRaw:  `{"type":"message.completed"}`,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := collectSSE(t, tc.raw)
			if len(got) != 1 {
				t.Fatalf("want 1 event, got %d: %+v", len(got), got)
			}
			ev := got[0]
			if ev.ID != tc.wantID {
				t.Errorf("ID = %q, want %q", ev.ID, tc.wantID)
			}
			if ev.Type != tc.wantType {
				t.Errorf("Type = %q, want %q", ev.Type, tc.wantType)
			}
			if string(ev.Raw) != tc.wantRaw {
				t.Errorf("Raw = %q, want %q", ev.Raw, tc.wantRaw)
			}
		})
	}
}

// TestSSEScanner_NonDispatching covers blocks that must not emit an event:
// comment-only blocks, metadata-only blocks (no data field), and an
// unterminated final block.
func TestSSEScanner_NonDispatching(t *testing.T) {
	cases := map[string]string{
		"comment only":             ": just a comment\n\n",
		"metadata only, no data":   "id: 4\nevent: message.created\n\n",
		"unterminated final block": "data: {\"type\":\"x\"}",
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			if got := collectSSE(t, raw); len(got) != 0 {
				t.Fatalf("want 0 events, got %d: %+v", len(got), got)
			}
		})
	}
}

// TestSSEScanner_EdgeCaseFixture parses the fixture shared with the TS parser
// tests (contract/testdata/sse_edge_cases.sse) and asserts the four-event
// sequence both parsers must agree on.
func TestSSEScanner_EdgeCaseFixture(t *testing.T) {
	path := filepath.Join("..", "..", "..", "contract", "testdata", "sse_edge_cases.sse")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	got := collectSSE(t, string(raw))
	if len(got) != 4 {
		t.Fatalf("want 4 events, got %d: %+v", len(got), got)
	}

	if got[0].ID != "1" || got[0].Type != "message.created" {
		t.Errorf("event 0 = {ID:%q Type:%q}, want {1 message.created}", got[0].ID, got[0].Type)
	}
	p0, _ := got[0].Payload["payload"].(map[string]any)
	if n, _ := p0["n"].(float64); n != 1 {
		t.Errorf("event 0 payload.n = %v, want 1", p0["n"])
	}

	if got[1].ID != "2" || got[1].Type != "message.part.delta" {
		t.Errorf("event 1 = {ID:%q Type:%q}, want {2 message.part.delta}", got[1].ID, got[1].Type)
	}
	p1, _ := got[1].Payload["payload"].(map[string]any)
	if txt, _ := p1["text"].(string); txt != "hi" {
		t.Errorf("event 1 payload.text = %v, want hi", p1["text"])
	}

	if got[2].ID != "3" || got[2].Type != "message.completed" {
		t.Errorf("event 2 = {ID:%q Type:%q}, want {3 message.completed}", got[2].ID, got[2].Type)
	}
	payload, _ := got[2].Payload["payload"].(map[string]any)
	if ok, _ := payload["ok"].(bool); !ok {
		t.Errorf("event 2 payload.payload.ok = %v, want true", payload)
	}

	// Event 3 has neither an id: nor an event: field; its type comes from
	// the data JSON, and its ID is empty (resume stickiness is the
	// connection layer's job, not the parser's).
	if got[3].ID != "" || got[3].Type != "server.heartbeat" {
		t.Errorf("event 3 = {ID:%q Type:%q}, want {\"\" server.heartbeat}", got[3].ID, got[3].Type)
	}
}

func TestSplitSSEField(t *testing.T) {
	cases := []struct {
		line      string
		wantField string
		wantValue string
	}{
		{"data: hello", "data", "hello"},
		{"data:hello", "data", "hello"},
		{"data:  hello", "data", " hello"}, // only ONE leading space stripped
		{"data:", "data", ""},
		{"event", "event", ""}, // no colon: whole line is the field name
		{"id: 42", "id", "42"},
	}
	for _, tc := range cases {
		field, value := splitSSEField(tc.line)
		if field != tc.wantField || value != tc.wantValue {
			t.Errorf("splitSSEField(%q) = (%q, %q), want (%q, %q)",
				tc.line, field, value, tc.wantField, tc.wantValue)
		}
	}
}
