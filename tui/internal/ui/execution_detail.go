package ui

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (a *App) openExecutionArtifactForSelection() bool {
	ref, ok := a.executionArtifactDetailForSelection()
	if !ok {
		return false
	}
	a.detailView = &ref
	a.detailViewOpen = true
	a.detailScroll = 0
	a.detailWrap = detailWrapCache{}
	return true
}

func (a *App) openExecutionSemanticDetailForSelection() bool {
	turnID := a.executionSelectedTurnID()
	if turnID == "" {
		return false
	}
	sid := a.currentSessionID()
	events := a.executionEventsBySession[sid]
	if len(events) == 0 {
		return false
	}
	var selected []executionTimelineEvent
	for _, event := range events {
		if strings.TrimSpace(event.TurnID) == turnID {
			selected = append(selected, event)
		}
	}
	if len(selected) == 0 {
		return false
	}
	a.detailView = &bulkyPartRef{
		messageID: "execution:" + turnID,
		partID:    "semantic-detail",
		title:     "Execution detail",
		fullText:  executionSemanticDetailText(turnID, sid, selected),
	}
	a.detailViewOpen = true
	a.detailScroll = 0
	a.detailWrap = detailWrapCache{}
	return true
}

func (a *App) executionArtifactDetailForSelection() (bulkyPartRef, bool) {
	turns := a.projectedExecutionTurnsForCurrentSession()
	if len(turns) == 0 {
		return bulkyPartRef{}, false
	}
	targetsByTurn := a.executionArtifactDetailsByTurn(turns)
	if len(targetsByTurn) == 0 {
		return bulkyPartRef{}, false
	}
	if turnID := a.executionSelectedTurnID(); turnID != "" {
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

func executionSemanticDetailText(turnID string, sessionID string, events []executionTimelineEvent) string {
	counts := map[string]int{}
	agents := map[string]bool{}
	for _, event := range events {
		counts[event.Type]++
		if agent := executionEventAgent(event); agent != "" {
			agents[agent] = true
		}
	}
	var rows []string
	rows = appendDetailSection(rows, "Turn",
		detailField{"turn", turnID},
		detailField{"session", sessionID},
		detailField{"events", fmt.Sprintf("%d", len(events))},
		detailField{"agents", strings.Join(sortedExecutionBoolKeys(agents), "\n")},
	)
	var countRows []string
	for _, key := range sortedExecutionIntKeys(counts) {
		countRows = append(countRows, fmt.Sprintf("%s: %d", key, counts[key]))
	}
	rows = appendDetailSection(rows, "Event counts", detailField{"", strings.Join(countRows, "\n")})
	var timelineRows []string
	for _, event := range events {
		timelineRows = append(timelineRows, executionSemanticEventLine(event))
	}
	rows = appendDetailSection(rows, "Timeline", detailField{"", strings.Join(timelineRows, "\n")})
	return strings.Join(rows, "\n")
}

func executionSemanticEventLine(event executionTimelineEvent) string {
	parts := []string{fmt.Sprintf("%04d", event.Sequence), event.Type}
	if agent := executionEventAgent(event); agent != "" {
		parts = append(parts, agent)
	}
	switch event.Type {
	case "react.step.completed":
		payload := mapValue(event.Payload["payload"])
		if tool := stringValue(payload["tool_name"]); tool != "" {
			parts = append(parts, tool)
		}
	case "blueprint.delegation.started", "blueprint.delegation.completed":
		payload := mapValue(event.Payload["payload"])
		if child := firstNonEmpty(stringValue(payload["delegate_to"]), stringValue(payload["agent_id"])); child != "" {
			parts = append(parts, "→ "+child)
		}
	case "tool.call.started", "tool.call.completed":
		payload := semanticToolPayload(event.Payload)
		if tool := firstNonEmpty(stringValue(payload["tool"]), stringValue(payload["tool_name"])); tool != "" {
			parts = append(parts, tool)
		}
	}
	if summary := strings.TrimSpace(stringValue(event.Payload["summary"])); summary != "" && !semanticPreviewIsRedacted(summary) {
		parts = append(parts, truncateString(strings.Join(strings.Fields(summary), " "), 120))
	}
	return strings.Join(parts, "  ")
}

func executionEventAgent(event executionTimelineEvent) string {
	payload := mapValue(event.Payload["payload"])
	return firstNonEmpty(
		stringValue(payload["expert_id"]),
		stringValue(payload["parent_id"]),
		stringValue(mapValue(event.Payload["actor"])["agent_id"]),
	)
}

func (a *App) executionSelectedTurnID() string {
	if a.bodySelMsgIdx < 0 || a.bodySelMsgIdx >= len(a.messages) {
		for i := len(a.messages) - 1; i >= 0; i-- {
			if a.messages[i].Role == gact.RoleUser {
				return a.messages[i].ID
			}
		}
		return ""
	}
	for i := a.bodySelMsgIdx; i >= 0; i-- {
		if a.messages[i].Role == gact.RoleUser {
			return a.messages[i].ID
		}
	}
	return ""
}

func sortedExecutionBoolKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedExecutionIntKeys(values map[string]int) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func (a *App) executionArtifactDetailsByTurn(turns []executionProjectedTurn) map[string][]bulkyPartRef {
	out := map[string][]bulkyPartRef{}
	for _, turn := range turns {
		for _, node := range turn.Nodes {
			refs := a.executionArtifactDetailsForNode(turn.TurnID, node)
			if len(refs) == 0 {
				continue
			}
			out[turn.TurnID] = append(out[turn.TurnID], refs...)
		}
	}
	return out
}

func (a *App) executionArtifactDetailsForNode(turnID string, node executionTimelineNode) []bulkyPartRef {
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
		refs = append(refs, a.executionObservationDetailRefs(turnID, node)...)
	case executionNodeExpertReport:
		refs = append(refs, a.executionExpertReportDetailRefs(turnID, node)...)
	}
	return refs
}

func (a *App) executionObservationDetailRefs(turnID string, node executionTimelineNode) []bulkyPartRef {
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
		if ref, ok := a.executionFileArtifactRef(turnID, node, obj, "Plot image"); ok {
			return []bulkyPartRef{ref}
		}
	case strings.HasPrefix(lowerTool, "ndp_stage"):
		if ref, ok := a.executionFileArtifactRef(turnID, node, obj, "Staged resource"); ok {
			return []bulkyPartRef{ref}
		}
	case lowerTool == "shell_bash":
		if ref, ok := a.executionShellDiffRef(turnID, node, obj); ok {
			return []bulkyPartRef{ref}
		}
	}
	if ref, ok := executionJSONOutputRef(turnID, node, "Full output", observation); ok {
		return []bulkyPartRef{ref}
	}
	return nil
}

