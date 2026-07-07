package cli

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// TestCLI_Watch covers status transition rows in TSV mode.
func TestCLI_Watch(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "watch-target")

	go func() {
		time.Sleep(300 * time.Millisecond)
		_, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"send", sid, "hello watcher")
	}()

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"watch", sid, "--interval", "150ms", "--timeout", "20s")
	if code != 0 {
		t.Fatalf("watch: exit %d", code)
	}
	rows := strings.Split(strings.TrimSpace(stdout), "\n")
	if len(rows) < 2 {
		t.Errorf("expected at least 2 transition rows, got %d: %q", len(rows), stdout)
	}
	for _, r := range rows {
		fields := strings.Split(r, "\t")
		if len(fields) != 4 {
			t.Errorf("expected 4 TSV fields per row, got %d in %q", len(fields), r)
		}
	}
}

// TestCLI_WatchJSON covers status transition rows in NDJSON mode.
func TestCLI_WatchJSON(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "watch-json-target")

	go func() {
		time.Sleep(300 * time.Millisecond)
		_, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"send", sid, "hello watcher")
	}()

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"watch", sid, "--format", "json", "--interval", "150ms", "--timeout", "20s")
	if code != 0 {
		t.Fatalf("watch --format json: exit %d", code)
	}
	rows := strings.Split(strings.TrimSpace(stdout), "\n")
	if len(rows) < 2 {
		t.Fatalf("expected >=2 NDJSON rows, got %d: %q", len(rows), stdout)
	}
	type rec struct {
		TS     string `json:"ts"`
		SID    string `json:"sid"`
		Status string `json:"status"`
		Msgs   int    `json:"message_count"`
		Tokens int    `json:"tokens_out"`
	}
	sawIdle := false
	for i, line := range rows {
		var r rec
		if err := json.Unmarshal([]byte(line), &r); err != nil {
			t.Fatalf("row %d not JSON: %v\n  raw=%q", i, err, line)
		}
		if r.SID != sid || r.TS == "" || r.Status == "" {
			t.Errorf("row %d malformed: %+v", i, r)
		}
		if r.Status == "idle" {
			sawIdle = true
		}
	}
	if !sawIdle {
		t.Errorf("expected an idle row before exit; rows=%q", stdout)
	}

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"watch", sid, "--format", "yaml"); code != 2 {
		t.Errorf("watch --format yaml: want exit 2, got %d", code)
	}
}
