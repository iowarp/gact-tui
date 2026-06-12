package ui

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
)

const tuiLatencySampleLimit = 96

type tuiInteractionTrace struct {
	key      string
	surface  string
	kind     string
	targetID string
	started  time.Time
	update   time.Duration
}

type tuiInteractionSample struct {
	update time.Duration
	render time.Duration
	total  time.Duration
}

type tuiInteractionStat struct {
	Surface string
	Kind    string
	Target  string
	Samples []tuiInteractionSample
}

type tuiInteractionTelemetry struct {
	stats map[string]*tuiInteractionStat
}

type tuiInteractionSummary struct {
	Key       string
	Surface   string
	Kind      string
	Target    string
	Count     int
	UpdateP50 time.Duration
	UpdateP95 time.Duration
	RenderP50 time.Duration
	RenderP95 time.Duration
	TotalP50  time.Duration
	TotalP95  time.Duration
	TotalMax  time.Duration
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
	key := surface + ":" + kind
	return &tuiInteractionTrace{
		key:      key,
		surface:  surface,
		kind:     kind,
		targetID: targetID,
		started:  time.Now(),
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
			Surface: trace.surface,
			Kind:    trace.kind,
			Target:  trace.targetID,
		}
		a.tuiLatency.stats[trace.key] = stat
	}
	if trace.targetID != "" {
		stat.Target = trace.targetID
	}
	stat.Samples = append(stat.Samples, sample)
	if len(stat.Samples) > tuiLatencySampleLimit {
		copy(stat.Samples, stat.Samples[len(stat.Samples)-tuiLatencySampleLimit:])
		stat.Samples = stat.Samples[:tuiLatencySampleLimit]
	}
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
		Key:       key,
		Surface:   stat.Surface,
		Kind:      stat.Kind,
		Target:    stat.Target,
		Count:     len(stat.Samples),
		UpdateP50: percentileDuration(updates, 0.50),
		UpdateP95: percentileDuration(updates, 0.95),
		RenderP50: percentileDuration(renders, 0.50),
		RenderP95: percentileDuration(renders, 0.95),
		TotalP50:  percentileDuration(totals, 0.50),
		TotalP95:  percentileDuration(totals, 0.95),
		TotalMax:  maxTotal,
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
