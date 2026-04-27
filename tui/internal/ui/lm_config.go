package ui

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// CLIO-BBBBBBBBBB-D: /v1/providers/lm config modal.
//
// CLIO ships clio-agent-gact with no LM wired by default — first-
// connect produces /v1/health.integrations.lm = unavailable. Rather
// than failing at deploy time the TUI pops this modal so the user
// picks a provider + model interactively.
//
// State machine: presets list (↑/↓ to navigate) → preset selected
// (model field can be edited inline; api_key prompted when
// RequiresAPIKey) → Save (PUT /v1/providers/lm) → modal dismisses.
//
// Backends that don't expose /v1/providers/lm (404) skip this modal
// entirely; the TUI assumes the operator will configure their
// backend out-of-band (e.g. Claude Code adapter, OpenCode).

type lmConfigField int

const (
	lmFieldPreset lmConfigField = iota
	lmFieldModel
	lmFieldAPIKey
	lmFieldTemperature
	lmFieldMaxTokens
	lmFieldThinkingBudget
	lmFieldSave
	lmFieldCount
)

type lmConfigState struct {
	loading bool
	err     error

	info            *client.LMProviderInfo
	selected        int    // index into info.Presets
	model           string // editable model override
	apiKey          string // user-entered key
	temperature     string // string-edited; parsed on save
	maxTokens       string // string-edited; parsed on save
	thinkingBudget  string // string-edited; 0 disables, mapped to provider-specific reasoning param
	field           lmConfigField

	saving bool
}

// Msgs.

type lmConfigFetchedMsg struct {
	info *client.LMProviderInfo
	err  error
}

type lmConfigSavedMsg struct {
	info *client.LMProviderInfo
	err  error
}

func lmConfigFetchCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		info, err := c.GetLMProvider(ctx)
		return lmConfigFetchedMsg{info: info, err: err}
	}
}

func lmConfigSaveCmd(c *client.Client, req client.LMProviderRequest) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		info, err := c.PutLMProvider(ctx, req)
		return lmConfigSavedMsg{info: info, err: err}
	}
}

// handleLMConfigKey drives the modal while it's open.
func (a *App) handleLMConfigKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.lmConfig == nil {
		return a, nil
	}
	if a.lmConfig.saving {
		return a, nil
	}
	switch k.String() {
	case "esc":
		a.lmConfigOpen = false
		a.lmConfig = nil
		return a, nil
	case "tab", "down":
		a.lmConfig.field = (a.lmConfig.field + 1) % lmFieldCount
		return a, nil
	case "shift+tab", "up":
		a.lmConfig.field = (a.lmConfig.field + lmFieldCount - 1) % lmFieldCount
		return a, nil
	case "enter":
		if a.lmConfig.field == lmFieldSave {
			return a, a.lmConfigDispatch()
		}
		a.lmConfig.field = (a.lmConfig.field + 1) % lmFieldCount
		return a, nil
	case "left", "right":
		if a.lmConfig.field == lmFieldPreset && a.lmConfig.info != nil {
			n := len(a.lmConfig.info.Presets)
			if n == 0 {
				return a, nil
			}
			delta := 1
			if k.String() == "left" {
				delta = n - 1
			}
			a.lmConfig.selected = (a.lmConfig.selected + delta) % n
			a.lmConfigSyncFromPreset()
		}
		return a, nil
	case "backspace":
		switch a.lmConfig.field {
		case lmFieldModel:
			if len(a.lmConfig.model) > 0 {
				a.lmConfig.model = a.lmConfig.model[:len(a.lmConfig.model)-1]
			}
		case lmFieldAPIKey:
			if len(a.lmConfig.apiKey) > 0 {
				a.lmConfig.apiKey = a.lmConfig.apiKey[:len(a.lmConfig.apiKey)-1]
			}
		case lmFieldTemperature:
			if len(a.lmConfig.temperature) > 0 {
				a.lmConfig.temperature = a.lmConfig.temperature[:len(a.lmConfig.temperature)-1]
			}
		case lmFieldMaxTokens:
			if len(a.lmConfig.maxTokens) > 0 {
				a.lmConfig.maxTokens = a.lmConfig.maxTokens[:len(a.lmConfig.maxTokens)-1]
			}
		case lmFieldThinkingBudget:
			if len(a.lmConfig.thinkingBudget) > 0 {
				a.lmConfig.thinkingBudget = a.lmConfig.thinkingBudget[:len(a.lmConfig.thinkingBudget)-1]
			}
		}
		return a, nil
	}
	// Plain text input.
	if k.Text != "" {
		switch a.lmConfig.field {
		case lmFieldModel:
			a.lmConfig.model += k.Text
		case lmFieldAPIKey:
			a.lmConfig.apiKey += k.Text
		case lmFieldTemperature:
			// Only accept digits + ".".
			if isNumericInput(k.Text, true) {
				a.lmConfig.temperature += k.Text
			}
		case lmFieldMaxTokens:
			if isNumericInput(k.Text, false) {
				a.lmConfig.maxTokens += k.Text
			}
		case lmFieldThinkingBudget:
			if isNumericInput(k.Text, false) {
				a.lmConfig.thinkingBudget += k.Text
			}
		}
	}
	return a, nil
}

