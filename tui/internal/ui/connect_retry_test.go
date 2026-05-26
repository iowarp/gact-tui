package ui

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestConnectRetry_ConnectStageEmitsBackoffTick(t *testing.T) {
	a := New("http://unused")
	model, cmd := a.Update(errMsg{err: errors.New("dial tcp: connection refused"), stage: "capabilities"})
	a = model.(*App)
	if a.stage != StageError {
		t.Errorf("stage = %v, want StageError", a.stage)
	}
	if a.connectRetryAttempts != 1 {
		t.Errorf("attempts = %d, want 1", a.connectRetryAttempts)
	}
	if cmd == nil {
		t.Fatal("expected a tea.Tick cmd; got nil")
	}
	// Run the cmd — it returns a tea.tickMsg that we can't introspect
	// directly, but the fact that it returned a non-nil cmd confirms the
	// retry was scheduled.
}

func TestConnectRetry_NonConnectStageDoesNotRetry(t *testing.T) {
	a := New("http://unused")
	_, cmd := a.Update(errMsg{err: errors.New("nope"), stage: "post-message"})
	if cmd != nil {
		t.Errorf("non-connect stage should not schedule a retry; got cmd=%v", cmd)
	}
	if a.connectRetryAttempts != 0 {
		t.Errorf("attempts should stay 0, got %d", a.connectRetryAttempts)
	}
}

func TestConnectRetry_RetryConnectMsgOnlyFiresInStageError(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	_, cmd := a.Update(retryConnectMsg{})
	if cmd != nil {
		t.Errorf("retry should not run when stage is Ready; got cmd=%v", cmd)
	}
}

func TestConnectRetry_RetryConnectMsgRunsConnectFromStageError(t *testing.T) {
	a := New("http://unused")
	a.stage = StageError
	model, cmd := a.Update(retryConnectMsg{})
	a = model.(*App)
	if a.stage != StageConnecting {
		t.Errorf("stage after retry = %v, want StageConnecting", a.stage)
	}
	if cmd == nil {
		t.Error("retry should dispatch a connect cmd")
	}
}

func TestConnectRetry_CtrlRFromStageErrorRetriesImmediately(t *testing.T) {
	a := New("http://unused")
	a.stage = StageError
	a.connectRetryAttempts = 5

	model, cmd := a.handleKey(tea.KeyPressMsg{Code: 'r', Mod: tea.ModCtrl})
	a = model.(*App)
	if a.stage != StageConnecting {
		t.Errorf("Ctrl+R should flip to StageConnecting; got %v", a.stage)
	}
	if a.connectRetryAttempts != 0 {
		t.Errorf("Ctrl+R should reset attempts; got %d", a.connectRetryAttempts)
	}
	if cmd == nil {
		t.Error("Ctrl+R should dispatch a connect cmd")
	}
}

func TestConnectRetry_ErrorButtonsUseSemanticHitTargets(t *testing.T) {
	a := New("http://unused")
	a.stage = StageError
	a.stageError = "dial tcp: connection refused"
	a.connectRetryAttempts = 5
	a.MouseEnabled = true
	a.width, a.height = 100, 30

	_ = a.View()
	retry, ok := findHitTargetForTest(a, "button:error:retry")
	if !ok {
		t.Fatal("missing semantic error retry button")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      retry.rect.x,
		Y:      retry.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.stage != StageConnecting {
		t.Fatalf("stage after retry click = %v, want connecting", a.stage)
	}
	if a.connectRetryAttempts != 0 {
		t.Fatalf("retry click attempts = %d, want reset to 0", a.connectRetryAttempts)
	}
	if cmd == nil {
		t.Fatal("retry click should dispatch connect command")
	}

	a.stage = StageError
	a.stageError = "dial tcp: connection refused"
	_ = a.View()
	if _, ok := findHitTargetForTest(a, "button:error:quit"); !ok {
		t.Fatal("missing semantic error quit button")
	}
}

func TestConnectRetry_AttemptsResetOnSuccessfulConnect(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer srv.Close()
	a := New(srv.URL)
	a.connectRetryAttempts = 7

	// Synthesize a successful connect — the connectedMsg handler should
	// reset the counter, even though we didn't go through connectCmd.
	_, _ = a.Update(connectedMsg{})
	if a.connectRetryAttempts != 0 {
		t.Errorf("attempts after successful connect = %d, want 0", a.connectRetryAttempts)
	}
	if a.stage != StageReady {
		t.Errorf("stage = %v, want StageReady", a.stage)
	}
}

func TestConnectRetry_KeysOtherThanCtrlRAndCtrlCAreSwallowedInError(t *testing.T) {
	a := New("http://unused")
	a.stage = StageError
	for _, key := range []rune{'a', 'q', '?', '/', 'n'} {
		_, cmd := a.handleKey(tea.KeyPressMsg{Code: key, Text: string(key)})
		if cmd != nil {
			t.Errorf("key %q should not emit a cmd in StageError; got %v", key, cmd)
		}
		if a.stage != StageError {
			t.Errorf("key %q should not change stage; got %v", key, a.stage)
			a.stage = StageError
		}
	}
}
