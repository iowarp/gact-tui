package ui

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (a *App) renderProjectedExecutionConversation(t Theme, width int) (string, bool) {
	turns := a.projectedExecutionTurnsForCurrentSession()
	if len(turns) == 0 {
		return "", false
	}
	var rows []string
	var prev *gact.Message
	turnByID := map[string][]executionTimelineNode{}
	var unscoped [][]executionTimelineNode
	supplementsByTurn := a.executionAssistantSupplementNodesByTurn()
	for _, turn := range turns {
		if turn.TurnID == "" {
			unscoped = append(unscoped, turn.Nodes)
			continue
		}
		turnByID[turn.TurnID] = turn.Nodes
	}
	unscopedIdx := 0
	for msgIdx, m := range a.messages {
		if m.Role != gact.RoleUser {
			continue
		}
		turnID := messageTurnID(m)
		rendered := t.renderMessageInContextWithResults(m, prev, width, nil)
		if strings.TrimSpace(rendered) != "" {
			rows = append(rows, rendered)
		}
		nodes := turnByID[turnID]
		if len(nodes) == 0 && unscopedIdx < len(unscoped) {
			nodes = unscoped[unscopedIdx]
			unscopedIdx++
		}
		if supplements := supplementsByTurn[turnID]; len(supplements) > 0 {
			nodes = append(nodes, executionDedupSupplementNodes(nodes, supplements)...)
		}
		if len(nodes) > 0 {
			msg := gact.Message{Role: gact.RoleAssistant}
			header := t.renderMessageHeader(msg)
			if a.projectedExecutionTurnSelected(msgIdx) {
				header = t.renderProjectedExecutionSelectionMarker() + header
			}
			rows = append(rows, lipgloss.JoinVertical(lipgloss.Left,
				header,
				t.renderExecutionTimeline(nodes, width),
				"",
			))
		}
		prev = &m
	}
	for ; unscopedIdx < len(unscoped); unscopedIdx++ {
		msg := gact.Message{Role: gact.RoleAssistant}
		rows = append(rows, lipgloss.JoinVertical(lipgloss.Left,
			t.renderMessageHeader(msg),
			t.renderExecutionTimeline(unscoped[unscopedIdx], width),
			"",
		))
	}
	return strings.Join(rows, "\n"), true
}

func (a *App) projectedExecutionTurnSelected(userMsgIdx int) bool {
	if a.focus != FocusBody || a.bodySelMsgIdx < 0 || userMsgIdx < 0 {
		return false
	}
	nextUser := len(a.messages)
	for i := userMsgIdx + 1; i < len(a.messages); i++ {
		if a.messages[i].Role == gact.RoleUser {
			nextUser = i
			break
		}
	}
	return a.bodySelMsgIdx >= userMsgIdx && a.bodySelMsgIdx < nextUser
}

func (t Theme) renderProjectedExecutionSelectionMarker() string {
	return lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("▌ ")
}

func (a *App) executionAssistantSupplementNodesByTurn() map[string][]executionTimelineNode {
	out := map[string][]executionTimelineNode{}
	currentTurnID := ""
	for _, msg := range a.messages {
		switch msg.Role {
		case gact.RoleUser:
			currentTurnID = messageTurnID(msg)
		case gact.RoleAssistant:
			turnID := firstNonEmpty(messageTurnID(msg), currentTurnID)
			if turnID == "" {
				continue
			}
			nodes := executionAssistantSupplementNodes(msg)
			if len(nodes) > 0 {
				out[turnID] = append(out[turnID], nodes...)
			}
		}
	}
	return out
}

func executionAssistantSupplementNodes(msg gact.Message) []executionTimelineNode {
	var nodes []executionTimelineNode
	for _, part := range msg.Parts {
		switch part.Type {
		case gact.PartTypeText:
			text := strings.TrimSpace(stripSemanticControlContracts(part.Text))
			if text != "" && executionSupplementCarriesArtifact(text) {
				nodes = append(nodes, executionTimelineNode{
					Kind:  executionNodeAssistantText,
					Agent: "main",
					Depth: 0,
					Text:  text,
				})
			}
		case gact.PartTypeExpertHandoff:
			node := executionExpertHandoffSupplementNode(part)
			if !executionNodeIsEmpty(node) {
				nodes = append(nodes, node)
			}
		case gact.PartTypeImage:
			if text := executionImagePartPreview(part); text != "" {
				nodes = append(nodes, executionTimelineNode{
					Kind:  executionNodeExpertReport,
					Agent: "artifact",
					Depth: 1,
					Text:  text,
				})
			}
		}
	}
	return nodes
}

func executionExpertHandoffSupplementNode(part gact.Part) executionTimelineNode {
	agent := firstNonEmpty(
		stringValue(part.Metadata["agent_id"]),
		stringValue(part.Metadata["delegate_to"]),
		"expert",
	)
	parent := firstNonEmpty(stringValue(part.Metadata["parent_id"]), stringValue(part.Metadata["parent"]))
	text := strings.TrimSpace(part.Text)
	node := executionTimelineNode{
		Kind:        executionNodeExpertReport,
		Agent:       agent,
		ParentAgent: parent,
		Depth:       timelineAgentDepth(agent),
		Text:        text,
		Structured: firstNonNil(
			part.Metadata["structured"],
			executionRetainedWorkflowStateFromText(text),
			part.Metadata["workflow_state"],
		),
	}
	preview := executionExpertReportPreview(node)
	if preview == "" {
		preview = strings.TrimSpace(stripSemanticControlContracts(text))
	}
	if executionPlaceholderAssistantText(preview) {
		return executionTimelineNode{}
	}
	if !executionSupplementCarriesArtifact(preview) {
		return executionTimelineNode{}
	}
	node.Text = preview
	return node
}

