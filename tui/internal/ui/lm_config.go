package ui

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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
	lmFieldAdvancedToggle
	// Following three only reachable when advancedExpanded is true.
	lmFieldTemperature
	lmFieldMaxTokens
	lmFieldThinkingBudget
	lmFieldSave
	lmFieldCount
)

// lmConfigVisibleRows is the number of catalog rows the provider /
// model lists show at once.
const lmConfigVisibleRows = 6

type lmConfigState struct {
	loading bool
	err     error

	info           *client.LMProviderInfo
	selected       int    // index into info.Presets
	model          string // editable model override
	apiKey         string // user-entered key
	temperature    string // empty = backend default
	maxTokens      string // empty = backend default (per-provider)
	thinkingBudget string // empty = disabled
	field          lmConfigField

	// Model catalog cache, keyed by PRESET ID (not provider kind):
	// argonne_sophia and argonne_metis share kind=argonne but hit
	// totally different /jobs endpoints, so they MUST cache
	// independently — otherwise switching presets shows the wrong
	// cluster's data. Keyed-by-id also handles the future case of
	// per-preset api_key overrides cleanly.
	modelCatalogs map[string][]gact.Model
	modelIndex    int // index into modelCatalogs[current preset id]; -1 = "custom"

	// modelCatalogWarnings holds the backend's "we fell back because…"
	// message keyed by preset ID (same rationale as modelCatalogs).
	// Rendered as a yellow banner above the model list so the user
	// sees actionable hints like "ALCF token expired — re-auth with
	// X" instead of a silently stale catalog.
	modelCatalogWarnings map[string]string

	// advancedExpanded gates the Temperature / Max tokens / Thinking
	// budget fields. Collapsed by default — most users want
	// "the model's defaults" and shouldn't have to think about
	// numeric tuning.
	advancedExpanded bool

	// sessionPatchMode chooses where Save dispatches. When true, the
	// modal is acting as a per-session model picker (PATCH
	// /v1/sessions/{sid} with just a ModelRef) — the global LM config
	// stays untouched, and api_key / temperature / max_tokens /
	// thinking_budget are ignored at save time. When false (default,
	// the on-startup case), Save calls PUT /v1/providers/lm to
	// reconfigure the backend's global LM. Wired by Settings → Model
	// (PATCH) vs lifecycle-prompt (PUT).
	sessionPatchMode bool
	// targetSessionID is the session to PATCH when sessionPatchMode
	// is true. Captured at modal-open time so the user navigating
	// the sidebar mid-pick doesn't accidentally retarget the save.
	targetSessionID string

	saving bool
}

// lmConfigVisibleFields returns the slice of fields the user can
// Tab through in the current state — collapsing advanced removes
// the three numeric knobs from the navigation order.
func (s *lmConfigState) lmConfigVisibleFields() []lmConfigField {
	out := []lmConfigField{
		lmFieldPreset, lmFieldModel, lmFieldAPIKey, lmFieldAdvancedToggle,
	}
	if s.advancedExpanded {
		out = append(out,
			lmFieldTemperature, lmFieldMaxTokens, lmFieldThinkingBudget,
		)
	}
	out = append(out, lmFieldSave)
	return out
}

