package goose

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// fileMutatingGooseTools is the set of Goose tool names that imply
// a file mutation worth surfacing as a GACT file_diff Part. Goose's
// developer extension is the universal one; vendor extensions can
// add their own (we'd extend this set).
var fileMutatingGooseTools = map[string]bool{
	"developer__text_editor": true,
}

// fileDiffForToolRequest synthesises a GACT file_diff Part from a
// developer__text_editor ToolRequest (see Goose's developer
// extension). Supported commands:
//
//   - str_replace : {path, old_str, new_str} → before is on-disk
//     content; after is before with first occurrence replaced.
//   - write       : {path, file_text} → before is current file
//     (or null when new); after = file_text.
//
// Other commands (view, undo_edit, etc.) return nil — they don't
// mutate. Returns nil when args are missing or read fails (defensive
// — prefer no diff over a wrong one).
func fileDiffForToolRequest(toolName string, args map[string]any, cwd string) *gact.Part {
	if !fileMutatingGooseTools[toolName] {
		return nil
	}
	command, _ := args["command"].(string)
	if command != "str_replace" && command != "write" {
		return nil
	}
	path, _ := args["path"].(string)
	if path == "" {
		return nil
	}
	abs := path
	if !filepath.IsAbs(abs) {
		abs = filepath.Join(cwd, path)
	}

	var before *string
	if data, err := os.ReadFile(abs); err == nil {
		s := string(data)
		before = &s
	} else if !errors.Is(err, fs.ErrNotExist) && !errors.Is(err, os.ErrNotExist) {
		// Anything other than "doesn't exist yet" — refuse to fabricate.
		return nil
	}

	var after string
	switch command {
	case "str_replace":
		oldStr, _ := args["old_str"].(string)
		newStr, _ := args["new_str"].(string)
		if oldStr == "" || before == nil {
			return nil
		}
		if !strings.Contains(*before, oldStr) {
			return nil
		}
		after = strings.Replace(*before, oldStr, newStr, 1)
	case "write":
		text, _ := args["file_text"].(string)
		after = text
	}

	part := gact.Part{
		Type:    gact.PartTypeFileDiff,
		Path:    path,
		Before:  before,
		After:   &after,
		Applied: false,
	}
	if lang := languageFor(path); lang != "" {
		part.Language = lang
	}
	return &part
}

// languageFor maps a file extension to a syntax-highlighting hint
// for the file_diff renderer. Conservative subset.
func languageFor(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".py":
		return "python"
	case ".go":
		return "go"
	case ".rs":
		return "rust"
	case ".ts", ".tsx":
		return "typescript"
	case ".js", ".jsx":
		return "javascript"
	case ".java":
		return "java"
	case ".rb":
		return "ruby"
	case ".sh", ".bash", ".zsh":
		return "shell"
	case ".md":
		return "markdown"
	case ".json":
		return "json"
	case ".yaml", ".yml":
		return "yaml"
	case ".toml":
		return "toml"
	case ".html":
		return "html"
	case ".css":
		return "css"
	case ".sql":
		return "sql"
	case ".c", ".h":
		return "c"
	case ".cpp", ".hpp", ".cc":
		return "cpp"
	}
	return ""
}
