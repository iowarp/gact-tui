package ui

import (
	"encoding/json"
	"fmt"
	"image/color"
	"sort"
	"strconv"
	"strings"
	"sync"

	"charm.land/glamour/v2"
	glamouransi "charm.land/glamour/v2/ansi"
	"charm.land/glamour/v2/styles"
	"charm.land/lipgloss/v2"
	udiff "github.com/aymanbagabas/go-udiff"
	xansi "github.com/charmbracelet/x/ansi"

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

func renderMarkdownOrWrap(s string, t Theme, width int) string {
	s = expandInlineMarkdownTables(s)
	if looksLikeMarkdownBlock(s) {
		return renderMarkdown(s, t, width)
	}
	return wrap(s, width)
}

func looksLikeMarkdownBlock(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	lines := strings.Split(s, "\n")
	pipeRows := 0
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "# ") ||
			strings.HasPrefix(line, "## ") ||
			strings.HasPrefix(line, "### ") ||
			strings.HasPrefix(line, "- ") ||
			strings.HasPrefix(line, "* ") ||
			strings.HasPrefix(line, "> ") ||
			strings.HasPrefix(line, "```") {
			return true
		}
		if len(line) > 3 && line[0] >= '0' && line[0] <= '9' {
			if dot := strings.Index(line, ". "); dot > 0 && dot <= 3 {
				return true
			}
		}
		if strings.Count(line, "|") >= 2 {
			pipeRows++
			if pipeRows >= 2 {
				return true
			}
		}
		if strings.Contains(line, "**") || strings.Contains(line, "__") || strings.Contains(line, "`") {
			return true
		}
	}
	return false
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
func glamourStyleFromTheme(t Theme) glamouransi.StyleConfig {
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
	normalizeMessagePresentation(&m)
	if isModelSwapMarker(m) {
		return t.renderModelSwapDivider(m, width)
	}
	hideHeader := shouldHideConversationHeader(m, prev)
	body := t.renderPartsForRoleWithResultsSelected(m.Parts, width, m.Role, inlineResults, selectedPartID)
	evidence := t.renderToolEvidence(m, width)
	switch {
	case body != "" && evidence != "":
		body = lipgloss.JoinVertical(lipgloss.Left, body, evidence)
	case body == "" && evidence != "":
		body = evidence
	case body == "" && isSemanticLiveMessage(m):
		return ""
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
	header := t.renderMessageHeader(m)
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
	normalizeMessagePresentation(&m)
	if isModelSwapMarker(m) {
		return t.renderModelSwapDivider(m, width)
	}
	hideHeader := shouldHideConversationHeader(m, prev)

	body := t.renderPartsForRoleWithResults(m.Parts, width, m.Role, inlineResults)
	evidence := t.renderToolEvidence(m, width)
	switch {
	case body != "" && evidence != "":
		body = lipgloss.JoinVertical(lipgloss.Left, body, evidence)
	case body == "" && evidence != "":
		body = evidence
	case body == "" && isSemanticLiveMessage(m):
		return ""
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
	header := t.renderMessageHeader(m)
	parts := []string{header}
	if ts != "" {
		parts = append(parts, ts)
	}
	parts = append(parts, body, "")
	return lipgloss.JoinVertical(lipgloss.Left, parts...)
}

func shouldHideConversationHeader(m gact.Message, prev *gact.Message) bool {
	if isSemanticLiveMessage(m) {
		return true
	}
	if prev == nil {
		return false
	}
	// Tool results and semantic live events are part of the surrounding
	// assistant turn. Keep the technical message split available in detail
	// metadata, but do not promote it to a separate visible actor.
	if m.Role == gact.RoleTool &&
		(prev.Role == gact.RoleTool ||
			(prev.Role == gact.RoleAssistant && assistantCarriedToolCall(prev))) {
		return true
	}
	return false
}

func isSemanticLiveMessage(m gact.Message) bool {
	return m.Metadata != nil && m.Metadata["semantic_live_message"] == true
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
	RepeatCount     int
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
		if toolEvidenceRowIsError(row) {
			status = "error"
		} else if row.OK != nil {
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
		if row.RepeatCount > 0 {
			head += " · repeated " + strconv.Itoa(row.RepeatCount) + " more time" + plural(row.RepeatCount)
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
	seen := map[string]int{}
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
		key := toolEvidenceRowKey(row)
		if prior, ok := seen[key]; ok {
			rows[prior].RepeatCount++
			continue
		}
		seen[key] = len(rows)
		rows = append(rows, row)
	}
	return rows
}

func toolEvidenceRowKey(row toolEvidenceRow) string {
	return row.Name + "\x00" + compactJSON(row.Args) + "\x00" + compactJSON(row.Result)
}

func toolEvidenceRowIsError(row toolEvidenceRow) bool {
	if row.OK != nil && !*row.OK {
		return true
	}
	return toolEvidenceResultIsError(row.Result)
}

func toolEvidenceResultIsError(raw any) bool {
	result, ok := raw.(map[string]any)
	if !ok {
		return false
	}
	if okValue, ok := result["ok"].(bool); ok && !okValue {
		return true
	}
	switch errValue := result["error"].(type) {
	case map[string]any:
		return len(errValue) > 0
	case string:
		return strings.TrimSpace(errValue) != ""
	default:
		return errValue != nil
	}
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
	pairedResults, pairedResultIndexes := pairedToolResultsInParts(parts, inlineResults)
	duplicateSkip, duplicateNotice := compactDuplicateToolRuns(parts, inlineResults)

	var rows []string
	for i, p := range parts {
		if partHiddenFromTranscript(p) || suppressed[p.ID] || duplicateSkip[p.ID] || pairedResultIndexes[i] {
			continue
		}
		var rendered string
		switch {
		case role == gact.RoleAssistant && p.Type == gact.PartTypeText && p.Text != "":
			rendered = t.renderAssistantTextPart(p, width)
		case p.Type == gact.PartTypeToolCall && p.ToolName == "edit_file":
			// Always render the call header (matches CC style where
			// you see the tool name + path even when the body IS the
			// diff).
			rendered = t.renderPart(toolCallWithResultStatusSuppressed(p, pairedResults), width)
		default:
			rendered = t.renderPart(toolCallWithResultStatusSuppressed(p, pairedResults), width)
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
			if pairedResults != nil {
				if r, ok := pairedResults[p.CallID]; ok {
					// AAAAAAAAAA1: thread the parent tool_name so
					// grep / similar tools can take over the result
					// layout (file:line gutter instead of raw text).
					rr := t.renderToolResultForTool(r, width, p.ToolName)
					if rr != "" {
						if selectedPartID != "" && r.ID == selectedPartID {
							rr = markSelectedBlock(rr, t)
						}
						rows = append(rows, rr)
						if repeat := duplicateNotice[r.ID]; repeat > 0 {
							rows = append(rows, t.renderDuplicateToolNotice(p.ToolName, repeat))
						}
					}
				}
			}
		} else if repeat := duplicateNotice[p.ID]; repeat > 0 {
			rows = append(rows, t.renderDuplicateToolNotice(p.ToolName, repeat))
		}
	}
	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

type conversationPartHitBlock struct {
	msgIdx      int
	addrIdx     int
	fullStart   int
	height      int
	detailStart int
	diffActions []conversationDiffActionHit
	messageID   string
	partID      string
	opensDetail bool
}

type conversationDiffActionHit struct {
	path   string
	action string
	row    int
	col    int
	width  int
}

func (t Theme) conversationPartHitBlocks(m gact.Message, prev *gact.Message, width int, inlineResults map[string]gact.Part) []conversationPartHitBlock {
	normalizeMessagePresentation(&m)
	if isModelSwapMarker(m) {
		return nil
	}
	hideHeader := shouldHideConversationHeader(m, prev)
	row := 0
	if !hideHeader {
		row++ // role header
		if t.ShowTimestamps && !m.CreatedAt.IsZero() {
			row++
		}
	}
	blocks := t.partHitBlocks(m, width, inlineResults)
	for i := range blocks {
		blocks[i].fullStart += row
		blocks[i].messageID = m.ID
	}
	return blocks
}

func (t Theme) partHitBlocks(m gact.Message, width int, inlineResults map[string]gact.Part) []conversationPartHitBlock {
	editDiffByCall, suppressed := matchEditFileDiffs(m.Parts)
	pairedResults, pairedResultIndexes := pairedToolResultsInParts(m.Parts, inlineResults)
	duplicateSkip, duplicateNotice := compactDuplicateToolRuns(m.Parts, inlineResults)
	addr := addressablePartsOf(m)
	addrByPart := make(map[int]int, len(addr))
	for i, partIdx := range addr {
		addrByPart[partIdx] = i
	}
	row := 0
	var blocks []conversationPartHitBlock
	for i, p := range m.Parts {
		if partHiddenFromTranscript(p) || suppressed[p.ID] || duplicateSkip[p.ID] || pairedResultIndexes[i] {
			continue
		}
		start := row
		height := 0
		detailStart := -1
		var diffActions []conversationDiffActionHit
		var rendered string
		switch {
		case m.Role == gact.RoleAssistant && p.Type == gact.PartTypeText && p.Text != "":
			rendered = t.renderAssistantTextPart(p, width)
		case p.Type == gact.PartTypeToolCall && p.ToolName == "edit_file":
			rendered = t.renderPart(toolCallWithResultStatusSuppressed(p, pairedResults), width)
		default:
			rendered = t.renderPart(toolCallWithResultStatusSuppressed(p, pairedResults), width)
		}
		if rendered != "" {
			h := renderedStringLineCount(rendered)
			if detailLine := detailAffordanceLine(rendered); detailLine >= 0 {
				detailStart = start + detailLine
			}
			height += h
			row += h
		}
		if p.Type == gact.PartTypeToolCall && p.CallID != "" {
			if diff, ok := editDiffByCall[p.CallID]; ok {
				resultStart := row
				diffBody := t.renderEditDiffInline(diff, width)
				if diffBody != "" {
					h := renderedStringLineCount(diffBody)
					if pendingFileDiff(diff) {
						for _, action := range diffActionHits(diff.Path, diffBody) {
							action.row += resultStart
							diffActions = append(diffActions, action)
						}
					}
					height += h
					row += h
				}
			} else if pairedResults != nil {
				if r, ok := pairedResults[p.CallID]; ok {
					rr := t.renderToolResultForTool(r, width, p.ToolName)
					if rr != "" {
						resultStart := row
						h := renderedStringLineCount(rr)
						if detailLine := detailAffordanceLine(rr); detailLine >= 0 {
							detailStart = resultStart + detailLine
						}
						height += h
						row += h
						if repeat := duplicateNotice[r.ID]; repeat > 0 {
							notice := t.renderDuplicateToolNotice(p.ToolName, repeat)
							h := renderedStringLineCount(notice)
							height += h
							row += h
						}
					}
				}
			}
		} else if repeat := duplicateNotice[p.ID]; repeat > 0 {
			notice := t.renderDuplicateToolNotice(p.ToolName, repeat)
			h := renderedStringLineCount(notice)
			height += h
			row += h
		}
		addrIdx, ok := addrByPart[i]
		if ok && height > 0 {
			_, opens := findBulkyPartForSelected(m, addrIdx, nil, 0)
			if p.Type == gact.PartTypeFileDiff && pendingFileDiff(p) {
				for _, action := range diffActionHits(p.Path, rendered) {
					action.row += start
					diffActions = append(diffActions, action)
				}
			}
			blocks = append(blocks, conversationPartHitBlock{
				addrIdx:     addrIdx,
				fullStart:   start,
				height:      height,
				detailStart: detailStart,
				diffActions: diffActions,
				partID:      p.ID,
				opensDetail: opens,
			})
		}
	}
	return blocks
}

func detailAffordanceLine(rendered string) int {
	lines := strings.Split(xansi.Strip(rendered), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := lines[i]
		if strings.Contains(line, "Ctrl+E") ||
			strings.Contains(line, "raw detail") ||
			strings.Contains(line, "error detail") ||
			strings.Contains(line, "full summary") {
			return i
		}
	}
	return -1
}

func pendingFileDiff(p gact.Part) bool {
	if p.Type != gact.PartTypeFileDiff || p.Applied {
		return false
	}
	if p.Metadata != nil {
		if rejected, ok := p.Metadata["rejected"].(bool); ok && rejected {
			return false
		}
	}
	return strings.TrimSpace(p.Path) != ""
}

func diffActionHits(path string, rendered string) []conversationDiffActionHit {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}
	lines := strings.Split(xansi.Strip(rendered), "\n")
	for row, line := range lines {
		applyCol := strings.LastIndex(line, "apply")
		rejectCol := strings.LastIndex(line, "reject")
		if applyCol < 0 || rejectCol < 0 {
			continue
		}
		return []conversationDiffActionHit{
			{path: path, action: "apply", row: row, col: applyCol, width: len("apply")},
			{path: path, action: "reject", row: row, col: rejectCol, width: len("reject")},
		}
	}
	return nil
}

func renderedStringLineCount(s string) int {
	if s == "" {
		return 0
	}
	return strings.Count(s, "\n") + 1
}

func (t Theme) renderAssistantTextPart(p gact.Part, width int) string {
	body := withStreamProvenanceNote(t, p, renderMarkdownOrWrap(summarizeAssistantInlineText(p.Text), t, width-2))
	if !partMetadataBool(p, "partial_after_error") {
		return body
	}
	note := lipgloss.NewStyle().Foreground(t.Danger).Bold(true).
		Render("! partial answer after surfaced error")
	return lipgloss.JoinVertical(lipgloss.Left, note, body)
}

func partMetadataBool(p gact.Part, key string) bool {
	if p.Metadata == nil {
		return false
	}
	v, ok := p.Metadata[key].(bool)
	return ok && v
}

func compactDuplicateToolRuns(parts []gact.Part, inlineResults map[string]gact.Part) (map[string]bool, map[string]int) {
	skip := map[string]bool{}
	notice := map[string]int{}
	for i := 0; i < len(parts); {
		call, result, next, ok := toolPairAt(parts, i, inlineResults)
		if !ok {
			i++
			continue
		}
		key := duplicateToolPairKey(call, result)
		runEnd := next
		runCount := 1
		var duplicateIDs []string
		for runEnd < len(parts) {
			nextCall, nextResult, after, ok := toolPairAt(parts, runEnd, inlineResults)
			if !ok || duplicateToolPairKey(nextCall, nextResult) != key {
				break
			}
			runCount++
			if nextCall.ID != "" {
				duplicateIDs = append(duplicateIDs, nextCall.ID)
			}
			if nextResult.ID != "" {
				duplicateIDs = append(duplicateIDs, nextResult.ID)
			}
			runEnd = after
		}
		if runCount >= 3 {
			for _, id := range duplicateIDs {
				skip[id] = true
			}
			noticeID := result.ID
			if noticeID == "" {
				noticeID = call.ID
			}
			if noticeID != "" {
				notice[noticeID] = runCount - 1
			}
		}
		i = runEnd
	}
	return skip, notice
}

func toolPairAt(parts []gact.Part, index int, inlineResults map[string]gact.Part) (gact.Part, gact.Part, int, bool) {
	if index < 0 || index >= len(parts) {
		return gact.Part{}, gact.Part{}, index, false
	}
	call := parts[index]
	if call.Type != gact.PartTypeToolCall || call.CallID == "" {
		return gact.Part{}, gact.Part{}, index, false
	}
	if index+1 < len(parts) {
		result := parts[index+1]
		if result.Type == gact.PartTypeToolResult && result.CallID == call.CallID {
			return call, result, index + 2, true
		}
	}
	if inlineResults != nil {
		if result, ok := inlineResults[call.CallID]; ok {
			return call, result, index + 1, true
		}
	}
	return gact.Part{}, gact.Part{}, index, false
}

func duplicateToolPairKey(call, result gact.Part) string {
	return call.ToolName + "\x00" + toolCallSummary(call) + "\x00" +
		strings.Join(strings.Fields(flattenToolResult(result)), " ")
}

func (t Theme) renderDuplicateToolNotice(toolName string, repeat int) string {
	if repeat <= 0 {
		return ""
	}
	name := capitalizeToolName(toolName)
	text := fmt.Sprintf("↻ %s repeated %d more time%s with the same call/result", name, repeat, plural(repeat))
	return lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render("   " + text)
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
	if !p.IsError {
		if summary := summarizeToolResultText(toolName, flattenToolResult(p)); summary != "" {
			preview := p
			rawText := flattenToolResult(p)
			if strings.TrimSpace(summary) != strings.TrimSpace(rawText) {
				preview.Metadata = clonePartMetadata(preview.Metadata)
				preview.Metadata["raw_result"] = rawText
			}
			preview.Content = []gact.Part{{
				Type: gact.PartTypeText,
				Text: summary,
			}}
			return t.renderPart(preview, width)
		}
	}
	return t.renderPart(p, width)
}

func clonePartMetadata(metadata map[string]any) map[string]any {
	clone := make(map[string]any, len(metadata)+1)
	for key, value := range metadata {
		clone[key] = value
	}
	return clone
}

func summarizeToolResultText(toolName string, rawText string) string {
	rawText = strings.TrimSpace(rawText)
	if rawText == "" {
		return ""
	}
	var payload any
	if err := json.Unmarshal([]byte(rawText), &payload); err != nil {
		return summarizeNonJSONToolResultText(toolName, rawText)
	}
	return summarizeToolResult(toolName, payload)
}

func summarizeNonJSONToolResultText(toolName string, rawText string) string {
	lowerTool := strings.ToLower(strings.TrimSpace(toolName))
	if strings.Contains(lowerTool, "geo_geocode") || strings.Contains(lowerTool, "geocode") {
		return summarizePseudoGeocodeResult(rawText)
	}
	return ""
}

func summarizePseudoGeocodeResult(rawText string) string {
	name := firstNonEmpty(
		pseudoFieldString(rawText, "display_name"),
		pseudoFieldString(rawText, "name"),
	)
	lat := pseudoFieldNumber(rawText, "lat")
	lon := pseudoFieldNumber(rawText, "lon")
	provenance := pseudoFieldString(rawText, "provenance")
	if name == "" && (lat == "" || lon == "") {
		return ""
	}
	var rows []string
	if name != "" {
		rows = append(rows, name)
	}
	if lat != "" && lon != "" {
		rows = append(rows, "center: "+lat+", "+lon)
	}
	if provenance != "" {
		rows = append(rows, "source: "+provenance)
	}
	return strings.Join(rows, "\n")
}

func pseudoFieldString(rawText, key string) string {
	for _, quote := range []string{"'", `"`} {
		token := quote + key + quote + ":"
		idx := strings.Index(rawText, token)
		if idx < 0 {
			continue
		}
		rest := strings.TrimSpace(rawText[idx+len(token):])
		if rest == "" || (rest[0] != '\'' && rest[0] != '"') {
			continue
		}
		endQuote := rest[0]
		rest = rest[1:]
		end := strings.IndexRune(rest, rune(endQuote))
		if end >= 0 {
			return strings.TrimSpace(rest[:end])
		}
	}
	return ""
}

func pseudoFieldNumber(rawText, key string) string {
	for _, quote := range []string{"'", `"`} {
		token := quote + key + quote + ":"
		idx := strings.Index(rawText, token)
		if idx < 0 {
			continue
		}
		rest := strings.TrimSpace(rawText[idx+len(token):])
		end := 0
		for end < len(rest) {
			ch := rest[end]
			if (ch >= '0' && ch <= '9') || ch == '-' || ch == '+' || ch == '.' {
				end++
				continue
			}
			break
		}
		return strings.TrimSpace(rest[:end])
	}
	return ""
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
	case "main", "orchestrator":
		return t.Primary
	case "code_expert", "code", "coder", "reviewer":
		return t.Primary
	case "research_expert", "research", "search":
		return t.Warning
	case "data_expert", "data":
		return t.Success
	case "analysis", "seismic_analysis", "sac_format":
		return t.Warning
	case "visualization", "viz":
		return t.Secondary
	case "ndp_catalog", "earthscope_catalog", "geospatial":
		return t.RoleTool
	default:
		return t.Secondary
	}
}

func renderAgentName(t Theme, agentID string) string {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return ""
	}
	return lipgloss.NewStyle().Foreground(agentColor(t, agentID)).Bold(true).Render(agentID)
}

func renderAgentHandoffNarrative(t Theme, parent, agent, stage, status string, failed bool) string {
	parent = strings.TrimSpace(parent)
	agent = strings.TrimSpace(agent)
	stage = strings.ToLower(strings.TrimSpace(stage))
	status = strings.ToLower(strings.TrimSpace(status))
	parentName := renderAgentName(t, parent)
	agentName := renderAgentName(t, agent)
	switch {
	case failed:
		if parentName != "" && agentName != "" {
			return agentName + " failed while working for " + parentName
		}
		if agentName != "" {
			return agentName + " failed"
		}
	case strings.Contains(stage, "started"):
		if parentName != "" && agentName != "" {
			return parentName + " handed work to " + agentName
		}
		if agentName != "" {
			return agentName + " started"
		}
	case strings.Contains(stage, "completed"):
		if agentName != "" && parentName != "" {
			return agentName + " returned evidence to " + parentName
		}
		if agentName != "" {
			return agentName + " returned evidence"
		}
	case strings.Contains(stage, "resumed"):
		if parentName != "" && agentName != "" {
			return parentName + " resumed after " + agentName
		}
		if parentName != "" {
			return parentName + " resumed"
		}
	case status == "running":
		if parentName != "" && agentName != "" {
			return parentName + " handed work to " + agentName
		}
	}
	if parentName != "" && agentName != "" {
		arrow := lipgloss.NewStyle().Foreground(t.FgFaint).Render(" -> ")
		return parentName + arrow + agentName
	}
	if agentName != "" {
		return agentName
	}
	return renderAgentName(t, "expert")
}

func (t Theme) renderSemanticReactThought(p gact.Part, width int) string {
	thought := strings.TrimSpace(p.Thinking)
	if thought == "" {
		return ""
	}
	agent := firstNonEmpty(stringValue(p.Metadata["agent_id"]), "expert")
	stepLabel := "step"
	if step, ok := firstNumericValue(p.Metadata, "step_index"); ok {
		stepLabel = fmt.Sprintf("step %.0f", step)
	}
	if toolName := stringValue(p.Metadata["tool_name"]); toolName != "" {
		stepLabel += " · " + toolDisplayName(toolName)
	}
	lines := strings.Count(thought, "\n") + 1
	prefix := strings.Repeat("  ", clampWorkflowDepth(semanticReactStepDepth(agent, p.Metadata)+1))
	glyph := lipgloss.NewStyle().Foreground(agentColor(t, agent)).Bold(true).Render("◦ ")
	keyStyle := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	meta := []string{
		stepLabel,
		fmt.Sprintf("thinking available · %d line%s", lines, pluralS(lines)),
		keyStyle.Render("Ctrl+E"),
	}
	return prefix + glyph + renderAgentName(t, agent) +
		lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  ") +
		lipgloss.NewStyle().Foreground(t.FgMuted).Render(strings.Join(meta, " · "))
}

func expertHandoffDepth(parent, agent string, metadata map[string]any) int {
	if metadata != nil {
		if depth, ok := firstNumericValue(metadata, "depth", "tier"); ok {
			return clampWorkflowDepth(int(depth))
		}
	}
	parent = strings.ToLower(strings.TrimSpace(parent))
	agent = strings.ToLower(strings.TrimSpace(agent))
	if parent == "" || parent == agent {
		return 0
	}
	if workflowRootAgent(parent) {
		return 1
	}
	return 2
}

func semanticReactStepDepth(agent string, metadata map[string]any) int {
	if metadata != nil {
		if depth, ok := firstNumericValue(metadata, "depth", "tier"); ok {
			return clampWorkflowDepth(int(depth))
		}
	}
	switch strings.ToLower(strings.TrimSpace(agent)) {
	case "", "main", "orchestrator", "root", "default":
		return 0
	case "data", "geospatial", "analysis", "synthesis", "visualization", "station_network_analysis", "earthscope_station_catalog", "gnss_timeseries_analysis", "seismic_event_catalog":
		return 1
	}
	if strings.Contains(agent, "_") {
		return 2
	}
	return 1
}

func toolPartWorkflowPrefix(p gact.Part) string {
	agent := firstNonEmpty(
		stringValue(p.Metadata["agent_id"]),
		stringValue(p.Metadata["expert"]),
		stringValue(p.Metadata["tool_owner_agent"]),
	)
	parent := firstNonEmpty(
		stringValue(p.Metadata["parent_id"]),
		stringValue(p.Metadata["parent"]),
	)
	if agent == "" && parent == "" {
		return ""
	}
	depth := expertHandoffDepth(parent, agent, p.Metadata)
	return strings.Repeat("  ", clampWorkflowDepth(depth+1))
}

func workflowRootAgent(agent string) bool {
	switch strings.ToLower(strings.TrimSpace(agent)) {
	case "", "main", "orchestrator", "root", "default":
		return true
	default:
		return false
	}
}

func clampWorkflowDepth(depth int) int {
	if depth < 0 {
		return 0
	}
	if depth > 5 {
		return 5
	}
	return depth
}

func pluralS(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
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

func (t Theme) renderToolDetailHint(label string) string {
	text := "detail"
	if strings.TrimSpace(label) != "" {
		text += ": " + strings.TrimSpace(label)
	}
	text += " · Ctrl+E expand"
	return lipgloss.NewStyle().Foreground(t.FgFaint).Render(text)
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

func (t Theme) renderMessageHeader(m gact.Message) string {
	if isSemanticLiveMessage(m) {
		return t.renderRoleHeader(gact.RoleAssistant)
	}
	if m.Role == gact.RoleTool {
		if label := standaloneToolHeaderLabel(m.Parts); label != "" {
			return lipgloss.NewStyle().
				Foreground(t.RoleTool).
				Bold(true).
				Render("● " + label)
		}
	}
	return t.renderRoleHeader(m.Role)
}

func standaloneToolHeaderLabel(parts []gact.Part) string {
	for _, part := range parts {
		if part.Type != gact.PartTypeToolResult {
			continue
		}
		name := strings.TrimSpace(part.ToolName)
		if name == "" {
			return "TOOL RESULT"
		}
		status := "RESULT"
		if part.IsError {
			status = "ERROR"
		}
		return "TOOL · " + capitalizeToolName(name) + " " + status
	}
	return ""
}

func partHiddenFromTranscript(p gact.Part) bool {
	return p.Metadata != nil && p.Metadata["transcript_hidden"] == true
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
	if partHiddenFromTranscript(p) {
		return ""
	}
	wrapW := width - 2
	if wrapW < 10 {
		wrapW = 10
	}
	switch p.Type {
	case gact.PartTypeText:
		text := p.Text
		if summary := summarizeEmbeddedWorkflowStateText(text); summary != "" && embeddedWorkflowStateDominates(text) {
			text = summary
		}
		return withStreamProvenanceNote(t, p, renderMarkdownOrWrap(text, t, wrapW))

	case gact.PartTypeThinking:
		if p.Metadata != nil && p.Metadata["semantic_react_step"] == true {
			return t.renderSemanticReactThought(p, wrapW)
		}
		label := "thinking"
		lines := strings.Count(strings.TrimSpace(p.Thinking), "\n") + 1
		if strings.TrimSpace(p.Thinking) == "" {
			lines = 0
		}
		if lines > 0 {
			label = fmt.Sprintf("thinking available · %d line%s", lines, pluralS(lines))
		}
		prefix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("⎿ " + label + " · ")
		keyStyle := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
		return prefix + keyStyle.Render("Ctrl+E")

	case gact.PartTypeRoutingDecision:
		if routingDecisionIsInternalCleanup(p) {
			return ""
		}
		// CLIO-BBBBBBBBBB4 (v0.2 §4.5): the tier-1 orchestrator's pick
		// for the current turn. Rendered as a compact badge + one-line
		// rationale — not a full block (the answer text is the real
		// content; this is metadata).
		//
		//   ▸ code_expert  ·  heuristic  ·  confidence 0.85
		//   rationale (dim)
		glyph := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("▸ ")
		parent := firstNonEmpty(
			stringValue(p.Metadata["parent_id"]),
			stringValue(p.Metadata["parent_agent"]),
			stringValue(p.Metadata["source_agent"]),
			"orchestrator",
		)
		headText := renderAgentName(t, firstNonEmpty(parent, "orchestrator")) + " selected " +
			renderAgentName(t, firstNonEmpty(p.SelectedAgent, "agent"))
		parts := []string{glyph + headText}
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
		failed := expertHandoffFailed(status, p.Metadata)
		routeColor := agentColor(t, agent)
		glyphText := "↳ "
		if failed {
			routeColor = t.Danger
			glyphText = "✗ "
		}
		depth := expertHandoffDepth(parent, agent, p.Metadata)
		prefix := strings.Repeat("  ", depth)
		wrapWForDepth := wrapW - lipgloss.Width(prefix)
		if wrapWForDepth < 20 {
			wrapWForDepth = 20
		}
		glyph := lipgloss.NewStyle().Foreground(routeColor).Bold(true).Render(glyphText)
		headText := renderAgentHandoffNarrative(t, parent, agent, stage, status, failed)
		if selected := stringValue(p.Metadata["selected_agent"]); !failed && strings.Contains(strings.ToLower(stage), "agent.invocation.completed") && selected != "" {
			headText = renderAgentName(t, agent) + " selected " + renderAgentName(t, selected)
		}
		head := prefix + glyph + headText
		var meta []string
		semanticEvent := p.Metadata != nil && p.Metadata["stream_source"] == "semantic_event"
		if failed {
			meta = append(meta, firstNonEmpty(status, "failed"))
		}
		if !semanticEvent {
			if stageLabel := expertHandoffStageLabel(stage); stageLabel != "" &&
				stageLabel != "delegating" && stageLabel != "returned" && stageLabel != "routed" {
				meta = append(meta, stageLabel)
			}
			if label := promotedEvidenceLabel(p); label != "" {
				meta = append(meta, label)
			}
		}
		if len(meta) > 0 {
			head += lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  ") +
				lipgloss.NewStyle().Foreground(t.FgMuted).Render(strings.Join(meta, " · "))
		}
		output := expertHandoffOutputSummary(p)
		if output == "" {
			return head
		}
		output = summarizeExpertHandoffOutput(output)
		renderedOutput := renderMarkdownOrWrap(output, t, wrapWForDepth-2)
		if looksLikeMarkdownBlock(output) {
			return lipgloss.JoinVertical(lipgloss.Left, head, indent(renderedOutput, prefix+"  "))
		}
		body := lipgloss.NewStyle().Foreground(t.Fg).
			Render(indent(renderedOutput, prefix+"  "))
		return lipgloss.JoinVertical(lipgloss.Left, head, body)

	case gact.PartTypeAgentQuestion:
		return t.renderAgentQuestionPart(p, wrapW)

	case gact.PartTypeRetryAttempt:
		return t.renderRetryAttemptPart(p, wrapW)

	case gact.PartTypeToolCall:
		// Claude-Code style: `ToolName(summary_of_input)` header with
		// the input inlined as a one-liner when it fits, "…" when it
		// overflows. Nothing indented beneath the header unless there
		// are structured args to highlight (we don't split those out
		// yet; tool_result carries the output and gets its own ⎿).
		workflowPrefix := toolPartWorkflowPrefix(p)
		toolWrapW := wrapW - lipgloss.Width(workflowPrefix)
		if toolWrapW < 20 {
			toolWrapW = 20
		}
		summary := toolCallSummary(p)
		toolName := toolDisplayName(p.ToolName)
		headText := toolName + "(" + summary + ")"
		if lipgloss.Width(headText) > toolWrapW {
			// Truncate the summary to fit. -3 for "…)" suffix.
			keep := toolWrapW - lipgloss.Width(toolName) - 3
			if keep < 4 {
				keep = 4
			}
			headText = toolName + "(" + truncateString(summary, keep) + "…)"
		}
		head := workflowPrefix + lipgloss.NewStyle().Foreground(t.RoleTool).Bold(true).
			Render(headText)
		if status := toolCallStatusLabel(p); status != "" {
			head += lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  ") +
				lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render(status)
		}
		return head

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
		workflowPrefix := toolPartWorkflowPrefix(p)
		toolWrapW := wrapW - lipgloss.Width(workflowPrefix)
		if toolWrapW < 20 {
			toolWrapW = 20
		}
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
		content := p.Content
		rawText := flattenToolResult(p)
		hasRawDetail := p.Metadata != nil && p.Metadata["raw_result"] != nil
		if !p.IsError {
			if summary := summarizeToolResultText(p.ToolName, rawText); summary != "" {
				if strings.TrimSpace(summary) != strings.TrimSpace(rawText) {
					hasRawDetail = true
				}
				content = []gact.Part{{
					Type: gact.PartTypeText,
					Text: summary,
				}}
			}
		}
		var text strings.Builder
		for i, c := range content {
			if i > 0 {
				text.WriteString("\n")
			}
			text.WriteString(t.renderPart(c, toolWrapW-2))
		}
		bodyStyle := lipgloss.NewStyle().Foreground(t.Fg)
		if p.IsError {
			bodyStyle = bodyStyle.Foreground(t.Danger)
		}

		raw := wrap(text.String(), toolWrapW-3)
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
		body := indentWithGlyph(rendered, workflowPrefix+glyphStyle.Render(glyph)+errTag, workflowPrefix+cont)
		if hidden > 0 {
			body = body + "\n" + workflowPrefix + cont + t.renderToolDetailHint(fmt.Sprintf("%d more lines", hidden))
		} else if hasRawDetail {
			body = body + "\n" + workflowPrefix + cont + t.renderToolDetailHint("raw")
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
				Render(" — apply · reject")
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
		head := lipgloss.NewStyle().Foreground(t.Danger).Bold(true).
			Render("✗ " + p.Code)
		if p.Message != "" {
			body := lipgloss.NewStyle().Foreground(t.Danger).
				Render(indent(wrap(shortenKnownPaths(p.Message), wrapW-2), "  "))
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

	case gact.PartTypeCompaction:
		head := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("⌘ compacted context summary")
		summary := strings.TrimSpace(p.Summary)
		if summary == "" {
			return head
		}
		raw := wrap(summary, wrapW-2)
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

	case partTypeRuntimeProvenance:
		head := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).
			Render("◇ runtime provenance")
		body := strings.TrimSpace(p.Text)
		if body == "" {
			body = "structured execution evidence"
		}
		rendered := lipgloss.NewStyle().Foreground(t.FgMuted).
			Render(indent(wrap(body, wrapW-2), "  "))
		prefix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("  [trace, tools, skills, delegation · ")
		keyStyle := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
		suffix := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("]")
		return lipgloss.JoinVertical(lipgloss.Left, head, rendered, prefix+keyStyle.Render("Ctrl+E")+suffix)

	default:
		// Unknown part type — preserve presence (per SPEC §8.3) so the user
		// sees something instead of silently swallowing it.
		return lipgloss.NewStyle().Foreground(t.FgMuted).
			Render("[" + p.Type + "]")
	}
}

func routingDecisionIsInternalCleanup(p gact.Part) bool {
	text := strings.ToLower(strings.Join(strings.Fields(firstNonEmpty(
		p.Rationale,
		stringValue(p.Metadata["route_reason"]),
		stringValue(p.Metadata["summary"]),
	)), " "))
	return strings.Contains(text, "removed retained evidence scaffolding") ||
		strings.Contains(text, "retained evidence scaffolding from final dynamic answer")
}

func (t Theme) renderAgentQuestionPart(p gact.Part, wrapW int) string {
	q := p.Question
	prompt := strings.TrimSpace(p.Text)
	if q != nil && strings.TrimSpace(q.Prompt) != "" {
		prompt = strings.TrimSpace(q.Prompt)
	}
	if prompt == "" {
		prompt = "Agent needs user input before continuing."
	}
	agent := ""
	category := ""
	expected := ""
	allowFreeform := false
	var choices []gact.AgentQuestionChoice
	if q != nil {
		agent = firstNonEmpty(q.AgentID, q.Source)
		category = q.Category
		expected = firstNonEmpty(q.ExpectedAnswerType, q.Kind)
		allowFreeform = q.AllowFreeform
		choices = q.Options
		if len(choices) == 0 {
			choices = q.Choices
		}
	}
	head := lipgloss.NewStyle().Foreground(t.Warning).Bold(true).Render("? agent question")
	meta := make([]string, 0, 3)
	if agent != "" {
		meta = append(meta, agent)
	}
	if category != "" {
		meta = append(meta, category)
	}
	if expected != "" {
		meta = append(meta, expected)
	}
	if q != nil && strings.TrimSpace(q.Status) != "" && q.Status != "pending" {
		meta = append(meta, q.Status)
	}
	if len(meta) > 0 {
		head += lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  ") +
			lipgloss.NewStyle().Foreground(t.FgMuted).Render(strings.Join(meta, " · "))
	}
	rows := []string{head, lipgloss.NewStyle().Foreground(t.Fg).Render(indent(wrap(prompt, wrapW-2), "  "))}
	if len(choices) > 0 {
		labels := make([]string, 0, len(choices))
		for _, choice := range choices {
			label := strings.TrimSpace(choice.Label)
			if label == "" {
				label = firstNonEmpty(choice.Value, choice.ID)
			}
			if label != "" {
				labels = append(labels, label)
			}
		}
		if len(labels) > 0 {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render("  choices: "+truncate(strings.Join(labels, ", "), wrapW-11)))
		}
	}
	if allowFreeform {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("  free-form answer allowed"))
	}
	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

func (t Theme) renderRetryAttemptPart(p gact.Part, wrapW int) string {
	attempt := p.RetryAttempt
	id := ""
	status := ""
	notes := strings.TrimSpace(p.Text)
	warning := ""
	model := ""
	if attempt != nil {
		id = attempt.ID
		status = attempt.Status
		if strings.TrimSpace(attempt.Notes) != "" {
			notes = strings.TrimSpace(attempt.Notes)
		}
		warning = strings.TrimSpace(attempt.Warning)
		if attempt.Model != nil {
			model = modelLabel(*attempt.Model)
		}
		if status == "" && attempt.AttemptMessageID != "" {
			status = "created"
		}
	}
	head := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("↻ retry attempt")
	meta := make([]string, 0, 3)
	if id != "" {
		meta = append(meta, shortID(id))
	}
	if status != "" {
		meta = append(meta, status)
	}
	if model != "" {
		meta = append(meta, model)
	}
	if len(meta) > 0 {
		head += lipgloss.NewStyle().Foreground(t.FgFaint).Render("  ·  ") +
			lipgloss.NewStyle().Foreground(t.FgMuted).Render(strings.Join(meta, " · "))
	}
	rows := []string{head}
	if notes != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(indent(wrap(notes, wrapW-2), "  ")))
	}
	if warning != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
			Render(indent(wrap(warning, wrapW-2), "  ")))
	}
	return lipgloss.JoinVertical(lipgloss.Left, rows...)
}

