package ui

// detail_part_type_rows.go builds per-part-type detail rows (handoff/question/retry/tool-result).

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func partTypeDetailRows(p gact.Part) ([]string, string) {
	var rows []string

	switch p.Type {
	case gact.PartTypeRoutingDecision:
		rows = append(rows, detailFieldRows("selected expert", orPlaceholder(p.SelectedAgent, "unknown"))...)
		rows = append(rows, detailFieldRows("routing source", routeSourceLabel(p))...)
		if p.Confidence > 0 {
			rows = append(rows, detailFieldRows("confidence", fmt.Sprintf("%.2f", p.Confidence))...)
		}
		if p.Rationale != "" {
			rows = append(rows, detailFieldRows("rationale", p.Rationale)...)
		}
	case gact.PartTypeExpertHandoff:
		rows = appendExpertHandoffDetailRows(rows, p)
	case gact.PartTypeAgentQuestion:
		rows = appendAgentQuestionDetailRows(rows, p)
	case gact.PartTypeRetryAttempt:
		rows = appendRetryAttemptDetailRows(rows, p)
	case partTypeRuntimeProvenance:
		rp := mapValue(p.Metadata["runtime_provenance"])
		if len(rp) > 0 {
			return nil, runtimeProvenanceDetailText(rp)
		}
		if p.Text != "" {
			rows = append(rows, detailFieldRows("summary", p.Text)...)
		}
	case gact.PartTypeToolResult:
		rows = appendToolResultDetailRows(rows, p)
	case gact.PartTypeText:
		if p.Text != "" {
			rows = append(rows, detailFieldRows("text", p.Text)...)
		}
	case gact.PartTypeThinking:
		if p.Thinking != "" {
			rows = append(rows, detailFieldRows("thinking", p.Thinking)...)
		}
		if p.Signature != "" {
			rows = append(rows, detailFieldRows("signature", p.Signature)...)
		}
	case gact.PartTypeSubagentCall:
		rows = append(rows, detailFieldRows("agent", orPlaceholder(p.AgentID, "unknown"))...)
		rows = append(rows, detailFieldRows("child session", orPlaceholder(p.SubsessionID, "none"))...)
		if p.Prompt != "" {
			rows = append(rows, detailFieldRows("prompt", p.Prompt)...)
		}
		rows = appendJSONSection(rows, "params", p.Params)
	case gact.PartTypeSubagentResult:
		rows = append(rows, detailFieldRows("child session", orPlaceholder(p.SubsessionID, "none"))...)
		rows = append(rows, detailFieldRows("final message", orPlaceholder(p.FinalMessageID, "none"))...)
		if p.Summary != "" {
			rows = append(rows, detailFieldRows("summary", p.Summary)...)
		}
	case gact.PartTypeError:
		rows = append(rows, detailFieldRows("code", orPlaceholder(p.Code, "unknown"))...)
		rows = append(rows, detailFieldRows("recoverable", fmt.Sprintf("%v", p.Recoverable))...)
		if p.Message != "" {
			rows = append(rows, detailFieldRows("message", p.Message)...)
		}
	case gact.PartTypeCompaction:
		rows = append(rows, detailFieldRows("auto", fmt.Sprintf("%v", p.Auto))...)
		if p.Summary != "" {
			rows = append(rows, detailFieldRows("summary", p.Summary)...)
		}
		if len(p.CompactedMessageIDs) > 0 {
			rows = append(rows, detailFieldRows("compacted messages", strings.Join(p.CompactedMessageIDs, "\n"))...)
		}
	case gact.PartTypeResourceLink, gact.PartTypeResource:
		rows = append(rows, detailFieldRows("uri", orPlaceholder(p.URI, "none"))...)
		rows = append(rows, detailFieldRows("media type", orPlaceholder(p.MimeType, "unknown"))...)
		if p.Name != "" {
			rows = append(rows, detailFieldRows("name", p.Name)...)
		}
		if p.Description != "" {
			rows = append(rows, detailFieldRows("description", p.Description)...)
		}
	case gact.PartTypeImage, gact.PartTypeDocument, gact.PartTypeCitation:
		if p.Title != "" {
			rows = append(rows, detailFieldRows("title", p.Title)...)
		}
		if p.Context != "" {
			rows = append(rows, detailFieldRows("context", p.Context)...)
		}
		if p.Text != "" {
			rows = append(rows, detailFieldRows("text", p.Text)...)
		}
		rows = appendAnyJSONSection(rows, "source", p.Source)
		rows = appendAnyJSONSection(rows, "citations", p.Citations)
	default:
		if p.Text != "" {
			rows = append(rows, detailFieldRows("text", p.Text)...)
		}
		if p.Summary != "" {
			rows = append(rows, detailFieldRows("summary", p.Summary)...)
		}
	}

	return rows, ""
}

