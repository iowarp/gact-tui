package ui

// execution_artifact_details.go extracts artifact paths and full diffs from execution-timeline data.

import (
	"fmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func executionFullDiff(src, dst string) string {
	output, err := exec.Command("diff", "-u", src, dst).CombinedOutput()
	if len(output) > 0 && (err == nil || strings.TrimSpace(string(output)) != "") {
		return string(output)
	}
	srcData, srcErr := os.ReadFile(src)
	dstData, dstErr := os.ReadFile(dst)
	if srcErr != nil || dstErr != nil {
		return fmt.Sprintf("--- %s\n+++ %s\nerror: source=%v destination=%v", src, dst, srcErr, dstErr)
	}
	return strings.Join([]string{
		"--- " + src,
		"+++ " + dst,
		"- " + strings.TrimRight(string(srcData), "\n"),
		"+ " + strings.TrimRight(string(dstData), "\n"),
	}, "\n")
}

func executionArtifactPaths(raw any) []string {
	var out []string
	var visit func(any)
	visit = func(value any) {
		switch typed := value.(type) {
		case map[string]any:
			for _, key := range []string{"path", "local_path", "output_path", "artifact_path", "plot_path", "file_path", "metadata_path"} {
				if path := strings.TrimSpace(valuefmt.StringValue(typed[key])); path != "" && executionPathLooksLikeArtifact(path) {
					out = append(out, path)
				}
			}
			for _, child := range typed {
				visit(child)
			}
		case []any:
			for _, child := range typed {
				visit(child)
			}
		case string:
			if parsed, ok := parseLooseJSON(typed); ok {
				visit(parsed)
			}
		}
	}
	visit(raw)
	return uniqueExecutionStrings(out)
}

func executionPathLooksLikeArtifact(path string) bool {
	if strings.TrimSpace(path) == "" {
		return false
	}
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".csv", ".tsv", ".txt", ".log", ".json", ".jsonl", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf":
		return true
	default:
		return strings.Contains(path, string(filepath.Separator))
	}
}

func uniqueExecutionStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}
