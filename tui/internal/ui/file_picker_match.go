package ui

// file_picker_match.go computes fuzzy-matched file-picker entries.

import (
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (m *filePickerComponent) fileEntries() []gact.FileEntry {
	if !m.open {
		return nil
	}
	out := make([]gact.FileEntry, 0, len(m.entries))
	seen := map[string]bool{}
	for _, e := range m.entries {
		if e.Type == "dir" || strings.TrimSpace(e.Path) == "" || seen[e.Path] {
			continue
		}
		seen[e.Path] = true
		out = append(out, e)
	}
	return out
}

// matches returns the entries that pass the current filter,
// sorted by fuzzy match quality. Tie-breaker is path alphabetical so
// ordering is deterministic across renders.
//
// Scoring rules (lower is better):
//   - a direct substring match beats a scattered-char match — the
//     substring score is its 0-based start index plus a small
//     constant, so "rout" against "router.go" scores 0, a skip-match
//     scores in the hundreds.
//   - for skip-match, we prefer matches that start earlier in the
//     path and have less gap between characters.
//   - matches on the basename (after the last '/') beat matches that
//     land earlier in a directory component — users typing "picker"
//     mean the file, not a directory called "picker-notes".
func (m *filePickerComponent) matches() []gact.FileEntry {
	if !m.open {
		return nil
	}
	if m.errText != "" {
		return nil
	}
	if m.filter == "" {
		out := m.fileEntries()
		sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
		return out
	}
	needle := strings.ToLower(m.filter)
	type scored struct {
		entry gact.FileEntry
		score int // lower is better
	}
	var hits []scored
	for _, e := range m.fileEntries() {
		s, ok := fuzzyScore(strings.ToLower(e.Path), needle)
		if !ok {
			continue
		}
		hits = append(hits, scored{entry: e, score: s})
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].score != hits[j].score {
			return hits[i].score < hits[j].score
		}
		return hits[i].entry.Path < hits[j].entry.Path
	})
	out := make([]gact.FileEntry, len(hits))
	for i, h := range hits {
		out[i] = h.entry
	}
	return out
}

// fuzzyScore returns (score, ok) where ok is false if needle can't
// match hay at all. Both inputs must be lowercased.
//
// The score blends:
//   - substring bonus: needle is a direct substring → base_cost + idx
//   - basename bonus: matches in the filename component beat matches
//     in parent directories
//   - skip penalty: for scattered matches, each gap costs 10 so
//     "router" beats "r...o...u..t..e..r" in an unrelated file
//
// This intentionally avoids a proper edit-distance algorithm; the
// goal is "feels right for paths at the scale of a single repo",
// not optimal matching. Easy to read, easy to debug.
func fuzzyScore(hay, needle string) (int, bool) {
	if needle == "" {
		return 0, true
	}
	// Fast path: direct substring. Prefer the match that lands inside
	// the basename (the filename after the last '/') over matches in
	// parent directories — users typing "server" for
	// "internal/server/server.go" mean the file, not the folder.
	// strings.Index returns the earliest occurrence, so we also peek
	// at a basename-only search and pick whichever is better.
	if idx := strings.Index(hay, needle); idx >= 0 {
		base := idx
		slash := strings.LastIndex(hay, "/")
		if slash >= 0 {
			basename := hay[slash+1:]
			if bidx := strings.Index(basename, needle); bidx >= 0 {
				// Basename-substring match: much lower score so it
				// wins over directory-only substring matches.
				baseNameScore := bidx - 50
				if baseNameScore < base {
					base = baseNameScore
				}
			}
		}
		return base, true
	}
	// Skip-match: walk needle char by char through hay.
	score := 100
	hi := 0
	lastMatch := -1
	for _, nc := range needle {
		found := false
		for ; hi < len(hay); hi++ {
			if rune(hay[hi]) == nc {
				if lastMatch >= 0 {
					// Gap between consecutive matches costs 10.
					score += (hi - lastMatch - 1) * 10
				} else {
					// First-match early-start bonus.
					score += hi
				}
				lastMatch = hi
				hi++
				found = true
				break
			}
		}
		if !found {
			return 0, false
		}
	}
	return score, true
}
