package ui

// ask_user_decode.go decodes ask-user question payloads from SSE map data into typed UserQuestion values.

import (
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func decodeUserQuestionPayload(pl map[string]any) gact.UserQuestion {
	q := gact.UserQuestion{
		ID:        valuefmt.StringValue(pl["id"]),
		SessionID: valuefmt.StringValue(pl["session_id"]),
		Prompt:    valuefmt.StringValue(pl["prompt"]),
		Status:    valuefmt.FirstNonEmpty(valuefmt.StringValue(pl["status"]), "pending"),
		Kind:      valuefmt.StringValue(pl["kind"]),
		Source:    valuefmt.StringValue(pl["source"]),
		TurnID:    valuefmt.StringValue(pl["turn_id"]),
		AttemptID: valuefmt.StringValue(pl["attempt_id"]),
		Answer:    valuefmt.StringValue(pl["answer"]),
		Metadata:  valuefmt.MapValue(pl["metadata"]),
	}
	q.Options = decodeQuestionOptions(pl["options"])
	if len(q.Options) == 0 {
		q.Options = decodeQuestionOptions(pl["choices"])
	}
	q.SelectedOptions = questionStringList(pl["selected_options"])
	q.AnswerMetadata = valuefmt.MapValue(pl["answer_metadata"])
	q.CreatedAt = parseQuestionTime(pl["created_at"])
	q.UpdatedAt = parseQuestionTime(pl["updated_at"])
	if expires := parseQuestionTime(pl["expires_at"]); !expires.IsZero() {
		q.ExpiresAt = &expires
	}
	return q
}

func decodeQuestionOptions(raw any) []gact.UserQuestionOption {
	rows, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]gact.UserQuestionOption, 0, len(rows))
	for _, row := range rows {
		m, ok := row.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, gact.UserQuestionOption{
			ID:          valuefmt.StringValue(m["id"]),
			Label:       valuefmt.StringValue(m["label"]),
			Value:       valuefmt.StringValue(m["value"]),
			Description: valuefmt.StringValue(m["description"]),
		})
	}
	return out
}

func questionStringList(raw any) []string {
	switch v := raw.(type) {
	case []string:
		return append([]string(nil), v...)
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if text := valuefmt.StringValue(item); text != "" {
				out = append(out, text)
			}
		}
		return out
	default:
		return nil
	}
}

func parseQuestionTime(raw any) time.Time {
	text := valuefmt.StringValue(raw)
	if text == "" {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339Nano, text)
	if err != nil {
		return time.Time{}
	}
	return t
}
