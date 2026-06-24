package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestLMConfigProviderRowsUseSemanticHitTargets(t *testing.T) {
	a := newLMConfigTestApp()

	_ = a.View()
	target, ok := findHitTargetForTest(a, "lm-config:provider:0")
	if !ok {
		t.Fatal("missing semantic LM provider target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd == nil {
		t.Fatal("provider row click should queue provider sync/catalog fetch")
	}
	if a.lmConfig.selected != 0 {
		t.Fatalf("selected provider = %d, want 0", a.lmConfig.selected)
	}
	if a.lmConfig.field != lmFieldPreset {
		t.Fatalf("field = %v, want preset", a.lmConfig.field)
	}
}

func TestLMConfigProviderRowsAlignWithSharedFrameBody(t *testing.T) {
	a := newLMConfigTestApp()

	_ = a.View()
	target, ok := findHitTargetForTest(a, "lm-config:provider:0")
	if !ok {
		t.Fatal("missing semantic LM provider target")
	}
	view := a.lmConfig.view()
	rect := overlayMouseRect(view, a.width, a.height)
	providerLine := -1
	for i, line := range strings.Split(stripANSI(view), "\n") {
		if strings.Contains(line, "LM Studio (localhost)") {
			providerLine = i
			break
		}
	}
	if providerLine < 0 {
		t.Fatalf("could not find visible LM Studio provider row in:\n%s", stripANSI(view))
	}
	if wantY := rect.y + providerLine; target.rect.y != wantY {
		t.Fatalf("LM Studio provider target y = %d, want visible provider row %d", target.rect.y, wantY)
	}
}

func TestLMConfigFilterAndEditableFieldsUseSemanticHitTargets(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldAPIBase
	a.lmConfig.modelCatalogWarnings = map[string]string{"lm_studio": ""}
	a.lmConfig.modelCatalogSources = map[string]string{"lm_studio": "live"}
	a.lmConfig.modelCatalogs["lm_studio"] = []gact.Model{{ID: "alpha-model"}}
	a.lmConfig.modelIndex = 0
	a.lmConfig.model = "alpha-model"

	_ = a.View()
	providerFilter, ok := findHitTargetForTest(a, "lm-config:provider:filter")
	if !ok {
		t.Fatal("missing provider filter hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      providerFilter.rect.x,
		Y:      providerFilter.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.lmConfig.field != lmFieldPreset {
		t.Fatalf("provider filter click field = %v, want preset", a.lmConfig.field)
	}

	_ = a.View()
	modelFilter, ok := findHitTargetForTest(a, "lm-config:model:filter")
	if !ok {
		t.Fatal("missing model filter hit target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      modelFilter.rect.x,
		Y:      modelFilter.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.lmConfig.field != lmFieldModel {
		t.Fatalf("model filter click field = %v, want model", a.lmConfig.field)
	}

	_ = a.View()
	apiBase, ok := findHitTargetForTest(a, "lm-config:api-base")
	if !ok {
		t.Fatal("missing api base hit target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      apiBase.rect.x,
		Y:      apiBase.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.lmConfig.field != lmFieldAPIBase {
		t.Fatalf("api base click field = %v, want api base", a.lmConfig.field)
	}

	a.lmConfig.selected = 2
	a.lmConfig.field = lmFieldPreset
	a.lmConfig.apiBase = "https://api.openai.com/v1"
	_ = a.View()
	apiKey, ok := findHitTargetForTest(a, "lm-config:api-key")
	if !ok {
		t.Fatal("missing api key hit target")
	}
	model, _ = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      apiKey.rect.x,
		Y:      apiKey.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.lmConfig.field != lmFieldAPIKey {
		t.Fatalf("api key click field = %v, want api key", a.lmConfig.field)
	}
}

func TestLMConfigProviderDetailsRowsAndHitsShareVisibility(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldPreset
	a.lmConfig.apiBase = "http://127.0.0.1:1234/v1"

	rows, hits := a.lmConfig.renderProviderDetailsRowsAndHits(52, 8)
	apiBase, ok := modalCellHitByIDForTest(hits, "lm-config:api-base")
	if !ok {
		t.Fatal("missing API base hit from provider details row/hit pass")
	}
	if apiBase.row < 0 || apiBase.row >= len(rows) {
		t.Fatalf("API base hit row = %d outside rendered rows %d", apiBase.row, len(rows))
	}
	if apiBase.width != 52 {
		t.Fatalf("API base hit width = %d, want provider box width", apiBase.width)
	}
	if !strings.Contains(ansi.Strip(rows[apiBase.row]), "API base") {
		t.Fatalf("API base hit row %d does not point at API base row: %q", apiBase.row, ansi.Strip(rows[apiBase.row]))
	}

	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
		ID:         "argonne",
		Label:      "Argonne Sophia",
		Provider:   "argonne",
		AuthMethod: "oauth",
		APIBase:    "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
		Status:     "auth_required",
	})
	a.lmConfig.selected = len(a.lmConfig.info.Presets) - 1
	a.lmConfig.authMessage = "first auth detail line second auth detail line third auth detail line fourth auth detail line"

	_, hits = a.lmConfig.renderProviderDetailsRowsAndHits(52, 3)
	if _, ok := modalCellHitByIDForTest(hits, "lm-config:auth"); !ok {
		t.Fatal("missing visible OAuth auth hit")
	}
	if hit, ok := modalCellHitByIDForTest(hits, "lm-config:api-base"); ok {
		t.Fatalf("API base hit should not be registered outside the visible provider details rows: %+v", hit)
	}
}

func TestLMConfigProviderDetailsShowsAppliedAndPendingSelection(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Configured = true
	a.lmConfig.info.Provider = "ollama"
	a.lmConfig.info.Model = "granite3.1-dense:8b"
	a.lmConfig.info.APIBase = "http://127.0.0.1:11434/v1"
	a.lmConfig.selected = 0
	a.lmConfig.field = lmFieldPreset
	a.lmConfig.model = "qwopus3.5-9b-v3"
	a.lmConfig.apiBase = "http://127.0.0.1:1234/v1"

	out := ansi.Strip(a.lmConfig.renderProviderDetails(70, 10))
	if !strings.Contains(out, "applied: ollama/granite3.1-dense:8b") {
		t.Fatalf("provider details did not show applied config:\n%s", out)
	}
	if !strings.Contains(out, "pending: lm_studio/qwopus3.5-9b-v3") {
		t.Fatalf("provider details did not show pending config:\n%s", out)
	}

	a.lmConfig.selected = 1
	a.lmConfig.model = "granite3.1-dense:8b"
	a.lmConfig.apiBase = "http://127.0.0.1:11434/v1"
	out = ansi.Strip(a.lmConfig.renderProviderDetails(70, 10))
	if !strings.Contains(out, "applied: ollama/granite3.1-dense:8b") {
		t.Fatalf("provider details should keep applied config visible:\n%s", out)
	}
	if strings.Contains(out, "pending:") {
		t.Fatalf("provider details should not show pending config when selection matches applied:\n%s", out)
	}
}

func modalCellHitByIDForTest(hits []modalCellHit, id string) (modalCellHit, bool) {
	for _, hit := range hits {
		if hit.id == id {
			return hit, true
		}
	}
	return modalCellHit{}, false
}

func TestLMConfigProviderWheelUsesSemanticSectionHitTarget(t *testing.T) {
	a := newLMConfigTestApp()
	a.MouseEnabled = true
	a.lmConfig.selected = 0

	_ = a.View()
	target, ok := findHitTargetForTest(a, "lm-config:provider:wheel")
	if !ok {
		t.Fatal("missing semantic LM provider wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if a.lmConfig.selected != 1 {
		t.Fatalf("selected provider = %d, want 1", a.lmConfig.selected)
	}
	if a.lmConfig.field != lmFieldPreset {
		t.Fatalf("field = %v, want preset", a.lmConfig.field)
	}
}

func TestLMConfigProviderRailUsesSemanticSectionHitTarget(t *testing.T) {
	a := newLMConfigTestApp()
	a.MouseEnabled = true
	a.height = 40
	a.lmConfig.selected = 0
	for i := 0; i < 12; i++ {
		a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
			ID:             "provider_" + itoa2(i),
			Label:          "Provider " + itoa2(i),
			Provider:       "openai",
			SuggestedModel: "model",
		})
	}
	want := len(a.lmConfig.info.Presets) - 1

	_ = a.View()
	target, ok := findLastHitTargetWithPrefixForTest(a, "lm-config:provider:rail:")
	if !ok {
		t.Fatal("missing semantic LM provider rail target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.lmConfig.selected != want {
		t.Fatalf("selected provider = %d, want %d", a.lmConfig.selected, want)
	}
	if a.lmConfig.field != lmFieldPreset {
		t.Fatalf("field = %v, want preset", a.lmConfig.field)
	}
}

func TestLMConfigProviderListRowsAndHitsShareWindow(t *testing.T) {
	a := newLMConfigTestApp()
	for i := 0; i < 12; i++ {
		a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
			ID:             "provider_" + itoa2(i),
			Label:          "Provider " + itoa2(i),
			Provider:       "openai",
			SuggestedModel: "model",
		})
	}
	total := len(a.lmConfig.info.Presets)
	a.lmConfig.selected = total - 1

	list, win := a.lmConfig.providerModalList(60, 5)
	if win.start != total-5 || win.end != total {
		t.Fatalf("provider window = [%d,%d), want final 5 of %d", win.start, win.end, total)
	}
	if len(list.rows) != 5 || len(list.hits) != 5 {
		t.Fatalf("provider list rows/hits = %d/%d, want 5/5", len(list.rows), len(list.hits))
	}
	for i, hit := range list.hits {
		if hit.row != i {
			t.Fatalf("provider hit %d row = %d, want %d", i, hit.row, i)
		}
	}
	if !strings.Contains(list.hits[len(list.hits)-1].id, itoa2(total-1)) {
		t.Fatalf("last provider hit id = %q, want selected final provider", list.hits[len(list.hits)-1].id)
	}
}
