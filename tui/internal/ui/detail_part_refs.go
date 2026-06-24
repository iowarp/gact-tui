package ui

// detail_part_refs.go resolves bulky-part references and detail text for tool calls and parts.

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// findBulkyPartForSelected builds a bulkyPartRef for the specific
// addressable part the body cursor points at. Handles three
// cases:
//
//   - the selected part is a tool_call: drill forward through sibling
//     tool messages (pairToolResults-style) to find the matching
//     tool_result. Expands the *output*, not the call header; that's
//     what the user wants to see when there are two bulky reads.
//   - the selected part is a tool_result / text / file_diff: expand
//     it directly (same flattenToolResult for tool_result).
//   - the selected part is below the bulky threshold: return !ok so
//     the caller can decide to toast or fall through.
//
// Input:
//
//	m       - the currently selected message
//	addrIdx - bodySelPartIdx (index into addressablePartsOf(m))
//	allMsgs - full messages slice, needed to walk forward into
//	          sibling tool messages for tool_call pairing
//	msgIdx  - m's position in allMsgs
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