// isNumericInput accepts digits, plus a decimal point when allowFloat
// is true. Anything else is silently dropped — protects the field
// from typos that would later fail strconv.
func isNumericInput(s string, allowFloat bool) bool {
	for _, r := range s {
		if r >= '0' && r <= '9' {
			continue
		}
		if allowFloat && r == '.' {
			continue
		}
		return false
	}
	return true
}

// lmConfigSyncFromPreset copies the selected preset's defaults
// into the editable model + apiKey fields, but only when the
// field is currently empty (so the user's typed override survives
// when they navigate around).
func (a *App) lmConfigSyncFromPreset() {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return
	}
	if a.lmConfig.selected < 0 || a.lmConfig.selected >= len(a.lmConfig.info.Presets) {
		return
	}
	p := a.lmConfig.info.Presets[a.lmConfig.selected]
	if a.lmConfig.model == "" {
		a.lmConfig.model = p.SuggestedModel
	}
	// Don't auto-fill api_key — user has to type it.
	// Temperature + max_tokens fall back to backend defaults when
	// blank; pre-fill with current values so the user can see the
	// active config and tweak from there.
	if a.lmConfig.temperature == "" && a.lmConfig.info.Temperature > 0 {
		a.lmConfig.temperature = fmt.Sprintf("%g", a.lmConfig.info.Temperature)
	}
	if a.lmConfig.maxTokens == "" && a.lmConfig.info.MaxTokens > 0 {
		a.lmConfig.maxTokens = fmt.Sprintf("%d", a.lmConfig.info.MaxTokens)
	}
	// Thinking budget: empty string means "let backend decide / disable".
	// Pre-fill with the active value so users can see + edit.
	if a.lmConfig.thinkingBudget == "" && a.lmConfig.info.ThinkingBudget > 0 {
		a.lmConfig.thinkingBudget = fmt.Sprintf("%d", a.lmConfig.info.ThinkingBudget)
	}
}

func (a *App) lmConfigDispatch() tea.Cmd {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return nil
	}
	if a.lmConfig.selected < 0 || a.lmConfig.selected >= len(a.lmConfig.info.Presets) {
		return nil
	}
	p := a.lmConfig.info.Presets[a.lmConfig.selected]
	model := a.lmConfig.model
	if model == "" {
		model = p.SuggestedModel
	}
	apiKey := a.lmConfig.apiKey
	if apiKey == "" {
		apiKey = "x"
	}
	a.lmConfig.saving = true
	a.lmConfig.err = nil
	req := client.LMProviderRequest{
		Provider: p.Provider,
		APIBase:  p.APIBase,
		Model:    model,
		APIKey:   apiKey,
	}
	if a.lmConfig.temperature != "" {
		if v, err := strconv.ParseFloat(a.lmConfig.temperature, 64); err == nil {
			req.Temperature = v
		}
	}
	if a.lmConfig.maxTokens != "" {
		if v, err := strconv.Atoi(a.lmConfig.maxTokens); err == nil {
			req.MaxTokens = v
		}
	}
	if a.lmConfig.thinkingBudget != "" {
		if v, err := strconv.Atoi(a.lmConfig.thinkingBudget); err == nil {
			req.ThinkingBudget = v
		}
	}
	return lmConfigSaveCmd(a.c, req)
}

