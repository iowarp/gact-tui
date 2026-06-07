package ui

import (
	"context"
	"fmt"
	"image/color"
	"sort"
	"strconv"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

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
	lmFieldAPIBase
	lmFieldModel
	lmFieldAPIKey
	lmFieldAuth
	lmFieldTemperature
	lmFieldMaxTokens
	lmFieldContextLength
	lmFieldThinkingBudget
	lmFieldSave
	lmFieldCount
)

// lmConfigVisibleRows is the fallback number of catalog rows when the
// terminal has not reported a useful height yet.
const lmConfigVisibleRows = 6

type lmConfigState struct {
	loading bool
	err     error

	info           *client.LMProviderInfo
	selected       int    // index into info.Presets
	model          string // editable model override
	apiBase        string // editable endpoint override
	apiKey         string // user-entered key
	temperature    string // empty = backend default
	maxTokens      string // empty = backend default (per-provider)
	contextLength  string // empty = not recorded; provider/model load setting
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
	modelCatalogSources  map[string]string
	modelCatalogPending  map[string]bool
	modelCatalogRetries  map[string]int
	providerFilter       string
	modelFilter          string

	// sessionPatchMode chooses where Save dispatches. When true, the
	// modal is acting as a per-session model picker (PATCH
	// /v1/sessions/{sid} with just a ModelRef) for backends that
	// implement per-session model refs. CLIO leaves this false because
	// it reconfigures the active provider through PUT /v1/providers/lm.
	sessionPatchMode bool
	// targetSessionID is the session to PATCH when sessionPatchMode
	// is true. Captured at modal-open time so the user navigating
	// the sidebar mid-pick doesn't accidentally retarget the save.
	targetSessionID string

	saving         bool
	authenticating bool
	authMessage    string
}

type lmConfigLayout struct {
	bodyRows     int
	providerRows int
	selectedRows int
	modelRows    int
	configRows   int
	gridGapRows  int
	buttonRows   int
	compact      bool
}

// lmConfigVisibleFields returns the slice of fields the user can Tab
// through in the current state. Model selection is only focusable
// when the selected provider has a usable catalog; this modal no
// longer exposes a generic manual-model-id fallback.
func (s *lmConfigState) lmConfigVisibleFields() []lmConfigField {
	out := []lmConfigField{
		lmFieldPreset,
	}
	if s.lmConfigSelectedRequiresAPIKey() {
		out = append(out, lmFieldAPIKey)
	}
	if s.lmConfigSelectedUsesOAuth() {
		out = append(out, lmFieldAuth)
	}
	if s.lmConfigSelectedCanEditAPIBase() {
		out = append(out, lmFieldAPIBase)
	}
	if s.lmConfigSelectedModelSelectable() {
		out = append(out, lmFieldModel)
	}
	advanced := s.lmConfigAdvancedFields()
	if len(advanced) > 0 {
		out = append(out, advanced...)
	}
	out = append(out, lmFieldSave)
	return out
}

// lmConfigSectionFields returns the coarser focus stops used by Tab.
// Vertical navigation still moves within each list/panel; Tab changes
// between the modal's main sections.
func (s *lmConfigState) lmConfigSectionFields() []lmConfigField {
	out := []lmConfigField{lmFieldPreset}
	if s.lmConfigSelectedRequiresAPIKey() {
		out = append(out, lmFieldAPIKey)
	} else if s.lmConfigSelectedUsesOAuth() {
		out = append(out, lmFieldAuth)
	} else if s.lmConfigSelectedCanEditAPIBase() {
		out = append(out, lmFieldAPIBase)
	}
	if s.lmConfigSelectedModelSelectable() {
		out = append(out, lmFieldModel)
	}
	if advanced := s.lmConfigAdvancedFields(); len(advanced) > 0 {
		out = append(out, advanced[0])
	}
	out = append(out, lmFieldSave)
	return out
}

func (s *lmConfigState) lmConfigSelectedModelSelectable() bool {
	if s == nil || s.info == nil || s.selected < 0 || s.selected >= len(s.info.Presets) {
		return false
	}
	p := s.info.Presets[s.selected]
	if len(s.modelCatalogs[p.ID]) > 0 && s.modelCatalogSources[p.ID] == "static_catalog" {
		return true
	}
	if p.Status == "missing_key" || p.Status == "auth_required" || p.Status == "unavailable" {
		return false
	}
	if s.modelCatalogPending != nil && s.modelCatalogPending[p.ID] {
		return false
	}
	if s.modelCatalogWarnings != nil && strings.TrimSpace(s.modelCatalogWarnings[p.ID]) != "" {
		return false
	}
	return len(s.modelCatalogs[p.ID]) > 0
}

func (s *lmConfigState) lmConfigAdvancedFields() []lmConfigField {
	if s == nil || s.info == nil || s.selected < 0 || s.selected >= len(s.info.Presets) {
		return nil
	}
	p := s.info.Presets[s.selected]
	switch p.Provider {
	case "codex", "claude_code":
		return nil
	case "lm_studio":
		return []lmConfigField{lmFieldTemperature, lmFieldMaxTokens, lmFieldContextLength}
	case "anthropic", "openai":
		return []lmConfigField{lmFieldTemperature, lmFieldMaxTokens, lmFieldThinkingBudget}
	default:
		return []lmConfigField{lmFieldTemperature, lmFieldMaxTokens}
	}
}

func (s *lmConfigState) lmConfigSelectedRequiresAPIKey() bool {
	if s == nil || s.info == nil || s.selected < 0 || s.selected >= len(s.info.Presets) {
		return false
	}
	return s.info.Presets[s.selected].RequiresAPIKey
}

func (s *lmConfigState) lmConfigSelectedUsesOAuth() bool {
	if s == nil || s.info == nil || s.selected < 0 || s.selected >= len(s.info.Presets) {
		return false
	}
	p := s.info.Presets[s.selected]
	return p.AuthMethod == "oauth" || p.Provider == "argonne"
}

func (s *lmConfigState) lmConfigSelectedCanEditAPIBase() bool {
	if s == nil || s.info == nil || s.selected < 0 || s.selected >= len(s.info.Presets) {
		return false
	}
	switch s.info.Presets[s.selected].Provider {
	case "codex", "claude_code":
		return false
	default:
		return true
	}
}

// lmConfigStepField moves the cursor by “delta“ (±1) through the
// visible-field list, wrapping at both ends.
func (s *lmConfigState) lmConfigStepField(delta int) {
	visible := s.lmConfigVisibleFields()
	s.field = lmConfigStepInFields(s.field, visible, delta)
}

func (s *lmConfigState) lmConfigStepSection(delta int) {
	sections := s.lmConfigSectionFields()
	current := s.field
	if advanced := s.lmConfigAdvancedFields(); len(advanced) > 0 {
		for _, field := range advanced {
			if field == current {
				current = advanced[0]
				break
			}
		}
	}
	s.field = lmConfigStepInFields(current, sections, delta)
}

func lmConfigStepInFields(current lmConfigField, visible []lmConfigField, delta int) lmConfigField {
	if len(visible) == 0 {
		return current
	}
	cur := -1
	for i, f := range visible {
		if f == current {
			cur = i
			break
		}
	}
	if cur < 0 {
		return visible[0]
	}
	n := len(visible)
	return visible[((cur+delta)%n+n)%n]
}

func (s *lmConfigState) lmConfigEnsureVisibleField() {
	visible := s.lmConfigVisibleFields()
	for _, f := range visible {
		if f == s.field {
			return
		}
	}
	if len(visible) > 0 {
		s.field = visible[0]
	}
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

type lmConfigAuthedMsg struct {
	providerID string
	resp       client.ProviderAuthResponse
	err        error
}

func lmConfigFetchCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		info, err := c.GetLMProvider(ctx)
		lmConfigNormalizeInfo(info)
		return lmConfigFetchedMsg{info: info, err: err}
	}
}

func lmConfigNormalizeInfo(info *client.LMProviderInfo) {
	if info == nil {
		return
	}
	sort.SliceStable(info.Presets, func(i, j int) bool {
		return strings.ToLower(info.Presets[i].Label) < strings.ToLower(info.Presets[j].Label)
	})
}

func lmConfigSortModels(models []gact.Model) []gact.Model {
	out := append([]gact.Model(nil), models...)
	sort.SliceStable(out, func(i, j int) bool {
		left := strings.ToLower(strings.TrimSpace(out[i].ID))
		right := strings.ToLower(strings.TrimSpace(out[j].ID))
		if left == right {
			return strings.ToLower(strings.TrimSpace(out[i].Name)) <
				strings.ToLower(strings.TrimSpace(out[j].Name))
		}
		return left < right
	})
	return out
}

func lmConfigSaveCmd(c *client.Client, req client.LMProviderRequest) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
		defer cancel()
		info, err := c.PutLMProvider(ctx, req)
		lmConfigNormalizeInfo(info)
		return lmConfigSavedMsg{info: info, err: err}
	}
}

func lmConfigPollCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		time.Sleep(1 * time.Second)
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		info, err := c.GetLMProvider(ctx)
		lmConfigNormalizeInfo(info)
		return lmConfigFetchedMsg{info: info, err: err}
	}
}

func lmConfigAuthCmd(c *client.Client, providerID string, force bool) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		resp, err := c.AuthProvider(ctx, providerID, client.ProviderAuthRequest{Force: force})
		return lmConfigAuthedMsg{providerID: providerID, resp: resp, err: err}
	}
}

