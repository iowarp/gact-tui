package ui

import (
	"encoding/json"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// Shared catalog row helpers: tree prefixes, compact status tags, provider
// grouping and agent-hierarchy label parsing.

func compactJSONDescription(value map[string]any) string {
	if len(value) == 0 {
		return ""
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(payload)
}

func agentCapabilityRefDescription(ref gact.AgentCapabilityRef) string {
	parts := make([]string, 0, 5)
	if ref.Kind != "" {
		parts = append(parts, "kind: "+ref.Kind)
	}
	if ref.Status != "" {
		parts = append(parts, "status: "+ref.Status)
	}
	if ref.Source != "" {
		parts = append(parts, "source: "+ref.Source)
	}
	if ref.Description != "" {
		parts = append(parts, ref.Description)
	}
	if text := compactJSONDescription(ref.Metadata); text != "" {
		parts = append(parts, "metadata: "+text)
	}
	return strings.Join(parts, " · ")
}

func providerGroupLabel(key string) string {
	switch key {
	case "built-in":
		return "Built-in"
	case "workspace":
		return "Workspace"
	case "session":
		return "Session"
	default:
		return valuefmt.HumanizeAgentLabel(key)
	}
}

func providerGroupRank(key string) int {
	switch key {
	case "built-in":
		return 0
	case "workspace":
		return 1
	case "session":
		return 2
	default:
		return 10
	}
}

func treePrefix(index, total int) string {
	if total <= 1 || index == total-1 {
		return "  └─ "
	}
	return "  ├─ "
}

func compactStatusTag(status string) string {
	status = strings.ToLower(strings.TrimSpace(status))
	status = strings.ReplaceAll(status, " ", "_")
	status = strings.ReplaceAll(status, "-", "_")
	return status
}

func stripAgentHierarchyRolePrefix(title string) string {
	_, _, title = splitAgentHierarchyComputedPrefix(strings.TrimSpace(title))
	for _, prefix := range []string{"Root expert · ", "Expert · "} {
		title = strings.TrimPrefix(title, prefix)
	}
	title = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(title), "└─"))
	return strings.TrimSpace(title)
}

func splitAgentHierarchyComputedPrefix(title string) (string, string, string) {
	original := title
	title = strings.TrimLeft(title, " ")
	if !strings.HasPrefix(title, "T") {
		return "", "", original
	}
	firstSpace := strings.IndexByte(title, ' ')
	if firstSpace <= 1 {
		return "", "", title
	}
	tier := title[:firstSpace]
	for _, r := range tier[1:] {
		if r < '0' || r > '9' {
			return "", "", title
		}
	}
	rest := strings.TrimLeft(title[firstSpace+1:], " ")
	secondSpace := strings.IndexByte(rest, ' ')
	if secondSpace <= 0 {
		return "", "", title
	}
	index := rest[:secondSpace]
	for _, r := range index {
		if (r < '0' || r > '9') && r != '.' && r != 'u' {
			return "", "", title
		}
	}
	remainder := rest[secondSpace+1:]
	indentLen := len(remainder) - len(strings.TrimLeft(remainder, " "))
	return tier + " " + index + " ", remainder[:indentLen], strings.TrimLeft(remainder, " ")
}
