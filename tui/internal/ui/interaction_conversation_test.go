package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestConversationPartsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "second"}}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:part:1:0")
	if !ok {
		t.Fatal("missing conversation hit target for second message")
	}
	a, _ = updateTranscriptLeftClickAndReleaseForTest(a, target.rect.x, target.rect.y)

	if a.focus != FocusBody {
		t.Fatalf("focus = %v, want body", a.focus)
	}
	if a.conversation.bodySelMsgIdx != 1 || a.conversation.bodySelPartIdx != 0 {
		t.Fatalf("body cursor = msg %d part %d, want msg 1 part 0", a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx)
	}
}

// TestProjectedConversationPartsKeepSemanticHitTargets pins #233 phase 1: the
// parts-only projected transcript (the delegation-session render) must expose
// the same part-level hit targets the retired flat per-message render had —
// a click selects the part, the ▌ cursor paints on it, and a second click on
// the selected part opens the detail modal.
func TestProjectedConversationPartsKeepSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 60 // tall enough that the whole projected turn (and the ▌ cursor's first line) is on screen
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "msg_user_1", SessionID: "s1", Role: gact.RoleUser,
			Parts: []gact.Part{{ID: "u1", Type: gact.PartTypeText, Text: "find the nearest station"}}},
		earthscopeDelegationAssistant("msg_user_1"),
	}

	_ = a.View()
	// The assistant's opening prose (addressable part 0 of message 1) must be
	// clickable in the projected render.
	target, ok := findHitTargetForTest(a, "conversation:part:1:0")
	if !ok {
		t.Fatal("missing part hit target for projected assistant prose")
	}
	a, _ = updateTranscriptLeftClickAndReleaseForTest(a, target.rect.x, target.rect.y)
	if a.focus != FocusBody {
		t.Fatalf("focus = %v, want body", a.focus)
	}
	if a.conversation.bodySelMsgIdx != 1 || a.conversation.bodySelPartIdx != 0 {
		t.Fatalf("body cursor = msg %d part %d, want msg 1 part 0",
			a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx)
	}
	plain := ansi.Strip(a.View().Content)
	if !strings.Contains(plain, "▌ ") {
		t.Fatalf("selected-part cursor missing from projected render:\n%s", plain)
	}
	target, ok = findHitTargetForTest(a, "conversation:part:1:0")
	if !ok {
		t.Fatal("part hit target lost after selection")
	}
	a, _ = updateTranscriptLeftClickAndReleaseForTest(a, target.rect.x, target.rect.y)
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("second click on selected projected part should open detail")
	}
}

func updateTranscriptLeftClickAndReleaseForTest(a *App, x, y int) (*App, tea.Cmd) {
	return updateTranscriptMouseClickAndReleaseForTest(a, tea.MouseClickMsg(tea.Mouse{
		X:      x,
		Y:      y,
		Button: tea.MouseLeft,
	}))
}

func updateTranscriptMouseClickAndReleaseForTest(a *App, click tea.MouseClickMsg) (*App, tea.Cmd) {
	model, cmd := a.Update(click)
	a = model.(*App)
	if cmd != nil {
		return a, cmd
	}
	mouse := click.Mouse()
	model, cmd = a.Update(tea.MouseReleaseMsg(tea.Mouse{
		X:      mouse.X,
		Y:      mouse.Y,
		Button: mouse.Button,
	}))
	return model.(*App), cmd
}

func TestConversationContentRectUsesSharedPaneGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36

	rect := a.conversation.contentRect(2, 3, 20, 4, 80, true)
	sidebarW, _, _ := a.chrome.mainPaneGeometry()
	if rect.x != sidebarW+5 || rect.y != 7 || rect.w != 20 || rect.h != 4 {
		t.Fatalf("conversation content rect = %+v, want x=%d y=7 w=20 h=4", rect, sidebarW+5)
	}

	clamped := a.conversation.contentRect(0, 100, 20, 0, 12, false)
	if clamped.x != sidebarW+9 || clamped.y != 4 || clamped.w != 1 || clamped.h != 1 {
		t.Fatalf("clamped conversation content rect = %+v, want x=%d y=4 w=1 h=1", clamped, sidebarW+9)
	}
}

func TestConversationSelectedPartSecondClickOpensDetail(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{
		ID:   "m1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "p1",
			Type: gact.PartTypeText,
			Text: strings.Repeat("detail line\n", 20),
		}},
	}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:part:0:0")
	if !ok {
		t.Fatal("missing conversation hit target")
	}
	click := tea.MouseClickMsg(tea.Mouse{X: target.rect.x, Y: target.rect.y, Button: tea.MouseLeft})
	a, _ = updateTranscriptMouseClickAndReleaseForTest(a, click)
	_ = a.View()
	a, _ = updateTranscriptMouseClickAndReleaseForTest(a, click)

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("second click on selected conversation part should open detail")
	}
	if a.detail.ref.partID != "p1" {
		t.Fatalf("detail partID = %q, want p1", a.detail.ref.partID)
	}
}