// handleLMConfigKey drives the modal while it's open.
func (a *App) handleLMConfigKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.lmConfig == nil {
		return a, nil
	}
	if a.lmConfig.saving || a.lmConfig.authenticating {
		return a, nil
	}
	switch k.String() {
	case "esc":
		a.closeLMConfigModal()
		return a, nil
	case "ctrl+r":
		return a, a.refreshLMConfig()
	case "tab":
		a.lmConfig.lmConfigStepSection(1)
		return a, nil
	case "shift+tab":
		a.lmConfig.lmConfigStepSection(-1)
		return a, nil
	case "down", "j":
		return a.handleLMConfigVertical(1)
	case "up", "k":
		return a.handleLMConfigVertical(-1)
	case "enter":
		if a.lmConfig.field == lmFieldSave {
			return a, a.lmConfigDispatch()
		}
		if a.lmConfig.field == lmFieldAuth {
			if p := a.lmConfigCurrentPreset(); p != nil {
				a.lmConfig.authenticating = true
				force := p.IsAuthenticated || p.Status == "ready"
				if force {
					a.lmConfig.authMessage = "launching ALCF Globus re-auth terminal..."
				} else {
					a.lmConfig.authMessage = "launching ALCF Globus login terminal..."
				}
				return a, lmConfigAuthCmd(a.c, p.ID, force)
			}
			return a, nil
		}
		a.lmConfig.lmConfigStepSection(1)
		return a, nil
	case "left", "right":
		delta := 1
		if k.String() == "left" {
			delta = -1
		}
		switch a.lmConfig.field {
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
		case lmFieldContextLength:
			cur := 0
			if v, err := strconv.Atoi(a.lmConfig.contextLength); err == nil {
				cur = v
			}
			cur += delta * 4096
			if cur < 0 {
				cur = 0
			}
			if cur > 262144 {
				cur = 262144
			}
			if cur == 0 {
				a.lmConfig.contextLength = ""
			} else {
				a.lmConfig.contextLength = fmt.Sprintf("%d", cur)
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
		case lmFieldPreset:
			if len(a.lmConfig.providerFilter) > 0 {
				a.lmConfig.providerFilter = a.lmConfig.providerFilter[:len(a.lmConfig.providerFilter)-1]
				a.lmConfigSelectFirstFiltered()
				return a, a.lmConfigSyncFromPreset()
			}
		case lmFieldAPIBase:
			if len(a.lmConfig.apiBase) > 0 {
				a.lmConfig.apiBase = a.lmConfig.apiBase[:len(a.lmConfig.apiBase)-1]
				a.lmConfigInvalidateCurrentCatalog()
			}
		case lmFieldModel:
			if len(a.lmConfig.modelFilter) > 0 {
				a.lmConfig.modelFilter = a.lmConfig.modelFilter[:len(a.lmConfig.modelFilter)-1]
				a.lmConfigSelectFirstFilteredModel()
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
		case lmFieldPreset:
			a.lmConfig.providerFilter += k.Text
			a.lmConfigSelectFirstFiltered()
			return a, a.lmConfigSyncFromPreset()
		case lmFieldAPIBase:
			a.lmConfig.apiBase += k.Text
			a.lmConfigInvalidateCurrentCatalog()
		case lmFieldModel:
			a.lmConfig.modelFilter += k.Text
			a.lmConfigSelectFirstFilteredModel()
		case lmFieldAPIKey:
			a.lmConfig.apiKey += k.Text
		}
	}
	return a, nil
}

func (a *App) refreshLMConfig() tea.Cmd {
	if a.lmConfig == nil {
		return nil
	}
	a.lmConfig.err = nil
	if p := a.lmConfigCurrentPreset(); p != nil && !lmConfigSupportsLiveCatalog(*p) {
		a.lmConfigInvalidateCurrentCatalog()
		return a.lmConfigSyncFromPreset()
	}
	if pid := a.lmConfigCurrentPresetID(); pid != "" {
		delete(a.lmConfig.modelCatalogs, pid)
		delete(a.lmConfig.modelCatalogWarnings, pid)
		delete(a.lmConfig.modelCatalogSources, pid)
		delete(a.lmConfig.modelCatalogPending, pid)
		if p := a.lmConfigCurrentPreset(); p != nil {
			return a.lmConfigQueueModelFetch(*p, a.lmConfig.apiBase)
		}
	}
	return lmConfigFetchCmd(a.c)
}

func (a *App) handleLMConfigPaste(content string) tea.Cmd {
	if a.lmConfig == nil || content == "" {
		return nil
	}
	text := strings.TrimSpace(strings.ReplaceAll(content, "\r\n", "\n"))
	if text == "" {
		return nil
	}
	switch a.lmConfig.field {
	case lmFieldPreset:
		a.lmConfig.providerFilter += strings.ReplaceAll(text, "\n", " ")
		a.lmConfigSelectFirstFiltered()
		return a.lmConfigSyncFromPreset()
	case lmFieldAPIBase:
		a.lmConfig.apiBase += strings.ReplaceAll(text, "\n", "")
		a.lmConfigInvalidateCurrentCatalog()
	case lmFieldModel:
		a.lmConfig.modelFilter += strings.ReplaceAll(text, "\n", " ")
		a.lmConfigSelectFirstFilteredModel()
	case lmFieldAPIKey:
		a.lmConfig.apiKey += strings.ReplaceAll(text, "\n", "")
	}
	return nil
}

func (a *App) handleLMConfigVertical(delta int) (tea.Model, tea.Cmd) {
	if a.lmConfig == nil {
		return a, nil
	}
	switch a.lmConfig.field {
	case lmFieldPreset:
		if a.lmConfig.info == nil {
			return a, nil
		}
		indexes := a.lmConfigProviderIndexes()
		n := len(indexes)
		if n == 0 {
			return a, nil
		}
		pos := 0
		for i, idx := range indexes {
			if idx == a.lmConfig.selected {
				pos = i
				break
			}
		}
		a.lmConfig.selected = indexes[((pos+delta)%n+n)%n]
		cmd := a.lmConfigSyncFromPreset()
		return a, cmd
	case lmFieldModel:
		if a.lmConfig.info == nil {
			return a, nil
		}
		pid := a.lmConfigCurrentPresetID()
		catalog := a.lmConfig.modelCatalogs[pid]
		indexes := a.lmConfigModelIndexes()
		n := len(indexes)
		if n == 0 {
			return a, nil
		}
		cur := a.lmConfig.modelIndex
		pos := 0
		for i, idx := range indexes {
			if idx == cur {
				pos = i
				break
			}
			if catalog[idx].ID == a.lmConfig.model {
				pos = i
				if cur < 0 {
					cur = idx
					break
				}
			}
		}
		a.lmConfig.modelIndex = indexes[((pos+delta)%n+n)%n]
		a.lmConfig.model = catalog[a.lmConfig.modelIndex].ID
	case lmFieldTemperature, lmFieldMaxTokens, lmFieldContextLength, lmFieldThinkingBudget:
		fields := a.lmConfig.lmConfigAdvancedFields()
		if len(fields) == 0 {
			return a, nil
		}
		pos := 0
		for i, field := range fields {
			if field == a.lmConfig.field {
				pos = i
				break
			}
		}
		a.lmConfig.field = fields[((pos+delta)%len(fields)+len(fields))%len(fields)]
	}
	return a, nil
}

func (a *App) handleLMConfigProviderWheel(button tea.MouseButton) tea.Cmd {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return nil
	}
	indexes := a.lmConfigProviderIndexes()
	if len(indexes) == 0 {
		return nil
	}
	pos := 0
	for i, idx := range indexes {
		if idx == a.lmConfig.selected {
			pos = i
			break
		}
	}
	next := moveSelectionByWheel(pos, len(indexes), button)
	if next == pos {
		a.lmConfig.field = lmFieldPreset
		return nil
	}
	a.lmConfig.field = lmFieldPreset
	a.lmConfig.selected = indexes[next]
	return a.lmConfigSyncFromPreset()
}

func (a *App) handleLMConfigModelWheel(button tea.MouseButton) tea.Cmd {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return nil
	}
	pid := a.lmConfigCurrentPresetID()
	catalog := a.lmConfig.modelCatalogs[pid]
	indexes := a.lmConfigModelIndexes()
	if len(indexes) == 0 || len(catalog) == 0 {
		return nil
	}
	cur := a.lmConfig.modelIndex
	pos := 0
	for i, idx := range indexes {
		if idx == cur || (idx >= 0 && idx < len(catalog) && catalog[idx].ID == a.lmConfig.model) {
			pos = i
			break
		}
	}
	next := moveSelectionByWheel(pos, len(indexes), button)
	a.lmConfig.field = lmFieldModel
	modelIdx := indexes[next]
	if modelIdx < 0 || modelIdx >= len(catalog) {
		return nil
	}
	a.lmConfig.modelIndex = modelIdx
	a.lmConfig.model = catalog[modelIdx].ID
	return nil
}

func (a *App) handleLMConfigAdvancedWheel(button tea.MouseButton) {
	if a.lmConfig == nil {
		return
	}
	fields := a.lmConfig.lmConfigAdvancedFields()
	if len(fields) == 0 {
		return
	}
	pos := 0
	for i, field := range fields {
		if field == a.lmConfig.field {
			pos = i
			break
		}
	}
	a.lmConfig.field = fields[moveSelectionByWheel(pos, len(fields), button)]
}

func (a *App) lmConfigInvalidateCurrentCatalog() {
	if a.lmConfig == nil {
		return
	}
	pid := a.lmConfigCurrentPresetID()
	if pid == "" {
		return
	}
	delete(a.lmConfig.modelCatalogs, pid)
	delete(a.lmConfig.modelCatalogWarnings, pid)
	delete(a.lmConfig.modelCatalogSources, pid)
	delete(a.lmConfig.modelCatalogPending, pid)
}

func (a *App) lmConfigProviderIndexes() []int {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return nil
	}
	filter := strings.ToLower(strings.TrimSpace(a.lmConfig.providerFilter))
	indexes := make([]int, 0, len(a.lmConfig.info.Presets))
	for i, p := range a.lmConfig.info.Presets {
		if filter == "" ||
			strings.Contains(strings.ToLower(p.Label), filter) ||
			strings.Contains(strings.ToLower(p.ID), filter) ||
			strings.Contains(strings.ToLower(p.Provider), filter) {
			indexes = append(indexes, i)
		}
	}
	return indexes
}

func (a *App) lmConfigModelIndexes() []int {
	if a.lmConfig == nil {
		return nil
	}
	pid := a.lmConfigCurrentPresetID()
	catalog := a.lmConfig.modelCatalogs[pid]
	filter := strings.ToLower(strings.TrimSpace(a.lmConfig.modelFilter))
	indexes := make([]int, 0, len(catalog))
	for i, m := range catalog {
		haystack := strings.ToLower(strings.TrimSpace(m.ID + " " + m.Name + " " + m.Description))
		if filter == "" || strings.Contains(haystack, filter) {
			indexes = append(indexes, i)
		}
	}
	return indexes
}

func (a *App) lmConfigSelectFirstFiltered() {
	indexes := a.lmConfigProviderIndexes()
	if len(indexes) == 0 {
		return
	}
	for _, idx := range indexes {
		if idx == a.lmConfig.selected {
			return
		}
	}
	a.lmConfig.selected = indexes[0]
}

func (a *App) lmConfigSelectFirstFilteredModel() {
	if a.lmConfig == nil {
		return
	}
	pid := a.lmConfigCurrentPresetID()
	catalog := a.lmConfig.modelCatalogs[pid]
	indexes := a.lmConfigModelIndexes()
	if len(indexes) == 0 {
		a.lmConfig.modelIndex = -1
		return
	}
	for _, idx := range indexes {
		if idx == a.lmConfig.modelIndex {
			a.lmConfig.model = catalog[idx].ID
			return
		}
	}
	idx := indexes[0]
	a.lmConfig.modelIndex = idx
	a.lmConfig.model = catalog[idx].ID
}

