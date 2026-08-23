package ui

// execution_render_cache.go provides the cheap content signatures that key the
// per-turn render cache (executionComponent.turnRenderCache). A turn block is
// re-rendered only when one of its inputs actually changes — width, theme, the
// owning user message, the previous message, the projected nodes, or whether
// the turn is selected — so a streaming turn re-renders only its own block and
// every earlier block is reused verbatim.

import (
	"hash/maphash"
	"strconv"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// executionNodesSignature folds a turn's projected nodes into a single value.
// It hashes identifying fields plus the LENGTHS of the free-text fields (not
// the text itself), so an appended streaming token flips the signature in O(n)
// without re-hashing whole observations every frame.
func executionNodesSignature(nodes []executionTimelineNode) uint64 {
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
	writeUint(uint64(len(nodes)))
	for i := range nodes {
		n := &nodes[i]
		writeStr(string(n.Kind))
		writeStr(n.Agent)
		writeStr(n.ParentAgent)
		writeUint(uint64(n.Depth))
		writeStr(n.ToolName)
		writeStr(n.CallID)
		writeStr(n.Status)
		writeUint(uint64(n.StepIndex))
		if n.IsFinish {
			writeStr("f")
		}
		writeUint(uint64(len(n.Text)))
		writeUint(uint64(len(n.Question)))
		writeUint(uint64(len(n.Thinking)))
		writeUint(uint64(len(n.Reasoning)))
		writeUint(uint64(len(n.Summary)))
		// Source address feeds the hit blocks cached with the rendered row, so
		// a re-indexed transcript (reload, delete) must flip the signature.
		if n.Src.Valid {
			writeUint(uint64(n.Src.MsgIdx))
			writeUint(uint64(n.Src.AddrIdx))
			writeStr(n.Src.PartID)
		}
		// Observation/ToolArgs/Structured are display-only payloads that change
		// in lockstep with the identifying fields above (same react step), so
		// their presence is folded as a bool rather than deep-hashed.
		if n.Observation != nil {
			writeStr("o")
		}
		if n.ToolArgs != nil {
			writeStr("a")
		}
		if n.Structured != nil {
			writeStr("s")
		}
		if n.HasRawDetail {
			writeStr("d")
		}
		if n.Part != nil {
			writeStr("p")
			writeStr(string(n.Part.Type))
			writeUint(uint64(len(n.Part.Text)))
			writeStr(n.Part.Path)
			if n.Part.Applied {
				writeStr("applied")
			}
		}
	}
	return h.Sum64()
}

// executionTurnBlockSignature folds every input of one rendered turn block (the
// user row + its execution timeline) into a cache key. msgIdx pins the user
// message's position (the hit blocks cached with the row address it) and
// selKey pins the in-block part selection (empty when the cursor is elsewhere).
func executionTurnBlockSignature(
	themeSig uint64,
	width int,
	m gact.Message,
	msgIdx int,
	prevID string,
	nodes []executionTimelineNode,
	selKey string,
) uint64 {
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
	writeUint(themeSig)
	writeUint(uint64(width))
	writeStr(m.ID)
	writeStr(m.Role)
	writeUint(uint64(msgIdx + 1))
	writeUint(conversationContentSignal(m))
	writeStr(prevID)
	writeUint(executionNodesSignature(nodes))
	writeStr(selKey)
	return h.Sum64()
}
