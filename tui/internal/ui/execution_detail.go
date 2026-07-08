package ui

// execution_detail.go resolves artifact/observation/report detail references for the selected execution node.

import (
	"encoding/json"
	"fmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/render"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"os"
	"path/filepath"
	"strings"
)

func (c *executionComponent) openArtifactForSelection() bool {
	ref, ok := c.artifactDetailForSelection()
	if !ok {
		return false
	}
	c.app.detail.open(&ref)
	return true
}

func (c *executionComponent) artifactDetailForSelection() (bulkyPartRef, bool) {
	partsTurns := c.conversationTurnsForRender()
	// The provider-thinking disclosure row advertises `Ctrl+E`; when the body
	// cursor sits on that row, open exactly its prose — before the coarser
	// turn-level resolution below can pick an unrelated ref.
	if ref, ok := c.selectedProviderThinkingRef(partsTurns); ok {
		return ref, true
	}
	ledgerTurns := c.turnsForCurrentSession()
	targetsByTurn := c.artifactDetailsByTurn(ledgerTurns)
	// Provider thinking lives only on the message-parts projection — the SSE
	// semantic-event ledger never records thinking parts — so its detail refs
	// merge in from there. Prepending keeps each turn's existing last-ref-wins
	// pick (tool observation / expert report) unchanged; the thinking becomes
	// the turn-level pick only when the turn has no ledger detail (e.g. after
	// a /messages reload, which delivers parts but no ledger).
	turnOrder := make([]string, 0, len(ledgerTurns)+len(partsTurns))
	seenTurn := map[string]bool{}
	for _, turn := range ledgerTurns {
		if !seenTurn[turn.TurnID] {
			seenTurn[turn.TurnID] = true
			turnOrder = append(turnOrder, turn.TurnID)
		}
	}
	for _, turn := range partsTurns {
		refs := providerThinkingDetailRefs(turn)
		if len(refs) == 0 {
			continue
		}
		if !seenTurn[turn.TurnID] {
			seenTurn[turn.TurnID] = true
			turnOrder = append(turnOrder, turn.TurnID)
		}
		targetsByTurn[turn.TurnID] = append(refs, targetsByTurn[turn.TurnID]...)
	}
	if len(targetsByTurn) == 0 {
		return bulkyPartRef{}, false
	}
	if turnID := c.selectedTurnID(); turnID != "" {
		if refs := targetsByTurn[turnID]; len(refs) > 0 {
			return refs[len(refs)-1], true
		}
	}
	for i := len(turnOrder) - 1; i >= 0; i-- {
		if refs := targetsByTurn[turnOrder[i]]; len(refs) > 0 {
			return refs[len(refs)-1], true
		}
	}
	return bulkyPartRef{}, false
}

// selectedProviderThinkingRef resolves the provider-thinking node the body
// cursor addresses, if any. Provider-thinking parts are addressable
// (addressablePartsOf), so their disclosure row is a first-class cursor stop;
// its node carries the source part address (Src) that the selection matches.
func (c *executionComponent) selectedProviderThinkingRef(turns []executionProjectedTurn) (bulkyPartRef, bool) {
	selMsg := c.app.conversation.bodySelMsgIdx
	selAddr := c.app.conversation.bodySelPartIdx
	if selMsg < 0 || selAddr < 0 {
		return bulkyPartRef{}, false
	}
	for _, turn := range turns {
		for _, node := range turn.Nodes {
			if !node.ProviderThinking || !node.Src.Valid ||
				node.Src.MsgIdx != selMsg || node.Src.AddrIdx != selAddr {
				continue
			}
			return providerThinkingDetailRef(turn.TurnID, node)
		}
	}
	return bulkyPartRef{}, false
}

// providerThinkingDetailRefs collects a projected turn's provider-thinking
// detail refs. Only the message-parts projection produces such nodes — the
// ledger node builders (execution_timeline_nodes.go) never set ProviderThinking.
func providerThinkingDetailRefs(turn executionProjectedTurn) []bulkyPartRef {
	var refs []bulkyPartRef
	for _, node := range turn.Nodes {
		if !node.ProviderThinking {
			continue
		}
		if ref, ok := providerThinkingDetailRef(turn.TurnID, node); ok {
			refs = append(refs, ref)
		}
	}
	return refs
}