func (a *App) lmConfigSelectDefaultPreset() {
	if a.lmConfig == nil || a.lmConfig.info == nil || len(a.lmConfig.info.Presets) == 0 {
		return
	}
	wantProvider := strings.TrimSpace(a.lmConfig.info.Provider)
	wantModel := strings.TrimSpace(a.lmConfig.info.Model)
	for i, p := range a.lmConfig.info.Presets {
		if wantProvider != "" && p.Provider == wantProvider {
			if wantModel == "" || p.SuggestedModel == wantModel || p.ID == wantProvider {
				a.lmConfig.selected = i
				return
			}
		}
	}
	for i, p := range a.lmConfig.info.Presets {
		if p.ID == "lm_studio" {
			a.lmConfig.selected = i
			return
		}
	}
	a.lmConfig.selected = 0
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
	a.lmConfig.apiBase = p.APIBase
	a.lmConfig.modelIndex = -1
	a.lmConfig.modelFilter = ""
	a.lmConfig.temperature = ""
	a.lmConfig.maxTokens = ""
	a.lmConfig.contextLength = ""
	a.lmConfig.thinkingBudget = ""
	currentAPIBase := strings.TrimRight(strings.TrimSpace(a.lmConfig.info.APIBase), "/")
	presetAPIBase := strings.TrimRight(strings.TrimSpace(p.APIBase), "/")
	samePreset := a.lmConfig.info.Provider == p.Provider &&
		(currentAPIBase == "" || presetAPIBase == "" || strings.EqualFold(currentAPIBase, presetAPIBase))
	if samePreset {
		if strings.TrimSpace(a.lmConfig.info.Model) != "" {
			a.lmConfig.model = a.lmConfig.info.Model
		}
		if strings.TrimSpace(a.lmConfig.info.APIBase) != "" {
			a.lmConfig.apiBase = a.lmConfig.info.APIBase
		}
		if a.lmConfig.info.Temperature != 0 {
			a.lmConfig.temperature = fmt.Sprintf("%.1f", a.lmConfig.info.Temperature)
		}
		if a.lmConfig.info.MaxTokens > 0 {
			a.lmConfig.maxTokens = fmt.Sprintf("%d", a.lmConfig.info.MaxTokens)
		}
		if a.lmConfig.info.ContextLength > 0 {
			a.lmConfig.contextLength = fmt.Sprintf("%d", a.lmConfig.info.ContextLength)
		}
		if a.lmConfig.info.ThinkingBudget > 0 {
			a.lmConfig.thinkingBudget = fmt.Sprintf("%d", a.lmConfig.info.ThinkingBudget)
		}
	}
	if a.lmConfig.modelCatalogs == nil {
		a.lmConfig.modelCatalogs = map[string][]gact.Model{}
	}
	if a.lmConfig.modelCatalogWarnings == nil {
		a.lmConfig.modelCatalogWarnings = map[string]string{}
	}
	if a.lmConfig.modelCatalogSources == nil {
		a.lmConfig.modelCatalogSources = map[string]string{}
	}
	if a.lmConfig.modelCatalogPending == nil {
		a.lmConfig.modelCatalogPending = map[string]bool{}
	}
	if a.lmConfig.modelCatalogRetries == nil {
		a.lmConfig.modelCatalogRetries = map[string]int{}
	}
	a.lmConfig.lmConfigEnsureVisibleField()
	a.lmConfigSnapModelToCatalog(p)
	return a.lmConfigQueueModelFetch(p, a.lmConfig.apiBase)
}

func (a *App) lmConfigSnapModelToCatalog(p client.LMProviderPreset) {
	if a.lmConfig == nil {
		return
	}
	if strings.TrimSpace(a.lmConfig.modelCatalogWarnings[p.ID]) != "" {
		return
	}
	catalog := a.lmConfig.modelCatalogs[p.ID]
	if len(catalog) == 0 {
		return
	}
	target := strings.TrimSpace(a.lmConfig.model)
	if target == "" {
		target = p.SuggestedModel
	}
	idx := 0
	for i, model := range catalog {
		if model.ID == target || model.ID == p.SuggestedModel {
			idx = i
			break
		}
	}
	a.lmConfig.modelIndex = idx
	a.lmConfig.model = catalog[idx].ID
}

func (a *App) lmConfigQueueModelFetch(p client.LMProviderPreset, apiBaseOverride string) tea.Cmd {
	if a.lmConfig == nil {
		return nil
	}
	if _, cached := a.lmConfig.modelCatalogSources[p.ID]; cached {
		return nil
	}
	if a.lmConfig.modelCatalogPending[p.ID] {
		return nil
	}
	a.lmConfig.modelCatalogPending[p.ID] = true
	return lmConfigFetchModelsCmd(a.c, p.ID, apiBaseOverride)
}

func (a *App) lmConfigBackgroundProbeCmds() []tea.Cmd {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return nil
	}
	cmds := []tea.Cmd{}
	selectedID := a.lmConfigCurrentPresetID()
	for _, p := range a.lmConfig.info.Presets {
		if p.ID == selectedID {
			continue
		}
		if !lmConfigSupportsLiveCatalog(p) {
			continue
		}
		if p.Status != "" && p.Status != "unknown" && p.Status != "ready" {
			continue
		}
		if cmd := a.lmConfigQueueModelFetch(p, p.APIBase); cmd != nil {
			cmds = append(cmds, cmd)
		}
	}
	return cmds
}

func (a *App) lmConfigMaybeRetryModelFetch(presetID string) tea.Cmd {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return nil
	}
	warning := strings.TrimSpace(a.lmConfig.modelCatalogWarnings[presetID])
	if warning == "" {
		return nil
	}
	var preset *client.LMProviderPreset
	for i := range a.lmConfig.info.Presets {
		if a.lmConfig.info.Presets[i].ID == presetID {
			preset = &a.lmConfig.info.Presets[i]
			break
		}
	}
	if preset == nil || !lmConfigIsLocalLiveProvider(*preset) {
		return nil
	}
	if a.lmConfig.modelCatalogRetries[presetID] >= 3 {
		return nil
	}
	a.lmConfig.modelCatalogRetries[presetID]++
	return lmConfigRetryFetchModelsCmd(a.c, presetID, preset.APIBase, 2*time.Second)
}

func lmConfigIsLocalLiveProvider(p client.LMProviderPreset) bool {
	if !lmConfigSupportsLiveCatalog(p) {
		return false
	}
	base := strings.ToLower(strings.TrimSpace(p.APIBase))
	return p.Provider == "lm_studio" ||
		p.Provider == "ollama" ||
		strings.Contains(base, "127.0.0.1") ||
		strings.Contains(base, "localhost")
}

func lmConfigSupportsLiveCatalog(p client.LMProviderPreset) bool {
	if p.SupportsLiveCatalog {
		return true
	}
	base := strings.ToLower(strings.TrimSpace(p.APIBase))
	if strings.HasPrefix(base, "codex://") || strings.HasPrefix(base, "claude-code://") {
		return false
	}
	return p.Provider != "codex" && p.Provider != "claude_code"
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

func lmConfigProviderID(p client.LMProviderPreset) string {
	if id := strings.TrimSpace(p.ID); id != "" {
		return id
	}
	return strings.TrimSpace(p.Provider)
}

func lmConfigProviderModelSummary(provider, model string) string {
	provider = strings.TrimSpace(provider)
	model = strings.TrimSpace(model)
	switch {
	case provider != "" && model != "":
		return provider + "/" + model
	case provider != "":
		return provider
	default:
		return model
	}
}

func lmConfigNormalizedAPIBase(base string) string {
	return strings.TrimRight(strings.TrimSpace(base), "/")
}

func (a *App) lmConfigCurrentPreset() *client.LMProviderPreset {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return nil
	}
	if a.lmConfig.selected < 0 || a.lmConfig.selected >= len(a.lmConfig.info.Presets) {
		return nil
	}
	return &a.lmConfig.info.Presets[a.lmConfig.selected]
}

func (a *App) lmConfigAppliedSummary() string {
	if a.lmConfig == nil || a.lmConfig.info == nil || !a.lmConfig.info.Configured {
		return ""
	}
	return lmConfigProviderModelSummary(a.lmConfig.info.Provider, a.lmConfig.info.Model)
}

func (a *App) lmConfigPendingSummary(p client.LMProviderPreset) string {
	if a.lmConfig == nil {
		return ""
	}
	return lmConfigProviderModelSummary(lmConfigProviderID(p), a.lmConfig.model)
}

func (a *App) lmConfigPendingDiffersFromApplied(p client.LMProviderPreset) bool {
	if a.lmConfig == nil || a.lmConfig.info == nil || !a.lmConfig.info.Configured {
		return false
	}
	info := a.lmConfig.info
	appliedProvider := strings.TrimSpace(info.Provider)
	pendingProviderID := lmConfigProviderID(p)
	pendingProviderKind := strings.TrimSpace(p.Provider)
	providerMatches := appliedProvider != "" &&
		(strings.EqualFold(appliedProvider, pendingProviderID) || strings.EqualFold(appliedProvider, pendingProviderKind))
	modelMatches := strings.EqualFold(strings.TrimSpace(info.Model), strings.TrimSpace(a.lmConfig.model))
	appliedBase := lmConfigNormalizedAPIBase(info.APIBase)
	pendingBase := lmConfigNormalizedAPIBase(a.lmConfig.apiBase)
	apiBaseMatches := appliedBase == "" || pendingBase == "" || strings.EqualFold(appliedBase, pendingBase)
	return !providerMatches || !modelMatches || !apiBaseMatches
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
	source   string // "live" / "static_catalog" / "unavailable" / ""
	warning  string // backend error message, empty when live
	err      error  // transport-level failure (different from a backend warning)
}

// lmConfigFetchModelsCmd issues GET /v1/providers/{preset_id}/models
// (the backend resolves preset id → cluster + framework path) and
// surfaces source + warning so the picker can render "stale because X".
func lmConfigFetchModelsCmd(c *client.Client, presetID string, apiBaseOverride string) tea.Cmd {
	return func() tea.Msg {
		timeout := 5 * time.Second
		if strings.HasPrefix(presetID, "argonne_") {
			timeout = 20 * time.Second
		}
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		resp, err := c.ListProviderModelsDetailed(ctx, presetID, apiBaseOverride)
		return lmConfigModelsLoadedMsg{
			presetID: presetID,
			models:   resp.Models,
			source:   resp.Source,
			warning:  resp.Error,
			err:      err,
		}
	}
}

func lmConfigRetryFetchModelsCmd(
	c *client.Client,
	presetID string,
	apiBaseOverride string,
	delay time.Duration,
) tea.Cmd {
	return tea.Tick(delay, func(time.Time) tea.Msg {
		timeout := 5 * time.Second
		if strings.HasPrefix(presetID, "argonne_") {
			timeout = 20 * time.Second
		}
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		resp, err := c.ListProviderModelsDetailed(ctx, presetID, apiBaseOverride)
		return lmConfigModelsLoadedMsg{
			presetID: presetID,
			models:   resp.Models,
			source:   resp.Source,
			warning:  resp.Error,
			err:      err,
		}
	})
}

func (a *App) lmConfigDispatch() tea.Cmd {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return nil
	}
	if a.lmConfig.selected < 0 || a.lmConfig.selected >= len(a.lmConfig.info.Presets) {
		return nil
	}
	p := a.lmConfig.info.Presets[a.lmConfig.selected]
	if !a.lmConfigCanSave(p) {
		return nil
	}
	model := a.lmConfig.model
	if model == "" {
		model = p.SuggestedModel
	}
	a.lmConfig.saving = true
	a.lmConfig.err = nil

	// Two save paths share the same picker UI:
	//   1. session-patch: PATCH /v1/sessions/{sid} with just a
	//      ModelRef. Reserved for backends that implement per-session
	//      model refs. CLIO does not use this path.
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
		ref := &gact.ModelRef{ProviderID: lmConfigProviderID(p), ModelID: model}
		return applySettingsCmd(a.c, sid, ref, nil)
	}

	apiKey := strings.TrimSpace(a.lmConfig.apiKey)
	if apiKey == "" && lmConfigNeedsPlaceholderAPIKey(p, a.lmConfig.apiBase) {
		apiKey = "x"
	}
	req := client.LMProviderRequest{
		Provider: lmConfigProviderID(p),
		APIBase:  a.lmConfig.apiBase,
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
	if a.lmConfig.contextLength != "" {
		if v, err := strconv.Atoi(a.lmConfig.contextLength); err == nil {
			req.ContextLength = v
		}
	}
	if a.lmConfig.thinkingBudget != "" {
		if v, err := strconv.Atoi(a.lmConfig.thinkingBudget); err == nil {
			req.ThinkingBudget = v
		}
	}
	return lmConfigSaveCmd(a.c, req)
}

