package ui

// render_part_misc.go renders miscellaneous parts (subagent, error, compaction, provenance, unknown).

import (
	"fmt"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func (t Theme) renderSubagentCallPart(p gact.Part, wrapW int) string {
	head := lipgloss.NewStyle().Foreground(t.Primary).Bold(true).
		Render("▼ subagent: " + p.AgentID)
	sub := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
		Render("  → " + textutil.Truncate(p.Prompt, wrapW-4))
	hint := lipgloss.NewStyle().Foreground(t.FgFaint).
		Render("  (subsession " + p.SubsessionID + ")")
	return lipgloss.JoinVertical(lipgloss.Left, head, sub, hint)
}

func (t Theme) renderSubagentResultPart(p gact.Part, wrapW int) string {
	head := lipgloss.NewStyle().Foreground(t.Primary).
		Render("▲ subagent done")
	body := lipgloss.NewStyle().Foreground(t.Fg).
		Render("  " + textutil.Wrap(p.Summary, wrapW-2))
	return lipgloss.JoinVertical(lipgloss.Left, head, body)
}

func (t Theme) renderErrorPart(p gact.Part, wrapW int) string {
	head := lipgloss.NewStyle().Foreground(t.Danger).Bold(true).
		Render("✗ " + p.Code)
	if p.Message != "" {
		body := lipgloss.NewStyle().Foreground(t.Danger).
			Render(indent(textutil.Wrap(valuefmt.ShortenKnownPaths(p.Message), wrapW-2), "  "))
		head = lipgloss.JoinVertical(lipgloss.Left, head, body)
	}
	if len(p.Metadata) == 0 {
		return head
	}
	prefix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
		Render("  [error detail · ")
	keyStyle := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	suffix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
		Render("]")
	return lipgloss.JoinVertical(lipgloss.Left, head, prefix+keyStyle.Render("Ctrl+E")+suffix)
}

func (t Theme) renderCompactionPart(p gact.Part, wrapW int) string {
	head := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
		Render("⌘ compacted context summary")
	summary := strings.TrimSpace(p.Summary)
	if summary == "" {
		return head
	}
	raw := textutil.Wrap(summary, wrapW-2)
	collapsed, hidden := collapseForPreview(raw, compactionPreviewLines)
	body := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
		Render(indent(collapsed, "  "))
	if hidden > 0 {
		provenance := promotedEvidenceLabel(p)
		label := "full summary"
		if provenance != "" {
			label = provenance + " · " + label
		}
		prefix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(fmt.Sprintf("  [%d more lines · %s · ", hidden, label))
		keyStyle := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
		suffix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("]")
		body += "\n" + prefix + keyStyle.Render("Ctrl+E") + suffix
	}
	return lipgloss.JoinVertical(lipgloss.Left, head, body)
}

func (t Theme) renderRuntimeProvenancePart(p gact.Part, wrapW int) string {
	head := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).
		Render("◇ runtime provenance")
	body := strings.TrimSpace(p.Text)
	if body == "" {
		body = "structured execution evidence"
	}
	rendered := lipgloss.NewStyle().Foreground(t.FgMuted).
		Render(indent(textutil.Wrap(body, wrapW-2), "  "))
	prefix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
		Render("  [trace, tools, skills, delegation · ")
	keyStyle := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	suffix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
		Render("]")
	return lipgloss.JoinVertical(lipgloss.Left, head, rendered, prefix+keyStyle.Render("Ctrl+E")+suffix)
}

func (t Theme) renderUnknownPart(p gact.Part) string {
	return lipgloss.NewStyle().Foreground(t.FgMuted).
		Render("[" + p.Type + "]")
}
