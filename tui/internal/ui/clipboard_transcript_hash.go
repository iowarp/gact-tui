package ui

// clipboard_transcript_hash.go computes a content hash key for the full-conversation copy cache.

import (
	"encoding/json"
	"fmt"
	"hash/maphash"
	"strconv"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

var fullConversationCopyHashSeed = maphash.MakeSeed()

type fullConversationCopyCache struct {
	key   uint64
	valid bool
	text  string
	ok    bool
}

func fullConversationCopyCacheKey(msgs []gact.Message) uint64 {
	var h maphash.Hash
	h.SetSeed(fullConversationCopyHashSeed)
	write := func(s string) {
		_, _ = h.WriteString(s)
		_, _ = h.Write([]byte{0})
	}
	var scratch [64]byte
	writeInt := func(n int) {
		buf := strconv.AppendInt(scratch[:0], int64(n), 10)
		_, _ = h.Write(buf)
		_, _ = h.Write([]byte{0})
	}
	write("messages")
	writeInt(len(msgs))
	for _, m := range msgs {
		write(m.ID)
		write(m.SessionID)
		write(m.Role)
		write("parts")
		writeInt(len(m.Parts))
		for _, p := range m.Parts {
			fullConversationCopyHashPart(&h, p)
		}
	}
	return h.Sum64()
}

func fullConversationCopyHashPart(h *maphash.Hash, p gact.Part) {
	write := func(s string) {
		_, _ = h.WriteString(s)
		_, _ = h.Write([]byte{0})
	}
	var scratch [64]byte
	writeBool := func(v bool) {
		if v {
			_, _ = h.Write([]byte{'1', 0})
			return
		}
		_, _ = h.Write([]byte{'0', 0})
	}
	writeFloat := func(v float64) {
		buf := strconv.AppendFloat(scratch[:0], v, 'g', -1, 64)
		_, _ = h.Write(buf)
		_, _ = h.Write([]byte{0})
	}
	hashAny := func(v any) {
		switch typed := v.(type) {
		case nil:
			return
		case map[string]any:
			if len(typed) == 0 {
				return
			}
		case []any:
			if len(typed) == 0 {
				return
			}
		}
		fullConversationCopyHashAny(h, v)
	}
	write(p.ID)
	write(p.Type)
	write(p.Text)
	write(p.Thinking)
	write(p.ToolName)
	write(p.CallID)
	write(p.ServerID)
	write(p.SelectedAgent)
	write(p.Rationale)
	write(p.AgentID)
	write(p.SubsessionID)
	write(p.FinalMessageID)
	write(p.Summary)
	write(p.Code)
	write(p.Message)
	write(p.URI)
	write(p.MimeType)
	write(p.Name)
	write(p.Description)
	write(p.Title)
	write(p.Context)
	write(p.Path)
	write(p.Language)
	writeBool(p.IsError)
	writeBool(p.Cached)
	writeBool(p.Recoverable)
	writeBool(p.Auto)
	writeBool(p.Applied)
	writeFloat(p.DurationMS)
	writeFloat(p.Confidence)
	if p.Before != nil {
		write("before")
		write(*p.Before)
	}
	if p.After != nil {
		write("after")
		write(*p.After)
	}
	switch p.Type {
	case gact.PartTypeExpertHandoff:
		fullConversationCopyHashMetadataKeys(h, p.Metadata,
			"agent_id",
			"expert",
			"parent_id",
			"parent",
			"stage",
			"dispatch_target",
			"status",
			"selected_agent",
			"duration_ms",
			"output_summary",
			"summary",
			"error",
			"workflow_summary",
			"workflow_state",
		)
	case gact.PartTypeToolCall:
		hashAny(p.Input)
	case gact.PartTypeRoutingDecision,
		gact.PartTypeToolResult,
		gact.PartTypeFileDiff,
		gact.PartTypeError,
		gact.PartTypeText,
		gact.PartTypeThinking:
	default:
		hashAny(p.Metadata)
		hashAny(p.Input)
		hashAny(p.Annotations)
		hashAny(p.Source)
		hashAny(p.Citations)
	}
	if p.Question != nil {
		hashAny(*p.Question)
	}
	if p.RetryAttempt != nil {
		hashAny(*p.RetryAttempt)
	}
	for _, id := range p.CompactedMessageIDs {
		write(id)
	}
	write("content")
	buf := strconv.AppendInt(scratch[:0], int64(len(p.Content)), 10)
	_, _ = h.Write(buf)
	_, _ = h.Write([]byte{0})
	for _, child := range p.Content {
		fullConversationCopyHashPart(h, child)
	}
}

func fullConversationCopyHashMetadataKeys(h *maphash.Hash, metadata map[string]any, keys ...string) {
	if len(metadata) == 0 {
		return
	}
	for _, key := range keys {
		value, ok := metadata[key]
		if !ok || value == nil {
			continue
		}
		_, _ = h.WriteString(key)
		_, _ = h.Write([]byte{0})
		fullConversationCopyHashAny(h, value)
	}
}

func fullConversationCopyHashAny(h *maphash.Hash, value any) {
	if value == nil {
		return
	}
	if payload, err := json.Marshal(value); err == nil {
		_, _ = h.Write(payload)
		_, _ = h.Write([]byte{0})
		return
	}
	_, _ = h.WriteString(fmt.Sprint(value))
	_, _ = h.Write([]byte{0})
}