// lmConfigStepField moves the cursor by “delta“ (±1) through the
// visible-field list, wrapping at both ends.
func (s *lmConfigState) lmConfigStepField(delta int) {
	visible := s.lmConfigVisibleFields()
	cur := -1
	for i, f := range visible {
		if f == s.field {
			cur = i
			break
		}
	}
	if cur < 0 {
		s.field = visible[0]
		return
	}
	n := len(visible)
	s.field = visible[((cur+delta)%n+n)%n]
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
		a.lmConfig.lmConfigStepField(1)
		return a, nil
	case "shift+tab", "up":
		a.lmConfig.lmConfigStepField(-1)
		return a, nil
	case "enter":
		if a.lmConfig.field == lmFieldSave {
			return a, a.lmConfigDispatch()
		}
		if a.lmConfig.field == lmFieldAdvancedToggle {
			a.lmConfig.advancedExpanded = !a.lmConfig.advancedExpanded
			return a, nil
		}
		a.lmConfig.lmConfigStepField(1)
		return a, nil
	case "left", "right":
		delta := 1
		if k.String() == "left" {
			delta = -1
		}
		switch a.lmConfig.field {
		case lmFieldPreset:
			if a.lmConfig.info == nil {
				return a, nil
			}
			n := len(a.lmConfig.info.Presets)
			if n == 0 {
				return a, nil
			}
			a.lmConfig.selected = ((a.lmConfig.selected+delta)%n + n) % n
			cmd := a.lmConfigSyncFromPreset()
			return a, cmd
		case lmFieldModel:
			if a.lmConfig.info == nil {
				return a, nil
			}
			pid := a.lmConfigCurrentPresetID()
			catalog := a.lmConfig.modelCatalogs[pid]
			n := len(catalog)
			if n == 0 {
				return a, nil
			}
			cur := a.lmConfig.modelIndex
			if cur < 0 {
				for i, m := range catalog {
					if m.ID == a.lmConfig.model {
						cur = i
						break
					}
				}
				if cur < 0 {
					cur = 0
				}
			}
			a.lmConfig.modelIndex = ((cur+delta)%n + n) % n
			a.lmConfig.model = catalog[a.lmConfig.modelIndex].ID
		case lmFieldAdvancedToggle:
			a.lmConfig.advancedExpanded = !a.lmConfig.advancedExpanded
		case lmFieldTemperature:
			cur := 1.0
			if v, err := strconv.ParseFloat(a.lmConfig.temperature, 64); err == nil {
				cur = v
			}
			cur += float64(delta) * 0.1
			if cur < 0 {
				cur = 0
			}
			if cur > 2 {
				cur = 2
			}
			a.lmConfig.temperature = fmt.Sprintf("%.1f", cur)
		case lmFieldMaxTokens:
			cur := 0
			if v, err := strconv.Atoi(a.lmConfig.maxTokens); err == nil {
				cur = v
			}
			cur += delta * 512
			if cur < 0 {
				cur = 0
			}
			if cur > 64000 {
				cur = 64000
			}
			if cur == 0 {
				a.lmConfig.maxTokens = ""
			} else {
				a.lmConfig.maxTokens = fmt.Sprintf("%d", cur)
			}
		case lmFieldThinkingBudget:
			cur := 0
			if v, err := strconv.Atoi(a.lmConfig.thinkingBudget); err == nil {
				cur = v
			}
			cur += delta * 1024
			if cur < 0 {
				cur = 0
			}
			if cur > 32000 {
				cur = 32000
			}
			if cur == 0 {
				a.lmConfig.thinkingBudget = ""
			} else {
				a.lmConfig.thinkingBudget = fmt.Sprintf("%d", cur)
			}
		}
		return a, nil
	case "backspace":
		switch a.lmConfig.field {
		case lmFieldModel:
			if len(a.lmConfig.model) > 0 {
				a.lmConfig.model = a.lmConfig.model[:len(a.lmConfig.model)-1]
				a.lmConfig.modelIndex = -1
			}
		case lmFieldAPIKey:
			if len(a.lmConfig.apiKey) > 0 {
				a.lmConfig.apiKey = a.lmConfig.apiKey[:len(a.lmConfig.apiKey)-1]
			}
		}
		return a, nil
	}
	// Plain text input — only Model + API key still take free text.
	// Numeric fields are now driven by ←/→ in the Advanced section.
	if k.Text != "" {
		switch a.lmConfig.field {
		case lmFieldModel:
			a.lmConfig.model += k.Text
			a.lmConfig.modelIndex = -1
		case lmFieldAPIKey:
			a.lmConfig.apiKey += k.Text
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

// lmConfigSyncFromPreset copies the selected preset's defaults into
// the editable model + apiKey fields. Returns a tea.Cmd that fetches
// the model catalog for the new preset's provider kind, OR nil if
// the catalog is already cached.
//
// Temperature / Max tokens / Thinking budget are intentionally LEFT
// BLANK so the backend resolves per-provider defaults (argonne caps
// max_tokens at 4096, others 32000; temperature 1.0; thinking off).
func (a *App) lmConfigSyncFromPreset() tea.Cmd {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return nil
	}
	if a.lmConfig.selected < 0 || a.lmConfig.selected >= len(a.lmConfig.info.Presets) {
		return nil
	}
	p := a.lmConfig.info.Presets[a.lmConfig.selected]
	// Always reset to this preset's suggested model on a preset
	// switch — otherwise stale values like "gpt-4o-mini" linger after
	// the user navigates from openai → argonne_metis. The user can
	// still type a custom id (which flips modelIndex to -1); the
	// modelCatalog-loaded handler then snaps back to the suggested
	// row when the catalog arrives.
	a.lmConfig.model = p.SuggestedModel
	a.lmConfig.modelIndex = -1
	if a.lmConfig.modelCatalogs == nil {
		a.lmConfig.modelCatalogs = map[string][]gact.Model{}
	}
	if _, cached := a.lmConfig.modelCatalogs[p.ID]; !cached {
		return lmConfigFetchModelsCmd(a.c, p.ID)
	}
	return nil
}

// lmConfigCurrentPresetID returns the preset id (e.g. "argonne_sophia",
// "argonne_metis", "anthropic") for the highlighted preset, or "" if
// nothing is selected. Used as the catalog cache key so presets that
// share a provider kind don't trample each other's catalogs.
func (a *App) lmConfigCurrentPresetID() string {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return ""
	}
	if a.lmConfig.selected < 0 || a.lmConfig.selected >= len(a.lmConfig.info.Presets) {
		return ""
	}
	return a.lmConfig.info.Presets[a.lmConfig.selected].ID
}

