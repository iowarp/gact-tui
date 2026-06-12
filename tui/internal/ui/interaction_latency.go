package ui

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
)

const tuiLatencySampleLimit = 96

type tuiInteractionTrace struct {
	key         string
	surface     string
	kind        string
	targetID    string
	targetLabel string
	started     time.Time
	update      time.Duration
}

type tuiInteractionSample struct {
	update time.Duration
	render time.Duration
	total  time.Duration
}

type tuiInteractionStat struct {
	Surface     string
	Kind        string
	Target      string
	TargetLabel string
	Samples     []tuiInteractionSample
}

type tuiInteractionTelemetry struct {
	stats map[string]*tuiInteractionStat
}

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
	TargetLabels  []string `json:"target_labels,omitempty"`
	SlowestP95MS  float64  `json:"slowest_p95_ms"`
	SlowestMaxMS  float64  `json:"slowest_max_ms"`
	SlowestRender float64  `json:"slowest_render_p95_ms"`
}

func (a *App) beginTUIInteractionTrace(msg tea.Msg) *tuiInteractionTrace {
	if a == nil {
		return nil
	}
	kind, targetID, ok := a.classifyTUIInteraction(msg)
	if !ok {
		return nil
	}
	surface := tuiLatencySurfaceForTarget(targetID)
	if surface == "" {
		surface = a.currentTUISurface()
	}
	if surface == "" {
		surface = "workspace"
	}
	targetLabel := tuiLatencyTargetLabel(targetID)
	if targetLabel == "" && targetID == "" && kind != "key" {
		targetLabel = surface + " surface"
	}
	key := tuiLatencyInteractionKey(surface, kind, targetID)
	return &tuiInteractionTrace{
		key:         key,
		surface:     surface,
		kind:        kind,
		targetID:    targetID,
		targetLabel: targetLabel,
		started:     time.Now(),
	}
}

func (a *App) finishTUIInteractionUpdate(trace *tuiInteractionTrace, elapsed time.Duration) {
	if trace == nil {
		return
	}
	trace.update = elapsed
	a.pendingTUIInteraction = trace
}

func (a *App) finishTUIInteractionRender(renderElapsed time.Duration) {
	if a == nil || a.pendingTUIInteraction == nil {
		return
	}
	trace := a.pendingTUIInteraction
	a.pendingTUIInteraction = nil
	total := time.Since(trace.started)
	if total < trace.update+renderElapsed {
		total = trace.update + renderElapsed
	}
	a.recordTUIInteractionSample(trace, tuiInteractionSample{
		update: trace.update,
		render: renderElapsed,
		total:  total,
	})
}

func (a *App) recordTUIInteractionSample(trace *tuiInteractionTrace, sample tuiInteractionSample) {
	if trace == nil || trace.key == "" {
		return
	}
	if a.tuiLatency.stats == nil {
		a.tuiLatency.stats = map[string]*tuiInteractionStat{}
	}
	stat := a.tuiLatency.stats[trace.key]
	if stat == nil {
		stat = &tuiInteractionStat{
			Surface:     trace.surface,
			Kind:        trace.kind,
			Target:      trace.targetID,
			TargetLabel: trace.targetLabel,
		}
		a.tuiLatency.stats[trace.key] = stat
	}
	if trace.targetID != "" {
		stat.Target = trace.targetID
	}
	if trace.targetLabel != "" {
		stat.TargetLabel = trace.targetLabel
	}
	stat.Samples = append(stat.Samples, sample)
	if len(stat.Samples) > tuiLatencySampleLimit {
		copy(stat.Samples, stat.Samples[len(stat.Samples)-tuiLatencySampleLimit:])
		stat.Samples = stat.Samples[:tuiLatencySampleLimit]
	}
}

func tuiLatencyInteractionKey(surface, kind, targetID string) string {
	key := surface + ":" + kind
	if targetID != "" && kind != "key" {
		key += ":" + targetID
	}
	return key
}

