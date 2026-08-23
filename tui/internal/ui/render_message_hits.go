package ui

// render_message_hits.go renders a message while collecting per-part hit blocks for mouse interaction.

import (
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// renderMessageWithHits renders a message row and computes its mouse hit
// geometry in a SINGLE pass over the parts.
//
// Previously the row string (renderMessageInContextWithResultsSelected) and the
// hit blocks (conversationPartHitBlocks) were produced by two separate
// traversals that each rendered every part — so a streaming turn re-rendered the
// whole message twice per frame, and the two passes could silently drift on line
// heights (misaligning mouse targets). This merges them: each part is rendered
// once, the row collects the (selection-marked) strings, and the geometry
// collects line offsets derived from those same strings.
//
// It is output-equivalent to the old pair; TestRenderMessageWithHitsMatchesLegacy
// pins that against a spread of message shapes.
func (t Theme) renderMessageWithHits(m gact.Message, prev *gact.Message, width int, inlineResults map[string]gact.Part, selectedPartID string) (string, []conversationPartHitBlock) {
	normalizeMessagePresentation(&m)
	if isModelSwapMarker(m) {
		return t.renderModelSwapDivider(m, width), nil
	}
	hideHeader := shouldHideConversationHeader(m, prev)

	body, blocks := t.renderPartsAndHits(m, width, inlineResults, selectedPartID)

	evidence := t.renderToolEvidence(m, width)
	switch {
	case body != "" && evidence != "":
		body = lipgloss.JoinVertical(lipgloss.Left, body, evidence)
	case body == "" && evidence != "":
		body = evidence
	case body == "" && isSemanticLiveMessage(m):
		return "", nil
	case body == "":
		body = t.HintLabel.Render("(no parts)")
	}

	// Header rows precede the body; shift the body-relative hit blocks past them
	// and stamp the message id (mirrors conversationPartHitBlocks).
	headerRows := 0
	if !hideHeader {
		headerRows++ // role header
		if t.ShowTimestamps && !m.CreatedAt.IsZero() {
			headerRows++ // timestamp row
		}
	}
	for i := range blocks {
		blocks[i].fullStart += headerRows
		blocks[i].messageID = m.ID
	}

	if hideHeader {
		return lipgloss.JoinVertical(lipgloss.Left, body, ""), blocks
	}
	ts := ""
	if t.ShowTimestamps && !m.CreatedAt.IsZero() {
		ts = lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
			Render("  " + m.CreatedAt.Format("2006-01-02 15:04:05"))
	}
	header := t.renderMessageHeader(m)
	parts := []string{header}
	if ts != "" {
		parts = append(parts, ts)
	}
	parts = append(parts, body, "")
	return lipgloss.JoinVertical(lipgloss.Left, parts...), blocks
}

// renderPartsAndHits is the merged per-part loop. It returns the joined body
// string (with the selected-part marker applied) and the body-relative hit
// blocks. Render output and geometry come from the same single render of each
// part, so the two can never disagree.
func (t Theme) renderPartsAndHits(m gact.Message, width int, inlineResults map[string]gact.Part, selectedPartID string) (string, []conversationPartHitBlock) {
	parts := m.Parts
	role := m.Role
	editDiffByCall, suppressed := matchEditFileDiffs(parts)
	pairedResults, pairedResultIndexes := pairedToolResultsInParts(parts, inlineResults)
	duplicateSkip, duplicateNotice := compactDuplicateToolRuns(parts, inlineResults)
	themeSig := themeRenderSignature(t)

	addr := addressablePartsOf(m)
	addrByPart := make(map[int]int, len(addr))
	for i, partIdx := range addr {
		addrByPart[partIdx] = i
	}

	var rows []string
	var blocks []conversationPartHitBlock
	row := 0 // body-relative line cursor

	appendRow := func(rendered string, selID string) int {
		h := renderedStringLineCount(rendered)
		out := rendered
		if selectedPartID != "" && selID != "" && selID == selectedPartID {
			out = markSelectedBlock(rendered, t)
		}
		rows = append(rows, out)
		row += h
		return h
	}

	for i, p := range parts {
		if partHiddenFromTranscript(p) || suppressed[p.ID] || duplicateSkip[p.ID] || pairedResultIndexes[i] {
			continue
		}
		start := row
		height := 0
		detailStart := -1
		var diffActions []conversationDiffActionHit

		var rendered string
		switch {
		case role == gact.RoleAssistant && p.Type == gact.PartTypeText && p.Text != "":
			rendered = t.renderAssistantTextPart(p, width)
		case p.Type == gact.PartTypeToolCall && p.ToolName == "edit_file":
			rendered = t.renderPart(toolCallWithResultStatusSuppressed(p, pairedResults), width)
		case isCacheablePartType(p.Type):
			rendered = t.cachedPurePartRender(themeSig, p, width)
		default:
			rendered = t.renderPart(toolCallWithResultStatusSuppressed(p, pairedResults), width)
		}
		if rendered != "" {
			if detailLine := detailAffordanceLine(rendered); detailLine >= 0 {
				detailStart = start + detailLine
			}
			height += appendRow(rendered, p.ID)
		}

		if p.Type == gact.PartTypeToolCall && p.CallID != "" {
			if diff, ok := editDiffByCall[p.CallID]; ok {
				// edit_file absorbs its sibling file_diff: render the diff body
				// under the call header instead of the "ok" tool_result.
				resultStart := row
				diffBody := t.renderEditDiffInline(diff, width)
				if diffBody != "" {
					if pendingFileDiff(diff) {
						for _, action := range diffActionHits(diff.Path, diffBody) {
							action.row += resultStart
							diffActions = append(diffActions, action)
						}
					}
					height += appendRow(diffBody, diff.ID)
				}
			} else if pairedResults != nil {
				if r, ok := pairedResults[p.CallID]; ok {
					rr := t.renderToolResultForTool(r, width, p.ToolName)
					if rr != "" {
						resultStart := row
						if detailLine := detailAffordanceLine(rr); detailLine >= 0 {
							detailStart = resultStart + detailLine
						}
						height += appendRow(rr, r.ID)
						if repeat := duplicateNotice[r.ID]; repeat > 0 {
							height += appendRow(t.renderDuplicateToolNotice(p.ToolName, repeat), "")
						}
					}
				}
			}
		} else if repeat := duplicateNotice[p.ID]; repeat > 0 {
			height += appendRow(t.renderDuplicateToolNotice(p.ToolName, repeat), "")
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

	return lipgloss.JoinVertical(lipgloss.Left, rows...), blocks
}

// Hit-geometry types for conversation parts. The geometry itself is produced by
// renderMessageWithHits (above) in the same single pass that renders the row.

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