// providerThinkingDetailRef builds the Ctrl+E detail ref carrying a
// provider-thinking node's full prose — the text the collapsed `thinking ·
// N chars · Ctrl+E` transcript row (execution_render.providerThinkingDisclosure)
// never shows inline.
func providerThinkingDetailRef(turnID string, node executionTimelineNode) (bulkyPartRef, bool) {
	thinking := strings.TrimSpace(node.Thinking)
	if thinking == "" || semanticPreviewIsRedacted(thinking) {
		return bulkyPartRef{}, false
	}
	return bulkyPartRef{
		messageID: "execution:" + turnID,
		partID:    executionNodeDetailID(node, valuefmt.FirstNonEmpty(node.Src.PartID, "thinking")),
		title:     "Thinking · " + valuefmt.FirstNonEmpty(node.Agent, "assistant"),
		fullText:  thinking,
	}, true
}

func (c *executionComponent) artifactDetailsByTurn(turns []executionProjectedTurn) map[string][]bulkyPartRef {
	out := map[string][]bulkyPartRef{}
	for _, turn := range turns {
		for _, node := range turn.Nodes {
			refs := c.artifactDetailsForNode(turn.TurnID, node)
			if len(refs) == 0 {
				continue
			}
			out[turn.TurnID] = append(out[turn.TurnID], refs...)
		}
	}
	return out
}

func (c *executionComponent) artifactDetailsForNode(turnID string, node executionTimelineNode) []bulkyPartRef {
	var refs []bulkyPartRef
	// Provider-native thinking renders as a collapsed `thinking · N chars · Ctrl+E`
	// row (execution_render.emitReactStep); its full prose is only reachable here.
	if node.ProviderThinking {
		if ref, ok := providerThinkingDetailRef(turnID, node); ok {
			refs = append(refs, ref)
		}
	}
	if reasoning := strings.TrimSpace(node.Reasoning); reasoning != "" && !semanticPreviewIsRedacted(reasoning) {
		title := valuefmt.FirstNonEmpty(render.ToolDisplayName(node.ToolName), node.ToolName, "reasoning")
		refs = append(refs, bulkyPartRef{
			messageID: "execution:" + turnID,
			partID:    executionNodeDetailID(node, "reasoning"),
			title:     "Reasoning trace · " + valuefmt.FirstNonEmpty(node.Agent, title),
			fullText:  reasoning,
		})
	}
	switch node.Kind {
	case executionNodeReactStep, executionNodeToolRun:
		refs = append(refs, c.observationDetailRefs(turnID, node)...)
	case executionNodeExpertReport:
		refs = append(refs, c.expertReportDetailRefs(turnID, node)...)
	}
	return refs
}

func (c *executionComponent) observationDetailRefs(turnID string, node executionTimelineNode) []bulkyPartRef {
	toolName := strings.TrimSpace(node.ToolName)
	observation := node.Observation
	if observation == nil {
		return nil
	}
	obj := valuefmt.MapValue(observation)
	if len(obj) == 0 {
		if parsed, ok := parseLooseJSON(observation); ok {
			obj = valuefmt.MapValue(parsed)
		}
	}
	lowerTool := strings.ToLower(toolName)
	switch {
	case strings.Contains(lowerTool, "plot") || strings.Contains(lowerTool, "chart") || strings.Contains(lowerTool, "visual"):
		if ref, ok := c.fileArtifactRef(turnID, node, obj, "Plot image"); ok {
			return []bulkyPartRef{ref}
		}
	case strings.HasPrefix(lowerTool, "ndp_stage"):
		if ref, ok := c.fileArtifactRef(turnID, node, obj, "Staged resource"); ok {
			return []bulkyPartRef{ref}
		}
	case lowerTool == "shell_bash":
		if ref, ok := c.shellDiffRef(turnID, node, obj); ok {
			return []bulkyPartRef{ref}
		}
	}
	if ref, ok := executionJSONOutputRef(turnID, node, "Full output", observation); ok {
		return []bulkyPartRef{ref}
	}
	return nil
}

