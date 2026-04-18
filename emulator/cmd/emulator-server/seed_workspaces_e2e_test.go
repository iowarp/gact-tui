package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// TestE2E_SeedWorkspacesFlag boots the binary with --seed-workspaces
// and asserts the extra workspaces show up on /v1/workspaces alongside
// the default ws_default. Separate from startEmulator() because this
// one needs a non-default flag, and adapting startEmulator to take
// extra args would noise up the simple tests.
func TestE2E_SeedWorkspacesFlag(t *testing.T) {
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "emulator-server")
	build := exec.Command("go", "build", "-o", bin, ".")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	port := pickPort(t)
	cmd := exec.Command(bin,
		"-port", fmt.Sprintf("%d", port),
		"-timing", "fast",
		"-seed-workspaces", "alpha:/repos/alpha,beta:/repos/beta",
	)
	cmd.Stdout = io.Discard
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}
	defer func() {
		_ = cmd.Process.Signal(os.Interrupt)
		_ = cmd.Wait()
	}()

	url := fmt.Sprintf("http://127.0.0.1:%d", port)
	deadline := time.Now().Add(3 * time.Second)
	var ready bool
	for time.Now().Before(deadline) {
		if resp, err := http.Get(url + "/v1/health"); err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				ready = true
				break
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	if !ready {
		t.Fatalf("emulator did not become healthy. stderr:\n%s", stderr.String())
	}

	resp, err := http.Get(url + "/v1/workspaces")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Workspaces []struct {
			ID       string `json:"id"`
			Name     string `json:"name"`
			RootPath string `json:"root_path"`
		} `json:"workspaces"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}

	// Build a name-indexed view for stable assertions — the store's
	// iteration order isn't guaranteed.
	seen := map[string]string{} // name → root_path
	for _, w := range body.Workspaces {
		seen[w.Name] = w.RootPath
	}
	if seen["default"] == "" {
		t.Errorf("default workspace missing; got %+v", body.Workspaces)
	}
	if got := seen["alpha"]; got != "/repos/alpha" {
		t.Errorf("alpha.root_path = %q, want /repos/alpha", got)
	}
	if got := seen["beta"]; got != "/repos/beta" {
		t.Errorf("beta.root_path = %q, want /repos/beta", got)
	}
}

// TestE2E_SeedWorkspacesFlag_BadSyntaxFailsBoot verifies the binary
// refuses to start on a malformed flag value — better than silently
// running with fewer workspaces than the operator asked for.
func TestE2E_SeedWorkspacesFlag_BadSyntaxFailsBoot(t *testing.T) {
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "emulator-server")
	build := exec.Command("go", "build", "-o", bin, ".")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	port := pickPort(t)
	cmd := exec.Command(bin,
		"-port", fmt.Sprintf("%d", port),
		"-seed-workspaces", "no-colon-here",
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = io.Discard
	if err := cmd.Run(); err == nil {
		t.Errorf("expected non-zero exit on bad flag; stderr:\n%s", stderr.String())
	}
	if !bytes.Contains(stderr.Bytes(), []byte("seed-workspaces")) {
		t.Errorf("stderr should mention the flag; got:\n%s", stderr.String())
	}
}
