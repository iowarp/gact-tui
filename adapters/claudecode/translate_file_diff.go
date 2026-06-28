package claudecode

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// fileMutatingClaudeTools are the Anthropic tool names whose
// tool_use input means a file mutation worth surfacing as a
// sibling GACT file_diff Part. NotebookEdit intentionally absent
// — its cell-based shape doesn't fit SPEC's flat before/after.
var fileMutatingClaudeTools = map[string]bool{
	"Edit":  true,
	"Write": true,
}

// fileDiffForToolUse synthesises a GACT file_diff Part from a
// claude tool_use block (Edit / Write). Mirrors the Python
// sidecar's bridge.file_diff_for_tool_use:
//
//   - Edit:  {file_path, old_string, new_string, replace_all?}
//     before = on-disk content; after = before with first occurrence
//     replaced (or all when replace_all=true).
//   - Write: {file_path, content}
//     before = current file or null on new-file; after = content.
//
// Returns nil for tools that don't mutate or for inputs that don't
// validate (defensive — prefer no diff over a wrong one).
func fileDiffForToolUse(toolName string, input map[string]any, cwd string) map[string]any {
	if !fileMutatingClaudeTools[toolName] {
		return nil
	}
	filePath, _ := input["file_path"].(string)
	if filePath == "" {
		return nil
	}
	abs := filePath
	if !filepath.IsAbs(abs) {
		abs = filepath.Join(cwd, filePath)
	}
	var before *string
	if data, err := os.ReadFile(abs); err == nil {
		s := string(data)
		before = &s
	} else if !errors.Is(err, fs.ErrNotExist) && !errors.Is(err, os.ErrNotExist) {
		// Non-text or unreadable — refuse to fabricate.
		return nil
	}
	var after string
	switch toolName {
	case "Write":
		c, _ := input["content"].(string)
		after = c
	case "Edit":
		oldStr, _ := input["old_string"].(string)
		newStr, _ := input["new_string"].(string)
		if oldStr == "" || newStr == "" && oldStr == "" {
			// missing required fields
			return nil
		}
		if before == nil {
			// Edit on a non-existent file: surrogate before with
			// old_string so the diff still shows something.
			before = &oldStr
		}
		if rb, _ := input["replace_all"].(bool); rb {
			after = strings.ReplaceAll(*before, oldStr, newStr)
		} else {
			if !strings.Contains(*before, oldStr) {
				return nil
			}
			after = strings.Replace(*before, oldStr, newStr, 1)
		}
	}
	part := map[string]any{
		"id":      "part_" + newID(12),
		"type":    "file_diff",
		"path":    filePath,
		"before":  before,
		"after":   after,
		"applied": false,
	}
	if lang := languageFor(filePath); lang != "" {
		part["language"] = lang
	}
	return part
}

// languageFor maps a file extension to a syntax-highlighting hint.
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