func modelLabel(m gact.ModelRef) string {
	if m.ProviderID != "" && m.ModelID != "" {
		return m.ProviderID + "/" + m.ModelID
	}
	if m.ModelID != "" {
		return m.ModelID
	}
	return m.ProviderID
}

func promotedEvidenceLabel(p gact.Part) string {
	if p.Metadata == nil {
		return ""
	}
	switch stringValue(p.Metadata["synthetic_from"]) {
	case "tools_called_metadata":
		return "trace metadata"
	case "expert_handoffs_metadata":
		return "handoff metadata"
	case "compact_summary_text":
		return "compact summary"
	default:
		return ""
	}
}

func toolCallWithResultStatusSuppressed(p gact.Part, inlineResults map[string]gact.Part) gact.Part {
	if p.Type != gact.PartTypeToolCall || p.CallID == "" || inlineResults == nil {
		return p
	}
	if _, ok := inlineResults[p.CallID]; !ok || p.Metadata == nil {
		return p
	}
	clone := p
	metadata := make(map[string]any, len(p.Metadata))
	for key, value := range p.Metadata {
		if key == "status" {
			continue
		}
		metadata[key] = value
	}
	clone.Metadata = metadata
	if len(clone.Metadata) == 0 {
		clone.Metadata = nil
	}
	return clone
}

