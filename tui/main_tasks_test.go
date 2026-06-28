package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestCLI_TasksSummary covers FFFF1: aggregate task counts across
// sessions. Seeds two sessions with mixed-status tasks, asserts the
// summary table contains both rows + a TOTAL footer with correct
// aggregates.
func TestCLI_TasksSummary(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid1 := createSession(t, url, "summary-A")
	sid2 := createSession(t, url, "summary-B")

	addTask := func(sid, title string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"tasks", "add", sid, title)
		if code != 0 {
			t.Fatalf("tasks add: exit %d", code)
		}
		return strings.TrimSpace(stdout)
	}
	setStatus := func(tid, status string) {
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"tasks", "set", tid, "--status", status); code != 0 {
			t.Fatalf("tasks set: exit %d", code)
		}
	}
	addTask(sid1, "A pending")
	t1b := addTask(sid1, "A completed")
	setStatus(t1b, "completed")
	addTask(sid2, "B pending")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "summary")
	if code != 0 {
		t.Fatalf("tasks summary: exit %d", code)
	}
	// Both sids should appear; TOTAL row must show 2 pending + 1
	// completed (this run owns those tasks; emulator clears between
	// startEmulator calls so no other tests' tasks leak in).
	if !strings.Contains(stdout, sid1) || !strings.Contains(stdout, sid2) {
		t.Errorf("expected both sids in summary: %q", stdout)
	}
	if !strings.Contains(stdout, "TOTAL\t(2 sessions)\t2\t0\t1\t0") {
		t.Errorf("expected TOTAL row aggregating 2 sessions / 2P / 0R / 1C / 0F: %q", stdout)
	}
}

// TestCLI_TasksListStatusFilter covers WWWW1: --status filters
// tasks to one or a comma-separated list of statuses. Unknown
// values exit 2 without listing.
func TestCLI_TasksListStatusFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "tasks-status-target")
	add := func(title string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"tasks", "add", sid, title)
		if code != 0 {
			t.Fatalf("tasks add %s: exit %d", title, code)
		}
		return strings.TrimSpace(stdout)
	}
	tP := add("pending one")
	tR := add("running one")
	tC := add("completed one")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "set", tR, "--status", "running"); code != 0 {
		t.Fatalf("set running: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "set", tC, "--status", "completed"); code != 0 {
		t.Fatalf("set completed: exit %d", code)
	}

	// Single-status filter.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid, "--status", "pending")
	if code != 0 {
		t.Fatalf("tasks list --status pending: exit %d", code)
	}
	if !strings.Contains(stdout, tP) || strings.Contains(stdout, tR) || strings.Contains(stdout, tC) {
		t.Errorf("expected only pending row %s, got: %q", tP, stdout)
	}

	// Comma-list filter.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid, "--status", "pending,completed")
	if code != 0 {
		t.Fatalf("tasks list --status pending,completed: exit %d", code)
	}
	if !strings.Contains(stdout, tP) || !strings.Contains(stdout, tC) {
		t.Errorf("expected pending+completed in: %q", stdout)
	}
	if strings.Contains(stdout, tR) {
		t.Errorf("running %s should be filtered out: %q", tR, stdout)
	}

	// JSON mode + filter still emits an array shape.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid, "--status", "running", "--format", "json")
	if code != 0 {
		t.Fatalf("tasks list --status running --format json: exit %d", code)
	}
	var items []struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal([]byte(stdout), &items); err != nil {
		t.Fatalf("json parse: %v\n  raw=%q", err, stdout)
	}
	if len(items) != 1 || items[0].Status != "running" || items[0].ID != tR {
		t.Errorf("expected exactly 1 running task with id=%s, got: %+v", tR, items)
	}

	// Unknown status -> exit 2 without listing.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid, "--status", "nonsense"); code != 2 {
		t.Errorf("tasks list --status nonsense: want exit 2, got %d", code)
	}
}

// TestCLI_Tasks covers MMM5: full session-task lifecycle via CLI.
func TestCLI_Tasks(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "tasks-target")

	// Add - should print a tsk_ id.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "add", sid, "Run unit tests")
	if code != 0 {
		t.Fatalf("tasks add: exit %d", code)
	}
	tid := strings.TrimSpace(stdout)
	if !strings.HasPrefix(tid, "tsk_") {
		t.Fatalf("expected tsk_ id, got %q", stdout)
	}

	// List - must show pending status + the title.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid)
	if code != 0 || !strings.Contains(stdout, tid) ||
		!strings.Contains(stdout, "pending") || !strings.Contains(stdout, "Run unit tests") {
		t.Fatalf("tasks list missing fields: code=%d out=%q", code, stdout)
	}

	// Set status to running - list should reflect it.
	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "set", tid, "--status", "running"); code != 0 {
		t.Fatalf("tasks set: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid)
	if !strings.Contains(stdout, "running") {
		t.Errorf("expected running status after set: %q", stdout)
	}

	// Rm - list should be empty.
	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "rm", tid); code != 0 {
		t.Fatalf("tasks rm: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "list", sid)
	if strings.TrimSpace(stdout) != "" {
		t.Errorf("expected empty list after rm: %q", stdout)
	}
}
