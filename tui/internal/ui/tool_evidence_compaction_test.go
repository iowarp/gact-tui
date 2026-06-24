package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestCompactSummaryTextPromotesToCompactionPart(t *testing.T) {
	msg := gact.Message{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{
				ID:   "compact_1",
				Type: gact.PartTypeText,
				Text: "[compact summary]\nEvidence-Preserving Compact Memory\nkept tool evidence",
				Metadata: map[string]any{
					"synthetic": "compact_summary",
				},
			},
		},
	}

	normalizeMessagePresentation(&msg)
	part := msg.Parts[0]
	if part.Type != gact.PartTypeCompaction {
		t.Fatalf("compact summary should promote to compaction part, got %s", part.Type)
	}
	if part.Text != "" {
		t.Fatalf("promoted compaction should clear text body, got %q", part.Text)
	}
	if strings.Contains(part.Summary, "[compact summary]") ||
		!strings.Contains(part.Summary, "Evidence-Preserving Compact Memory") {
		t.Fatalf("summary should strip transport marker and preserve content: %q", part.Summary)
	}
	if got := part.Metadata["synthetic_from"]; got != "compact_summary_text" {
		t.Fatalf("promoted compaction should keep provenance, got %v", got)
	}
}

func TestCompactionSummaryPreviewCollapsesAndAdvertisesDetail(t *testing.T) {
	part := gact.Part{
		Type: gact.PartTypeCompaction,
		Summary: strings.Join([]string{
			"Evidence-Preserving Compact Memory",
			"line 1",
			"line 2",
			"line 3",
			"line 4",
			"line 5",
			"line 6",
			"line 7",
		}, "\n"),
		Metadata: map[string]any{
			"synthetic_from": "compact_summary_text",
		},
	}

	out := ansi.Strip(DefaultTheme().renderPart(part, 100))
	if !strings.Contains(out, "compacted context summary") {
		t.Fatalf("compaction should render as a state marker:\n%s", out)
	}
	if !strings.Contains(out, "compact summary · full summary") || !strings.Contains(out, "Ctrl+E") {
		t.Fatalf("collapsed compaction should advertise detail expansion:\n%s", out)
	}
	if strings.Contains(out, "line 7") {
		t.Fatalf("long compaction summary should be collapsed inline:\n%s", out)
	}
}