func lmConfigNeedsPlaceholderAPIKey(p client.LMProviderPreset, apiBase string) bool {
	if p.RequiresAPIKey || p.AuthMethod == "oauth" || p.Provider == "argonne" {
		return false
	}
	switch p.Provider {
	case "lm_studio", "ollama":
		return true
	case "openai":
		base := strings.ToLower(strings.TrimSpace(apiBase))
		return strings.Contains(base, "127.0.0.1") || strings.Contains(base, "localhost")
	default:
		return false
	}
}

func (a *App) lmConfigCanSave(p client.LMProviderPreset) bool {
	if a.lmConfig == nil {
		return false
	}
	if a.lmConfigPresetPending(p) || a.lmConfigPresetProblem(p) != "" {
		return false
	}
	if p.RequiresAPIKey && strings.TrimSpace(a.lmConfig.apiKey) == "" {
		return false
	}
	return a.lmConfig.lmConfigSelectedModelSelectable()
}

func (a *App) closeLMConfigModal() {
	a.lmConfigOpen = false
	a.lmConfig = nil
}

// viewLMConfig renders the modal.
func (a *App) viewLMConfig() string {
	if !a.lmConfigOpen || a.lmConfig == nil {
		return ""
	}
	t := a.Theme
	w := a.lmConfigModalWidth()
	chromeW := modalInnerWidth(w)
	contentW := maxInt(20, modalBodyContentWidth(w))

	buttons := []menuButton{
		{
			id:    "lm-config:refresh",
			label: "refresh",
			action: func(app *App) tea.Cmd {
				return app.refreshLMConfig()
			},
		},
		closeMenuButton("lm-config:close", func(app *App) { app.closeLMConfigModal() }),
	}
	intro := lipgloss.NewStyle().Foreground(t.FgMuted).
		Background(t.Bg).Width(chromeW).
		Render(a.localizer.t(msgLMConfigIntro, nil))

	var body string
	switch {
	case a.lmConfig.loading:
		body = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(a.localizer.t(msgLMConfigFetching, nil))
	case a.lmConfig.err != nil:
		body = lipgloss.NewStyle().Foreground(t.Danger).
			Render(a.localizer.t(msgLMConfigSaveFailed,
				map[string]string{"error": a.lmConfig.err.Error()})) + "\n\n" +
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(a.localizer.t(msgLMConfigSaveRetry, nil))
	case a.lmConfig.info == nil:
		body = lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render(a.localizer.t(msgLMConfigNoEndpoint, nil))
	default:
		body = a.renderLMConfigBody(contentW, a.lmConfigBodyRows())
	}

	hint := lipgloss.NewStyle().Background(t.Bg).Width(contentW).
		Render(t.HintLabel.Render(
			a.localizer.t(msgLMConfigHint, nil),
		))
	bodyParts := []string{intro, "", body}
	if a.lmConfig.saving {
		savingText := a.localizer.t(msgLMConfigSaving, nil)
		if a.lmConfig.info != nil && a.lmConfig.info.State == "configuring" {
			savingText = a.localizer.t(msgLMConfigConfiguring, nil)
		}
		bodyParts = append(bodyParts, "",
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(savingText))
	}
	body = lipgloss.JoinVertical(lipgloss.Left, bodyParts...)
	rendered := a.renderModalFrameWithLayout(modalFrameOptions{
		width:              w,
		title:              a.localizer.t(msgLMConfigTitle, nil),
		background:         t.Bg,
		buttons:            buttons,
		suppressButtonHits: a.lmConfig.saving || a.lmConfig.authenticating,
		body:               body,
		footer:             hint,
	})
	a.registerModalSurfaceWheel(rendered, "lm-config")
	if a.lmConfig.info != nil && !a.lmConfig.loading && a.lmConfig.err == nil && !a.lmConfig.saving && !a.lmConfig.authenticating {
		introRows := maxInt(1, strings.Count(ansi.Strip(intro), "\n")+1)
		a.registerLMConfigHitTargets(rendered.modal, rendered.bodyRow+introRows+1, contentW, a.lmConfigBodyRows())
	}
	return rendered.modal
}

func (a *App) registerLMConfigHitTargets(modal string, bodyTop, innerW int, bodyRows int) {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return
	}
	layout := a.lmConfigLayout(innerW, bodyRows)
	leftW, rightW := lmConfigGridWidths(innerW)
	stacked := leftW < 38 || rightW < 38
	providerTop := bodyTop
	selectedTop := bodyTop
	modelTop := bodyTop
	advancedTop := bodyTop
	modelCol := 0
	selectedCol := 0
	providerW := leftW
	selectedW := rightW
	modelW := leftW
	advancedW := rightW
	advancedCol := leftW + 2
	if stacked {
		providerW = innerW
		selectedW = innerW
		modelW = innerW
		advancedW = innerW
		advancedCol = 0
		selectedTop = providerTop + lmConfigBoxHeight(layout.providerRows) + layout.gridGapRows
		modelTop = selectedTop + lmConfigBoxHeight(layout.selectedRows) + layout.gridGapRows
		advancedTop = modelTop + lmConfigBoxHeight(layout.modelRows) + layout.gridGapRows
	} else {
		selectedCol = leftW + 2
		if layout.compact {
			a.registerLMConfigProviderWheelHit(modal, providerTop, 0, leftW, layout.providerRows)
			a.registerLMConfigProviderHeaderHit(modal, providerTop, 0, leftW)
			a.registerLMConfigProviderHits(modal, providerTop, 0, leftW, layout.providerRows)
			a.registerLMConfigProviderRailHits(modal, providerTop, 0, leftW, layout.providerRows)
			a.registerLMConfigProviderActionHits(modal, selectedTop, selectedCol, rightW, layout.selectedRows)
			return
		}
		modelTop = providerTop + lmConfigBoxHeight(layout.providerRows) + layout.gridGapRows
		advancedTop = modelTop
	}
	a.registerLMConfigProviderWheelHit(modal, providerTop, 0, providerW, layout.providerRows)
	a.registerLMConfigProviderHeaderHit(modal, providerTop, 0, providerW)
	a.registerLMConfigProviderHits(modal, providerTop, 0, providerW, layout.providerRows)
	a.registerLMConfigProviderRailHits(modal, providerTop, 0, providerW, layout.providerRows)
	a.registerLMConfigProviderActionHits(modal, selectedTop, selectedCol, selectedW, layout.selectedRows)
	a.registerLMConfigModelWheelHit(modal, modelTop, modelCol, modelW, layout.modelRows)
	a.registerLMConfigModelHeaderHit(modal, modelTop, modelCol, modelW)
	a.registerLMConfigModelHits(modal, modelTop, modelCol, modelW, layout.modelRows)
	a.registerLMConfigModelRailHits(modal, modelTop, modelCol, modelW, layout.modelRows)
	a.registerLMConfigAdvancedWheelHit(modal, advancedTop, advancedCol, advancedW, layout.configRows)
	a.registerLMConfigAdvancedHits(modal, advancedTop, advancedCol, advancedW)
	a.registerLMConfigSaveHit(modal, bodyTop, innerW, bodyRows, layout)
}

func lmConfigBoxHeight(visibleRows int) int {
	return maxInt(1, visibleRows) + 3
}

func (a *App) registerLMConfigProviderWheelHit(modal string, top, col, width, visibleRows int) {
	a.registerLMConfigBoxWheelRegion(modal, "lm-config:provider:wheel", top, col, width, visibleRows, func(app *App, button tea.MouseButton) tea.Cmd {
		return app.handleLMConfigProviderWheel(button)
	})
}

func (a *App) registerLMConfigProviderHeaderHit(modal string, top, col, width int) {
	a.registerModalCellHits(modal, 0, []modalCellHit{{
		id:    "lm-config:provider:filter",
		row:   top + 1,
		col:   col,
		width: width,
		action: func(app *App) tea.Cmd {
			if app.lmConfig != nil {
				app.lmConfig.field = lmFieldPreset
			}
			return nil
		},
	}})
}

func (a *App) registerLMConfigModelWheelHit(modal string, top, col, width, visibleRows int) {
	a.registerLMConfigBoxWheelRegion(modal, "lm-config:model:wheel", top, col, width, visibleRows, func(app *App, button tea.MouseButton) tea.Cmd {
		return app.handleLMConfigModelWheel(button)
	})
}

func (a *App) registerLMConfigProviderRailHits(modal string, top, col, width, visibleRows int) {
	if a.lmConfig == nil || a.lmConfig.info == nil || visibleRows <= 1 {
		return
	}
	indexes := a.lmConfigProviderIndexes()
	railCol := lmConfigBoxRailCol(col, width)
	a.registerModalIndexedListRailHits(modal, "lm-config:provider", lmConfigBoxContentTop(top), railCol, visibleRows, indexes, func(app *App, presetIdx int) tea.Cmd {
		if app.lmConfig == nil || app.lmConfig.info == nil {
			return nil
		}
		if presetIdx < 0 || presetIdx >= len(app.lmConfig.info.Presets) {
			return nil
		}
		app.lmConfig.field = lmFieldPreset
		app.lmConfig.selected = presetIdx
		return app.lmConfigSyncFromPreset()
	})
}

func (a *App) registerLMConfigModelRailHits(modal string, top, col, width, visibleRows int) {
	if a.lmConfig == nil || a.lmConfig.info == nil || visibleRows <= 1 {
		return
	}
	modelIndexes := a.lmConfigModelIndexes()
	railCol := lmConfigBoxRailCol(col, width)
	a.registerModalIndexedListRailHits(modal, "lm-config:model", lmConfigBoxContentTop(top), railCol, visibleRows, modelIndexes, func(app *App, modelIdx int) tea.Cmd {
		if app.lmConfig == nil {
			return nil
		}
		pid := app.lmConfigCurrentPresetID()
		catalog := app.lmConfig.modelCatalogs[pid]
		if modelIdx < 0 || modelIdx >= len(catalog) {
			return nil
		}
		app.lmConfig.field = lmFieldModel
		app.lmConfig.modelIndex = modelIdx
		app.lmConfig.model = catalog[modelIdx].ID
		return nil
	})
}

func (a *App) registerLMConfigModelHeaderHit(modal string, top, col, width int) {
	if a.lmConfig == nil || !a.lmConfig.lmConfigSelectedModelSelectable() {
		return
	}
	a.registerModalCellHits(modal, 0, []modalCellHit{{
		id:    "lm-config:model:filter",
		row:   top + 1,
		col:   col,
		width: width,
		action: func(app *App) tea.Cmd {
			if app.lmConfig != nil {
				app.lmConfig.field = lmFieldModel
			}
			return nil
		},
	}})
}

