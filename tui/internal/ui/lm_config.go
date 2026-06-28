package ui

// lmConfigComponent + lmConfigState: the language-model (provider/model) configuration overlay.

import (
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
	lmFieldParallel
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
	parallel       string // empty = CLIO default (0)
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

// lmConfigComponent owns the /v1/providers/lm config modal: its open flag, its
// transient editing state (embedded lmConfigState, so callers keep reading
// c.field/c.selected/… directly), and a back-reference to the root App for
// shared services (client, theme, sessions, the lmProviderInfo cache). It
// replaces the old appOverlayState pair (lmConfigOpen bool + lmConfig
// *lmConfigState) — open==false with a zeroed lmConfigState is the
// closed/unloaded state, so the former nil-pointer checks become !c.open.
type lmConfigComponent struct {
	app  *App
	open bool
	lmConfigState
}

// reset closes the modal and clears its transient editing state, keeping the
// app back-ref. Equivalent to the old (lmConfigOpen=false, lmConfig=nil).
func (c *lmConfigComponent) reset() { *c = lmConfigComponent{app: c.app} }

func (c *lmConfigComponent) close() {
	c.reset()
}

// openModal clears any prior state and shows the LM-provider config overlay.
// Callers that need the model catalog populated still issue lmConfigFetchCmd.
func (c *lmConfigComponent) openModal() {
	c.reset()
	c.open = true
}