// lmConfigCurrentProviderKind returns the provider kind for the
// highlighted preset, or "" if no preset is selected.
func (a *App) lmConfigCurrentProviderKind() string {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return ""
	}
	if a.lmConfig.selected < 0 || a.lmConfig.selected >= len(a.lmConfig.info.Presets) {
		return ""
	}
	return a.lmConfig.info.Presets[a.lmConfig.selected].Provider
}

// lmConfigModelsLoadedMsg carries the model catalog for one PRESET so
// the modal can populate the Model picker. Source/warning surface
// fallback context (e.g. "ALCF token expired — re-auth") when the
// backend couldn't talk to the upstream catalog endpoint.
//
// Keyed by preset id, NOT provider kind, so multiple Argonne clusters
// (sophia / metis) keep independent catalogs even though they share
// kind="argonne".
type lmConfigModelsLoadedMsg struct {
	presetID string
	models   []gact.Model
	source   string // "live" / "static_fallback" / ""
	warning  string // backend error message, empty when live
	err      error  // transport-level failure (different from a backend warning)
}

// lmConfigFetchModelsCmd issues GET /v1/providers/{preset_id}/models
// (the backend resolves preset id → cluster + framework path) and
// surfaces source + warning so the picker can render "stale because X".
func lmConfigFetchModelsCmd(c *client.Client, presetID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		resp, err := c.ListProviderModelsDetailed(ctx, presetID)
		return lmConfigModelsLoadedMsg{
			presetID: presetID,
			models:   resp.Models,
			source:   resp.Source,
			warning:  resp.Error,
			err:      err,
		}
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
	a.lmConfig.saving = true
	a.lmConfig.err = nil

	// Two save paths share the same picker UI:
	//   1. session-patch: PATCH /v1/sessions/{sid} with just a
	//      ModelRef. Used when the modal was opened from Settings →
	//      Model tab; the global LM config stays untouched. API key /
	//      temperature / max_tokens / thinking_budget are ignored at
	//      save time (PATCH endpoint doesn't take them).
	//   2. global-PUT: PUT /v1/providers/lm with the full set. Used
	//      on the first-connect lifecycle prompt to wire CLIO's LM
	//      from scratch.
	if a.lmConfig.sessionPatchMode {
		sid := a.lmConfig.targetSessionID
		if sid == "" {
			sid = a.currentSessionID()
		}
		if sid == "" {
			a.lmConfig.saving = false
			return nil
		}
		ref := &gact.ModelRef{ProviderID: p.Provider, ModelID: model}
		return applySettingsCmd(a.c, sid, ref, nil)
	}

	apiKey := a.lmConfig.apiKey
	if apiKey == "" {
		apiKey = "x"
	}
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
	// detailModalWidth() (90% of terminal, capped 80..160) so the
	// provider/model lists actually fit catalog ids without truncation.
	w := a.detailModalWidth()

	title := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render("Configure CLIO's LM Provider")
	intro := lipgloss.NewStyle().Foreground(t.FgMuted).
		Render("Pick a provider + model. Advanced numeric tuning is collapsed below; defaults work for most users.")

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

	hint := t.HintLabel.Render(
		"Tab/↑↓ section  ←/→ pick within list / adjust value  Enter save/expand  Esc close",
	)
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

	// ---- Provider section: windowed list ---------------------------
	rows = append(rows, a.renderLMConfigProviderList(innerW))
	if len(a.lmConfig.info.Presets) > 0 {
		p := a.lmConfig.info.Presets[a.lmConfig.selected]
		descStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
		rows = append(rows,
			"  "+descStyle.Render(truncateString(p.Description, innerW-4)),
			"  "+lipgloss.NewStyle().Foreground(t.FgFaint).Render(
				fmt.Sprintf("%s  →  %s", p.Provider, p.APIBase),
			),
		)
	}
	rows = append(rows, "")

	// ---- Model section: windowed list ------------------------------
	rows = append(rows, a.renderLMConfigModelList(innerW))
	rows = append(rows, "")

	// ---- API key (typed) -------------------------------------------
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
	rows = append(rows, "")

	// ---- Advanced toggle + collapsible numerics --------------------
	rows = append(rows, a.renderLMConfigAdvancedToggle())
	if a.lmConfig.advancedExpanded {
		rows = append(rows, a.renderLMConfigAdvanced(innerW)...)
	}
	rows = append(rows, "")

	// ---- Save ------------------------------------------------------
	saveLabel := "  Save and connect"
	if a.lmConfig.field == lmFieldSave {
		saveLabel = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ") +
			lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("Save and connect")
	}
	rows = append(rows, saveLabel)

	return strings.Join(rows, "\n")
}

