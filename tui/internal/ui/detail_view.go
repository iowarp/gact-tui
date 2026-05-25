package ui

import (
	"encoding/json"
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// bulkyPartRef identifies a tool_result we want to show in full
// inside the floating detail view. Captured at expand time so the
// modal has its own copy of the text (cheap — the alternative is
// re-walking a.messages every render).
type bulkyPartRef struct {
	messageID string
	partID    string
	title     string // rendered header ("ReadFile(main.go) → output")
	fullText  string
}

type detailField struct {
	label string
	value string
}

func appendDetailSection(rows []string, title string, fields ...detailField) []string {
	if len(rows) > 0 {
		rows = append(rows, "")
	}
	rows = append(rows, title)
	for _, field := range fields {
		value := strings.TrimSpace(field.value)
		if value == "" {
			continue
		}
		if strings.TrimSpace(field.label) == "" {
			rows = append(rows, detailBodyRows(value)...)
			continue
		}
		rows = append(rows, detailFieldRows(field.label, value)...)
	}
	return rows
}

func detailFieldRows(label string, value string) []string {
	label = strings.TrimSpace(label)
	if !strings.Contains(value, "\n") {
		return []string{"  " + label + ": " + value}
	}
	rows := []string{"  " + label + ":"}
	rows = append(rows, detailBodyRows(value)...)
	return rows
}

func detailBodyRows(value string) []string {
	lines := strings.Split(strings.TrimSpace(value), "\n")
	rows := make([]string, 0, len(lines))
	for _, line := range lines {
		rows = append(rows, "    "+line)
	}
	return rows
}

// openDetailForSelection opens the floating detail view on the
// body cursor's bulky part, falling back to the latest bulky in
// the whole conversation (Z1 + L3 behaviour). Shared by Ctrl+E
// and ZZZZZZZZ1 body-Enter so both paths stay in lockstep.
//
// TTTTTTTTT1: when bodySelPartIdx points at a specific addressable
// part, target THAT part directly — so if the assistant read two
// large files in one turn, the user can expand either one
// individually. The old findBulkyPartIn fallback (first bulky in
// the selected message) still covers the unset-partIdx case.
func (a *App) openDetailForSelection() {
	var (
		ref bulkyPartRef
		ok  bool
	)
	if a.bodySelMsgIdx >= 0 && a.bodySelMsgIdx < len(a.messages) {
		m := a.messages[a.bodySelMsgIdx]
		if a.bodySelPartIdx >= 0 {
			ref, ok = findBulkyPartForSelected(m, a.bodySelPartIdx, a.messages, a.bodySelMsgIdx)
		}
		if !ok {
			ref, ok = findBulkyPartIn(m)
		}
	}
	if !ok {
		ref, ok = findLatestBulkyPart(a.messages)
	}
	if !ok {
		a.transientHint = "nothing to expand — no bulky outputs in selection"
		return
	}
	a.detailView = &ref
	a.detailViewOpen = true
	a.detailScroll = 0
}

// handleDetailViewKey drives the expand-detail modal. Esc/Ctrl+E
// close; ↑/↓ · j/k · PgUp/PgDn scroll through long content; g/G
// jump to top/bottom.
func (a *App) handleDetailViewKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch k.String() {
	case "esc", "ctrl+c", "ctrl+e":
		a.detailViewOpen = false
		a.detailView = nil
		a.detailScroll = 0
		return a, nil
	case "up", "k":
		if a.detailScroll > 0 {
			a.detailScroll--
		}
	case "down", "j":
		a.detailScroll++
	case "g", "home":
		a.detailScroll = 0
	case "G", "end":
		a.detailScroll = 1 << 20 // clamped by the render
	case "pgup", "ctrl+u":
		a.detailScroll -= a.detailPageSize()
		if a.detailScroll < 0 {
			a.detailScroll = 0
		}
	case "pgdown", "ctrl+d":
		a.detailScroll += a.detailPageSize()
	}
	return a, nil
}