func (a *App) registerLMConfigAdvancedWheelHit(modal string, top, col, width, visibleRows int) {
	a.registerLMConfigBoxWheelRegion(modal, "lm-config:advanced:wheel", top, col, width, visibleRows, func(app *App, button tea.MouseButton) tea.Cmd {
		app.handleLMConfigAdvancedWheel(button)
		return nil
	})
}

func (a *App) registerLMConfigProviderHits(modal string, top, col, width, visibleRows int) {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return
	}
	list, _ := a.lmConfigProviderModalList(width, visibleRows)
	if len(list.hits) == 0 {
		return
	}
	a.registerLMConfigBoxListRegion(modal, top, col, width, list)
}

func (a *App) registerLMConfigProviderActionHits(modal string, top, col, width, visibleRows int) {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return
	}
	_, hits := a.renderLMConfigProviderDetailsRowsAndHits(width, visibleRows)
	a.registerLMConfigBoxCellHits(modal, top, col, hits)
}

func (a *App) registerLMConfigModelHits(modal string, top, col, width, visibleRows int) {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return
	}
	list, _ := a.lmConfigModelModalList(width, visibleRows)
	if len(list.hits) == 0 {
		return
	}
	a.registerLMConfigBoxListRegion(modal, top, col, width, list)
}

func (a *App) registerLMConfigBoxListRegion(modal string, top int, col int, width int, list modalListRender) {
	a.registerModalListRegion(modal, lmConfigBoxContentTop(top), col, width, list, "", nil)
}

func (a *App) registerLMConfigAdvancedHits(modal string, top, col, width int) {
	if a.lmConfig == nil {
		return
	}
	_, hits := a.renderLMConfigAdvancedRowsAndHits(width)
	a.registerLMConfigBoxCellHits(modal, top, col, hits)
}

func (a *App) registerLMConfigBoxCellHits(modal string, top int, col int, hits []modalCellHit) {
	a.registerModalCellHitsAt(modal, lmConfigBoxContentTop(top), col, hits)
}

func (a *App) registerLMConfigBoxWheelRegion(modal string, id string, top int, col int, width int, visibleRows int, action uiWheelAction) {
	if visibleRows <= 0 {
		return
	}
	a.registerModalWheelRegion(modal, id, top, col, width, lmConfigBoxHeight(visibleRows), action)
}

func (a *App) registerLMConfigSaveHit(modal string, bodyTop, innerW, bodyRows int, layout lmConfigLayout) {
	if layout.buttonRows <= 0 {
		return
	}
	canSave := false
	if p := a.lmConfigCurrentPreset(); p != nil {
		canSave = a.lmConfigCanSave(*p)
	}
	if !canSave {
		return
	}
	row := bodyTop + bodyRows - layout.buttonRows
	if layout.buttonRows >= 3 {
		row++
	}
	buttons := []menuButton{a.lmConfigSaveMenuButton(false)}
	_, startCol := a.renderCenteredModalButtons(innerW, buttons, -1)
	a.registerModalButtons(modal, row, startCol, buttons)
}

func (a *App) lmConfigSaveMenuButton(disabled bool) menuButton {
	return menuButton{
		id:       "lm-config:save",
		label:    "Save and connect",
		disabled: disabled,
		action: func(app *App) tea.Cmd {
			if app.lmConfig == nil {
				return nil
			}
			app.lmConfig.field = lmFieldSave
			return app.lmConfigDispatch()
		},
	}
}

func (a *App) renderLMConfigBody(innerW int, bodyRows int) string {
	t := a.Theme
	if a.lmConfig.info == nil {
		return ""
	}
	layout := a.lmConfigLayout(innerW, bodyRows)

	rows := []string{}

	leftW, rightW := lmConfigGridWidths(innerW)
	if leftW < 38 || rightW < 38 {
		rows = append(rows, a.renderLMConfigProviderList(innerW, layout.providerRows))
		if layout.gridGapRows > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, a.renderLMConfigProviderDetails(innerW, layout.selectedRows))
		if layout.gridGapRows > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, a.renderLMConfigModelList(innerW, layout.modelRows))
		if layout.gridGapRows > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, a.renderLMConfigAdvancedBox(innerW, layout.configRows))
	} else {
		top := lipgloss.JoinHorizontal(
			lipgloss.Top,
			a.renderLMConfigProviderList(leftW, layout.providerRows),
			"  ",
			a.renderLMConfigProviderDetails(rightW, layout.selectedRows),
		)
		if layout.compact {
			rows = append(rows, top)
			return lmConfigFillBlock(strings.Join(rows, "\n"), innerW, bodyRows, t.Bg)
		}
		bottom := lipgloss.JoinHorizontal(
			lipgloss.Top,
			a.renderLMConfigModelList(leftW, layout.modelRows),
			"  ",
			a.renderLMConfigAdvancedBox(rightW, layout.configRows),
		)
		rows = append(rows, top)
		if layout.gridGapRows > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, bottom)
	}
	canSave := false
	if p := a.lmConfigCurrentPreset(); p != nil {
		canSave = a.lmConfigCanSave(*p)
	}
	if layout.buttonRows > 0 {
		buttons := []menuButton{a.lmConfigSaveMenuButton(!canSave)}
		selected := -1
		if a.lmConfig.field == lmFieldSave && canSave {
			selected = 0
		}
		button, _ := a.renderCenteredModalButtons(innerW, buttons, selected)
		spacerRows := bodyRows - renderedLineCount(rows) - layout.buttonRows
		for i := 0; i < spacerRows; i++ {
			rows = append(rows, "")
		}
		if layout.buttonRows >= 3 {
			rows = append(rows, "")
		}
		rows = append(rows, button)
	}

	return lmConfigFillBlock(strings.Join(rows, "\n"), innerW, bodyRows, t.Bg)
}

func renderedLineCount(parts []string) int {
	total := 0
	for _, part := range parts {
		if part == "" {
			total++
			continue
		}
		total += strings.Count(part, "\n") + 1
	}
	return total
}

func (a *App) lmConfigBodyRows() int {
	if a.height <= 0 {
		return 18
	}
	// Modal chrome is title, intro, hint, their spacing, and the outer
	// border/padding. Keep the body short enough that provider setup
	// shares the fixed overlay origin used by the other menu families.
	rows := a.height - 14
	if a.height <= 28 {
		// Very short terminals need the older budget so the save action
		// remains visible; the overlay already has no vertical slack there.
		rows = a.height - 12
	}
	if a.lmConfig != nil && a.lmConfig.saving {
		rows -= 2
	}
	return maxInt(4, rows)
}

func (a *App) lmConfigLayout(innerW int, bodyRows int) lmConfigLayout {
	leftW, rightW := lmConfigGridWidths(innerW)
	stacked := leftW < 38 || rightW < 38

	buttonRows := 0
	if bodyRows >= 12 {
		buttonRows = 3
	}
	gridRows := bodyRows - buttonRows
	if buttonRows > 0 && gridRows >= 10 {
		gridRows--
	}
	gridGapRows := 0
	if gridRows >= 9 {
		gridGapRows = 1
	}

	providerCount := 1
	if a.lmConfig != nil {
		providerCount = maxInt(1, len(a.lmConfigProviderIndexes()))
	}
	modelCount := a.lmConfigSelectableModelCount()
	if modelCount == 0 {
		modelCount = 1
	}
	configCount := maxInt(1, len(a.lmConfig.lmConfigAdvancedFields()))

	if !stacked && bodyRows < 9 {
		topBodyRows := maxInt(1, bodyRows-3)
		return lmConfigLayout{
			bodyRows:     bodyRows,
			providerRows: topBodyRows,
			selectedRows: topBodyRows,
			modelRows:    0,
			configRows:   0,
			gridGapRows:  0,
			buttonRows:   0,
			compact:      true,
		}
	}

	if stacked {
		cellBodyRows := maxInt(1, (gridRows-(3*gridGapRows))/4-3)
		return lmConfigLayout{
			bodyRows:     bodyRows,
			providerRows: clampInt(cellBodyRows, 1, providerCount),
			selectedRows: maxInt(1, minInt(cellBodyRows, a.lmConfigProviderDetailsRowCount())),
			modelRows:    clampInt(cellBodyRows, 1, modelCount),
			configRows:   maxInt(1, minInt(cellBodyRows, configCount)),
			gridGapRows:  gridGapRows,
			buttonRows:   buttonRows,
		}
	}

	availableBoxRows := gridRows - gridGapRows
	if availableBoxRows < 8 {
		availableBoxRows = 8
	}
	topTotalRows := availableBoxRows / 2
	bottomTotalRows := availableBoxRows - topTotalRows
	if providerCount > modelCount+configCount && availableBoxRows >= 10 {
		topTotalRows = (availableBoxRows * 55) / 100
		bottomTotalRows = availableBoxRows - topTotalRows
	}
	if topTotalRows < 4 {
		topTotalRows = 4
	}
	if bottomTotalRows < 4 {
		bottomTotalRows = 4
	}

	providerRows := maxInt(1, topTotalRows-3)
	modelRows := maxInt(1, bottomTotalRows-3)

	return lmConfigLayout{
		bodyRows:     bodyRows,
		providerRows: providerRows,
		selectedRows: providerRows,
		modelRows:    modelRows,
		configRows:   modelRows,
		gridGapRows:  gridGapRows,
		buttonRows:   buttonRows,
	}
}

func lmConfigGridWidths(innerW int) (int, int) {
	leftW := (innerW - 2) / 2
	rightW := innerW - leftW - 2
	return leftW, rightW
}

func (a *App) lmConfigModalWidth() int {
	return a.modalWidth()
}

// renderLMConfigProviderList paints the provider section as a
// windowed list — lmConfigVisibleRows around the selection.
func (a *App) renderLMConfigProviderList(innerW int, visibleRows int) string {
	t := a.Theme
	presets := a.lmConfig.info.Presets
	if len(presets) == 0 {
		return "  " + a.localizer.t(msgLMConfigNoPresets, nil)
	}
	focused := a.lmConfig.field == lmFieldPreset
	headerStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
	if focused {
		headerStyle = headerStyle.Foreground(t.Secondary)
	}
	indexes := a.lmConfigProviderIndexes()
	pos := 0
	for i, idx := range indexes {
		if idx == a.lmConfig.selected {
			pos = i + 1
			break
		}
	}
	filterText := a.lmConfig.providerFilter
	if focused {
		filterText += "_"
	}
	filterSuffix := "  " + a.localizer.t(msgLMConfigFilter, nil) + " " + filterText
	title := fmt.Sprintf("%s (%d/%d)%s", a.localizer.t(msgLMConfigProviderTitle, nil), pos, len(indexes), filterSuffix)
	if focused {
		title = headerStyle.Render(title)
	}
	rows := []string{}
	list, win := a.lmConfigProviderModalList(innerW, visibleRows)
	rows = append(rows, list.rows...)
	if len(indexes) == 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
			Render("    "+a.localizer.t(msgLMConfigNoProvidersMatch, nil)))
	}
	return a.lmConfigListBox(title, rows, innerW, maxInt(1, visibleRows), win)
}

