package ui

// appConfigState groups runtime configuration and startup wiring injected by
// main.go/config helpers. Fields stay exported because callers outside
// internal/ui configure App through promoted field selectors after NewWithTheme.
type appConfigState struct {
	BackendURL   string
	BackendLabel string
	Theme        Theme

	VoiceCommand string

	DefaultAgentBlueprintID string
	DefaultExpertPackID     string

	ReloadConfig          func() (string, error)
	SaveConfig            func() error
	PruneDetachedRegistry func(sessionID string)

	InitialWorkspaceSelector string

	DisableAltScreen bool
	MouseEnabled     bool

	BrandName string
}

// toggleShowTimestamps flips the per-message timestamp display and returns the
// new state. The single seam for the live "t" debugging toggle so callers don't
// poke Theme.ShowTimestamps directly.
func (a *App) toggleShowTimestamps() bool {
	a.Theme.ShowTimestamps = !a.Theme.ShowTimestamps
	return a.Theme.ShowTimestamps
}
