package ui

// render_agent_workflow.go renders agent-workflow visuals (agent colors/names, handoff narratives, react thoughts, depth).

import (
	"image/color"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// agentColor picks a palette slot based on a tier-2
// agent id. Lightweight hint — the spec lets backends carry a free-
// form `specialization` string, which we hash into one of three
// accent colours. Unknown ids fall back to the Secondary accent so a
// v0.2 backend that invents new agent ids still renders correctly.
func agentColor(t Theme, agentID string) color.Color {
	switch agentID {
	case "main", "orchestrator":
		return t.Primary
	case "code_expert", "code", "coder", "reviewer":
		return t.Primary
	case "research_expert", "research", "search":
		return t.Warning
	case "data_expert", "data":
		return t.Success
	case "analysis", "seismic_analysis", "sac_format":
		return t.Warning
	case "visualization", "viz":
		return t.Secondary
	case "ndp_catalog", "earthscope_catalog", "geospatial":
		return t.RoleTool
	default:
		return t.Secondary
	}
}

func renderAgentName(t Theme, agentID string) string {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		return ""
	}
	return lipgloss.NewStyle().Foreground(agentColor(t, agentID)).Bold(true).Render(agentID)
}

func renderAgentHandoffNarrative(t Theme, parent, agent, stage, status string, failed bool) string {
	parent = strings.TrimSpace(parent)
	agent = strings.TrimSpace(agent)
	stage = strings.ToLower(strings.TrimSpace(stage))
	status = strings.ToLower(strings.TrimSpace(status))
	parentName := renderAgentName(t, parent)
	agentName := renderAgentName(t, agent)
	switch {
	case failed:
		if parentName != "" && agentName != "" {
			return agentName + " failed while working for " + parentName
		}
		if agentName != "" {
			return agentName + " failed"
		}
	case strings.Contains(stage, "started"):
		if parentName != "" && agentName != "" {
			return parentName + " handed work to " + agentName
		}
		if agentName != "" {
			return agentName + " started"
		}
	case strings.Contains(stage, "completed"):
		if agentName != "" && parentName != "" {
			return agentName + " returned evidence to " + parentName
		}
		if agentName != "" {
			return agentName + " returned evidence"
		}
	case strings.Contains(stage, "resumed"):
		if parentName != "" && agentName != "" {
			return parentName + " resumed after " + agentName
		}
		if parentName != "" {
			return parentName + " resumed"
		}
	case status == "running":
		if parentName != "" && agentName != "" {
			return parentName + " handed work to " + agentName
		}
	}
	if parentName != "" && agentName != "" {
		arrow := lipgloss.NewStyle().Foreground(t.FgFaint).Render(" -> ")
		return parentName + arrow + agentName
	}
	if agentName != "" {
		return agentName
	}
	return renderAgentName(t, "expert")
}

func (t Theme) renderSemanticReactThought(p gact.Part, width int) string {
	thought := strings.TrimSpace(p.Thinking)
	if thought == "" {
		return ""
	}
	agent := valuefmt.FirstNonEmpty(valuefmt.StringValue(p.Metadata["agent_id"]), "expert")
	thought = strings.TrimSpace(stripExecutionControlSections(thought))
	if thought == "" || semanticPreviewIsRedacted(thought) {
		return ""
	}
	prefix := strings.Repeat("  ", clampWorkflowDepth(semanticReactStepDepth(agent, p.Metadata)+1))
	body := executionDisplayProse(thought)
	if reasoning := strings.TrimSpace(valuefmt.StringValue(p.Metadata["reasoning"])); reasoning != "" && !semanticPreviewIsRedacted(reasoning) {
		body += lipgloss.NewStyle().Foreground(t.FgFaint).Render(" · Ctrl+E reasoning trace")
	}
	return executionWrapForPrefix(body, width, prefix)
}

func expertHandoffDepth(parent, agent string, metadata map[string]any) int {
	if metadata != nil {
		if depth, ok := valuefmt.FirstNumericValue(metadata, "depth", "tier"); ok {
			return clampWorkflowDepth(int(depth))
		}
	}
	parent = strings.ToLower(strings.TrimSpace(parent))
	agent = strings.ToLower(strings.TrimSpace(agent))
	if parent == "" || parent == agent {
		return 0
	}
	if workflowRootAgent(parent) {
		return 1
	}
	return 2
}

func semanticReactStepDepth(agent string, metadata map[string]any) int {
	if metadata != nil {
		if depth, ok := valuefmt.FirstNumericValue(metadata, "depth", "tier"); ok {
			return clampWorkflowDepth(int(depth))
		}
	}
	switch strings.ToLower(strings.TrimSpace(agent)) {
	case "", "main", "orchestrator", "root", "default":
		return 0
	case "data", "geospatial", "analysis", "synthesis", "visualization", "station_network_analysis", "earthscope_station_catalog", "gnss_timeseries_analysis", "seismic_event_catalog":
		return 1
	}
	if strings.Contains(agent, "_") {
		return 2
	}
	return 1
}

func toolPartWorkflowPrefix(p gact.Part) string {
	agent := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(p.Metadata["agent_id"]),
		valuefmt.StringValue(p.Metadata["expert"]),
		valuefmt.StringValue(p.Metadata["tool_owner_agent"]),
	)
	parent := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(p.Metadata["parent_id"]),
		valuefmt.StringValue(p.Metadata["parent"]),
	)
	if agent == "" && parent == "" {
		return ""
	}
	depth := expertHandoffDepth(parent, agent, p.Metadata)
	return strings.Repeat("  ", clampWorkflowDepth(depth+1))
}

func workflowRootAgent(agent string) bool {
	switch strings.ToLower(strings.TrimSpace(agent)) {
	case "", "main", "orchestrator", "root", "default":
		return true
	default:
		return false
	}
}

func clampWorkflowDepth(depth int) int {
	if depth < 0 {
		return 0
	}
	if depth > 5 {
		return 5
	}
	return depth
}

func pluralS(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

// markSelectedBlock renders a per-part body-cursor marker.
// Previously only the first line got a `▸ ` prefix, which shifted its
// indentation by 2 cols while continuation rows stayed at col 0 —
// wrapped text reads ragged. Fix: prefix the first line with `▸ ` and
// every continuation line with two matching spaces so the whole
// selected block indents uniformly. The marker itself stays visible
// only on line 0 so the eye catches the start of the block, but the
// indent runs all the way so wrap columns line up.
func markSelectedBlock(rendered string, t Theme) string {
	// Selection cursor uses a vertical bar so it doesn't visually collide
	// with the routing-decision triangle (▸ chat · LM-routed) drawn inside
	// message bodies. Continuation lines get a matching bar without the
	// foreground colour so the eye can still trace the highlighted block.
	marker := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("▌ ")
	cont := lipgloss.NewStyle().Foreground(t.FgFaint).Render("▎ ")
	lines := strings.Split(rendered, "\n")
	if len(lines) == 0 {
		return rendered
	}
	out := make([]string, len(lines))
	for i, l := range lines {
		if i == 0 {
			out[i] = marker + l
		} else {
			out[i] = cont + l
		}
	}
	return strings.Join(out, "\n")
}

func (t Theme) renderToolDetailHint(label string) string {
	text := "detail"
	if strings.TrimSpace(label) != "" {
		text += ": " + strings.TrimSpace(label)
	}
	text += " · Ctrl+E expand"
	return lipgloss.NewStyle().Foreground(t.FgFaint).Render(text)
}
