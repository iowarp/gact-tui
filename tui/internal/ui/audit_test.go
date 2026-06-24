package ui

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestAuditRecorderKeepsLatestAndAppendOnlyConversationFrames(t *testing.T) {
	dir := t.TempDir()
	latestPath := filepath.Join(dir, "b_tui_rendered.txt")
	framesPath := filepath.Join(dir, "b_tui_frames.jsonl")
	receivedPath := filepath.Join(dir, "c_tui_received.jsonl")
	rec := &tuiAuditRecorder{
		conversationPath:       latestPath,
		conversationFramesPath: framesPath,
		receivedPath:           receivedPath,
	}

	rec.RecordConversation("\x1b[33mfirst frame\x1b[0m", map[string]any{"status": "running"})
	rec.RecordConversation("\x1b[33mfirst frame\x1b[0m", map[string]any{"status": "running"})
	rec.RecordConversation("second frame", map[string]any{"status": "idle"})

	latest, err := os.ReadFile(latestPath)
	if err != nil {
		t.Fatalf("read latest conversation: %v", err)
	}
	if string(latest) != "second frame" {
		t.Fatalf("latest conversation = %q, want second frame", latest)
	}

	frames := readAuditJSONLines(t, framesPath)
	if len(frames) != 2 {
		t.Fatalf("frame rows = %d, want 2", len(frames))
	}
	if got := frames[0]["text"]; got != "first frame" {
		t.Fatalf("first frame text = %v, want first frame", got)
	}
	if got := frames[1]["text"]; got != "second frame" {
		t.Fatalf("second frame text = %v, want second frame", got)
	}
	if got := frames[1]["frame_index"]; got != float64(2) {
		t.Fatalf("second frame index = %v, want 2", got)
	}

	received := readAuditJSONLines(t, receivedPath)
	if len(received) != 2 {
		t.Fatalf("received rows = %d, want 2", len(received))
	}
	if got := received[0]["kind"]; got != "tui.conversation_frame" {
		t.Fatalf("received kind = %v, want tui.conversation_frame", got)
	}
}

func readAuditJSONLines(t *testing.T, path string) []map[string]any {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open %s: %v", path, err)
	}
	defer f.Close()

	var rows []map[string]any
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var row map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
			t.Fatalf("decode %s: %v", path, err)
		}
		rows = append(rows, row)
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan %s: %v", path, err)
	}
	return rows
}
