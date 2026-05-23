package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestModelSwapMarkerInsertedOnProviderSave(t *testing.T) {
	a := newLMConfigTestApp()
	a.wsID = "ws_default"
	a.sessions = []gact.Session{{ID: "sess_1", Title: "demo"}}
	a.selected = 0
	a.messages = []gact.Message{
		{ID: "msg_user", Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "before"}}},
	}

	info := &client.LMProviderInfo{
		Configured: true,
		Provider:   "lm_studio",
		Model:      "qwopus3.5-9b-v3",
	}
	model, _ := a.Update(lmConfigSavedMsg{info: info})
	a = model.(*App)

	if len(a.messages) != 2 {
		t.Fatalf("messages len = %d, want 2", len(a.messages))
	}
	marker := a.messages[1]
	if !isModelSwapMarker(marker) {
		t.Fatalf("last message is not model swap marker: %#v", marker)
	}
	if marker.Metadata["label"] != "lm_studio/qwopus3.5-9b-v3" {
		t.Fatalf("marker label = %#v", marker.Metadata["label"])
	}
}

func TestRenderModelSwapMarkerAsDivider(t *testing.T) {
	marker := gact.Message{
		Role: gact.RoleSystem,
		Metadata: map[string]any{
			"gact_tui_kind": modelSwapMarkerKind,
			"label":         "lm_studio/qwopus3.5-9b-v3",
		},
	}

	out := ansi.Strip(DefaultTheme().renderMessage(marker, 80))
	if !strings.Contains(out, "model/provider switched: lm_studio/qwopus3.5-9b-v3") {
		t.Fatalf("divider missing model label:\n%s", out)
	}
	if strings.Contains(out, "SYSTEM") || strings.Contains(out, "(no parts)") {
		t.Fatalf("divider rendered like a normal system message:\n%s", out)
	}
	if strings.Count(out, "-") < 4 {
		t.Fatalf("divider did not render a visible line:\n%s", out)
	}
}

func TestConversationRendersPersistedModelRefChangeDivider(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 130
	a.height = 30
	a.stage = StageReady
	a.wsID = "ws_default"
	a.sessions = []gact.Session{{ID: "sess_1", Title: "model history", Status: gact.StatusIdle}}
	a.selected = 0
	a.messages = []gact.Message{
		{
			ID:        "msg_old",
			SessionID: "sess_1",
			Role:      gact.RoleAssistant,
			Model:     &gact.ModelRef{ProviderID: "openai", ModelID: "gpt-5.5"},
			Parts:     []gact.Part{{Type: gact.PartTypeText, Text: "old model answer"}},
		},
		{
			ID:        "msg_new",
			SessionID: "sess_1",
			Role:      gact.RoleAssistant,
			Model:     &gact.ModelRef{ProviderID: "lm_studio", ModelID: "qwopus3.5-9b-v3"},
			Parts:     []gact.Part{{Type: gact.PartTypeText, Text: "new model answer"}},
		},
	}

	out := ansi.Strip(a.View().Content)
	want := "model/provider switched: lm_studio/qwopus3.5-9b-v3"
	if !strings.Contains(out, want) {
		t.Fatalf("conversation did not render persisted model-change divider %q:\n%s", want, out)
	}
	if strings.Count(out, want) != 1 {
		t.Fatalf("model-change divider rendered %d times, want 1:\n%s", strings.Count(out, want), out)
	}
}