func (a *App) lmConfigProviderModalList(innerW int, visibleRows int) (modalListRender, scrollWindow) {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return modalListRender{}, scrollWindow{}
	}
	indexes := a.lmConfigProviderIndexes()
	selectedPos := 0
	for i, idx := range indexes {
		if idx == a.lmConfig.selected {
			selectedPos = i
			break
		}
	}
	focused := a.lmConfig.field == lmFieldPreset
	return a.renderWindowedIndexModalList(indexes, selectedPos, visibleRows, lmConfigVisibleRows, modalListOptions{
		width:            lmConfigBoxBodyWidth(innerW),
		rowBudget:        visibleRows,
		descriptionLines: 0,
	}, func(idx int) modalListItem {
		p := a.lmConfig.info.Presets[idx]
		disabled := a.lmConfigPresetProblem(p) != ""
		status := ""
		if disabled {
			status = "unavailable"
		} else if a.lmConfigPresetPending(p) || a.lmConfigPresetUnchecked(p) {
			status = "checking"
		}
		return modalListItem{
			id:             fmt.Sprintf("lm-config:provider:%d", idx),
			title:          p.Label,
			status:         status,
			selected:       idx == a.lmConfig.selected,
			selectedMarker: lmConfigSelectedMarker(focused),
			disabled:       disabled,
			action: func(app *App) tea.Cmd {
				if app.lmConfig == nil || app.lmConfig.info == nil || idx < 0 || idx >= len(app.lmConfig.info.Presets) {
					return nil
				}
				app.lmConfig.field = lmFieldPreset
				app.lmConfig.selected = idx
				return app.lmConfigSyncFromPreset()
			},
		}
	})
}

func (a *App) renderLMConfigProviderDetails(innerW int, visibleRows int) string {
	rows, _ := a.renderLMConfigProviderDetailsRowsAndHits(innerW, visibleRows)
	return a.lmConfigBox(a.localizer.t(msgLMConfigSelectedTitle, nil), rows, innerW, visibleRows)
}

func (a *App) renderLMConfigProviderDetailsRowsAndHits(innerW int, visibleRows int) ([]string, []modalCellHit) {
	t := a.Theme
	p := a.lmConfigCurrentPreset()
	if p == nil {
		return []string{a.localizer.t(msgLMConfigNoProviderSelected, nil)}, nil
	}
	statusText := a.lmConfigPresetStatusDetail(*p)
	statusColor := t.Success
	if statusText != "ready" {
		statusColor = t.Warning
	}
	bodyW := lmConfigBoxBodyWidth(innerW)
	rows := []string{
		lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render(p.Label),
	}
	hits := []modalCellHit{}
	appendLines := func(lines []string, style lipgloss.Style, limit int) {
		for _, line := range lines {
			if limit >= 0 && len(rows) >= limit {
				return
			}
			rows = append(rows, style.Render(line))
		}
	}
	if applied := a.lmConfigAppliedSummary(); applied != "" {
		appliedLines := wrapPlainRows(a.localizer.t(msgLMConfigApplied, map[string]string{"value": applied}), bodyW, "  ")
		appendLines(appliedLines, lipgloss.NewStyle().Foreground(t.FgMuted), visibleRows)
		if pending := a.lmConfigPendingSummary(*p); pending != "" && a.lmConfigPendingDiffersFromApplied(*p) {
			pendingLines := wrapPlainRows(a.localizer.t(msgLMConfigPending, map[string]string{"value": pending}), bodyW, "  ")
			appendLines(pendingLines, lipgloss.NewStyle().Foreground(t.Warning), visibleRows)
		}
	}
	visibleHitHeight := func(start int) int {
		if start >= visibleRows {
			return 0
		}
		return minInt(len(rows), visibleRows) - start
	}
	if p.RequiresAPIKey {
		start := len(rows)
		rows = append(rows, lmConfigField_render(a.localizer.t(msgLMConfigAPIKey, nil), a.lmConfig.apiKey, true,
			a.lmConfig.field == lmFieldAPIKey, t))
		if h := visibleHitHeight(start); h > 0 {
			hits = append(hits, modalCellHit{
				id:     "lm-config:api-key",
				row:    start,
				width:  innerW,
				height: h,
				action: func(app *App) tea.Cmd {
					if app.lmConfig != nil {
						app.lmConfig.field = lmFieldAPIKey
					}
					return nil
				},
			})
		}
	} else if a.lmConfig.lmConfigSelectedUsesOAuth() {
		authText := a.localizer.t(msgLMConfigAuthRequired, nil)
		authColor := t.Warning
		if p.IsAuthenticated || p.Status == "ready" {
			authText = a.localizer.t(msgLMConfigAuthReady, nil)
			authColor = t.Success
		}
		rows = append(rows, lipgloss.NewStyle().Foreground(authColor).Render(authText))
		label := a.localizer.t(msgLMConfigAuthenticate, nil)
		if p.IsAuthenticated || p.Status == "ready" {
			label = a.localizer.t(msgLMConfigRefreshToken, nil)
		}
		marker := "    "
		labelStyle := lipgloss.NewStyle().Foreground(t.Fg)
		if a.lmConfig.field == lmFieldAuth {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("    ▌ ")
			labelStyle = labelStyle.Foreground(t.Secondary).Bold(true)
		}
		if a.lmConfig.authenticating {
			label = a.localizer.t(msgLMConfigLaunchingLogin, nil)
		}
		start := len(rows)
		rows = append(rows, marker+labelStyle.Render(label))
		if h := visibleHitHeight(start); h > 0 {
			hits = append(hits, modalCellHit{
				id:     "lm-config:auth",
				row:    start,
				width:  innerW,
				height: h,
				action: func(app *App) tea.Cmd {
					if app.lmConfig == nil {
						return nil
					}
					app.lmConfig.field = lmFieldAuth
					_, cmd := app.handleLMConfigKey(keyMsg("enter"))
					return cmd
				},
			})
		}
		if msg := strings.TrimSpace(a.lmConfig.authMessage); msg != "" {
			appendLines(wrapPlainRows(msg, bodyW, "  "),
				lipgloss.NewStyle().Foreground(t.FgMuted), visibleRows)
		}
	} else {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(a.localizer.t(msgLMConfigNoKeyRequired, nil)))
	}
	statusLines := wrapPlainRows(a.localizer.t(msgLMConfigStatus, map[string]string{"status": statusText}), bodyW, "  ")
	if a.lmConfig.lmConfigSelectedCanEditAPIBase() {
		start := len(rows)
		if a.lmConfig.field == lmFieldAPIBase {
			rows = append(rows, lmConfigField_render(a.localizer.t(msgLMConfigAPIBase, nil), a.lmConfig.apiBase, false, true, t))
		} else {
			apiLines := []string{a.localizer.t(msgLMConfigAPIBase, nil) + ":"}
			apiLines = append(apiLines, wrapPlainRows(a.lmConfig.apiBase, bodyW, "  ")...)
			apiLimit := visibleRows - maxInt(1, len(statusLines))
			if apiLimit < len(rows)+1 {
				apiLimit = len(rows) + 1
			}
			appendLines(apiLines, lipgloss.NewStyle().Foreground(t.Fg), apiLimit)
		}
		if h := visibleHitHeight(start); h > 0 {
			hits = append(hits, modalCellHit{
				id:     "lm-config:api-base",
				row:    start,
				width:  innerW,
				height: h,
				action: func(app *App) tea.Cmd {
					if app.lmConfig != nil {
						app.lmConfig.field = lmFieldAPIBase
					}
					return nil
				},
			})
		}
	} else {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(a.localizer.t(msgLMConfigLocalCLI, nil)))
	}
	appendLines(statusLines, lipgloss.NewStyle().Foreground(statusColor), visibleRows)
	if desc := strings.TrimSpace(a.localizedProviderDescription(*p)); desc != "" {
		remaining := visibleRows - len(rows)
		if remaining > 0 {
			descLines := wrapPlainRows(desc, bodyW, "")
			if len(descLines) > remaining {
				descLines = descLines[:remaining]
			}
			appendLines(descLines, lipgloss.NewStyle().Foreground(t.FgMuted), visibleRows)
		}
	}
	return rows, hits
}

func (a *App) lmConfigProviderDetailsRowCount() int {
	p := a.lmConfigCurrentPreset()
	if p == nil {
		return 1
	}
	rows := 3 // label, auth, status
	if a.lmConfigAppliedSummary() != "" {
		rows++
		if a.lmConfigPendingDiffersFromApplied(*p) && a.lmConfigPendingSummary(*p) != "" {
			rows++
		}
	}
	if a.lmConfig.lmConfigSelectedCanEditAPIBase() {
		rows++
	} else {
		rows++ // transport row
	}
	return rows
}

func (a *App) lmConfigPresetProblem(p client.LMProviderPreset) string {
	if !lmConfigSupportsLiveCatalog(p) {
		if p.Status == "unavailable" && strings.TrimSpace(p.StatusMessage) != "" {
			return strings.TrimSpace(p.StatusMessage)
		}
		return ""
	}
	if msg := strings.TrimSpace(p.StatusMessage); msg != "" && p.Status != "ready" {
		return lmConfigShortStatus(msg)
	}
	if status := strings.TrimSpace(p.Status); status != "" && status != "ready" && status != "unknown" {
		return lmConfigShortStatus(status)
	}
	if msg := strings.TrimSpace(a.lmConfig.modelCatalogWarnings[p.ID]); msg != "" {
		return lmConfigShortStatus(msg)
	}
	return ""
}

func (a *App) lmConfigPresetPending(p client.LMProviderPreset) bool {
	return a.lmConfig != nil && a.lmConfig.modelCatalogPending != nil && a.lmConfig.modelCatalogPending[p.ID]
}

func (a *App) lmConfigPresetUnchecked(p client.LMProviderPreset) bool {
	if a.lmConfig == nil {
		return false
	}
	if p.Status != "" && p.Status != "unknown" {
		return false
	}
	if a.lmConfig.modelCatalogSources == nil {
		return true
	}
	_, checked := a.lmConfig.modelCatalogSources[p.ID]
	return !checked
}

func (a *App) lmConfigPresetStatusText(p client.LMProviderPreset) string {
	if msg := a.lmConfigPresetProblem(p); msg != "" {
		return msg
	}
	if a.lmConfigPresetPending(p) {
		return "checking..."
	}
	if _, checked := a.lmConfig.modelCatalogWarnings[p.ID]; checked {
		if len(a.lmConfig.modelCatalogs[p.ID]) > 0 {
			return "ready"
		}
		if a.lmConfig.modelCatalogSources[p.ID] == "live" {
			return "reachable; no models"
		}
	}
	if p.Status == "unknown" {
		return "not checked"
	}
	if p.Status != "" {
		return p.Status
	}
	return "ready"
}

