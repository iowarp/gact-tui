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

// adapterBinFor resolves the adapter binary to spawn for a given
// kind. Looks first on $PATH, then in the ambient directory
// alongside `gact` itself so `./gact` in the build tree can find
// its sibling adapter without a full install.
func adapterBinFor(kind string) (string, error) {
	var exe, buildHint string
	switch kind {
	case "claudecode":
		exe = "gact-claudecode-adapter"
		buildHint = "go build -o gact-claudecode-adapter ./adapters/claudecode/cmd/gact-claudecode-adapter"
	case "clio":
		// CLIO-BBBBBBBBBB12: clio-agent-gact is a Python console
		// script published by iowarp/clio-agent's pyproject.toml on
		// the tui-integration branch. Operators install via
		// `uv pip install -e /path/to/clio-agent` (or the eventual
		// `uv tool install clio-agent`).
		exe = "clio-agent-gact"
		buildHint = "uv pip install -e /path/to/clio-agent  (tui-integration branch)"
	default:
		return "", fmt.Errorf("unknown kind %q (supported: claudecode, clio)", kind)
	}
	if p, err := exec.LookPath(exe); err == nil {
		return p, nil
	}
	// Try alongside our own binary (cross-platform "next-to gact").
	if self, err := os.Executable(); err == nil {
		cand := filepath.Join(filepath.Dir(self), exe)
		if _, err := os.Stat(cand); err == nil {
			return cand, nil
		}
	}
	// CLIO-BBBBBBBBBB28: dev-friendly fallback for the Python adapter.
	// If CLIO_AGENT_SRC points at a clio-agent checkout, run the
	// entry point via `uv run --project $dir clio-agent-gact` without
	// requiring a system-wide install. Writes a tiny shim to a temp
	// dir and returns its path; the deploy supervises the shim just
	// like a real binary.
	if kind == "clio" {
		if src := os.Getenv("CLIO_AGENT_SRC"); src != "" {
			if st, err := os.Stat(src); err == nil && st.IsDir() {
				for _, cand := range clioAgentGactCandidates(src) {
					if st, err := os.Stat(cand); err == nil && !st.IsDir() {
						return cand, nil
					}
				}
				shim := filepath.Join(os.TempDir(), "gact-clio-shim.sh")
				body := fmt.Sprintf(
					"#!/usr/bin/env bash\nexec uv run --project %q clio-agent-gact \"$@\"\n",
					src,
				)
				if err := os.WriteFile(shim, []byte(body), 0o755); err == nil {
					return shim, nil
				}
			}
		}
		// Discover common clio-agent install layouts so users who
		// followed install.sh (~/.local/share/clio/...) or who keep
		// the sibling layout (~/tui/clio-agent or alongside gact)
		// don't have to set CLIO_AGENT_SRC manually.
		home, _ := os.UserHomeDir()
		candidates := append(
			clioAgentGactCandidates(filepath.Join(home, ".local/share/clio/clio-agent")),
			clioAgentGactCandidates(filepath.Join(home, "tui/clio-agent"))...,
		)
		// Also probe directories adjacent to the gact binary itself.
		if self, err := os.Executable(); err == nil {
			selfDir := filepath.Dir(self)
			candidates = append(candidates,
				clioAgentGactCandidates(filepath.Join(selfDir, "..", "clio-agent"))...,
			)
			candidates = append(candidates,
				clioAgentGactCandidates(filepath.Join(selfDir, "..", "..", "clio-agent"))...,
			)
		}
		// And probe relative to CWD (e.g. user is sitting in /tui).
		if cwd, err := os.Getwd(); err == nil {
			candidates = append(candidates,
				clioAgentGactCandidates(cwd)...,
			)
			candidates = append(candidates,
				clioAgentGactCandidates(filepath.Join(cwd, "clio-agent"))...,
			)
			candidates = append(candidates,
				clioAgentGactCandidates(filepath.Join(cwd, "..", "clio-agent"))...,
			)
		}
		for _, c := range candidates {
			if st, err := os.Stat(c); err == nil && !st.IsDir() {
				if abs, err := filepath.Abs(c); err == nil {
					return abs, nil
				}
				return c, nil
			}
		}
	}
	return "", fmt.Errorf(
		"%s not on PATH and no install detected — try one of:\n"+
			"  • install: %s\n"+
			"  • set CLIO_AGENT_SRC=/path/to/clio-agent\n"+
			"  • pass --bin /path/to/clio-agent-gact explicitly",
		exe, buildHint,
	)
}

func clioAgentGactCandidates(root string) []string {
	return []string{
		filepath.Join(root, ".venv", "Scripts", "clio-agent-gact.exe"),
		filepath.Join(root, ".venv", "Scripts", "clio-agent-gact"),
		filepath.Join(root, ".venv", "bin", "clio-agent-gact"),
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
	if kind == "clio" {
		return 60 * time.Second
	}
	return 3 * time.Second
}

func clioPythonEntrypoint(bin string) (string, []string, bool) {
	dir := filepath.Dir(bin)
	for _, name := range []string{"python.exe", "python"} {
		cand := filepath.Join(dir, name)
		if st, err := os.Stat(cand); err == nil && !st.IsDir() {
			return cand, []string{"-c", "import clio_agent.gact.app as app; app.main()"}, true
		}
	}
	return "", nil, false
}
