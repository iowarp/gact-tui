package ui

// render_part_cache.go caches pure (context-free) part renders by theme/part/width.

import (
	"hash/maphash"
	"strconv"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// Per-part render memoization for streaming turns.
//
// During a live turn the changed message re-renders on every token, but its
// routing-decision and expert-handoff parts (the agent trajectory) are stable
// — yet they were re-rendered and re-lipgloss-styled on every delta, ~16% of
// the per-delta cost in profiling. These "semantic" part types render as a pure
// function of (theme, part content, width), so we memoize them here while the
// volatile text part keeps re-rendering as it streams.
//
// Excluded on purpose: assistant text (streams), tool calls and tool results
// (their render depends on sibling parts via paired results / status
// suppression), and file diffs (apply/reject + absorption state). The
// selected-part `▸ ` marker is applied by the caller after lookup, so selection
// is deliberately not part of the key.
//
// The render loop is single-threaded (Bubbletea View). The key folds the theme
// signature, width, and full part content, so identical keys always map to
// identical output — sharing the cache across App instances (e.g. in tests) is
// safe. The map is reset wholesale when it grows past the cap rather than
// evicting, which is cheap and keeps the type allocation-free on the hot path.
const maxPartRenderCacheEntries = 4096

var partRenderCache = make(map[uint64]string, 256)

// isCacheablePartType reports whether a part type renders purely from
// (theme, content, width) and is stable across a streaming turn, making it safe
// and worthwhile to memoize. Tool calls/results, assistant text, and file diffs
// are excluded (see the file comment).
func isCacheablePartType(partType string) bool {
	switch partType {
	case gact.PartTypeRoutingDecision,
		gact.PartTypeExpertHandoff,
		gact.PartTypeThinking,
		gact.PartTypeAgentQuestion,
		gact.PartTypeRetryAttempt,
		gact.PartTypeSubagentCall,
		gact.PartTypeSubagentResult,
		gact.PartTypeCompaction,
		gact.PartTypeError,
		partTypeRuntimeProvenance:
		return true
	default:
		return false
	}
}

// cachedPurePartRender returns t.renderPart(p, width) for a cacheable part,
// reusing the memoized string when the (theme, part content, width) tuple has
// been rendered before.
func (t Theme) cachedPurePartRender(themeSig uint64, p gact.Part, width int) string {
	var h maphash.Hash
	h.SetSeed(conversationRenderHashSeed)
	var scratch [24]byte
	_, _ = h.Write(strconv.AppendUint(scratch[:0], themeSig, 10))
	_, _ = h.Write([]byte{0})
	_, _ = h.Write(strconv.AppendInt(scratch[:0], int64(width), 10))
	_, _ = h.Write([]byte{0})
	conversationHashPart(&h, p)
	key := h.Sum64()
	if rendered, ok := partRenderCache[key]; ok {
		return rendered
	}
	if len(partRenderCache) >= maxPartRenderCacheEntries {
		partRenderCache = make(map[uint64]string, 256)
	}
	rendered := t.renderPart(p, width)
	partRenderCache[key] = rendered
	return rendered
}