func pairedToolResultsInParts(parts []gact.Part, inlineResults map[string]gact.Part) (map[string]gact.Part, map[int]bool) {
	paired := map[string]gact.Part{}
	for callID, result := range inlineResults {
		if callID != "" {
			paired[callID] = result
		}
	}
	callSeen := map[string]bool{}
	resultIndexes := map[int]bool{}
	for i, part := range parts {
		switch part.Type {
		case gact.PartTypeToolCall:
			if part.CallID != "" {
				callSeen[part.CallID] = true
			}
		case gact.PartTypeToolResult:
			if part.CallID != "" && callSeen[part.CallID] {
				if _, exists := paired[part.CallID]; !exists {
					paired[part.CallID] = part
				}
				resultIndexes[i] = true
			}
		}
	}
	if len(paired) == 0 {
		paired = nil
	}
	return paired, resultIndexes
}

func toolCallStatusLabel(p gact.Part) string {
	if p.Metadata == nil {
		return ""
	}
	status := strings.ToLower(strings.TrimSpace(stringValue(p.Metadata["status"])))
	switch status {
	case "running", "started", "pending":
		return "running now"
	default:
		return ""
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
		prefix, text := splitLeadingWhitespace(line)
		prefixW := lipgloss.Width(prefix)
		lineWidth := width
		if prefixW > 0 && prefixW < width {
			lineWidth = width - prefixW
		}
		// naive word-wrap
		words := strings.Fields(text)
		cur := ""
		for _, w := range words {
			if lipgloss.Width(w) > lineWidth {
				if cur != "" {
					out.WriteString(prefix + cur)
					out.WriteString("\n")
					cur = ""
				}
				chunks := hardWrapWord(w, lineWidth)
				for i, chunk := range chunks {
					if i == len(chunks)-1 {
						cur = chunk
					} else {
						out.WriteString(prefix + chunk)
						out.WriteString("\n")
					}
				}
				continue
			}
			if lipgloss.Width(cur)+lipgloss.Width(w)+1 > lineWidth {
				if cur != "" {
					out.WriteString(prefix + cur)
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
			out.WriteString(prefix + cur)
			out.WriteString("\n")
		}
	}
	return strings.TrimRight(out.String(), "\n")
}

func splitLeadingWhitespace(line string) (string, string) {
	idx := 0
	for idx < len(line) {
		switch line[idx] {
		case ' ', '\t':
			idx++
		default:
			return line[:idx], line[idx:]
		}
	}
	return line, ""
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
	if len(p.Input) == 0 {
		if p.Metadata != nil {
			preview := strings.TrimSpace(stringValue(p.Metadata["args_preview"]))
			if semanticPreviewIsInlineRedaction(preview) {
				return ""
			}
			return preview
		}
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
		if tool == "shell_bash" && primary != "" {
			primary = summarizeShellCommandIntent(primary)
		}
	case "read", "read_file", "cat":
		if v, ok := p.Input["path"].(string); ok {
			primary = shortenPathForInline(v)
		}
	case "write", "write_file", "edit", "edit_file":
		if v, ok := p.Input["path"].(string); ok {
			primary = shortenPathForInline(v)
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
	if primary == "" {
		primary = scientificToolCallSummary(tool, p.Input)
	}
	if primary != "" {
		return primary
	}
	return jsonOneLine(p.Input)
}

func summarizeShellCommandIntent(command string) string {
	command = strings.TrimSpace(command)
	if command == "" {
		return ""
	}
	lower := strings.ToLower(command)
	if dest := shellRedirectDestination(command); dest != "" {
		switch {
		case strings.Contains(lower, "cut "), strings.Contains(lower, "awk "), strings.Contains(lower, "sed "):
			return "prepare " + shortenPathForInline(dest)
		default:
			return "write " + shortenPathForInline(dest)
		}
	}
	fields := strings.Fields(command)
	if len(fields) == 0 {
		return "workspace command"
	}
	switch fields[0] {
	case "date":
		return "check date/time"
	case "pwd":
		return "check current folder"
	case "head", "tail", "cat":
		if path := lastShellPathToken(fields); path != "" {
			return "preview " + shortenPathForInline(path)
		}
	case "python", "python3":
		return "run Python analysis"
	case "Rscript":
		return "run R analysis"
	case "mkdir":
		return "create workspace folder"
	case "rm":
		return "remove workspace path"
	}
	return "workspace command"
}

func shellRedirectDestination(command string) string {
	idx := strings.LastIndex(command, ">")
	if idx < 0 || idx+1 >= len(command) {
		return ""
	}
	rest := strings.TrimSpace(command[idx+1:])
	rest = strings.TrimLeft(rest, "> ")
	fields := strings.Fields(rest)
	if len(fields) == 0 {
		return ""
	}
	return strings.Trim(fields[0], `"'`)
}

func lastShellPathToken(fields []string) string {
	for i := len(fields) - 1; i >= 0; i-- {
		token := strings.Trim(fields[i], `"'`)
		if strings.Contains(token, "/") || strings.Contains(token, ".") {
			return token
		}
	}
	return ""
}

func scientificToolCallSummary(tool string, input map[string]any) string {
	keys := []string{}
	switch {
	case strings.Contains(tool, "geo_geocode") || strings.Contains(tool, "geocode"):
		keys = []string{"query", "countrycodes", "limit"}
	case strings.Contains(tool, "filter_points") || strings.Contains(tool, "points_by_radius"):
		keys = []string{"center_lat", "center_lon", "radius_km", "id_column", "data_path", "lat_column", "lon_column"}
	case strings.HasPrefix(tool, "ndp_search"):
		keys = []string{"search_terms", "query", "limit", "server"}
	case strings.HasPrefix(tool, "ndp_list"):
		keys = []string{"name_filter", "server"}
	case strings.HasPrefix(tool, "ndp_get"):
		keys = []string{"dataset_identifier", "identifier_type", "server"}
	case strings.HasPrefix(tool, "ndp_stage"):
		keys = []string{"dataset_identifier", "resource_index", "server"}
	case strings.HasPrefix(tool, "ndp_query") || strings.Contains(tool, "arcgis"):
		keys = []string{"dataset_identifier", "query", "where", "server", "limit"}
	case strings.Contains(tool, "sac"):
		keys = []string{"location", "days_back", "start_time", "duration", "min_magnitude", "filepath", "path", "max_traces", "max_members"}
	case strings.Contains(tool, "parquet"):
		keys = []string{"filepath", "path", "file", "column", "columns"}
	case strings.Contains(tool, "csv"):
		keys = []string{"filepath", "path", "file", "limit", "columns"}
	case strings.Contains(tool, "hdf5") || strings.Contains(tool, "h5") ||
		strings.Contains(tool, "adios") || strings.Contains(tool, "bp5"):
		keys = []string{"filepath", "path", "file", "dataset", "variable"}
	case strings.Contains(tool, "plot") || strings.Contains(tool, "chart") ||
		strings.Contains(tool, "visual") || strings.Contains(tool, "dashboard"):
		keys = []string{"output_path", "artifact_path", "x_column", "y_column", "filepath", "path"}
	}
	if len(keys) == 0 {
		return ""
	}
	var bits []string
	for _, key := range keys {
		value, ok := input[key]
		if !ok || value == nil {
			continue
		}
		text := summarizeInputValue(value)
		if text == "" {
			continue
		}
		if key == "path" || key == "file" || key == "filepath" ||
			key == "output_path" || key == "artifact_path" {
			text = shortenPathForInline(text)
		}
		label, formatted := scientificToolCallArgLabelAndValue(key, text)
		bits = append(bits, label+": "+formatted)
		if len(bits) >= 4 {
			break
		}
	}
	return strings.Join(bits, " · ")
}

func scientificToolCallArgLabelAndValue(key, text string) (string, string) {
	switch key {
	case "days_back":
		return "window", "last " + text + " days"
	case "duration":
		return "duration", text + "s"
	case "min_magnitude":
		return "min magnitude", text
	case "max_traces":
		return "max traces", text
	case "max_members":
		return "max members", text
	case "output_path":
		return "artifact", text
	case "artifact_path":
		return "artifact", text
	case "start_time":
		return "start", text
	case "search_terms":
		return "search", text
	case "dataset_identifier":
		return "dataset", text
	case "resource_index":
		return "resource", text
	default:
		return strings.ReplaceAll(key, "_", " "), text
	}
}

func summarizeAssistantInlineText(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	if summary := summarizeEmbeddedWorkflowStateText(text); summary != "" && embeddedWorkflowStateDominates(text) {
		return summary
	}
	return shortenKnownPathsPreservingLines(text)
}

func shortenKnownPathsPreservingLines(text string) string {
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = shortenKnownPaths(line)
	}
	return strings.Join(lines, "\n")
}

func summarizeInputValue(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case []any:
		items := make([]string, 0, min(len(typed), 4))
		for _, item := range typed {
			text := strings.TrimSpace(fmt.Sprint(item))
			if text != "" {
				items = append(items, text)
			}
			if len(items) >= 4 {
				break
			}
		}
		if len(typed) > len(items) {
			items = append(items, fmt.Sprintf("... %d more", len(typed)-len(items)))
		}
		return strings.Join(items, ", ")
	default:
		return strings.TrimSpace(fmt.Sprint(value))
	}
}

func expertHandoffStageLabel(stage string) string {
	stage = strings.TrimSpace(stage)
	switch strings.ToLower(stage) {
	case "delegate.started", "delegation.started":
		return "delegating"
	case "delegate.completed", "delegation.completed":
		return "returned"
	case "parent.resumed", "parent_resumed":
		return "parent resumed"
	case "agent.invocation.started", "invocation.started":
		return "started"
	case "agent.invocation.completed", "invocation.completed":
		return "routed"
	case "agent.invocation.failed", "invocation.failed":
		return "failed"
	default:
		return stage
	}
}

func summarizeExpertHandoffOutput(output string) string {
	output = strings.TrimSpace(output)
	if output == "" {
		return ""
	}
	if containsFormattedWorkflowStateSummary(output) {
		return truncateMarkdownBlock(output, 1200, 18)
	}
	if stripped := stripEmbeddedWorkflowStateBlock(output); stripped != "" && stripped != output {
		output = stripped
	}
	compact := strings.TrimSpace(strings.Join(strings.Fields(output), " "))
	if summary := summarizeEmbeddedWorkflowStateText(compact); summary != "" {
		return summary
	}
	if summary := summarizeEmbeddedStructuredHandoffText(compact); summary != "" {
		return summary
	}
	if summary := summarizeStructuredHandoffOutput(compact); summary != "" {
		return summary
	}
	output = expandInlineMarkdownTables(output)
	if looksLikeMarkdownBlock(output) {
		return truncateMarkdownBlock(output, 1200, 18)
	}
	output = compact
	if (strings.Contains(output, "member=") || strings.Contains(output, ".SAC")) && strings.Contains(output, " - ") {
		output = strings.SplitN(output, " - ", 2)[0]
	}
	output = shortenKnownPaths(output)
	segments := splitSummarySegments(output)
	if len(segments) == 0 {
		return truncateString(output, 260)
	}
	limit := min(len(segments), 3)
	return truncateString(strings.Join(segments[:limit], "\n"), 320)
}

func embeddedWorkflowStateDominates(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	labels := []string{
		"CLIO typed workflow state:",
		"CLIO durable typed workflow state:",
		"Retained typed workflow state:",
		"workflow state:",
	}
	lower := strings.ToLower(text)
	for _, label := range labels {
		idx := strings.Index(lower, strings.ToLower(label))
		if idx < 0 {
			continue
		}
		before := strings.TrimSpace(text[:idx])
		return before == "" || len(before) < 240
	}
	return false
}

func expandInlineMarkdownTables(text string) string {
	text = strings.TrimSpace(text)
	if text == "" || strings.Contains(text, "\n|") || !strings.Contains(text, "|") {
		return text
	}
	if !strings.Contains(text, "|---") && !strings.Contains(text, "| ---") && !strings.Contains(text, "|------") {
		return text
	}
	fields := strings.Split(text, "|")
	if len(fields) < 8 {
		return text
	}
	separatorStart := -1
	for i := 1; i < len(fields); i++ {
		cell := strings.TrimSpace(fields[i])
		if cell == "" && i+1 < len(fields) && markdownSeparatorCell(fields[i+1]) {
			separatorStart = i + 1
			break
		}
		if markdownSeparatorCell(cell) {
			separatorStart = i
			break
		}
	}
	if separatorStart <= 1 {
		return text
	}
	headerEnd := separatorStart
	if headerEnd > 0 && strings.TrimSpace(fields[headerEnd-1]) == "" {
		headerEnd--
	}
	headerStart := headerEnd - 1
	for headerStart > 0 && strings.TrimSpace(fields[headerStart]) != "" {
		headerStart--
	}
	headerStart++
	if headerStart >= headerEnd {
		return text
	}
	columnCount := headerEnd - headerStart
	if columnCount < 2 {
		return text
	}
	prefix := strings.TrimSpace(strings.Join(fields[:headerStart], "|"))
	cells := make([]string, 0, len(fields)-headerStart)
	for _, raw := range fields[headerStart:headerEnd] {
		cell := strings.TrimSpace(raw)
		if cell == "" {
			continue
		}
		cells = append(cells, cell)
	}
	for _, raw := range fields[separatorStart:] {
		cell := strings.TrimSpace(raw)
		if cell == "" {
			continue
		}
		cells = append(cells, cell)
	}
	if len(cells) < 6 {
		return text
	}
	remainder := []string{}
	if len(cells)%columnCount != 0 {
		fullCells := (len(cells) / columnCount) * columnCount
		if fullCells < columnCount*3 {
			return text
		}
		remainder = cells[fullCells:]
		cells = cells[:fullCells]
	}
	if len(cells)%columnCount != 0 {
		return text
	}
	var rows []string
	var prefixParts []string
	if prefix != "" {
		prefixParts = append(prefixParts, prefix)
	}
	for i := 0; i+columnCount <= len(cells); i += columnCount {
		rows = append(rows, "| "+strings.Join(cells[i:i+columnCount], " | ")+" |")
	}
	if len(rows) < 2 {
		return text
	}
	if len(prefixParts) > 0 {
		out := strings.Join(prefixParts, "\n\n") + "\n\n" + strings.Join(rows, "\n")
		if len(remainder) > 0 {
			out += "\n\n" + strings.Join(remainder, " ")
		}
		return out
	}
	out := strings.Join(rows, "\n")
	if len(remainder) > 0 {
		out += "\n\n" + strings.Join(remainder, " ")
	}
	return out
}

func markdownSeparatorCell(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	text = strings.Trim(text, ":- ")
	return text == ""
}

func truncateMarkdownBlock(text string, maxChars, maxLines int) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	lines := strings.Split(text, "\n")
	truncated := false
	if maxLines > 0 && len(lines) > maxLines {
		lines = lines[:maxLines]
		truncated = true
	}
	out := strings.TrimSpace(strings.Join(lines, "\n"))
	if maxChars > 0 && len(out) > maxChars {
		out = strings.TrimSpace(truncateString(out, maxChars))
		truncated = true
	}
	if truncated {
		out += "\n\n_full summary available in detail_"
	}
	return out
}

func stripEmbeddedWorkflowStateBlock(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	cutAt := -1
	for _, marker := range []string{
		"CLIO durable typed workflow state:",
		"CLIO typed workflow state:",
		"Retained typed workflow state:",
	} {
		if idx := indexFold(text, marker); idx > 0 {
			if cutAt < 0 || idx < cutAt {
				cutAt = idx
			}
		}
	}
	if cutAt > 0 {
		return strings.TrimSpace(strings.TrimRight(text[:cutAt], " \n:.-"))
	}
	return text
}

func summarizeEmbeddedStructuredHandoffText(output string) string {
	output = strings.TrimSpace(strings.Join(strings.Fields(output), " "))
	start := strings.IndexByte(output, '{')
	if start < 0 {
		return ""
	}
	end := matchingJSONObjectEnd(output[start:])
	if end < 0 {
		return ""
	}
	var obj map[string]any
	if err := json.Unmarshal([]byte(output[start:start+end]), &obj); err != nil {
		return ""
	}
	summary := summarizeStructuredHandoffObject(obj)
	if summary == "" {
		return ""
	}
	prefix := strings.TrimSpace(output[:start])
	prefix = strings.TrimRight(prefix, ":. -")
	if handoffPrefixIsNoise(prefix) {
		return summary
	}
	if prefix == "" {
		return summary
	}
	return truncateString(prefix+" · "+summary, 320)
}

func handoffPrefixIsNoise(prefix string) bool {
	normalized := strings.ToLower(strings.TrimSpace(prefix))
	normalized = strings.Trim(normalized, ":. -")
	if normalized == "" {
		return true
	}
	noise := []string{
		"retained typed workflow state",
		"clio durable typed workflow state",
		"typed workflow state",
		"workflow state",
	}
	for _, item := range noise {
		if strings.Contains(normalized, item) {
			return true
		}
	}
	return false
}

func summarizeStructuredHandoffObject(obj map[string]any) string {
	if len(obj) == 0 {
		return ""
	}
	if summary := summarizeStructuredHandoffObjectStatus(obj); summary != "" {
		return summary
	}
	if state := mapValue(obj["workflow_state"]); len(state) > 0 {
		if summary := workflowStateBlockSummary(state); summary != "" {
			return summary
		}
	}
	if summary := summarizeRegionResolutionObject(obj); summary != "" {
		return summary
	}
	if summary := summarizeToolResult("", obj); summary != "" {
		return summary
	}
	return summarizeGenericStructuredObject(obj)
}

func summarizeStructuredHandoffObjectStatus(obj map[string]any) string {
	if summary := summarizeErrorResult(obj); summary != "" {
		return summary
	}
	rows := []string{}
	if code := firstStringValue(obj, "error", "code", "type"); code != "" {
		rows = append(rows, "status: "+code)
	}
	if message := firstStringValue(obj, "message", "summary"); message != "" {
		rows = append(rows, "message: "+shortenKnownPaths(message))
	}
	if details, ok := obj["details"].(map[string]any); ok {
		if stage := firstStringValue(details, "stage"); stage != "" {
			rows = append(rows, "stage: "+stage)
		}
		if stepLimit, ok := floatValue(details["step_limit"]); ok {
			rows = append(rows, fmt.Sprintf("step limit: %.0f", stepLimit))
		}
		if actions := summarizeNamedItems(details, "recovery_actions"); actions != "" {
			rows = append(rows, "recovery: "+actions)
		}
	}
	if len(rows) == 0 {
		return ""
	}
	return strings.Join(rows, "\n")
}

func summarizeRegionResolutionObject(obj map[string]any) string {
	label := firstNonEmpty(
		firstStringValue(obj, "REGION_LABEL", "region_label", "label", "location", "place"),
	)
	lat, hasLat := firstNumericValue(obj, "CENTER_LAT", "center_lat", "lat", "latitude")
	lon, hasLon := firstNumericValue(obj, "CENTER_LON", "center_lon", "lon", "longitude")
	radius, hasRadius := firstNumericValue(obj, "RADIUS_KM", "radius_km", "radius")
	confidence := firstStringValue(obj, "CONFIDENCE", "confidence")
	if label == "" && !hasLat && !hasLon && !hasRadius && confidence == "" {
		return ""
	}
	var parts []string
	if label != "" {
		parts = append(parts, "resolved region: "+label)
	} else {
		parts = append(parts, "resolved region")
	}
	if hasLat && hasLon {
		parts = append(parts, "center "+formatCompactFloat(lat)+", "+formatCompactFloat(lon))
	}
	if hasRadius {
		parts = append(parts, "radius "+formatCompactFloat(radius)+" km")
	}
	if confidence != "" {
		parts = append(parts, "confidence "+confidence)
	}
	return strings.Join(parts, " · ")
}

func firstNumericValue(result map[string]any, keys ...string) (float64, bool) {
	for _, key := range keys {
		if value, ok := floatValue(result[key]); ok {
			return value, true
		}
	}
	return 0, false
}

func summarizeGenericStructuredObject(obj map[string]any) string {
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var parts []string
	for _, key := range keys {
		label := strings.TrimSpace(key)
		if label == "" || genericStructuredKeyIsNoise(label) {
			continue
		}
		value := genericStructuredValueSummary(label, obj[key])
		if value == "" {
			continue
		}
		parts = append(parts, humanizeStructuredKey(label)+": "+value)
		if len(parts) >= 4 {
			break
		}
	}
	if len(parts) == 0 {
		return "structured evidence available"
	}
	return "structured evidence: " + strings.Join(parts, " · ")
}

func genericStructuredKeyIsNoise(key string) bool {
	lower := strings.ToLower(key)
	return lower == "_meta" ||
		strings.Contains(lower, "metadata_source_url") ||
		strings.Contains(lower, "source_url") ||
		strings.Contains(lower, "download") ||
		strings.Contains(lower, "raw")
}

func genericStructuredValueSummary(key string, raw any) string {
	switch value := raw.(type) {
	case nil:
		return ""
	case string:
		text := strings.TrimSpace(value)
		if text == "" {
			return ""
		}
		lower := strings.ToLower(key)
		if strings.Contains(lower, "path") || strings.Contains(lower, "file") {
			return shortenPathForInline(text)
		}
		return truncateString(shortenKnownPaths(text), 80)
	case bool:
		if value {
			return "yes"
		}
		return "no"
	case float64:
		return formatCompactFloat(value)
	case json.Number:
		return value.String()
	case []any:
		if len(value) == 0 {
			return ""
		}
		if items := summarizeAnyItems(value); items != "" {
			return truncateString(items, 80)
		}
	case map[string]any:
		if status := firstStringValue(value, "status", "state"); status != "" {
			return status
		}
		if summary := firstStringValue(value, "summary", "message", "description"); summary != "" {
			return truncateString(shortenKnownPaths(summary), 80)
		}
		if len(value) > 0 {
			return fmt.Sprintf("%d fields", len(value))
		}
	}
	return ""
}

func humanizeStructuredKey(key string) string {
	key = strings.TrimSpace(key)
	key = strings.ReplaceAll(key, "_", " ")
	key = strings.ReplaceAll(key, "-", " ")
	return strings.ToLower(key)
}

func expertHandoffOutputSummary(p gact.Part) string {
	if expertHandoffStarted(stringValue(p.Metadata["stage"]), stringValue(p.Metadata["status"])) {
		startOutputs := []string{
			summarizeExpertHandoffInput(stringValue(p.Metadata["input_summary"])),
			summarizeExpertHandoffInput(stringValue(p.Metadata["input"])),
		}
		return bestExpertHandoffSummary(startOutputs)
	}
	if local := summarizeExpertHandoffOutput(stringValue(p.Metadata["local_output_summary"])); local != "" &&
		!strings.Contains(strings.ToLower(local), "state:") {
		return attachWorkflowStateSummary(local, p)
	}
	outputs := []string{
		stringValue(p.Metadata["return_output_summary"]),
		stringValue(p.Metadata["result_summary"]),
		stringValue(p.Metadata["observation_summary"]),
		stringValue(p.Metadata["output_summary"]),
		stringValue(p.Metadata["summary"]),
		expertHandoffErrorSummary(p.Metadata["error"]),
		p.Text,
	}
	output := bestExpertHandoffSummary(outputs)
	return attachWorkflowStateSummary(output, p)
}

func summarizeExpertHandoffInput(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return ""
	}
	for _, marker := range []string{
		"Parent evidence available for this delegated task:",
		"CLIO typed workflow state:",
		"CLIO durable typed workflow state:",
		"Retained typed workflow state:",
	} {
		if idx := indexFold(input, marker); idx > 0 {
			input = strings.TrimSpace(input[:idx])
		}
	}
	return input
}

