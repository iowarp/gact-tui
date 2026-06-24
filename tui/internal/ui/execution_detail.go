package ui

// execution_detail.go resolves artifact/observation/report detail references for the selected execution node.

import (
	"encoding/json"
	"fmt"
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
	turns := c.turnsForCurrentSession()
	if len(turns) == 0 {
		return bulkyPartRef{}, false
	}
	targetsByTurn := c.artifactDetailsByTurn(turns)
	if len(targetsByTurn) == 0 {
		return bulkyPartRef{}, false
	}
	if turnID := c.selectedTurnID(); turnID != "" {
		if refs := targetsByTurn[turnID]; len(refs) > 0 {
			return refs[len(refs)-1], true
		}
	}
	for i := len(turns) - 1; i >= 0; i-- {
		if refs := targetsByTurn[turns[i].TurnID]; len(refs) > 0 {
			return refs[len(refs)-1], true
		}
	}
	return bulkyPartRef{}, false
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
	if reasoning := strings.TrimSpace(node.Reasoning); reasoning != "" && !semanticPreviewIsRedacted(reasoning) {
		title := firstNonEmpty(toolDisplayName(node.ToolName), node.ToolName, "reasoning")
		refs = append(refs, bulkyPartRef{
			messageID: "execution:" + turnID,
			partID:    executionNodeDetailID(node, "reasoning"),
			title:     "Reasoning trace · " + firstNonEmpty(node.Agent, title),
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
	obj := mapValue(observation)
	if len(obj) == 0 {
		if parsed, ok := parseLooseJSON(observation); ok {
			obj = mapValue(parsed)
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
	text := strings.TrimSpace(stripSemanticControlContracts(firstNonEmpty(node.Text, node.Summary)))
	if text != "" {
		if preview, hidden := collapseForPreview(text, c.app.Theme.CollapseThreshold); hidden > 0 || strings.Contains(preview, "Ctrl+E") {
			refs = append(refs, bulkyPartRef{
				messageID: "execution:" + turnID,
				partID:    executionNodeDetailID(node, "report"),
				title:     firstNonEmpty(node.Agent, "expert") + " report",
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
	text := strings.TrimSpace(stringValue(value))
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
		title:     title + " · " + firstNonEmpty(toolDisplayName(node.ToolName), node.ToolName, node.Agent, "execution"),
		fullText:  text,
	}, true
}

func executionNodeDetailID(node executionTimelineNode, suffix string) string {
	parts := []string{string(node.Kind), node.Agent, node.ToolName, fmt.Sprint(node.StepIndex), suffix}
	return strings.Join(parts, ":")
}