func (a *App) classifyTUIInteraction(msg tea.Msg) (kind, targetID string, ok bool) {
	switch m := msg.(type) {
	case tea.MouseClickMsg:
		if !a.MouseEnabled {
			return "", "", false
		}
		mouse := m.Mouse()
		if mouse.Button == tea.MouseLeft {
			kind = "click"
		} else if mouse.Button == tea.MouseRight {
			kind = "right click"
		} else {
			kind = "mouse"
		}
		targetID = a.hitTargetIDAt(mouse.X, mouse.Y)
		return kind, targetID, true
	case tea.MouseWheelMsg:
		if !a.MouseEnabled {
			return "", "", false
		}
		mouse := m.Mouse()
		if mouse.Button == tea.MouseWheelUp {
			kind = "wheel up"
		} else if mouse.Button == tea.MouseWheelDown {
			kind = "wheel down"
		} else {
			kind = "wheel"
		}
		targetID = a.hitTargetIDAt(mouse.X, mouse.Y)
		return kind, targetID, true
	case tea.KeyPressMsg:
		if m.String() == "" {
			return "", "", false
		}
		return "key", "", true
	default:
		return "", "", false
	}
}

func tuiLatencyTargetLabel(id string) string {
	if id == "" {
		return ""
	}
	switch {
	case id == "input:command":
		return "command chip"
	case id == "input:focus":
		return "message composer"
	case id == "conversation:body:focus":
		return "conversation body"
	case id == "conversation:body:wheel":
		return "conversation scroll area"
	case strings.HasPrefix(id, "conversation:detail:"):
		return "message detail affordance"
	case strings.HasPrefix(id, "conversation:part:"):
		return "message block"
	case strings.HasPrefix(id, "sidebar:session:"):
		return "session row"
	case strings.HasPrefix(id, "sidebar:context:file:"):
		return "context file"
	case strings.HasPrefix(id, "right-sidebar:files:item:"):
		return "file tree row"
	case strings.HasPrefix(id, "right-sidebar:context:file:"):
		return "context file"
	case strings.HasPrefix(id, "right-sidebar:agents:item:"):
		return "agent row"
	case strings.HasPrefix(id, "metrics:tui-latency:"):
		return "TUI latency row"
	case strings.HasPrefix(id, "metrics:latency:"):
		return "API latency row"
	case strings.HasPrefix(id, "metrics:body:wheel"):
		return "metrics scroll area"
	case strings.HasPrefix(id, "button:"):
		return tuiLatencyButtonLabel(id)
	default:
		parts := strings.Split(id, ":")
		if len(parts) == 0 {
			return ""
		}
		labelParts := parts
		if len(labelParts) > 3 {
			labelParts = labelParts[:3]
		}
		for i, part := range labelParts {
			labelParts[i] = strings.ReplaceAll(part, "-", " ")
		}
		return strings.Join(labelParts, " ")
	}
}

func tuiLatencyButtonLabel(id string) string {
	parts := strings.Split(id, ":")
	if len(parts) < 3 {
		return "button"
	}
	scope := strings.ReplaceAll(parts[1], "-", " ")
	action := strings.ReplaceAll(parts[2], "-", " ")
	switch {
	case scope == "" && action == "":
		return "button"
	case scope == "":
		return action + " button"
	case action == "":
		return scope + " button"
	default:
		return scope + " " + action + " button"
	}
}

func (a *App) hitTargetIDAt(x, y int) string {
	if a == nil || a.hits == nil {
		return ""
	}
	if target, ok := a.hits.at(x, y); ok {
		return target.id
	}
	return ""
}

func (a *App) currentTUISurface() string {
	switch {
	case a.paletteOpen:
		return "command palette"
	case a.helpOpen:
		return "help"
	case a.settingsOpen:
		return "settings"
	case a.metricsOpen:
		return "metrics"
	case a.doctorOpen:
		return "doctor"
	case a.detailViewOpen:
		return "detail"
	case a.catalogBrowserOpen:
		return "catalog"
	case a.workspaceSwitchOpen:
		return "workspace switcher"
	case a.filePickerOpen:
		return "file picker"
	case a.lmConfigOpen:
		return "provider setup"
	case a.focus == FocusSidebar:
		return "left sidebar"
	case a.focus == FocusRightSidebar:
		return "right sidebar"
	case a.focus == FocusInput:
		return "input"
	case a.focus == FocusBody:
		return "conversation"
	default:
		return "workspace"
	}
}

