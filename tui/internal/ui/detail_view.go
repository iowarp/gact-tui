package ui

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	tea "charm.land/bubbletea/v2"

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
	localPath string
	fileModes []fileDetailMode
	fileMode  string
}

type fileDetailMode struct {
	id    string
	label string
	text  string
}

type localFileExternalOpenMsg struct {
	path string
	err  error
}

type detailField struct {
	label string
	value string
}

type scrollableDetailOptions struct {
	width      int
	title      string
	content    string
	scroll     int
	page       int
	tabs       []menuTab
	hint       string
	closeID    string
	closeLabel string
	close      func(*App)
}

type scrollableDetailRender struct {
	modal  string
	scroll int
	window scrollWindow
}

type detailWrapCache struct {
	content string
	width   int
	wrapped string
}

func (a *App) closeDetailView() {
	a.detailViewOpen = false
	a.detailView = nil
	a.detailScroll = 0
	a.detailWrap = detailWrapCache{}
}

func (a *App) copyDetailViewToClipboard() tea.Cmd {
	if a.detailView == nil {
		a.transientHint = "nothing to copy"
		return nil
	}
	a.transientHint = copyTextToClipboard("detail", a.detailView.fullText)
	return nil
}

func (a *App) openDetailFileExternally() tea.Cmd {
	if a.detailView == nil || strings.TrimSpace(a.detailView.localPath) == "" {
		a.transientHint = "no local file to open"
		return scheduleHintExpire(a.transientHint)
	}
	path := a.detailView.localPath
	a.transientHint = "opening " + filepath.Base(path) + " externally"
	return tea.Batch(scheduleHintExpire(a.transientHint), func() tea.Msg {
		return localFileExternalOpenMsg{path: path, err: openLocalFileExternally(path)}
	})
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
	if !strings.Contains(value, "\n") && !strings.HasPrefix(strings.TrimSpace(value), "- ") {
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
	if cmd, ok := a.handlePermissionInspectorKey(k); ok {
		return a, cmd
	}
	switch k.String() {
	case "esc", "ctrl+c", "ctrl+e":
		a.closeDetailView()
		return a, nil
	case "y":
		return a, a.copyDetailViewToClipboard()
	case "o":
		return a, a.openDetailFileExternally()
	case "u":
		return a, a.uploadCurrentFileDetail()
	case "tab", "right", "l":
		if a.cycleFileDetailMode(1) {
			return a, nil
		}
	case "shift+tab", "left", "h":
		if a.cycleFileDetailMode(-1) {
			return a, nil
		}
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

func (a *App) handlePermissionInspectorKey(k tea.KeyPressMsg) (tea.Cmd, bool) {
	if a.detailView == nil || !strings.HasPrefix(a.detailView.title, "Permissions") {
		return nil, false
	}
	var action gact.PermissionAction
	switch k.String() {
	case "a":
		action = gact.PermAllow
	case "d":
		action = gact.PermDeny
	case "s":
		action = gact.PermAllowSession
	case "w":
		action = gact.PermAllowWorkspace
	default:
		return nil, false
	}
	return respondPermissionInspectorCmd(a.c, a.currentSessionID(), action), true
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
//	18 outer screen margin and composer/footer gutter
//
// = 26 rows reserved. Prevents the tall-file overflow the user
// reported ("the window can overflow").
func (a *App) detailPageSize() int {
	n := a.height - 26
	if n < 1 {
		n = 1
	}
	return n
}

func (a *App) renderScrollableDetailModal(opts scrollableDetailOptions) scrollableDetailRender {
	t := a.Theme
	w := opts.width
	if w < 12 {
		w = 12
	}
	innerW := modalInnerWidth(w)
	if innerW < 10 {
		innerW = 10
	}
	page := opts.page
	if page < 1 {
		page = 1
	}

	wrapped := a.cachedDetailWrappedContent(opts.content, innerW)
	page = compactModalBodyRows(wrapped, page, minInt(8, page))
	lines := strings.Split(wrapped, "\n")
	title := opts.title
	closeID := opts.closeID
	if closeID == "" {
		closeID = "detail:close"
	}
	closeFn := opts.close
	if closeFn == nil {
		closeFn = func(app *App) { app.closeDetailView() }
	}
	closeLabel := strings.TrimSpace(opts.closeLabel)
	if closeLabel == "" {
		closeLabel = "x"
	}
	buttons := []menuButton{
		{
			id:    "detail:copy",
			label: "copy",
			action: func(app *App) tea.Cmd {
				return app.copyDetailViewToClipboard()
			},
		},
		{
			id:    closeID,
			label: closeLabel,
			action: func(app *App) tea.Cmd {
				closeFn(app)
				return nil
			},
		},
	}
	if permissionButtons := a.permissionInspectorDecisionButtons(title); len(permissionButtons) > 0 {
		buttons = append(permissionButtons, buttons...)
	}
	if a.fileDetailUploadAvailable() {
		buttons = append([]menuButton{{
			id:    "detail:upload",
			label: "upload",
			action: func(app *App) tea.Cmd {
				return app.uploadCurrentFileDetail()
			},
		}}, buttons...)
	}
	if a.fileDetailExternalAvailable() {
		buttons = append([]menuButton{{
			id:    "detail:open-external",
			label: "open",
			action: func(app *App) tea.Cmd {
				return app.openDetailFileExternally()
			},
		}}, buttons...)
	}

	hint := opts.hint
	if hint == "" {
		hint = "Up/Down scroll  Pg page  g/G top/bottom  y copy  Esc close"
	}
	if a.MouseEnabled {
		hint = strings.Replace(hint, "Up/Down scroll  ", "scroll  ", 1)
		hint = "drag app copy  Alt+drag terminal select  " + hint
	}
	if a.fileDetailUploadAvailable() {
		hint = "u upload  " + hint
	}
	if a.fileDetailExternalAvailable() {
		hint = "o open  " + hint
	}
	if a.fileDetailHasModes() {
		hint = "Tab mode  " + hint
	}
	hintStyle := t.HintLabel
	bodyContent := strings.Join(lines, "\n")
	rendered := a.renderScrollableModalFrame(scrollableModalFrameOptions{
		frame: modalFrameOptions{
			width:      w,
			title:      title,
			buttons:    buttons,
			tabs:       opts.tabs,
			tabPadding: 1,
			tabSpacing: 1,
		},
		content:     bodyContent,
		pageSize:    page,
		scroll:      opts.scroll,
		wheelID:     "detail",
		footerHint:  hint,
		footerStyle: &hintStyle,
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.detailScroll = moveScrollOffsetByWheel(app.detailScroll, button)
			return nil
		},
		scrollTo: func(app *App, scroll int) tea.Cmd {
			app.detailScroll = scroll
			return nil
		},
	})
	visibleBody := windowModalBody(bodyContent, page, rendered.window.scroll)
	visibleLines := strings.Split(visibleBody.body, "\n")
	a.setDetailCopySnapshot(visibleLines, rendered.modal, rendered.bodyRow)
	rendered.modal = a.renderDetailCopyDragHighlight(rendered.modal)
	return scrollableDetailRender{modal: rendered.modal, scroll: rendered.window.scroll, window: rendered.window}
}

func (a *App) cachedDetailWrappedContent(content string, width int) string {
	if a == nil {
		return wrap(content, width)
	}
	if a.detailWrap.width == width && a.detailWrap.content == content {
		return a.detailWrap.wrapped
	}
	wrapped := wrap(content, width)
	a.detailWrap = detailWrapCache{
		content: content,
		width:   width,
		wrapped: wrapped,
	}
	return wrapped
}

func (a *App) permissionInspectorDecisionButtons(title string) []menuButton {
	if !strings.HasPrefix(title, "Permissions") {
		return nil
	}
	if a.detailView == nil || strings.Contains(strings.ToLower(a.detailView.fullText), "no pending requests") {
		return nil
	}
	button := func(id string, label string, action gact.PermissionAction) menuButton {
		return menuButton{
			id:    id,
			label: label,
			action: func(app *App) tea.Cmd {
				return respondPermissionInspectorCmd(app.c, app.currentSessionID(), action)
			},
		}
	}
	return []menuButton{
		button("permissions:allow", "allow", gact.PermAllow),
		button("permissions:deny", "deny", gact.PermDeny),
		button("permissions:session", "session", gact.PermAllowSession),
		button("permissions:workspace", "workspace", gact.PermAllowWorkspace),
	}
}

func (a *App) fileDetailUploadAvailable() bool {
	return a.detailView != nil &&
		a.detailView.messageID == "files" &&
		a.detailView.partID != "root" &&
		strings.TrimSpace(a.detailView.localPath) != "" &&
		a.caps.Capabilities.AttachmentsUpload
}

func (a *App) fileDetailExternalAvailable() bool {
	return a.detailView != nil &&
		a.detailView.messageID == "files" &&
		strings.TrimSpace(a.detailView.localPath) != ""
}

func (a *App) fileDetailHasModes() bool {
	return a.detailView != nil && len(a.detailView.fileModes) > 1
}

func (a *App) cycleFileDetailMode(delta int) bool {
	if a.detailView == nil || len(a.detailView.fileModes) <= 1 {
		return false
	}
	idx := a.fileDetailModeIndex()
	next := (idx + delta) % len(a.detailView.fileModes)
	if next < 0 {
		next += len(a.detailView.fileModes)
	}
	a.setFileDetailMode(a.detailView.fileModes[next].id)
	return true
}

func (a *App) fileDetailModeIndex() int {
	if a.detailView == nil || len(a.detailView.fileModes) == 0 {
		return 0
	}
	for i, mode := range a.detailView.fileModes {
		if mode.id == a.detailView.fileMode {
			return i
		}
	}
	return 0
}

func (a *App) setFileDetailMode(id string) {
	if a.detailView == nil {
		return
	}
	for _, mode := range a.detailView.fileModes {
		if mode.id != id {
			continue
		}
		a.detailView.fileMode = mode.id
		a.detailView.fullText = mode.text
		a.detailScroll = 0
		a.detailWrap = detailWrapCache{}
		return
	}
}

func (a *App) fileDetailTabs() []menuTab {
	if a.detailView == nil || len(a.detailView.fileModes) <= 1 {
		return nil
	}
	tabs := make([]menuTab, 0, len(a.detailView.fileModes))
	for _, mode := range a.detailView.fileModes {
		mode := mode
		tabs = append(tabs, menuTab{
			id:     "file-detail:" + mode.id,
			label:  mode.label,
			active: mode.id == a.detailView.fileMode,
			action: func(app *App) tea.Cmd {
				app.setFileDetailMode(mode.id)
				return nil
			},
		})
	}
	return tabs
}

func openLocalFileExternally(path string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", path).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", "", path).Start()
	default:
		return exec.Command("xdg-open", path).Start()
	}
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
		gact.PartTypeAgentQuestion, gact.PartTypeRetryAttempt,
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
	fields := []detailField{{"tool", p.ToolName}}
	fields = append(fields, detailField{"call", p.CallID})
	rows := appendDetailSection(nil, "Tool call", fields...)
	if len(p.Input) > 0 {
		if payload, err := json.MarshalIndent(p.Input, "", "  "); err == nil {
			rows = append(rows, detailFieldRows("input", string(payload))...)
		} else {
			rows = append(rows, detailFieldRows("input", fmt.Sprint(p.Input))...)
		}
	}
	if len(p.Metadata) > 0 {
		if payload, err := json.MarshalIndent(p.Metadata, "", "  "); err == nil {
			rows = append(rows, detailFieldRows("metadata", string(payload))...)
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
	case gact.PartTypeAgentQuestion:
		title = "agent question"
	case gact.PartTypeRetryAttempt:
		title = "retry attempt"
	case partTypeRuntimeProvenance:
		title = "runtime provenance"
	case gact.PartTypeToolResult:
		title = "tool result"
		if p.ToolName != "" {
			title = toolDisplayName(p.ToolName) + " result"
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
	fields := []detailField{{"kind", humanizePartKind(p.Type)}}
	fields = append(fields, detailField{"part", p.ID})
	fields = append(fields, detailField{"call", p.CallID})
	fields = append(fields, detailField{"provenance", promotedEvidenceLabel(p)})
	var rows []string
	semanticEvent := map[string]any(nil)
	if isSemanticEventPart(p) {
		semanticEvent = mapValue(p.Metadata["raw_event"])
		rows = appendSemanticEventDetail(rows, semanticEvent)
	}
	rows = appendDetailSection(rows, "Part", fields...)

	switch p.Type {
	case gact.PartTypeRoutingDecision:
		rows = append(rows, detailFieldRows("selected expert", orPlaceholder(p.SelectedAgent, "unknown"))...)
		rows = append(rows, detailFieldRows("routing source", routeSourceLabel(p))...)
		if p.Confidence > 0 {
			rows = append(rows, detailFieldRows("confidence", fmt.Sprintf("%.2f", p.Confidence))...)
		}
		if p.Rationale != "" {
			rows = append(rows, detailFieldRows("rationale", p.Rationale)...)
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
		rows = append(rows, detailFieldRows("route", route)...)
		rows = append(rows, detailFieldRows("status", orPlaceholder(stringValue(p.Metadata["status"]), "observed"))...)
		if stage := firstNonEmpty(stringValue(p.Metadata["stage"]), stringValue(p.Metadata["dispatch_target"])); stage != "" {
			rows = append(rows, detailFieldRows("stage", stage)...)
		}
		if duration, ok := floatValue(p.Metadata["duration_ms"]); ok && duration > 0 {
			rows = append(rows, detailFieldRows("duration", fmt.Sprintf("%.0f ms", duration))...)
		}
		if input := strings.TrimSpace(stringValue(p.Metadata["input_summary"])); input != "" {
			rows = append(rows, detailFieldRows("input", input)...)
		}
		output := firstNonEmpty(
			stringValue(p.Metadata["output_summary"]),
			stringValue(p.Metadata["summary"]),
			p.Text,
		)
		if output != "" {
			rows = append(rows, detailFieldRows("output", output)...)
		}
		rows = append(rows, detailFieldRows("inline preview", orPlaceholder(summarizeExpertHandoffOutput(output), "none"))...)
		for _, key := range []string{
			"agent_id",
			"parent_id",
			"dispatch_target",
		} {
			if value, ok := p.Metadata[key]; ok && value != nil {
				rows = append(rows, detailFieldRows(key, fmt.Sprint(value))...)
			}
		}
	case gact.PartTypeAgentQuestion:
		if p.Question != nil {
			rows = append(rows, detailFieldRows("question", p.Question.ID)...)
			rows = append(rows, detailFieldRows("source", firstNonEmpty(p.Question.Source, p.Question.AgentID))...)
			rows = append(rows, detailFieldRows("category", p.Question.Category)...)
			rows = append(rows, detailFieldRows("kind", firstNonEmpty(p.Question.Kind, p.Question.ExpectedAnswerType))...)
			rows = append(rows, detailFieldRows("status", p.Question.Status)...)
			rows = append(rows, detailFieldRows("prompt", p.Question.Prompt)...)
			choices := p.Question.Options
			if len(choices) == 0 {
				choices = p.Question.Choices
			}
			if len(choices) > 0 {
				choiceRows := make([]string, 0, len(choices))
				for _, choice := range choices {
					label := firstNonEmpty(choice.Label, choice.Value, choice.ID)
					if choice.Description != "" {
						label += ": " + choice.Description
					}
					choiceRows = append(choiceRows, label)
				}
				rows = append(rows, detailFieldRows("choices", strings.Join(choiceRows, "\n"))...)
			}
		} else if p.Text != "" {
			rows = append(rows, detailFieldRows("prompt", p.Text)...)
		}
	case gact.PartTypeRetryAttempt:
		if p.RetryAttempt != nil {
			rows = append(rows, detailFieldRows("attempt", p.RetryAttempt.ID)...)
			rows = append(rows, detailFieldRows("source message", firstNonEmpty(p.RetryAttempt.SourceMessageID, p.RetryAttempt.OriginalMessageID))...)
			rows = append(rows, detailFieldRows("attempt message", p.RetryAttempt.AttemptMessageID)...)
			rows = append(rows, detailFieldRows("status", p.RetryAttempt.Status)...)
			rows = append(rows, detailFieldRows("notes", p.RetryAttempt.Notes)...)
			rows = append(rows, detailFieldRows("warning", p.RetryAttempt.Warning)...)
			if p.RetryAttempt.Model != nil {
				rows = append(rows, detailFieldRows("model", modelLabel(*p.RetryAttempt.Model))...)
			}
		} else if p.Text != "" {
			rows = append(rows, detailFieldRows("notes", p.Text)...)
		}
	case partTypeRuntimeProvenance:
		rp := mapValue(p.Metadata["runtime_provenance"])
		if len(rp) > 0 {
			return runtimeProvenanceDetailText(rp)
		}
		if p.Text != "" {
			rows = append(rows, detailFieldRows("summary", p.Text)...)
		}
	case gact.PartTypeToolResult:
		if p.ToolName != "" {
			rows = append(rows, detailFieldRows("tool", p.ToolName)...)
		}
		rows = append(rows, detailFieldRows("error", fmt.Sprintf("%v", p.IsError))...)
		rows = append(rows, detailFieldRows("cached", fmt.Sprintf("%v", p.Cached))...)
		if p.DurationMS > 0 {
			rows = append(rows, detailFieldRows("duration", fmt.Sprintf("%.0f ms", p.DurationMS))...)
		}
		text := flattenToolResult(p)
		if text != "" {
			rows = append(rows, detailFieldRows("content", text)...)
		}
		if raw := p.Metadata["raw_result"]; raw != nil {
			rows = appendAnyJSONSection(rows, "raw result", raw)
		}
	case gact.PartTypeText:
		if p.Text != "" {
			rows = append(rows, detailFieldRows("text", p.Text)...)
		}
	case gact.PartTypeThinking:
		if p.Thinking != "" {
			rows = append(rows, detailFieldRows("thinking", p.Thinking)...)
		}
		if p.Signature != "" {
			rows = append(rows, detailFieldRows("signature", p.Signature)...)
		}
	case gact.PartTypeSubagentCall:
		rows = append(rows, detailFieldRows("agent", orPlaceholder(p.AgentID, "unknown"))...)
		rows = append(rows, detailFieldRows("child session", orPlaceholder(p.SubsessionID, "none"))...)
		if p.Prompt != "" {
			rows = append(rows, detailFieldRows("prompt", p.Prompt)...)
		}
		rows = appendJSONSection(rows, "params", p.Params)
	case gact.PartTypeSubagentResult:
		rows = append(rows, detailFieldRows("child session", orPlaceholder(p.SubsessionID, "none"))...)
		rows = append(rows, detailFieldRows("final message", orPlaceholder(p.FinalMessageID, "none"))...)
		if p.Summary != "" {
			rows = append(rows, detailFieldRows("summary", p.Summary)...)
		}
	case gact.PartTypeError:
		rows = append(rows, detailFieldRows("code", orPlaceholder(p.Code, "unknown"))...)
		rows = append(rows, detailFieldRows("recoverable", fmt.Sprintf("%v", p.Recoverable))...)
		if p.Message != "" {
			rows = append(rows, detailFieldRows("message", p.Message)...)
		}
	case gact.PartTypeCompaction:
		rows = append(rows, detailFieldRows("auto", fmt.Sprintf("%v", p.Auto))...)
		if p.Summary != "" {
			rows = append(rows, detailFieldRows("summary", p.Summary)...)
		}
		if len(p.CompactedMessageIDs) > 0 {
			rows = append(rows, detailFieldRows("compacted messages", strings.Join(p.CompactedMessageIDs, "\n"))...)
		}
	case gact.PartTypeResourceLink, gact.PartTypeResource:
		rows = append(rows, detailFieldRows("uri", orPlaceholder(p.URI, "none"))...)
		rows = append(rows, detailFieldRows("media type", orPlaceholder(p.MimeType, "unknown"))...)
		if p.Name != "" {
			rows = append(rows, detailFieldRows("name", p.Name)...)
		}
		if p.Description != "" {
			rows = append(rows, detailFieldRows("description", p.Description)...)
		}
	case gact.PartTypeImage, gact.PartTypeDocument, gact.PartTypeCitation:
		if p.Title != "" {
			rows = append(rows, detailFieldRows("title", p.Title)...)
		}
		if p.Context != "" {
			rows = append(rows, detailFieldRows("context", p.Context)...)
		}
		if p.Text != "" {
			rows = append(rows, detailFieldRows("text", p.Text)...)
		}
		rows = appendAnyJSONSection(rows, "source", p.Source)
		rows = appendAnyJSONSection(rows, "citations", p.Citations)
	default:
		if p.Text != "" {
			rows = append(rows, detailFieldRows("text", p.Text)...)
		}
		if p.Summary != "" {
			rows = append(rows, detailFieldRows("summary", p.Summary)...)
		}
	}

	rows = appendJSONSection(rows, "metadata", detailMetadataRemainder(p))
	return strings.Join(rows, "\n")
}

func humanizePartKind(kind string) string {
	kind = humanizeAgentLabel(kind)
	if kind == "" {
		return "unknown"
	}
	return kind
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
	if isSemanticEventPart(p) {
		for _, key := range []string{
			"semantic_event",
			"event_type",
			"trace_id",
			"turn_id",
			"status",
			"detail_level",
			"stream_source",
			"raw_event",
		} {
			used[key] = true
		}
	}
	switch p.Type {
	case gact.PartTypeRoutingDecision:
		for _, key := range []string{
			"route_source",
			"selected_agent",
		} {
			used[key] = true
		}
	case gact.PartTypeToolResult:
		used["raw_result"] = true
	case gact.PartTypeThinking:
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
	case partTypeRuntimeProvenance:
		used["synthetic_from"] = true
		used["runtime_provenance"] = true
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

func isSemanticEventPart(p gact.Part) bool {
	return p.Metadata != nil && p.Metadata["semantic_event"] == true && len(mapValue(p.Metadata["raw_event"])) > 0
}

func appendSemanticEventDetail(rows []string, event map[string]any) []string {
	if len(event) == 0 {
		return rows
	}
	userSummary := semanticEventReadableResult(event)
	rows = appendSemanticEventOperatorView(rows, event)
	rows = appendDetailSection(rows, "Event summary",
		detailField{"what happened", userSummary},
		detailField{"status", runtimeScalar(event["status"])},
		detailField{"event", runtimeScalar(event["event_type"])},
		detailField{"stream", semanticEventStreamLabel(event["live_observed"])},
		detailField{"time", runtimeScalar(event["occurred_at"])},
	)
	rows = appendDetailSection(rows, "Workflow trace",
		detailField{"session", runtimeScalar(event["session_id"])},
		detailField{"workspace", runtimeScalar(event["workspace_id"])},
		detailField{"trace", runtimeScalar(event["trace_id"])},
		detailField{"turn", runtimeScalar(event["turn_id"])},
		detailField{"span", runtimeScalar(event["span_id"])},
		detailField{"parent span", runtimeScalar(event["parent_span_id"])},
	)
	rows = appendDetailSection(rows, "Technical trace",
		detailField{"format", runtimeScalar(event["schema_version"])},
		detailField{"event", runtimeScalar(event["event_id"])},
		detailField{"detail", runtimeScalar(event["detail_level"])},
	)
	rows = appendSemanticEventMapSection(rows, "Actor", mapValue(event["actor"]),
		"agent_id", "agent", "role", "tool", "tool_name", "provider_id", "model_id", "kind", "source", "execution_mode")
	rows = appendSemanticEventMapSection(rows, "Subject", mapValue(event["subject"]),
		"agent_id", "parent_id", "child_id", "role", "tool", "tool_name", "call_id", "message_id", "path", "artifact_type")
	rows = appendSemanticEventMapSection(rows, "Blueprint", mapValue(event["blueprint"]),
		"id", "agent_blueprint_id", "pack_id", "version", "pack_version", "scope", "definition_path")
	rows = appendSemanticEventMapSection(rows, "Provider", mapValue(event["provider"]),
		"provider_id", "model_id", "model", "source")
	rows = appendSemanticEventMapSection(rows, "Tool evidence", mapValue(event["payload"]),
		"stage", "status", "parent_id", "agent_id", "return_to", "resumed_from", "tool", "tool_name", "call_id", "ok", "duration_ms", "cached", "telemetry_source", "args_preview", "args", "input_preview", "input", "error", "message", "path", "artifact_type")
	if semanticRawEventDetailEnabled() {
		rows = appendAnyJSONSection(rows, "Raw semantic event", event)
	}
	return rows
}

func semanticRawEventDetailEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("GACT_SEMANTIC_RAW_EVENT_DETAIL"))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func appendSemanticEventOperatorView(rows []string, event map[string]any) []string {
	payload := mapValue(event["payload"])
	actor := mapValue(event["actor"])
	subject := mapValue(event["subject"])
	blueprint := mapValue(event["blueprint"])
	provider := mapValue(event["provider"])

	tool := firstNonEmpty(
		runtimeScalar(payload["tool"]),
		runtimeScalar(payload["tool_name"]),
		runtimeScalar(actor["tool"]),
		runtimeScalar(actor["tool_name"]),
		runtimeScalar(subject["tool"]),
		runtimeScalar(subject["tool_name"]),
	)
	agent := firstNonEmpty(
		runtimeScalar(actor["agent_id"]),
		runtimeScalar(actor["agent"]),
		runtimeScalar(subject["agent_id"]),
		runtimeScalar(subject["agent"]),
		runtimeScalar(payload["agent_id"]),
	)
	workflow := firstNonEmpty(
		runtimeScalar(blueprint["id"]),
		runtimeScalar(blueprint["agent_blueprint_id"]),
		runtimeScalar(blueprint["pack_id"]),
	)
	model := firstNonEmpty(
		runtimeScalar(provider["model_id"]),
		runtimeScalar(provider["model"]),
	)
	providerLabel := semanticProviderLabel(provider)
	apiBase := firstNonEmpty(runtimeScalar(provider["api_base"]), runtimeScalar(provider["base_url"]))
	status := runtimeScalar(event["status"])
	if status == "" {
		status = runtimeScalar(payload["status"])
	}
	if ok, known := optionalBoolValue(firstNonNil(payload["ok"], event["ok"])); known {
		if ok {
			status = firstNonEmpty(status, "completed")
		} else {
			status = firstNonEmpty(status, "failed")
		}
	}
	duration := ""
	if ms, ok := floatValue(firstNonNil(payload["duration_ms"], event["duration_ms"])); ok && ms > 0 {
		duration = fmt.Sprintf("%.0fms", ms)
	}
	argsPreview := semanticArgsPreview(payload, event)
	workflowSummary := workflowStateSummary(firstNonEmptyMap(
		mapValue(payload["workflow_state"]),
		mapValue(event["workflow_state"]),
	))
	userSummary := semanticEventReadableResult(event)
	failureSummary := semanticFailureSummary(event, runtimeScalar(event["event_type"]))
	fallbackSummary := semanticStreamFallbackSummary(event)
	fields := []detailField{
		detailField{"result", userSummary},
		detailField{"status", status},
		detailField{"failure", failureSummary},
		detailField{"fallback", fallbackSummary},
		detailField{"agent", humanizeSemanticOperatorValue(agent)},
		detailField{"workflow state", workflowSummary},
		detailField{"duration", duration},
		detailField{"input", argsPreview},
	}
	if strings.TrimSpace(tool) != "" {
		fields = append(fields, detailField{"tool", toolDisplayName(tool)})
	}
	if workflow != "" {
		fields = append(fields, detailField{"workflow", workflow})
	}
	if providerLabel != "" {
		fields = append(fields, detailField{"provider", providerLabel})
	}
	if model != "" {
		fields = append(fields, detailField{"model", model})
	}
	if apiBase != "" {
		fields = append(fields, detailField{"endpoint", apiBase})
	}
	return appendDetailSection(rows, "Operator view", fields...)
}

func semanticEventReadableResult(event map[string]any) string {
	eventType := runtimeScalar(event["event_type"])
	if strings.HasPrefix(eventType, "tool.call.") {
		payload := semanticToolPayload(event)
		tool := firstNonEmpty(
			runtimeScalar(payload["tool"]),
			runtimeScalar(payload["tool_name"]),
			runtimeScalar(mapValue(event["actor"])["tool"]),
			runtimeScalar(mapValue(event["actor"])["tool_name"]),
			runtimeScalar(mapValue(event["subject"])["tool"]),
			runtimeScalar(mapValue(event["subject"])["tool_name"]),
			"tool",
		)
		if strings.HasSuffix(eventType, ".completed") {
			duration, hasDuration := floatValue(firstNonNil(payload["duration_ms"], event["duration_ms"]))
			cached, hasCached := firstNonNil(payload["cached"], event["cached"]).(bool)
			summary := semanticToolCompletionSummary(
				tool,
				runtimeScalar(event["summary"]),
				payload,
				event,
				duration,
				hasDuration,
				cached,
				hasCached,
			)
			if strings.TrimSpace(summary) != "" {
				return compactSemanticDetailResult(summary)
			}
		}
		if strings.HasSuffix(eventType, ".started") {
			if args := semanticInlineArgsPreview(payload, event); args != "" {
				return toolDisplayName(tool) + " started with " + args
			}
			return toolDisplayName(tool) + " started."
		}
	}
	return compactSemanticDetailResult(semanticUserSummary(event, eventType))
}

func compactSemanticDetailResult(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	if looksLikeMarkdownBlock(text) {
		return truncateMarkdownBlock(text, 650, 10)
	}
	lines := strings.Split(text, "\n")
	if len(lines) > 8 {
		return strings.TrimSpace(strings.Join(lines[:8], "\n")) + "\n\n_full result available below_"
	}
	return truncateString(text, 720)
}

func firstNonEmptyMap(values ...map[string]any) map[string]any {
	for _, value := range values {
		if len(value) > 0 {
			return value
		}
	}
	return nil
}

func humanizeSemanticOperatorValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	return humanizeAgentLabel(value)
}

func semanticEventStreamLabel(v any) string {
	switch value := v.(type) {
	case bool:
		if value {
			return "live"
		}
		return "batch"
	case string:
		switch strings.ToLower(strings.TrimSpace(value)) {
		case "true", "live", "yes":
			return "live"
		case "false", "batch", "recorded", "no":
			return "batch"
		default:
			return strings.TrimSpace(value)
		}
	default:
		return runtimeScalar(v)
	}
}

func semanticEventTopFields(event map[string]any) map[string]any {
	if len(event) == 0 {
		return nil
	}
	out := make(map[string]any, len(event))
	for key, value := range event {
		switch key {
		case "actor", "subject", "blueprint", "provider", "payload":
			continue
		default:
			out[key] = value
		}
	}
	return out
}

func appendSemanticEventMapSection(rows []string, title string, m map[string]any, preferred ...string) []string {
	if len(m) == 0 {
		return rows
	}
	fields := make([]detailField, 0, len(m))
	seen := map[string]bool{}
	for _, key := range preferred {
		if value := semanticEventDetailValue(key, m[key]); value != "" {
			fields = append(fields, detailField{semanticEventDetailLabel(key), value})
			seen[key] = true
		}
	}
	for _, key := range sortedAnyMapKeys(m) {
		if seen[key] {
			continue
		}
		if value := semanticEventDetailValue(key, m[key]); value != "" {
			fields = append(fields, detailField{semanticEventDetailLabel(key), value})
		}
	}
	if len(fields) == 0 {
		return rows
	}
	return appendDetailSection(rows, title, fields...)
}

func semanticEventDetailValue(key string, value any) string {
	text := runtimeScalar(value)
	switch key {
	case "args", "args_preview", "input", "input_preview":
		if semanticPreviewIsRedacted(text) {
			return "input redacted by runtime"
		}
	}
	return text
}

func semanticEventDetailLabel(key string) string {
	switch key {
	case "artifact_type":
		return "artifact type"
	case "args", "args_preview", "input", "input_preview":
		return "input"
	case "call_id":
		return "call"
	case "child_id":
		return "child"
	case "detail_level":
		return "detail"
	case "event_id":
		return "event"
	case "event_type":
		return "type"
	case "live_observed":
		return "live"
	case "occurred_at":
		return "time"
	case "pack_id":
		return "pack"
	case "pack_version":
		return "pack version"
	case "parent_span_id":
		return "parent span"
	case "resumed_from":
		return "resumed from"
	case "span_id":
		return "span"
	case "telemetry_source":
		return "telemetry"
	default:
		return runtimeProvenanceLabel(key)
	}
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
		return append(rows, detailFieldRows(label, string(body))...)
	}
	return append(rows, detailFieldRows(label, fmt.Sprint(payload))...)
}

func appendAnyJSONSection(rows []string, label string, payload any) []string {
	if payload == nil {
		return rows
	}
	if body, err := json.MarshalIndent(payload, "", "  "); err == nil {
		return append(rows, detailFieldRows(label, string(body))...)
	}
	return append(rows, detailFieldRows(label, fmt.Sprint(payload))...)
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
	// YYYYYYYYY1: use the wider detail-specific width so file content
	// (the main payload of this modal) doesn't wrap at 72 cols.
	ref := a.detailView
	closeLabel := "x"
	hint := ""
	if a.catalogBrowserOpen && a.catalogBrowser != nil {
		closeLabel = "back"
		hint = "Up/Down scroll  Pg page  g/G top/bottom  y copy  Esc back"
	}
	rendered := a.renderScrollableDetailModal(scrollableDetailOptions{
		width:      a.detailModalWidth(),
		title:      ref.title,
		content:    ref.fullText,
		scroll:     a.detailScroll,
		page:       a.detailPageSize(),
		tabs:       a.fileDetailTabs(),
		hint:       hint,
		closeID:    "detail:close",
		closeLabel: closeLabel,
		close:      func(app *App) { app.closeDetailView() },
	})
	a.detailScroll = rendered.scroll
	return rendered.modal
}