// detailPageSize estimates how many lines fit in the detail pane at
// the current terminal height. YYYYYYYYY1: previous math only
// subtracted 6 rows for chrome, which ignored the Padding(1,2) that
// adds 2 rows and the implicit screen margin we want around the
// modal so it doesn't visually abut the footer. Full accounting:
//
//	2  border (top + bottom)
//	2  padding (top + bottom, from Padding(1,2))
//	1  title
//	1  blank between title and body
//	1  blank between body and hint
//	1  hint
//	4  outer screen margin (2 top, 2 bottom)
//
// = 12 rows reserved. Prevents the tall-file overflow the user
// reported ("the window can overflow").
func (a *App) detailPageSize() int {
	n := a.height - 12
	if n < 1 {
		n = 1
	}
	return n
}

// TTTTTTTTT1: findBulkyPartForSelected builds a bulkyPartRef for the
// specific addressable part the body cursor points at. Handles three
// cases:
//
//   - the selected part is a tool_call: drill forward through sibling
//     tool messages (pairToolResults-style) to find the matching
//     tool_result. Expands the *output*, not the call header — that's
//     what the user wants to see when there are two bulky reads.
//   - the selected part is a tool_result / text / file_diff: expand
//     it directly (same flattenToolResult for tool_result).
//   - the selected part is below the bulky threshold: return !ok so
//     the caller can decide to toast or fall through.
//
// Input:
//
//	m       — the currently selected message
//	addrIdx — bodySelPartIdx (index into addressablePartsOf(m))
//	allMsgs — full messages slice, needed to walk forward into
//	          sibling tool messages for tool_call pairing
//	msgIdx  — m's position in allMsgs
func findBulkyPartForSelected(m gact.Message, addrIdx int, allMsgs []gact.Message, msgIdx int) (bulkyPartRef, bool) {
	addr := addressablePartsOf(m)
	if addrIdx < 0 || addrIdx >= len(addr) {
		return bulkyPartRef{}, false
	}
	partIdx := addr[addrIdx]
	if partIdx < 0 || partIdx >= len(m.Parts) {
		return bulkyPartRef{}, false
	}
	p := m.Parts[partIdx]

	switch p.Type {
	case gact.PartTypeToolCall:
		// Find the matching tool_result in the same message or the
		// following sibling tool messages. Mirrors pairToolResults.
		callRef := toolCallDetailRef(m.ID, p)
		if p.CallID == "" {
			return callRef, true
		}
		// Same-message scan.
		for _, sib := range m.Parts {
			if sib.Type == gact.PartTypeToolResult && sib.CallID == p.CallID {
				text := flattenToolResult(sib)
				if lineCount(text) <= toolResultPreviewLines {
					return callRef, true
				}
				return bulkyPartRef{
					messageID: m.ID,
					partID:    sib.ID,
					title:     fmt.Sprintf("%s · %d lines", p.ToolName, lineCount(text)),
					fullText:  text,
				}, true
			}
		}
		// Walk forward through sibling tool messages.
		for j := msgIdx + 1; j < len(allMsgs); j++ {
			tm := allMsgs[j]
			if tm.Role != gact.RoleTool {
				break
			}
			for _, rp := range tm.Parts {
				if rp.Type == gact.PartTypeToolResult && rp.CallID == p.CallID {
					text := flattenToolResult(rp)
					if lineCount(text) <= toolResultPreviewLines {
						return callRef, true
					}
					return bulkyPartRef{
						messageID: tm.ID,
						partID:    rp.ID,
						title:     fmt.Sprintf("%s · %d lines", p.ToolName, lineCount(text)),
						fullText:  text,
					}, true
				}
			}
		}
		return callRef, true

	case gact.PartTypeToolResult:
		text := flattenToolResult(p)
		if lineCount(text) <= toolResultPreviewLines {
			return partDetailRef(m.ID, p), true
		}
		return bulkyPartRef{
			messageID: m.ID,
			partID:    p.ID,
			title:     fmt.Sprintf("tool_result · %d lines", lineCount(text)),
			fullText:  text,
		}, true

	case gact.PartTypeText:
		if lineCount(p.Text) <= toolResultPreviewLines {
			return partDetailRef(m.ID, p), true
		}
		return bulkyPartRef{
			messageID: m.ID,
			partID:    p.ID,
			title:     fmt.Sprintf("%s text · %d lines", strings.ToLower(m.Role), lineCount(p.Text)),
			fullText:  p.Text,
		}, true

	case gact.PartTypeFileDiff:
		// For diffs, "expanding" shows the concatenated before+after
		// so the modal can scroll both sides. Keep the title helpful
		// by naming the path.
		before, after := "", ""
		if p.Before != nil {
			before = *p.Before
		}
		if p.After != nil {
			after = *p.After
		}
		body := "--- before ---\n" + before + "\n\n+++ after +++\n" + after
		return bulkyPartRef{
			messageID: m.ID,
			partID:    p.ID,
			title:     fmt.Sprintf("file_diff · %s", p.Path),
			fullText:  body,
		}, true

	case gact.PartTypeRoutingDecision, gact.PartTypeThinking,
		gact.PartTypeExpertHandoff,
		gact.PartTypeSubagentCall, gact.PartTypeSubagentResult,
		gact.PartTypeError, gact.PartTypeCompaction,
		gact.PartTypeResource, gact.PartTypeResourceLink,
		gact.PartTypeImage, gact.PartTypeDocument, gact.PartTypeCitation:
		return partDetailRef(m.ID, p), true
	}
	if p.Type != "" {
		return partDetailRef(m.ID, p), true
	}
	return bulkyPartRef{}, false
}

