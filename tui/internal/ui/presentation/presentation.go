package presentation

// presentation.go summarizes raw tool-result payloads into concise display text.

import (
	"encoding/json"
	"fmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strings"
)

func ToolEvidenceResultText(toolName string, raw any) string {
	if raw == nil {
		return ""
	}
	if result, ok := raw.(map[string]any); ok {
		if summary := SummarizeErrorResult(result); summary != "" {
			return summary
		}
		if stdout, ok := result["stdout"].(string); ok && strings.TrimSpace(stdout) != "" {
			return strings.TrimSpace(stdout)
		}
		if errorText, ok := result["error"].(string); ok && strings.TrimSpace(errorText) != "" {
			return strings.TrimSpace(errorText)
		}
	}
	if summary := SummarizeToolResult(toolName, raw); summary != "" {
		return summary
	}
	if text := valuefmt.CompactJSON(raw); text != "" {
		return text
	}
	return fmt.Sprint(raw)
}

func SummarizeToolResult(toolName string, raw any) string {
	result, ok := raw.(map[string]any)
	if !ok {
		return ""
	}
	if preview := strings.TrimSpace(valuefmt.StringValue(result["preview"])); preview != "" {
		if text := summarizeJSONPreviewToolResult(toolName, preview); text != "" {
			if truncated, ok := result["truncated"].(bool); ok && truncated {
				text += "\n[raw detail truncated by backend]"
			}
			return text
		}
	}
	if text := SummarizeErrorResult(result); text != "" {
		return text
	}
	lowerTool := strings.ToLower(toolName)
	if strings.HasPrefix(lowerTool, "ndp_") {
		if text := summarizeNDPCatalogResult(result); text != "" {
			return text
		}
	}
	if text := summarizeFeatureCollectionResult(result); text != "" {
		return text
	}
	if strings.Contains(lowerTool, "parquet") {
		if text := summarizeTableLikeResult("parquet", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "csv") {
		if text := summarizeTableLikeResult("csv", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "hdf5") || strings.Contains(lowerTool, "h5") {
		if text := summarizeContainerResult("hdf5", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "adios") || strings.Contains(lowerTool, "bp5") || strings.Contains(lowerTool, "bp4") {
		if text := summarizeContainerResult("adios", result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "sac") || strings.Contains(lowerTool, "seismic") {
		if text := summarizeSACResult(result); text != "" {
			return text
		}
	}
	if lowerTool == "" && looksLikeSACResult(result) {
		if text := summarizeSACResult(result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "shell") || strings.Contains(lowerTool, "bash") || strings.Contains(lowerTool, "command") {
		if text := summarizeShellResult(result); text != "" {
			return text
		}
	}
	if strings.Contains(lowerTool, "plot") || strings.Contains(lowerTool, "chart") ||
		strings.Contains(lowerTool, "visual") || strings.Contains(lowerTool, "dashboard") {
		if text := summarizeVisualizationResult(result); text != "" {
			return text
		}
	}
	if text := summarizeStructuredEvidenceResult(result); text != "" {
		return text
	}
	return ""
}

func summarizeJSONPreviewToolResult(toolName string, preview string) string {
	var parsed any
	if err := json.Unmarshal([]byte(preview), &parsed); err != nil {
		return ""
	}
	if text := SummarizeToolResult(toolName, parsed); text != "" {
		return text
	}
	if obj, ok := parsed.(map[string]any); ok {
		return summarizeStructuredEvidenceResult(obj)
	}
	return ""
}

func SummarizeErrorResult(result map[string]any) string {
	errorPayload, ok := result["error"].(map[string]any)
	if !ok {
		return ""
	}
	var rows []string
	rows = append(rows, "error result:")
	if code := FirstStringValue(errorPayload, "code", "type"); code != "" {
		rows = append(rows, "code: "+code)
	}
	if message := FirstStringValue(errorPayload, "message", "error"); message != "" {
		rows = append(rows, "message: "+valuefmt.ShortenKnownPaths(message))
	}
	if nextAction := FirstStringValue(errorPayload, "next_action", "recovery"); nextAction != "" {
		rows = append(rows, "next action: "+valuefmt.ShortenKnownPaths(nextAction))
	}
	if path := FirstStringValue(errorPayload, "path", "filepath", "file"); path != "" {
		rows = append(rows, "path: "+valuefmt.ShortenPathForInline(path))
	}
	if field := FirstStringValue(errorPayload, "field"); field != "" {
		rows = append(rows, "field: "+field)
	}
	if tool := FirstStringValue(errorPayload, "tool"); tool != "" {
		rows = append(rows, "tool: "+tool)
	}
	return strings.Join(rows, "\n")
}

func summarizeStatusRows(result map[string]any) []string {
	var rows []string
	if status := FirstStringValue(result, "status", "state"); status != "" {
		rows = append(rows, "status: "+status)
	} else if meta, ok := result["_meta"].(map[string]any); ok {
		if status := FirstStringValue(meta, "status", "state"); status != "" {
			rows = append(rows, "status: "+status)
		}
	}
	if errText := FirstStringValue(result, "error"); errText != "" {
		rows = append(rows, "error: "+errText)
	} else if ok, hasOK := result["success"].(bool); hasOK && !ok {
		if message := FirstStringValue(result, "message"); message != "" {
			rows = append(rows, "error: "+message)
		}
	} else if message := FirstStringValue(result, "message"); message != "" {
		rows = append(rows, "message: "+message)
	}
	return rows
}
