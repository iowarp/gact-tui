package crush

import (
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestWorkspaceToGact(t *testing.T) {
	in := CrushWorkspace{
		ID: "ws_abc", Path: "/repos/myapp", Title: "myapp", Yolo: true,
		CreatedAt: 1700000000, UpdatedAt: 1700001000,
	}
	g := WorkspaceToGact(in)
	if g.ID != "ws_abc" {
		t.Errorf("id = %q", g.ID)
	}
	if g.Name != "myapp" {
		t.Errorf("name = %q", g.Name)
	}
	if g.RootPath != "/repos/myapp" {
		t.Errorf("root_path = %q", g.RootPath)
	}
	if g.Metadata["x_crush_yolo"] != true {
		t.Errorf("yolo metadata missing: %+v", g.Metadata)
	}
	want := time.Unix(1700000000, 0).UTC()
	if !g.CreatedAt.Equal(want) {
		t.Errorf("created_at = %v, want %v", g.CreatedAt, want)
	}
}

func TestWorkspaceToGact_NameFallback(t *testing.T) {
	in := CrushWorkspace{ID: "ws_x", Path: "/path/to/lastdir"}
	g := WorkspaceToGact(in)
	if g.Name != "lastdir" {
		t.Errorf("name = %q (expected basename)", g.Name)
	}
}

func TestSessionToGact(t *testing.T) {
	in := CrushSession{
		ID: "ses_1", Title: "fix it", PromptTokens: 1500, CompletionTokens: 600, Cost: 0.0135,
		SummaryMessageID: "msg_summary",
		CreatedAt:        1700000000,
	}
	g := SessionToGact(in, "ws_default")
	if g.WorkspaceID != "ws_default" {
		t.Errorf("workspace fallback = %q", g.WorkspaceID)
	}
	if g.Tokens.Input != 1500 || g.Tokens.Output != 600 {
		t.Errorf("tokens = %+v", g.Tokens)
	}
	if g.CostUSD != 0.0135 {
		t.Errorf("cost = %v", g.CostUSD)
	}
	if g.Status != gact.StatusIdle {
		t.Errorf("status default = %q", g.Status)
	}
	if g.Metadata["x_crush_summary_message_id"] != "msg_summary" {
		t.Errorf("summary metadata missing")
	}
}

func TestSessionToGact_PrefersExplicitWorkspaceID(t *testing.T) {
	in := CrushSession{ID: "ses_1", WorkspaceID: "ws_real"}
	g := SessionToGact(in, "ws_fallback")
	if g.WorkspaceID != "ws_real" {
		t.Errorf("expected explicit ws_real, got %q", g.WorkspaceID)
	}
}

func TestTranslateCrushEvent_MessageCreatedIsFlat(t *testing.T) {
	raw := []byte(`{"type":"message","payload":{"type":"created","payload":{"id":"msg_1","session_id":"ses_1","role":"assistant"}}}`)
	ev, payload, sid, ok := translateCrushEvent(raw, "")
	if !ok {
		t.Fatal("translateCrushEvent rejected a valid envelope")
	}
	if ev != "message.created" {
		t.Fatalf("event = %q, want message.created", ev)
	}
	if sid != "ses_1" {
		t.Errorf("sid = %q, want ses_1", sid)
	}
	// Codified wire shape (clio gact/types.py + emulator + claudecode: 3 of 4
	// implementations): message.created payload IS the message resource, flat —
	// never nested under a "message" key.
	if _, nested := payload["message"]; nested {
		t.Fatalf("payload nests the message under %q: %+v", "message", payload)
	}
	if payload["id"] != "msg_1" {
		t.Errorf("payload[id] = %v, want msg_1", payload["id"])
	}
	if payload["role"] != "assistant" {
		t.Errorf("payload[role] = %v, want assistant", payload["role"])
	}
	if payload["session_id"] != "ses_1" {
		t.Errorf("payload[session_id] = %v, want ses_1", payload["session_id"])
	}
}

func TestTranslateCrushEvent_MessageCreatedBackfillsSessionID(t *testing.T) {
	// A Crush message resource that (unusually) lacks session_id still needs
	// one on the flat payload so per-session consumers can route it; the
	// stream's session filter is the only remaining source.
	raw := []byte(`{"type":"message","payload":{"type":"created","payload":{"id":"msg_2","role":"user"}}}`)
	ev, payload, _, ok := translateCrushEvent(raw, "ses_fallback")
	if !ok || ev != "message.created" {
		t.Fatalf("event = %q ok=%v", ev, ok)
	}
	if payload["session_id"] != "ses_fallback" {
		t.Errorf("payload[session_id] = %v, want ses_fallback", payload["session_id"])
	}
}

func TestSessionsToGact_PreservesOrder(t *testing.T) {
	in := []CrushSession{{ID: "a"}, {ID: "b"}, {ID: "c"}}
	out := SessionsToGact(in, "ws_x")
	if len(out) != 3 {
		t.Fatalf("count = %d", len(out))
	}
	for i, want := range []string{"a", "b", "c"} {
		if out[i].ID != want {
			t.Errorf("[%d] id = %q", i, out[i].ID)
		}
	}
}