func toolCallDetailRef(messageID string, p gact.Part) bulkyPartRef {
	return bulkyPartRef{
		messageID: messageID,
		partID:    p.ID,
		title:     fmt.Sprintf("%s input", p.ToolName),
		fullText:  toolCallDetailText(p),
	}
}

func toolCallDetailText(p gact.Part) string {
	rows := []string{fmt.Sprintf("tool: %s", p.ToolName)}
	if p.CallID != "" {
		rows = append(rows, fmt.Sprintf("call_id: %s", p.CallID))
	}
	if len(p.Input) > 0 {
		if payload, err := json.MarshalIndent(p.Input, "", "  "); err == nil {
			rows = append(rows, "", "input:", string(payload))
		} else {
			rows = append(rows, "", "input:", fmt.Sprint(p.Input))
		}
	}
	if len(p.Metadata) > 0 {
		if payload, err := json.MarshalIndent(p.Metadata, "", "  "); err == nil {
			rows = append(rows, "", "metadata:", string(payload))
		}
	}
	return strings.Join(rows, "\n")
}

func partDetailRef(messageID string, p gact.Part) bulkyPartRef {
	title := p.Type
	switch p.Type {
	case gact.PartTypeRoutingDecision:
		title = "routing decision"
	case gact.PartTypeExpertHandoff:
		title = "expert handoff"
	case gact.PartTypeToolResult:
		title = "tool result"
		if p.ToolName != "" {
			title = p.ToolName + " result"
		}
	case gact.PartTypeText:
		title = "message text"
	case gact.PartTypeThinking:
		title = "thinking"
	case gact.PartTypeSubagentCall:
		title = "subagent call"
	case gact.PartTypeSubagentResult:
		title = "subagent result"
	case gact.PartTypeError:
		title = "error"
	case "":
		title = "message part"
	}
	return bulkyPartRef{
		messageID: messageID,
		partID:    p.ID,
		title:     title,
		fullText:  partDetailText(p),
	}
}

