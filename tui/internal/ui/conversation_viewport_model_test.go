package ui

import (
	"strings"
	"testing"
)

func TestSelectedPartScrollAdjustmentUsesPreferredMarker(t *testing.T) {
	body := strings.Join([]string{
		"▸ routing-looking row",
		"line 1",
		"line 2",
		"line 3",
		"line 4",
		"line 5",
		"line 6",
		"line 7",
		"line 8",
		"▌ selected current marker",
		"line 10",
		"line 11",
		"line 12",
	}, "\n")

	state := selectedPartScrollAdjustment(body, 5, 0, true)
	start := conversationVisibleStart(13, 5, state.scrollOffset, state.stickyToBottom)
	if start > 9 || start+5 <= 9 {
		t.Fatalf("current marker row should be visible, start=%d state=%+v", start, state)
	}
}

func TestSelectedPartScrollAdjustmentNoMarkerNoOp(t *testing.T) {
	state := selectedPartScrollAdjustment("one\ntwo", 5, 7, false)
	if state.scrollOffset != 7 || state.stickyToBottom || state.changed {
		t.Fatalf("no marker should not change state: %+v", state)
	}
}

func TestConversationVisibleStartMatchesStickyAndOffsetSemantics(t *testing.T) {
	if got := conversationVisibleStart(50, 10, 0, true); got != 40 {
		t.Fatalf("sticky start = %d, want 40", got)
	}
	if got := conversationVisibleStart(50, 10, 7, false); got != 33 {
		t.Fatalf("offset start = %d, want 33", got)
	}
	if got := conversationVisibleStart(4, 10, 7, false); got != 0 {
		t.Fatalf("short body start = %d, want 0", got)
	}
}

func TestConversationContentRectFromGeometryClampsToPaneContent(t *testing.T) {
	rect := conversationContentRectFromGeometry(30, 2, 3, 20, 4, 80, true)
	if rect != (mouseRect{x: 35, y: 7, w: 20, h: 4}) {
		t.Fatalf("rect = %+v", rect)
	}

	clamped := conversationContentRectFromGeometry(30, 0, 100, 20, 0, 12, false)
	if clamped != (mouseRect{x: 39, y: 4, w: 1, h: 1}) {
		t.Fatalf("clamped rect = %+v", clamped)
	}
}