func (a *App) lmConfigPresetStatusDetail(p client.LMProviderPreset) string {
	if msg := strings.TrimSpace(p.StatusMessage); msg != "" && p.Status != "ready" {
		return msg
	}
	if msg := strings.TrimSpace(a.lmConfig.modelCatalogWarnings[p.ID]); msg != "" {
		return msg
	}
	if a.lmConfigPresetPending(p) {
		return "checking..."
	}
	if _, checked := a.lmConfig.modelCatalogWarnings[p.ID]; checked {
		if len(a.lmConfig.modelCatalogs[p.ID]) > 0 {
			return "ready"
		}
		if a.lmConfig.modelCatalogSources[p.ID] == "live" {
			return "reachable; no models"
		}
	}
	if p.Status == "unknown" {
		return "not checked"
	}
	if p.Status != "" {
		return p.Status
	}
	return "ready"
}

func lmConfigShortStatus(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if strings.Contains(s, "No connection adapters were found") {
		return "no live catalog for this provider"
	}
	if strings.Contains(s, "missing ") {
		return s
	}
	if strings.Contains(s, "unreachable") {
		parts := strings.SplitN(s, ":", 2)
		return strings.TrimSpace(parts[0])
	}
	return truncateString(s, 72)
}

func (a *App) localizedProviderDescription(p client.LMProviderPreset) string {
	if key := providerDescriptionLocaleKey(p); key != "" {
		return a.localizer.t(messageID(key), nil)
	}
	return p.Description
}

func providerDescriptionLocaleKey(p client.LMProviderPreset) string {
	id := strings.ToLower(strings.TrimSpace(p.ID))
	provider := strings.ToLower(strings.TrimSpace(p.Provider))
	switch id {
	case "lm_studio":
		return "lm_config.provider_desc.lm_studio"
	case "ollama":
		return "lm_config.provider_desc.ollama"
	case "openai":
		return "lm_config.provider_desc.openai"
	case "anthropic":
		return "lm_config.provider_desc.anthropic"
	case "openrouter":
		return "lm_config.provider_desc.openrouter"
	case "codex", "openai_codex":
		return "lm_config.provider_desc.codex"
	case "claude_code":
		return "lm_config.provider_desc.claude_code"
	case "local_vllm", "vllm":
		return "lm_config.provider_desc.local_vllm"
	case "argonne_sophia":
		return "lm_config.provider_desc.argonne_sophia"
	case "argonne_metis":
		return "lm_config.provider_desc.argonne_metis"
	}
	switch provider {
	case "lm_studio":
		return "lm_config.provider_desc.lm_studio"
	case "ollama":
		return "lm_config.provider_desc.ollama"
	case "openai":
		return "lm_config.provider_desc.openai"
	case "anthropic":
		return "lm_config.provider_desc.anthropic"
	case "openrouter":
		return "lm_config.provider_desc.openrouter"
	case "codex":
		return "lm_config.provider_desc.codex"
	case "claude_code":
		return "lm_config.provider_desc.claude_code"
	case "local_vllm", "vllm":
		return "lm_config.provider_desc.local_vllm"
	case "argonne":
		if strings.Contains(id, "metis") {
			return "lm_config.provider_desc.argonne_metis"
		}
		if strings.Contains(id, "sophia") {
			return "lm_config.provider_desc.argonne_sophia"
		}
	}
	return ""
}

// renderLMConfigModelList paints the model picker as a windowed list.
func (a *App) renderLMConfigModelList(innerW int, visibleRows int) string {
	t := a.Theme
	focused := a.lmConfig.field == lmFieldModel
	headerStyle := lipgloss.NewStyle().Foreground(t.Fg).Bold(true)
	if focused {
		headerStyle = headerStyle.Foreground(t.Secondary)
	}

	pid := a.lmConfigCurrentPresetID()
	catalog := a.lmConfig.modelCatalogs[pid]
	warning := a.lmConfig.modelCatalogWarnings[pid]
	if warning != "" {
		catalog = nil
	}

	source := a.lmConfig.modelCatalogSources[pid]
	titleText := a.localizer.t(msgLMConfigModelTitle, nil)
	if source == "static_catalog" {
		titleText = a.localizer.t(msgLMConfigModelCandidatesTitle, nil)
	}
	modelIndexes := a.lmConfigModelIndexes()
	filterText := a.lmConfig.modelFilter
	if focused {
		filterText += "_"
	}
	if strings.TrimSpace(filterText) != "" {
		titleText += "  " + a.localizer.t(msgLMConfigFilter, nil) + " " + filterText
	}
	title := headerStyle.Render(titleText)
	if len(catalog) == 0 {
		rows := []string{}
		bodyW := lmConfigBoxBodyWidth(innerW)
		if p := a.lmConfigCurrentPreset(); p != nil {
			switch {
			case a.lmConfigPresetPending(*p):
				rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
					Render(a.localizer.t(msgLMConfigCheckingCatalog, nil)))
			case source == "":
				rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
					Render(a.localizer.t(msgLMConfigCheckingCatalog, nil)))
			case source == "live" && p.Provider == "ollama":
				rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
					Render(a.localizer.t(msgLMConfigOllamaNoModels, nil)))
			case a.lmConfigPresetProblem(*p) != "":
				for _, line := range wrapPlainRows(
					a.localizer.t(msgLMConfigProviderUnavailable, map[string]string{"reason": a.lmConfigPresetProblem(*p)}),
					bodyW,
					"  ",
				) {
					rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Render(line))
				}
			default:
				rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
					Render(a.localizer.t(msgLMConfigNoSelectableCatalog, nil)))
			}
		}
		if len(rows) == 0 {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(a.localizer.t(msgLMConfigNoSelectableCatalog, nil)))
		}
		return a.lmConfigBox(title, rows, innerW, maxInt(1, visibleRows))
	}
	if len(modelIndexes) == 0 {
		rows := []string{
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(a.localizer.t(msgLMConfigNoModelsMatch, nil)),
		}
		return a.lmConfigBox(title, rows, innerW, maxInt(1, visibleRows))
	}

	idx := a.lmConfig.modelIndex
	if idx < 0 {
		idx = modelIndexes[0]
	}
	pos := 0
	for i, modelIdx := range modelIndexes {
		if modelIdx == idx {
			pos = i
			break
		}
	}
	title = fmt.Sprintf("%s   (%d/%d)%s",
		headerStyle.Render(titleText),
		pos+1, len(modelIndexes),
		func() string {
			if a.lmConfig.modelIndex < 0 {
				return "  " + lipgloss.NewStyle().Foreground(t.FgFaint).
					Italic(true).Render(a.localizer.t(msgLMConfigTypedSnapBack, nil))
			}
			return ""
		}(),
	)
	rows := []string{}
	list, win := a.lmConfigModelModalList(innerW, visibleRows)
	rows = append(rows, list.rows...)
	return a.lmConfigListBox(title, rows, innerW, maxInt(1, visibleRows), win)
}

func (a *App) lmConfigModelModalList(innerW int, visibleRows int) (modalListRender, scrollWindow) {
	if a.lmConfig == nil || a.lmConfig.info == nil {
		return modalListRender{}, scrollWindow{}
	}
	pid := a.lmConfigCurrentPresetID()
	if strings.TrimSpace(a.lmConfig.modelCatalogWarnings[pid]) != "" {
		return modalListRender{}, scrollWindow{}
	}
	catalog := a.lmConfig.modelCatalogs[pid]
	if len(catalog) == 0 {
		return modalListRender{}, scrollWindow{}
	}
	modelIndexes := a.lmConfigModelIndexes()
	if len(modelIndexes) == 0 {
		return modalListRender{}, scrollWindow{}
	}
	idx := a.lmConfig.modelIndex
	if idx < 0 {
		idx = modelIndexes[0]
	}
	pos := 0
	for i, modelIdx := range modelIndexes {
		if modelIdx == idx {
			pos = i
			break
		}
	}
	focused := a.lmConfig.field == lmFieldModel
	return a.renderWindowedIndexModalList(modelIndexes, pos, visibleRows, lmConfigVisibleRows, modalListOptions{
		width:            lmConfigBoxBodyWidth(innerW),
		rowBudget:        visibleRows,
		descriptionLines: 0,
	}, func(modelIdx int) modalListItem {
		m := catalog[modelIdx]
		return modalListItem{
			id:             fmt.Sprintf("lm-config:model:%d", modelIdx),
			title:          m.ID,
			selected:       modelIdx == idx && a.lmConfig.modelIndex >= 0,
			selectedMarker: lmConfigSelectedMarker(focused),
			action: func(app *App) tea.Cmd {
				if app.lmConfig == nil {
					return nil
				}
				pid := app.lmConfigCurrentPresetID()
				catalog := app.lmConfig.modelCatalogs[pid]
				if modelIdx < 0 || modelIdx >= len(catalog) {
					return nil
				}
				app.lmConfig.field = lmFieldModel
				app.lmConfig.modelIndex = modelIdx
				app.lmConfig.model = catalog[modelIdx].ID
				return nil
			},
		}
	})
}

func (a *App) lmConfigSelectableModelCount() int {
	if a.lmConfig == nil {
		return 0
	}
	pid := a.lmConfigCurrentPresetID()
	if strings.TrimSpace(a.lmConfig.modelCatalogWarnings[pid]) != "" {
		return 0
	}
	if strings.TrimSpace(a.lmConfig.modelFilter) != "" {
		return len(a.lmConfigModelIndexes())
	}
	return len(a.lmConfig.modelCatalogs[pid])
}

func lmConfigSelectedMarker(focused bool) string {
	if focused {
		return "▌ "
	}
	return "✓ "
}

const lmConfigAdvancedMarkerWidth = 6

type lmConfigAdvancedRow struct {
	field       lmConfigField
	label       string
	value       string
	defaultText string
}

func (r lmConfigAdvancedRow) displayText() string {
	if r.value != "" {
		return r.value
	}
	return r.defaultText
}

func (r lmConfigAdvancedRow) controlBounds() (int, int) {
	start := lmConfigAdvancedMarkerWidth + lipgloss.Width(r.label) + 2
	return start, start + lipgloss.Width("◀ "+r.displayText()+" ▶")
}

func (r lmConfigAdvancedRow) decrementHit() (int, int) {
	start, end := r.controlBounds()
	return splitStepperControlHit(start, end, false)
}

func (r lmConfigAdvancedRow) incrementHit() (int, int) {
	start, end := r.controlBounds()
	return splitStepperControlHit(start, end, true)
}

func (a *App) lmConfigAdvancedRows() []lmConfigAdvancedRow {
	if a.lmConfig == nil {
		return nil
	}
	rows := []lmConfigAdvancedRow{}
	for _, field := range a.lmConfig.lmConfigAdvancedFields() {
		switch field {
		case lmFieldTemperature:
			rows = append(rows, lmConfigAdvancedRow{
				field:       lmFieldTemperature,
				label:       a.localizer.t(msgLMConfigTemperature, nil),
				value:       a.lmConfig.temperature,
				defaultText: a.localizer.t(msgLMConfigBackendDefault, nil),
			})
		case lmFieldMaxTokens:
			rows = append(rows, lmConfigAdvancedRow{
				field:       lmFieldMaxTokens,
				label:       a.localizer.t(msgLMConfigMaxOutput, nil),
				value:       a.lmConfig.maxTokens,
				defaultText: a.localizer.t(msgLMConfigProviderDefault, nil),
			})
		case lmFieldContextLength:
			rows = append(rows, lmConfigAdvancedRow{
				field:       lmFieldContextLength,
				label:       a.localizer.t(msgLMConfigLoadContext, nil),
				value:       a.lmConfig.contextLength,
				defaultText: a.localizer.t(msgLMConfigLMStudioDefault, nil),
			})
		case lmFieldThinkingBudget:
			rows = append(rows, lmConfigAdvancedRow{
				field:       lmFieldThinkingBudget,
				label:       a.localizer.t(msgLMConfigThinkingBudget, nil),
				value:       a.lmConfig.thinkingBudget,
				defaultText: a.localizer.t(msgLMConfigDefaultDisabled, nil),
			})
		}
	}
	return rows
}