// viewLMConfig renders the modal.
func (a *App) viewLMConfig() string {
	if !a.lmConfigOpen || a.lmConfig == nil {
		return ""
	}
	t := a.Theme
	w := a.modalWidth()

	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render("Configure CLIO's LM Provider")
	intro := lipgloss.NewStyle().Foreground(t.FgMuted).
		Render("CLIO needs an LM endpoint before it can answer questions. Pick a preset and (if needed) supply an API key.")

	var body string
	switch {
	case a.lmConfig.loading:
		body = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("fetching /v1/providers/lm…")
	case a.lmConfig.err != nil:
		body = lipgloss.NewStyle().Foreground(t.Danger).
			Render("save failed: "+a.lmConfig.err.Error()) + "\n\n" +
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render("press Tab to navigate, Esc to close, Enter on Save to retry")
	case a.lmConfig.info == nil:
		body = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("no LM config endpoint on this backend (404)")
	default:
		body = a.renderLMConfigBody(w - 4)
	}

	hint := t.HintLabel.Render("Tab/↑↓ navigate  ←/→ pick preset  Enter save/next  Esc close")
	parts := []string{title, "", intro, "", body}
	if a.lmConfig.saving {
		parts = append(parts, "",
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render("saving…"))
	}
	parts = append(parts, "", hint)
	box := lipgloss.JoinVertical(lipgloss.Left, parts...)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Background(t.BgSubtle).
		Padding(1, 2).
		Width(w).
		Render(box)
}

func (a *App) renderLMConfigBody(innerW int) string {
	t := a.Theme
	if a.lmConfig.info == nil {
		return ""
	}

	rows := []string{}

	// Preset row.
	presetMarker := "  "
	if a.lmConfig.field == lmFieldPreset {
		presetMarker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
	}
	if len(a.lmConfig.info.Presets) > 0 {
		p := a.lmConfig.info.Presets[a.lmConfig.selected]
		labelStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
		if a.lmConfig.field == lmFieldPreset {
			labelStyle = labelStyle.Foreground(t.Secondary)
		}
		descStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
		rows = append(rows,
			fmt.Sprintf("%sProvider: %s    (%d/%d)",
				presetMarker,
				labelStyle.Render(p.Label),
				a.lmConfig.selected+1,
				len(a.lmConfig.info.Presets),
			),
			"  "+descStyle.Render(truncateString(p.Description, innerW-4)),
			"  "+lipgloss.NewStyle().Foreground(t.FgFaint).
				Render(fmt.Sprintf("%s  →  %s", p.Provider, p.APIBase)),
		)
	} else {
		rows = append(rows, "  (no presets reported)")
	}
	rows = append(rows, "")

	// Model row.
	rows = append(rows, lmConfigField_render(
		"Model", a.lmConfig.model, false,
		a.lmConfig.field == lmFieldModel, t,
	))

	// API key row.
	requiresKey := false
	if len(a.lmConfig.info.Presets) > 0 {
		requiresKey = a.lmConfig.info.Presets[a.lmConfig.selected].RequiresAPIKey
	}
	apiHint := ""
	if !requiresKey {
		apiHint = "  (this preset doesn't need a key — leave blank)"
	}
	rows = append(rows, lmConfigField_render(
		"API key"+apiHint, a.lmConfig.apiKey, true,
		a.lmConfig.field == lmFieldAPIKey, t,
	))

	// Temperature + max_tokens — model_config knobs forwarded to
	// the upstream LM via PUT /v1/providers/lm. Blank = backend
	// defaults (temperature=1.0, max_tokens=32000).
	rows = append(rows, lmConfigField_render(
		"Temperature  (0.0-2.0; blank for default 1.0)",
		a.lmConfig.temperature, false,
		a.lmConfig.field == lmFieldTemperature, t,
	))
	rows = append(rows, lmConfigField_render(
		"Max tokens   (output cap; blank for default 32000)",
		a.lmConfig.maxTokens, false,
		a.lmConfig.field == lmFieldMaxTokens, t,
	))
	rows = append(rows, lmConfigField_render(
		"Thinking budget  (0=off; Anthropic uses tokens, OpenAI maps to low/med/high)",
		a.lmConfig.thinkingBudget, false,
		a.lmConfig.field == lmFieldThinkingBudget, t,
	))

	// Save button row.
	rows = append(rows, "")
	saveLabel := "  Save and connect"
	saveStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
	if a.lmConfig.field == lmFieldSave {
		saveLabel = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ") +
			lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("Save and connect")
		_ = saveStyle
	}
	rows = append(rows, saveLabel)

	return strings.Join(rows, "\n")
}

func lmConfigField_render(
	label, value string, mask bool, focused bool, t Theme,
) string {
	marker := "  "
	if focused {
		marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
	}
	display := value
	if mask && value != "" {
		display = strings.Repeat("*", len(value))
	}
	if focused {
		display += "_"
	}
	if display == "" {
		display = lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
			Render("(empty)")
	}
	return fmt.Sprintf("%s%s: %s", marker,
		lipgloss.NewStyle().Foreground(t.FgMuted).Render(label),
		display,
	)
}
