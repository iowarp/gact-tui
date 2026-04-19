package ui

import (
	"fmt"
	"image/color"
	"strings"
	"sync"

	"charm.land/glamour/v2"
	"charm.land/glamour/v2/ansi"
	"charm.land/glamour/v2/styles"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// glamourRenderers caches glamour TermRenderers by (themeKey, width) so
// we don't pay the non-trivial init cost on every Render. themeKey is
// the canonical ThemeMode name — a swap invalidates the cache naturally
// because the key changes.
type glamourKey struct {
	themeKey string
	width    int
}

var (
	glamourMu sync.Mutex
	glamourCa = map[glamourKey]*glamour.TermRenderer{}
)

// glamourRenderer returns a cached TermRenderer whose StyleConfig is
// derived from the supplied Theme. P1: previously we used glamour's
// built-in named styles (light/dark/dracula/tokyo-night) which don't
// know about our theme's Fg/Bg/Primary/Warning, so code blocks + heading
// colours were always off for the in-between palettes (Solarized, Nord).
// Now each palette gets a StyleConfig that starts from the closest
// built-in base and overrides the fields that matter for readability.
func glamourRenderer(t Theme, width int) *glamour.TermRenderer {
	glamourMu.Lock()
	defer glamourMu.Unlock()
	k := glamourKey{themeKey: ThemeModeName(ThemeModeFor(t)), width: width}
	if r, ok := glamourCa[k]; ok {
		return r
	}
	cfg := glamourStyleFromTheme(t)
	r, err := glamour.NewTermRenderer(
		glamour.WithStyles(cfg),
		glamour.WithWordWrap(width),
		glamour.WithEmoji(),
	)
	if err != nil {
		return nil
	}
	glamourCa[k] = r
	return r
}

// renderMarkdown attempts to render s as markdown via glamour. Theme
// drives both the colour palette and the cache key. On any error or
// empty result, returns the original string.
func renderMarkdown(s string, t Theme, width int) string {
	r := glamourRenderer(t, width)
	if r == nil {
		return s
	}
	out, err := r.Render(s)
	if err != nil || out == "" {
		return s
	}
	return strings.Trim(out, "\n")
}

// glamourStyleFromTheme builds an ansi.StyleConfig out of the Theme.
// We start from glamour's Dark or Light base depending on the theme's
// background luminance, then override the colours that directly
// affect readability of the conversation pane — document text,
// headings, inline code, fenced code blocks, and links.
//
// The override strategy intentionally keeps most of glamour's defaults
// (prefixes, margins, italics) untouched; only colour fields get
// replaced. Hex colours come from the lipgloss Color type which
// implements color.Color; we pass them as pointer-to-string since that's
// what ansi.StylePrimitive expects.
func glamourStyleFromTheme(t Theme) ansi.StyleConfig {
	// Choose a reasonable base: light backgrounds get glamour's light
	// defaults (dark text on near-white), everything else gets dark.
	base := styles.DarkStyleConfig
	switch ThemeModeFor(t) {
	case ModeLight, ModeSolarizedLight:
		base = styles.LightStyleConfig
	}

	fg := hexOf(t.Fg)
	muted := hexOf(t.FgMuted)
	primary := hexOf(t.Primary)
	secondary := hexOf(t.Secondary)
	warning := hexOf(t.Warning)
	bgSub := hexOf(t.BgSubtle)

	// Body text + paragraph defaults.
	base.Document.Color = strPtr(fg)
	base.Paragraph.Color = strPtr(fg)
	base.Text.Color = strPtr(fg)

	// Headings take the primary accent.
	base.Heading.Color = strPtr(primary)
	base.Heading.Bold = boolPtr(true)
	base.H1.Color = strPtr(primary)
	base.H2.Color = strPtr(primary)
	base.H3.Color = strPtr(primary)
	base.H4.Color = strPtr(primary)
	base.H5.Color = strPtr(primary)
	base.H6.Color = strPtr(primary)

	// Inline code — warning colour on the subtle-bg surface. Using
	// the theme's Warning (usually the only saturated yellow/orange)
	// keeps it readable against both dark and light backgrounds.
	base.Code.Color = strPtr(warning)
	base.Code.BackgroundColor = strPtr(bgSub)

	// Fenced code blocks: glamour keeps a margin; we only retint the
	// top-level code colour. The embedded chroma (syntax highlighter)
	// has its own palette per theme; leaving it alone keeps language-
	// specific colouring sensible.
	base.CodeBlock.Color = strPtr(fg)

	// Links + block quotes lean on the secondary accent.
	base.Link.Color = strPtr(secondary)
	base.LinkText.Color = strPtr(secondary)
	base.BlockQuote.Color = strPtr(muted)

	// Emph/strong inherit the body colour; glamour's default italic/
	// bold is enough. We only retint if the starting value is unset,
	// so long text emphasis doesn't get coloured out of the flow.
	if base.Emph.Color == nil {
		base.Emph.Color = strPtr(fg)
	}
	if base.Strong.Color == nil {
		base.Strong.Color = strPtr(fg)
	}

	return base
}

// hexOf converts a color.Color into a CSS-style #RRGGBB string that
// glamour can parse. Alpha is dropped — glamour doesn't use it.
func hexOf(c color.Color) string {
	r, g, b, _ := c.RGBA()
	return fmt.Sprintf("#%02X%02X%02X", r>>8, g>>8, b>>8)
}

// strPtr / boolPtr return pointers to their arg. glamour's
// StyleConfig uses pointer scalars so "unset" can be distinguished
// from "zero value".
func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

// renderMessage formats one message for the conversation pane. Wraps to
// `width` cells and uses role-coloured headers so the user can scan flow
// at a glance. Assistant text is rendered as markdown via glamour;
// user/system/tool text is rendered literally so URLs and code don't get
// reformatted on the way in.
func (t Theme) renderMessage(m gact.Message, width int) string {
	return t.renderMessageInContext(m, nil, width)
}

// pairToolResults walks a slice of messages and, for each assistant
// message that contains tool_call parts, builds a map from call_id →
// tool_result Part by absorbing the consecutive role=tool messages
// that follow. Returns:
//
//   - inlineResults[i] = map of results to inline into message i
//     (only set for assistants that carried tool_calls)
//   - absorbed[i] = true if message i is a tool message whose result
//     was paired into the previous assistant and should NOT be
//     rendered standalone
//
// Pairing is by Part.CallID. Unpaired tool results stay visible
// standalone so we never silently lose output.
func pairToolResults(msgs []gact.Message) (map[int]map[string]gact.Part, map[int]bool) {
	inlineResults := map[int]map[string]gact.Part{}
	absorbed := map[int]bool{}
	for i := range msgs {
		m := msgs[i]
		if m.Role != gact.RoleAssistant {
			continue
		}
		// Collect the call_ids this assistant emitted.
		wantedCalls := map[string]bool{}
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeToolCall && p.CallID != "" {
				wantedCalls[p.CallID] = true
			}
		}
		if len(wantedCalls) == 0 {
			continue
		}
		// Walk forward through tool messages, picking out matching results.
		results := map[string]gact.Part{}
		for j := i + 1; j < len(msgs); j++ {
			tm := msgs[j]
			if tm.Role != gact.RoleTool {
				break
			}
			matched := false
			for _, p := range tm.Parts {
				if p.Type == gact.PartTypeToolResult && wantedCalls[p.CallID] {
					results[p.CallID] = p
					matched = true
				}
			}
			// If the entire tool message is paired, mark it absorbed.
			// If it had unmatched parts, leave it visible standalone.
			if matched {
				allMatched := true
				for _, p := range tm.Parts {
					if p.Type == gact.PartTypeToolResult && !wantedCalls[p.CallID] {
						allMatched = false
						break
					}
				}
				if allMatched {
					absorbed[j] = true
				}
			} else {
				// Unmatched tool message — stop the scan; subsequent
				// tool messages aren't ours either.
				break
			}
		}
		if len(results) > 0 {
			inlineResults[i] = results
		}
	}
	return inlineResults, absorbed
}

