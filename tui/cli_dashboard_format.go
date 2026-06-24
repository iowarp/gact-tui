package main

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

type dashboardRow struct {
	id, status, title, model, age, tokens, cost, det string
}

var dashboardHeaders = []string{"ID", "STATUS", "TITLE", "MODEL", "AGE", "TOK in/out", "COST", "DET"}

func dashboardRows(sessions []gact.Session, detached map[string]bool) []dashboardRow {
	rows := make([]dashboardRow, 0, len(sessions))
	now := time.Now().UTC()
	for _, s := range sessions {
		title := s.Title
		if title == "" {
			title = "(untitled)"
		}
		model := s.Model.ModelID
		if model == "" {
			model = "-"
		}
		age := "-"
		if !s.UpdatedAt.IsZero() {
			age = humanAge(now.Sub(s.UpdatedAt.UTC()))
		}
		det := ""
		if detached[s.ID] {
			det = "↩"
		}
		rows = append(rows, dashboardRow{
			id:     s.ID,
			status: s.Status,
			title:  title,
			model:  model,
			age:    age,
			tokens: fmt.Sprintf("%s/%s", humanTokensCLI(s.Tokens.Input), humanTokensCLI(s.Tokens.Output)),
			cost:   fmt.Sprintf("$%.4f", s.CostUSD),
			det:    det,
		})
	}
	return rows
}

func printDashboardTSV(sessions []gact.Session, detached map[string]bool) {
	fmt.Println(strings.Join(dashboardHeaders, "\t"))
	for _, r := range dashboardRows(sessions, detached) {
		fmt.Printf("%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n",
			r.id, r.status, r.title, r.model, r.age, r.tokens, r.cost, r.det)
	}
}

func printDashboardPretty(sessions []gact.Session, detached map[string]bool) {
	rows := dashboardRows(sessions, detached)
	cols := [][]string{
		{dashboardHeaders[0]}, {dashboardHeaders[1]}, {dashboardHeaders[2]}, {dashboardHeaders[3]},
		{dashboardHeaders[4]}, {dashboardHeaders[5]}, {dashboardHeaders[6]}, {dashboardHeaders[7]},
	}
	for _, r := range rows {
		cols[0] = append(cols[0], r.id)
		cols[1] = append(cols[1], r.status)
		cols[2] = append(cols[2], r.title)
		cols[3] = append(cols[3], r.model)
		cols[4] = append(cols[4], r.age)
		cols[5] = append(cols[5], r.tokens)
		cols[6] = append(cols[6], r.cost)
		cols[7] = append(cols[7], r.det)
	}
	widths := make([]int, len(cols))
	for i, col := range cols {
		for _, s := range col {
			// Use rune count, not byte length, so the ↩ glyph
			// (3 bytes UTF-8) doesn't widen the column.
			w := len([]rune(s))
			if w > widths[i] {
				widths[i] = w
			}
		}
	}
	printDashboardRow := func(vals []string) {
		out := make([]string, len(vals))
		for i, v := range vals {
			pad := widths[i] - len([]rune(v))
			if pad < 0 {
				pad = 0
			}
			out[i] = v + strings.Repeat(" ", pad)
		}
		fmt.Println(strings.Join(out, "  "))
	}
	printDashboardRow(dashboardHeaders)
	printDashboardRow([]string{
		strings.Repeat("-", widths[0]), strings.Repeat("-", widths[1]),
		strings.Repeat("-", widths[2]), strings.Repeat("-", widths[3]),
		strings.Repeat("-", widths[4]), strings.Repeat("-", widths[5]),
		strings.Repeat("-", widths[6]), strings.Repeat("-", widths[7]),
	})
	for _, r := range rows {
		printDashboardRow([]string{r.id, r.status, r.title, r.model, r.age, r.tokens, r.cost, r.det})
	}
}

// sortSessions reorders the slice in place by the --sort key. Stable
// sort preserves backend order within tied keys. Unknown key falls
// through to newest (the default), but runDashboard validates the key
// up front so that path should be unreachable.
func sortSessions(sessions []gact.Session, key string) {
	switch key {
	case "oldest":
		sort.SliceStable(sessions, func(i, j int) bool {
			return sessions[i].UpdatedAt.Before(sessions[j].UpdatedAt)
		})
	case "status":
		sort.SliceStable(sessions, func(i, j int) bool {
			return sessions[i].Status < sessions[j].Status
		})
	case "tokens":
		// Tokens = input + output so the most-expensive session
		// surfaces first. Descending.
		total := func(s gact.Session) int64 {
			return int64(s.Tokens.Input) + int64(s.Tokens.Output)
		}
		sort.SliceStable(sessions, func(i, j int) bool {
			return total(sessions[i]) > total(sessions[j])
		})
	case "backend":
		sort.SliceStable(sessions, func(i, j int) bool {
			return sessions[i].WorkspaceID < sessions[j].WorkspaceID
		})
	default: // "newest" (and any unknown — validated up front)
		sort.SliceStable(sessions, func(i, j int) bool {
			return sessions[i].UpdatedAt.After(sessions[j].UpdatedAt)
		})
	}
}

// humanAge formats a duration as a 1-2 char age stamp (5s, 4m, 3h,
// 2d). Used by the dashboard for compact rows.
func humanAge(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

// humanTokensCLI formats token counts compactly (1234→1.2K, 1234567
// →1.2M). Mirrors humanTokens in the TUI; duplicated here so this
// file doesn't import internal/ui.
func humanTokensCLI(n int) string {
	switch {
	case n >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	case n >= 1_000:
		return fmt.Sprintf("%.1fK", float64(n)/1_000)
	default:
		return fmt.Sprintf("%d", n)
	}
}
