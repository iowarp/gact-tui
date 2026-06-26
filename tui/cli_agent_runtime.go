package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Env vars an embedding agent sets to register its backend adapter with the
// generic deploy path — no vendor is hardcoded in the TUI. The agent ships
// gact-tui and supplies these from ITS own launcher/config.
const (
	adapterBinEnv    = "GACT_ADAPTER_BIN"           // adapter executable basename
	adapterSrcEnv    = "GACT_ADAPTER_SRC"           // source checkout to probe for a venv
	adapterModuleEnv = "GACT_ADAPTER_PYTHON_MODULE" // python module for venv-launched adapters
	adapterCwdEnv    = "GACT_ADAPTER_CWD"           // "1" if the adapter accepts --cwd
)

// adapterSpec describes how to resolve and launch the adapter binary for a
// deploy kind. Built-in in-repo adapters (Go) have fixed specs; any other kind
// is a GENERIC external adapter configured entirely by the GACT_ADAPTER_* env
// vars above, so an embedding agent registers its backend without any TUI code
// change. There is no hardcoded clio (or any other vendor) kind.
type adapterSpec struct {
	kind         string
	exe          string // executable basename to resolve
	buildHint    string // install/build hint shown when resolution fails
	srcEnv       string // env var holding a source checkout to probe for a venv
	pythonModule string // when set, launch via the venv python (see pythonEntrypoint)
	supportsCwd  bool   // adapter accepts a --cwd flag
	slowStart    bool   // allow a longer startup-readiness budget (external adapters)
}

// adapterSpecFor returns the spec for a deploy kind. "claudecode" is the
// in-repo Go adapter; every other kind is a generic external adapter whose
// executable, source checkout, python module, and --cwd support all come from
// GACT_ADAPTER_* env (or --bin), never a baked-in vendor.
func adapterSpecFor(kind string) adapterSpec {
	switch kind {
	case "claudecode":
		return adapterSpec{
			kind:        kind,
			exe:         "gact-claudecode-adapter",
			buildHint:   "go build -o gact-claudecode-adapter ./adapters/claudecode/cmd/gact-claudecode-adapter",
			supportsCwd: true,
		}
	default:
		exe := strings.TrimSpace(os.Getenv(adapterBinEnv))
		if exe == "" {
			exe = "gact-" + kind + "-adapter"
		}
		return adapterSpec{
			kind:         kind,
			exe:          exe,
			buildHint:    "set GACT_ADAPTER_BIN=<adapter> (and GACT_ADAPTER_SRC=<checkout> for a venv)",
			srcEnv:       adapterSrcEnv,
			pythonModule: strings.TrimSpace(os.Getenv(adapterModuleEnv)),
			supportsCwd:  os.Getenv(adapterCwdEnv) == "1",
			slowStart:    true,
		}
	}
}

// resolveAdapterBin resolves the adapter executable for a spec. Looks first on
// $PATH, then alongside `gact` itself (so `./gact` in a build tree finds its
// sibling adapter), then — when the spec declares a source env — probes a venv
// under that checkout. No hardcoded install layouts; an embedding agent points
// GACT_ADAPTER_SRC at its own checkout or passes --bin.
func resolveAdapterBin(spec adapterSpec) (string, error) {
	if p, err := exec.LookPath(spec.exe); err == nil {
		return p, nil
	}
	if self, err := os.Executable(); err == nil {
		cand := filepath.Join(filepath.Dir(self), spec.exe)
		if _, err := os.Stat(cand); err == nil {
			return cand, nil
		}
	}
	if spec.srcEnv != "" {
		if src := strings.TrimSpace(os.Getenv(spec.srcEnv)); src != "" {
			if st, err := os.Stat(src); err == nil && st.IsDir() {
				for _, cand := range adapterVenvCandidates(src, spec.exe) {
					if st, err := os.Stat(cand); err == nil && !st.IsDir() {
						if abs, err := filepath.Abs(cand); err == nil {
							return abs, nil
						}
						return cand, nil
					}
				}
			}
		}
	}
	return "", fmt.Errorf(
		"%s not on PATH and no install detected — try one of:\n"+
			"  • %s\n"+
			"  • pass --bin /path/to/%s explicitly",
		spec.exe, spec.buildHint, spec.exe,
	)
}

// adapterVenvCandidates lists the conventional console-script locations inside
// a Python venv under a source checkout (cross-platform).
func adapterVenvCandidates(root, exe string) []string {
	return []string{
		filepath.Join(root, ".venv", "Scripts", exe+".exe"),
		filepath.Join(root, ".venv", "Scripts", exe),
		filepath.Join(root, ".venv", "bin", exe),
	}
}

// freePort asks the kernel for an ephemeral TCP port by binding :0 on
// loopback, reading back the assigned port, and immediately closing.
func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

// probeAgentAlive GETs /v1/capabilities on the agent's host:port.
// Returns true if the adapter answers any 2xx within 2s.
func probeAgentAlive(host string, port int) bool {
	url := fmt.Sprintf("http://%s:%d/v1/capabilities", host, port)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

func defaultAgentDeployStartupTimeout(kind string) time.Duration {
	if raw := strings.TrimSpace(os.Getenv("GACT_AGENT_DEPLOY_STARTUP_TIMEOUT")); raw != "" {
		if d, err := time.ParseDuration(raw); err == nil && d > 0 {
			return d
		}
	}
	// External adapters (anything but the fast in-repo Go adapters) may import
	// a heavy runtime before binding the port, so they get a longer budget.
	if adapterSpecFor(kind).slowStart {
		return 60 * time.Second
	}
	return 3 * time.Second
}

// pythonEntrypoint finds the venv python next to a console-script bin and the
// command that imports the configured module, for Python adapters whose
// console script (a shebang wrapper) isn't reliably executable cross-platform.
// `module` comes from the brand/agent config (GACT_ADAPTER_PYTHON_MODULE); an
// empty module returns ok=false so the bin is launched directly.
func pythonEntrypoint(bin, module string) (string, []string, bool) {
	if strings.TrimSpace(module) == "" {
		return "", nil, false
	}
	dir := filepath.Dir(bin)
	for _, name := range []string{"python.exe", "python"} {
		cand := filepath.Join(dir, name)
		if st, err := os.Stat(cand); err == nil && !st.IsDir() {
			return cand, []string{"-c", fmt.Sprintf("import %s as app; app.main()", module)}, true
		}
	}
	return "", nil, false
}
