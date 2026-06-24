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

// TestCLI_StreamFilter covers stream event-type filtering.
func TestCLI_StreamFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	streamDone := make(chan string, 1)
	go func() {
		stdout, _, _ := runGactWithDuration(t, bin,
			map[string]string{"GACT_BACKEND": url},
			2*time.Second,
			"stream", "--workspace", "ws_default", "--filter", "notification")
		streamDone <- stdout
	}()
	time.Sleep(400 * time.Millisecond)
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "mcp_fake"); code != 0 {
		t.Fatalf("reconnect: exit %d", code)
	}
	out := <-streamDone
	if !strings.Contains(out, "notification") {
		t.Errorf("expected notification kept by filter: %q", out)
	}
	if strings.Contains(out, "server.connected") {
		t.Errorf("server.connected should have been filtered out: %q", out)
	}
}

// TestCLI_Stream covers human-readable SSE timeline output.
func TestCLI_Stream(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	cmd := exec.Command(bin, "stream", "--workspace", "ws_default")
	cmd.Env = append(os.Environ(), "GACT_BACKEND="+url)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatalf("start stream: %v", err)
	}
	time.Sleep(1500 * time.Millisecond)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()

	body := out.String()
	if !strings.Contains(body, "server.connected") {
		t.Fatalf("stream missed server.connected event: %q", body)
	}
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if len(line) < 11 || line[2] != ':' || line[5] != ':' {
			t.Errorf("row doesn't look like HH:MM:SS-prefixed: %q", line)
		}
		break
	}
}
