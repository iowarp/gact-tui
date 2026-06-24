package ui

// live_message_adapter_sections.go splits adapter-formatted message text into typed parts.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func normalizeMessageAdapterSections(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant {
		return
	}
	for i := 0; i < len(m.Parts); i++ {
		part := m.Parts[i]
		if part.Type != gact.PartTypeText || !strings.Contains(part.Text, "[[ ## ") {
			continue
		}
		sections, ok := parseAdapterSections(part.Text)
		if !ok {
			continue
		}
		expanded := adapterSectionsToParts(part, sections)
		if len(expanded) == 0 {
			continue
		}
		next := make([]gact.Part, 0, len(m.Parts)-1+len(expanded))
		next = append(next, m.Parts[:i]...)
		next = append(next, expanded...)
		next = append(next, m.Parts[i+1:]...)
		m.Parts = next
		i += len(expanded) - 1
	}
}

type adapterSection struct {
	name string
	text string
}

func parseAdapterSections(text string) ([]adapterSection, bool) {
	const open = "[[ ## "
	const close = " ## ]]"
	pos := 0
	var sections []adapterSection
	for {
		startRel := strings.Index(text[pos:], open)
		if startRel < 0 {
			break
		}
		start := pos + startRel
		nameStart := start + len(open)
		nameEndRel := strings.Index(text[nameStart:], close)
		if nameEndRel < 0 {
			break
		}
		nameEnd := nameStart + nameEndRel
		contentStart := nameEnd + len(close)
		nextRel := strings.Index(text[contentStart:], open)
		contentEnd := len(text)
		if nextRel >= 0 {
			contentEnd = contentStart + nextRel
		}
		name := strings.ToLower(strings.TrimSpace(text[nameStart:nameEnd]))
		content := strings.TrimSpace(text[contentStart:contentEnd])
		if name != "" {
			sections = append(sections, adapterSection{name: name, text: content})
		}
		pos = contentEnd
	}
	return sections, len(sections) > 0
}

func adapterSectionsToParts(source gact.Part, sections []adapterSection) []gact.Part {
	var parts []gact.Part
	for _, section := range sections {
		if adapterSectionIsEmpty(section.text) {
			continue
		}
		partID := firstNonEmpty(source.ID, "adapter_text") + "_" + stableIDFragment(section.name)
		switch section.name {
		case "reasoning", "next_thought", "thought":
			parts = append(parts, gact.Part{
				ID:       partID,
				Type:     gact.PartTypeThinking,
				Thinking: section.text,
				Metadata: adapterSectionMetadata(source, section.name),
			})
		case "answer", "final", "response":
			parts = append(parts, gact.Part{
				ID:       partID,
				Type:     gact.PartTypeText,
				Text:     section.text,
				Metadata: adapterSectionMetadata(source, section.name),
			})
		case "workflow_state":
			state, ok := parseWorkflowStateJSON(section.text)
			if !ok || len(state) == 0 {
				continue
			}
			summary := workflowStateSummary(state)
			if summary == "" {
				continue
			}
			md := adapterSectionMetadata(source, section.name)
			md["workflow_state"] = state
			md["workflow_summary"] = summary
			md["output_summary"] = summary
			parts = append(parts, gact.Part{
				ID:       partID,
				Type:     gact.PartTypeExpertHandoff,
				Text:     "workflow state: " + summary,
				Metadata: md,
			})
		case "evidence", "artifacts":
			parts = append(parts, gact.Part{
				ID:       partID,
				Type:     gact.PartTypeText,
				Text:     "### " + adapterSectionTitle(section.name) + "\n" + section.text,
				Metadata: adapterSectionMetadata(source, section.name),
			})
		case "errors":
			if strings.EqualFold(strings.Trim(section.text, ". "), "none") {
				continue
			}
			parts = append(parts, gact.Part{
				ID:       partID,
				Type:     gact.PartTypeText,
				Text:     "### Errors\n" + section.text,
				Metadata: adapterSectionMetadata(source, section.name),
			})
		}
	}
	return parts
}

func adapterSectionTitle(name string) string {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "evidence":
		return "Evidence"
	case "artifacts":
		return "Artifacts"
	default:
		return humanizeAgentLabel(name)
	}
}

func adapterSectionMetadata(source gact.Part, section string) map[string]any {
	md := map[string]any{
		"synthetic_from":  "adapter_section_text",
		"adapter_section": section,
	}
	for key, value := range source.Metadata {
		md[key] = value
	}
	return md
}

func adapterSectionIsEmpty(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return true
	}
	normalized := strings.ToLower(strings.Trim(text, ". \n\t"))
	switch normalized {
	case "", "none", "null", "[]", "{}":
		return true
	default:
		return false
	}
}