func executionImagePartPreview(part gact.Part) string {
	title := firstNonEmpty(part.Title, stringValue(part.Metadata["title"]), "image artifact")
	path := firstNonEmpty(part.URI, stringValue(part.Metadata["path"]), stringValue(part.Metadata["artifact_path"]))
	if path == "" {
		return title
	}
	return title + "\n" + shortenPathForInline(path) + "\nCtrl+E full image"
}

func executionSupplementCarriesArtifact(text string) bool {
	lower := strings.ToLower(text)
	for _, needle := range []string{".png", ".jpg", ".jpeg", ".gif", ".svg", "plot", "artifact", "full image"} {
		if strings.Contains(lower, needle) {
			return true
		}
	}
	return false
}

func executionRetainedWorkflowStateFromText(text string) any {
	for _, marker := range []string{
		"Retained typed workflow state:",
		"CLIO durable typed workflow state:",
		"CLIO merged nested typed workflow state:",
		"CLIO typed workflow state:",
	} {
		idx := strings.LastIndex(strings.ToLower(text), strings.ToLower(marker))
		if idx < 0 {
			continue
		}
		tail := text[idx+len(marker):]
		brace := strings.Index(tail, "{")
		if brace < 0 {
			continue
		}
		if parsed, ok := parseLooseJSON(tail[brace:]); ok {
			return parsed
		}
	}
	return nil
}

func executionDedupSupplementNodes(existing, supplements []executionTimelineNode) []executionTimelineNode {
	if len(supplements) == 0 {
		return nil
	}
	var haystack strings.Builder
	for _, node := range existing {
		haystack.WriteString(" ")
		haystack.WriteString(executionNodeComparableText(node))
	}
	existingText := normalizeExecutionComparable(haystack.String())
	var out []executionTimelineNode
	for _, node := range supplements {
		text := normalizeExecutionComparable(executionNodeComparableText(node))
		if text == "" {
			continue
		}
		if strings.Contains(existingText, text) {
			continue
		}
		out = append(out, node)
		existingText += " " + text
	}
	return out
}

func executionNodeComparableText(node executionTimelineNode) string {
	return firstNonEmpty(node.Text, node.Summary, node.Question, node.Thinking)
}

func normalizeExecutionComparable(text string) string {
	return strings.ToLower(strings.Join(strings.Fields(stripSemanticControlContracts(text)), " "))
}

func executionPlaceholderAssistantText(text string) bool {
	normalized := strings.ToLower(strings.Join(strings.Fields(stripSemanticControlContracts(text)), " "))
	if normalized == "" {
		return false
	}
	if strings.Contains(normalized, "no answer yet") {
		return true
	}
	return strings.Contains(normalized, "awaiting geospatial resolution") ||
		strings.Contains(normalized, "awaiting data acquisition") ||
		strings.Contains(normalized, "awaiting synthesis")
}

func (a *App) projectedExecutionTurnsForCurrentSession() []executionProjectedTurn {
	sid := a.currentSessionID()
	if sid == "" || len(a.executionEventsBySession) == 0 {
		return nil
	}
	events := a.executionEventsBySession[sid]
	if !executionEventsHaveTrajectory(events) {
		return nil
	}
	turns := projectExecutionTimelineTurns(events)
	out := turns[:0]
	for _, turn := range turns {
		filtered := turn.Nodes[:0]
		for _, node := range turn.Nodes {
			if executionNodeIsEmpty(node) {
				continue
			}
			filtered = append(filtered, node)
		}
		if len(filtered) == 0 {
			continue
		}
		turn.Nodes = filtered
		out = append(out, turn)
	}
	return out
}

func (a *App) currentSessionHasProjectedExecution() bool {
	sid := a.currentSessionID()
	if sid == "" || len(a.executionEventsBySession) == 0 {
		return false
	}
	return executionEventsHaveTrajectory(a.executionEventsBySession[sid])
}

func (a *App) projectedExecutionNodesForCurrentSession() []executionTimelineNode {
	sid := a.currentSessionID()
	if sid == "" || len(a.executionEventsBySession) == 0 {
		return nil
	}
	events := a.executionEventsBySession[sid]
	if !executionEventsHaveTrajectory(events) {
		return nil
	}
	nodes := projectExecutionTimeline(events)
	filtered := nodes[:0]
	for _, node := range nodes {
		if executionNodeIsEmpty(node) {
			continue
		}
		filtered = append(filtered, node)
	}
	return filtered
}

func executionEventsHaveTrajectory(events []executionTimelineEvent) bool {
	for _, event := range events {
		switch event.Type {
		case "react.step.completed", "expert.extract.completed", "blueprint.delegation.started":
			return true
		}
	}
	return false
}

func executionNodeIsEmpty(node executionTimelineNode) bool {
	switch node.Kind {
	case executionNodeAssistantText:
		return strings.TrimSpace(node.Text) == ""
	case executionNodeHandoff:
		return strings.TrimSpace(node.Agent) == "" && strings.TrimSpace(node.Question) == ""
	case executionNodeReactStep:
		return strings.TrimSpace(node.Thinking) == "" &&
			strings.TrimSpace(node.ToolName) == "" &&
			node.Observation == nil
	case executionNodeExpertReport:
		return strings.TrimSpace(node.Text) == "" && node.Structured == nil
	case executionNodeToolRun:
		return strings.TrimSpace(node.ToolName) == "" && node.Observation == nil
	default:
		return true
	}
}

