package ui

// bulkyPartRef identifies a tool_result we want to show in full
// inside the floating detail view. Captured at expand time so the
// modal has its own copy of the text. The alternative is
// re-walking a.conversation.messages every render).
type bulkyPartRef struct {
	messageID string
	partID    string
	title     string // rendered header ("ReadFile(main.go) → output")
	fullText  string
	localPath string
	fileModes []fileDetailMode
	fileMode  string
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
func (m *detailViewModal) openModal() {
	a := m.app
	if a.execution.openArtifactForSelection() {
		return
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
		return
	}
	m.open(&ref)
}
