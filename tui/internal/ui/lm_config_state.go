package ui

// lm_config_state.go computes LM-config visible/section/advanced fields and section stepping.

import "strings"

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
		return []lmConfigField{lmFieldTemperature, lmFieldMaxTokens, lmFieldContextLength, lmFieldParallel}
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
