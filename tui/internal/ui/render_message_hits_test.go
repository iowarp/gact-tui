package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// renderMessageWithHits renders the row and computes hit geometry in one pass.
// This guards the invariant that the geometry it emits lines up with the row it
// produces: every block has positive height, blocks are ordered and
// non-overlapping, each maps to a real part, and none runs past the rendered
// line count. (Row text itself is pinned by the golden suite; this pins the
// row<->geometry agreement the old two-pass design could silently break.)
func TestRenderMessageWithHitsGeometryIsConsistent(t *testing.T) {
	theme := ThemeForMode(ModeDark)
	theme.ShowTimestamps = true
	msgs := benchmarkSemanticMessages(4)
	for i := range msgs {
		var prev *gact.Message
		if i > 0 {
			prev = &msgs[i-1]
		}
		row, blocks := theme.renderMessageWithHits(msgs[i], prev, 100, nil, "")
		lineCount := len(strings.Split(row, "\n"))
		lastEnd := -1
		for _, b := range blocks {
			if b.partID == "" {
				t.Fatalf("%s: block has empty partID", msgs[i].ID)
			}
			if b.height <= 0 {
				t.Fatalf("%s: block %q height must be > 0", msgs[i].ID, b.partID)
			}
			if b.fullStart <= lastEnd {
				t.Fatalf("%s: block %q starts at %d, overlapping previous end %d", msgs[i].ID, b.partID, b.fullStart, lastEnd)
			}
			if b.fullStart+b.height > lineCount {
				t.Fatalf("%s: block %q [%d,%d) exceeds %d rendered lines", msgs[i].ID, b.partID, b.fullStart, b.fullStart+b.height, lineCount)
			}
			if b.messageID != msgs[i].ID {
				t.Fatalf("%s: block messageID %q mismatch", msgs[i].ID, b.messageID)
			}
			lastEnd = b.fullStart + b.height - 1
		}
	}
}
