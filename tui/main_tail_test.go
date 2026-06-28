package main

import (
	"bytes"
	"io"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

// TestCLI_TailFilter covers --filter narrowing the event stream.
func TestCLI_TailFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	tailDone := make(chan string, 1)
	go func() {
		stdout, _, _ := runGactWithDuration(t, bin,
			map[string]string{"GACT_BACKEND": url},
			2*time.Second,
			"tail", "--workspace", "ws_default", "--filter", "notification")
		tailDone <- stdout
	}()
	time.Sleep(400 * time.Millisecond)
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "mcp_fake"); code != 0 {
		t.Fatalf("reconnect: exit %d", code)
	}
	out := <-tailDone
	if !strings.Contains(out, `"notification"`) {
		t.Errorf("expected notification kept by filter: %q", out)
	}
	if strings.Contains(out, `"type":"server.connected"`) {
		t.Errorf("server.connected should have been filtered out: %q", out)
	}
}

// TestCLI_Tail covers JSON event output from the long-lived tail stream.
func TestCLI_Tail(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	cmd := exec.Command(bin, "tail", "--workspace", "ws_default")
	cmd.Env = append(os.Environ(), "GACT_BACKEND="+url)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatalf("start tail: %v", err)
	}
	time.Sleep(1500 * time.Millisecond)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()

	out := stdout.String()
	if !strings.Contains(out, `"type"`) {
		t.Fatalf("tail produced no JSON lines: %q", out)
	}
	if !strings.Contains(out, "server.connected") {
		t.Errorf("tail missed server.connected event: %q", out)
	}
}

// TestCLI_TailFormatText covers human-readable tail rows.
func TestCLI_TailFormatText(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	cmd := exec.Command(bin, "tail", "--workspace", "ws_default", "--format", "text")
	cmd.Env = append(os.Environ(), "GACT_BACKEND="+url)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatalf("start tail: %v", err)
	}
	time.Sleep(1500 * time.Millisecond)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()

	out := stdout.String()
	if strings.Contains(out, `"type"`) || strings.Contains(out, `"seq"`) {
		t.Errorf("text mode should not emit JSON keys: %q", out)
	}
	if !strings.Contains(out, "server.connected") {
		t.Errorf("missed server.connected row: %q", out)
	}
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			t.Errorf("malformed row: %q", line)
			continue
		}
		if !strings.Contains(fields[0], ":") || len(fields[0]) != 8 {
			t.Errorf("first field doesn't look like HH:MM:SS: %q (line=%q)", fields[0], line)
		}
	}

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tail", "--workspace", "ws_default", "--format", "yaml"); code != 2 {
		t.Errorf("tail --format yaml: want exit 2, got %d", code)
	}
}
