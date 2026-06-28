package ui

// FocusZone identifies which pane owns the keyboard.
type FocusZone int

const (
	FocusSidebar FocusZone = iota
	FocusBody
	FocusRightSidebar
	FocusInput
)

type sidebarSection int

const (
	sidebarSectionSessions sidebarSection = iota
	sidebarSectionAgents
	sidebarSectionFiles
	sidebarSectionContext
)

// Stage is the high-level UI state.
type Stage int

const (
	StageConnecting Stage = iota
	StageReady
	StageError
	// StageIntro is the splash screen shown before connecting (JJJ1).
	// Any key dismisses it and transitions into StageConnecting.
	StageIntro
)

const modelSwapMarkerKind = "model_provider_swap"
