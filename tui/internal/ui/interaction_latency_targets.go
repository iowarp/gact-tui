package ui

// interaction_latency_targets.go maps hit targets to latency labels and resolves the current TUI surface.

import "strings"

func tuiLatencyTargetLabel(id string) string {
	if id == "" {
		return ""
	}
	switch {
	case id == "input:command":
		return "command chip"
	case id == "input:focus":
		return "message composer"
	case id == "conversation:body:focus":
		return "conversation body"
	case id == "conversation:body:wheel":
		return "conversation scroll area"
	case strings.HasPrefix(id, "conversation:detail:"):
		return "message detail affordance"
	case id == "conversation:copy:selected-block":
		return "selected block copy"
	case id == "conversation:copy:full-conversation":
		return "full conversation copy"
	case strings.HasPrefix(id, "conversation:part:"):
		return "message block"
	case id == "detail:copy":
		return "detail copy"
	case id == "sidebar:copy:session-id":
		return "session id copy"
	case strings.HasPrefix(id, "sidebar:session:"):
		return "session row"
	case strings.HasPrefix(id, "sidebar:context:file:"):
		return "context file"
	case strings.HasPrefix(id, "right-sidebar:files:item:"):
		return "file tree row"
	case strings.HasPrefix(id, "right-sidebar:context:file:"):
		return "context file"
	case strings.HasPrefix(id, "right-sidebar:agents:item:"):
		return "agent row"
	case strings.HasPrefix(id, "metrics:tui-latency:"):
		return "TUI latency row"
	case strings.HasPrefix(id, "metrics:latency:"):
		return "API latency row"
	case strings.HasPrefix(id, "metrics:body:wheel"):
		return "metrics scroll area"
	case strings.HasPrefix(id, "button:"):
		return tuiLatencyButtonLabel(id)
	default:
		parts := strings.Split(id, ":")
		if len(parts) == 0 {
			return ""
		}
		labelParts := parts
		if len(labelParts) > 3 {
			labelParts = labelParts[:3]
		}
		for i, part := range labelParts {
			labelParts[i] = strings.ReplaceAll(part, "-", " ")
		}
		return strings.Join(labelParts, " ")
	}
}

func tuiLatencyButtonLabel(id string) string {
	parts := strings.Split(id, ":")
	if len(parts) < 3 {
		return "button"
	}
	scope := strings.ReplaceAll(parts[1], "-", " ")
	action := strings.ReplaceAll(parts[2], "-", " ")
	switch {
	case scope == "" && action == "":
		return "button"
	case scope == "":
		return action + " button"
	case action == "":
		return scope + " button"
	default:
		return scope + " " + action + " button"
	}
}

func (c *interactionComponent) hitTargetIDAt(x, y int) string {
	if c == nil || c.hits == nil {
		return ""
	}
	if target, ok := c.hits.at(x, y); ok {
		return target.id
	}
	return ""
}

func (c *chromeComponent) currentTUISurface() string {
	a := c.app
	switch {
	case a.cmdPalette.paletteOpen:
		return "command palette"
	case a.help.open:
		return "help"
	case a.settings.open:
		return "settings"
	case a.metrics.open:
		return "metrics"
	case a.doctor.open:
		return "doctor"
	case a.detail.visible:
		return "detail"
	case a.inputComposer.composeOpen:
		return "compose"
	case a.catalog.open:
		return "catalog"
	case a.workspace.switchOpen:
		return "workspace switcher"
	case a.filePicker.open:
		return "file picker"
	case a.lmConfig.open:
		return "provider setup"
	case a.focus == FocusSidebar:
		return "left sidebar"
	case a.focus == FocusRightSidebar:
		return "right sidebar"
	case a.focus == FocusInput:
		return "input"
	case a.focus == FocusBody:
		return "conversation"
	default:
		return "workspace"
	}
}

func tuiLatencySurfaceForTarget(id string) string {
	if id == "" {
		return ""
	}
	switch {
	case strings.HasPrefix(id, "button:metrics:"), strings.HasPrefix(id, "metrics:"):
		return "metrics"
	case strings.HasPrefix(id, "button:doctor:"), strings.HasPrefix(id, "doctor:"):
		return "doctor"
	case strings.HasPrefix(id, "button:detail:"), strings.HasPrefix(id, "detail:"):
		return "detail"
	case strings.HasPrefix(id, "conversation:"):
		return "conversation"
	case strings.HasPrefix(id, "input:"), strings.HasPrefix(id, "text-entry:"):
		return "input"
	case strings.HasPrefix(id, "compose:"):
		return "compose"
	case strings.HasPrefix(id, "sidebar:"):
		return "left sidebar"
	case strings.HasPrefix(id, "right-sidebar:"):
		return "right sidebar"
	case strings.HasPrefix(id, "footer:"):
		return "footer"
	case strings.HasPrefix(id, "header:"):
		return "header"
	case strings.HasPrefix(id, "palette:"):
		return "command palette"
	case strings.HasPrefix(id, "settings:"):
		return "settings"
	case strings.HasPrefix(id, "catalog:"):
		return "catalog"
	case strings.HasPrefix(id, "workspace-switch:"), strings.HasPrefix(id, "workspace-create:"):
		return "workspace switcher"
	case strings.HasPrefix(id, "file-picker:"):
		return "file picker"
	case strings.HasPrefix(id, "lm-config:"):
		return "provider setup"
	case strings.HasPrefix(id, "mcp-"):
		return "mcp"
	case strings.HasPrefix(id, "agent-blueprint"), strings.Contains(id, "agent-blueprint"):
		return "agent blueprints"
	case strings.HasPrefix(id, "expert-pack"):
		return "expert packs"
	default:
		part := strings.Split(id, ":")[0]
		if part != "" {
			return strings.ReplaceAll(part, "-", " ")
		}
		return ""
	}
}
