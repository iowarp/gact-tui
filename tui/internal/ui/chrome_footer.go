package ui

// chrome_footer.go renders the chrome footer bar.

import (
	"fmt"
	"strings"
	"time"

	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *chromeComponent) renderFooter() string {
	t := c.app.Theme
	// LLL6: cluster hints by intent so the eye can chunk them. Each
	// cluster uses `·` (small middle dot) between hints, `│` between
	// clusters. Action cluster comes first (most-used), then nav,
	// then exit. Same chord style throughout (HintKey + HintLabel),
	// no special-casing — the grouping carries the meaning.
	dotStyle := lipgloss.NewStyle().Foreground(t.FgFaint)
	dot := dotStyle.Render(" · ")
	pipe := dotStyle.Render("  │  ")
	mk := func(key, label string) string {
		return t.HintKey.Render(key) + t.HintLabel.Render(" "+label)
	}
	focus := c.focusLabel(c.app.focus)
	if c.app.lmConfig.open {
		focus = c.app.localizer.t(msgChromeFocusProviderSetup, nil)
	}
	left := t.HintLabel.Render(c.app.localizer.t(msgChromeFocus,
		map[string]string{"value": focus}))
	// Surface SSE reconnect state: while the backoff counter is > 0
	// the stream is down and we're waiting to retry. J2's reset-on-
	// event drops this back to nothing as soon as the stream is
	// healthy, so nothing needs to clear it on a separate code path.
	//
	// DDDDD1: only show the badge if the outage has lasted long
	// enough to matter. Without this gate a flaky/transient SSE
	// drop+reconnect (sub-second) makes the badge appear for a
	// single render frame, then vanish — visible flicker on the
	// footer that the user reported as annoying. 800 ms is short
	// enough that real outages still surface within a second; long
	// enough that the routine ~250 ms reconnect blip stays silent.
	if c.app.connection.sseBackoffAttempts > 0 && !c.app.connection.sseDownSince.IsZero() &&
		time.Since(c.app.connection.sseDownSince) >= sseBadgeMinDelay {
		left += "  " + lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
			Render("(reconnecting…)")
	}

	right := ""

	// CLIO-BBBBBBBBBB4 (v0.2 §6.19): memory cache-hit-rate chip.
	// Gated on capabilities.memory so v0.1 backends render nothing.
	// A non-zero memoryStats.Cache (either hits or misses) means we've
	// actually seen stats; until then, don't show the chip.
	if c.app.session.caps.Capabilities.Memory {
		total := c.app.session.memoryStats.Cache.Hits + c.app.session.memoryStats.Cache.Misses
		if total > 0 {
			hr := c.app.session.memoryStats.Cache.HitRate
			// Traffic-light the hit rate: green ≥ 0.75, amber ≥ 0.50,
			// red otherwise. Matches the CLIO target of >85%.
			hrColor := t.Danger
			switch {
			case hr >= 0.75:
				hrColor = t.Success
			case hr >= 0.50:
				hrColor = t.Warning
			}
			chip := lipgloss.NewStyle().Background(t.Bg).
				Foreground(t.FgMuted).Padding(0, 1).
				Render(c.app.localizer.t(msgFooterMemoryHit, nil))
			rate := lipgloss.NewStyle().Background(t.Bg).
				Foreground(hrColor).Bold(true).Padding(0, 1).
				Render(fmt.Sprintf("%.0f%%", hr*100))
			right = chip + rate + "  "
		}
	}

	available := c.app.width - lipgloss.Width(left) - lipgloss.Width(right) - 8
	if available < 1 {
		available = 1
	}
	hintBudget := available - 16
	if hintBudget < 1 {
		hintBudget = 1
	}
	hintLine := ""
	if dragStatus := c.app.clipboard.activeDragStatus(); dragStatus != "" {
		hintLine = t.HintKey.Render("drag") + t.HintLabel.Render(" "+textutil.Truncate(dragStatus, hintBudget))
	} else {
		clusters := c.footerHintClusters(mk, hintBudget)
		parts := make([]string, 0, len(clusters))
		for _, c := range clusters {
			if len(c) == 0 {
				continue
			}
			parts = append(parts, strings.Join(c, dot))
		}
		hintLine = strings.Join(parts, pipe)
	}
	gap := c.app.width - lipgloss.Width(left) - lipgloss.Width(hintLine) - lipgloss.Width(right) - 8
	if gap < 1 {
		gap = 1
	}
	rendered := lipgloss.NewStyle().
		Width(c.app.width).Background(t.BgSubtle).Foreground(t.FgMuted).
		Padding(0, 1).Render(
		left + "  " + hintLine + strings.Repeat(" ", gap) + right,
	)
	c.registerFooterActionHits(rendered)
	return rendered
}
