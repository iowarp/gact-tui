package ui

// appLifecycleState: startup intro-animation and clean-detach metadata.

import (
	"os"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
	figure "github.com/common-nighthawk/go-figure"

	"github.com/JaimeCernuda/gact-tui/tui/internal/intro"
	"github.com/JaimeCernuda/gact-tui/tui/internal/version"
)

// IntroLogo / IntroName are the ASCII art shown in StageIntro
// (JJJ1). Either can be overridden by loading a file via
// SetIntroFromFile; absent both, the baked-in defaults render.
//
// EEEEE1: defaultIntroName is generated at init() from go-figure
// using the "slant" font instead of being hand-rolled. The
// previous hand art looked off-balance and the user explicitly
// asked for "a ready solution" rather than bespoke ASCII. Logo
// (the small mountain glyph above the name) is now empty by
// default — keep the splash uncluttered; users who want a
// glyph can supply one via intro_file.
var defaultIntroLogo = []string{}

// defaultBrandName is the neutral product name used when no brand is
// configured (config `name` / GACT_BRAND_NAME). The embedding agent
// white-labels via SetBrandName; absent that, the TUI is generic GACT.
const defaultBrandName = "GACT"

// pkgBrandName mirrors the active App's configured brand so free functions
// that build user-facing text without an *App receiver can still render the
// product name. Set by SetBrandName; empty means the neutral default. A TUI
// process owns exactly one App, so a package-level value is unambiguous.
var pkgBrandName string

// brandName is the de-clio'd product name for user-facing copy: the
// configured brand, or the neutral default. Never a hardcoded vendor.
func brandName() string {
	if pkgBrandName != "" {
		return pkgBrandName
	}
	return defaultBrandName
}

var defaultIntroName = func() []string {
	out := figure.NewFigure(defaultBrandName, "slant", true).String()
	lines := strings.Split(strings.TrimRight(out, "\n"), "\n")
	return lines
}()

// SetBrandName white-labels the product name: it sets the OS window-title
// brand and regenerates the splash wordmark from the name (go-figure "slant",
// the same generator as the default). A no-op for the empty string so default
// behaviour is preserved. Call BEFORE SetIntroFromFile so a custom intro_file
// still wins for the splash art.
func (a *App) SetBrandName(name string) {
	if name == "" {
		return
	}
	a.BrandName = name
	pkgBrandName = name
	out := figure.NewFigure(name, "slant", true).String()
	a.IntroName = strings.Split(strings.TrimRight(out, "\n"), "\n")
}

// SetIntroFromFile loads a custom splash from disk. Format is two
// blocks separated by a blank line: logo block, then name block.
// Best-effort — bad files are ignored and the baked-in defaults
// remain. Returns the error for callers that want to surface it.
func (a *App) SetIntroFromFile(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	lines := strings.Split(strings.TrimRight(string(b), "\n"), "\n")
	logo := []string{}
	name := []string{}
	hitBlank := false
	for _, l := range lines {
		if !hitBlank {
			if strings.TrimSpace(l) == "" {
				hitBlank = true
				continue
			}
			logo = append(logo, l)
		} else {
			name = append(name, l)
		}
	}
	if len(logo) > 0 {
		a.IntroLogo = logo
	}
	if len(name) > 0 {
		a.IntroName = name
	}
	return nil
}

func (a *App) viewIntro() string {
	t := a.Theme
	a.interaction.registerScreenSurfaceHit("intro:continue", func(app *App) tea.Cmd {
		app.stage = StageConnecting
		return app.connection.connectCmd()
	})
	// LLLLLLLLL1 + MMMMMMMMM1: when IntroLogo is empty and the
	// terminal has room, render the embedded grc.iit.edu logo. If
	// the animation-frames embed is populated, cycle through the
	// 36-frame truecolor rotation on the introFrameIdx tick; else
	// fall back to the static halfblock render. Closes the splash
	// dep on runtime chafa — frames are chafa-baked once.
	var logoStr string
	if len(a.IntroLogo) > 0 {
		logoStr = strings.Join(a.IntroLogo, "\n")
	} else {
		w := 28
		if a.width > 0 && a.width < 40 {
			w = a.width - 4
			if w < 8 {
				w = 0
			}
		}
		if w > 0 {
			if frames := intro.GRCLogoFrames(); len(frames) > 0 {
				logoStr = frames[a.introFrameIdx%len(frames)]
			} else {
				logoStr = intro.GRCLogo(w)
			}
		}
		if logoStr == "" {
			logoStr = strings.Join(defaultIntroLogo, "\n")
		}
	}
	name := a.IntroName
	if len(name) == 0 {
		name = defaultIntroName
	}
	// GRC logo carries its own ANSI colours — don't re-wrap it in the
	// Primary-bold style that was meant for hand-rolled ASCII art.
	logoBlock := logoStr
	if len(a.IntroLogo) > 0 {
		logoBlock = lipgloss.NewStyle().Foreground(t.Primary).Bold(true).Render(logoStr)
	}
	// Short fallback when the wordmark art is wider than the terminal:
	// the plain brand name (configured or neutral default), never a
	// hardcoded product.
	shortName := a.BrandName
	if shortName == "" {
		shortName = defaultBrandName
	}
	nameStyle := lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	nameText := strings.Join(name, "\n")
	if a.width > 0 && lipgloss.Width(nameText) > a.width-4 {
		nameText = shortName
	}
	box := lipgloss.NewStyle().
		Width(a.width).Height(a.height).
		Align(lipgloss.Center, lipgloss.Center).
		Foreground(t.Fg).Background(t.Bg)
	nameBlock := nameStyle.Render(nameText)
	hint := t.HintLabel.Italic(true).Render("press any key to continue")
	// Build/version stamp so you can confirm which commit you're running.
	// Dirty (uncommitted) builds render in the warning colour so "am I running
	// exactly what's committed?" is answerable at a glance.
	verStyle := lipgloss.NewStyle().Foreground(t.FgFaint)
	if version.Dirty() {
		verStyle = lipgloss.NewStyle().Foreground(t.Warning)
	}
	verLine := verStyle.Render(version.Resolve())
	parts := []string{}
	if strings.TrimSpace(ansi.Strip(logoBlock)) != "" {
		parts = append(parts, logoBlock)
	}
	if len(parts) > 0 {
		parts = append(parts, "")
	}
	parts = append(parts, nameBlock, "", hint, "", verLine)
	body := lipgloss.JoinVertical(lipgloss.Center, parts...)
	if a.height > 0 && lipgloss.Height(body) > a.height {
		body = lipgloss.JoinVertical(lipgloss.Center, nameBlock, "", hint, verLine)
	}
	if a.height > 0 && lipgloss.Height(body) > a.height {
		body = lipgloss.JoinVertical(lipgloss.Center, nameStyle.Render(shortName), hint)
	}
	return box.Render(body)
}

// appLifecycleState groups startup intro animation and clean-detach metadata.
type appLifecycleState struct {
	IntroLogo     []string
	IntroName     []string
	IntroDisabled bool

	AttachSessionID    string
	DetachedSessionID  string
	DetachedTitle      string
	DetachedWorkspace  string
	previouslyDetached map[string]bool

	introFrameIdx   int
	IntroFrameDelay time.Duration
}
