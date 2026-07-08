package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// The body cursor must walk *parts*, not whole messages.
// User feedback: "you are currently making your selector go
// conversation turn to conversation turn instead of logical block to
// logical block. what happens if an agent reads two large files?"
//
// Fixture: one assistant turn that reads TWO files (so two distinct
// tool_result blocks inside the paired view). j/k should step through
// them individually before crossing to the next message.
func TestPerPart_JKWalksPartsWithinMessage(t *testing.T) {
	bulky := strings.Repeat("line\n", 60)
	asst := gact.Message{
		ID:   "a1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{ID: "p_intro", Type: gact.PartTypeText, Text: "Reading two files."},
			{ID: "p_call1", Type: gact.PartTypeToolCall, CallID: "c1", ToolName: "read_file"},
			{ID: "p_call2", Type: gact.PartTypeToolCall, CallID: "c2", ToolName: "read_file"},
		},
	}
	tool1 := gact.Message{
		ID: "t1", Role: gact.RoleTool,
		Parts: []gact.Part{{
			ID: "p_res1", Type: gact.PartTypeToolResult, CallID: "c1",
			Content: []gact.Part{{Type: gact.PartTypeText, Text: "FILE_ONE\n" + bulky}},
		}},
	}
	tool2 := gact.Message{
		ID: "t2", Role: gact.RoleTool,
		Parts: []gact.Part{{
			ID: "p_res2", Type: gact.PartTypeToolResult, CallID: "c2",
			Content: []gact.Part{{Type: gact.PartTypeText, Text: "FILE_TWO\n" + bulky}},
		}},
	}

	a := newReadyApp(
		[]gact.Session{{ID: "sess_1", Title: "t", Status: gact.StatusIdle}},
		[]gact.Message{asst, tool1, tool2},
	)
	a.width, a.height = 120, 30
	a.focus = FocusBody
	// Simulate Tab-into-body seeding: cursor on last NON-absorbed
	// message, land on that msg's last part.
	a.conversation.maybeInitCursor()

	// Absorbed-tool pairing merges tool1 + tool2 into asst, so the
	// last visible message is asst (idx=0) and its addressable parts
	// are [p_intro, p_call1, p_call2] — three blocks.
	addr := addressablePartsOf(a.conversation.messages[a.conversation.bodySelMsgIdx])
	if len(addr) != 3 {
		t.Fatalf("expected 3 addressable parts in the paired assistant msg; got %d (%v)", len(addr), addr)
	}
	// Seeded on last part (p_call2).
	if a.conversation.selectedPartID() != "p_call2" {
		t.Errorf("after seed, selectedPartID = %q, want p_call2", a.conversation.selectedPartID())
	}

	// Step up: should land on p_call1 (still same message, different block).
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyUp})
	a = out.(*App)
	if a.conversation.selectedPartID() != "p_call1" {
		t.Errorf("after up, selectedPartID = %q, want p_call1", a.conversation.selectedPartID())
	}
	if a.conversation.bodySelMsgIdx != 0 {
		t.Errorf("after up within-msg, msgIdx = %d, want 0 (no cross yet)", a.conversation.bodySelMsgIdx)
	}

	// Step up again: land on p_intro (first part of msg 0).
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyUp})
	a = out.(*App)
	if a.conversation.selectedPartID() != "p_intro" {
		t.Errorf("after second up, selectedPartID = %q, want p_intro", a.conversation.selectedPartID())
	}

	// Step down twice: back to p_call2.
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyDown})
	a = out.(*App)
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyDown})
	a = out.(*App)
	if a.conversation.selectedPartID() != "p_call2" {
		t.Errorf("after two downs, selectedPartID = %q, want p_call2", a.conversation.selectedPartID())
	}
}

// When the body cursor sits on a specific tool_call, Ctrl+E
// must expand THAT call's tool_result — not the first bulky in the
// message and not the latest in the conversation. Gives the user the
// promised "each read gets its own expand" behaviour.
func TestPerPart_CtrlETargetsSelectedToolCall(t *testing.T) {
	bulky := strings.Repeat("line\n", 60)
	asst := gact.Message{
		ID: "a1", Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{ID: "p_call1", Type: gact.PartTypeToolCall, CallID: "c1", ToolName: "read_file"},
			{ID: "p_call2", Type: gact.PartTypeToolCall, CallID: "c2", ToolName: "read_file"},
		},
	}
	tool1 := gact.Message{
		ID: "t1", Role: gact.RoleTool,
		Parts: []gact.Part{{
			ID: "p_res1", Type: gact.PartTypeToolResult, CallID: "c1",
			Content: []gact.Part{{Type: gact.PartTypeText, Text: "FILE_ONE_MARKER\n" + bulky}},
		}},
	}
	tool2 := gact.Message{
		ID: "t2", Role: gact.RoleTool,
		Parts: []gact.Part{{
			ID: "p_res2", Type: gact.PartTypeToolResult, CallID: "c2",
			Content: []gact.Part{{Type: gact.PartTypeText, Text: "FILE_TWO_MARKER\n" + bulky}},
		}},
	}
	a := newReadyApp(
		[]gact.Session{{ID: "sess_1", Title: "t", Status: gact.StatusIdle}},
		[]gact.Message{asst, tool1, tool2},
	)
	a.width, a.height = 120, 30
	a.focus = FocusBody
	a.conversation.bodySelMsgIdx = 0
	a.conversation.bodySelPartIdx = 0 // points at p_call1 (the FIRST read)

	out, _ := a.Update(tea.KeyPressMsg{Code: 'e', Mod: tea.ModCtrl, Text: ""})
	got := out.(*App)
	if !got.detail.visible || got.detail.ref == nil {
		t.Fatalf("Ctrl+E should open detail view; open=%v", got.detail.visible)
	}
	if !strings.Contains(got.detail.ref.fullText, "FILE_ONE_MARKER") {
		t.Errorf("expected FILE_ONE content (cursor on first call); got title=%q preview=%q",
			got.detail.ref.title,
			got.detail.ref.fullText[:min(80, len(got.detail.ref.fullText))])
	}
	if strings.Contains(got.detail.ref.fullText, "FILE_TWO_MARKER") {
		t.Errorf("should NOT have expanded the second read; got content with FILE_TWO")
	}

	// Close, move to the second tool_call, Ctrl+E again — should now
	// show FILE_TWO.
	got.detail.visible = false
	got.detail.ref = nil
	got.conversation.bodySelPartIdx = 1

	out, _ = got.Update(tea.KeyPressMsg{Code: 'e', Mod: tea.ModCtrl, Text: ""})
	got = out.(*App)
	if got.detail.ref == nil {
		t.Fatalf("second Ctrl+E should reopen detail view")
	}
	if !strings.Contains(got.detail.ref.fullText, "FILE_TWO_MARKER") {
		t.Errorf("cursor on second call should expand FILE_TWO; got %q",
			got.detail.ref.fullText[:min(80, len(got.detail.ref.fullText))])
	}
}

// `[` / `]` removed per user feedback — the per-part
// cursor is the only selector now. This test pins that the keys are
// no-ops (don't move the cursor) so a future re-add of message-jump
// nav gets a hard nudge to update the tests + docs.
func TestPerPart_BracketKeysAreNoOp(t *testing.T) {
	mk := func(id string) gact.Message {
		return gact.Message{
			ID: id, Role: gact.RoleUser,
			Parts: []gact.Part{{ID: id + "_t", Type: gact.PartTypeText, Text: id}},
		}
	}
	a := newReadyApp(
		[]gact.Session{{ID: "sess_1", Title: "t", Status: gact.StatusIdle}},
		[]gact.Message{mk("m1"), mk("m2"), mk("m3")},
	)
	a.width, a.height = 120, 30
	a.focus = FocusBody
	a.conversation.bodySelMsgIdx = 0
	a.conversation.bodySelPartIdx = 0

	for _, k := range []rune{'[', ']'} {
		out, _ := a.Update(tea.KeyPressMsg{Code: k, Text: string(k)})
		a = out.(*App)
		if a.conversation.bodySelMsgIdx != 0 || a.conversation.bodySelPartIdx != 0 {
			t.Errorf("%q should be a no-op now; got msgIdx=%d partIdx=%d",
				k, a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx)
		}
	}
}