func (t Theme) renderExecutionTimeline(nodes []executionTimelineNode, width int) string {
	var rows []string
	for i, node := range nodes {
		if i > 0 && executionNodeNeedsGap(nodes[i-1], node) {
			rows = append(rows, "")
		}
		if rendered := t.renderExecutionNode(node, width); rendered != "" {
			rows = append(rows, rendered)
		}
	}
	return strings.Join(rows, "\n")
}

func executionNodeNeedsGap(prev, cur executionTimelineNode) bool {
	if prev.Kind == executionNodeAssistantText || cur.Kind == executionNodeAssistantText {
		return true
	}
	if prev.Kind == executionNodeExpertReport || cur.Kind == executionNodeExpertReport {
		return true
	}
	return prev.Agent != cur.Agent
}

func (t Theme) renderExecutionNode(node executionTimelineNode, width int) string {
	indent := executionIndent(node.Depth)
	bodyW := width - lipgloss.Width(indent)
	if bodyW < 24 {
		bodyW = 24
	}
	switch node.Kind {
	case executionNodeAssistantText:
		return t.renderExecutionAgentBlock(node.Agent, node.Text, node.Depth, bodyW)
	case executionNodeHandoff:
		return t.renderExecutionHandoff(node, bodyW)
	case executionNodeReactStep:
		return t.renderExecutionReactStep(node, bodyW)
	case executionNodeToolRun:
		return t.renderExecutionToolRun(node, bodyW)
	case executionNodeExpertReport:
		return t.renderExecutionExpertReport(node, bodyW)
	default:
		return ""
	}
}

func (t Theme) renderExecutionAgentBlock(agent, text string, depth int, width int) string {
	agent = firstNonEmpty(strings.TrimSpace(agent), "main")
	indent := executionIndent(depth)
	label := indent + renderAgentName(t, agent)
	body := executionDisplayProse(text)
	if executionPlaceholderAssistantText(body) {
		return ""
	}
	if preview := executionAgentTextStructuredPreview(agent, body); preview != "" {
		body = preview
	}
	if body == "" {
		return label
	}
	body = wrap(body, width-2)
	return lipgloss.JoinVertical(lipgloss.Left, label, indentText(body, indent+"  "))
}

func executionAgentTextStructuredPreview(agent, text string) string {
	parsed, ok := parseLooseJSON(text)
	if !ok {
		return ""
	}
	obj := mapValue(parsed)
	if len(obj) == 0 {
		return ""
	}
	if !executionLooksLikeWorkflowControlJSON(obj) {
		return ""
	}
	if preview := executionWorkflowStatePreview(agent, obj); preview != "" {
		return preview
	}
	return executionStructuredMapPreview(agent, obj)
}

func executionLooksLikeWorkflowControlJSON(obj map[string]any) bool {
	for _, key := range []string{
		"workflow_state",
		"catalog",
		"acquisition",
		"resource_candidate",
		"station_catalog",
		"profile",
		"artifact",
		"plot",
	} {
		if _, ok := obj[key]; ok {
			return true
		}
	}
	return false
}

func (t Theme) renderExecutionHandoff(node executionTimelineNode, width int) string {
	indent := executionIndent(node.Depth)
	parent := firstNonEmpty(node.ParentAgent, "main")
	child := firstNonEmpty(node.Agent, "expert")
	head := indent + lipgloss.NewStyle().Foreground(agentColor(t, child)).Bold(true).Render("↳ ") +
		renderAgentName(t, parent) + lipgloss.NewStyle().Foreground(t.FgMuted).Render(" → ") + renderAgentName(t, child)
	question := strings.TrimSpace(node.Question)
	if semanticPreviewIsRedacted(question) {
		question = ""
	}
	if question == "" {
		return head
	}
	return lipgloss.JoinVertical(lipgloss.Left, head, indentText(wrap(executionDisplayProse(question), width-2), indent+"  "))
}

func (t Theme) renderExecutionReactStep(node executionTimelineNode, width int) string {
	contentIndent := executionContentIndent(node.Depth)
	var rows []string
	if thinking := strings.TrimSpace(node.Thinking); thinking != "" && !semanticPreviewIsRedacted(thinking) {
		thinking = strings.TrimSpace(stripExecutionControlSections(thinking))
		if thinking != "" {
			if node.Reasoning != "" {
				thinking = strings.TrimSpace(thinking) + lipgloss.NewStyle().Foreground(t.FgFaint).Render(" · Ctrl+E reasoning trace")
			}
			rows = append(rows, indentText(wrap(thinking, width-lipgloss.Width(contentIndent)), contentIndent))
		}
	}
	if strings.TrimSpace(node.ToolName) != "" && !node.IsFinish {
		rows = append(rows, contentIndent+t.executionToolCallLine(node.ToolName, node.ToolArgs, width-lipgloss.Width(contentIndent)))
		if observation := t.executionObservationPreview(node.ToolName, node.Observation); observation != "" {
			rows = append(rows, indentText(t.executionObservationBlock(observation), contentIndent+"  "))
		}
	}
	if node.IsFinish {
		if observation := executionFinishPreview(node); observation != "" {
			rows = append(rows, indentText(observation, contentIndent))
		}
	}
	return strings.Join(rows, "\n")
}

func (t Theme) renderExecutionToolRun(node executionTimelineNode, width int) string {
	if node.Status == "running" {
		return ""
	}
	contentIndent := executionContentIndent(node.Depth)
	var rows []string
	rows = append(rows, contentIndent+t.executionToolCallLine(node.ToolName, node.ToolArgs, width-lipgloss.Width(contentIndent)))
	if observation := t.executionObservationPreview(node.ToolName, node.Observation); observation != "" {
		rows = append(rows, indentText(t.executionObservationBlock(observation), contentIndent+"  "))
	}
	return strings.Join(rows, "\n")
}

