package ui

// render.go renders message parts by role into the conversation body and shortens known paths.

import (
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// renderPartsForRoleWithResults renders parts in order, but when a
// tool_call part has a matching entry in `inlineResults` (by CallID),
// the result Part is rendered immediately after the call so the
// output visually hangs off its own header.
func (t Theme) renderPartsForRoleWithResults(parts []gact.Part, width int, role string, inlineResults map[string]gact.Part) string {
	return t.renderPartsForRoleWithResultsSelected(parts, width, role, inlineResults, "")
}

// renderPartsForRoleWithResultsSelected is the per-part
// marker-aware variant. When selectedPartID matches a part's ID, its
// first rendered line is prefixed with `▸ ` so the user can see
// which addressable block has focus. Works for both the outer part
// and the inlined tool_result sibling so "expand this specific read
// result" reads intuitively.
func (t Theme) renderPartsForRoleWithResultsSelected(parts []gact.Part, width int, role string, inlineResults map[string]gact.Part, selectedPartID string) string {
	// edit_file absorbs its sibling file_diff. User
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

	// Theme identity is constant across every part rendered here; fold it once
	// so the per-part memo (cachedPurePartRender) can key on it cheaply.
	themeSig := themeRenderSignature(t)

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
		case isCacheablePartType(p.Type):
			// Pure semantic parts (routing, expert handoffs, thinking, …).
			// Memoized so a streaming token doesn't re-render the stable
			// agent trajectory on every delta.
			rendered = t.cachedPurePartRender(themeSig, p, width)
		default:
			rendered = t.renderPart(toolCallWithResultStatusSuppressed(p, pairedResults), width)
		}
		if rendered != "" {
			if selectedPartID != "" && p.ID == selectedPartID {
				rendered = markSelectedBlock(rendered, t)
			}
			rows = append(rows, rendered)
		}
		// Prefer the absorbed diff over the "ok" result.
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
					// Thread the parent tool_name so
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
		return t.renderTextPart(p, wrapW)

	case gact.PartTypeThinking:
		return t.renderThinkingPart(p, wrapW)

	case gact.PartTypeRoutingDecision:
		return t.renderRoutingDecisionPart(p, wrapW)

	case gact.PartTypeExpertHandoff:
		return t.renderExpertHandoffPart(p, wrapW)

	case gact.PartTypeAgentQuestion:
		return t.renderAgentQuestionPart(p, wrapW)

	case gact.PartTypeRetryAttempt:
		return t.renderRetryAttemptPart(p, wrapW)

	case gact.PartTypeToolCall:
		return t.renderToolCallPart(p, wrapW)

	case gact.PartTypeToolResult:
		return t.renderToolResultPart(p, wrapW)

	case gact.PartTypeFileDiff:
		return t.renderFileDiffPart(p, wrapW)

	case gact.PartTypeSubagentCall:
		return t.renderSubagentCallPart(p, wrapW)

	case gact.PartTypeSubagentResult:
		return t.renderSubagentResultPart(p, wrapW)

	case gact.PartTypeError:
		return t.renderErrorPart(p, wrapW)

	case gact.PartTypeCompaction:
		return t.renderCompactionPart(p, wrapW)

	case partTypeRuntimeProvenance:
		return t.renderRuntimeProvenancePart(p, wrapW)

	default:
		return t.renderUnknownPart(p)
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