func expertHandoffStarted(stage string, status string) bool {
	stage = strings.ToLower(strings.TrimSpace(stage))
	status = strings.ToLower(strings.TrimSpace(status))
	return strings.Contains(stage, "started") || status == "running"
}

func attachWorkflowStateSummary(output string, p gact.Part) string {
	workflowSummary := strings.TrimSpace(stringValue(p.Metadata["workflow_summary"]))
	if workflowSummary == "" {
		workflowSummary = workflowStateSummary(mapValue(p.Metadata["workflow_state"]))
	}
	if workflowSummary == "" {
		return output
	}
	if output == "" {
		return workflowStateBlockFromSummary(workflowSummary)
	}
	if expertHandoffOutputIsRich(output) {
		return output
	}
	if strings.Contains(output, workflowSummary) {
		return output
	}
	if looksLikeMarkdownBlock(expandInlineMarkdownTables(output)) {
		return output + "\n\n" + workflowStateBlockFromSummary(workflowSummary)
	}
	if stateBlock := workflowStateBlockFromSummary(workflowSummary); stateBlock != "" {
		return output + "\n" + stateBlock
	}
	return output
}

func expertHandoffOutputIsRich(output string) bool {
	text := strings.TrimSpace(output)
	if text == "" {
		return false
	}
	lower := strings.ToLower(text)
	if strings.Contains(lower, "state:") || strings.Contains(lower, "workflow_state") {
		return false
	}
	if looksLikeMarkdownBlock(expandInlineMarkdownTables(text)) {
		return true
	}
	if strings.Count(text, "\n") >= 2 {
		return true
	}
	for _, token := range []string{
		"staged", "selected", "station", "artifact", "plot", "resource",
		"resolved", "profile", "coverage", "provenance", "trust", "limitation",
	} {
		if strings.Contains(lower, token) {
			return true
		}
	}
	return len(text) > 180
}