func (t Theme) renderExecutionExpertReport(node executionTimelineNode, width int) string {
	indent := executionIndent(node.Depth)
	agent := firstNonEmpty(node.Agent, "expert")
	head := indent + renderAgentName(t, agent) + lipgloss.NewStyle().Foreground(t.FgMuted).Render(" returned evidence")
	report := executionExpertReportPreview(node)
	if report == "" {
		report = executionDisplayProse(firstNonEmpty(node.Text, node.Summary))
	}
	if report == "" {
		return head
	}
	return lipgloss.JoinVertical(lipgloss.Left, head, indentText(wrap(report, width-2), indent+"  "))
}

func executionDisplayProse(text string) string {
	text = stripExecutionControlSections(stripSemanticControlContracts(text))
	text = strings.ReplaceAll(text, "\u00a0", " ")
	text = strings.ReplaceAll(text, "**", "")
	text = strings.ReplaceAll(text, "`", "")
	lines := strings.Split(strings.TrimSpace(text), "\n")
	for i := range lines {
		lines[i] = strings.TrimRight(lines[i], " ")
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func (t Theme) executionToolCallLine(toolName string, args any, width int) string {
	name := firstNonEmpty(toolDisplayName(toolName), toolName, "tool")
	nameStyle := lipgloss.NewStyle().Foreground(t.RoleTool).Bold(true)
	if argsText := executionArgsPreview(args); argsText != "" {
		plain := name + "(" + argsText + ")"
		if lipgloss.Width(plain) > width {
			keep := max(1, width-lipgloss.Width(name)-3)
			argsText = truncateString(argsText, keep)
		}
		return nameStyle.Render(name) +
			lipgloss.NewStyle().Foreground(t.FgMuted).Render("(") +
			lipgloss.NewStyle().Foreground(t.Fg).Render(argsText) +
			lipgloss.NewStyle().Foreground(t.FgMuted).Render(")")
	}
	return nameStyle.Render(truncateString(name, width))
}

func (t Theme) executionObservationBlock(observation string) string {
	glyph := lipgloss.NewStyle().Foreground(t.RoleTool).Bold(true).Render("⎿")
	return indentWithGlyph(observation, glyph, " ")
}

func executionArgsPreview(args any) string {
	obj := mapValue(args)
	if len(obj) == 0 {
		if text := strings.TrimSpace(stringValue(args)); text != "" && !semanticPreviewIsRedacted(text) {
			return truncateString(strings.Join(strings.Fields(text), " "), 140)
		}
		return ""
	}
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var parts []string
	for _, key := range keys {
		value := executionCompactValue(obj[key])
		if value == "" || semanticPreviewIsRedacted(value) {
			continue
		}
		parts = append(parts, key+": "+value)
	}
	return truncateString(strings.Join(parts, " · "), 180)
}

func executionCompactValue(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(v)
	case []any:
		items := make([]string, 0, len(v))
		for _, item := range v {
			text := executionCompactValue(item)
			if text != "" {
				items = append(items, text)
			}
		}
		return strings.Join(items, ", ")
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func (t Theme) executionObservationPreview(toolName string, observation any) string {
	if observation == nil {
		return ""
	}
	if preview := executionSpecificObservationPreview(toolName, observation, t.CollapseThreshold); preview != "" {
		return preview
	}
	text := toolEvidenceResultText(toolName, observation)
	if raw := strings.TrimSpace(stringValue(observation)); raw != "" {
		if preview := executionSpecificTextObservationPreview(toolName, raw); preview != "" {
			return preview
		}
		if summary := summarizeNonJSONToolResultText(toolName, raw); summary != "" {
			text = summary
		}
	}
	if parsed, ok := parseLooseJSON(observation); ok {
		if preview := executionSpecificObservationPreview(toolName, parsed, t.CollapseThreshold); preview != "" {
			return preview
		}
		if summary := toolEvidenceResultText(toolName, parsed); summary != "" {
			text = summary
		}
		if artifact := executionArtifactPreview(parsed); artifact != "" && (summaryLooksLikeRawJSON(text) || text == "") {
			text = artifact
		}
	}
	text = strings.TrimSpace(stripSemanticControlContracts(text))
	if semanticPreviewIsRedacted(text) || executionObservationIsNoise(text) {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(toolName)), "ndp_search") {
		if csv := firstCSVName(text); csv != "" {
			return csv
		}
	}
	visible, hidden := collapseForPreview(text, max(1, t.CollapseThreshold))
	if hidden > 0 {
		visible += "\nCtrl+E full output"
	}
	return visible
}

func executionSpecificObservationPreview(toolName string, observation any, threshold int) string {
	obj := mapValue(observation)
	if len(obj) == 0 {
		return ""
	}
	lowerTool := strings.ToLower(strings.TrimSpace(toolName))
	switch {
	case strings.Contains(lowerTool, "geo_geocode"):
		return executionGeocodeObservationPreview(obj)
	case strings.Contains(lowerTool, "ndp_search"):
		return executionNDPSearchObservationPreview(obj, threshold)
	case strings.Contains(lowerTool, "filter_points") || strings.Contains(lowerTool, "points_by_radius"):
		return executionPointRankingPreview(obj, threshold)
	case strings.HasPrefix(lowerTool, "ndp_stage"):
		return executionStagedResourcePreview(obj, threshold)
	case lowerTool == "shell_bash":
		return executionShellObservationPreview(obj, threshold)
	case strings.Contains(lowerTool, "plot") || strings.Contains(lowerTool, "chart") || strings.Contains(lowerTool, "visual"):
		return executionPlotObservationPreview(obj)
	default:
		return ""
	}
}

func executionSpecificTextObservationPreview(toolName string, raw string) string {
	lowerTool := strings.ToLower(strings.TrimSpace(toolName))
	if strings.Contains(lowerTool, "geo_geocode") {
		return executionGeocodeTextPreview(raw)
	}
	return ""
}

func executionGeocodeObservationPreview(obj map[string]any) string {
	name := executionFirstScalarValue(obj, "display_name", "name", "label")
	lat := executionFirstScalarValue(obj, "lat", "latitude", "center_lat")
	lon := executionFirstScalarValue(obj, "lon", "longitude", "center_lon")
	source := executionFirstScalarValue(obj, "provenance", "source")
	var rows []string
	if name != "" {
		rows = append(rows, name)
	}
	if lat != "" && lon != "" {
		rows = append(rows, "center "+lat+", "+lon)
	}
	if source != "" {
		rows = append(rows, "source "+source)
	}
	return strings.Join(rows, "\n")
}

func executionGeocodeTextPreview(raw string) string {
	name := executionRegexValue(raw, `['"]display_name['"]\s*:\s*['"]([^'"]+)['"]`)
	lat := executionRegexValue(raw, `['"]lat['"]\s*:\s*([\-0-9.]+)`)
	lon := executionRegexValue(raw, `['"]lon['"]\s*:\s*([\-0-9.]+)`)
	source := executionRegexValue(raw, `['"]provenance['"]\s*:\s*['"]([^'"]+)['"]`)
	var rows []string
	if name != "" {
		rows = append(rows, name)
	}
	if lat != "" && lon != "" {
		rows = append(rows, "center "+lat+", "+lon)
	}
	if source != "" {
		rows = append(rows, "source "+source)
	}
	return strings.Join(rows, "\n")
}

func executionRegexValue(raw string, pattern string) string {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return ""
	}
	matches := re.FindStringSubmatch(raw)
	if len(matches) < 2 {
		return ""
	}
	return strings.TrimSpace(matches[1])
}

func executionNDPSearchObservationPreview(obj map[string]any, threshold int) string {
	datasets, _ := obj["datasets"].([]any)
	if len(datasets) == 0 {
		if nested := mapValue(obj["datasets"]); len(nested) > 0 {
			datasets, _ = nested["items"].([]any)
		}
	}
	if len(datasets) == 0 {
		return ""
	}
	limit := min(max(1, threshold), 3)
	var rows []string
	for _, rawDataset := range datasets {
		dataset := mapValue(rawDataset)
		resources, _ := dataset["resources"].([]any)
		for _, rawResource := range resources {
			resource := mapValue(rawResource)
			name := executionFirstScalarValue(resource, "name", "title")
			format := strings.ToLower(executionFirstScalarValue(resource, "format"))
			if name == "" || (format != "" && format != "csv" && !strings.HasSuffix(strings.ToLower(name), ".csv")) {
				continue
			}
			rows = append(rows, name)
			if len(rows) >= limit {
				break
			}
		}
		if len(rows) >= limit {
			break
		}
	}
	if len(rows) == 0 {
		for i, rawDataset := range datasets {
			if i >= limit {
				break
			}
			dataset := mapValue(rawDataset)
			if name := executionFirstScalarValue(dataset, "title", "name", "id"); name != "" {
				rows = append(rows, name)
			}
		}
	}
	total := len(datasets)
	if count, ok := firstNumericValue(obj, "count", "total_found"); ok && count > float64(total) {
		total = int(count)
	}
	if total > len(rows) {
		rows = append(rows, "Ctrl+E full output")
	}
	return strings.Join(rows, "\n")
}

func executionPointRankingPreview(obj map[string]any, threshold int) string {
	count := firstNonEmpty(executionFirstScalarValue(obj, "within_radius_count"), executionFirstScalarValue(obj, "count"))
	radius := executionFirstScalarValue(obj, "radius_km")
	var rows []string
	if count != "" {
		line := count + " stations within radius"
		if radius != "" {
			line += " (" + radius + " km)"
		}
		rows = append(rows, line)
	}
	points, _ := obj["points"].([]any)
	limit := min(max(1, threshold), 3)
	for i, raw := range points {
		if i >= limit {
			break
		}
		point := mapValue(raw)
		id := firstStringValueFold(point, "site", "station", "station_id", "id", "name")
		if id == "" {
			continue
		}
		if distance, ok := firstNumericValue(point, "distance_km", "distance"); ok {
			rows = append(rows, id+" "+formatCompactFloat(distance)+" km")
		} else {
			rows = append(rows, id)
		}
	}
	if len(points) > limit {
		rows = append(rows, "Ctrl+E full output")
	}
	return strings.Join(rows, "\n")
}

func executionStagedResourcePreview(obj map[string]any, threshold int) string {
	path := executionFirstScalarValue(obj, "local_path", "path", "output_path", "artifact_path")
	if path == "" {
		return ""
	}
	rows := []string{executionPathWithSize(path, executionFirstScalarValue(obj, "size_bytes", "bytes"))}
	if strings.EqualFold(executionFirstScalarValue(obj, "content_type"), "text/csv") || strings.HasSuffix(strings.ToLower(path), ".csv") {
		if preview := executionFileHeadPreview(path, threshold); preview != "" {
			rows = append(rows, strings.Split(preview, "\n")...)
			rows = append(rows, "Ctrl+E full preview")
		}
	}
	return strings.Join(rows, "\n")
}

func executionShellObservationPreview(obj map[string]any, threshold int) string {
	command := executionFirstScalarValue(obj, "command")
	exitCode := executionFirstScalarValue(obj, "exit_code")
	stdout := strings.TrimSpace(executionFirstScalarValue(obj, "stdout"))
	stderr := strings.TrimSpace(executionFirstScalarValue(obj, "stderr"))
	if dst := executionRedirectDestination(command); dst != "" {
		rows := []string{"prepared " + filepath.Base(dst)}
		if diff := executionRedirectDiffPreview(command, dst, threshold); diff != "" {
			rows = append(rows, strings.Split(diff, "\n")...)
			rows = append(rows, "Ctrl+E full diff")
		}
		return strings.Join(rows, "\n")
	}
	if stdout != "" {
		visible, hidden := collapseForPreview(stdout, max(1, threshold))
		if hidden > 0 {
			visible += "\nCtrl+E full output"
		}
		return visible
	}
	if stderr != "" {
		return "stderr: " + stderr
	}
	if exitCode != "" && exitCode != "0" {
		return "exit_code " + exitCode
	}
	return ""
}

func executionPlotObservationPreview(obj map[string]any) string {
	path := executionFirstScalarValue(obj, "output_path", "artifact_path", "path", "file_path")
	if path == "" {
		return ""
	}
	rows := []string{shortenPathForInline(path)}
	if plotType := executionFirstScalarValue(obj, "plot_type", "chart_type"); plotType != "" {
		rows = append(rows, "chart "+plotType)
	}
	if x := executionFirstScalarValue(obj, "x_column"); x != "" {
		rows = append(rows, "x "+x)
	}
	if y := summarizeNamedItems(obj, "y_columns", "y_column"); y != "" {
		rows = append(rows, "y "+y)
	}
	if n := executionFirstScalarValue(obj, "data_points"); n != "" {
		rows = append(rows, n+" rows")
	}
	rows = append(rows, "Ctrl+E full image")
	return strings.Join(rows, "\n")
}

func executionPathWithSize(path, size string) string {
	line := filepath.Base(path)
	if strings.TrimSpace(line) == "" {
		line = shortenPathForInline(path)
	}
	if size != "" {
		line += " · " + size + " bytes"
	}
	return line
}

func executionFirstScalarValue(result map[string]any, keys ...string) string {
	for _, key := range keys {
		value := result[key]
		switch typed := value.(type) {
		case nil:
			continue
		case string:
			if text := strings.TrimSpace(typed); text != "" {
				return text
			}
		case float64:
			return formatCompactFloat(typed)
		case float32:
			return formatCompactFloat(float64(typed))
		case int:
			return fmt.Sprintf("%d", typed)
		case int64:
			return fmt.Sprintf("%d", typed)
		case json.Number:
			if f, err := typed.Float64(); err == nil {
				return formatCompactFloat(f)
			}
			if text := strings.TrimSpace(typed.String()); text != "" {
				return text
			}
		case bool:
			return fmt.Sprintf("%t", typed)
		default:
			text := strings.TrimSpace(fmt.Sprint(typed))
			if text != "" {
				return text
			}
		}
	}
	return ""
}

func executionFileHeadPreview(path string, threshold int) string {
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return ""
	}
	lines := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
	var rows []string
	limit := min(max(2, threshold), 4)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		rows = append(rows, truncateString(line, 88))
		if len(rows) >= limit {
			break
		}
	}
	return strings.Join(rows, "\n")
}

