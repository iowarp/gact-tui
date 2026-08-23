package render

// render_tool_result_pairing.go pairs tool results to their calls across messages.

import "github.com/JaimeCernuda/gact-tui/contract/gact"

// PairToolResults walks a slice of messages and, for each assistant message
// that contains tool_call parts, builds a map from call_id to tool_result Part
// by absorbing the consecutive role=tool messages that follow.
//
// Returns:
//   - inlineResults[i] = map of results to inline into message i
//   - absorbed[i] = true when message i was fully paired into the assistant
//
// Pairing is by Part.CallID. Unpaired tool results stay visible standalone so
// the transcript never silently loses output.
func PairToolResults(msgs []gact.Message) (map[int]map[string]gact.Part, map[int]bool) {
	inlineResults := map[int]map[string]gact.Part{}
	absorbed := map[int]bool{}
	for i := range msgs {
		m := msgs[i]
		if m.Role != gact.RoleAssistant {
			continue
		}
		wantedCalls := map[string]bool{}
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeToolCall && p.CallID != "" {
				wantedCalls[p.CallID] = true
			}
		}
		if len(wantedCalls) == 0 {
			continue
		}
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
				break
			}
		}
		if len(results) > 0 {
			inlineResults[i] = results
		}
	}
	return inlineResults, absorbed
}
