package ui

// runtime_provenance_format.go formats runtime-provenance labels and scalar/object values.

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func runtimeProvenanceLabel(key string) string {
	switch key {
	case "agent_blueprint_id":
		return "workflow"
	case "agent_id":
		return "agent"
	case "assistant_message_id":
		return "assistant message"
	case "active_agent_id":
		return "active agent"
	case "active_expert_id":
		return "active expert"
	case "context_files_count":
		return "context files"
	case "context_frame_count":
		return "context frames"
	case "definition_path":
		return "definition file"
	case "descriptor_id":
		return "descriptor"
	case "duration_ms":
		return "duration"
	case "execution_mode":
		return "execution mode"
	case "files_count":
		return "files"
	case "inline_policy":
		return "inline policy"
	case "max_inline_bytes":
		return "inline limit"
	case "model_id":
		return "model"
	case "output_path":
		return "output path"
	case "parent_id":
		return "parent"
	case "policy_summary":
		return "policy summary"
	case "prompt_id":
		return "prompt"
	case "provider_id":
		return "provider"
	case "recoverable":
		return "recoverable"
	case "return_to":
		return "return to"
	case "route_reason":
		return "routing reason"
	case "route_source":
		return "routing source"
	case "root_path":
		return "workspace root"
	case "schema_version":
		return "format"
	case "search_count":
		return "searches"
	case "selected_agent_id":
		return "selected agent"
	case "server_id":
		return "connection"
	case "sha256":
		return "checksum"
	case "size_bytes":
		return "size"
	case "source_path":
		return "source file"
	case "storage_root":
		return "storage root"
	case "tool_name":
		return "tool"
	case "trace_id":
		return "trace"
	case "turn_id":
		return "turn"
	case "user_message_id":
		return "user message"
	case "workspace_id":
		return "workspace"
	default:
		return strings.ReplaceAll(key, "_", " ")
	}
}

func runtimeScalar(v any) string {
	switch value := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(value)
	case bool:
		return fmt.Sprintf("%t", value)
	case float64, float32, int, int64, int32, json.Number:
		return fmt.Sprint(value)
	case []string:
		return strings.Join(value, ", ")
	case []any:
		if names := orderedRuntimeNames(value); len(names) > 0 {
			return strings.Join(names, ", ")
		}
		return compactRuntimeObject(value)
	case map[string]any:
		return compactRuntimeObject(value)
	default:
		return fmt.Sprint(value)
	}
}

func compactRuntimeObject(v any) string {
	if v == nil {
		return ""
	}
	if body, err := json.Marshal(v); err == nil {
		return textutil.Truncate(string(body), 240)
	}
	return textutil.Truncate(fmt.Sprint(v), 240)
}

func firstNonEmptyAny(values ...any) any {
	for _, value := range values {
		switch v := value.(type) {
		case nil:
			continue
		case string:
			if strings.TrimSpace(v) != "" {
				return value
			}
		case []any:
			if len(v) > 0 {
				return value
			}
		case []string:
			if len(v) > 0 {
				return value
			}
		case map[string]any:
			if len(v) > 0 {
				return value
			}
		default:
			return value
		}
	}
	return nil
}
