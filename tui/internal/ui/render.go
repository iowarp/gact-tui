package ui

import (
	"fmt"
	"strings"
	"sync"

	"charm.land/glamour/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// glamourRenderers caches glamour TermRenderers by (style, width) so we
// don't pay the non-trivial init cost on every Render. Keyed by a struct.
type glamourKey struct {
	style string
	width int
}

var (
	glamourMu sync.Mutex
	glamourCa = map[glamourKey]*glamour.TermRenderer{}
)

func glamourRenderer(style string, width int) *glamour.TermRenderer {
	glamourMu.Lock()
	defer glamourMu.Unlock()
	k := glamourKey{style: style, width: width}
	if r, ok := glamourCa[k]; ok {
		return r
	}
	r, err := glamour.NewTermRenderer(
		glamour.WithStandardStyle(style),
		glamour.WithWordWrap(width),
		glamour.WithEmoji(),
	)
	if err != nil {
		return nil
	}
	glamourCa[k] = r
	return r
}

// renderMarkdown attempts to render s as markdown via glamour. style is
// "dark" or "light" to match the TUI theme. On any error or empty
// result, returns the original string.
func renderMarkdown(s, style string, width int) string {
	r := glamourRenderer(style, width)
	if r == nil {
		return s
	}
	out, err := r.Render(s)
	if err != nil || out == "" {
		return s
	}
	return strings.Trim(out, "\n")
}

// renderMessage formats one message for the conversation pane. Wraps to
// `width` cells and uses role-coloured headers so the user can scan flow
// at a glance. Assistant text is rendered as markdown via glamour;
// user/system/tool text is rendered literally so URLs and code don't get
// reformatted on the way in.
func (t Theme) renderMessage(m gact.Message, width int) string {
	header := t.renderRoleHeader(m.Role)
	body := t.renderPartsForRole(m.Parts, width, m.Role)
	if body == "" {
		body = t.HintLabel.Render("(no parts)")
	}
	return lipgloss.JoinVertical(lipgloss.Left, header, body, "")
}

func (t Theme) renderPartsForRole(parts []gact.Part, width int, role string) string {
	var rows []string
	for _, p := range parts {
		var rendered string
		if role == gact.RoleAssistant && p.Type == gact.PartTypeText && p.Text != "" {
			rendered = renderMarkdown(p.Text, t.glamourStyle(), width-2)
		} else {
			rendered = t.renderPart(p, width)
		}
		if rendered != "" {
			rows = append(rows, rendered)
		}
	}
	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

// glamourStyle returns "light" if the theme's background is bright,
// "dark" otherwise. We compare luminance of t.Bg cheaply by checking
// the light-theme sentinel (matches LightTheme()).
func (t Theme) glamourStyle() string {
	// LightTheme uses bg #FAFAF7. If our Bg matches that, we're light.
	if r, g, b, _ := t.Bg.RGBA(); r > 60000 && g > 60000 && b > 60000 {
		return "light"
	}
	return "dark"
}

func (t Theme) renderRoleHeader(role string) string {
	col := t.RoleAssistant
	label := "ASSISTANT"
	switch role {
	case gact.RoleUser:
		col = t.RoleUser
		label = "USER"
	case gact.RoleSystem:
		col = t.RoleSystem
		label = "SYSTEM"
	case gact.RoleTool:
		col = t.RoleTool
		label = "TOOL"
	}
	return lipgloss.NewStyle().
		Foreground(col).
		Bold(true).
		Render("● " + label)
}

func (t Theme) renderParts(parts []gact.Part, width int) string {
	var rows []string
	for _, p := range parts {
		rendered := t.renderPart(p, width)
		if rendered != "" {
			rows = append(rows, rendered)
		}
	}
	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

func (t Theme) renderPart(p gact.Part, width int) string {
	wrapW := width - 2
	if wrapW < 10 {
		wrapW = 10
	}
	switch p.Type {
	case gact.PartTypeText:
		return wrap(p.Text, wrapW)

	case gact.PartTypeThinking:
		head := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render("◊ thinking")
		body := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(wrap(p.Thinking, wrapW))
		return lipgloss.JoinVertical(lipgloss.Left, head, body)

	case gact.PartTypeToolCall:
		head := lipgloss.NewStyle().Foreground(t.RoleTool).Bold(true).
			Render(fmt.Sprintf("⚙ %s", p.ToolName))
		input := jsonOneLine(p.Input)
		body := lipgloss.NewStyle().Foreground(t.FgMuted).Render("  " + wrap(input, wrapW-2))
		return lipgloss.JoinVertical(lipgloss.Left, head, body)

	case gact.PartTypeToolResult:
		head := lipgloss.NewStyle().Foreground(t.RoleTool).Render("← result")
		errStr := ""
		if p.IsError {
			errStr = lipgloss.NewStyle().Foreground(t.Danger).Render(" (error)")
		}
		text := ""
		for _, c := range p.Content {
			text += t.renderPart(c, wrapW) + "\n"
		}
		text = strings.TrimRight(text, "\n")
		return lipgloss.JoinVertical(lipgloss.Left, head+errStr, indent(text, "  "))

	case gact.PartTypeFileDiff:
		head := lipgloss.NewStyle().Foreground(t.Warning).Bold(true).
			Render("◇ diff " + p.Path)
		status := ""
		if p.Applied {
			status = lipgloss.NewStyle().Foreground(t.Success).Render(" (applied)")
		} else if rj, ok := p.Metadata["rejected"].(bool); ok && rj {
			status = lipgloss.NewStyle().Foreground(t.FgMuted).Render(" (rejected)")
		} else {
			status = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(" — focus body, then 'a' apply / 'r' reject")
		}
		before := ""
		after := ""
		if p.Before != nil {
			before = *p.Before
		}
		if p.After != nil {
			after = *p.After
		}
		body := simpleDiff(before, after, wrapW-2)
		return lipgloss.JoinVertical(lipgloss.Left, head+status, indent(body, "  "))

	case gact.PartTypeSubagentCall:
		head := lipgloss.NewStyle().Foreground(t.Primary).Bold(true).
			Render("▼ subagent: " + p.AgentID)
		sub := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("  → " + truncateString(p.Prompt, wrapW-4))
		hint := lipgloss.NewStyle().Foreground(t.FgFaint).
			Render("  (subsession " + p.SubsessionID + ")")
		return lipgloss.JoinVertical(lipgloss.Left, head, sub, hint)

	case gact.PartTypeSubagentResult:
		head := lipgloss.NewStyle().Foreground(t.Primary).
			Render("▲ subagent done")
		body := lipgloss.NewStyle().Foreground(t.Fg).
			Render("  " + wrap(p.Summary, wrapW-2))
		return lipgloss.JoinVertical(lipgloss.Left, head, body)

	case gact.PartTypeError:
		return lipgloss.NewStyle().Foreground(t.Danger).
			Render("✗ " + p.Code + ": " + p.Message)

	case gact.PartTypeCompaction:
		head := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("⌘ history compacted")
		body := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(wrap(p.Summary, wrapW))
		return lipgloss.JoinVertical(lipgloss.Left, head, body)

	default:
		// Unknown part type — preserve presence (per SPEC §8.3) so the user
		// sees something instead of silently swallowing it.
		return lipgloss.NewStyle().Foreground(t.FgMuted).
			Render("[" + p.Type + "]")
	}
}

// wrap wraps s to width cells. Word-aware where possible. Newlines preserved.
func wrap(s string, width int) string {
	if width <= 0 {
		return s
	}
	var out strings.Builder
	for _, line := range strings.Split(s, "\n") {
		if lipgloss.Width(line) <= width {
			out.WriteString(line)
			out.WriteString("\n")
			continue
		}
		// naive word-wrap
		words := strings.Fields(line)
		cur := ""
		for _, w := range words {
			if lipgloss.Width(cur)+lipgloss.Width(w)+1 > width {
				if cur != "" {
					out.WriteString(cur)
					out.WriteString("\n")
				}
				cur = w
			} else {
				if cur == "" {
					cur = w
				} else {
					cur += " " + w
				}
			}
		}
		if cur != "" {
			out.WriteString(cur)
			out.WriteString("\n")
		}
	}
	return strings.TrimRight(out.String(), "\n")
}

// indent prefixes every line of s with prefix.
func indent(s, prefix string) string {
	if s == "" {
		return ""
	}
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = prefix + l
	}
	return strings.Join(lines, "\n")
}

// jsonOneLine produces a compact one-line representation of a JSON-ish map.
// Avoids the encoding/json import and does fine for our display use.
func jsonOneLine(m map[string]any) string {
	if m == nil {
		return "{}"
	}
	parts := []string{}
	for k, v := range m {
		parts = append(parts, fmt.Sprintf("%s: %v", k, v))
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

// simpleDiff produces a primitive +/- per-line diff — fine for the demo
// output. A real implementation would use an LCS diff.
func simpleDiff(before, after string, width int) string {
	bs := strings.Split(strings.TrimRight(before, "\n"), "\n")
	as := strings.Split(strings.TrimRight(after, "\n"), "\n")
	out := []string{}
	min := len(bs)
	if len(as) < min {
		min = len(as)
	}
	for i := 0; i < min; i++ {
		if bs[i] == as[i] {
			out = append(out, "  "+truncateString(bs[i], width-2))
			continue
		}
		out = append(out, lipgloss.NewStyle().Foreground(red).Render("- "+truncateString(bs[i], width-2)))
		out = append(out, lipgloss.NewStyle().Foreground(green).Render("+ "+truncateString(as[i], width-2)))
	}
	for i := min; i < len(bs); i++ {
		out = append(out, lipgloss.NewStyle().Foreground(red).Render("- "+truncateString(bs[i], width-2)))
	}
	for i := min; i < len(as); i++ {
		out = append(out, lipgloss.NewStyle().Foreground(green).Render("+ "+truncateString(as[i], width-2)))
	}
	return strings.Join(out, "\n")
}

func truncateString(s string, max int) string {
	if max < 1 {
		return ""
	}
	if lipgloss.Width(s) <= max {
		return s
	}
	if max <= 1 {
		return "…"
	}
	return s[:max-1] + "…"
}

var (
	red   = lipgloss.Color("#FF6B6B")
	green = lipgloss.Color("#73F59F")
)
