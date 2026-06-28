package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// TestCLI_HooksListFilter covers XXXX1: --event filters by hook
// event type and --scope by scope kind (global|session|workspace).
// Seeds hooks in all three scopes so each filter has something to
// keep + drop.
func TestCLI_HooksListFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "hooks-filter-target")
	add := func(args ...string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			append([]string{"hooks", "add", "--command", "/bin/true"}, args...)...)
		if code != 0 {
			t.Fatalf("hooks add %v: exit %d", args, code)
		}
		return strings.TrimSpace(stdout)
	}
	hGlobal := add("--event", "*")
	hSess := add("--event", "tool.call.completed", "--session", sid)
	hWS := add("--event", "session.status_changed", "--workspace", "ws_default")

	// --event "*" keeps only global one.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list", "--event", "*")
	if code != 0 {
		t.Fatalf("--event *: exit %d", code)
	}
	if !strings.Contains(stdout, hGlobal) {
		t.Errorf("expected global hook %s in --event * output: %q", hGlobal, stdout)
	}
	if strings.Contains(stdout, hSess) || strings.Contains(stdout, hWS) {
		t.Errorf("--event * leaked non-* hooks: %q", stdout)
	}

	// --scope session keeps only the session-scoped one.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list", "--scope", "session")
	if code != 0 {
		t.Fatalf("--scope session: exit %d", code)
	}
	if !strings.Contains(stdout, hSess) {
		t.Errorf("expected session-scoped hook %s in: %q", hSess, stdout)
	}
	if strings.Contains(stdout, hGlobal) || strings.Contains(stdout, hWS) {
		t.Errorf("--scope session leaked others: %q", stdout)
	}

	// --scope workspace keeps only the workspace-scoped one.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list", "--scope", "workspace")
	if code != 0 {
		t.Fatalf("--scope workspace: exit %d", code)
	}
	if !strings.Contains(stdout, hWS) {
		t.Errorf("expected workspace-scoped hook %s in: %q", hWS, stdout)
	}
	if strings.Contains(stdout, hGlobal) || strings.Contains(stdout, hSess) {
		t.Errorf("--scope workspace leaked others: %q", stdout)
	}

	// Combined filter: --event * --scope global keeps global hook.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list", "--event", "*", "--scope", "global")
	if code != 0 {
		t.Fatalf("combined filter: exit %d", code)
	}
	if !strings.Contains(stdout, hGlobal) {
		t.Errorf("combined filter dropped global hook: %q", stdout)
	}

	// Unknown --scope -> exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list", "--scope", "nope"); code != 2 {
		t.Errorf("--scope nope: want exit 2, got %d", code)
	}
}

// TestCLI_Hooks covers MMM3: register a hook, trigger an event,
// verify the hook script captured the event JSON, then delete it.
func TestCLI_Hooks(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	dir := t.TempDir()
	captured := filepath.Join(dir, "hook-fired.json")
	hookCommand := filepath.Join(dir, "hook.sh")
	if runtime.GOOS == "windows" {
		src := filepath.Join(dir, "hook.go")
		if err := os.WriteFile(src, []byte(fmt.Sprintf(`package main

import (
	"io"
	"os"
)

func main() {
	body, err := io.ReadAll(os.Stdin)
	if err != nil {
		os.Exit(1)
	}
	if err := os.WriteFile(%q, body, 0o644); err != nil {
		os.Exit(1)
	}
}
`, captured)), 0o644); err != nil {
			t.Fatalf("write hook helper source: %v", err)
		}
		hookCommand = testBinaryPath(dir, "hook")
		build := exec.Command("go", "build", "-o", hookCommand, src)
		if out, err := build.CombinedOutput(); err != nil {
			t.Fatalf("build hook helper: %v\n%s", err, out)
		}
	} else if err := os.WriteFile(hookCommand,
		[]byte("#!/bin/sh\ncat > "+captured+"\n"), 0o755); err != nil {
		t.Fatalf("write hook script: %v", err)
	}

	// Register a hook on the `notification` event firing the script.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "add", "--event", "notification", "--command", hookCommand)
	if code != 0 {
		t.Fatalf("hooks add: exit %d", code)
	}
	hid := strings.TrimSpace(stdout)
	if !strings.HasPrefix(hid, "hk_") {
		t.Fatalf("hooks add returned bad id %q", stdout)
	}

	// Listing must show the hook with our script as the target.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list")
	if code != 0 || !strings.Contains(stdout, hid) || !strings.Contains(stdout, hookCommand) {
		t.Fatalf("hooks list missing entry: code=%d out=%q", code, stdout)
	}

	// Trigger a notification by reconnecting an MCP server (MMM1
	// emits one). The dispatcher fires asynchronously; give it a
	// moment to write the file.
	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "mcp_fake"); code != 0 {
		t.Fatalf("mcp reconnect: exit %d", code)
	}
	deadline := time.Now().Add(3 * time.Second)
	var body []byte
	for time.Now().Before(deadline) {
		// Both checks: file must exist AND have non-empty body. The
		// hook script writes via `cat > file`, so file appears empty
		// briefly before the content lands. Polling Stat alone races.
		if b, err := os.ReadFile(captured); err == nil && len(b) > 0 {
			body = b
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if len(body) == 0 {
		t.Fatalf("hook never fired (no body within deadline)")
	}
	if !strings.Contains(string(body), `"notification"`) ||
		!strings.Contains(string(body), "MCP server reconnected") {
		t.Errorf("hook body missing expected fields: %s", body)
	}

	// Cleanup: rm the hook, list must drop to zero rows.
	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "rm", hid); code != 0 {
		t.Fatalf("hooks rm: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"hooks", "list")
	if strings.TrimSpace(stdout) != "" {
		t.Errorf("hooks list after rm: expected empty, got %q", stdout)
	}
}