// renderLMConfigAdvanced renders the numeric knobs as visible ←/→
// adjusters. Empty value displays "default" so the user knows blank
// is intentional.
func (a *App) renderLMConfigAdvanced(innerW int) []string {
	rows, _ := a.renderLMConfigAdvancedRowsAndHits(innerW)
	return rows
}

func (a *App) renderLMConfigAdvancedRowsAndHits(innerW int) ([]string, []modalCellHit) {
	t := a.Theme
	row := func(spec lmConfigAdvancedRow) string {
		marker := strings.Repeat(" ", lmConfigAdvancedMarkerWidth)
		labelStyle := lipgloss.NewStyle().Foreground(t.Fg)
		if a.lmConfig.field == spec.field {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("    ▌ ")
			labelStyle = labelStyle.Foreground(t.Secondary).Bold(true)
		}
		display := spec.value
		if display == "" {
			display = lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
				Render(spec.defaultText)
		} else {
			display = lipgloss.NewStyle().Foreground(t.Fg).Bold(true).Render(display)
		}
		hint := ""
		if a.lmConfig.field == spec.field {
			hint = "  " + lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
				Render(a.localizer.t(msgLMConfigAdjustHint, nil))
		}
		return marker + labelStyle.Render(spec.label) + "  " + t.HintLabel.Render("◀ ") + display + t.HintLabel.Render(" ▶") + hint
	}
	rows := []string{}
	hits := []modalCellHit{}
	for rowIdx, spec := range a.lmConfigAdvancedRows() {
		rows = append(rows, row(spec))
		field := spec.field
		id := fmt.Sprintf("lm-config:advanced:%d", field)
		start, end := spec.controlBounds()
		hits = append(hits, modalStepperControlHits(id, rowIdx, 0, innerW, start, end, func(app *App) tea.Cmd {
			if app.lmConfig != nil {
				app.lmConfig.field = field
			}
			return nil
		}, func(app *App) tea.Cmd {
			if app.lmConfig == nil {
				return nil
			}
			app.lmConfig.field = field
			_, cmd := app.handleLMConfigKey(keyMsg("left"))
			return cmd
		}, func(app *App) tea.Cmd {
			if app.lmConfig == nil {
				return nil
			}
			app.lmConfig.field = field
			_, cmd := app.handleLMConfigKey(keyMsg("right"))
			return cmd
		})...)
	}
	return rows, hits
}

func (a *App) renderLMConfigAdvancedBox(innerW int, visibleRows int) string {
	t := a.Theme
	fields := a.lmConfig.lmConfigAdvancedFields()
	title := a.localizer.t(msgLMConfigAdvancedTitle, nil)
	if a.lmConfig.field == lmFieldTemperature ||
		a.lmConfig.field == lmFieldMaxTokens ||
		a.lmConfig.field == lmFieldContextLength ||
		a.lmConfig.field == lmFieldThinkingBudget {
		title = lipgloss.NewStyle().Foreground(t.Secondary).Render(title)
	}
	rows := a.renderLMConfigAdvanced(innerW)
	if len(fields) == 0 {
		rows = []string{
			lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
				Render(a.localizer.t(msgLMConfigManagedByProvider, nil)),
		}
	}
	if details := a.renderLMConfigModelDetails(lmConfigBoxBodyWidth(innerW)); len(details) > 0 {
		if len(rows) > 0 {
			rows = append(rows, "")
		}
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Bold(true).Render(a.localizer.t(msgLMConfigModelDetails, nil)))
		rows = append(rows, details...)
	}
	return a.lmConfigBox(title, rows, innerW, visibleRows)
}

func (a *App) renderLMConfigModelDetails(bodyW int) []string {
	if a.lmConfig == nil {
		return nil
	}
	pid := a.lmConfigCurrentPresetID()
	catalog := a.lmConfig.modelCatalogs[pid]
	if len(catalog) == 0 || a.lmConfig.modelIndex < 0 || a.lmConfig.modelIndex >= len(catalog) {
		return nil
	}
	t := a.Theme
	m := catalog[a.lmConfig.modelIndex]
	rows := []string{}
	name := strings.TrimSpace(m.Name)
	if name != "" && name != m.ID {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(a.localizer.t(msgLMConfigModelName, map[string]string{"name": name})))
	}
	if m.ContextWindow > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(
			a.localizer.tf(msgLMConfigMaxContext, map[string]any{"tokens": m.ContextWindow}),
		))
		if strings.TrimSpace(a.lmConfig.contextLength) != "" {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(
				a.localizer.t(msgLMConfigRequestedContext, map[string]string{"tokens": strings.TrimSpace(a.lmConfig.contextLength)}),
			))
		}
	} else if strings.TrimSpace(a.lmConfig.contextLength) != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(
			a.localizer.t(msgLMConfigRequestedContext, map[string]string{"tokens": strings.TrimSpace(a.lmConfig.contextLength)}),
		))
	} else {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(
			a.localizer.t(msgLMConfigMaxContextUnknown, nil),
		))
	}
	if m.MaxOutputTokens > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Fg).Render(
			a.localizer.tf(msgLMConfigMaxOutputDetail, map[string]any{"tokens": m.MaxOutputTokens}),
		))
	}
	if desc := strings.TrimSpace(m.Description); desc != "" {
		for _, line := range wrapPlainRows(desc, bodyW, "  ") {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(line))
		}
	}
	return rows
}

func (a *App) lmConfigBox(title string, rows []string, width int, height int) string {
	return a.lmConfigBoxWithWindow(title, rows, width, height, scrollWindow{})
}

func (a *App) lmConfigListBox(title string, rows []string, width int, height int, win scrollWindow) string {
	return a.lmConfigBoxWithWindow(title, rows, width, height, win)
}

func lmConfigBoxBodyWidth(width int) int {
	bodyW := width - 4
	if bodyW < 10 {
		return 10
	}
	return bodyW
}

func lmConfigBoxContentWidth(width int) int {
	return lmConfigBoxBodyWidth(width) - 2
}

func lmConfigBoxRailCol(col int, width int) int {
	return col + width - 3
}

func lmConfigBoxContentTop(top int) int {
	return top + 2
}

func (a *App) lmConfigBoxWithWindow(title string, rows []string, width int, height int, win scrollWindow) string {
	t := a.Theme
	bodyW := lmConfigBoxBodyWidth(width)
	bodyLines := make([]string, 0, height)
	for _, row := range rows {
		bodyLines = append(bodyLines, fitANSI(row, bodyW))
		if len(bodyLines) == height {
			break
		}
	}
	for len(bodyLines) < height {
		bodyLines = append(bodyLines, strings.Repeat(" ", bodyW))
	}
	if win.total > maxInt(1, win.end-win.start) && width >= 16 && height >= 2 {
		contentW := lmConfigBoxContentWidth(width)
		if withRail, ok := a.renderSideScrollIndicator(bodyLines, contentW, win); ok {
			bodyLines = withRail
		}
	}
	titleStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Bold(true)
	borderStyle := lipgloss.NewStyle().Foreground(t.Border)
	lineStyle := lipgloss.NewStyle().Background(t.Bg)
	top := lineStyle.Render(borderStyle.Render("╭" + strings.Repeat("─", width-2) + "╮"))
	bottom := lineStyle.Render(borderStyle.Render("╰" + strings.Repeat("─", width-2) + "╯"))
	titleLine := lineStyle.Render(
		"│ " + fitANSI(titleStyle.Render(title), bodyW) + " │",
	)
	out := []string{top, titleLine}
	for _, line := range bodyLines {
		out = append(out, lineStyle.Render("│ "+line+" │"))
	}
	out = append(out, bottom)
	return strings.Join(out, "\n")
}

func padANSI(s string, width int) string {
	if width <= 0 {
		return ""
	}
	w := lipgloss.Width(s)
	if w >= width {
		return s
	}
	return s + strings.Repeat(" ", width-w)
}

func fitANSI(s string, width int) string {
	if width <= 0 {
		return ""
	}
	fitted := ansi.Truncate(s, width, "")
	for target := width - 1; lipgloss.Width(fitted) > width && target >= 0; target-- {
		fitted = ansi.Truncate(s, target, "")
	}
	return padANSI(fitted, width)
}

func wrapPlainRows(text string, width int, indent string) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	if width <= 0 {
		return []string{text}
	}
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}
	rows := []string{}
	line := ""
	for _, word := range words {
		prefix := ""
		if len(rows) > 0 {
			prefix = indent
		}
		candidate := word
		if line != "" {
			candidate = line + " " + word
		}
		if lipgloss.Width(prefix+candidate) <= width {
			line = candidate
			continue
		}
		if line != "" {
			rows = append(rows, prefix+line)
			line = word
			continue
		}
		for lipgloss.Width(prefix+word) > width && width > lipgloss.Width(prefix) {
			limit := width - lipgloss.Width(prefix)
			chunk, rest := splitPlainToken(word, limit)
			rows = append(rows, prefix+chunk)
			if rest == "" {
				word = ""
				break
			}
			word = rest
		}
		line = word
	}
	if line != "" {
		prefix := ""
		if len(rows) > 0 {
			prefix = indent
		}
		rows = append(rows, prefix+line)
	}
	return rows
}

func splitPlainToken(s string, maxWidth int) (string, string) {
	if maxWidth <= 0 || s == "" {
		return "", s
	}
	runes := []rune(s)
	for i := 1; i <= len(runes); i++ {
		chunk := string(runes[:i])
		if lipgloss.Width(chunk) > maxWidth {
			if i == 1 {
				return chunk, string(runes[i:])
			}
			return string(runes[:i-1]), string(runes[i-1:])
		}
	}
	return s, ""
}

func lmConfigFillBlock(s string, width int, height int, bg color.Color) string {
	if width <= 0 {
		return s
	}
	style := lipgloss.NewStyle().Background(bg).Width(width)
	lines := strings.Split(s, "\n")
	if height > 0 && len(lines) > height {
		lines = lines[:height]
	}
	for height > 0 && len(lines) < height {
		lines = append(lines, "")
	}
	for i, line := range lines {
		lines[i] = style.Render(padANSI(line, width))
	}
	return strings.Join(lines, "\n")
}

// lmConfigWindow returns [start, end) — the window of catalog rows
// to render around “cursor“, ensuring the cursor sits roughly mid-
// window.
func lmConfigWindow(cursor, total int, visibleRows int) (int, int) {
	return windowedIndexRange(cursor, total, visibleRows, lmConfigVisibleRows)
}

func clampInt(v int, minValue int, maxValue int) int {
	if maxValue < minValue {
		return minValue
	}
	if v < minValue {
		return minValue
	}
	if v > maxValue {
		return maxValue
	}
	return v
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
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