func partDetailText(p gact.Part) string {
	rows := []string{fmt.Sprintf("type: %s", orPlaceholder(p.Type, "unknown"))}
	if p.ID != "" {
		rows = append(rows, fmt.Sprintf("part_id: %s", p.ID))
	}
	if p.CallID != "" {
		rows = append(rows, fmt.Sprintf("call_id: %s", p.CallID))
	}
	if provenance := promotedEvidenceLabel(p); provenance != "" {
		rows = append(rows, fmt.Sprintf("provenance: %s", provenance))
	}

	switch p.Type {
	case gact.PartTypeRoutingDecision:
		rows = append(rows,
			fmt.Sprintf("selected_agent: %s", orPlaceholder(p.SelectedAgent, "unknown")),
			fmt.Sprintf("route_source: %s", routeSourceLabel(p)),
		)
		if p.Confidence > 0 {
			rows = append(rows, fmt.Sprintf("confidence: %.2f", p.Confidence))
		}
		if p.Rationale != "" {
			rows = append(rows, "", "rationale:", p.Rationale)
		}
	case gact.PartTypeExpertHandoff:
		route := firstNonEmpty(
			stringValue(p.Metadata["agent_id"]),
			stringValue(p.Metadata["expert"]),
			"expert",
		)
		if parent := firstNonEmpty(stringValue(p.Metadata["parent_id"]), stringValue(p.Metadata["parent"])); parent != "" {
			route = parent + " -> " + route
		}
		rows = append(rows,
			fmt.Sprintf("route: %s", route),
			fmt.Sprintf("status: %s", orPlaceholder(stringValue(p.Metadata["status"]), "observed")),
		)
		if stage := firstNonEmpty(stringValue(p.Metadata["stage"]), stringValue(p.Metadata["dispatch_target"])); stage != "" {
			rows = append(rows, fmt.Sprintf("stage: %s", stage))
		}
		if duration, ok := floatValue(p.Metadata["duration_ms"]); ok && duration > 0 {
			rows = append(rows, fmt.Sprintf("duration_ms: %.0f", duration))
		}
		if input := strings.TrimSpace(stringValue(p.Metadata["input_summary"])); input != "" {
			rows = append(rows, "", "input:", input)
		}
		output := firstNonEmpty(
			stringValue(p.Metadata["output_summary"]),
			stringValue(p.Metadata["summary"]),
			p.Text,
		)
		if output != "" {
			rows = append(rows, "", "output:", output)
		}
		rows = append(rows, "", "inline_preview:", orPlaceholder(summarizeExpertHandoffOutput(output), "none"))
		for _, key := range []string{
			"agent_id",
			"parent_id",
			"dispatch_target",
		} {
			if value, ok := p.Metadata[key]; ok && value != nil {
				rows = append(rows, fmt.Sprintf("%s: %v", key, value))
			}
		}
	case gact.PartTypeToolResult:
		if p.ToolName != "" {
			rows = append(rows, fmt.Sprintf("tool: %s", p.ToolName))
		}
		rows = append(rows,
			fmt.Sprintf("is_error: %v", p.IsError),
			fmt.Sprintf("cached: %v", p.Cached),
		)
		if p.DurationMS > 0 {
			rows = append(rows, fmt.Sprintf("duration_ms: %.0f", p.DurationMS))
		}
		text := flattenToolResult(p)
		if text != "" {
			rows = append(rows, "", "content:", text)
		}
		if raw := p.Metadata["raw_result"]; raw != nil {
			rows = appendAnyJSONSection(rows, "raw_result", raw)
		}
	case gact.PartTypeText:
		if p.Text != "" {
			rows = append(rows, "", "text:", p.Text)
		}
	case gact.PartTypeThinking:
		if p.Thinking != "" {
			rows = append(rows, "", "thinking:", p.Thinking)
		}
		if p.Signature != "" {
			rows = append(rows, "", "signature:", p.Signature)
		}
	case gact.PartTypeSubagentCall:
		rows = append(rows,
			fmt.Sprintf("agent_id: %s", orPlaceholder(p.AgentID, "unknown")),
			fmt.Sprintf("subsession_id: %s", orPlaceholder(p.SubsessionID, "none")),
		)
		if p.Prompt != "" {
			rows = append(rows, "", "prompt:", p.Prompt)
		}
		rows = appendJSONSection(rows, "params", p.Params)
	case gact.PartTypeSubagentResult:
		rows = append(rows,
			fmt.Sprintf("subsession_id: %s", orPlaceholder(p.SubsessionID, "none")),
			fmt.Sprintf("final_message_id: %s", orPlaceholder(p.FinalMessageID, "none")),
		)
		if p.Summary != "" {
			rows = append(rows, "", "summary:", p.Summary)
		}
	case gact.PartTypeError:
		rows = append(rows,
			fmt.Sprintf("code: %s", orPlaceholder(p.Code, "unknown")),
			fmt.Sprintf("recoverable: %v", p.Recoverable),
		)
		if p.Message != "" {
			rows = append(rows, "", "message:", p.Message)
		}
	case gact.PartTypeCompaction:
		rows = append(rows, fmt.Sprintf("auto: %v", p.Auto))
		if p.Summary != "" {
			rows = append(rows, "", "summary:", p.Summary)
		}
		if len(p.CompactedMessageIDs) > 0 {
			rows = append(rows, "", "compacted_message_ids:", strings.Join(p.CompactedMessageIDs, "\n"))
		}
	case gact.PartTypeResourceLink, gact.PartTypeResource:
		rows = append(rows,
			fmt.Sprintf("uri: %s", orPlaceholder(p.URI, "none")),
			fmt.Sprintf("mime_type: %s", orPlaceholder(p.MimeType, "unknown")),
		)
		if p.Name != "" {
			rows = append(rows, fmt.Sprintf("name: %s", p.Name))
		}
		if p.Description != "" {
			rows = append(rows, "", "description:", p.Description)
		}
	case gact.PartTypeImage, gact.PartTypeDocument, gact.PartTypeCitation:
		if p.Title != "" {
			rows = append(rows, fmt.Sprintf("title: %s", p.Title))
		}
		if p.Context != "" {
			rows = append(rows, "", "context:", p.Context)
		}
		if p.Text != "" {
			rows = append(rows, "", "text:", p.Text)
		}
		rows = appendAnyJSONSection(rows, "source", p.Source)
		rows = appendAnyJSONSection(rows, "citations", p.Citations)
	default:
		if p.Text != "" {
			rows = append(rows, "", "text:", p.Text)
		}
		if p.Summary != "" {
			rows = append(rows, "", "summary:", p.Summary)
		}
	}

	rows = appendJSONSection(rows, "metadata", detailMetadataRemainder(p))
	return strings.Join(rows, "\n")
}