func (a *App) executionExpertReportDetailRefs(turnID string, node executionTimelineNode) []bulkyPartRef {
	var refs []bulkyPartRef
	for _, raw := range []any{node.Structured, executionRetainedWorkflowStateFromText(node.Text)} {
		for _, path := range executionArtifactPaths(raw) {
			if ref, ok := a.executionLocalFileDetailRef("Artifact · "+filepath.Base(path), path, turnID, executionNodeDetailID(node, path)); ok {
				refs = append(refs, ref)
			}
		}
	}
	text := strings.TrimSpace(stripSemanticControlContracts(firstNonEmpty(node.Text, node.Summary)))
	if text != "" {
		if preview, hidden := collapseForPreview(text, a.Theme.CollapseThreshold); hidden > 0 || strings.Contains(preview, "Ctrl+E") {
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

func (a *App) executionFileArtifactRef(turnID string, node executionTimelineNode, obj map[string]any, titlePrefix string) (bulkyPartRef, bool) {
	path := executionFirstScalarValue(obj, "local_path", "path", "output_path", "artifact_path", "plot_path", "file_path")
	if path == "" {
		return bulkyPartRef{}, false
	}
	title := titlePrefix + " · " + filepath.Base(path)
	return a.executionLocalFileDetailRef(title, path, turnID, executionNodeDetailID(node, path))
}

func (a *App) executionLocalFileDetailRef(title, path, turnID, partID string) (bulkyPartRef, bool) {
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
	oldRoot := a.fileViewerRoot
	a.fileViewerRoot = root
	modes := a.localFileDetailModes(entry, path)
	a.fileViewerRoot = oldRoot
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

func (a *App) executionShellDiffRef(turnID string, node executionTimelineNode, obj map[string]any) (bulkyPartRef, bool) {
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

func executionFullDiff(src, dst string) string {
	output, err := exec.Command("diff", "-u", src, dst).CombinedOutput()
	if len(output) > 0 && (err == nil || strings.TrimSpace(string(output)) != "") {
		return string(output)
	}
	srcData, srcErr := os.ReadFile(src)
	dstData, dstErr := os.ReadFile(dst)
	if srcErr != nil || dstErr != nil {
		return fmt.Sprintf("--- %s\n+++ %s\nerror: source=%v destination=%v", src, dst, srcErr, dstErr)
	}
	return strings.Join([]string{
		"--- " + src,
		"+++ " + dst,
		"- " + strings.TrimRight(string(srcData), "\n"),
		"+ " + strings.TrimRight(string(dstData), "\n"),
	}, "\n")
}

func executionArtifactPaths(raw any) []string {
	var out []string
	var visit func(any)
	visit = func(value any) {
		switch typed := value.(type) {
		case map[string]any:
			for _, key := range []string{"path", "local_path", "output_path", "artifact_path", "plot_path", "file_path", "metadata_path"} {
				if path := strings.TrimSpace(stringValue(typed[key])); path != "" && executionPathLooksLikeArtifact(path) {
					out = append(out, path)
				}
			}
			for _, child := range typed {
				visit(child)
			}
		case []any:
			for _, child := range typed {
				visit(child)
			}
		case string:
			if parsed, ok := parseLooseJSON(typed); ok {
				visit(parsed)
			}
		}
	}
	visit(raw)
	return uniqueExecutionStrings(out)
}

func executionPathLooksLikeArtifact(path string) bool {
	if strings.TrimSpace(path) == "" {
		return false
	}
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".csv", ".tsv", ".txt", ".log", ".json", ".jsonl", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf":
		return true
	default:
		return strings.Contains(path, string(filepath.Separator))
	}
}

func uniqueExecutionStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func executionNodeDetailID(node executionTimelineNode, suffix string) string {
	parts := []string{string(node.Kind), node.Agent, node.ToolName, fmt.Sprint(node.StepIndex), suffix}
	return strings.Join(parts, ":")
}