func appendExpertHandoffDetailRows(rows []string, p gact.Part) []string {
	route := firstNonEmpty(
		stringValue(p.Metadata["agent_id"]),
		stringValue(p.Metadata["expert"]),
		"expert",
	)
	if parent := firstNonEmpty(stringValue(p.Metadata["parent_id"]), stringValue(p.Metadata["parent"])); parent != "" {
		route = parent + " -> " + route
	}
	rows = append(rows, detailFieldRows("route", route)...)
	rows = append(rows, detailFieldRows("status", orPlaceholder(stringValue(p.Metadata["status"]), "observed"))...)
	if stage := firstNonEmpty(stringValue(p.Metadata["stage"]), stringValue(p.Metadata["dispatch_target"])); stage != "" {
		rows = append(rows, detailFieldRows("stage", stage)...)
	}
	if duration, ok := floatValue(p.Metadata["duration_ms"]); ok && duration > 0 {
		rows = append(rows, detailFieldRows("duration", fmt.Sprintf("%.0f ms", duration))...)
	}
	if input := strings.TrimSpace(stringValue(p.Metadata["input_summary"])); input != "" {
		rows = append(rows, detailFieldRows("input", input)...)
	}
	output := firstNonEmpty(
		stringValue(p.Metadata["output_summary"]),
		stringValue(p.Metadata["summary"]),
		p.Text,
	)
	if output != "" {
		rows = append(rows, detailFieldRows("output", output)...)
	}
	rows = append(rows, detailFieldRows("inline preview", orPlaceholder(summarizeExpertHandoffOutput(output), "none"))...)
	for _, key := range []string{
		"agent_id",
		"parent_id",
		"dispatch_target",
	} {
		if value, ok := p.Metadata[key]; ok && value != nil {
			rows = append(rows, detailFieldRows(key, fmt.Sprint(value))...)
		}
	}
	return rows
}

func appendAgentQuestionDetailRows(rows []string, p gact.Part) []string {
	if p.Question != nil {
		rows = append(rows, detailFieldRows("question", p.Question.ID)...)
		rows = append(rows, detailFieldRows("source", firstNonEmpty(p.Question.Source, p.Question.AgentID))...)
		rows = append(rows, detailFieldRows("category", p.Question.Category)...)
		rows = append(rows, detailFieldRows("kind", firstNonEmpty(p.Question.Kind, p.Question.ExpectedAnswerType))...)
		rows = append(rows, detailFieldRows("status", p.Question.Status)...)
		rows = append(rows, detailFieldRows("prompt", p.Question.Prompt)...)
		choices := p.Question.Options
		if len(choices) == 0 {
			choices = p.Question.Choices
		}
		if len(choices) > 0 {
			choiceRows := make([]string, 0, len(choices))
			for _, choice := range choices {
				label := firstNonEmpty(choice.Label, choice.Value, choice.ID)
				if choice.Description != "" {
					label += ": " + choice.Description
				}
				choiceRows = append(choiceRows, label)
			}
			rows = append(rows, detailFieldRows("choices", strings.Join(choiceRows, "\n"))...)
		}
	} else if p.Text != "" {
		rows = append(rows, detailFieldRows("prompt", p.Text)...)
	}
	return rows
}

func appendRetryAttemptDetailRows(rows []string, p gact.Part) []string {
	if p.RetryAttempt != nil {
		rows = append(rows, detailFieldRows("attempt", p.RetryAttempt.ID)...)
		rows = append(rows, detailFieldRows("source message", firstNonEmpty(p.RetryAttempt.SourceMessageID, p.RetryAttempt.OriginalMessageID))...)
		rows = append(rows, detailFieldRows("attempt message", p.RetryAttempt.AttemptMessageID)...)
		rows = append(rows, detailFieldRows("status", p.RetryAttempt.Status)...)
		rows = append(rows, detailFieldRows("notes", p.RetryAttempt.Notes)...)
		rows = append(rows, detailFieldRows("warning", p.RetryAttempt.Warning)...)
		if p.RetryAttempt.Model != nil {
			rows = append(rows, detailFieldRows("model", modelLabel(*p.RetryAttempt.Model))...)
		}
	} else if p.Text != "" {
		rows = append(rows, detailFieldRows("notes", p.Text)...)
	}
	return rows
}

func appendToolResultDetailRows(rows []string, p gact.Part) []string {
	if p.ToolName != "" {
		rows = append(rows, detailFieldRows("tool", p.ToolName)...)
	}
	rows = append(rows, detailFieldRows("error", fmt.Sprintf("%v", p.IsError))...)
	rows = append(rows, detailFieldRows("cached", fmt.Sprintf("%v", p.Cached))...)
	if p.DurationMS > 0 {
		rows = append(rows, detailFieldRows("duration", fmt.Sprintf("%.0f ms", p.DurationMS))...)
	}
	text := flattenToolResult(p)
	if text != "" {
		rows = append(rows, detailFieldRows("content", text)...)
	}
	if raw := p.Metadata["raw_result"]; raw != nil {
		rows = appendAnyJSONSection(rows, "raw result", raw)
	}
	return rows
}