func TestConversationDetailHintClickOpensDetail(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{
		ID:   "m1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:     "p1",
			Type:   gact.PartTypeToolResult,
			CallID: "c1",
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: "summary line",
			}},
			Metadata: map[string]any{
				"raw_result": map[string]any{"rows": []string{"alpha", "beta"}},
			},
		}},
	}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:detail:0:0")
	if !ok {
		t.Fatal("missing conversation detail hint hit target")
	}
	a, _ = updateTranscriptLeftClickAndReleaseForTest(a, target.rect.x, target.rect.y)

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("clicking detail hint should open detail on first click")
	}
	if a.focus != FocusBody || a.conversation.bodySelMsgIdx != 0 || a.conversation.bodySelPartIdx != 0 {
		t.Fatalf("body cursor = focus %v msg %d part %d, want body 0:0", a.focus, a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx)
	}
	if a.detail.ref.partID != "p1" {
		t.Fatalf("detail partID = %q, want p1", a.detail.ref.partID)
	}
}

func TestConversationDetailCopyIncludesRawResult(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{
		ID:   "m1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:       "p1",
			Type:     gact.PartTypeToolResult,
			ToolName: "inspect_dataset",
			CallID:   "c1",
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: "summary line",
			}},
			Metadata: map[string]any{
				"raw_result": map[string]any{
					"rows": []string{"alpha", "beta"},
					"ok":   true,
				},
			},
		}},
	}}
	mu, copied, _ := withClipboardSpy(t)

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:detail:0:0")
	if !ok {
		t.Fatal("missing conversation detail hint hit target")
	}
	a, cmd := updateTranscriptLeftClickAndReleaseForTest(a, target.rect.x, target.rect.y)
	if cmd != nil {
		t.Fatal("detail hint click should not dispatch a command")
	}
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("detail hint click should open detail")
	}
	for _, want := range []string{"tool: inspect_dataset", "content: summary line", "raw result:", "alpha", "beta"} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("detail text missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}

	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "button:detail:copy")
	if !ok {
		t.Fatal("missing detail copy target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyTarget.rect.x,
		Y:      copyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("detail copy click should not dispatch a command")
	}
	if !a.detail.visible {
		t.Fatal("detail copy should leave detail open")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	for _, want := range []string{"tool: inspect_dataset", "content: summary line", "raw result:", "\"rows\": [", "\"alpha\"", "\"beta\""} {
		if !strings.Contains(gotCopy, want) {
			t.Fatalf("copied detail missing %q:\n%s", want, gotCopy)
		}
	}
	if !strings.Contains(a.transientHint, "copied detail") {
		t.Fatalf("hint = %q, want copy confirmation", a.transientHint)
	}
}

func TestConversationDiffActionsUseSemanticHitTargets(t *testing.T) {
	var gotEndpoint string
	var gotPaths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotEndpoint = r.URL.Path
		var body struct {
			Paths []string `json:"paths"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode diff action body: %v", err)
		}
		gotPaths = body.Paths
		switch {
		case strings.HasSuffix(r.URL.Path, "/diffs/apply"):
			_, _ = w.Write([]byte(`{"applied":["src/main.go"]}`))
		case strings.HasSuffix(r.URL.Path, "/diffs/reject"):
			_, _ = w.Write([]byte(`{"rejected":["src/main.go"]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	newDiffApp := func() *App {
		before := "package main\nfunc main() {}\n"
		after := "package main\nfunc main() { println(\"hi\") }\n"
		a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
		a.width = 120
		a.height = 36
		a.stage = StageReady
		a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
		a.session.selected = 0
		a.conversation.messages = []gact.Message{{
			ID:   "m1",
			Role: gact.RoleAssistant,
			Parts: []gact.Part{{
				ID:     "diff_1",
				Type:   gact.PartTypeFileDiff,
				Path:   "src/main.go",
				Before: &before,
				After:  &after,
			}},
		}}
		return a
	}

	a := newDiffApp()
	_ = a.View()
	applyTarget, ok := findHitTargetForTest(a, "conversation:diff:apply:src/main.go")
	if !ok {
		t.Fatal("missing semantic diff apply target")
	}
	if _, ok := findHitTargetForTest(a, "conversation:diff:reject:src/main.go"); !ok {
		t.Fatal("missing semantic diff reject target")
	}
	a, cmd := updateTranscriptLeftClickAndReleaseForTest(a, applyTarget.rect.x, applyTarget.rect.y)
	if cmd == nil {
		t.Fatal("diff apply click should dispatch a command")
	}
	if a.focus != FocusBody || a.conversation.bodySelMsgIdx != 0 || a.conversation.bodySelPartIdx != 0 {
		t.Fatalf("diff apply click should focus selected diff, focus=%v msg=%d part=%d", a.focus, a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx)
	}
	msg := cmd()
	if _, ok := msg.(diffsAppliedMsg); !ok {
		t.Fatalf("diff apply cmd returned %T, want diffsAppliedMsg", msg)
	}
	if gotEndpoint != "/v1/sessions/sess_1/diffs/apply" {
		t.Fatalf("apply endpoint = %q", gotEndpoint)
	}
	if len(gotPaths) != 1 || gotPaths[0] != "src/main.go" {
		t.Fatalf("apply paths = %#v, want src/main.go", gotPaths)
	}

	a = newDiffApp()
	_ = a.View()
	rejectTarget, ok := findHitTargetForTest(a, "conversation:diff:reject:src/main.go")
	if !ok {
		t.Fatal("missing semantic diff reject target")
	}
	a, cmd = updateTranscriptLeftClickAndReleaseForTest(a, rejectTarget.rect.x, rejectTarget.rect.y)
	if cmd == nil {
		t.Fatal("diff reject click should dispatch a command")
	}
	msg = cmd()
	if _, ok := msg.(diffsRejectedMsg); !ok {
		t.Fatalf("diff reject cmd returned %T, want diffsRejectedMsg", msg)
	}
	if gotEndpoint != "/v1/sessions/sess_1/diffs/reject" {
		t.Fatalf("reject endpoint = %q", gotEndpoint)
	}
	if len(gotPaths) != 1 || gotPaths[0] != "src/main.go" {
		t.Fatalf("reject paths = %#v, want src/main.go", gotPaths)
	}
}

// TestConversationDiffHitTargetsStableAcrossFrames pins the #233 cache-aliasing
// regression: renderConversation's appendRow offset diffActions rows in place
// on the slice cachedTurnBlockRender returned, but that slice aliases the
// cached execTurnRender.blocks — ranging copies the block struct, not its
// diffActions backing array. A pending file_diff in a NON-FIRST turn block
// (nonzero body offset) therefore had its apply/reject hit targets drift by
// the block's offset on every cached frame, so clicks missed after frame one.
// Rendering the same state across consecutive frames must yield identical
// hit-target geometry.
func TestConversationDiffHitTargetsStableAcrossFrames(t *testing.T) {
	before := "package main\nfunc main() {}\n"
	after := "package main\nfunc main() { println(\"hi\") }\n"
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 60
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "u1", Role: gact.RoleUser,
			Parts: []gact.Part{{ID: "u1p", Type: gact.PartTypeText, Text: "first question"}}},
		{ID: "a1", Role: gact.RoleAssistant,
			Parts: []gact.Part{{ID: "a1p", Type: gact.PartTypeText, Text: "first answer"}}},
		{ID: "u2", Role: gact.RoleUser,
			Parts: []gact.Part{{ID: "u2p", Type: gact.PartTypeText, Text: "now edit the file"}}},
		{ID: "a2", Role: gact.RoleAssistant, Parts: []gact.Part{
			{ID: "a2p", Type: gact.PartTypeText, Text: "editing"},
			{ID: "diff_1", Type: gact.PartTypeFileDiff, Path: "src/main.go", Before: &before, After: &after},
		}},
	}

	type frameGeom struct {
		applyX, applyY, rejectX, rejectY int
	}
	var frames []frameGeom
	for i := 0; i < 3; i++ {
		_ = a.View()
		applyTarget, ok := findHitTargetForTest(a, "conversation:diff:apply:src/main.go")
		if !ok {
			t.Fatalf("frame %d: missing diff apply hit target (rows drifted?) — previous frames: %+v", i+1, frames)
		}
		rejectTarget, ok := findHitTargetForTest(a, "conversation:diff:reject:src/main.go")
		if !ok {
			t.Fatalf("frame %d: missing diff reject hit target (rows drifted?) — previous frames: %+v", i+1, frames)
		}
		frames = append(frames, frameGeom{
			applyX: applyTarget.rect.x, applyY: applyTarget.rect.y,
			rejectX: rejectTarget.rect.x, rejectY: rejectTarget.rect.y,
		})
	}
	for i := 1; i < len(frames); i++ {
		if frames[i] != frames[0] {
			t.Fatalf("diff hit targets drifted across frames: frame 1 = %+v, frame %d = %+v", frames[0], i+1, frames[i])
		}
	}
}