func formattedWorkflowStateSummary(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	lower := strings.ToLower(text)
	return lower == "state:" || strings.HasPrefix(lower, "state:\n")
}

func containsFormattedWorkflowStateSummary(text string) bool {
	text = strings.TrimSpace(text)
	if formattedWorkflowStateSummary(text) {
		return true
	}
	return strings.Contains(strings.ToLower(text), "\nstate:\n")
}

func bestExpertHandoffSummary(candidates []string) string {
	best := ""
	bestScore := 0
	haveBest := false
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		summary := summarizeExpertHandoffOutput(candidate)
		if summary == "" {
			continue
		}
		score := expertHandoffSummaryScore(candidate, summary)
		if !haveBest || score > bestScore {
			best = summary
			bestScore = score
			haveBest = true
		}
	}
	return best
}

func expertHandoffSummaryScore(raw string, summary string) int {
	rawLower := strings.ToLower(raw)
	lower := strings.ToLower(summary)
	score := 0
	if looksLikeMarkdownBlock(expandInlineMarkdownTables(summary)) {
		score += 6
	}
	for _, token := range []string{
		"artifact", "plot", "staged", "selected station", "candidate", "resolved region",
		"dataset", "resource", "blocker", "fallback", "rows", "columns", "confidence",
		"center", "radius", "station",
	} {
		if strings.Contains(lower, token) {
			score += 3
		}
	}
	if strings.Contains(lower, "state:") {
		score -= 3
	}
	if strings.Contains(rawLower, "workflow_state") {
		score -= 4
	}
	if strings.Contains(rawLower, "local_output_summary") {
		score -= 2
	}
	if len(summary) < 500 {
		score += 2
	}
	if len(summary) > 1200 {
		score -= 3
	}
	return score
}

