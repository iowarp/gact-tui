package ui

// render_markdown.go renders markdown via Glamour using the active theme.

import (
	"fmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/render"
	"image/color"
	"strings"
	"sync"

	"charm.land/glamour/v2"
	glamouransi "charm.land/glamour/v2/ansi"
	"charm.land/glamour/v2/styles"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// glamourRenderers caches glamour TermRenderers by (themeKey, width) so
// we don't pay the non-trivial init cost on every Render. themeKey is
// the canonical ThemeMode name — a swap invalidates the cache naturally
// because the key changes.
type glamourKey struct {
	themeKey string
	width    int
}

var (
	glamourMu sync.Mutex
	glamourCa = map[glamourKey]*glamour.TermRenderer{}
)

// glamourRenderer returns a cached TermRenderer whose StyleConfig is
// derived from the supplied Theme. P1: previously we used glamour's
// built-in named styles (light/dark/dracula/tokyo-night) which don't
// know about our theme's Fg/Bg/Primary/Warning, so code blocks + heading
// colours were always off for the in-between palettes (Solarized, Nord).
// Now each palette gets a StyleConfig that starts from the closest
// built-in base and overrides the fields that matter for readability.
func glamourRenderer(t Theme, width int) *glamour.TermRenderer {
	glamourMu.Lock()
	defer glamourMu.Unlock()
	k := glamourKey{themeKey: ThemeModeName(ThemeModeFor(t)), width: width}
	if r, ok := glamourCa[k]; ok {
		return r
	}
	cfg := glamourStyleFromTheme(t)
	r, err := glamour.NewTermRenderer(
		glamour.WithStyles(cfg),
		glamour.WithWordWrap(width),
		glamour.WithEmoji(),
	)
	if err != nil {
		return nil
	}
	glamourCa[k] = r
	return r
}

// renderMarkdown attempts to render s as markdown via glamour. Theme
// drives both the colour palette and the cache key. On any error or
// empty result, returns the original string.
func renderMarkdown(s string, t Theme, width int) string {
	r := glamourRenderer(t, width)
	if r == nil {
		return s
	}
	out, err := r.Render(s)
	if err != nil || out == "" {
		return s
	}
	return strings.Trim(out, "\n")
}

func renderMarkdownOrWrap(s string, t Theme, width int) string {
	s = render.ExpandInlineMarkdownTables(s)
	if looksLikeMarkdownBlock(s) {
		return renderMarkdown(s, t, width)
	}
	return textutil.Wrap(s, width)
}

func looksLikeMarkdownBlock(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	lines := strings.Split(s, "\n")
	pipeRows := 0
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "# ") ||
			strings.HasPrefix(line, "## ") ||
			strings.HasPrefix(line, "### ") ||
			strings.HasPrefix(line, "- ") ||
			strings.HasPrefix(line, "* ") ||
			strings.HasPrefix(line, "> ") ||
			strings.HasPrefix(line, "```") {
			return true
		}
		if len(line) > 3 && line[0] >= '0' && line[0] <= '9' {
			if dot := strings.Index(line, ". "); dot > 0 && dot <= 3 {
				return true
			}
		}
		if strings.Count(line, "|") >= 2 {
			pipeRows++
			if pipeRows >= 2 {
				return true
			}
		}
		if strings.Contains(line, "**") || strings.Contains(line, "__") || strings.Contains(line, "`") {
			return true
		}
	}
	return false
}

// glamourStyleFromTheme builds an ansi.StyleConfig out of the Theme.
// We start from glamour's Dark or Light base depending on the theme's
// background luminance, then override the colours that directly
// affect readability of the conversation pane — document text,
// headings, inline code, fenced code blocks, and links.
//
// The override strategy intentionally keeps most of glamour's defaults
// (prefixes, margins, italics) untouched; only colour fields get
// replaced. Hex colours come from the lipgloss Color type which
// implements color.Color; we pass them as pointer-to-string since that's
// what ansi.StylePrimitive expects.
func glamourStyleFromTheme(t Theme) glamouransi.StyleConfig {
	// Choose a reasonable base: light backgrounds get glamour's light
	// defaults (dark text on near-white), everything else gets dark.
	base := styles.DarkStyleConfig
	switch ThemeModeFor(t) {
	case ModeLight, ModeSolarizedLight:
		base = styles.LightStyleConfig
	}

	fg := hexOf(t.Fg)
	muted := hexOf(t.FgMuted)
	primary := hexOf(t.Primary)
	secondary := hexOf(t.Secondary)
	warning := hexOf(t.Warning)
	bgSub := hexOf(t.BgSubtle)

	// Body text + paragraph defaults.
	base.Document.Color = strPtr(fg)
	base.Paragraph.Color = strPtr(fg)
	base.Text.Color = strPtr(fg)

	// Headings take the primary accent.
	base.Heading.Color = strPtr(primary)
	base.Heading.Bold = boolPtr(true)
	base.H1.Color = strPtr(primary)
	base.H2.Color = strPtr(primary)
	base.H3.Color = strPtr(primary)
	base.H4.Color = strPtr(primary)
	base.H5.Color = strPtr(primary)
	base.H6.Color = strPtr(primary)

	// Inline code — warning colour on the subtle-bg surface. Using
	// the theme's Warning (usually the only saturated yellow/orange)
	// keeps it readable against both dark and light backgrounds.
	base.Code.Color = strPtr(warning)
	base.Code.BackgroundColor = strPtr(bgSub)

	// Fenced code blocks: glamour keeps a margin; we only retint the
	// top-level code colour. The embedded chroma (syntax highlighter)
	// has its own palette per theme; leaving it alone keeps language-
	// specific colouring sensible.
	base.CodeBlock.Color = strPtr(fg)

	// Links + block quotes lean on the secondary accent.
	base.Link.Color = strPtr(secondary)
	base.LinkText.Color = strPtr(secondary)
	base.BlockQuote.Color = strPtr(muted)

	// Emph/strong inherit the body colour; glamour's default italic/
	// bold is enough. We only retint if the starting value is unset,
	// so long text emphasis doesn't get coloured out of the flow.
	if base.Emph.Color == nil {
		base.Emph.Color = strPtr(fg)
	}
	if base.Strong.Color == nil {
		base.Strong.Color = strPtr(fg)
	}

	return base
}

// hexOf converts a color.Color into a CSS-style #RRGGBB string that
// glamour can parse. Alpha is dropped — glamour doesn't use it.
func hexOf(c color.Color) string {
	r, g, b, _ := c.RGBA()
	return fmt.Sprintf("#%02X%02X%02X", r>>8, g>>8, b>>8)
}

// strPtr / boolPtr return pointers to their arg. glamour's
// StyleConfig uses pointer scalars so "unset" can be distinguished
// from "zero value".
func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }
