// Integration test: builds the emulator binary and drives it via this
// client. Verifies the wire-level contract from the consumer side, catching
// shape drift between the emulator and the TUI client.
package client

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func pickPort(t *testing.T) int {
	t.Helper()
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

func startEmulator(t *testing.T) (string, func()) {
	t.Helper()
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "emulator-server")
	// Build relative to this test file's location.
	_, file, _, _ := runtime.Caller(0)
	repoRoot := filepath.Join(filepath.Dir(file), "..", "..", "..")
	cmd := exec.Command("go", "build", "-o", bin, "./emulator/cmd/emulator-server")
	cmd.Dir = repoRoot
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}

	port := pickPort(t)
	srv := exec.Command(bin, "-port", fmt.Sprintf("%d", port), "-timing", "fast")
	srv.Stdout = io.Discard
	srv.Stderr = io.Discard
	if err := srv.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}
	url := fmt.Sprintf("http://127.0.0.1:%d", port)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(url + "/v1/health")
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			return url, func() {
				_ = srv.Process.Signal(os.Interrupt)
				_ = srv.Wait()
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	_ = srv.Process.Kill()
	t.Fatal("emulator failed to come up")
	return "", nil
}

func TestClientFullFlow(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()

	c := New(url)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Health + capabilities
	if h, err := c.Health(ctx); err != nil || !h.Healthy {
		t.Fatalf("Health: err=%v healthy=%v", err, h.Healthy)
	}
	caps, err := c.Capabilities(ctx)
	if err != nil {
		t.Fatalf("Capabilities: %v", err)
	}
	if caps.ContractVersion != "0.1" && caps.ContractVersion != "0.2" {
		t.Errorf("contract_version = %q (want 0.1 or 0.2)", caps.ContractVersion)
	}

	// Workspaces + create session in seeded ws
	wss, err := c.ListWorkspaces(ctx)
	if err != nil {
		t.Fatalf("ListWorkspaces: %v", err)
	}
	if len(wss) == 0 {
		t.Fatalf("no workspaces")
	}
	wsID := wss[0].ID

	sess, err := c.CreateSession(ctx, CreateSessionRequest{
		WorkspaceID: wsID,
		Title:       "client-it",
	})
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}

	// Open SSE before posting.
	streamCtx, streamCancel := context.WithCancel(ctx)
	defer streamCancel()
	events, errs, err := c.StreamEvents(streamCtx, EventStreamScope{SessionID: sess.ID})
	if err != nil {
		t.Fatalf("StreamEvents: %v", err)
	}

	// Drain greeting.
	select {
	case e := <-events:
		if e.Type != "server.connected" {
			t.Errorf("first event = %q", e.Type)
		}
	case err := <-errs:
		t.Fatalf("stream error: %v", err)
	case <-time.After(time.Second):
		t.Fatal("no greeting")
	}

	// Post a message — emulator's scenario will respond.
	post, err := c.PostMessage(ctx, sess.ID, PostMessageRequest{
		Parts: []gact.Part{gact.NewTextPart("read main.go")},
	})
	if err != nil {
		t.Fatalf("PostMessage: %v", err)
	}
	if post.MessageID == "" {
		t.Fatalf("no message ID")
	}

	// Wait for message.completed.
	deadline := time.After(5 * time.Second)
	completed := false
	for !completed {
		select {
		case e, ok := <-events:
			if !ok {
				t.Fatal("stream closed early")
			}
			if e.Type == "message.completed" {
				completed = true
			}
		case err := <-errs:
			t.Fatalf("stream error: %v", err)
		case <-deadline:
			t.Fatal("never saw message.completed")
		}
	}

	// Confirm the session has messages.
	msgs, _, err := c.ListMessages(ctx, MessageFilter{SessionID: sess.ID, Limit: 50, IncludeSystem: true})
	if err != nil {
		t.Fatalf("ListMessages: %v", err)
	}
	if len(msgs) < 3 {
		t.Errorf("expected 3+ messages, got %d", len(msgs))
	}

	// Catalog endpoints.
	if a, err := c.ListAgents(ctx); err != nil || len(a) == 0 {
		t.Errorf("ListAgents: err=%v len=%d", err, len(a))
	}
	if t2, err := c.ListTools(ctx); err != nil || len(t2) == 0 {
		t.Errorf("ListTools: err=%v len=%d", err, len(t2))
	}
	if p, err := c.ListProviders(ctx); err != nil || len(p) == 0 {
		t.Errorf("ListProviders: err=%v len=%d", err, len(p))
	}
	if cmds, err := c.ListCommands(ctx); err != nil || len(cmds) == 0 {
		t.Errorf("ListCommands: err=%v len=%d", err, len(cmds))
	}
	if m, err := c.Metrics(ctx); err != nil {
		t.Errorf("Metrics: %v", err)
	} else if m.Sessions.Total < 1 {
		t.Errorf("metrics sessions = %d", m.Sessions.Total)
	}

	// Error handling — 404 surfaces as *Error.
	_, err = c.GetSession(ctx, "sess_nope")
	if err == nil {
		t.Fatal("expected error for missing session")
	}
	if e, ok := err.(*Error); !ok || e.Status != 404 {
		t.Errorf("wrong error type: %v (%T)", err, err)
	}
}

func TestClientPermissionFlow(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()

	c := New(url)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	wss, _ := c.ListWorkspaces(ctx)
	sess, _ := c.CreateSession(ctx, CreateSessionRequest{WorkspaceID: wss[0].ID})

	streamCtx, streamCancel := context.WithCancel(ctx)
	defer streamCancel()
	events, _, _ := c.StreamEvents(streamCtx, EventStreamScope{SessionID: sess.ID})
	<-events // greeting

	_, _ = c.PostMessage(ctx, sess.ID, PostMessageRequest{
		Parts: []gact.Part{gact.NewTextPart("delete the temp dir please")},
	})

	// Wait for permission.requested.
	for {
		select {
		case e := <-events:
			if e.Type == "permission.requested" {
				goto allowIt
			}
		case <-time.After(5 * time.Second):
			t.Fatal("no permission.requested")
		}
	}
allowIt:
	pending, err := c.ListPermissions(ctx, sess.ID, true)
	if err != nil || len(pending) != 1 {
		t.Fatalf("pending: err=%v count=%d", err, len(pending))
	}
	if err := c.RespondPermission(ctx, pending[0].ID, gact.PermAllow); err != nil {
		t.Fatalf("RespondPermission: %v", err)
	}

	// Drain to message.completed.
	for {
		select {
		case e := <-events:
			if e.Type == "message.completed" {
				return
			}
		case <-time.After(5 * time.Second):
			t.Fatal("no completion after allow")
		}
	}
}

// Sanity: trim is exported (so we don't break) is false alarm — kept to
// illustrate referencing strings package elsewhere if needed in tests.
var _ = strings.TrimSpace
