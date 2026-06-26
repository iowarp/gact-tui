package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// TestCLI_AgentDeployLifecycle round-trips a locally-spawned adapter through
// deploy, list, stop, and remove.
func TestCLI_AgentDeployLifecycle(t *testing.T) {
	if _, err := exec.LookPath("claude"); err != nil {
		t.Skip("claude CLI not on PATH; agent-deploy e2e needs real adapter init")
	}
	bin := buildGact(t)

	tmp := t.TempDir()
	adapterBin := testBinaryPath(tmp, "gact-claudecode-adapter")
	_, file, _, _ := runtime.Caller(0)
	repoRoot := filepath.Join(filepath.Dir(file), "..")
	build := exec.Command("go", "build", "-o", adapterBin,
		"./adapters/claudecode/cmd/gact-claudecode-adapter")
	build.Dir = repoRoot
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build adapter: %v\n%s", err, out)
	}

	regPath := filepath.Join(tmp, "agents.json")
	env := map[string]string{"GACT_AGENTS_PATH": regPath}

	stdout, stderr, code := runGact(t, bin, env,
		"agent", "deploy", "claudecode", "testagent",
		"--bin", adapterBin, "--cwd", tmp)
	if code != 0 {
		t.Fatalf("agent deploy: exit %d stdout=%q stderr=%q", code, stdout, stderr)
	}
	if !strings.Contains(stderr, "deployed testagent") {
		t.Errorf("expected 'deployed testagent' hint on stderr: %q", stderr)
	}

	defer func() {
		_, _, _ = runGact(t, bin, env, "agent", "rm", "testagent")
	}()

	stdout, _, code = runGact(t, bin, env, "agent", "list", "--format", "tsv")
	if code != 0 {
		t.Fatalf("agent list: exit %d", code)
	}
	if !strings.Contains(stdout, "testagent\t") {
		t.Errorf("list should include testagent row: %q", stdout)
	}
	if !strings.Contains(stdout, "started_at") {
		t.Errorf("list should include started_at column: %q", stdout)
	}
	if !strings.Contains(stdout, "\tyes\t") {
		t.Errorf("list should report alive=yes tsv: %q", stdout)
	}

	_, stderr, code = runGact(t, bin, env, "agent", "stop", "testagent")
	if code != 0 {
		t.Fatalf("agent stop: exit %d stderr=%q", code, stderr)
	}
	time.Sleep(500 * time.Millisecond)
	stdout, _, _ = runGact(t, bin, env, "agent", "list", "--format", "tsv")
	if !strings.Contains(stdout, "\tno\t") {
		t.Errorf("stopped agent should report alive=no: %q", stdout)
	}

	_, _, code = runGact(t, bin, env, "agent", "rm", "testagent")
	if code != 0 {
		t.Fatalf("agent rm: exit %d", code)
	}
	stdout, _, _ = runGact(t, bin, env, "agent", "list")
	if strings.Contains(stdout, "testagent") {
		t.Errorf("rm should drop entry from list: %q", stdout)
	}
}

// TestCLI_AgentDeployLifecycle_Clio walks the same lifecycle against the
// Python clio-agent-gact console script when it is installed.
func TestCLI_AgentDeployLifecycle_Clio(t *testing.T) {
	clioBin, err := exec.LookPath("clio-agent-gact")
	if err != nil {
		t.Skip("clio-agent-gact not on PATH; install with `uv pip install -e /path/to/clio-agent`")
	}
	bin := buildGact(t)
	tmp := t.TempDir()
	regPath := filepath.Join(tmp, "agents.json")
	env := map[string]string{"GACT_AGENTS_PATH": regPath}

	stdout, stderr, code := runGact(t, bin, env,
		"agent", "deploy", "clio", "testclio",
		"--bin", clioBin)
	if code != 0 {
		t.Fatalf("agent deploy clio: exit %d stdout=%q stderr=%q",
			code, stdout, stderr)
	}
	if !strings.Contains(stderr, "deployed testclio") {
		t.Errorf("expected 'deployed testclio' hint on stderr: %q", stderr)
	}
	defer func() {
		_, _, _ = runGact(t, bin, env, "agent", "rm", "testclio")
	}()

	stdout, _, code = runGact(t, bin, env, "agent", "list", "--format", "tsv")
	if code != 0 {
		t.Fatalf("agent list: exit %d", code)
	}
	if !strings.Contains(stdout, "testclio\tclio\t") {
		t.Errorf("list should show 'testclio\\tclio\\t...' row: %q", stdout)
	}
	if !strings.Contains(stdout, "started_at") {
		t.Errorf("list should include started_at column: %q", stdout)
	}
	if !strings.Contains(stdout, "\tyes\t") {
		t.Errorf("list should report alive=yes after deploy: %q", stdout)
	}

	_, stderr, code = runGact(t, bin, env, "agent", "stop", "testclio")
	if code != 0 {
		t.Fatalf("agent stop: exit %d stderr=%q", code, stderr)
	}
	time.Sleep(500 * time.Millisecond)
}

func TestAgentDeployStartupTimeoutDefaults(t *testing.T) {
	t.Setenv("GACT_AGENT_DEPLOY_STARTUP_TIMEOUT", "")
	// Any external (non-built-in) kind gets the longer slow-start budget.
	if got := defaultAgentDeployStartupTimeout("external"); got != 60*time.Second {
		t.Fatalf("external deploy startup timeout = %s, want 60s", got)
	}
	if got := defaultAgentDeployStartupTimeout("claudecode"); got != 3*time.Second {
		t.Fatalf("claudecode deploy startup timeout = %s, want 3s", got)
	}

	t.Setenv("GACT_AGENT_DEPLOY_STARTUP_TIMEOUT", "25s")
	if got := defaultAgentDeployStartupTimeout("external"); got != 25*time.Second {
		t.Fatalf("env deploy startup timeout = %s, want 25s", got)
	}

	t.Setenv("GACT_AGENT_DEPLOY_STARTUP_TIMEOUT", "not-a-duration")
	if got := defaultAgentDeployStartupTimeout("external"); got != 60*time.Second {
		t.Fatalf("invalid env deploy startup timeout = %s, want external default 60s", got)
	}
}

func TestPythonEntrypointUsesConfiguredModule(t *testing.T) {
	tmp := t.TempDir()
	scripts := filepath.Join(tmp, "Scripts")
	if err := os.MkdirAll(scripts, 0o755); err != nil {
		t.Fatal(err)
	}
	console := filepath.Join(scripts, "agent-gact.exe")
	python := filepath.Join(scripts, "python.exe")
	if err := os.WriteFile(console, []byte("stub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(python, []byte("python"), 0o755); err != nil {
		t.Fatal(err)
	}

	// An empty module means no python wrapper — the bin is run directly.
	if _, _, ok := pythonEntrypoint(console, ""); ok {
		t.Fatal("empty module should not produce a python entrypoint")
	}

	// A configured module (the agent supplies it via GACT_ADAPTER_PYTHON_MODULE)
	// is imported via the sibling venv python.
	const module = "some_agent.gact.app"
	gotBin, gotArgs, ok := pythonEntrypoint(console, module)
	if !ok {
		t.Fatal("expected venv python entrypoint")
	}
	if gotBin != python {
		t.Fatalf("entrypoint bin = %q, want %q", gotBin, python)
	}
	if len(gotArgs) != 2 || gotArgs[0] != "-c" || !strings.Contains(gotArgs[1], module) {
		t.Fatalf("entrypoint args = %#v", gotArgs)
	}
}