func tuiLatencySurfaceForTarget(id string) string {
	if id == "" {
		return ""
	}
	switch {
	case strings.HasPrefix(id, "button:metrics:"), strings.HasPrefix(id, "metrics:"):
		return "metrics"
	case strings.HasPrefix(id, "button:doctor:"), strings.HasPrefix(id, "doctor:"):
		return "doctor"
	case strings.HasPrefix(id, "button:detail:"), strings.HasPrefix(id, "detail:"):
		return "detail"
	case strings.HasPrefix(id, "conversation:"):
		return "conversation"
	case strings.HasPrefix(id, "input:"), strings.HasPrefix(id, "text-entry:"):
		return "input"
	case strings.HasPrefix(id, "sidebar:"):
		return "left sidebar"
	case strings.HasPrefix(id, "right-sidebar:"):
		return "right sidebar"
	case strings.HasPrefix(id, "footer:"):
		return "footer"
	case strings.HasPrefix(id, "header:"):
		return "header"
	case strings.HasPrefix(id, "palette:"):
		return "command palette"
	case strings.HasPrefix(id, "settings:"):
		return "settings"
	case strings.HasPrefix(id, "catalog:"):
		return "catalog"
	case strings.HasPrefix(id, "workspace-switch:"), strings.HasPrefix(id, "workspace-create:"):
		return "workspace switcher"
	case strings.HasPrefix(id, "file-picker:"):
		return "file picker"
	case strings.HasPrefix(id, "lm-config:"):
		return "provider setup"
	case strings.HasPrefix(id, "mcp-"):
		return "mcp"
	case strings.HasPrefix(id, "agent-blueprint"), strings.Contains(id, "agent-blueprint"):
		return "agent blueprints"
	case strings.HasPrefix(id, "expert-pack"):
		return "expert packs"
	default:
		part := strings.Split(id, ":")[0]
		if part != "" {
			return strings.ReplaceAll(part, "-", " ")
		}
		return ""
	}
}

func (a *App) tuiInteractionSummaries(limit int) []tuiInteractionSummary {
	if a == nil || len(a.tuiLatency.stats) == 0 {
		return nil
	}
	out := make([]tuiInteractionSummary, 0, len(a.tuiLatency.stats))
	for key, stat := range a.tuiLatency.stats {
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
	return fmt.Sprintf("usually %s · render %s · worst %s · %s",
		formatTUIDuration(time.Duration(st.SlowestP95MS*float64(time.Millisecond))),
		formatTUIDuration(time.Duration(st.SlowestRender*float64(time.Millisecond))),
		formatTUIDuration(time.Duration(st.SlowestMaxMS*float64(time.Millisecond))),
		strings.Join(parts, " · "),
	)
}

// WriteTUIInteractionLatencyReport preserves the process-local latency table
// for live-capture and profiling runs. Normal TUI sessions do not write this;
// runTUI calls it only when GACT_TUI_LATENCY_REPORT is set.
func (a *App) WriteTUIInteractionLatencyReport(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}
	report := a.tuiInteractionLatencyReport()
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

func (a *App) tuiInteractionLatencyReport() tuiInteractionLatencyReport {
	report := tuiInteractionLatencyReport{
		GeneratedAt:  time.Now().UTC().Format(time.RFC3339Nano),
		MouseEnabled: true,
		SupportedBy:  tuiInteractionLatencyCoverage{},
	}
	if a == nil {
		return report
	}
	report.Backend = a.BackendURL
	report.SessionID = a.currentSessionID()
	report.WindowWidth = a.width
	report.WindowHeight = a.height
	report.FocusSurface = a.currentTUISurface()
	report.MouseEnabled = a.MouseEnabled

	summaries := a.tuiInteractionSummaries(0)
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
