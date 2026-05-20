// Package claudecode is a GACT v0.1 adapter that drives Anthropic's
// `claude` CLI directly via stream-json. Single binary, no Python
// runtime — replaces the claude-agent-sdk-server Python sidecar.
//
// The wire to claude:
//
//	claude --output-format stream-json
//	       --input-format stream-json
//	       --verbose
//
// stdin: {"type":"user","message":{"role":"user","content":[{type,text}]}}\n
// stdout: one JSONL frame per event (system/assistant/stream/result/...).
package claudecode

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"
)

// claudeProcess wraps a long-lived `claude` subprocess for one
// session. New() spawns the CLI; Send writes a JSONL user-message
// frame; Events returns a channel of decoded output frames.
type claudeProcess struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	stderr io.ReadCloser

	mu     sync.Mutex
	closed bool

	events chan map[string]any
	errs   chan error
}

// claudeOptions configures a subprocess instance. cwd binds the
// claude CLI's working directory (CLAUDE.md, MCP config, tool
// permissions all key off this). bin overrides the `claude` lookup.
type claudeOptions struct {
	cwd string
	bin string
}

// newClaudeProcess spawns `claude` with stream-json IO + reader
// goroutines for stdout/stderr. Returns once the process is alive
// (no synchronous wait for the init frame; callers consume that
// from the events channel).
func newClaudeProcess(ctx context.Context, opts claudeOptions) (*claudeProcess, error) {
	bin := opts.bin
	if bin == "" {
		bin = "claude"
	}
	if _, err := exec.LookPath(bin); err != nil {
		return nil, fmt.Errorf("claude CLI not on PATH: %w", err)
	}
	// --permission-prompt-tool stdio is what makes claude route
	// every gated tool call through the stream-json control protocol
	// instead of using its built-in interactive prompt. Mirrors what
	// the Python SDK auto-sets when can_use_tool is provided.
	cmd := exec.CommandContext(ctx, bin,
		"--output-format", "stream-json",
		"--input-format", "stream-json",
		"--verbose",
		"-p",
		"--permission-mode", "default",
		"--permission-prompt-tool", "stdio",
		// TTTTTTT4: claude emits stream_event frames carrying the
		// Anthropic content_block_delta deltas — that's what the
		// TUI uses to render char-by-char.
		"--include-partial-messages",
	)
	if opts.cwd != "" {
		cmd.Dir = opts.cwd
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start claude: %w", err)
	}
	cp := &claudeProcess{
		cmd:    cmd,
		stdin:  stdin,
		stdout: stdout,
		stderr: stderr,
		events: make(chan map[string]any, 64),
		errs:   make(chan error, 4),
	}
	// Drain stdout into events channel; goroutine exits on EOF.
	go cp.readEvents()
	// Drain stderr to avoid back-pressure when claude is chatty.
	go cp.drainStderr()
	return cp, nil
}

// readEvents pumps stdout JSONL frames into cp.events. Lines that
// don't decode as JSON are dropped silently — the SDK does the same
// (claude can emit log lines on stderr; on stdout it's strictly
// JSONL once --output-format stream-json is set).
func (cp *claudeProcess) readEvents() {
	defer close(cp.events)
	rd := bufio.NewReaderSize(cp.stdout, 1<<20)
	for {
		line, err := rd.ReadBytes('\n')
		line = bytes.TrimRight(line, "\r\n ")
		if len(line) > 0 {
			var ev map[string]any
			if jErr := json.Unmarshal(line, &ev); jErr == nil {
				cp.events <- ev
			}
		}
		if err != nil {
			if !errors.Is(err, io.EOF) {
				cp.errs <- fmt.Errorf("stdout read: %w", err)
			}
			return
		}
	}
}

func (cp *claudeProcess) drainStderr() {
	rd := bufio.NewReaderSize(cp.stderr, 64<<10)
	for {
		_, err := rd.ReadBytes('\n')
		if err != nil {
			return
		}
	}
}

// send writes a single JSONL frame to claude's stdin. Frames are
// the input shape claude expects:
//
//	{"type":"user","message":{"role":"user","content":[{"type":"text","text":"..."}]}}
//
// Caller is responsible for constructing the right shape.
func (cp *claudeProcess) send(frame map[string]any) error {
	cp.mu.Lock()
	defer cp.mu.Unlock()
	if cp.closed {
		return errors.New("subprocess closed")
	}
	buf, err := json.Marshal(frame)
	if err != nil {
		return err
	}
	if _, err := cp.stdin.Write(append(buf, '\n')); err != nil {
		return err
	}
	return nil
}

// sendUserText is the convenience wrapper for the most common send
// — a plain user message with one text part.
func (cp *claudeProcess) sendUserText(text string) error {
	return cp.send(map[string]any{
		"type": "user",
		"message": map[string]any{
			"role": "user",
			"content": []map[string]any{
				{"type": "text", "text": text},
			},
		},
	})
}

// close shuts down stdin (signals end-of-input to claude) and waits
// for the process to exit. Best-effort — errors are swallowed since
// callers can't act on them meaningfully.
func (cp *claudeProcess) close() {
	cp.mu.Lock()
	if cp.closed {
		cp.mu.Unlock()
		return
	}
	cp.closed = true
	cp.mu.Unlock()
	_ = cp.stdin.Close()
	done := make(chan struct{})
	go func() {
		_ = cp.cmd.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		if cp.cmd.Process != nil {
			_ = cp.cmd.Process.Kill()
		}
		<-done
	}
}