func executionRedirectDestination(command string) string {
	parts := strings.Split(command, ">")
	if len(parts) < 2 {
		return ""
	}
	return strings.Trim(strings.TrimSpace(parts[len(parts)-1]), `"'`)
}

func executionRedirectSource(command string) string {
	before, _, ok := strings.Cut(command, ">")
	if !ok {
		return ""
	}
	quoted := executionQuotedPaths(before)
	if len(quoted) > 0 {
		return quoted[len(quoted)-1]
	}
	fields := strings.Fields(before)
	if len(fields) == 0 {
		return ""
	}
	return strings.Trim(fields[len(fields)-1], `"'`)
}

func executionQuotedPaths(text string) []string {
	var out []string
	for _, quote := range []rune{'\'', '"'} {
		parts := strings.Split(text, string(quote))
		for i := 1; i < len(parts); i += 2 {
			if strings.Contains(parts[i], "/") {
				out = append(out, parts[i])
			}
		}
	}
	return out
}

func executionRedirectDiffPreview(command, dst string, threshold int) string {
	src := executionRedirectSource(command)
	if src == "" {
		return ""
	}
	srcLines := executionFirstNonEmptyLines(src, max(1, threshold))
	dstLines := executionFirstNonEmptyLines(dst, max(1, threshold))
	if len(srcLines) == 0 || len(dstLines) == 0 {
		return ""
	}
	var rows []string
	limit := min(max(1, threshold), 3)
	for i := 0; i < limit && i < len(srcLines); i++ {
		if i < len(dstLines) && srcLines[i] == dstLines[i] {
			continue
		}
		rows = append(rows, "- "+truncateString(srcLines[i], 72))
		if i < len(dstLines) {
			rows = append(rows, "+ "+truncateString(dstLines[i], 72))
		}
	}
	if len(rows) == 0 && len(dstLines) > 0 {
		rows = append(rows, "+ "+truncateString(dstLines[0], 72))
	}
	return strings.Join(rows, "\n")
}

