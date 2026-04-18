package crush

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// crushMsgFixture builds a Crush wire message JSON with the given parts
// envelope so each test stays focused on the part shape under test.
// The fixture is hand-rolled (rather than going through Crush's
// MarshalJSON) so we don't pull catwalk into the adapter test deps.
func crushMsgFixture(t *testing.T, role, partsJSON string) []byte {
	t.Helper()
	body := `{
		"id":"msg_1","session_id":"ses_a","role":"` + role + `",
		"model":"claude-opus","provider":"anthropic",
		"created_at":1700000000,"updated_at":1700000010,
		"parts":` + partsJSON + `
	}`
	// Validate the literal we just built so failing tests don't waste
	// half their stack inside json's error reporter.
	var probe map[string]any
	if err := json.Unmarshal([]byte(body), &probe); err != nil {
		t.Fatalf("fixture is invalid JSON: %v", err)
	}
	return []byte(body)
}

func TestMessageToGact_TextAndReasoning(t *testing.T) {
	body := crushMsgFixture(t, "assistant", `[
		{"type":"reasoning","data":{"thinking":"hmm","signature":"sig1"}},
		{"type":"text","data":{"text":"hello"}}
	]`)
	var cm CrushMessage
	if err := json.Unmarshal(body, &cm); err != nil {
		t.Fatal(err)
	}
	got, err := MessageToGact(cm, "fallback_session")
	if err != nil {
		t.Fatal(err)
	}
	if got.Role != "assistant" || got.SessionID != "ses_a" {
		t.Errorf("header = %+v", got)
	}
	if got.Model == nil || got.Model.ProviderID != "anthropic" || got.Model.ModelID != "claude-opus" {
		t.Errorf("model = %+v", got.Model)
	}
	if len(got.Parts) != 2 {
		t.Fatalf("parts = %d, want 2", len(got.Parts))
	}
	if got.Parts[0].Type != gact.PartTypeThinking || got.Parts[0].Thinking != "hmm" {
		t.Errorf("part[0] = %+v", got.Parts[0])
	}
	if got.Parts[0].Signature != "sig1" {
		t.Errorf("signature lost: %+v", got.Parts[0])
	}
	if got.Parts[1].Type != gact.PartTypeText || got.Parts[1].Text != "hello" {
		t.Errorf("part[1] = %+v", got.Parts[1])
	}
}

func TestMessageToGact_ToolCallParsesInput(t *testing.T) {
	body := crushMsgFixture(t, "assistant", `[
		{"type":"tool_call","data":{
			"id":"call_1","name":"bash","input":"{\"cmd\":\"ls\"}",
			"type":"function","finished":true
		}}
	]`)
	var cm CrushMessage
	_ = json.Unmarshal(body, &cm)
	got, err := MessageToGact(cm, "")
	if err != nil {
		t.Fatal(err)
	}
	p := got.Parts[0]
	if p.Type != gact.PartTypeToolCall || p.CallID != "call_1" || p.ToolName != "bash" {
		t.Errorf("part = %+v", p)
	}
	if p.Input["cmd"] != "ls" {
		t.Errorf("input not parsed: %+v", p.Input)
	}
	if p.Metadata["x_crush_finished"] != true {
		t.Errorf("finished metadata missing: %+v", p.Metadata)
	}
}

func TestMessageToGact_ToolCallMalformedInputPreservedRaw(t *testing.T) {
	body := crushMsgFixture(t, "assistant", `[
		{"type":"tool_call","data":{
			"id":"call_2","name":"bash","input":"not json","finished":false
		}}
	]`)
	var cm CrushMessage
	_ = json.Unmarshal(body, &cm)
	got, _ := MessageToGact(cm, "")
	p := got.Parts[0]
	if p.Input != nil {
		t.Errorf("input should be nil on parse failure, got %+v", p.Input)
	}
	if p.Metadata["x_crush_raw_input"] != "not json" {
		t.Errorf("raw input not stashed: %+v", p.Metadata)
	}
}

func TestMessageToGact_ToolResult(t *testing.T) {
	body := crushMsgFixture(t, "tool", `[
		{"type":"tool_result","data":{
			"tool_call_id":"call_1","name":"bash","content":"ok","is_error":false
		}}
	]`)
	var cm CrushMessage
	_ = json.Unmarshal(body, &cm)
	got, _ := MessageToGact(cm, "")
	p := got.Parts[0]
	if p.Type != gact.PartTypeToolResult || p.CallID != "call_1" {
		t.Errorf("part = %+v", p)
	}
	if len(p.Content) != 1 || p.Content[0].Text != "ok" {
		t.Errorf("content = %+v", p.Content)
	}
	if p.IsError {
		t.Error("should not be error")
	}
}

