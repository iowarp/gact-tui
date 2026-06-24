package ui

import (
	"strings"
	"testing"
)

func TestConversationCopyDragHighlightMarksVisibleSelection(t *testing.T) {
	snapshot := conversationCopySnapshot{
		rect: mouseRect{x: 10, y: 4, w: 40, h: 2},
		lines: []string{
			"hello world",
			"second line",
		},
	}
	drag := conversationCopyDrag{
		active: true,
		moved:  true,
		startX: 10,
		startY: 4,
		endX:   14,
		endY:   4,
	}

	rendered := renderConversationCopySelection(strings.Join(snapshot.lines, "\n"), snapshot, drag, DefaultTheme())
	if !strings.Contains(rendered, "\x1b[") {
		t.Fatalf("highlighted selection should contain ANSI styling: %q", rendered)
	}
	if !strings.Contains(rendered, "\x1b[4") && !strings.Contains(rendered, ";4;") {
		t.Fatalf("highlighted selection should underline selected text for visibility: %q", rendered)
	}
	if got := strings.TrimSpace(stripANSI(rendered)); got != "hello world\nsecond line" {
		t.Fatalf("highlight should preserve visible text, got %q", got)
	}
}

func TestConversationCopyDragHighlightUsesBodyLocalCoordinates(t *testing.T) {
	a := New("http://example.invalid")
	a.Theme = DefaultTheme()
	a.clipboard.conversationCopy = conversationCopySnapshot{
		rect:  mouseRect{x: 34, y: 15, w: 80, h: 1},
		lines: []string{"status: success"},
	}
	a.clipboard.copyDrag = conversationCopyDrag{
		active: true,
		moved:  true,
		startX: 34,
		startY: 15,
		endX:   48,
		endY:   15,
	}

	rendered := a.clipboard.renderConversationDragHighlight("status: success")
	if !strings.Contains(rendered, "\x1b[") {
		t.Fatalf("highlight should contain ANSI styling after local coordinate conversion: %q", rendered)
	}
	if got := strings.TrimSpace(stripANSI(rendered)); got != "status: success" {
		t.Fatalf("highlight should preserve visible text, got %q", got)
	}
}

func TestCopySelectionOnSurfaceHighlightsBodyRowWithOffset(t *testing.T) {
	snapshot := conversationCopySnapshot{
		rect: mouseRect{x: 2, y: 2, w: 40, h: 2},
		lines: []string{
			"alpha detail line",
			"bravo detail line",
		},
	}
	drag := conversationCopyDrag{
		active: true,
		moved:  true,
		startX: 2,
		startY: 2,
		endX:   6,
		endY:   2,
	}
	surface := strings.Join([]string{
		"modal title",
		"Operator view",
		"  alpha detail line",
		"  bravo detail line",
	}, "\n")

	rendered := renderCopySelectionOnSurface(surface, snapshot, drag, DefaultTheme())
	lines := strings.Split(rendered, "\n")
	if strings.Contains(lines[0], "\x1b[") || strings.Contains(lines[1], "\x1b[") {
		t.Fatalf("selection should not highlight header rows:\n%q\n%q", lines[0], lines[1])
	}
	if !strings.Contains(lines[2], "\x1b[") {
		t.Fatalf("selection should highlight the body row, got %q", lines[2])
	}
	if got := strings.TrimSpace(stripANSI(rendered)); got != strings.TrimSpace(surface) {
		t.Fatalf("highlight should preserve visible surface text, got %q", got)
	}
}

func TestConversationCopyDragHighlightShowsInitialCellBeforeMotion(t *testing.T) {
	snapshot := conversationCopySnapshot{
		rect:  mouseRect{x: 10, y: 4, w: 40, h: 1},
		lines: []string{"hello world"},
	}
	drag := conversationCopyDrag{
		active: true,
		startX: 10,
		startY: 4,
		endX:   10,
		endY:   4,
	}

	rendered := renderConversationCopySelection(strings.Join(snapshot.lines, "\n"), snapshot, drag, DefaultTheme())
	if !strings.Contains(rendered, "\x1b[") {
		t.Fatalf("initial drag cell should contain ANSI styling: %q", rendered)
	}
	if got := strings.TrimSpace(stripANSI(rendered)); got != "hello world" {
		t.Fatalf("initial drag highlight should preserve visible text, got %q", got)
	}
}