func detailMetadataRemainder(p gact.Part) map[string]any {
	if len(p.Metadata) == 0 {
		return nil
	}
	used := map[string]bool{}
	used["partial_after_error"] = true
	if promotedEvidenceLabel(p) != "" {
		used["synthetic_from"] = true
	}
	switch p.Type {
	case gact.PartTypeToolResult:
		used["raw_result"] = true
	case gact.PartTypeExpertHandoff:
		for _, key := range []string{
			"agent_id",
			"parent_id",
			"parent",
			"expert",
			"status",
			"stage",
			"dispatch_target",
			"duration_ms",
			"input_summary",
			"output_summary",
			"summary",
		} {
			used[key] = true
		}
	case gact.PartTypeCompaction:
		used["synthetic_from"] = true
		used["synthetic"] = true
	}
	remaining := map[string]any{}
	for key, value := range p.Metadata {
		if used[key] || value == nil {
			continue
		}
		remaining[key] = value
	}
	if len(remaining) == 0 {
		return nil
	}
	return remaining
}

func routeSourceLabel(p gact.Part) string {
	if p.Heuristic {
		return "heuristic"
	}
	if source, ok := p.Metadata["route_source"].(string); ok && source != "" {
		return source
	}
	return "LM-routed"
}

func appendJSONSection(rows []string, label string, payload map[string]any) []string {
	if len(payload) == 0 {
		return rows
	}
	if body, err := json.MarshalIndent(payload, "", "  "); err == nil {
		return append(rows, "", label+":", string(body))
	}
	return append(rows, "", label+":", fmt.Sprint(payload))
}

func appendAnyJSONSection(rows []string, label string, payload any) []string {
	if payload == nil {
		return rows
	}
	if body, err := json.MarshalIndent(payload, "", "  "); err == nil {
		return append(rows, "", label+":", string(body))
	}
	return append(rows, "", label+":", fmt.Sprint(payload))
}

// findBulkyPartIn scans a single message for a bulky tool_result or
// text part (same threshold as findLatestBulkyPart). Used by the
// Z1 Ctrl+E routing when a body cursor is set — the user wants to
// expand "this one", not "the newest bulky anywhere".
func findBulkyPartIn(m gact.Message) (bulkyPartRef, bool) {
	for _, p := range m.Parts {
		switch p.Type {
		case gact.PartTypeToolResult:
			text := flattenToolResult(p)
			if lineCount(text) <= toolResultPreviewLines {
				continue
			}
			return bulkyPartRef{
				messageID: m.ID,
				partID:    p.ID,
				title:     fmt.Sprintf("tool_result · %d lines", lineCount(text)),
				fullText:  text,
			}, true
		case gact.PartTypeText:
			if lineCount(p.Text) <= toolResultPreviewLines {
				continue
			}
			return bulkyPartRef{
				messageID: m.ID,
				partID:    p.ID,
				title:     fmt.Sprintf("%s text · %d lines", strings.ToLower(m.Role), lineCount(p.Text)),
				fullText:  p.Text,
			}, true
		}
	}
	return bulkyPartRef{}, false
}

