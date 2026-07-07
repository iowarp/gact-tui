package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCLI_InfoIncludePerms(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "info-perms-target")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "delete the temp dir"); code != 0 {
		t.Fatalf("send delete: exit %d", code)
	}

	deadline := time.Now().Add(3 * time.Second)
	var permID string
	for time.Now().Before(deadline) {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"perms", "list", sid)
		if code == 0 {
			for _, line := range strings.Split(stdout, "\n") {
				fields := strings.Split(line, "\t")
				if len(fields) > 0 && strings.HasPrefix(fields[0], "perm_") {
					permID = fields[0]
					break
				}
			}
		}
		if permID != "" {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if permID == "" {
		t.Fatalf("permission never appeared")
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "perms")
	if code != 0 {
		t.Fatalf("info --include perms: exit %d", code)
	}
	for _, want := range []string{"--- perms ---", "pending\t" + permID} {
		if !strings.Contains(stdout, want) {
			t.Errorf("text mode missing %q in: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "perms", "--format", "json")
	if code != 0 {
		t.Fatalf("info --include perms --format json: exit %d", code)
	}
	var out struct {
		Session struct {
			ID string `json:"id"`
		} `json:"session"`
		Perms []struct {
			ID     string `json:"id"`
			Status string `json:"status"`
			Action string `json:"action,omitempty"`
		} `json:"perms"`
	}
	if err := json.Unmarshal([]byte(stdout), &out); err != nil {
		t.Fatalf("json parse: %v\n  raw=%q", err, stdout)
	}
	if out.Session.ID != sid {
		t.Errorf("session.id mismatch: %q vs %q", out.Session.ID, sid)
	}
	if len(out.Perms) != 1 || out.Perms[0].ID != permID || out.Perms[0].Status != "pending" {
		t.Errorf("expected 1 pending perm with id=%s, got: %+v", permID, out.Perms)
	}

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "deny", permID); code != 0 {
		t.Fatalf("perms deny: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait idle: exit %d", code)
	}
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "perms")
	if code != 0 {
		t.Fatalf("info --include perms (post-resolve): exit %d", code)
	}
	if !strings.Contains(stdout, "resolved\t"+permID) {
		t.Errorf("expected resolved status row, got: %q", stdout)
	}
	if !strings.Contains(stdout, "action=deny") {
		t.Errorf("expected action=deny suffix, got: %q", stdout)
	}
}

// TestCLI_InfoInclude covers `gact info --include tasks,hooks` in text and
// JSON modes.
func TestCLI_InfoInclude(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "info-include-target")
	add := func(verb string, args ...string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			append([]string{verb}, args...)...)
		if code != 0 {
			t.Fatalf("%s: exit %d", verb, code)
		}
		return strings.TrimSpace(stdout)
	}
	t1 := add("tasks", "add", sid, "do thing 1")
	t2 := add("tasks", "add", sid, "do thing 2")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tasks", "set", t2, "--status", "completed"); code != 0 {
		t.Fatalf("tasks set: exit %d", code)
	}
	hid := add("hooks", "add", "--event", "*", "--command", "/bin/true", "--session", sid)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "tasks,hooks")
	if code != 0 {
		t.Fatalf("info --include: exit %d", code)
	}
	for _, want := range []string{
		"--- tasks ---", "do thing 1", "do thing 2", "completed\t" + t2,
		"--- hooks ---", hid, "session=" + sid,
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("text mode missing %q in: %q", want, stdout)
		}
	}
	if !strings.Contains(stdout, "pending\t"+t1) {
		t.Errorf("expected pending status row for t1=%s in: %q", t1, stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "tasks,hooks", "--format", "json")
	if code != 0 {
		t.Fatalf("info --include --format json: exit %d", code)
	}
	var out struct {
		Session struct {
			ID string `json:"id"`
		} `json:"session"`
		Tasks []struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"tasks"`
		Hooks []struct {
			ID    string `json:"id"`
			Event string `json:"event"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal([]byte(stdout), &out); err != nil {
		t.Fatalf("json parse: %v\n  raw=%q", err, stdout)
	}
	if out.Session.ID != sid {
		t.Errorf("session.id mismatch: %q vs %q", out.Session.ID, sid)
	}
	if len(out.Tasks) != 2 || len(out.Hooks) != 1 {
		t.Errorf("expected 2 tasks + 1 hook, got %d / %d", len(out.Tasks), len(out.Hooks))
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid)
	if code != 0 {
		t.Fatalf("info bare: exit %d", code)
	}
	if strings.Contains(stdout, "--- tasks ---") {
		t.Errorf("bare info should not include tasks section: %q", stdout)
	}

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid, "--include", "nonsense"); code != 2 {
		t.Errorf("info --include nonsense: want exit 2, got %d", code)
	}
}

// TestCLI_Info covers a single session's metadata in text and JSON modes.
func TestCLI_Info(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "info-roundtrip")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", sid)
	if code != 0 {
		t.Fatalf("info: exit %d", code)
	}
	if !strings.Contains(stdout, "info-roundtrip") {
		t.Errorf("expected title in info text: %q", stdout)
	}
	if !strings.Contains(stdout, "status:") {
		t.Errorf("expected status: line: %q", stdout)
	}
	hasStatus := false
	for _, st := range []string{"idle", "running", "waiting", "error"} {
		if strings.Contains(stdout, "status:        "+st) {
			hasStatus = true
			break
		}
	}
	if !hasStatus {
		t.Errorf("status not in known set: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"info", "--format", "json", sid)
	if code != 0 {
		t.Fatalf("info json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id"`) || !strings.Contains(stdout, `"info-roundtrip"`) {
		t.Errorf("expected JSON with id+title: %q", stdout)
	}
}

func TestCLI_InfoDetachedField(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sidPlain := createSession(t, url, "info-detach-plain")
	sidWalked := createSession(t, url, "info-detach-walked")

	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	body := fmt.Sprintf(
		`{"records":[{"session_id":%q,"title":"info-detach-walked","backend":%q,"detached_at":"2026-04-20T08:00:00Z"}]}`,
		sidWalked, url,
	)
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	env := map[string]string{"GACT_BACKEND": url, "GACT_DETACHED_PATH": regPath}

	stdout, _, code := runGact(t, bin, env, "info", sidPlain)
	if code != 0 {
		t.Fatalf("info plain: exit %d", code)
	}
	if !strings.Contains(stdout, "detached:      no") {
		t.Errorf("plain session should show 'detached: no': %q", stdout)
	}

	stdout, _, code = runGact(t, bin, env, "info", sidWalked)
	if code != 0 {
		t.Fatalf("info walked: exit %d", code)
	}
	if !strings.Contains(stdout, "detached:      yes") {
		t.Errorf("walked session should show 'detached: yes': %q", stdout)
	}

	stdout, _, code = runGact(t, bin, env, "info", "--format", "json", sidWalked)
	if code != 0 {
		t.Fatalf("info json: exit %d", code)
	}
	if !strings.Contains(stdout, `"detached": true`) {
		t.Errorf("expected `\"detached\": true` in JSON: %q", stdout)
	}
	stdout, _, code = runGact(t, bin, env, "info", "--format", "json", sidPlain)
	if code != 0 {
		t.Fatalf("info json plain: exit %d", code)
	}
	if !strings.Contains(stdout, `"detached": false`) {
		t.Errorf("expected `\"detached\": false` in JSON: %q", stdout)
	}
}
