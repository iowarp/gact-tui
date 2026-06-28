package ui

// interaction_latency_report.go builds and writes the TUI interaction-latency report.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// WriteTUIInteractionLatencyReport preserves the process-local latency table
// for live-capture and profiling runs. Normal TUI sessions do not write this;
// runTUI calls it only when GACT_TUI_LATENCY_REPORT is set.
func (a *App) WriteTUIInteractionLatencyReport(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}
	report := a.metrics.latencyReport()
	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o644)
}

func (c *metricsComponent) latencyReport() tuiInteractionLatencyReport {
	report := tuiInteractionLatencyReport{
		GeneratedAt:  time.Now().UTC().Format(time.RFC3339Nano),
		MouseEnabled: true,
		SupportedBy:  tuiInteractionLatencyCoverage{},
	}
	if c == nil || c.app == nil {
		return report
	}
	a := c.app
	report.Backend = a.BackendURL
	report.SessionID = a.session.currentID()
	report.WindowWidth = a.width
	report.WindowHeight = a.height
	report.FocusSurface = a.chrome.currentTUISurface()
	report.MouseEnabled = a.MouseEnabled

	summaries := c.tuiInteractionSummaries(0)
	report.SurfaceCount = len(summaries)
	report.Sections = tuiInteractionLatencySections(summaries)
	report.Interactions = make([]tuiInteractionLatencyRow, 0, len(summaries))
	for i, summary := range summaries {
		row := tuiInteractionLatencyReportRow(summary)
		if i == 0 {
			slowest := row
			report.Slowest = &slowest
		}
		report.SampleCount += row.Count
		report.Interactions = append(report.Interactions, row)
		switch {
		case summary.Kind == "copy":
			report.SupportedBy.Copies = true
		case summary.Kind == "key":
			report.SupportedBy.Keys = true
		case strings.Contains(summary.Kind, "click"):
			report.SupportedBy.Clicks = true
		case strings.Contains(summary.Kind, "wheel"):
			report.SupportedBy.Wheels = true
		}
	}
	return report
}

func tuiInteractionLatencySections(summaries []tuiInteractionSummary) []tuiInteractionLatencySection {
	if len(summaries) == 0 {
		return nil
	}
	type sectionAccumulator struct {
		row    tuiInteractionLatencySection
		labels map[string]bool
	}
	bySurface := map[string]*sectionAccumulator{}
	for _, summary := range summaries {
		surface := strings.TrimSpace(summary.Surface)
		if surface == "" {
			surface = "workspace"
		}
		acc := bySurface[surface]
		if acc == nil {
			acc = &sectionAccumulator{
				row:    tuiInteractionLatencySection{Surface: surface},
				labels: map[string]bool{},
			}
			bySurface[surface] = acc
		}
		acc.row.SampleCount += summary.Count
		switch {
		case summary.Kind == "copy":
			acc.row.CopyCount += summary.Count
		case summary.Kind == "key":
			acc.row.KeyCount += summary.Count
		case strings.Contains(summary.Kind, "click"):
			acc.row.ClickCount += summary.Count
		case strings.Contains(summary.Kind, "wheel"):
			acc.row.WheelCount += summary.Count
		}
		if summary.TargetLabel != "" {
			acc.labels[summary.TargetLabel] = true
		}
		totalP95 := durationMilliseconds(summary.TotalP95)
		if totalP95 > acc.row.SlowestP95MS {
			acc.row.SlowestP95MS = totalP95
		}
		totalMax := durationMilliseconds(summary.TotalMax)
		if totalMax > acc.row.SlowestMaxMS {
			acc.row.SlowestMaxMS = totalMax
		}
		renderP95 := durationMilliseconds(summary.RenderP95)
		if renderP95 > acc.row.SlowestRender {
			acc.row.SlowestRender = renderP95
		}
	}
	sections := make([]tuiInteractionLatencySection, 0, len(bySurface))
	for _, acc := range bySurface {
		for label := range acc.labels {
			acc.row.TargetLabels = append(acc.row.TargetLabels, label)
		}
		sort.Strings(acc.row.TargetLabels)
		sections = append(sections, acc.row)
	}
	sort.Slice(sections, func(i, j int) bool {
		if sections[i].SlowestP95MS == sections[j].SlowestP95MS {
			return sections[i].Surface < sections[j].Surface
		}
		return sections[i].SlowestP95MS > sections[j].SlowestP95MS
	})
	return sections
}

func tuiInteractionLatencyReportRow(st tuiInteractionSummary) tuiInteractionLatencyRow {
	return tuiInteractionLatencyRow{
		Key:         st.Key,
		Surface:     st.Surface,
		Kind:        st.Kind,
		TargetLabel: st.TargetLabel,
		Target:      st.Target,
		Count:       st.Count,
		UpdateP50:   durationMilliseconds(st.UpdateP50),
		UpdateP95:   durationMilliseconds(st.UpdateP95),
		RenderP50:   durationMilliseconds(st.RenderP50),
		RenderP95:   durationMilliseconds(st.RenderP95),
		TotalP50:    durationMilliseconds(st.TotalP50),
		TotalP95:    durationMilliseconds(st.TotalP95),
		TotalMax:    durationMilliseconds(st.TotalMax),
	}
}

func durationMilliseconds(d time.Duration) float64 {
	return float64(d) / float64(time.Millisecond)
}