func summarizeStructuredHandoffOutput(output string) string {
	if !strings.HasPrefix(output, "{") && !strings.HasPrefix(output, "[") {
		return ""
	}
	var payload any
	if err := json.Unmarshal([]byte(output), &payload); err != nil {
		return ""
	}
	obj, ok := payload.(map[string]any)
	if !ok {
		return ""
	}
	return summarizeStructuredHandoffObjectStatus(obj)
}

func splitSummarySegments(output string) []string {
	var segments []string
	for _, raw := range strings.Split(output, " - ") {
		text := strings.TrimSpace(raw)
		if text == "" {
			continue
		}
		if (strings.Contains(text, "member=") || strings.Contains(text, ".SAC")) && len(segments) > 0 {
			continue
		}
		if strings.Contains(text, ": ") && len(text) > 120 {
			parts := strings.Split(text, ". ")
			for _, part := range parts {
				part = strings.TrimSpace(part)
				if part != "" {
					segments = append(segments, part)
				}
				if len(segments) >= 3 {
					return segments
				}
			}
			continue
		}
		segments = append(segments, text)
		if len(segments) >= 3 {
			break
		}
	}
	return segments
}

func expertHandoffFailed(status string, metadata map[string]any) bool {
	status = strings.ToLower(strings.TrimSpace(status))
	if status == "failure" || status == "failed" || status == "error" {
		return true
	}
	return strings.TrimSpace(expertHandoffErrorSummary(metadata["error"])) != ""
}

