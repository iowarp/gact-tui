package render

// render_notice.go renders a notice part: a service notice recorded in the
// transcript. A failed compaction (source "compaction_failed") is its durable
// record and reads like the web's in-place error: "Context could not be
// summarized", why, the typed code, and who started it. Any other source is a
// plain notice line.

import (
	"image/color"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// NoticeSourceCompactionFailed is the notice a failed compaction leaves.
const NoticeSourceCompactionFailed = "compaction_failed"

// CompactionTriggerLabel names who started a compaction ("" when unknown).
func CompactionTriggerLabel(trigger string) string {
	switch strings.TrimSpace(trigger) {
	case "auto":
		return "Automatic"
	case "manual":
		return "Requested"
	default:
		return ""
	}
}

// humanizeCode turns a wire code into words ("compaction_unavailable" ->
// "Compaction unavailable").
func humanizeCode(code string) string {
	words := strings.TrimSpace(strings.ReplaceAll(code, "_", " "))
	if words == "" {
		return ""
	}
	return strings.ToUpper(words[:1]) + words[1:]
}

// NoticeRow is the transcript row for a notice part.
func NoticeRow(p gact.Part, wrapW int, danger, muted color.Color) string {
	source := strings.TrimSpace(valuefmt.StringValue(p.Source))
	text := strings.TrimSpace(p.Text)
	code := humanizeCode(p.Code)
	if source != NoticeSourceCompactionFailed {
		title := humanizeCode(source)
		if title == "" {
			title = "Notice"
		}
		line := "! " + title
		if text != "" {
			line += ": " + text
		}
		if code != "" {
			line += " (" + code + ")"
		}
		return lipgloss.NewStyle().Foreground(muted).Render(textutil.Wrap(line, wrapW))
	}

	title := "✗ Context could not be summarized"
	if trigger := CompactionTriggerLabel(p.Trigger); trigger != "" {
		title += " · " + trigger
	}
	rows := []string{
		lipgloss.NewStyle().Foreground(danger).Bold(true).Render(textutil.Truncate(title, wrapW)),
	}
	if text == "" {
		text = "The service did not report why."
	}
	rows = append(rows, lipgloss.NewStyle().Foreground(danger).
		Render(indentLines(textutil.Wrap(text, wrapW-2), "  ")))
	if code != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(muted).
			Render(indentLines(textutil.Wrap(code, wrapW-2), "  ")))
	}
	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

func indentLines(s, prefix string) string {
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		lines[i] = prefix + line
	}
	return strings.Join(lines, "\n")
}