func executionFirstNonEmptyLines(path string, limit int) []string {
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return nil
	}
	var rows []string
	for _, line := range strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		rows = append(rows, line)
		if len(rows) >= limit {
			break
		}
	}
	return rows
}

func executionArtifactPreview(raw any) string {
	obj := mapValue(raw)
	if len(obj) == 0 {
		return ""
	}
	path := firstStringValue(obj, "local_path", "path", "output_path", "artifact_path")
	if path == "" {
		return ""
	}
	var rows []string
	rows = append(rows, shortenPathForInline(path))
	if size := firstStringValue(obj, "size_bytes", "bytes"); size != "" {
		rows[0] += " · " + size + " bytes"
	}
	return strings.Join(rows, "\n")
}

func summaryLooksLikeRawJSON(text string) bool {
	text = strings.TrimSpace(text)
	return strings.HasPrefix(text, "{") || strings.HasPrefix(text, "[")
}

func executionFinishPreview(node executionTimelineNode) string {
	text := strings.TrimSpace(firstNonEmpty(stringValue(node.Observation), node.Summary))
	if executionObservationIsNoise(text) || semanticPreviewIsRedacted(text) {
		return ""
	}
	return text
}

func executionObservationIsNoise(text string) bool {
	normalized := strings.ToLower(strings.Trim(strings.TrimSpace(text), "."))
	switch normalized {
	case "", "completed", "complete", "done", "success", "ok":
		return true
	default:
		return false
	}
}

