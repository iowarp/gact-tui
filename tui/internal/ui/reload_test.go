package ui

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func newReloadApp(t *testing.T) *App {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)
	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	return a
}

func TestReloadConfig_FiresOnCtrlL(t *testing.T) {
	a := newReloadApp(t)
	called := false
	a.ReloadConfig = func() (string, error) {
		called = true
		return "config reloaded (theme=light, voice=false)", nil
	}
	a.handleKey(tea.KeyPressMsg{Code: 'l', Mod: tea.ModCtrl})
	if !called {
		t.Fatal("ReloadConfig should have been called")
	}
	if a.transientHint == "" {
		t.Errorf("transientHint should be set; got empty")
	}
}

func TestReloadConfig_ErrorSurfacedAsHint(t *testing.T) {
	a := newReloadApp(t)
	a.ReloadConfig = func() (string, error) {
		return "", errors.New("permission denied")
	}
	a.handleKey(tea.KeyPressMsg{Code: 'l', Mod: tea.ModCtrl})
	if a.transientHint == "" || a.transientHint[:len("config reload failed")] != "config reload failed" {
		t.Errorf("expected error hint, got %q", a.transientHint)
	}
}

func TestReloadConfig_NilHookIsNoop(t *testing.T) {
	a := newReloadApp(t)
	// ReloadConfig left nil — Ctrl+L should not panic and shouldn't set
	// a hint since there's nothing meaningful to report.
	a.handleKey(tea.KeyPressMsg{Code: 'l', Mod: tea.ModCtrl})
	if a.transientHint != "" {
		t.Errorf("expected empty hint when ReloadConfig is nil, got %q", a.transientHint)
	}
}

func TestTransientHint_ClearedByNextKey(t *testing.T) {
	a := newReloadApp(t)
	a.transientHint = "previously toasted"
	// Any non-Ctrl+L key should wipe the hint.
	a.handleKey(tea.KeyPressMsg{Code: 'k', Text: "k"})
	if a.transientHint != "" {
		t.Errorf("hint should clear on next key, got %q", a.transientHint)
	}
}

func TestTransientHint_PreservedAcrossCtrlL(t *testing.T) {
	a := newReloadApp(t)
	a.ReloadConfig = func() (string, error) { return "ok", nil }
	a.handleKey(tea.KeyPressMsg{Code: 'l', Mod: tea.ModCtrl})
	if a.transientHint != "ok" {
		t.Fatalf("first ctrl+l: hint = %q, want ok", a.transientHint)
	}
	// A second Ctrl+L should overwrite (not erase before setting).
	a.ReloadConfig = func() (string, error) { return "ok2", nil }
	a.handleKey(tea.KeyPressMsg{Code: 'l', Mod: tea.ModCtrl})
	if a.transientHint != "ok2" {
		t.Errorf("second ctrl+l: hint = %q, want ok2", a.transientHint)
	}
}
