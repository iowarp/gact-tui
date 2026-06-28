package ui

// voice.go captures and transcribes voice input into the composer.

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"runtime"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// captureVoice runs the user-supplied recording command with `sh -c` and
// returns the bytes it wrote to stdout. Empty cmd ⇒ tiny placeholder so
// callers (currently only Ctrl+Y) can still hit the backend's canned
// transcript path during demos.
//
// Contract for cmd:
//   - run synchronously and exit 0 on success
//   - write audio/wav (or whatever MIME the backend accepts) to stdout
//   - on failure, exit non-zero and print a short reason to stderr
//
// We hard-cap the runtime at 30s and the audio buffer at 16 MiB so a
// runaway recorder can't hang or OOM the TUI.
func captureVoice(cmd string) ([]byte, error) {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return []byte("placeholder audio"), nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	shell, args := voiceShellCommand(cmd)
	c := exec.CommandContext(ctx, shell, args...)
	var stderr bytes.Buffer
	c.Stderr = &stderr

	stdout, err := c.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("voice: stdout pipe: %w", err)
	}
	if err := c.Start(); err != nil {
		return nil, fmt.Errorf("voice: start %q: %w", cmd, err)
	}

	const maxAudio = 16 << 20
	buf, readErr := io.ReadAll(io.LimitReader(stdout, maxAudio+1))
	waitErr := c.Wait()

	if waitErr != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = waitErr.Error()
		}
		return nil, fmt.Errorf("voice: %s", msg)
	}
	if readErr != nil {
		return nil, fmt.Errorf("voice: read stdout: %w", readErr)
	}
	if len(buf) > maxAudio {
		return nil, errors.New("voice: recording exceeded 16 MiB cap")
	}
	if len(buf) == 0 {
		return nil, errors.New("voice: recorder produced no audio")
	}
	return buf, nil
}

func voiceShellCommand(cmd string) (string, []string) {
	if runtime.GOOS == "windows" {
		return "cmd", []string{"/C", cmd}
	}
	return "sh", []string{"-c", cmd}
}

// transcribeCmd captures audio (via voiceCmd, if set) and POSTs it to
// /v1/sessions/{id}/voice/transcribe, returning a voiceTranscribedMsg
// with the recognised text. Empty voiceCmd => placeholder body so the
// emulator's canned transcript still fires for demos.
func transcribeCmd(c *client.Client, sessionID string, voiceCmd string) tea.Cmd {
	return func() tea.Msg {
		audio, err := captureVoice(voiceCmd)
		if err != nil {
			return errMsg{err: err, stage: "voice-capture"}
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		out, err := c.VoiceTranscribe(ctx, sessionID, audio, "audio/wav")
		if err != nil {
			return errMsg{err: err, stage: "transcribe"}
		}
		return voiceTranscribedMsg{text: out.Text, durationMs: out.DurationMs}
	}
}

type voiceTranscribedMsg struct {
	text       string
	durationMs int
}

func (c *inputComposerComponent) handleVoiceTranscribed(m voiceTranscribedMsg) (tea.Model, tea.Cmd) {
	c.input.InsertString(m.text)
	return c.app, nil
}