func executionExpertReportPreview(node executionTimelineNode) string {
	if text := executionWorkflowStatePreview(node.Agent, node.Structured); text != "" {
		return text
	}
	cleanText := stripExecutionControlSections(node.Text)
	if parsed, ok := parseLooseJSON(cleanText); ok {
		if text := executionWorkflowStatePreview(node.Agent, parsed); text != "" {
			return text
		}
		if obj := mapValue(parsed); len(obj) > 0 {
			return executionStructuredMapPreview(node.Agent, obj)
		}
	}
	return ""
}

func stripExecutionControlSections(text string) string {
	text = strings.TrimSpace(text)
	for _, marker := range []string{
		"CLIO typed workflow state:",
		"CLIO durable typed workflow state:",
		"CLIO merged nested typed workflow state:",
		"Retained typed workflow state:",
		"The workflow state is populated accordingly:",
	} {
		if idx := strings.Index(strings.ToLower(text), strings.ToLower(marker)); idx >= 0 {
			text = strings.TrimSpace(text[:idx])
		}
	}
	return stripExecutionControlJSONFences(text)
}

func stripExecutionControlJSONFences(text string) string {
	for {
		start := strings.Index(text, "```")
		if start < 0 {
			return strings.TrimSpace(text)
		}
		afterStart := text[start+3:]
		lineEnd := strings.Index(afterStart, "\n")
		if lineEnd < 0 {
			return strings.TrimSpace(text)
		}
		info := strings.ToLower(strings.TrimSpace(afterStart[:lineEnd]))
		bodyStart := start + 3 + lineEnd + 1
		afterBody := text[bodyStart:]
		endRel := strings.Index(afterBody, "```")
		if endRel < 0 {
			return strings.TrimSpace(text)
		}
		body := afterBody[:endRel]
		end := bodyStart + endRel + 3
		remove := strings.Contains(info, "json") && executionFenceLooksLikeControlJSON(body)
		if !remove {
			next := text[end:]
			rest := stripExecutionControlJSONFences(next)
			return strings.TrimSpace(text[:end] + rest)
		}
		text = strings.TrimSpace(text[:start] + "\n" + text[end:])
	}
}

func executionFenceLooksLikeControlJSON(body string) bool {
	parsed, ok := parseLooseJSON(body)
	if !ok {
		return false
	}
	obj := mapValue(parsed)
	if len(obj) == 0 {
		return false
	}
	return executionLooksLikeWorkflowControlJSON(obj)
}

func executionWorkflowStatePreview(agent string, raw any) string {
	root := mapValue(raw)
	if len(root) == 0 {
		return ""
	}
	state := mapValue(root["workflow_state"])
	if len(state) == 0 {
		if structured := mapValue(root["structured"]); len(structured) > 0 {
			state = mapValue(structured["workflow_state"])
		}
	}
	if len(state) == 0 {
		return executionStructuredMapPreview(agent, root)
	}
	if executionLooksLikeWorkflowControlJSON(state) {
		return executionStructuredMapPreview(agent, state)
	}
	if agentMap := mapValue(state[agent]); len(agentMap) > 0 {
		return executionStructuredMapPreview(agent, agentMap)
	}
	for _, value := range state {
		if obj := mapValue(value); len(obj) > 0 {
			return executionStructuredMapPreview(agent, obj)
		}
	}
	return ""
}

