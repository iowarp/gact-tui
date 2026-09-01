package ui

// live_message_clone.go deep-clones messages, parts, and metadata maps.

import "github.com/JaimeCernuda/gact-tui/contract/gact"

func cloneMessages(messages []gact.Message) []gact.Message {
	if len(messages) == 0 {
		return nil
	}
	out := make([]gact.Message, len(messages))
	for i, msg := range messages {
		out[i] = cloneMessage(msg)
	}
	return out
}

func cloneMessage(msg gact.Message) gact.Message {
	msg.Parts = cloneParts(msg.Parts)
	msg.Metadata = cloneAnyMap(msg.Metadata)
	if msg.Model != nil {
		model := *msg.Model
		msg.Model = &model
	}
	if msg.ErrorInfo != nil {
		errInfo := *msg.ErrorInfo
		errInfo.Details = cloneAnyMap(msg.ErrorInfo.Details)
		msg.ErrorInfo = &errInfo
	}
	return msg
}

func cloneParts(parts []gact.Part) []gact.Part {
	if len(parts) == 0 {
		return nil
	}
	out := make([]gact.Part, len(parts))
	for i, part := range parts {
		part.Metadata = cloneAnyMap(part.Metadata)
		part.Input = cloneAnyMap(part.Input)
		part.Content = cloneParts(part.Content)
		out[i] = part
	}
	return out
}

func cloneAnyMap(in map[string]any) map[string]any {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]any, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}
