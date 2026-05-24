package ui

import (
	"encoding/json"
	"fmt"
	"image/color"
	"sort"
	"strings"
	"sync"

	"charm.land/glamour/v2"
	"charm.land/glamour/v2/ansi"
	"charm.land/glamour/v2/styles"
	"charm.land/lipgloss/v2"
	udiff "github.com/aymanbagabas/go-udiff"

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

func isModelSwapMarker(m gact.Message) bool {
	if m.Metadata == nil {
		return false
	}
	kind, _ := m.Metadata["gact_tui_kind"].(string)
	return kind == modelSwapMarkerKind
}

func modelSwapMarkerLabel(m gact.Message) string {
	if m.Metadata == nil {
		return ""
	}
	label, _ := m.Metadata["label"].(string)
	return strings.TrimSpace(label)
}

func modelRefLabel(m gact.Message) string {
	if m.Model == nil {
		return ""
	}
	return joinModelLabel(m.Model.ProviderID, m.Model.ModelID)
}

func joinModelLabel(provider, model string) string {
	provider = strings.TrimSpace(provider)
	model = strings.TrimSpace(model)
	switch {
	case provider != "" && model != "":
		return provider + "/" + model
	case model != "":
		return model
	case provider != "":
		return provider
	default:
		return ""
	}
}

func (t Theme) renderModelSwapDivider(m gact.Message, width int) string {
	label := modelSwapMarkerLabel(m)
	if label == "" {
		label = "unknown model"
	}
	text := " model/provider switched: " + label + " "
	if width < 20 {
		return lipgloss.NewStyle().Foreground(t.FgMuted).Render(text)
	}
	available := width - lipgloss.Width(text)
	if available < 4 {
		return lipgloss.NewStyle().Foreground(t.FgMuted).Render(truncate(text, width))
	}
	left := available / 2
	right := available - left
	line := strings.Repeat("-", left) + text + strings.Repeat("-", right)
	return lipgloss.NewStyle().Foreground(t.FgMuted).Render(line)
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

// TTTTTTTTT1: renderMessageInContextWithResultsSelected is the
// renderMessageInContextWithResults variant the conversation pane
// uses — it takes an extra selectedPartID so the per-part body
// cursor can paint a `▸ ` marker on the currently-selected block.
// Passing "" falls back to the pre-TTTTTTTTT1 behaviour (no marker).
func (t Theme) renderMessageInContextWithResultsSelected(m gact.Message, prev *gact.Message, width int, inlineResults map[string]gact.Part, selectedPartID string) string {
	if isModelSwapMarker(m) {
		return t.renderModelSwapDivider(m, width)
	}
	hideHeader := m.Role == gact.RoleTool && prev != nil &&
		(prev.Role == gact.RoleTool ||
			(prev.Role == gact.RoleAssistant && assistantCarriedToolCall(prev)))
	body := t.renderPartsForRoleWithResultsSelected(m.Parts, width, m.Role, inlineResults, selectedPartID)
	evidence := t.renderToolEvidence(m, width)
	switch {
	case body != "" && evidence != "":
		body = lipgloss.JoinVertical(lipgloss.Left, body, evidence)
	case body == "" && evidence != "":
		body = evidence
	case body == "":
		body = t.HintLabel.Render("(no parts)")
	}
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

// renderMessageInContextWithResults extends renderMessageInContext by
// inlining tool_result parts under their matching tool_call parts.
// `inlineResults` is keyed by Part.CallID; pass nil to disable.
func (t Theme) renderMessageInContextWithResults(m gact.Message, prev *gact.Message, width int, inlineResults map[string]gact.Part) string {
	if isModelSwapMarker(m) {
		return t.renderModelSwapDivider(m, width)
	}
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
	evidence := t.renderToolEvidence(m, width)
	switch {
	case body != "" && evidence != "":
		body = lipgloss.JoinVertical(lipgloss.Left, body, evidence)
	case body == "" && evidence != "":
		body = evidence
	case body == "":
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

type toolEvidenceRow struct {
	Name            string
	Args            any
	Result          any
	OK              *bool
	DurationMS      *float64
	Cached          *bool
	TelemetrySource string
}

func (t Theme) renderToolEvidence(m gact.Message, width int) string {
	if m.Role != gact.RoleAssistant || assistantCarriedToolCall(&m) {
		return ""
	}
	rows := normalizeToolEvidenceRows(m.Metadata["tools_called"])
	if len(rows) == 0 {
		return ""
	}

	wrapW := width - 2
	if wrapW < 20 {
		wrapW = width
	}
	title := lipgloss.NewStyle().Foreground(t.RoleTool).Bold(true).
		Render("Tool evidence")
	sourceNote := lipgloss.NewStyle().Foreground(t.FgMuted).
		Render("summary metadata; no live tool transcript was sent")
	out := []string{title + lipgloss.NewStyle().Foreground(t.FgFaint).Render(" · ") + sourceNote}
	for _, row := range rows {
		status := "seen"
		if row.OK != nil {
			if *row.OK {
				status = "ok"
			} else {
				status = "error"
			}
		}
		head := status + " " + row.Name
		if args := compactJSON(row.Args); args != "" {
			head += "(" + truncateString(args, 120) + ")"
		}
		var meta []string
		if row.TelemetrySource != "" {
			meta = append(meta, row.TelemetrySource)
		}
		if row.DurationMS != nil {
			meta = append(meta, fmt.Sprintf("%.0fms", *row.DurationMS))
		}
		if row.Cached != nil && *row.Cached {
			meta = append(meta, "cached")
		}
		if len(meta) > 0 {
			head += " · " + strings.Join(meta, " · ")
		}
		out = append(out, lipgloss.NewStyle().Foreground(t.RoleTool).
			Render(indent(wrap(head, wrapW-2), "  ")))
		if result := compactJSON(row.Result); result != "" {
			out = append(out, lipgloss.NewStyle().Foreground(t.FgMuted).
				Render(indent(wrap("result: "+truncateString(result, 180), wrapW-4), "    ")))
		}
	}
	return lipgloss.JoinVertical(lipgloss.Left, out...)
}

func normalizeToolEvidenceRows(raw any) []toolEvidenceRow {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	rows := make([]toolEvidenceRow, 0, len(items))
	for _, item := range items {
		rowMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name, _ := rowMap["name"].(string)
		if name == "" {
			name, _ = rowMap["tool"].(string)
		}
		if name == "" {
			continue
		}
		row := toolEvidenceRow{
			Name:            name,
			Args:            rowMap["args"],
			Result:          rowMap["result"],
			TelemetrySource: stringValue(rowMap["telemetry_source"]),
		}
		if row.Args == nil {
			row.Args = rowMap["arguments"]
		}
		if row.Args == nil {
			row.Args = rowMap["params"]
		}
		if okValue, ok := rowMap["ok"].(bool); ok {
			row.OK = &okValue
		}
		if duration, ok := floatValue(rowMap["duration_ms"]); ok {
			row.DurationMS = &duration
		}
		if cached, ok := rowMap["cached"].(bool); ok {
			row.Cached = &cached
		}
		rows = append(rows, row)
	}
	return rows
}

func compactJSON(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprint(v)
	}
	return string(b)
}

func stringValue(v any) string {
	s, _ := v.(string)
	return s
}

func floatValue(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	default:
		return 0, false
	}
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
	return t.renderPartsForRoleWithResultsSelected(parts, width, role, inlineResults, "")
}

// TTTTTTTTT1: renderPartsForRoleWithResultsSelected is the per-part
// marker-aware variant. When selectedPartID matches a part's ID, its
// first rendered line is prefixed with `▸ ` so the user can see
// which addressable block has focus. Works for both the outer part
// and the inlined tool_result sibling so "expand this specific read
// result" reads intuitively.
func (t Theme) renderPartsForRoleWithResultsSelected(parts []gact.Part, width int, role string, inlineResults map[string]gact.Part, selectedPartID string) string {
	// ZZZZZZZZZZ1: edit_file absorbs its sibling file_diff. User
	// feedback: "EditFile returns the diff, there shouldn't be an
	// 'ok' or a diff indicated but instead the changes". We match
	// edit_file tool_calls to file_diff parts in the same message
	// by path, then:
	//   - render the file_diff's body under the edit_file header
	//     (replacing the "⎿ ok" tool_result row),
	//   - suppress the standalone file_diff render to avoid the
	//     duplicate "◇ diff main.go — focus body…" block the user
	//     explicitly called out as noise.
	//
	// Falls back to the previous behaviour when no match is found
	// (e.g. a diff proposed without a preceding edit_file, or an
	// edit_file that legitimately returns non-diff output).
	editDiffByCall, suppressed := matchEditFileDiffs(parts)

	var rows []string
	for _, p := range parts {
		if suppressed[p.ID] {
			continue
		}
		var rendered string
		switch {
		case role == gact.RoleAssistant && p.Type == gact.PartTypeText && p.Text != "":
			rendered = withStreamProvenanceNote(t, p, renderMarkdown(p.Text, t, width-2))
		case p.Type == gact.PartTypeToolCall && p.ToolName == "edit_file":
			// Always render the call header (matches CC style where
			// you see the tool name + path even when the body IS the
			// diff).
			rendered = t.renderPart(p, width)
		default:
			rendered = t.renderPart(p, width)
		}
		if rendered != "" {
			if selectedPartID != "" && p.ID == selectedPartID {
				rendered = markSelectedBlock(rendered, t)
			}
			rows = append(rows, rendered)
		}
		// ZZZZZZZZZZ1: prefer the absorbed diff over the "ok" result.
		if p.Type == gact.PartTypeToolCall && p.CallID != "" {
			if diff, ok := editDiffByCall[p.CallID]; ok {
				// Render the diff's body as if it were the tool_result
				// so it nests visually under the edit_file header.
				diffBody := t.renderEditDiffInline(diff, width)
				if diffBody != "" {
					if selectedPartID != "" && diff.ID == selectedPartID {
						diffBody = markSelectedBlock(diffBody, t)
					}
					rows = append(rows, diffBody)
				}
				// Skip the normal tool_result path for this call.
				continue
			}
			if inlineResults != nil {
				if r, ok := inlineResults[p.CallID]; ok {
					// AAAAAAAAAA1: thread the parent tool_name so
					// grep / similar tools can take over the result
					// layout (file:line gutter instead of raw text).
					rr := t.renderToolResultForTool(r, width, p.ToolName)
					if rr != "" {
						if selectedPartID != "" && r.ID == selectedPartID {
							rr = markSelectedBlock(rr, t)
						}
						rows = append(rows, rr)
					}
				}
			}
		}
	}
	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

// matchEditFileDiffs walks parts and pairs each edit_file tool_call
// with a sibling file_diff for the same path. Returns:
//
//	byCall[call_id]        — diff to render under this call's header
//	suppressed[part_id]    — file_diff parts to NOT render standalone
//
// Match by path: the tool_call's Input["path"] ↔ file_diff.Path. This
// is loose on purpose — a one-shot edit flow that emits a diff and
// then the matching call (or vice versa) both get paired regardless
// of order.
func matchEditFileDiffs(parts []gact.Part) (byCall map[string]gact.Part, suppressed map[string]bool) {
	byCall = map[string]gact.Part{}
	suppressed = map[string]bool{}
	type callInfo struct {
		id   string
		path string
	}
	var calls []callInfo
	for _, p := range parts {
		if p.Type != gact.PartTypeToolCall || p.ToolName != "edit_file" {
			continue
		}
		path := ""
		if s, ok := p.Input["path"].(string); ok {
			path = s
		}
		if path == "" || p.CallID == "" {
			continue
		}
		calls = append(calls, callInfo{p.CallID, path})
	}
	if len(calls) == 0 {
		return byCall, suppressed
	}
	used := map[string]bool{} // callID set
	for _, p := range parts {
		if p.Type != gact.PartTypeFileDiff {
			continue
		}
		for _, c := range calls {
			if used[c.id] {
				continue
			}
			if c.path != p.Path {
				continue
			}
			byCall[c.id] = p
			suppressed[p.ID] = true
			used[c.id] = true
			break
		}
	}
	return byCall, suppressed
}

// AAAAAAAAAA1: renderToolResultForTool dispatches on the parent
// tool_name before falling back to the generic tool_result render.
// User feedback: grep currently shows raw "file:line:content" text;
// CC/crush render it with the filename + line number in a styled
// gutter ("  26 │ content"). Adding this dispatch lets us give each
// tool a bespoke body layout without bloating renderPart's switch.
//
// Currently handled tools:
//
//	grep — parse "path:line:content" per row, render with a right-
//	       aligned line-number gutter + colour the file path.
//	       Groups consecutive hits from the same file under one
//	       header so 14 hits across 5 files don't repeat the path
//	       on every row.
//
// Empty toolName (standalone tool_result, e.g. from a tool message
// with no pairing) falls through to the generic render — same as
// the pre-AAAAAAAAAA1 behaviour.
func (t Theme) renderToolResultForTool(p gact.Part, width int, toolName string) string {
	if toolName == "grep" {
		if out := t.renderGrepResult(p, width); out != "" {
			return out
		}
	}
	return t.renderPart(p, width)
}

// renderGrepResult parses grep's "path:line:content" output and
// renders CC-style: file header + line-number gutter per hit.
// Returns "" when parsing fails so the caller can fall back to the
// raw tool_result render.
func (t Theme) renderGrepResult(p gact.Part, width int) string {
	raw := ""
	for i, c := range p.Content {
		if i > 0 {
			raw += "\n"
		}
		if c.Type == gact.PartTypeText {
			raw += c.Text
		}
	}
	raw = strings.TrimRight(raw, "\n")
	if raw == "" {
		return ""
	}
	type hit struct {
		path    string
		line    string
		content string
	}
	var hits []hit
	for _, row := range strings.Split(raw, "\n") {
		// Expect "path:line:content". Tolerate paths that contain
		// colons by splitting only the first two.
		p1 := strings.IndexByte(row, ':')
		if p1 < 0 {
			return "" // can't parse — let the caller fall back
		}
		p2 := strings.IndexByte(row[p1+1:], ':')
		if p2 < 0 {
			return ""
		}
		p2 += p1 + 1
		h := hit{
			path:    row[:p1],
			line:    row[p1+1 : p2],
			content: row[p2+1:],
		}
		// Strip a single leading tab/space from content so the
		// gutter alignment is stable across grep invocations.
		h.content = strings.TrimLeft(h.content, "\t ")
		hits = append(hits, h)
	}
	if len(hits) == 0 {
		return ""
	}
	// Pick the gutter width: the widest line number in view.
	gutterW := 0
	for _, h := range hits {
		if w := lipgloss.Width(h.line); w > gutterW {
			gutterW = w
		}
	}
	if gutterW < 2 {
		gutterW = 2
	}
	barColor := t.RoleTool
	if barColor == nil {
		barColor = t.Border
	}
	elbow := lipgloss.NewStyle().Foreground(barColor).Render("⎿")
	bar := lipgloss.NewStyle().Foreground(barColor).Render("│")
	pathStyle := lipgloss.NewStyle().Foreground(t.Primary).Bold(true)
	lineStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
	contentStyle := lipgloss.NewStyle().Foreground(t.Fg)

	// Total content budget: width of the inner area minus the
	// " │ " (3) + " " (1 space between gutter + content) + gutterW.
	bodyBudget := width - 3 - gutterW - 1 - 2
	if bodyBudget < 10 {
		bodyBudget = 10
	}

	var rows []string
	rows = append(rows, elbow) // elbow on its own row so the ⎿ stays a single-line anchor
	lastPath := ""
	for _, h := range hits {
		if h.path != lastPath {
			// File header line — one blank separator between files
			// so visual grouping is obvious.
			if lastPath != "" {
				rows = append(rows, " "+bar)
			}
			rows = append(rows, " "+bar+" "+pathStyle.Render(h.path))
			lastPath = h.path
		}
		padded := strings.Repeat(" ", gutterW-lipgloss.Width(h.line)) + h.line
		content := h.content
		if lipgloss.Width(content) > bodyBudget {
			content = truncateString(content, bodyBudget)
		}
		row := " " + bar + " " +
			lineStyle.Render(padded) + " " + bar + " " + contentStyle.Render(content)
		rows = append(rows, row)
	}
	return strings.Join(rows, "\n")
}

// renderEditDiffInline renders a file_diff part in "absorbed" mode:
// no separate `◇ diff path` header (the edit_file call above already
// named the file), leading `⎿` so it visually continues under the
// tool_call header, unified-diff body indented one level.
func (t Theme) renderEditDiffInline(p gact.Part, width int) string {
	wrapW := width - 2
	if wrapW < 10 {
		wrapW = 10
	}
	before, after := "", ""
	if p.Before != nil {
		before = *p.Before
	}
	if p.After != nil {
		after = *p.After
	}
	body := unifiedDiffView(p.Path, before, after, wrapW-2, t)
	// Pending diffs get a one-line apply/reject hint — applied ones
	// show a muted (applied) tag; rejected ones show muted (rejected).
	status := ""
	if p.Applied {
		status = lipgloss.NewStyle().Foreground(t.Success).Render(" (applied)")
	} else if rj, ok := p.Metadata["rejected"].(bool); ok && rj {
		status = lipgloss.NewStyle().Foreground(t.FgMuted).Render(" (rejected)")
	} else {
		status = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(" — `a` apply · `r` reject")
	}
	head := lipgloss.NewStyle().Foreground(t.RoleTool).Render("⎿") + status
	return lipgloss.JoinVertical(lipgloss.Left, head, indent(body, "  "))
}

// markSelectedBlock renders a per-part body-cursor marker. WWWWWWWWW1:
// previously only the first line got a `▸ ` prefix, which shifted its
// indentation by 2 cols while continuation rows stayed at col 0 —
// wrapped text reads ragged. Fix: prefix the first line with `▸ ` and
// every continuation line with two matching spaces so the whole
// selected block indents uniformly. The marker itself stays visible
// only on line 0 so the eye catches the start of the block, but the
// indent runs all the way so wrap columns line up.
// CLIO-BBBBBBBBBB4: agentColor picks a palette slot based on a tier-2
// agent id. Lightweight hint — the spec lets backends carry a free-
// form `specialization` string, which we hash into one of three
// accent colours. Unknown ids fall back to the Secondary accent so a
// v0.2 backend that invents new agent ids still renders correctly.
func agentColor(t Theme, agentID string) color.Color {
	switch agentID {
	case "code_expert", "code", "coder", "reviewer":
		return t.Primary
	case "research_expert", "research", "search":
		return t.Warning
	case "data_expert", "data", "analysis":
		return t.Success
	default:
		return t.Secondary
	}
}

func markSelectedBlock(rendered string, t Theme) string {
	// Selection cursor uses a vertical bar so it doesn't visually collide
	// with the routing-decision triangle (▸ chat · LM-routed) drawn inside
	// message bodies. Continuation lines get a matching bar without the
	// foreground colour so the eye can still trace the highlighted block.
	marker := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("▌ ")
	cont := lipgloss.NewStyle().Foreground(t.FgFaint).Render("▎ ")
	lines := strings.Split(rendered, "\n")
	if len(lines) == 0 {
		return rendered
	}
	out := make([]string, len(lines))
	for i, l := range lines {
		if i == 0 {
			out[i] = marker + l
		} else {
			out[i] = cont + l
		}
	}
	return strings.Join(out, "\n")
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
		return withStreamProvenanceNote(t, p, wrap(p.Text, wrapW))

	case gact.PartTypeThinking:
		// Thinking stays muted + italic; "⎿" turns it into a continuation
		// of the assistant header above (Claude-Code-style demarcation).
		head := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("⎿ thinking")
		body := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(indent(wrap(p.Thinking, wrapW-2), "  "))
		return lipgloss.JoinVertical(lipgloss.Left, head, body)

	case gact.PartTypeRoutingDecision:
		// CLIO-BBBBBBBBBB4 (v0.2 §4.5): the tier-1 orchestrator's pick
		// for the current turn. Rendered as a compact badge + one-line
		// rationale — not a full block (the answer text is the real
		// content; this is metadata).
		//
		//   ▸ code_expert  ·  heuristic  ·  confidence 0.85
		//   rationale (dim)
		glyph := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("▸ ")
		agentName := lipgloss.NewStyle().Foreground(agentColor(t, p.SelectedAgent)).
			Bold(true).Render(p.SelectedAgent)
		parts := []string{glyph + agentName}
		if p.Heuristic {
			parts = append(parts, lipgloss.NewStyle().Foreground(t.FgMuted).Render("heuristic"))
		} else {
			parts = append(parts, lipgloss.NewStyle().Foreground(t.FgMuted).Render("LM-routed"))
		}
		if p.Confidence > 0 {
			parts = append(parts,
				lipgloss.NewStyle().Foreground(t.FgMuted).
					Render(fmt.Sprintf("confidence %.2f", p.Confidence)))
		}
		head := strings.Join(parts, lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  "))
		if p.Rationale == "" {
			return head
		}
		rationale := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(indent(wrap(p.Rationale, wrapW-2), "  "))
		return lipgloss.JoinVertical(lipgloss.Left, head, rationale)

	case gact.PartTypeExpertHandoff:
		agent := firstNonEmpty(
			stringValue(p.Metadata["agent_id"]),
			stringValue(p.Metadata["expert"]),
			"expert",
		)
		parent := firstNonEmpty(
			stringValue(p.Metadata["parent_id"]),
			stringValue(p.Metadata["parent"]),
		)
		stage := firstNonEmpty(
			stringValue(p.Metadata["stage"]),
			stringValue(p.Metadata["dispatch_target"]),
		)
		status := firstNonEmpty(stringValue(p.Metadata["status"]), "observed")
		route := agent
		if parent != "" {
			route = parent + " -> " + agent
		}
		glyph := lipgloss.NewStyle().Foreground(agentColor(t, agent)).Bold(true).Render("↳ ")
		head := glyph + lipgloss.NewStyle().Foreground(agentColor(t, agent)).Bold(true).Render(route)
		meta := []string{status}
		if stage != "" {
			meta = append(meta, stage)
		}
		if duration, ok := floatValue(p.Metadata["duration_ms"]); ok && duration > 0 {
			meta = append(meta, fmt.Sprintf("%.0fms", duration))
		}
		head += lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  ") +
			lipgloss.NewStyle().Foreground(t.FgMuted).Render(strings.Join(meta, " · "))
		output := firstNonEmpty(
			stringValue(p.Metadata["output_summary"]),
			stringValue(p.Metadata["summary"]),
			p.Text,
		)
		if output == "" {
			return head
		}
		body := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(indent(wrap(output, wrapW-2), "  "))
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

		raw := wrap(text.String(), wrapW-3)
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
		// UUUUUUUUU1: render a real unified diff with hunk headers +
		// context lines (Claude Code / Crush style — "this is what we
		// changed"). Falls back to the primitive row-aligned diff when
		// the content is tiny (<= 3 lines either side) since the LCS
		// output is overkill for a one-liner.
		body := unifiedDiffView(p.Path, before, after, wrapW-2, t)
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

func withStreamProvenanceNote(t Theme, p gact.Part, rendered string) string {
	if rendered == "" || p.Metadata == nil {
		return rendered
	}
	source, _ := p.Metadata["stream_source"].(string)
	if source != "synthetic_posthoc" {
		return rendered
	}
	reason := ""
	if fallback, ok := p.Metadata["stream_fallback"].(map[string]any); ok {
		reason, _ = fallback["reason"].(string)
	}
	label := "post-hoc text"
	if reason != "" {
		label += ": " + reason
	}
	note := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(label)
	return lipgloss.JoinVertical(lipgloss.Left, note, rendered)
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
			if lipgloss.Width(w) > width {
				if cur != "" {
					out.WriteString(cur)
					out.WriteString("\n")
					cur = ""
				}
				chunks := hardWrapWord(w, width)
				for i, chunk := range chunks {
					if i == len(chunks)-1 {
						cur = chunk
					} else {
						out.WriteString(chunk)
						out.WriteString("\n")
					}
				}
				continue
			}
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

func hardWrapWord(word string, width int) []string {
	if width <= 0 || lipgloss.Width(word) <= width {
		return []string{word}
	}
	var chunks []string
	var cur strings.Builder
	curW := 0
	for _, r := range word {
		rw := lipgloss.Width(string(r))
		if curW > 0 && curW+rw > width {
			chunks = append(chunks, cur.String())
			cur.Reset()
			curW = 0
		}
		cur.WriteRune(r)
		curW += rw
	}
	if cur.Len() > 0 {
		chunks = append(chunks, cur.String())
	}
	return chunks
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
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		v := m[k]
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
	case "bash", "shell", "shell_bash", "exec":
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

// UUUUUUUUU1: unifiedDiffView renders a real hunk-aware diff
// (Myers/LCS via go-udiff) instead of the primitive row-aligned diff
// simpleDiff produces. Output mirrors `git diff --no-color` in
// structure:
//
//	@@ -A,B +C,D @@                    ← hunk header (muted primary)
//	   context line                    ← 2-space gutter, dim fg
//	 - removed line                    ← red
//	 + added line                      ← green
//
// For tiny changes (before+after <= 6 lines combined) it short-
// circuits to simpleDiff — the unified diff's hunk header is more
// noise than signal on a one-liner. width is the inner column budget
// before the caller's indent — each line is truncated to width-2 so
// the gutter glyph always fits.
func unifiedDiffView(path, before, after string, width int, t Theme) string {
	lineCount := func(s string) int {
		if s == "" {
			return 0
		}
		return strings.Count(s, "\n") + 1
	}
	if lineCount(before)+lineCount(after) <= 6 {
		return simpleDiff(before, after, width)
	}
	// go-udiff's Unified() uses 3 context lines, which matches git's
	// default and is what Crush/CC use.
	raw := udiff.Unified(path, path, before, after)
	if raw == "" {
		return lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("(no changes)")
	}
	// Strip the `--- path` / `+++ path` header rows; we already
	// rendered the file name in the part head above, and the
	// redundant row wastes vertical budget.
	var out []string
	dimStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
	hunkStyle := lipgloss.NewStyle().Foreground(t.Primary).Bold(true)
	delStyle := lipgloss.NewStyle().Foreground(red)
	addStyle := lipgloss.NewStyle().Foreground(green)
	ctxStyle := lipgloss.NewStyle().Foreground(t.Fg)
	for _, ln := range strings.Split(strings.TrimRight(raw, "\n"), "\n") {
		if strings.HasPrefix(ln, "--- ") || strings.HasPrefix(ln, "+++ ") {
			continue
		}
		if strings.HasPrefix(ln, "@@") {
			// Hunk header: keep the whole line, coloured to stand out.
			out = append(out, hunkStyle.Render(truncateString(ln, width)))
			continue
		}
		if len(ln) == 0 {
			out = append(out, "")
			continue
		}
		prefix, rest := ln[:1], ln[1:]
		// Pad/truncate rest to width-2 so the gutter stays visible on
		// long lines (keep the leading `- ` / `+ ` marker).
		rest = truncateString(rest, width-2)
		switch prefix {
		case "-":
			out = append(out, delStyle.Render("- "+rest))
		case "+":
			out = append(out, addStyle.Render("+ "+rest))
		case " ":
			// Context lines: dim but readable. `·` at the start so the
			// gutter reads as a 2-char prefix like the +/- cases.
			out = append(out, ctxStyle.Render("  "+rest))
		case "\\":
			// "\ No newline at end of file" — muted, rare.
			out = append(out, dimStyle.Italic(true).Render(truncateString(ln, width)))
		default:
			out = append(out, truncateString(ln, width))
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
