package ui

// interaction_latency_summary.go summarizes interaction latency samples into percentile rows and sections.

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

type tuiInteractionSummary struct {
	Key         string
	Surface     string
	Kind        string
	Target      string
	TargetLabel string
	Count       int
	UpdateP50   time.Duration
	UpdateP95   time.Duration
	RenderP50   time.Duration
	RenderP95   time.Duration
	TotalP50    time.Duration
	TotalP95    time.Duration
	TotalMax    time.Duration
}

type tuiInteractionLatencyReport struct {
	GeneratedAt  string                         `json:"generated_at"`
	Backend      string                         `json:"backend"`
	SessionID    string                         `json:"session_id,omitempty"`
	WindowWidth  int                            `json:"window_width"`
	WindowHeight int                            `json:"window_height"`
	FocusSurface string                         `json:"focus_surface"`
	MouseEnabled bool                           `json:"mouse_enabled"`
	SampleCount  int                            `json:"sample_count"`
	SurfaceCount int                            `json:"surface_count"`
	Slowest      *tuiInteractionLatencyRow      `json:"slowest,omitempty"`
	Sections     []tuiInteractionLatencySection `json:"sections"`
	Interactions []tuiInteractionLatencyRow     `json:"interactions"`
	SupportedBy  tuiInteractionLatencyCoverage  `json:"supported_by"`
}

type tuiInteractionLatencyCoverage struct {
	Keys   bool `json:"keys"`
	Clicks bool `json:"clicks"`
	Wheels bool `json:"wheels"`
	Copies bool `json:"copies"`
}

type tuiInteractionLatencyRow struct {
	Key         string  `json:"key"`
	Surface     string  `json:"surface"`
	Kind        string  `json:"kind"`
	TargetLabel string  `json:"target_label,omitempty"`
	Target      string  `json:"last_hit_target,omitempty"`
	Count       int     `json:"count"`
	UpdateP50   float64 `json:"update_p50_ms"`
	UpdateP95   float64 `json:"update_p95_ms"`
	RenderP50   float64 `json:"render_p50_ms"`
	RenderP95   float64 `json:"render_p95_ms"`
	TotalP50    float64 `json:"total_p50_ms"`
	TotalP95    float64 `json:"total_p95_ms"`
	TotalMax    float64 `json:"total_max_ms"`
}

type tuiInteractionLatencySection struct {
	Surface       string   `json:"surface"`
	SampleCount   int      `json:"sample_count"`
	ClickCount    int      `json:"click_count,omitempty"`
	WheelCount    int      `json:"wheel_count,omitempty"`
	KeyCount      int      `json:"key_count,omitempty"`
	CopyCount     int      `json:"copy_count,omitempty"`
	TargetLabels  []string `json:"target_labels,omitempty"`
	SlowestP95MS  float64  `json:"slowest_p95_ms"`
	SlowestMaxMS  float64  `json:"slowest_max_ms"`
	SlowestRender float64  `json:"slowest_render_p95_ms"`
}

func (c *metricsComponent) tuiInteractionSummaries(limit int) []tuiInteractionSummary {
	if c == nil || len(c.tuiLatency.stats) == 0 {
		return nil
	}
	out := make([]tuiInteractionSummary, 0, len(c.tuiLatency.stats))
	for key, stat := range c.tuiLatency.stats {
		if stat == nil || len(stat.Samples) == 0 {
			continue
		}
		out = append(out, summarizeTUIInteraction(key, stat))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].TotalP95 == out[j].TotalP95 {
			return out[i].Key < out[j].Key
		}
		return out[i].TotalP95 > out[j].TotalP95
	})
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}