func expertHandoffErrorSummary(raw any) string {
	switch errValue := raw.(type) {
	case nil:
		return ""
	case map[string]any:
		if summary := summarizeErrorResult(errValue); summary != "" {
			return summary
		}
		if nested, ok := errValue["error"].(map[string]any); ok {
			return summarizeErrorResult(map[string]any{"error": nested})
		}
		return compactJSON(errValue)
	case string:
		text := strings.TrimSpace(errValue)
		if text == "" {
			return ""
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(text), &payload); err == nil {
			if summary := summarizeErrorResult(payload); summary != "" {
				return summary
			}
		}
		return shortenKnownPaths(text)
	default:
		return shortenKnownPaths(fmt.Sprint(errValue))
	}
}

func shortenKnownPaths(text string) string {
	fields := strings.Fields(text)
	for i, field := range fields {
		trimmed := strings.Trim(field, ".,;:)]}")
		if strings.Contains(trimmed, "/") && len(trimmed) > 60 {
			fields[i] = strings.Replace(field, trimmed, shortenPathForInline(trimmed), 1)
		}
	}
	return strings.Join(fields, " ")
}

func shortenPathForInline(path string) string {
	path = strings.TrimSpace(path)
	if path == "" || len(path) <= 54 || !strings.Contains(path, "/") {
		return path
	}
	parts := strings.Split(path, "/")
	if len(parts) <= 2 {
		return path
	}
	tail := parts[len(parts)-1]
	parent := parts[len(parts)-2]
	if parent == "" {
		return "..." + "/" + tail
	}
	return ".../" + parent + "/" + tail
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

func toolDisplayName(name string) string {
	tool := strings.ToLower(strings.TrimSpace(name))
	switch {
	case strings.Contains(tool, "geo_geocode") || strings.Contains(tool, "geocode"):
		return "Geocode location"
	case strings.Contains(tool, "filter_points") || strings.Contains(tool, "points_by_radius"):
		return "Filter points by radius"
	case tool == "shell_bash":
		return "Shell command"
	case strings.HasPrefix(tool, "sac_discover_earthscope"):
		return "EarthScope waveform discovery"
	case strings.Contains(tool, "sac_compute") && strings.Contains(tool, "stat"):
		return "SAC trace statistics"
	case strings.Contains(tool, "sac_plot") || strings.Contains(tool, "plot_sac"):
		return "SAC waveform visualization"
	case strings.Contains(tool, "sac_inspect"):
		return "SAC trace inspection"
	case tool == "plot_plot_timeseries" || strings.Contains(tool, "plot_timeseries"):
		return "Plot timeseries"
	case strings.HasPrefix(tool, "ndp_search"):
		return "NDP catalog search"
	case strings.HasPrefix(tool, "ndp_stage"):
		return "NDP resource staging"
	case strings.HasPrefix(tool, "ndp_get"):
		return "NDP dataset lookup"
	case strings.HasPrefix(tool, "ndp_query") || strings.Contains(tool, "arcgis"):
		return "NDP feature query"
	case strings.Contains(tool, "parquet"):
		return "Parquet data analysis"
	case strings.Contains(tool, "hdf5") || strings.Contains(tool, "h5"):
		return "HDF5 data analysis"
	case strings.Contains(tool, "adios") || strings.Contains(tool, "bp5") || strings.Contains(tool, "bp4"):
		return "ADIOS data analysis"
	case strings.Contains(tool, "csv"):
		return "CSV data analysis"
	}
	return capitalizeToolName(name)
}

// toolResultPreviewLines is the inline preview budget for tool_result
// bodies. Anything longer collapses to this many lines + a "[N more]"
// footer. 8 lines hits the typical "`tail -N` output fits on one
// screen" sweet spot without drowning the conversation pane.
const toolResultPreviewLines = 8

// compactionPreviewLines keeps synthetic memory summaries visible without
// letting them dominate the transcript. The full summary remains reachable
// through the selected part detail view.
const compactionPreviewLines = 6

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
