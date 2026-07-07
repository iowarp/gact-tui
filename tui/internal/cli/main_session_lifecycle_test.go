package cli

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

// TestCLI_Fork covers forking an existing session and listing children.
func TestCLI_Fork(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	parent := createSession(t, url, "fork-parent")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"fork", parent, "--title", "fork-child")
	if code != 0 {
		t.Fatalf("fork: exit %d", code)
	}
	child := strings.TrimSpace(stdout)
	if child == "" || child == parent {
		t.Fatalf("expected new child id distinct from parent; got %q (parent %q)", child, parent)
	}

	resp, err := http.Get(url + "/v1/sessions?parent_session_id=" + parent)
	if err != nil {
		t.Fatalf("list children: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), child) {
		t.Errorf("expected child %q in parent's children list: %s", child, body)
	}
}

// TestCLI_Workspaces covers listing workspaces in TSV and JSON.
func TestCLI_Workspaces(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"workspaces", "list")
	if code != 0 {
		t.Fatalf("workspaces list: exit %d", code)
	}
	if !strings.Contains(stdout, "ws_default") {
		t.Errorf("expected ws_default in TSV output: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"workspaces", "list", "--format", "json")
	if code != 0 {
		t.Fatalf("workspaces list json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id"`) || !strings.Contains(stdout, `"ws_default"`) {
		t.Errorf("expected JSON with ws_default id: %q", stdout)
	}
}

// TestCLI_ArchiveRoundTrip covers archive hiding from default list and
// unarchive restoring visibility.
func TestCLI_ArchiveRoundTrip(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"new", "--title", "archive-target")
	if code != 0 {
		t.Fatalf("new: exit %d", code)
	}
	sid := strings.TrimSpace(stdout)

	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "archive", sid)
	if code != 0 {
		t.Fatalf("archive: exit %d", code)
	}

	listOut, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	if strings.Contains(listOut, sid) {
		t.Errorf("archived session still in default list: %q", listOut)
	}

	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "unarchive", sid)
	if code != 0 {
		t.Fatalf("unarchive: exit %d", code)
	}
	listOut, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	if !strings.Contains(listOut, sid) {
		t.Errorf("unarchived session missing from list: %q", listOut)
	}

	_, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "delete", sid)
}

// TestCLI_DeleteRoundTrip covers new then delete, with list confirming removal.
func TestCLI_DeleteRoundTrip(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "new")
	if code != 0 {
		t.Fatalf("new: exit %d", code)
	}
	sid := strings.TrimSpace(stdout)

	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "delete", sid)
	if code != 0 {
		t.Fatalf("delete: exit %d", code)
	}

	listOut, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	if code != 0 {
		t.Fatalf("list: exit %d", code)
	}
	if strings.Contains(listOut, sid) {
		t.Errorf("session %q still in list after delete: %s", sid, listOut)
	}
}

// TestCLI_RenameUpdatesTitle covers rename then list.
func TestCLI_RenameUpdatesTitle(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"new", "--title", "before")
	if code != 0 {
		t.Fatalf("new: exit %d", code)
	}
	sid := strings.TrimSpace(stdout)

	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"rename", sid, "after-rename")
	if code != 0 {
		t.Fatalf("rename: exit %d", code)
	}

	listOut, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	if !strings.Contains(listOut, "after-rename") {
		t.Errorf("renamed title missing from list: %s", listOut)
	}
}

// TestCLI_New covers session creation and subsequent list visibility.
func TestCLI_New(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"new", "--title", "shell-created")
	if code != 0 {
		t.Fatalf("new: exit %d, stderr=%q", code, stderr)
	}
	sid := strings.TrimSpace(stdout)
	if !strings.HasPrefix(sid, "sess_") {
		t.Fatalf("new: stdout doesn't look like a session id: %q", stdout)
	}

	listOut, _, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url}, "list")
	if code != 0 {
		t.Fatalf("list after new: exit %d", code)
	}
	if !strings.Contains(listOut, sid) {
		t.Errorf("list didn't include the new session %q: %q", sid, listOut)
	}
}

// TestCLI_SessionAliasCRUD covers the `gact session <verb>` alias layer.
func TestCLI_SessionAliasCRUD(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	env := map[string]string{"GACT_BACKEND": url}

	stdout, _, code := runGact(t, bin, env, "session", "create", "--title", "alias-test")
	if code != 0 {
		t.Fatalf("session create: exit %d", code)
	}
	sid := strings.TrimSpace(stdout)
	if !strings.HasPrefix(sid, "sess_") {
		t.Fatalf("session create should print sess_xxx; got %q", stdout)
	}
	defer func() { _, _, _ = runGact(t, bin, env, "session", "rm", sid) }()

	stdout, _, code = runGact(t, bin, env, "session", "list")
	if code != 0 {
		t.Fatalf("session list: exit %d", code)
	}
	if !strings.Contains(stdout, sid) || !strings.Contains(stdout, "alias-test") {
		t.Errorf("session list missing new session: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, env, "session", "show", sid)
	if code != 0 {
		t.Fatalf("session show: exit %d", code)
	}
	if !strings.Contains(stdout, "title:") || !strings.Contains(stdout, "alias-test") {
		t.Errorf("session show missing title: %q", stdout)
	}

	_, _, code = runGact(t, bin, env, "session", "rename", sid, "alias-test-renamed")
	if code != 0 {
		t.Fatalf("session rename: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, env, "session", "show", sid)
	if !strings.Contains(stdout, "alias-test-renamed") {
		t.Errorf("session show after rename missing new title: %q", stdout)
	}

	_, _, code = runGact(t, bin, env, "session", "rm", sid)
	if code != 0 {
		t.Fatalf("session rm: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, env, "session", "list")
	if strings.Contains(stdout, sid) {
		t.Errorf("session list still shows removed sid %s: %q", sid, stdout)
	}

	_, stderr, code := runGact(t, bin, env, "session", "bogus")
	if code != 2 {
		t.Errorf("session bogus: exit %d, want 2", code)
	}
	if !strings.Contains(stderr, "unknown verb") {
		t.Errorf("stderr: %q", stderr)
	}
}