func summarizeTUIInteraction(key string, stat *tuiInteractionStat) tuiInteractionSummary {
	updates := make([]time.Duration, 0, len(stat.Samples))
	renders := make([]time.Duration, 0, len(stat.Samples))
	totals := make([]time.Duration, 0, len(stat.Samples))
	var maxTotal time.Duration
	for _, sample := range stat.Samples {
		updates = append(updates, sample.update)
		renders = append(renders, sample.render)
		totals = append(totals, sample.total)
		if sample.total > maxTotal {
			maxTotal = sample.total
		}
	}
	return tuiInteractionSummary{
		Key:         key,
		Surface:     stat.Surface,
		Kind:        stat.Kind,
		Target:      stat.Target,
		TargetLabel: stat.TargetLabel,
		Count:       len(stat.Samples),
		UpdateP50:   percentileDuration(updates, 0.50),
		UpdateP95:   percentileDuration(updates, 0.95),
		RenderP50:   percentileDuration(renders, 0.50),
		RenderP95:   percentileDuration(renders, 0.95),
		TotalP50:    percentileDuration(totals, 0.50),
		TotalP95:    percentileDuration(totals, 0.95),
		TotalMax:    maxTotal,
	}
}

func percentileDuration(values []time.Duration, p float64) time.Duration {
	if len(values) == 0 {
		return 0
	}
	sort.Slice(values, func(i, j int) bool { return values[i] < values[j] })
	if p <= 0 {
		return values[0]
	}
	if p >= 1 {
		return values[len(values)-1]
	}
	idx := int(math.Ceil(float64(len(values))*p)) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(values) {
		idx = len(values) - 1
	}
	return values[idx]
}

func formatTUIDuration(d time.Duration) string {
	if d < time.Microsecond {
		return "0ms"
	}
	ms := float64(d) / float64(time.Millisecond)
	if ms < 1 {
		return fmt.Sprintf("%.2fms", ms)
	}
	if ms < 10 {
		return fmt.Sprintf("%.1fms", ms)
	}
	if ms < 100 {
		return fmt.Sprintf("%.1fms", ms)
	}
	return fmt.Sprintf("%.0fms", ms)
}

func tuiInteractionOperatorText(st tuiInteractionSummary) string {
	samples := "no samples"
	if st.Count == 1 {
		samples = "1 sample"
	} else if st.Count > 1 {
		samples = fmt.Sprintf("%d samples", st.Count)
	}
	return fmt.Sprintf("usually %s · render %s · worst %s · %s",
		formatTUIDuration(st.TotalP95),
		formatTUIDuration(st.RenderP95),
		formatTUIDuration(st.TotalMax),
		samples,
	)
}

func tuiInteractionDisplayTitle(st tuiInteractionSummary) string {
	title := st.Surface + " " + st.Kind
	if st.TargetLabel != "" {
		title += " · " + st.TargetLabel
	}
	return title
}

func tuiInteractionSectionDisplayTitle(st tuiInteractionLatencySection) string {
	if st.Surface == "" {
		return "workspace"
	}
	return st.Surface
}

func tuiInteractionSectionOperatorText(st tuiInteractionLatencySection) string {
	parts := []string{fmt.Sprintf("%d samples", st.SampleCount)}
	if st.ClickCount > 0 {
		parts = append(parts, fmt.Sprintf("%d clicks", st.ClickCount))
	}
	if st.WheelCount > 0 {
		parts = append(parts, fmt.Sprintf("%d wheels", st.WheelCount))
	}
	if st.KeyCount > 0 {
		parts = append(parts, fmt.Sprintf("%d keys", st.KeyCount))
	}
	if st.CopyCount > 0 {
		parts = append(parts, fmt.Sprintf("%d copies", st.CopyCount))
	}
	return fmt.Sprintf("usually %s · render %s · worst %s · %s",
		formatTUIDuration(time.Duration(st.SlowestP95MS*float64(time.Millisecond))),
		formatTUIDuration(time.Duration(st.SlowestRender*float64(time.Millisecond))),
		formatTUIDuration(time.Duration(st.SlowestMaxMS*float64(time.Millisecond))),
		strings.Join(parts, " · "),
	)
}
