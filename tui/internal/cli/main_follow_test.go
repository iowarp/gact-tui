package cli

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// TestCLI_Follow covers snapshot plus streamed output in text mode.
func TestCLI_Follow(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "follow-target")

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "snapshot ALPHA"); code != 0 {
		t.Fatalf("send ALPHA: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait ALPHA: exit %d", code)
	}

	followDone := make(chan string, 1)
	go func() {
		stdout, _, _ := runGactWithDuration(t, bin,
			map[string]string{"GACT_BACKEND": url},
			5*time.Second,
			"follow", sid)
		followDone <- stdout
	}()
	time.Sleep(800 * time.Millisecond)
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "stream BRAVO"); code != 0 {
		t.Fatalf("send BRAVO: exit %d", code)
	}

	out := <-followDone
	if !strings.Contains(out, "snapshot ALPHA") {
		t.Errorf("follow should print existing log: %q", out)
	}
	if !strings.Contains(out, "stream BRAVO") {
		t.Errorf("follow should stream new message: %q", out)
	}
}

// TestCLI_FollowJSON covers snapshot plus streamed output in NDJSON mode.
func TestCLI_FollowJSON(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "follow-json-target")

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "snapshot ALPHA"); code != 0 {
		t.Fatalf("send ALPHA: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait ALPHA: exit %d", code)
	}

	followDone := make(chan string, 1)
	go func() {
		stdout, _, _ := runGactWithDuration(t, bin,
			map[string]string{"GACT_BACKEND": url},
			5*time.Second,
			"follow", sid, "--format", "json")
		followDone <- stdout
	}()
	time.Sleep(800 * time.Millisecond)
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "stream BRAVO"); code != 0 {
		t.Fatalf("send BRAVO: exit %d", code)
	}

	out := <-followDone
	lines := strings.Split(strings.TrimRight(out, "\n"), "\n")
	if len(lines) < 2 {
		t.Fatalf("expected >=2 NDJSON lines, got %d: %q", len(lines), out)
	}
	type msg struct {
		ID        string `json:"id"`
		SessionID string `json:"session_id"`
		Role      string `json:"role"`
		Parts     []struct {
			Type string `json:"type"`
			Text string `json:"text,omitempty"`
		} `json:"parts"`
	}
	sawAlpha, sawBravo := false, false
	for i, line := range lines {
		if line == "" {
			continue
		}
		var m msg
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("line %d not JSON: %v\n  raw=%q", i, err, line)
		}
		if m.SessionID != sid {
			t.Errorf("line %d wrong session_id: %q", i, m.SessionID)
		}
		for _, p := range m.Parts {
			if strings.Contains(p.Text, "snapshot ALPHA") {
				sawAlpha = true
			}
			if strings.Contains(p.Text, "stream BRAVO") {
				sawBravo = true
			}
		}
	}
	if !sawAlpha {
		t.Errorf("snapshot ALPHA not in NDJSON parts: %q", out)
	}
	if !sawBravo {
		t.Errorf("stream BRAVO not in NDJSON parts: %q", out)
	}
}
