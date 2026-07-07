package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestCLI_PermsRulesListTSV covers KKKK1: --format tsv on `perms
// rules list` produces a human-scannable table; default stays JSON
// for back-compat.
func TestCLI_PermsRulesListTSV(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	dir := t.TempDir()
	policyFile := filepath.Join(dir, "policy.json")
	body := `{"policies":[
		{"scope":"workspace","tool_name_pattern":"shell","action":"ask"},
		{"scope":"workspace","scope_id":"ws_main","tool_name_pattern":"fs.write","path_pattern":"/tmp/*","action":"allow","annotations_filter":{"safe":true}}
	]}`
	if err := os.WriteFile(policyFile, []byte(body), 0o644); err != nil {
		t.Fatalf("write policy: %v", err)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "set", policyFile); code != 0 {
		t.Fatalf("perms rules set: exit %d", code)
	}

	// TSV mode.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "list", "--format", "tsv")
	if code != 0 {
		t.Fatalf("perms rules list --format tsv: exit %d", code)
	}
	for _, want := range []string{
		"scope\tscope_id\ttool_pattern\tpath_pattern\taction\tannotations",
		"workspace\t*\tshell\t-\task\t-",
		"workspace\tws_main\tfs.write\t/tmp/*\tallow\tsafe=true",
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected TSV row %q in: %q", want, stdout)
		}
	}

	// Default mode stays JSON (back-compat).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "list")
	if code != 0 {
		t.Fatalf("perms rules list (default): exit %d", code)
	}
	if !strings.Contains(stdout, `"policies"`) {
		t.Errorf("expected default JSON shape, got: %q", stdout)
	}

	// Unknown format -> exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "list", "--format", "yaml"); code != 2 {
		t.Errorf("--format yaml: want exit 2, got %d", code)
	}
}

// TestCLI_PermsRules covers MMM4: install a policy via the CLI,
// trigger a permission-requesting scenario, verify the request
// auto-resolves with the policy's action (no manual allow/deny).
func TestCLI_PermsRules(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	dir := t.TempDir()
	policyFile := filepath.Join(dir, "policy.json")
	if err := os.WriteFile(policyFile,
		[]byte(`{"policies":[{"scope":"workspace","tool_name_pattern":"shell","action":"deny"}]}`),
		0o644); err != nil {
		t.Fatalf("write policy: %v", err)
	}

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "set", policyFile); code != 0 {
		t.Fatalf("perms rules set: exit %d", code)
	}
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "list")
	if code != 0 || !strings.Contains(stdout, `"shell"`) ||
		!strings.Contains(stdout, `"deny"`) {
		t.Fatalf("perms rules list missing fields: code=%d out=%q", code, stdout)
	}

	// Trigger a permission scenario.
	sid := createSession(t, url, "rules-target")
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "delete the temp dir"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	// Wait for the scenario's permission step to fire + auto-resolve.
	deadline := time.Now().Add(3 * time.Second)
	var permsOut string
	for time.Now().Before(deadline) {
		permsOut, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"perms", "list", sid)
		if strings.Contains(permsOut, "resolved") && strings.Contains(permsOut, "deny") {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !strings.Contains(permsOut, "resolved") || !strings.Contains(permsOut, "deny") {
		t.Errorf("expected auto-resolved/deny permission, got %q", permsOut)
	}

	// Clear and verify the list is empty (and the next scenario would
	// stay pending; not exercised here to keep the test fast).
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "clear"); code != 0 {
		t.Fatalf("perms rules clear: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "rules", "list")
	if !strings.Contains(stdout, `"policies": []`) && !strings.Contains(stdout, `"policies": null`) {
		t.Errorf("expected empty policies after clear, got %q", stdout)
	}
}

// TestCLI_PermsListJSON covers OOOOO1: --format json on
// `gact perms list` returns the raw PermissionWire array including
// the full ToolCall (tool_name + input args + annotations) which
// the TSV view loses. Default tsv preserved.
func TestCLI_PermsListJSON(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "perms-json-target")

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "delete the temp dir"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	// Wait for the permission to register.
	deadline := time.Now().Add(3 * time.Second)
	var pid string
	for time.Now().Before(deadline) {
		stdout, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"perms", "list", sid)
		for _, line := range strings.Split(stdout, "\n") {
			if strings.HasPrefix(line, "perm_") {
				pid = strings.SplitN(line, "\t", 2)[0]
				break
			}
		}
		if pid != "" {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if pid == "" {
		t.Fatalf("permission never appeared")
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", sid, "--format", "json")
	if code != 0 {
		t.Fatalf("perms list --format json: exit %d", code)
	}
	var arr []struct {
		ID       string `json:"id"`
		Status   string `json:"status"`
		ToolCall struct {
			ToolName string         `json:"tool_name"`
			Input    map[string]any `json:"input"`
		} `json:"tool_call"`
	}
	if err := json.Unmarshal([]byte(stdout), &arr); err != nil {
		t.Fatalf("parse: %v\n  raw=%q", err, stdout)
	}
	if len(arr) != 1 {
		t.Fatalf("expected 1 perm, got %d", len(arr))
	}
	if arr[0].ID != pid {
		t.Errorf("id mismatch: %q vs %q", arr[0].ID, pid)
	}
	if arr[0].Status != "pending" {
		t.Errorf("status = %q, want pending", arr[0].Status)
	}
	// JSON-only payload: tool name + input args.
	if arr[0].ToolCall.ToolName == "" {
		t.Errorf("expected tool_name to be populated; got %+v", arr[0].ToolCall)
	}
	if _, ok := arr[0].ToolCall.Input["command"]; !ok {
		t.Errorf("expected tool_call.input.command in JSON view; got %+v", arr[0].ToolCall.Input)
	}

	// Default tsv still works (back-compat with TestCLI_Perms).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", sid)
	if code != 0 {
		t.Fatalf("perms list (default tsv): exit %d", code)
	}
	if !strings.Contains(stdout, pid) || !strings.Contains(stdout, "pending") {
		t.Errorf("default tsv missing pid/pending: %q", stdout)
	}

	// Unknown format -> exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", sid, "--format", "yaml"); code != 2 {
		t.Errorf("perms list --format yaml: want exit 2, got %d", code)
	}
}

// TestCLI_Perms covers RR1: send a permission-triggering message,
// list perms, find the pending one, allow it, list again and verify
// the action lands as "resolved/allow".
func TestCLI_Perms(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "perms-target")

	// Trigger a permission prompt by sending a "delete" keyword.
	_, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "delete the temp dir")
	if code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	// Give the scenario a beat to register the pending permission.
	time.Sleep(700 * time.Millisecond)

	// List -> find the pending one.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", "--pending", sid)
	if code != 0 {
		t.Fatalf("perms list: exit %d", code)
	}
	if !strings.Contains(stdout, "pending") {
		t.Fatalf("expected pending entry in stdout: %q", stdout)
	}
	pid := strings.SplitN(strings.TrimSpace(stdout), "\t", 2)[0]
	if !strings.HasPrefix(pid, "perm_") {
		t.Fatalf("first column doesn't look like a perm id: %q", pid)
	}

	// Allow.
	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "allow", pid)
	if code != 0 {
		t.Fatalf("perms allow: exit %d", code)
	}

	// Re-list, expect resolved.
	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", sid)
	if !strings.Contains(stdout, "resolved\tallow") {
		t.Errorf("post-allow list missing resolved/allow row: %q", stdout)
	}
}
