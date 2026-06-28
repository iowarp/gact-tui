package ui

// context_bar.go renders the Claude /context-style segmented context-usage bar:
// one continuous horizontal bar split into proportional coloured blocks, one per
// category, in a stable order, with the auto-compaction threshold marked on the
// bar. A legend lists each category (swatch + name + tokens + %). This is the
// shared visual reused by the dedicated Context view, the memory inspector, and
// the footer indicator.

import (
	"fmt"
	"image/color"
	"sort"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// contextCategoryOrder is the stable left-to-right order the segmented bar and
// legend paint categories in. Keys outside this list (unknown future buckets)
// sort after these, alphabetically, so the bar never silently drops tokens.
var contextCategoryOrder = []string{
	"system",
	"messages",
	"tools",
	"tool_calls",
	"observations",
	"reasoning",
	"summary",
	"io",
	"framing",
	"other",
}

// contextCategoryRank gives each known category a stable index for ordering.
var contextCategoryRank = func() map[string]int {
	m := make(map[string]int, len(contextCategoryOrder))
	for i, k := range contextCategoryOrder {
		m[k] = i
	}
	return m
}()

// contextCategoryColor maps a /context-style category to a stable theme colour.
// Every colour comes from the active palette — no hard-coded hex — so the bar
// re-tints with the user's theme. The mapping is deterministic per category so
// the same bucket keeps the same swatch across renders and surfaces.
func contextCategoryColor(t Theme, category string) color.Color {
	switch category {
	case "system":
		return t.RoleSystem
	case "messages":
		return t.RoleUser
	case "tools":
		return t.RoleTool
	case "tool_calls":
		return t.Warning
	case "observations":
		return t.Secondary
	case "reasoning":
		return t.RoleAssistant
	case "summary":
		return t.Success
	case "io":
		return t.Primary
	case "framing":
		return t.FgFaint
	case "other":
		return t.FgMuted
	default:
		// Deterministic fallback for unknown future buckets: cycle through
		// the role accents so each distinct key still gets a stable colour.
		accents := []color.Color{
			t.RoleUser, t.RoleAssistant,
			t.RoleTool, t.Secondary, t.Primary,
		}
		h := 0
		for _, r := range category {
			h = h*31 + int(r)
		}
		if h < 0 {
			h = -h
		}
		return accents[h%len(accents)]
	}
}

// contextCategoryLabel is the human-readable name for a category swatch.
func contextCategoryLabel(category string) string {
	switch category {
	case "system":
		return "system"
	case "messages":
		return "messages"
	case "tools":
		return "tools"
	case "tool_calls":
		return "tool calls"
	case "observations":
		return "observations"
	case "reasoning":
		return "reasoning"
	case "summary":
		return "summary"
	case "io":
		return "I/O"
	case "framing":
		return "framing"
	case "other":
		return "other"
	default:
		return strings.ReplaceAll(category, "_", " ")
	}
}

// contextBarSegment is one proportional block of the segmented bar.
type contextBarSegment struct {
	Category string
	Tokens   int
}

// orderedContextCategories returns the non-zero categories from a ContextState,
// in the stable paint order (known categories first by rank, unknown keys after
// in alphabetical order). Zero/negative buckets are dropped.
func orderedContextCategories(cats map[string]int) []contextBarSegment {
	segs := make([]contextBarSegment, 0, len(cats))
	for k, v := range cats {
		if v <= 0 {
			continue
		}
		segs = append(segs, contextBarSegment{Category: k, Tokens: v})
	}
	sort.SliceStable(segs, func(i, j int) bool {
		ri, oki := contextCategoryRank[segs[i].Category]
		rj, okj := contextCategoryRank[segs[j].Category]
		switch {
		case oki && okj:
			return ri < rj
		case oki:
			return true
		case okj:
			return false
		default:
			return segs[i].Category < segs[j].Category
		}
	})
	return segs
}

// contextBarDenominator picks the denominator the proportional blocks are sized
// against. We grow the bar against the model window when it's known and larger
// than the attributed sum, so the painted blocks leave visible head-room (the
// "how full is the window" reading). When the window is unknown (0) we fall back
// to the attributed sum so the bar is fully painted.
func contextBarDenominator(cs client.ContextState, total int) int {
	if cs.WindowTokens > total {
		return cs.WindowTokens
	}
	if total > 0 {
		return total
	}
	return 1
}

// renderContextBar paints the single continuous segmented bar. width is the cell
// width of the bar; segs are the proportional blocks (already ordered);
// denominator sizes the blocks (window tokens when known, else the attributed
// sum). autocompactPct, when in (0,1], draws a marker glyph at that fraction of
// the bar so the user sees how close they are to auto-compaction.
func renderContextBar(t Theme, width int, segs []contextBarSegment, denominator int, autocompactPct *float64) string {
	if width < 1 {
		width = 1
	}
	if denominator < 1 {
		denominator = 1
	}
	// Build the per-cell colour map. Each segment claims a proportional run of
	// cells; rounding leftovers go to the trailing empty (unfilled) region.
	cells := make([]color.Color, width)
	emptyColor := t.BgSubtle
	for i := range cells {
		cells[i] = emptyColor
	}
	col := 0
	for _, seg := range segs {
		runeCells := seg.Tokens * width / denominator
		if runeCells < 1 && seg.Tokens > 0 {
			runeCells = 1 // keep tiny-but-present buckets visible
		}
		segColor := contextCategoryColor(t, seg.Category)
		for i := 0; i < runeCells && col < width; i++ {
			cells[col] = segColor
			col++
		}
	}
	// Render each cell as a filled block in its colour.
	var b strings.Builder
	markerCol := -1
	if autocompactPct != nil && *autocompactPct > 0 && *autocompactPct <= 1 {
		markerCol = int(*autocompactPct * float64(width))
		if markerCol >= width {
			markerCol = width - 1
		}
	}
	for i := 0; i < width; i++ {
		glyph := "█"
		style := lipgloss.NewStyle().Foreground(cells[i])
		if i == markerCol {
			// Draw the auto-compaction threshold as a contrasting marker
			// overlaid on whatever block sits underneath it.
			glyph = "┃"
			style = lipgloss.NewStyle().Foreground(t.Danger)
		}
		b.WriteString(style.Render(glyph))
	}
	return b.String()
}

// contextFullnessPct returns the preferred fullness fraction for the header /
// footer percentage: used_pct (model-grounded, real prompt tokens) when
// present, else pct_used (segment-store attribution). Returns ok=false when
// neither is available.
func contextFullnessPct(cs client.ContextState) (pct float64, ok bool) {
	if cs.UsedPct != nil {
		return *cs.UsedPct, true
	}
	if cs.PctUsed != nil {
		return *cs.PctUsed, true
	}
	return 0, false
}

// contextAbsoluteTokens returns the absolute numerator for the header line:
// used_tokens (last real LM call) when present, else the live attributed sum.
func contextAbsoluteTokens(cs client.ContextState) int {
	if cs.UsedTokens != nil {
		return *cs.UsedTokens
	}
	return cs.LiveTokens
}

// contextCategoryTotal sums a category map.
func contextCategoryTotal(cats map[string]int) int {
	total := 0
	for _, v := range cats {
		if v > 0 {
			total += v
		}
	}
	return total
}

// contextHeaderText is the "used / window · NN%" summary line shown above the
// bar. window 0 (unknown) renders the absolute count with a "?" window.
func contextHeaderText(cs client.ContextState) string {
	abs := contextAbsoluteTokens(cs)
	window := "?"
	if cs.WindowTokens > 0 {
		window = humanTokens(cs.WindowTokens)
	}
	pctText := ""
	if pct, ok := contextFullnessPct(cs); ok {
		pctText = fmt.Sprintf("  ·  %.0f%%", pct*100)
	}
	return fmt.Sprintf("%s / %s tokens%s", humanTokens(abs), window, pctText)
}

// renderContextLegend builds the legend rows: a colour swatch + category name +
// token count + share-of-total percentage, in the stable paint order. total is
// the denominator for the percentage (the attributed sum). Returns one string
// per legend row.
func renderContextLegend(t Theme, segs []contextBarSegment, total int) []string {
	if total < 1 {
		total = 1
	}
	rows := make([]string, 0, len(segs))
	for _, seg := range segs {
		swatch := lipgloss.NewStyle().Foreground(contextCategoryColor(t, seg.Category)).Render("█")
		name := contextCategoryLabel(seg.Category)
		pct := float64(seg.Tokens) * 100 / float64(total)
		rows = append(rows, fmt.Sprintf("%s %s — %s (%.0f%%)",
			swatch, name, humanTokens(seg.Tokens), pct))
	}
	return rows
}
