package goose

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFileDiffForStrReplace(t *testing.T) {
	tmp := t.TempDir()
	f := filepath.Join(tmp, "main.go")
	if err := os.WriteFile(f, []byte("package main\nfunc hello() string { return \"world\" }\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	args := map[string]any{
		"command": "str_replace",
		"path":    f,
		"old_str": `"world"`,
		"new_str": `"GACT"`,
	}
	diff := fileDiffForToolRequest("developer__text_editor", args, tmp)
	if diff == nil {
		t.Fatal("expected diff, got nil")
	}
	if diff.Path != f {
		t.Errorf("path=%q", diff.Path)
	}
	if diff.Before == nil || *diff.Before == "" {
		t.Errorf("missing before")
	}
	if diff.After == nil {
		t.Fatal("missing after")
	}
	if want := "package main\nfunc hello() string { return \"GACT\" }\n"; *diff.After != want {
		t.Errorf("after=%q want %q", *diff.After, want)
	}
	if diff.Language != "go" {
		t.Errorf("language=%q want go", diff.Language)
	}
	if diff.Applied {
		t.Errorf("applied should default to false")
	}
}

func TestFileDiffForWriteNewFile(t *testing.T) {
	tmp := t.TempDir()
	args := map[string]any{
		"command":   "write",
		"path":      filepath.Join(tmp, "fresh.md"),
		"file_text": "# hi\n",
	}
	diff := fileDiffForToolRequest("developer__text_editor", args, tmp)
	if diff == nil {
		t.Fatal("expected diff for write-new")
	}
	if diff.Before != nil {
		t.Errorf("before should be nil for new file, got %v", *diff.Before)
	}
	if diff.After == nil || *diff.After != "# hi\n" {
		t.Errorf("after wrong")
	}
	if diff.Language != "markdown" {
		t.Errorf("language=%q", diff.Language)
	}
}

func TestFileDiffForWriteOverwrite(t *testing.T) {
	tmp := t.TempDir()
	f := filepath.Join(tmp, "x.txt")
	if err := os.WriteFile(f, []byte("old\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	args := map[string]any{
		"command":   "write",
		"path":      f,
		"file_text": "new\n",
	}
	diff := fileDiffForToolRequest("developer__text_editor", args, tmp)
	if diff == nil {
		t.Fatal("expected diff")
	}
	if diff.Before == nil || *diff.Before != "old\n" {
		t.Errorf("before wrong")
	}
	if *diff.After != "new\n" {
		t.Errorf("after wrong")
	}
}

func TestFileDiffSkipsNonMutatingCommand(t *testing.T) {
	args := map[string]any{"command": "view", "path": "x"}
	if d := fileDiffForToolRequest("developer__text_editor", args, t.TempDir()); d != nil {
		t.Errorf("view should not produce a diff")
	}
}

func TestFileDiffSkipsUnknownTool(t *testing.T) {
	args := map[string]any{"command": "str_replace", "path": "x", "old_str": "a", "new_str": "b"}
	if d := fileDiffForToolRequest("shell", args, t.TempDir()); d != nil {
		t.Errorf("non-text_editor tool should not produce a diff")
	}
}

func TestFileDiffStrReplaceOnUnknownPathReturnsNil(t *testing.T) {
	args := map[string]any{
		"command": "str_replace",
		"path":    "/no/such/file",
		"old_str": "a",
		"new_str": "b",
	}
	if d := fileDiffForToolRequest("developer__text_editor", args, t.TempDir()); d != nil {
		t.Errorf("str_replace against missing file should return nil (no before)")
	}
}

func TestFileDiffStrReplaceMissReturnsNil(t *testing.T) {
	tmp := t.TempDir()
	f := filepath.Join(tmp, "x.txt")
	if err := os.WriteFile(f, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	args := map[string]any{
		"command": "str_replace",
		"path":    f,
		"old_str": "missing",
		"new_str": "x",
	}
	if d := fileDiffForToolRequest("developer__text_editor", args, tmp); d != nil {
		t.Errorf("no match should produce nil")
	}
}
