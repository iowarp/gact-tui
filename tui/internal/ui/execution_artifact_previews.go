package ui

// execution_artifact_previews.go builds previews of execution artifacts (staged resources, shell, plots, file heads).

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func executionStagedResourcePreview(obj map[string]any, threshold int) string {
	path := executionFirstScalarValue(obj, "local_path", "path", "output_path", "artifact_path")
	if path == "" {
		return ""
	}
	rows := []string{executionPathWithSize(path, executionFirstScalarValue(obj, "size_bytes", "bytes"))}
	if strings.EqualFold(executionFirstScalarValue(obj, "content_type"), "text/csv") || strings.HasSuffix(strings.ToLower(path), ".csv") {
		if preview := executionFileHeadPreview(path, threshold); preview != "" {
			rows = append(rows, strings.Split(preview, "\n")...)
			rows = append(rows, "Ctrl+E full preview")
		}
	}
	return strings.Join(rows, "\n")
}

func executionShellObservationPreview(obj map[string]any, threshold int) string {
	command := executionFirstScalarValue(obj, "command")
	exitCode := executionFirstScalarValue(obj, "exit_code")
	stdout := strings.TrimSpace(executionFirstScalarValue(obj, "stdout"))
	stderr := strings.TrimSpace(executionFirstScalarValue(obj, "stderr"))
	if dst := executionRedirectDestination(command); dst != "" {
		rows := []string{"prepared " + filepath.Base(dst)}
		if diff := executionRedirectDiffPreview(command, dst, threshold); diff != "" {
			rows = append(rows, strings.Split(diff, "\n")...)
			rows = append(rows, "Ctrl+E full diff")
		}
		return strings.Join(rows, "\n")
	}
	if stdout != "" {
		visible, hidden := collapseForPreview(stdout, max(1, threshold))
		if hidden > 0 {
			visible += "\nCtrl+E full output"
		}
		return visible
	}
	if stderr != "" {
		return "stderr: " + stderr
	}
	if exitCode != "" && exitCode != "0" {
		return "exit_code " + exitCode
	}
	return ""
}

func executionPlotObservationPreview(obj map[string]any) string {
	path := executionFirstScalarValue(obj, "output_path", "artifact_path", "path", "file_path")
	if path == "" {
		return ""
	}
	rows := []string{shortenPathForInline(path)}
	if plotType := executionFirstScalarValue(obj, "plot_type", "chart_type"); plotType != "" {
		rows = append(rows, "chart "+plotType)
	}
	if x := executionFirstScalarValue(obj, "x_column"); x != "" {
		rows = append(rows, "x "+x)
	}
	if y := summarizeNamedItems(obj, "y_columns", "y_column"); y != "" {
		rows = append(rows, "y "+y)
	}
	if n := executionFirstScalarValue(obj, "data_points"); n != "" {
		rows = append(rows, n+" rows")
	}
	rows = append(rows, "Ctrl+E full image")
	return strings.Join(rows, "\n")
}

func executionPathWithSize(path, size string) string {
	line := filepath.Base(path)
	if strings.TrimSpace(line) == "" {
		line = shortenPathForInline(path)
	}
	if size != "" {
		line += " · " + size + " bytes"
	}
	return line
}

func executionFileHeadPreview(path string, threshold int) string {
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return ""
	}
	lines := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
	var rows []string
	limit := min(max(2, threshold), 4)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		rows = append(rows, textutil.Truncate(line, 88))
		if len(rows) >= limit {
			break
		}
	}
	return strings.Join(rows, "\n")
}

func executionRedirectDestination(command string) string {
	parts := strings.Split(command, ">")
	if len(parts) < 2 {
		return ""
	}
	return strings.Trim(strings.TrimSpace(parts[len(parts)-1]), `"'`)
}

func executionRedirectSource(command string) string {
	before, _, ok := strings.Cut(command, ">")
	if !ok {
		return ""
	}
	quoted := executionQuotedPaths(before)
	if len(quoted) > 0 {
		return quoted[len(quoted)-1]
	}
	fields := strings.Fields(before)
	if len(fields) == 0 {
		return ""
	}
	return strings.Trim(fields[len(fields)-1], `"'`)
}

func executionQuotedPaths(text string) []string {
	var out []string
	for _, quote := range []rune{'\'', '"'} {
		parts := strings.Split(text, string(quote))
		for i := 1; i < len(parts); i += 2 {
			if strings.Contains(parts[i], "/") {
				out = append(out, parts[i])
			}
		}
	}
	return out
}

func executionRedirectDiffPreview(command, dst string, threshold int) string {
	src := executionRedirectSource(command)
	if src == "" {
		return ""
	}
	srcLines := executionFirstNonEmptyLines(src, max(1, threshold))
	dstLines := executionFirstNonEmptyLines(dst, max(1, threshold))
	if len(srcLines) == 0 || len(dstLines) == 0 {
		return ""
	}
	var rows []string
	limit := min(max(1, threshold), 3)
	for i := 0; i < limit && i < len(srcLines); i++ {
		if i < len(dstLines) && srcLines[i] == dstLines[i] {
			continue
		}
		rows = append(rows, "- "+textutil.Truncate(srcLines[i], 72))
		if i < len(dstLines) {
			rows = append(rows, "+ "+textutil.Truncate(dstLines[i], 72))
		}
	}
	if len(rows) == 0 && len(dstLines) > 0 {
		rows = append(rows, "+ "+textutil.Truncate(dstLines[0], 72))
	}
	return strings.Join(rows, "\n")
}

func executionFirstNonEmptyLines(path string, limit int) []string {
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return nil
	}
	var rows []string
	for _, line := range strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		rows = append(rows, line)
		if len(rows) >= limit {
			break
		}
	}
	return rows
}

func executionArtifactPreview(raw any) string {
	obj := mapValue(raw)
	if len(obj) == 0 {
		return ""
	}
	path := firstStringValue(obj, "local_path", "path", "output_path", "artifact_path")
	if path == "" {
		return ""
	}
	var rows []string
	rows = append(rows, shortenPathForInline(path))
	if size := firstStringValue(obj, "size_bytes", "bytes"); size != "" {
		rows[0] += " · " + size + " bytes"
	}
	return strings.Join(rows, "\n")
}
