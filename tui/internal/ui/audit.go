package ui

// audit.go implements the optional TUI audit recorder that logs received/rendered/conversation frames for testing.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/x/ansi"
)

const (
	tuiAuditRenderPathEnv             = "GACT_TUI_AUDIT_RENDER_PATH"
	tuiAuditRenderFramesPathEnv       = "GACT_TUI_AUDIT_RENDER_FRAMES_PATH"
	tuiAuditConversationPathEnv       = "GACT_TUI_AUDIT_CONVERSATION_PATH"
	tuiAuditConversationFramesPathEnv = "GACT_TUI_AUDIT_CONVERSATION_FRAMES_PATH"
	tuiAuditReceivedPathEnv           = "GACT_TUI_AUDIT_RECEIVED_PATH"
)

var (
	tuiAuditOnce     sync.Once
	tuiAuditInstance *tuiAuditRecorder
)

type tuiAuditRecorder struct {
	renderPath             string
	renderFramesPath       string
	conversationPath       string
	conversationFramesPath string
	receivedPath           string
	mu                     sync.Mutex
	lastRendered           string
	lastConversation       string
	renderFrameIndex       int
	conversationFrameIndex int
}

func newTUIAuditRecorderFromEnv() *tuiAuditRecorder {
	return currentTUIAuditRecorder()
}

func currentTUIAuditRecorder() *tuiAuditRecorder {
	tuiAuditOnce.Do(func() {
		renderPath := strings.TrimSpace(os.Getenv(tuiAuditRenderPathEnv))
		renderFramesPath := strings.TrimSpace(os.Getenv(tuiAuditRenderFramesPathEnv))
		conversationPath := strings.TrimSpace(os.Getenv(tuiAuditConversationPathEnv))
		conversationFramesPath := strings.TrimSpace(os.Getenv(tuiAuditConversationFramesPathEnv))
		receivedPath := strings.TrimSpace(os.Getenv(tuiAuditReceivedPathEnv))
		if renderPath == "" && renderFramesPath == "" && conversationPath == "" && conversationFramesPath == "" && receivedPath == "" {
			return
		}
		rec := &tuiAuditRecorder{
			renderPath:             renderPath,
			renderFramesPath:       renderFramesPath,
			conversationPath:       conversationPath,
			conversationFramesPath: conversationFramesPath,
			receivedPath:           receivedPath,
		}
		if renderPath != "" {
			_ = os.MkdirAll(filepath.Dir(renderPath), 0o755)
			_ = os.WriteFile(renderPath, nil, 0o644)
		}
		if renderFramesPath != "" {
			_ = os.MkdirAll(filepath.Dir(renderFramesPath), 0o755)
			_ = os.WriteFile(renderFramesPath, nil, 0o644)
		}
		if conversationPath != "" {
			_ = os.MkdirAll(filepath.Dir(conversationPath), 0o755)
			_ = os.WriteFile(conversationPath, nil, 0o644)
		}
		if conversationFramesPath != "" {
			_ = os.MkdirAll(filepath.Dir(conversationFramesPath), 0o755)
			_ = os.WriteFile(conversationFramesPath, nil, 0o644)
		}
		if receivedPath != "" {
			_ = os.MkdirAll(filepath.Dir(receivedPath), 0o755)
			_ = os.WriteFile(receivedPath, nil, 0o644)
		}
		tuiAuditInstance = rec
	})
	return tuiAuditInstance
}

func writeTUIAuditReceived(kind string, data any) {
	if rec := currentTUIAuditRecorder(); rec != nil {
		rec.RecordReceived(kind, data)
	}
}

func (r *tuiAuditRecorder) RecordReceived(kind string, data any) {
	if r == nil || r.receivedPath == "" {
		return
	}
	row := map[string]any{
		"observed_at": time.Now().UTC().Format(time.RFC3339Nano),
		"kind":        kind,
		"data":        data,
	}
	raw, err := json.Marshal(row)
	if err != nil {
		raw, _ = json.Marshal(map[string]any{
			"observed_at": time.Now().UTC().Format(time.RFC3339Nano),
			"kind":        kind,
			"error":       err.Error(),
		})
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	f, err := os.OpenFile(r.receivedPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(raw, '\n'))
}

func (r *tuiAuditRecorder) RecordRendered(content string, metadata map[string]any) {
	if r == nil || (r.renderPath == "" && r.renderFramesPath == "") {
		return
	}
	visible := ansi.Strip(content)
	if visible == r.lastRendered {
		return
	}
	r.lastRendered = visible
	r.mu.Lock()
	defer r.mu.Unlock()
	r.renderFrameIndex++
	r.recordReceivedLocked("tui.rendered_frame", metadata)
	if r.renderPath != "" {
		_ = os.WriteFile(r.renderPath, []byte(visible), 0o644)
	}
	r.appendFrameLocked(r.renderFramesPath, "tui.rendered_frame", r.renderFrameIndex, visible, metadata)
}

func (r *tuiAuditRecorder) RecordConversation(content string, metadata map[string]any) {
	if r == nil || (r.conversationPath == "" && r.conversationFramesPath == "") {
		return
	}
	visible := ansi.Strip(content)
	if visible == r.lastConversation {
		return
	}
	r.lastConversation = visible
	r.mu.Lock()
	defer r.mu.Unlock()
	r.conversationFrameIndex++
	r.recordReceivedLocked("tui.conversation_frame", metadata)
	if r.conversationPath != "" {
		_ = os.WriteFile(r.conversationPath, []byte(visible), 0o644)
	}
	r.appendFrameLocked(r.conversationFramesPath, "tui.conversation_frame", r.conversationFrameIndex, visible, metadata)
}

func (r *tuiAuditRecorder) recordReceivedLocked(kind string, data any) {
	if r == nil || r.receivedPath == "" {
		return
	}
	row := map[string]any{
		"observed_at": time.Now().UTC().Format(time.RFC3339Nano),
		"kind":        kind,
		"data":        data,
	}
	r.appendJSONLineLocked(r.receivedPath, row)
}

func (r *tuiAuditRecorder) appendFrameLocked(path string, kind string, frameIndex int, text string, metadata map[string]any) {
	if r == nil || path == "" {
		return
	}
	row := map[string]any{
		"observed_at": time.Now().UTC().Format(time.RFC3339Nano),
		"kind":        kind,
		"frame_index": frameIndex,
		"metadata":    metadata,
		"text":        text,
	}
	r.appendJSONLineLocked(path, row)
}

func (r *tuiAuditRecorder) appendJSONLineLocked(path string, row map[string]any) {
	raw, err := json.Marshal(row)
	if err != nil {
		raw, _ = json.Marshal(map[string]any{
			"observed_at": time.Now().UTC().Format(time.RFC3339Nano),
			"kind":        row["kind"],
			"error":       err.Error(),
		})
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(raw, '\n'))
}

func tuiAuditStageLabel(stage Stage) string {
	switch stage {
	case StageConnecting:
		return "connecting"
	case StageReady:
		return "ready"
	case StageError:
		return "error"
	case StageIntro:
		return "intro"
	default:
		return "unknown"
	}
}
