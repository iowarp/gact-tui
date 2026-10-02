package render

import (
	"image/color"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestNoticeRowShowsACompactionFailureLikeAnErrorRow(t *testing.T) {
	p := gact.Part{
		Type:    gact.PartTypeNotice,
		Source:  "compaction_failed",
		Text:    "No language model is bound.",
		Code:    "compaction_unavailable",
		Trigger: "manual",
	}
	out := ansi.Strip(NoticeRow(p, 60, color.White, color.White))
	for _, want := range []string{
		"Context could not be summarized",
		"Requested",
		"No language model is bound.",
		"Compaction unavailable",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("notice row missing %q:\n%s", want, out)
		}
	}
}

func TestNoticeRowNamesOtherSourcesPlainly(t *testing.T) {
	p := gact.Part{Type: gact.PartTypeNotice, Source: "quota_warning", Text: "Close to the limit."}
	out := ansi.Strip(NoticeRow(p, 60, color.White, color.White))
	if strings.Contains(out, "Context could not be summarized") {
		t.Fatalf("plain notice rendered as a compaction failure: %q", out)
	}
	if !strings.Contains(out, "Quota warning: Close to the limit.") {
		t.Fatalf("plain notice line = %q", out)
	}
}

func TestNoticeRowFitsTheWrapWidth(t *testing.T) {
	p := gact.Part{
		Type:   gact.PartTypeNotice,
		Source: "compaction_failed",
		Text:   strings.Repeat("the summarizer could not reach the model ", 4),
		Code:   "compaction_unavailable",
	}
	out := ansi.Strip(NoticeRow(p, 30, color.White, color.White))
	for _, line := range strings.Split(out, "\n") {
		if w := ansi.StringWidth(line); w > 30 {
			t.Fatalf("line wider than the wrap width (%d > 30): %q", w, line)
		}
	}
}
