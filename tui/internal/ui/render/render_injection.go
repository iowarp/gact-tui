package render

// render_injection.go renders an injection part: data CLIO (the harness) put into
// the agent's context -- a plan reminder, the todo list, a path suggestion, a saved
// oversize result, a hook's effect. The row names what it was behind a syringe; the
// detail view (Ctrl+E) shows exactly the text the agent got.

import (
	"image/color"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// injectionLabels mirrors the web client's INJECTION_LABELS
// (web/src/components/clio/conversation-message-blocks.tsx).
var injectionLabels = map[string]string{
	"todos":           "Todo list",
	"plan_mode":       "Plan reminder",
	"replan":          "Replanning suggestion",
	"memory_search":   "Memory search results",
	"task_results":    "Results from background tasks",
	"path_hint":       "Path suggestion",
	"circuit_breaker": "Repeated-failure warning",
	"result_spilled":  "Large result saved to a file",
	"hook":            "Hook",
	"summarization":   "Summarization",
}

// InjectionSource is the part's source ("" when absent).
func InjectionSource(p gact.Part) string {
	return strings.TrimSpace(valuefmt.StringValue(p.Source))
}

// InjectionLabel names a source in plain words; an unlisted one is humanized
// ("earlier_turns" -> "Earlier turns").
func InjectionLabel(source string) string {
	if label, ok := injectionLabels[source]; ok {
		return label
	}
	words := strings.TrimSpace(strings.ReplaceAll(source, "_", " "))
	if words == "" {
		return "Harness data"
	}
	return strings.ToUpper(words[:1]) + words[1:]
}

// InjectionRow is the collapsed transcript row: what CLIO gave the agent, and the
// key that opens the exact text.
func InjectionRow(p gact.Part, wrapW int, muted, key color.Color) string {
	head := lipgloss.NewStyle().Foreground(muted).
		Render(textutil.Truncate("💉 CLIO gave the agent: "+InjectionLabel(InjectionSource(p)), wrapW))
	prefix := lipgloss.NewStyle().Foreground(muted).Italic(true).Render("  [exact text · ")
	keyStyle := lipgloss.NewStyle().Foreground(key).Bold(true)
	suffix := lipgloss.NewStyle().Foreground(muted).Italic(true).Render("]")
	return lipgloss.JoinVertical(lipgloss.Left, head, prefix+keyStyle.Render("Ctrl+E")+suffix)
}