// renderMessageInContext is like renderMessage but also takes the
// previous message in the conversation so it can suppress the
// `● TOOL` role header when a tool-result message follows an
// assistant-with-tool-call. That combination is the "output of the
// previous call" (Claude Code style — the output visually nests
// under the call, no separate role boundary) and the TOOL banner
// just adds noise.
func (t Theme) renderMessageInContext(m gact.Message, prev *gact.Message, width int) string {
	return t.renderMessageInContextWithResults(m, prev, width, nil)
}

// renderMessageInContextWithResults extends renderMessageInContext by
// inlining tool_result parts under their matching tool_call parts.
// `inlineResults` is keyed by Part.CallID; pass nil to disable.
func (t Theme) renderMessageInContextWithResults(m gact.Message, prev *gact.Message, width int, inlineResults map[string]gact.Part) string {
	// Hide the TOOL role header when this message is a result following
	// either (a) an assistant-with-tool-calls OR (b) another TOOL
	// message — the latter covers the multi-tool case where one
	// assistant turn emits several calls and the results arrive as
	// a chain of TOOL messages. The outputs all visually nest under
	// the single assistant turn's ToolName(…) headers above.
	hideHeader := m.Role == gact.RoleTool && prev != nil &&
		(prev.Role == gact.RoleTool ||
			(prev.Role == gact.RoleAssistant && assistantCarriedToolCall(prev)))

	body := t.renderPartsForRoleWithResults(m.Parts, width, m.Role, inlineResults)
	if body == "" {
		body = t.HintLabel.Render("(no parts)")
	}
	// Optional timestamp row (S1). Rendered in a faint style under the
	// role header so it doesn't fight for attention with the message
	// content. Skipped when the header itself is hidden (tool-result
	// nesting) — the timestamp would look orphaned there.
	ts := ""
	if t.ShowTimestamps && !m.CreatedAt.IsZero() && !hideHeader {
		ts = lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
			Render("  " + m.CreatedAt.Format("2006-01-02 15:04:05"))
	}
	if hideHeader {
		return lipgloss.JoinVertical(lipgloss.Left, body, "")
	}
	header := t.renderRoleHeader(m.Role)
	parts := []string{header}
	if ts != "" {
		parts = append(parts, ts)
	}
	parts = append(parts, body, "")
	return lipgloss.JoinVertical(lipgloss.Left, parts...)
}