// renderLMConfigProviderList paints the provider section as a
// windowed list — lmConfigVisibleRows around the selection.
func (a *App) renderLMConfigProviderList(innerW int) string {
	t := a.Theme
	presets := a.lmConfig.info.Presets
	if len(presets) == 0 {
		return "  (no presets reported)"
	}
	focused := a.lmConfig.field == lmFieldPreset
	headerStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
	if focused {
		headerStyle = headerStyle.Foreground(t.Secondary)
	}
	header := fmt.Sprintf("%s   (%d/%d)",
		headerStyle.Render("Provider"),
		a.lmConfig.selected+1, len(presets))
	rows := []string{header}

	start, end := lmConfigWindow(a.lmConfig.selected, len(presets))
	for i := start; i < end; i++ {
		p := presets[i]
		marker := "    "
		labelStyle := lipgloss.NewStyle().Foreground(t.Fg)
		if i == a.lmConfig.selected {
			if focused {
				marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("  ▌ ")
				labelStyle = labelStyle.Foreground(t.Secondary).Bold(true)
			} else {
				marker = lipgloss.NewStyle().Foreground(t.FgMuted).Render("  · ")
				labelStyle = labelStyle.Bold(true)
			}
		}
		rows = append(rows, marker+labelStyle.Render(truncateString(p.Label, innerW-6)))
	}
	if end < len(presets) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgFaint).Render(
			fmt.Sprintf("    … %d more (←/→ to scroll)", len(presets)-end),
		))
	}
	return strings.Join(rows, "\n")
}