// findLatestBulkyPart walks a.messages in reverse order and returns
// a bulkyPartRef for the newest tool_result OR text part whose body
// exceeds the inline preview budget. Used by Ctrl+E to decide what
// to expand; picking "the most recent bulky one" is the same cheap
// heuristic K10's clipboard copy uses, and matches the user's
// mental model that Ctrl+E expands "what I just saw previewed".
//
// S2 extension: long assistant text (e.g. the ~60-line "long
// explain" scenario) now qualifies as bulky too so users can open
// it in the paginated detail view instead of scrolling.
//
// Returns (nil, false) when there's no bulky part to expand; the
// caller surfaces a "nothing to expand" toast in that case.
func findLatestBulkyPart(msgs []gact.Message) (bulkyPartRef, bool) {
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		for _, p := range m.Parts {
			switch p.Type {
			case gact.PartTypeToolResult:
				text := flattenToolResult(p)
				if lineCount(text) <= toolResultPreviewLines {
					continue
				}
				return bulkyPartRef{
					messageID: m.ID,
					partID:    p.ID,
					title:     fmt.Sprintf("tool_result · %d lines", lineCount(text)),
					fullText:  text,
				}, true
			case gact.PartTypeText:
				if lineCount(p.Text) <= toolResultPreviewLines {
					continue
				}
				return bulkyPartRef{
					messageID: m.ID,
					partID:    p.ID,
					title:     fmt.Sprintf("%s text · %d lines", strings.ToLower(m.Role), lineCount(p.Text)),
					fullText:  p.Text,
				}, true
			}
		}
	}
	return bulkyPartRef{}, false
}

// flattenToolResult returns the concatenated text content of a
// tool_result part's sub-parts. Joins with blank lines between
// sibling text parts (matching how the inline render lays them out).
func flattenToolResult(p gact.Part) string {
	var b strings.Builder
	for i, c := range p.Content {
		if i > 0 {
			b.WriteString("\n")
		}
		if c.Type == gact.PartTypeText {
			b.WriteString(c.Text)
		}
	}
	return b.String()
}

// viewDetailView renders the floating detail modal. Mirrors the
// other modals' chrome (L2) so width and borders stay consistent.
func (a *App) viewDetailView() string {
	if a.detailView == nil {
		return ""
	}
	t := a.Theme
	// YYYYYYYYY1: use the wider detail-specific width so file content
	// (the main payload of this modal) doesn't wrap at 72 cols.
	w := a.detailModalWidth()
	// Inner width: pane width - 2 padding - 2 border.
	innerW := w - 4
	if innerW < 10 {
		innerW = 10
	}

	ref := a.detailView
	// Wrap the full text at the inner width so long log lines don't
	// overflow the modal box.
	wrapped := wrap(ref.fullText, innerW)
	lines := strings.Split(wrapped, "\n")
	budget := a.detailPageSize()
	win := boundedScrollWindow(len(lines), budget, a.detailScroll)
	a.detailScroll = win.scroll
	visible := strings.Join(lines[win.start:win.end], "\n")

	scrollHint := ""
	if len(lines) > budget {
		scrollHint = fmt.Sprintf("  (line %d–%d of %d)",
			win.start+1, win.end, win.total)
	}

	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render(ref.title) +
		lipgloss.NewStyle().Foreground(t.FgMuted).Render(scrollHint)

	hint := t.HintLabel.Render(
		"↑/↓ scroll  PgUp/PgDn page  g/G top/bottom  Esc / Ctrl+E close")

	body := lipgloss.NewStyle().Foreground(t.Fg).Render(visible)

	box := lipgloss.JoinVertical(lipgloss.Left, title, "", body, "", hint)
	return a.renderDefaultModalSurface(w, box)
}
