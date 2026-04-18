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

func TestE2E_SeedSessionsFlag(t *testing.T) {
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
		"-seed-sessions", "ws_default=3",
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

	resp, err := http.Get(url + "/v1/sessions?workspace_id=ws_default")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Sessions []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"sessions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Sessions) != 3 {
		t.Fatalf("sessions = %d, want 3 (stderr: %s)", len(body.Sessions), stderr.String())
	}
	// Titles should be distinct placeholders.
	want := map[string]bool{
		"seeded session 1": true,
		"seeded session 2": true,
		"seeded session 3": true,
	}
	for _, s := range body.Sessions {
		if !want[s.Title] {
			t.Errorf("unexpected title %q", s.Title)
		}
		delete(want, s.Title)
	}
	if len(want) > 0 {
		t.Errorf("missing seeded titles: %+v", want)
	}
}

func TestE2E_SeedSessionsFlag_UnknownWorkspaceFailsBoot(t *testing.T) {
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "emulator-server")
	build := exec.Command("go", "build", "-o", bin, ".")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	port := pickPort(t)
	// ws_missing is not seeded by --seed-workspaces, so CreateSession
	// should fail with ErrInvalidArg and the binary should exit
	// non-zero. Better to crash-loud than to silently drop seeds.
	cmd := exec.Command(bin,
		"-port", fmt.Sprintf("%d", port),
		"-seed-sessions", "ws_missing=1",
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = io.Discard
	if err := cmd.Run(); err == nil {
		t.Errorf("expected non-zero exit; stderr:\n%s", stderr.String())
	}
	if !bytes.Contains(stderr.Bytes(), []byte("ws_missing")) {
		t.Errorf("stderr should mention the bad workspace id:\n%s", stderr.String())
	}
}

func TestE2E_SeedSessionsFlag_BadSyntaxFailsBoot(t *testing.T) {
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "emulator-server")
	build := exec.Command("go", "build", "-o", bin, ".")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	port := pickPort(t)
	cmd := exec.Command(bin,
		"-port", fmt.Sprintf("%d", port),
		"-seed-sessions", "ws_a=abc",
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = io.Discard
	if err := cmd.Run(); err == nil {
		t.Errorf("expected non-zero exit; stderr:\n%s", stderr.String())
	}
	if !bytes.Contains(stderr.Bytes(), []byte("seed-sessions")) {
		t.Errorf("stderr should mention the flag:\n%s", stderr.String())
	}
}