func (c *executionComponent) expertReportDetailRefs(turnID string, node executionTimelineNode) []bulkyPartRef {
	var refs []bulkyPartRef
	for _, raw := range []any{node.Structured, executionRetainedWorkflowStateFromText(node.Text)} {
		for _, path := range executionArtifactPaths(raw) {
			if ref, ok := c.localFileDetailRef("Artifact · "+filepath.Base(path), path, turnID, executionNodeDetailID(node, path)); ok {
				refs = append(refs, ref)
			}
		}
	}
	text := strings.TrimSpace(stripSemanticControlContracts(valuefmt.FirstNonEmpty(node.Text, node.Summary)))
	if text != "" {
		if preview, hidden := collapseForPreview(text, c.app.Theme.CollapseThreshold); hidden > 0 || strings.Contains(preview, "Ctrl+E") {
			refs = append(refs, bulkyPartRef{
				messageID: "execution:" + turnID,
				partID:    executionNodeDetailID(node, "report"),
				title:     valuefmt.FirstNonEmpty(node.Agent, "expert") + " report",
				fullText:  text,
			})
		}
	}
	return refs
}

func (c *executionComponent) fileArtifactRef(turnID string, node executionTimelineNode, obj map[string]any, titlePrefix string) (bulkyPartRef, bool) {
	path := executionFirstScalarValue(obj, "local_path", "path", "output_path", "artifact_path", "plot_path", "file_path")
	if path == "" {
		return bulkyPartRef{}, false
	}
	title := titlePrefix + " · " + filepath.Base(path)
	return c.localFileDetailRef(title, path, turnID, executionNodeDetailID(node, path))
}

func (c *executionComponent) localFileDetailRef(title, path, turnID, partID string) (bulkyPartRef, bool) {
	path = strings.TrimSpace(path)
	if path == "" {
		return bulkyPartRef{}, false
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		fullText := "path: " + path
		if err != nil {
			fullText += "\nerror: " + err.Error()
		}
		return bulkyPartRef{
			messageID: "execution:" + turnID,
			partID:    partID,
			title:     title,
			fullText:  fullText,
			localPath: path,
		}, true
	}
	root := filepath.Dir(path)
	entry := fileTreeEntry{
		Path: filepath.Base(path),
		Name: filepath.Base(path),
		Size: info.Size(),
	}
	modes := c.app.fileViewer.detailModesWithRoot(root, entry, path)
	active := ""
	fullText := ""
	if len(modes) > 0 {
		active = modes[0].id
		fullText = modes[0].text
	}
	return bulkyPartRef{
		messageID: "execution:" + turnID,
		partID:    partID,
		title:     title,
		fullText:  fullText,
		localPath: path,
		fileModes: modes,
		fileMode:  active,
	}, true
}

func (c *executionComponent) shellDiffRef(turnID string, node executionTimelineNode, obj map[string]any) (bulkyPartRef, bool) {
	command := executionFirstScalarValue(obj, "command")
	dst := executionRedirectDestination(command)
	src := executionRedirectSource(command)
	if dst == "" || src == "" {
		return bulkyPartRef{}, false
	}
	full := executionFullDiff(src, dst)
	if strings.TrimSpace(full) == "" {
		return bulkyPartRef{}, false
	}
	title := "File diff · " + filepath.Base(dst)
	return bulkyPartRef{
		messageID: "execution:" + turnID,
		partID:    executionNodeDetailID(node, dst),
		title:     title,
		fullText:  full,
		localPath: dst,
	}, true
}

func executionJSONOutputRef(turnID string, node executionTimelineNode, title string, value any) (bulkyPartRef, bool) {
	text := strings.TrimSpace(valuefmt.StringValue(value))
	if parsed, ok := parseLooseJSON(value); ok {
		if payload, err := json.MarshalIndent(parsed, "", "  "); err == nil {
			text = string(payload)
		}
	} else if payload, err := json.MarshalIndent(value, "", "  "); err == nil && string(payload) != "null" {
		text = string(payload)
	}
	text = strings.TrimSpace(stripSemanticControlContracts(text))
	if text == "" || semanticPreviewIsRedacted(text) {
		return bulkyPartRef{}, false
	}
	return bulkyPartRef{
		messageID: "execution:" + turnID,
		partID:    executionNodeDetailID(node, "output"),
		title:     title + " · " + valuefmt.FirstNonEmpty(render.ToolDisplayName(node.ToolName), node.ToolName, node.Agent, "execution"),
		fullText:  text,
	}, true
}

func executionNodeDetailID(node executionTimelineNode, suffix string) string {
	parts := []string{string(node.Kind), node.Agent, node.ToolName, fmt.Sprint(node.StepIndex), suffix}
	return strings.Join(parts, ":")
}
