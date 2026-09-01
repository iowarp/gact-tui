package ui

// conversation_render_hash.go computes content/theme hash keys for the conversation render cache.

import (
	"fmt"
	"hash/maphash"
	"sort"
	"strconv"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

var conversationRenderHashSeed = maphash.MakeSeed()

// themeRenderSignature folds the theme fields that affect rendered output into
// a single value. It is computed once per frame (not once per message) and fed
// to conversationRenderCacheKey, so the previous per-message hexOf/Sprintf of
// five colours — ~9% of a warm frame at 360 messages — collapses to one
// uint64 write per message.
func themeRenderSignature(t Theme) uint64 {
	var h maphash.Hash
	h.SetSeed(conversationRenderHashSeed)
	write := func(s string) {
		_, _ = h.WriteString(s)
		_, _ = h.Write([]byte{0})
	}
	if t.ShowTimestamps {
		write("ts")
	}
	var scratch [24]byte
	_, _ = h.Write(strconv.AppendInt(scratch[:0], int64(t.CollapseThreshold), 10))
	write(hexOf(t.Fg))
	write(hexOf(t.FgMuted))
	write(hexOf(t.Primary))
	write(hexOf(t.Secondary))
	write(hexOf(t.RoleTool))
	return h.Sum64()
}

func conversationRenderCacheKey(revision uint64, themeSig uint64, m gact.Message, msgEpoch uint64, prev *gact.Message, width int, inlineResults map[string]gact.Part, selectedPartID string) uint64 {
	var h maphash.Hash
	h.SetSeed(conversationRenderHashSeed)
	writeHashString := func(s string) {
		_, _ = h.WriteString(s)
		_, _ = h.Write([]byte{0})
	}
	var scratch [64]byte
	writeHashInt := func(value int) {
		buf := strconv.AppendInt(scratch[:0], int64(value), 10)
		_, _ = h.Write(buf)
		_, _ = h.Write([]byte{0})
	}
	writeHashUint := func(value uint64) {
		buf := strconv.AppendUint(scratch[:0], value, 10)
		_, _ = h.Write(buf)
		_, _ = h.Write([]byte{0})
	}
	writeHashUint(revision)
	writeHashInt(width)
	writeHashUint(themeSig)
	writeHashString(selectedPartID)
	writeHashString(m.ID)
	writeHashString(m.SessionID)
	writeHashString(m.Role)
	writeHashString(m.StopReason)
	writeHashInt(len(m.Parts))
	// Per-message content epoch instead of a per-frame deep content hash.
	// The epoch is bumped (bumpMessageEpoch) exactly when this message's
	// render-affecting content changes, so equal-content frames produce an
	// identical key in O(1) rather than re-hashing (and previously
	// JSON-marshalling) every part on every render.
	writeHashUint(msgEpoch)
	writeHashUint(conversationContentSignal(m))
	if prev == nil {
		writeHashString("<nil-prev>")
	} else {
		writeHashString("prev")
		writeHashString(prev.ID)
		writeHashString(prev.Role)
		writeHashString(strconv.FormatBool(assistantCarriedToolCall(prev)))
	}
	if len(inlineResults) > 0 {
		writeHashString("inline-results")
		keys := make([]string, 0, len(inlineResults))
		for key := range inlineResults {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			writeHashString(key)
			part := inlineResults[key]
			conversationHashPart(&h, part)
		}
	}
	return h.Sum64()
}

// conversationContentSignal folds a message's cheap, render-affecting surface
// — part structure (count, ids, types), tool identity, text/thinking/data
// *lengths*, and key flags — into a hash WITHOUT walking metadata or hashing
// full text bodies. It is the lightweight companion to msgRenderEpoch: the
// epoch (bumped by the SSE mutation handlers) catches metadata/flag/value
// changes and same-length text replacements routed through the live path,
// while this signal cheaply auto-detects structural and length changes (a part
// appended, a token streamed in) for any mutation — including direct edits in
// tests — so the render cache self-heals without re-introducing the per-frame
// deep content hash (which dominated render cost via metadata walks +
// json.Marshal). Cost is O(parts) integer/short-string writes, not O(text).
func conversationContentSignal(m gact.Message) uint64 {
	var h maphash.Hash
	h.SetSeed(conversationRenderHashSeed)
	var scratch [24]byte
	writeUint := func(v uint64) {
		_, _ = h.Write(strconv.AppendUint(scratch[:0], v, 10))
		_, _ = h.Write([]byte{0})
	}
	writeStr := func(s string) {
		_, _ = h.WriteString(s)
		_, _ = h.Write([]byte{0})
	}
	writeStr(m.StopReason)
	if m.ErrorInfo != nil {
		writeStr("err")
	}
	var fold func(parts []gact.Part)
	fold = func(parts []gact.Part) {
		writeUint(uint64(len(parts)))
		for i := range parts {
			p := &parts[i]
			writeStr(p.ID)
			writeStr(p.Type)
			writeStr(p.ToolName)
			writeStr(p.CallID)
			writeUint(uint64(len(p.Text)))
			writeUint(uint64(len(p.Thinking)))
			writeUint(uint64(len(p.Data)))
			if p.IsError {
				writeStr("e")
			}
			if p.Cached {
				writeStr("c")
			}
			fold(p.Content)
		}
	}
	fold(m.Parts)
	return h.Sum64()
}

func conversationHashPart(h *maphash.Hash, p gact.Part) {
	write := func(s string) {
		_, _ = h.WriteString(s)
		_, _ = h.Write([]byte{0})
	}
	var scratch [64]byte
	writeBool := func(value bool) {
		if value {
			_, _ = h.Write([]byte{'1', 0})
			return
		}
		_, _ = h.Write([]byte{'0', 0})
	}
	writeFloat := func(value float64) {
		buf := strconv.AppendFloat(scratch[:0], value, 'g', -1, 64)
		_, _ = h.Write(buf)
		_, _ = h.Write([]byte{0})
	}
	writeInt := func(value int) {
		buf := strconv.AppendInt(scratch[:0], int64(value), 10)
		_, _ = h.Write(buf)
		_, _ = h.Write([]byte{0})
	}
	write(p.ID)
	write(p.Type)
	write(p.Text)
	write(p.Thinking)
	write(p.Data)
	write(p.Signature)
	write(p.ToolName)
	write(p.CallID)
	write(p.ServerID)
	writeBool(p.IsError)
	writeBool(p.Cached)
	writeFloat(p.DurationMS)
	write(p.SelectedAgent)
	write(p.Rationale)
	writeFloat(p.Confidence)
	write(p.AgentID)
	write(p.SubsessionID)
	write(p.FinalMessageID)
	write(p.Summary)
	write(p.Code)
	write(p.Message)
	writeBool(p.Recoverable)
	writeBool(p.Auto)
	write(p.URI)
	write(p.MimeType)
	write(p.Name)
	write(p.Description)
	write(p.Title)
	write(p.Context)
	conversationHashAny(h, p.Input)
	conversationHashAny(h, p.Annotations)
	conversationHashVisibleMetadata(h, p.Metadata)
	conversationHashAny(h, p.Source)
	conversationHashAny(h, p.Citations)
	if p.Question != nil {
		conversationHashAny(h, *p.Question)
	}
	if p.RetryAttempt != nil {
		conversationHashAny(h, *p.RetryAttempt)
	}
	writeInt(len(p.CompactedMessageIDs))
	for _, id := range p.CompactedMessageIDs {
		write(id)
	}
	writeInt(len(p.Content))
	for _, child := range p.Content {
		conversationHashPart(h, child)
	}
}

func conversationHashVisibleMetadata(h *maphash.Hash, metadata map[string]any) {
	if len(metadata) == 0 {
		return
	}
	keys := make([]string, 0, len(metadata))
	for key := range metadata {
		switch key {
		case "raw_event", "raw_result":
			continue
		}
		keys = append(keys, key)
	}
	if len(keys) == 0 {
		return
	}
	sort.Strings(keys)
	for _, key := range keys {
		_, _ = h.WriteString(key)
		_, _ = h.Write([]byte{0})
		conversationHashAny(h, metadata[key])
	}
}

// conversationHashAny folds an arbitrary JSON-shaped value into the render
// fingerprint without reflection or allocation. Values reaching here come from
// decoding the GACT wire (Part.Input / Annotations / Metadata / Source /
// Citations), so they are the standard encoding/json dynamic types — nil,
// bool, float64, string, []any, map[string]any — plus the concrete numeric
// kinds that programmatic callers (and tests) sometimes pass. We do not need
// byte-compatibility with any prior encoding; the cache is process-local and
// only requires that equal content hashes equally and different content
// (almost surely) does not. Map keys are sorted so ordering never perturbs the
// hash. This replaces a per-frame json.Marshal that dominated render cost.
func conversationHashAny(h *maphash.Hash, value any) {
	var scratch [32]byte
	switch v := value.(type) {
	case nil:
		_, _ = h.Write([]byte{'n', 0})
	case bool:
		if v {
			_, _ = h.Write([]byte{'b', '1', 0})
		} else {
			_, _ = h.Write([]byte{'b', '0', 0})
		}
	case string:
		_, _ = h.Write([]byte{'s'})
		_, _ = h.WriteString(v)
		_, _ = h.Write([]byte{0})
	case float64:
		_, _ = h.Write([]byte{'f'})
		_, _ = h.Write(strconv.AppendFloat(scratch[:0], v, 'g', -1, 64))
		_, _ = h.Write([]byte{0})
	case float32:
		_, _ = h.Write([]byte{'f'})
		_, _ = h.Write(strconv.AppendFloat(scratch[:0], float64(v), 'g', -1, 32))
		_, _ = h.Write([]byte{0})
	case int:
		conversationHashInt64(h, int64(v))
	case int64:
		conversationHashInt64(h, v)
	case int32:
		conversationHashInt64(h, int64(v))
	case uint:
		conversationHashUint64(h, uint64(v))
	case uint64:
		conversationHashUint64(h, v)
	case []any:
		_, _ = h.Write([]byte{'a'})
		_, _ = h.Write(strconv.AppendInt(scratch[:0], int64(len(v)), 10))
		_, _ = h.Write([]byte{0})
		for _, item := range v {
			conversationHashAny(h, item)
		}
	case map[string]any:
		_, _ = h.Write([]byte{'m'})
		keys := make([]string, 0, len(v))
		for key := range v {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			_, _ = h.WriteString(key)
			_, _ = h.Write([]byte{0})
			conversationHashAny(h, v[key])
		}
	case map[string]string:
		_, _ = h.Write([]byte{'M'})
		keys := make([]string, 0, len(v))
		for key := range v {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			_, _ = h.WriteString(key)
			_, _ = h.Write([]byte{0})
			_, _ = h.WriteString(v[key])
			_, _ = h.Write([]byte{0})
		}
	default:
		// Rare: a concrete struct or unhandled kind. fmt.Sprint is exact for
		// our purposes and far cheaper than the previous json.Marshal because
		// it is the cold path, not every metadata value on every frame.
		_, _ = h.Write([]byte{'?'})
		_, _ = h.WriteString(fmt.Sprint(value))
		_, _ = h.Write([]byte{0})
	}
}

func conversationHashInt64(h *maphash.Hash, v int64) {
	var scratch [24]byte
	_, _ = h.Write([]byte{'i'})
	_, _ = h.Write(strconv.AppendInt(scratch[:0], v, 10))
	_, _ = h.Write([]byte{0})
}

func conversationHashUint64(h *maphash.Hash, v uint64) {
	var scratch [24]byte
	_, _ = h.Write([]byte{'u'})
	_, _ = h.Write(strconv.AppendUint(scratch[:0], v, 10))
	_, _ = h.Write([]byte{0})
}