// renderLMConfigModelList paints the model picker as a windowed list.
func (a *App) renderLMConfigModelList(innerW int) string {
	t := a.Theme
	focused := a.lmConfig.field == lmFieldModel
	headerStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
	if focused {
		headerStyle = headerStyle.Foreground(t.Secondary)
	}

	pid := a.lmConfigCurrentPresetID()
	catalog := a.lmConfig.modelCatalogs[pid]

	// Build the warning banner first so it sits ABOVE the picker
	// header — the user sees "stale because X, run Y" before the
	// list and can act before they pick the wrong row. Banner is
	// only rendered when the backend told us it fell back; if the
	// list is live (or we never tried to fetch), it stays empty.
	warning := a.lmConfig.modelCatalogWarnings[pid]
	bannerLine := ""
	if warning != "" {
		bannerLine = lipgloss.NewStyle().
			Foreground(t.Warning).Bold(true).
			Render("⚠ stale catalog · ") +
			lipgloss.NewStyle().Foreground(t.Warning).
				Render(truncateString(warning, innerW-4)) + "\n"
	}

	if len(catalog) == 0 {
		header := headerStyle.Render("Model") + "   " +
			lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).Render(
				"(no catalog — type a model id manually)",
			)
		return bannerLine + header + "\n" + lmConfigField_render(
			"", a.lmConfig.model, false, focused, t,
		)
	}

	idx := a.lmConfig.modelIndex
	if idx < 0 {
		idx = 0
	}
	header := fmt.Sprintf("%s   (%d/%d)%s",
		headerStyle.Render("Model"),
		idx+1, len(catalog),
		func() string {
			if a.lmConfig.modelIndex < 0 {
				return "  " + lipgloss.NewStyle().Foreground(t.FgFaint).
					Italic(true).Render("(typed — ←/→ to snap back to catalog)")
			}
			return ""
		}(),
	)
	rows := []string{header}
	start, end := lmConfigWindow(idx, len(catalog))
	for i := start; i < end; i++ {
		m := catalog[i]
		marker := "    "
		labelStyle := lipgloss.NewStyle().Foreground(t.Fg)
		if i == idx && a.lmConfig.modelIndex >= 0 {
			if focused {
				marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("  ▌ ")
				labelStyle = labelStyle.Foreground(t.Secondary).Bold(true)
			} else {
				marker = lipgloss.NewStyle().Foreground(t.FgMuted).Render("  · ")
				labelStyle = labelStyle.Bold(true)
			}
		}
		rows = append(rows, marker+labelStyle.Render(truncateString(m.ID, innerW-6)))
	}
	if end < len(catalog) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgFaint).Render(
			fmt.Sprintf("    … %d more (←/→ to scroll)", len(catalog)-end),
		))
	}
	return bannerLine + strings.Join(rows, "\n")
}

// renderLMConfigAdvancedToggle renders the ▶/▼ row.
func (a *App) renderLMConfigAdvancedToggle() string {
	t := a.Theme
	focused := a.lmConfig.field == lmFieldAdvancedToggle
	indicator := "▶"
	if a.lmConfig.advancedExpanded {
		indicator = "▼"
	}
	marker := "  "
	labelStyle := lipgloss.NewStyle().Foreground(t.Fg)
	if focused {
		marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
		labelStyle = labelStyle.Foreground(t.Secondary).Bold(true)
	}
	hint := ""
	if !a.lmConfig.advancedExpanded {
		hint = "  " + lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).Render(
			"Temperature, Max tokens, Thinking budget — defaults work for most",
		)
	}
	return marker + labelStyle.Render(indicator+" Advanced") + hint
}

// renderLMConfigAdvanced renders the three numeric knobs as ←/→
// adjusters. Empty value displays "default" so the user knows blank
// is intentional.
func (a *App) renderLMConfigAdvanced(innerW int) []string {
	t := a.Theme
	row := func(field lmConfigField, label, value, defaultText string) string {
		marker := "    "
		labelStyle := lipgloss.NewStyle().Foreground(t.Fg)
		if a.lmConfig.field == field {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("    ▌ ")
			labelStyle = labelStyle.Foreground(t.Secondary).Bold(true)
		}
		display := value
		if display == "" {
			display = lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
				Render(defaultText)
		} else {
			display = lipgloss.NewStyle().Foreground(t.Fg).Bold(true).Render(display)
		}
		hint := ""
		if a.lmConfig.field == field {
			hint = "  " + lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
				Render("(←/→ to adjust)")
		}
		return marker + labelStyle.Render(label) + "  " + display + hint
	}
	return []string{
		row(lmFieldTemperature, "Temperature",
			a.lmConfig.temperature, "default 1.0"),
		row(lmFieldMaxTokens, "Max tokens",
			a.lmConfig.maxTokens, "backend default (4096 ALCF / 32000 elsewhere)"),
		row(lmFieldThinkingBudget, "Thinking budget",
			a.lmConfig.thinkingBudget, "default disabled"),
	}
}

// lmConfigWindow returns [start, end) — the window of catalog rows
// to render around “cursor“, ensuring the cursor sits roughly mid-
// window.
func lmConfigWindow(cursor, total int) (int, int) {
	if total <= lmConfigVisibleRows {
		return 0, total
	}
	half := lmConfigVisibleRows / 2
	start := cursor - half
	if start < 0 {
		start = 0
	}
	end := start + lmConfigVisibleRows
	if end > total {
		end = total
		start = end - lmConfigVisibleRows
	}
	return start, end
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