func TestMessageToGact_FinishBecomesStopReason(t *testing.T) {
	body := crushMsgFixture(t, "assistant", `[
		{"type":"text","data":{"text":"done"}},
		{"type":"finish","data":{"reason":"end_turn","time":1700000020}}
	]`)
	var cm CrushMessage
	_ = json.Unmarshal(body, &cm)
	got, _ := MessageToGact(cm, "")
	if got.StopReason != "end_turn" {
		t.Errorf("stop_reason = %q, want end_turn", got.StopReason)
	}
	if len(got.Parts) != 1 || got.Parts[0].Type != gact.PartTypeText {
		t.Errorf("finish should not become a part: %+v", got.Parts)
	}
}

func TestMessageToGact_UnknownTypePreserved(t *testing.T) {
	body := crushMsgFixture(t, "assistant", `[
		{"type":"future_thing","data":{"foo":42}}
	]`)
	var cm CrushMessage
	_ = json.Unmarshal(body, &cm)
	got, _ := MessageToGact(cm, "")
	p := got.Parts[0]
	if p.Type != "x_crush_future_thing" {
		t.Errorf("unknown type lost: %+v", p)
	}
	raw, _ := json.Marshal(p.Metadata["x_crush_raw"])
	if string(raw) != `{"foo":42}` {
		t.Errorf("raw metadata = %s", raw)
	}
}

func TestMessageToGact_ImageURL(t *testing.T) {
	body := crushMsgFixture(t, "user", `[
		{"type":"image_url","data":{"url":"https://x/y.png","detail":"high"}}
	]`)
	var cm CrushMessage
	_ = json.Unmarshal(body, &cm)
	got, _ := MessageToGact(cm, "")
	p := got.Parts[0]
	if p.Type != gact.PartTypeImage {
		t.Errorf("type = %q", p.Type)
	}
	src := p.Source.(map[string]any)
	if src["url"] != "https://x/y.png" {
		t.Errorf("url lost: %+v", src)
	}
	if p.Metadata["x_crush_detail"] != "high" {
		t.Errorf("detail metadata missing: %+v", p.Metadata)
	}
}

func TestMessageToGact_EmptyParts(t *testing.T) {
	body := crushMsgFixture(t, "assistant", `[]`)
	var cm CrushMessage
	_ = json.Unmarshal(body, &cm)
	got, err := MessageToGact(cm, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Parts) != 0 {
		t.Errorf("parts = %+v", got.Parts)
	}
}

func TestMessageToGact_FallbackSessionID(t *testing.T) {
	body := []byte(`{"id":"msg_1","role":"user","parts":[]}`)
	var cm CrushMessage
	_ = json.Unmarshal(body, &cm)
	got, _ := MessageToGact(cm, "fb_sid")
	if got.SessionID != "fb_sid" {
		t.Errorf("expected fallback sid, got %q", got.SessionID)
	}
}

func TestAdapter_ListMessages_EndToEnd(t *testing.T) {
	upstream := mockCrush(t, map[string]http.HandlerFunc{
		"/v1/workspaces/ws_a/sessions/ses_42/messages": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`[
				{"id":"m1","session_id":"ses_42","role":"user",
				 "created_at":1700000000,
				 "parts":[{"type":"text","data":{"text":"hi"}}]},
				{"id":"m2","session_id":"ses_42","role":"assistant",
				 "model":"claude","provider":"anthropic",
				 "parts":[
					{"type":"reasoning","data":{"thinking":"hmm"}},
					{"type":"text","data":{"text":"hello back"}},
					{"type":"finish","data":{"reason":"end_turn"}}
				 ]}
			]`))
		},
	})
	defer upstream.Close()

	s := New(upstream.URL, "ws_a", nil)
	rec := do(t, s.Handler(), "/v1/sessions/ses_42/messages")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Messages []gact.Message `json:"messages"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Messages) != 2 {
		t.Fatalf("messages = %d", len(body.Messages))
	}
	if body.Messages[0].Parts[0].Text != "hi" {
		t.Errorf("msg0 part = %+v", body.Messages[0].Parts[0])
	}
	if body.Messages[1].StopReason != "end_turn" {
		t.Errorf("msg1 stop_reason = %q", body.Messages[1].StopReason)
	}
	if body.Messages[1].Model == nil || body.Messages[1].Model.ModelID != "claude" {
		t.Errorf("msg1 model = %+v", body.Messages[1].Model)
	}
}

func TestAdapter_ListMessages_MissingWorkspace(t *testing.T) {
	s := New("http://unused", "", nil)
	rec := do(t, s.Handler(), "/v1/sessions/ses_42/messages")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status %d, want 400", rec.Code)
	}
}
