package ui

// render_model_swap.go renders model-swap marker dividers in the conversation.

import (
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func isModelSwapMarker(m gact.Message) bool {
	if m.Metadata == nil {
		return false
	}
	kind, _ := m.Metadata["gact_tui_kind"].(string)
	return kind == modelSwapMarkerKind
}

func modelSwapMarkerLabel(m gact.Message) string {
	if m.Metadata == nil {
		return ""
	}
	label, _ := m.Metadata["label"].(string)
	return strings.TrimSpace(label)
}

func modelRefLabel(m gact.Message) string {
	if m.Model == nil {
		return ""
	}
	return joinModelLabel(m.Model.ProviderID, m.Model.ModelID)
}

func joinModelLabel(provider, model string) string {
	provider = strings.TrimSpace(provider)
	model = strings.TrimSpace(model)
	switch {
	case provider != "" && model != "":
		return provider + "/" + model
	case model != "":
		return model
	case provider != "":
		return provider
	default:
		return ""
	}
}

func (t Theme) renderModelSwapDivider(m gact.Message, width int) string {
	label := modelSwapMarkerLabel(m)
	if label == "" {
		label = "unknown model"
	}
	text := " model/provider switched: " + label + " "
	if width < 20 {
		return lipgloss.NewStyle().Foreground(t.FgMuted).Render(text)
	}
	available := width - lipgloss.Width(text)
	if available < 4 {
		return lipgloss.NewStyle().Foreground(t.FgMuted).Render(textutil.Truncate(text, width))
	}
	left := available / 2
	right := available - left
	line := strings.Repeat("-", left) + text + strings.Repeat("-", right)
	return lipgloss.NewStyle().Foreground(t.FgMuted).Render(line)
}