func executionStructuredMapPreview(agent string, obj map[string]any) string {
	var rows []string
	if stationCatalog := mapValue(obj["station_catalog"]); len(stationCatalog) > 0 {
		rows = append(rows, executionStationCatalogPreview(stationCatalog)...)
	}
	if acquisition := mapValue(obj["acquisition"]); len(acquisition) > 0 {
		if status := executionFirstScalarValue(acquisition, "status"); status != "" {
			rows = append(rows, "acquisition "+status)
		}
		if path := executionFirstScalarValue(acquisition, "metadata_path", "local_path", "path"); path != "" {
			rows = append(rows, shortenPathForInline(path))
		}
		if ready := executionFirstScalarValue(acquisition, "analysis_ready"); ready != "" {
			rows = append(rows, "analysis ready "+ready)
		}
	}
	if resource := mapValue(obj["resource_candidate"]); len(resource) > 0 {
		if name := executionFirstScalarValue(resource, "resource_name", "dataset_name"); name != "" {
			rows = append(rows, name)
		}
	}
	if profile := mapValue(obj["profile"]); len(profile) > 0 {
		rows = append(rows, executionProfilePreview(profile)...)
	}
	for _, key := range []string{"artifact", "plot"} {
		if artifact := mapValue(obj[key]); len(artifact) > 0 {
			if kind := executionFirstScalarValue(artifact, "kind", "plot_type", "type"); kind != "" {
				rows = append(rows, kind)
			}
			if path := executionFirstScalarValue(artifact, "path", "local_path", "output_path", "plot_path", "artifact_path"); path != "" {
				rows = append(rows, shortenPathForInline(path))
				if executionPathLooksLikeImage(path) {
					rows = append(rows, "Ctrl+E full image")
				}
			}
			if columns := summarizeNamedItems(artifact, "columns", "y_columns"); columns != "" {
				rows = append(rows, "columns "+columns)
			}
			if status := executionFirstScalarValue(artifact, "status"); status != "" && status != "completed" {
				rows = append(rows, "status "+status)
			}
		}
	}
	if name := executionFirstScalarValue(obj, "region_name", "display_name", "name", "title", "dataset", "station_id", "site"); name != "" {
		rows = append(rows, name)
	}
	if lat := executionFirstScalarValue(obj, "center_lat", "lat", "latitude", "Latitude"); lat != "" {
		if lon := executionFirstScalarValue(obj, "center_lon", "lon", "longitude", "Longitude"); lon != "" {
			rows = append(rows, "center "+lat+", "+lon)
		}
	}
	if path := executionFirstScalarValue(obj, "path", "local_path", "cleaned_path", "output_path", "plot_path", "artifact_path"); path != "" {
		rows = append(rows, shortenPathForInline(path))
	}
	if radius := executionFirstScalarValue(obj, "radius_km"); radius != "" {
		rows = append(rows, "radius "+radius+" km")
	}
	if confidence := executionFirstScalarValue(obj, "confidence"); confidence != "" {
		rows = append(rows, "confidence "+confidence)
	}
	if provenance := executionFirstScalarValue(obj, "provenance", "source"); provenance != "" {
		rows = append(rows, "provenance "+provenance)
	}
	if status := executionFirstScalarValue(obj, "status"); status != "" && status != "completed" {
		rows = append(rows, "status "+status)
	}
	if len(rows) == 0 {
		for _, key := range sortedExecutionMapKeys(obj) {
			text := executionCompactValue(obj[key])
			if text != "" && !semanticPreviewIsRedacted(text) {
				rows = append(rows, key+" "+truncateString(text, 120))
			}
			if len(rows) >= 4 {
				break
			}
		}
	}
	return strings.Join(rows, "\n")
}

func executionProfilePreview(obj map[string]any) []string {
	var rows []string
	if status := executionFirstScalarValue(obj, "status"); status != "" && status != "completed" {
		rows = append(rows, "profile "+status)
	} else {
		rows = append(rows, "profile")
	}
	if path := executionFirstScalarValue(obj, "path", "file_path", "local_path"); path != "" {
		rows = append(rows, shortenPathForInline(path))
	}
	if scanLimited := executionFirstScalarValue(obj, "scan_limited", "profile_limited"); scanLimited != "" {
		rows = append(rows, "scan limited "+scanLimited)
	}
	return rows
}

func executionStationCatalogPreview(obj map[string]any) []string {
	var rows []string
	if count := executionFirstScalarValue(obj, "candidate_count", "count"); count != "" {
		rows = append(rows, count+" candidate stations")
	}
	if status := executionFirstScalarValue(obj, "status"); status != "" && status != "completed" {
		rows = append(rows, "status "+status)
	}
	ids, _ := obj["station_ids"].([]any)
	limit := min(3, len(ids))
	for i := 0; i < limit; i++ {
		id := strings.TrimSpace(stringValue(ids[i]))
		if id != "" {
			rows = append(rows, id)
		}
	}
	if len(ids) > limit {
		rows = append(rows, "Ctrl+E full output")
	}
	return rows
}

func executionPathLooksLikeImage(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp":
		return true
	default:
		return false
	}
}

func parseLooseJSON(raw any) (any, bool) {
	text := strings.TrimSpace(stringValue(raw))
	if text == "" {
		return nil, false
	}
	var parsed any
	if err := json.Unmarshal([]byte(text), &parsed); err == nil {
		return parsed, true
	}
	return nil, false
}

func firstCSVName(text string) string {
	fields := strings.FieldsFunc(text, func(r rune) bool {
		return r == '"' || r == '\'' || r == ',' || r == '[' || r == ']' || r == '{' || r == '}' || r == ':' || r == ' ' || r == '\n' || r == '\t'
	})
	for _, field := range fields {
		field = strings.TrimSpace(field)
		if strings.HasSuffix(strings.ToLower(field), ".csv") {
			return field
		}
	}
	return ""
}

func sortedExecutionMapKeys(obj map[string]any) []string {
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func executionIndent(depth int) string {
	if depth < 0 {
		depth = 0
	}
	return strings.Repeat("  ", depth)
}

func executionContentIndent(depth int) string {
	return executionIndent(depth) + "  "
}

func indentText(text, prefix string) string {
	text = strings.TrimRight(text, "\n")
	if text == "" {
		return ""
	}
	lines := strings.Split(text, "\n")
	for i := range lines {
		lines[i] = prefix + lines[i]
	}
	return strings.Join(lines, "\n")
}