// assistantCarriedToolCall reports whether m has any tool_call
// part — used by renderMessageInContext to decide whether the
// following tool message is a "result" that should nest under
// the call rather than stand alone.
func assistantCarriedToolCall(m *gact.Message) bool {
	if m == nil {
		return false
	}
	for _, p := range m.Parts {
		if p.Type == gact.PartTypeToolCall {
			return true
		}
	}
	return false
}

func (t Theme) renderPartsForRole(parts []gact.Part, width int, role string) string {
	return t.renderPartsForRoleWithResults(parts, width, role, nil)
}

// renderPartsForRoleWithResults renders parts in order, but when a
// tool_call part has a matching entry in `inlineResults` (by CallID),
// the result Part is rendered immediately after the call so the
// output visually hangs off its own header. Without this map the
// behaviour is identical to renderPartsForRole.
func (t Theme) renderPartsForRoleWithResults(parts []gact.Part, width int, role string, inlineResults map[string]gact.Part) string {
	var rows []string
	for _, p := range parts {
		var rendered string
		if role == gact.RoleAssistant && p.Type == gact.PartTypeText && p.Text != "" {
			rendered = renderMarkdown(p.Text, t, width-2)
		} else {
			rendered = t.renderPart(p, width)
		}
		if rendered != "" {
			rows = append(rows, rendered)
		}
		// Interleave: if this is a tool_call we have a result for,
		// emit the matching result right after.
		if p.Type == gact.PartTypeToolCall && p.CallID != "" && inlineResults != nil {
			if r, ok := inlineResults[p.CallID]; ok {
				if rr := t.renderPart(r, width); rr != "" {
					rows = append(rows, rr)
				}
			}
		}
	}
	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

// glamourStyle is retained for backwards compat with any caller that
// still wants the raw name — tests use it to verify light/dark
// mapping. The production render path uses glamourStyleFromTheme
// directly so inline/code colours follow the theme.
func (t Theme) glamourStyle() string {
	switch ThemeModeFor(t) {
	case ModeLight, ModeSolarizedLight:
		return "light"
	case ModeDracula:
		return "dracula"
	default:
		return "dark"
	}
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
		// Thinking stays muted + italic; "⎿" turns it into a continuation
		// of the assistant header above (Claude-Code-style demarcation).
		head := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("⎿ thinking")
		body := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(indent(wrap(p.Thinking, wrapW-2), "  "))
		return lipgloss.JoinVertical(lipgloss.Left, head, body)

	case gact.PartTypeToolCall:
		// Claude-Code style: `ToolName(summary_of_input)` header with
		// the input inlined as a one-liner when it fits, "…" when it
		// overflows. Nothing indented beneath the header unless there
		// are structured args to highlight (we don't split those out
		// yet; tool_result carries the output and gets its own ⎿).
		summary := toolCallSummary(p)
		toolName := capitalizeToolName(p.ToolName)
		headText := toolName + "(" + summary + ")"
		if lipgloss.Width(headText) > wrapW {
			// Truncate the summary to fit. -3 for "…)" suffix.
			keep := wrapW - lipgloss.Width(toolName) - 3
			if keep < 4 {
				keep = 4
			}
			headText = toolName + "(" + truncateString(summary, keep) + "…)"
		}
		return lipgloss.NewStyle().Foreground(t.RoleTool).Bold(true).
			Render(headText)

	case gact.PartTypeToolResult:
		// Claude-Code style: output hangs under the tool call with a
		// leading `⎿` glyph, indented to visually continue the call.
		// Errors get a red glyph + "(error)" tag on the first line.
		//
		// Auto-collapse large outputs. A 200-line log should not blow
		// up the viewport; it should preview the first few lines and
		// show a "[N more lines — Ctrl+E to expand]" footer. The user
		// can open the full content in the floating detail view.
		// XXXXX1: Claude-Code-grade contrast for tool output.
		// Previously the body inherited FgMuted (same washed-out gray
		// as muted text) and continuation rows had no gutter — so the
		// `⎿` elbow on line 0 was the only visual anchor for what
		// could be 80 lines of output. User feedback: "could we get
		// the output not just elbow bended, but maybe on a slightly
		// different color".
		// Two changes:
		//  1. Body text uses full Fg (not FgMuted) so it reads
		//     as content, not a faded annotation.
		//  2. Continuation indent renders a `│ ` styled in
		//     RoleTool/Border (with a left-margin space) so a
		//     subtle vertical bar runs the full height of the
		//     block, anchoring everything visually under the call.
		glyph := "⎿"
		barColor := t.RoleTool
		if barColor == nil {
			barColor = t.Border
		}
		glyphStyle := lipgloss.NewStyle().Foreground(barColor)
		barStyle := lipgloss.NewStyle().Foreground(barColor)
		if p.IsError {
			glyphStyle = glyphStyle.Foreground(t.Danger)
			barStyle = barStyle.Foreground(t.Danger)
		}
		var text strings.Builder
		for i, c := range p.Content {
			if i > 0 {
				text.WriteString("\n")
			}
			text.WriteString(t.renderPart(c, wrapW-2))
		}
		bodyStyle := lipgloss.NewStyle().Foreground(t.Fg)
		if p.IsError {
			bodyStyle = bodyStyle.Foreground(t.Danger)
		}

		raw := text.String()
		threshold := t.CollapseThreshold
		if threshold <= 0 {
			threshold = toolResultPreviewLines
		}
		collapsed, hidden := collapseForPreview(raw, threshold)
		rendered := bodyStyle.Render(collapsed)
		errTag := ""
		if p.IsError {
			errTag = lipgloss.NewStyle().Foreground(t.Danger).Italic(true).
				Render(" (error)")
		}
		// Continuation rows: " │ " (space + bar + space) so the bar
		// hangs under the elbow's stem at column 1, matching the
		// `⎿` glyph's vertical leg position.
		cont := " " + barStyle.Render("│") + " "
		body := indentWithGlyph(rendered, glyphStyle.Render(glyph)+errTag, cont)
		if hidden > 0 {
			// P4: surface the Ctrl+E affordance with real weight — the
			// previous faint-italic sat below users' radar. Key style
			// matches the footer hints (Secondary + bold) so users pick
			// up the pattern without having to remember a third
			// affordance style.
			prefix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(fmt.Sprintf("   [%d more lines · ", hidden))
			keyStyle := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
			suffix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(" to expand]")
			hint := prefix + keyStyle.Render("Ctrl+E") + suffix
			body = body + "\n" + hint
		}
		return body

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

// toolCallSummary produces the "arg summary" that goes inside the
// parentheses of a Claude-Code-style tool-call header. Well-known
// tools get their primary arg pulled up inline (Bash: `command`,
// Read: `path`, Grep: `pattern`) so the header reads naturally.
// Anything else falls back to a compact JSON-oneline.
func toolCallSummary(p gact.Part) string {
	if p.Input == nil {
		return ""
	}
	tool := strings.ToLower(p.ToolName)
	primary := ""
	switch tool {
	case "bash", "shell", "exec":
		if v, ok := p.Input["command"].(string); ok {
			primary = v
		} else if v, ok := p.Input["cmd"].(string); ok {
			primary = v
		}
	case "read", "read_file", "cat":
		if v, ok := p.Input["path"].(string); ok {
			primary = v
		}
	case "write", "write_file", "edit", "edit_file":
		if v, ok := p.Input["path"].(string); ok {
			primary = v
		}
	case "grep", "search":
		if v, ok := p.Input["pattern"].(string); ok {
			primary = v
		}
	case "web_search":
		if v, ok := p.Input["query"].(string); ok {
			primary = v
		}
	}
	if primary != "" {
		return primary
	}
	return jsonOneLine(p.Input)
}

// capitalizeToolName renders the tool name in CamelCase for the
// Claude-Code-style header (e.g. "bash" → "Bash", "read_file" →
// "ReadFile", "web_search" → "WebSearch"). Matches how Claude Code
// displays tool calls so users who've seen both UIs get consistent
// visual vocabulary.
func capitalizeToolName(name string) string {
	if name == "" {
		return "Tool"
	}
	parts := strings.Split(name, "_")
	for i, w := range parts {
		if w == "" {
			continue
		}
		parts[i] = strings.ToUpper(w[:1]) + w[1:]
	}
	return strings.Join(parts, "")
}

// toolResultPreviewLines is the inline preview budget for tool_result
// bodies. Anything longer collapses to this many lines + a "[N more]"
// footer. 8 lines hits the typical "`tail -N` output fits on one
// screen" sweet spot without drowning the conversation pane.
const toolResultPreviewLines = 8

// collapseForPreview returns (visible, hidden) where visible is the
// first `n` lines of s and hidden is the count of lines not shown
// (0 when s already fits in n lines). Preserves trailing-newline
// absence — if s has no trailing \n, the visible prefix doesn't
// either. Used by tool_result rendering to keep big outputs from
// blowing up the viewport; the full content is reachable via the
// Ctrl+E detail view.
func collapseForPreview(s string, n int) (string, int) {
	if n <= 0 {
		return "", lineCount(s)
	}
	lines := strings.Split(s, "\n")
	// Trailing empty line from Split("text\n", "\n") shouldn't count
	// toward the visible budget — collapse() treats "text\n" as 1
	// line, not 2.
	total := len(lines)
	if total > 0 && lines[total-1] == "" {
		total--
	}
	if total <= n {
		return s, 0
	}
	visible := strings.Join(lines[:n], "\n")
	return visible, total - n
}

// lineCount counts content lines in s (no trailing-empty inflation).
// Used by the detail view to show "{count} lines" without surprising
// off-by-ones on strings with/without a trailing newline.
func lineCount(s string) int {
	if s == "" {
		return 0
	}
	n := strings.Count(s, "\n")
	if !strings.HasSuffix(s, "\n") {
		n++
	}
	return n
}

// indentWithGlyph prepends `glyph` to the first line of s and `cont`
// to every continuation line. Used by the tool_result render to
// produce:
//
//	⎿ first line of output
//	   second line of output
//	   third line of output
//
// Preserves trailing-newline absence — if s has no trailing \n, the
// output doesn't either.
func indentWithGlyph(s, glyph, cont string) string {
	if s == "" {
		return glyph
	}
	lines := strings.Split(s, "\n")
	out := make([]string, len(lines))
	for i, l := range lines {
		if i == 0 {
			out[i] = glyph + " " + l
		} else {
			out[i] = cont + l
		}
	}
	return strings.Join(out, "\n")
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
