package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestCLI_Ping covers X2: exit 0 against a live emulator, exit 1
// against an unreachable backend.
func TestCLI_Ping(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// Live backend -> exit 0.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "ping")
	if code != 0 {
		t.Fatalf("ping live: exit %d, stdout=%q", code, stdout)
	}
	if !strings.Contains(stdout, "ok:") {
		t.Errorf("ping ok output missing: %q", stdout)
	}

	// Unreachable backend -> exit 1.
	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": "http://127.0.0.1:1"}, "ping")
	if code != 1 {
		t.Errorf("ping unreachable: exit %d, want 1", code)
	}

	// LLLL1: --json emits a single-line JSON object on success +
	// failure (with error key on the unreachable case).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "ping", "--json")
	if code != 0 {
		t.Fatalf("ping --json live: exit %d, stdout=%q", code, stdout)
	}
	var ok struct {
		OK      bool   `json:"ok"`
		Backend string `json:"backend"`
		UptimeS int    `json:"uptime_s"`
	}
	if err := json.Unmarshal([]byte(stdout), &ok); err != nil {
		t.Fatalf("ping --json parse: %v (raw=%q)", err, stdout)
	}
	if !ok.OK || ok.Backend != url {
		t.Errorf("expected ok=true, backend=%s; got %+v", url, ok)
	}
	stdout, _, code = runGact(t, bin,
		map[string]string{"GACT_BACKEND": "http://127.0.0.1:1"}, "ping", "--json")
	if code != 1 {
		t.Errorf("ping --json unreachable: exit %d, want 1", code)
	}
	var bad struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal([]byte(stdout), &bad); err != nil {
		t.Fatalf("ping --json fail parse: %v (raw=%q)", err, stdout)
	}
	if bad.OK || bad.Error == "" {
		t.Errorf("expected ok=false + non-empty error; got %+v", bad)
	}
}

// TestCLI_Conformance covers SSS1: run the conformance suite against
// a freshly-started emulator and assert exit 0 + every section
// reports PASS in stderr.
func TestCLI_Conformance(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"conformance")
	if code != 0 {
		t.Fatalf("conformance: exit %d (stderr=%q stdout=%q)", code, stderr, stdout)
	}
	if !strings.Contains(stderr, "PASS") {
		t.Errorf("expected PASS in stderr, got %q", stderr)
	}
	// Every major section should appear in the output. Mcp is gated
	// on capabilities.mcp, Providers on capabilities.providers, Files
	// on capabilities.files, and Diffs + Messages_Diffs on
	// capabilities.diffs; the emulator advertises all four caps.
	for _, want := range []string{"Health", "Capabilities", "Sessions_Create", "Tools_List", "Mcp", "Providers", "Files", "Diffs", "Messages_Diffs", "Agents"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected section %q in stdout: %q", want, stdout)
		}
	}
}

// TestCLI_Bench covers QQQ1 + XXX1: serial run (concurrent=1) and
// parallel run (--concurrent 3 -n 2 = 6 samples), asserts summary
// fields appear and bench sessions are cleaned up.
func TestCLI_Bench(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	preList, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	preCount := strings.Count(preList, "\n")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"bench", "-n", "2", "--message", "hi")
	if code != 0 {
		t.Fatalf("bench: exit %d", code)
	}
	for _, want := range []string{"p50:", "p90:", "p99:", "n=2", "samples:  2"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in serial bench output: %q", want, stdout)
		}
	}
	if strings.Contains(stdout, "thrpt:") {
		t.Errorf("thrpt should be hidden when concurrent=1: %q", stdout)
	}

	// XXX1: --concurrent 3, -n 2 -> 6 samples + thrpt line.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"bench", "-n", "2", "--concurrent", "3", "--message", "hi")
	if code != 0 {
		t.Fatalf("bench --concurrent: exit %d", code)
	}
	for _, want := range []string{"concurrent=3", "samples:  6", "thrpt:"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in concurrent bench output: %q", want, stdout)
		}
	}

	// Bench sessions must be deleted - list count back to baseline.
	postList, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	postCount := strings.Count(postList, "\n")
	if postCount != preCount {
		t.Errorf("bench leaked sessions: pre=%d post=%d", preCount, postCount)
	}
}

// TestCLI_Metrics covers JJ1: text format prints uptime / sessions /
// messages / tokens / cost; json format emits parseable JSON with
// uptime_s present.
func TestCLI_Metrics(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "metrics")
	if code != 0 {
		t.Fatalf("metrics text: exit %d", code)
	}
	for _, want := range []string{"uptime:", "sessions:", "messages:", "tokens:", "cost:"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("text output missing %q: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"metrics", "--format", "json")
	if code != 0 {
		t.Fatalf("metrics json: exit %d", code)
	}
	if !strings.Contains(stdout, `"uptime_s"`) {
		t.Errorf("json output missing uptime_s field: %q", stdout)
	}
}
