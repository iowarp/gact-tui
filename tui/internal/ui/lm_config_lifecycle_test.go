package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestLMConfigSavingSuppressesCloseButtonHitTarget(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.saving = true

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "button:lm-config:close"); ok {
		t.Fatal("saving provider setup should render close without registering an active close hit target")
	}
}

func TestLMConfigOutsideClickUsesSharedCloseState(t *testing.T) {
	a := newLMConfigTestApp()

	_ = a.View()
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      0,
		Y:      0,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("outside click should not dispatch a command")
	}
	if a.lmConfig.open {
		t.Fatal("outside click should close LM config modal")
	}
}

func TestLMConfigUnsupportedEndpointReturnsToSettings(t *testing.T) {
	a := newLMConfigTestApp()
	a.settings.open = false

	_, _ = a.Update(lmConfigFetchedMsg{info: nil, err: nil})

	if a.lmConfig.open {
		t.Fatal("unsupported endpoint should close LM config modal")
	}
	if !a.settings.open {
		t.Fatal("unsupported endpoint should return to Settings")
	}
	if !strings.Contains(a.settings.loadErr, "/v1/providers/lm") {
		t.Fatalf("missing unsupported-endpoint message: %#v", a.settings)
	}
}

func TestLMConfigSavedMirrorsGlobalProviderAndClearsSessionModels(t *testing.T) {
	a := newLMConfigTestApp()
	a.session.wsID = "ws_default"
	a.session.sessions = []gact.Session{
		{
			ID:    "sess_1",
			Title: "old model",
			Model: gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Agent: gact.AgentRef{ID: "default"},
		},
		{
			ID:    "sess_2",
			Title: "also old",
			Model: gact.ModelRef{ProviderID: "openai", ModelID: "gpt-4o-mini"},
			Agent: gact.AgentRef{ID: "default"},
		},
	}

	info := &client.LMProviderInfo{
		Configured: true,
		Provider:   "lm_studio",
		APIBase:    "http://127.0.0.1:1234/v1",
		Model:      "qwopus3.5-9b-v3",
	}
	updated, cmd := a.Update(lmConfigSavedMsg{info: info})
	a = updated.(*App)

	if a.lmConfig.open {
		t.Fatal("successful save should close the provider modal")
	}
	if a.lmProviderInfo == nil || a.lmProviderInfo.Model != "qwopus3.5-9b-v3" {
		t.Fatalf("provider info was not mirrored locally: %#v", a.lmProviderInfo)
	}
	for _, sess := range a.session.sessions {
		if sess.Model.ProviderID != "" || sess.Model.ModelID != "" || sess.Model.Variant != "" {
			t.Fatalf("stale session model was not cleared: %#v", sess.Model)
		}
	}
	if a.transientHint != "LM configured: lm_studio/qwopus3.5-9b-v3" {
		t.Fatalf("transient hint = %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("successful save should schedule hint expiry and session refresh")
	}
}

func TestLMConfigAsyncSavePollsUntilReady(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.open = true
	a.lmConfig.saving = true

	configuring := &client.LMProviderInfo{
		Configured:    false,
		Provider:      "lm_studio",
		Model:         "qwopus3.5-9b-v3",
		State:         "configuring",
		StatusMessage: "LM Studio provider configuration is in progress.",
		OperationID:   "lmcfg_test",
		ContextLength: 32768,
	}
	updated, cmd := a.Update(lmConfigSavedMsg{info: configuring})
	a = updated.(*App)

	if a.lmConfig.open {
		t.Fatalf(
			"configuring save should close modal and continue in background: open=%v state=%#v",
			a.lmConfig.open,
			a.lmConfig,
		)
	}
	if a.lmProviderInfo == nil || a.lmProviderInfo.State != "configuring" {
		t.Fatalf("configuring provider info was not mirrored: %#v", a.lmProviderInfo)
	}
	if a.transientHint != "LM configuration in progress: lm_studio/qwopus3.5-9b-v3" {
		t.Fatalf("transient hint = %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("configuring save should schedule provider-status polling")
	}

	a.focus = FocusInput
	updated, _ = a.Update(tea.KeyPressMsg{Code: 'd', Text: "d"})
	a = updated.(*App)
	if a.inputComposer.input.Value() != "d" {
		t.Fatalf("input should remain usable during background provider load, got %q", a.inputComposer.input.Value())
	}

	ready := &client.LMProviderInfo{
		Configured: true,
		Provider:   "lm_studio",
		Model:      "qwopus3.5-9b-v3",
		State:      "ready",
	}
	updated, cmd = a.Update(lmConfigFetchedMsg{info: ready})
	a = updated.(*App)
	if a.lmConfig.open {
		t.Fatal("ready poll should close the provider modal")
	}
	if a.transientHint != "LM configured: lm_studio/qwopus3.5-9b-v3" {
		t.Fatalf("transient hint = %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("ready poll should schedule hint expiry/session refresh")
	}
}
