package ui

// ask_user_decode.go decodes ask-user question payloads from SSE map data into typed UserQuestion values.

import (
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func decodeUserQuestionPayload(pl map[string]any) gact.UserQuestion {
	q := gact.UserQuestion{
		ID:        stringValue(pl["id"]),
		SessionID: stringValue(pl["session_id"]),
		Prompt:    stringValue(pl["prompt"]),
		Status:    firstNonEmpty(stringValue(pl["status"]), "pending"),
		Kind:      stringValue(pl["kind"]),
		Source:    stringValue(pl["source"]),
		TurnID:    stringValue(pl["turn_id"]),
		AttemptID: stringValue(pl["attempt_id"]),
		Answer:    stringValue(pl["answer"]),
		Metadata:  mapValue(pl["metadata"]),
	}
	q.Options = decodeQuestionOptions(pl["options"])
	if len(q.Options) == 0 {
		q.Options = decodeQuestionOptions(pl["choices"])
	}
	q.SelectedOptions = questionStringList(pl["selected_options"])
	q.AnswerMetadata = mapValue(pl["answer_metadata"])
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
			ID:          stringValue(m["id"]),
			Label:       stringValue(m["label"]),
			Value:       stringValue(m["value"]),
			Description: stringValue(m["description"]),
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
			if text := stringValue(item); text != "" {
				out = append(out, text)
			}
		}
		return out
	default:
		return nil
	}
}

func parseQuestionTime(raw any) time.Time {
	text := stringValue(raw)
	if text == "" {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339Nano, text)
	if err != nil {
		return time.Time{}
	}
	return t
}
