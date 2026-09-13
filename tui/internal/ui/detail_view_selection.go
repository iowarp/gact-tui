package ui

import (
	tea "charm.land/bubbletea/v2"
	"context"
	"fmt"
	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/presentation"
	"strings"
	"time"
	"unicode/utf8"
)

// bulkyPartRef identifies a tool_result we want to show in full
// inside the floating detail view. Captured at expand time so the
// modal has its own copy of the text. The alternative is
// re-walking a.conversation.messages every render).
type bulkyPartRef struct {
	presentation  *gact.Part
	resultText    string
	technicalText string
	messageID     string
	partID        string
	title         string // rendered header ("ReadFile(main.go) → output")
	fullText      string
	localPath     string
	fileModes     []fileDetailMode
	fileMode      string
}

// openModal opens the floating detail view on the
// body cursor's bulky part, falling back to the latest bulky in
// the whole conversation. Shared by Ctrl+E and body-Enter so both
// paths stay in lockstep.
//
// When bodySelPartIdx points at a specific addressable part, target
// that part directly, so if the assistant read two
// large files in one turn, the user can expand either one
// individually. The old findBulkyPartIn fallback (first bulky in
// the selected message) still covers the unset-partIdx case.
func (m *detailViewModal) openModal() tea.Cmd {
	a := m.app
	if ref, ok := m.selectedDeclaredResult(); ok {
		m.open(&ref)
		return m.loadDeclaredResult()
	}
	if a.execution.openArtifactForSelection() {
		return nil
	}
	var (
		ref bulkyPartRef
		ok  bool
	)
	if a.conversation.bodySelMsgIdx >= 0 && a.conversation.bodySelMsgIdx < len(a.conversation.messages) {
		msg := a.conversation.messages[a.conversation.bodySelMsgIdx]
		if a.conversation.bodySelPartIdx >= 0 {
			ref, ok = findBulkyPartForSelected(msg, a.conversation.bodySelPartIdx, a.conversation.messages, a.conversation.bodySelMsgIdx)
		}
		if !ok {
			ref, ok = findBulkyPartIn(msg)
		}
	}
	if !ok {
		ref, ok = findLatestBulkyPart(a.conversation.messages)
	}
	if !ok {
		a.setHint("nothing to expand — no bulky outputs in selection")
		return nil
	}
	m.open(&ref)
	return m.loadDeclaredResult()
}

func declaredResultRef(messageID string, p gact.Part) bulkyPartRef {
	view := *p.Presentation
	view.Blocks = append([]gact.ToolPresentationBlock(nil), view.Blocks...)
	p.Presentation = &view
	text := presentation.Render(p, 1<<20, 1<<30, false, func(s string) string { return s })
	title := view.Action
	if title == "" {
		title = p.ToolName
	}
	return bulkyPartRef{messageID: messageID, partID: p.ID, title: title + " result", fullText: text,
		resultText: text, technicalText: partDetailText(p), presentation: &p}
}

func (m *detailViewModal) selectedDeclaredResult() (bulkyPartRef, bool) {
	c := &m.app.conversation
	if c.bodySelMsgIdx < 0 || c.bodySelMsgIdx >= len(c.messages) {
		return bulkyPartRef{}, false
	}
	ref, ok := findBulkyPartForSelected(c.messages[c.bodySelMsgIdx], c.bodySelPartIdx, c.messages, c.bodySelMsgIdx)
	return ref, ok && ref.presentation != nil
}

type declaredResultLoadedMsg struct {
	ref  *bulkyPartRef
	text string
	err  error
}

func (m *detailViewModal) loadDeclaredResult() tea.Cmd {
	ref := m.ref
	if ref == nil || ref.presentation == nil {
		return nil
	}
	needsPages := false
	for _, block := range ref.presentation.Presentation.Blocks {
		if block.ContentRef != nil && block.Type != "media" {
			needsPages = true
		}
	}
	if !needsPages {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	m.cancelLoad = cancel
	ref.fullText = ref.resultText + "\n\nLoading complete result…"
	client := m.app.c
	sid := m.app.session.currentID()
	return func() tea.Msg {
		defer cancel()
		part := *ref.presentation
		view := *part.Presentation
		view.Blocks = append([]gact.ToolPresentationBlock(nil), view.Blocks...)
		part.Presentation = &view
		for i := range view.Blocks {
			block := &view.Blocks[i]
			contentRef := block.ContentRef
			if contentRef == nil || block.Type == "media" {
				continue
			}
			if contentRef.SessionID != sid || contentRef.CallID != part.CallID || contentRef.BlockID != block.ID {
				return declaredResultLoadedMsg{ref: ref, err: fmt.Errorf("presentation content scope mismatch")}
			}
			// Start at zero: a running reconnect preview can be the tail, not the prefix.
			var body strings.Builder
			for cursor := 0; ; {
				page, err := client.ToolPresentationContent(ctx, *contentRef, cursor)
				if err != nil {
					return declaredResultLoadedMsg{ref: ref, err: err}
				}
				end := cursor + utf8.RuneCountInString(page.Text)
				if page.Cursor != cursor || end > page.TotalChars || (page.NextCursor != nil && (*page.NextCursor != end || end <= cursor)) || (page.NextCursor == nil && end != page.TotalChars) {
					return declaredResultLoadedMsg{ref: ref, err: fmt.Errorf("presentation cursor discontinuity")}
				}
				body.WriteString(page.Text)
				if page.NextCursor == nil {
					break
				}
				cursor = *page.NextCursor
			}
			block.Text, block.ContentRef = body.String(), nil
		}
		return declaredResultLoadedMsg{ref: ref, text: presentation.Render(part, 1<<20, 1<<30, false, func(s string) string { return s })}
	}
}

func (m *detailViewModal) handleDeclaredResultLoaded(msg declaredResultLoadedMsg) (tea.Model, tea.Cmd) {
	if !m.visible || m.ref != msg.ref {
		return m.app, nil
	}
	technical := m.ref.fullText == m.ref.technicalText
	if msg.err != nil {
		m.ref.resultText += "\n\nUnable to load complete result: " + operatorErrorMessage(msg.err)
	} else {
		m.ref.resultText = msg.text
	}
	if !technical {
		m.ref.fullText = m.ref.resultText
	}
	m.wrap = detailWrapCache{}
	return m.app, nil
}
