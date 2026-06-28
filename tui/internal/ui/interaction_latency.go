package ui

// interaction_latency.go records per-interaction latency traces and samples for TUI telemetry.

import (
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

func (c *metricsComponent) beginInteractionTrace(msg tea.Msg) *tuiInteractionTrace {
	if c == nil || c.app == nil {
		return nil
	}
	kind, targetID, ok := c.classifyInteraction(msg)
	if !ok {
		return nil
	}
	surface := tuiLatencySurfaceForTarget(targetID)
	if surface == "" {
		surface = c.app.chrome.currentTUISurface()
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

func (c *metricsComponent) finishInteractionUpdate(trace *tuiInteractionTrace, elapsed time.Duration) {
	if trace == nil {
		return
	}
	trace.update = elapsed
	c.pendingTUIInteraction = trace
}

func (c *metricsComponent) finishInteractionRender(renderElapsed time.Duration) {
	if c == nil || c.pendingTUIInteraction == nil {
		return
	}
	trace := c.pendingTUIInteraction
	c.pendingTUIInteraction = nil
	total := time.Since(trace.started)
	if total < trace.update+renderElapsed {
		total = trace.update + renderElapsed
	}
	c.recordInteractionSample(trace, tuiInteractionSample{
		update: trace.update,
		render: renderElapsed,
		total:  total,
	})
}

func (c *metricsComponent) recordInteractionSample(trace *tuiInteractionTrace, sample tuiInteractionSample) {
	if trace == nil || trace.key == "" {
		return
	}
	if c.tuiLatency.stats == nil {
		c.tuiLatency.stats = map[string]*tuiInteractionStat{}
	}
	stat := c.tuiLatency.stats[trace.key]
	if stat == nil {
		stat = &tuiInteractionStat{
			Surface:     trace.surface,
			Kind:        trace.kind,
			Target:      trace.targetID,
			TargetLabel: trace.targetLabel,
		}
		c.tuiLatency.stats[trace.key] = stat
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

func (c *metricsComponent) classifyInteraction(msg tea.Msg) (kind, targetID string, ok bool) {
	switch m := msg.(type) {
	case tea.MouseClickMsg:
		if !c.app.MouseEnabled {
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
		targetID = c.app.interaction.hitTargetIDAt(mouse.X, mouse.Y)
		return kind, targetID, true
	case tea.MouseWheelMsg:
		if !c.app.MouseEnabled {
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
		targetID = c.app.interaction.hitTargetIDAt(mouse.X, mouse.Y)
		return kind, targetID, true
	case tea.KeyPressMsg:
		if m.String() == "" {
			return "", "", false
		}
		if target := c.copyLatencyTargetForKey(m.String()); target != "" {
			return "copy", target, true
		}
		return "key", "", true
	default:
		return "", "", false
	}
}

func (c *metricsComponent) copyLatencyTargetForKey(key string) string {
	if c == nil || c.app == nil {
		return ""
	}
	switch {
	case c.app.detail.visible && key == "y":
		return "detail:copy"
	case c.app.focus == FocusBody && key == "y":
		return "conversation:copy:selected-block"
	case c.app.focus == FocusBody && key == "Y":
		return "conversation:copy:full-conversation"
	case c.app.focus == FocusSidebar && key == "y":
		return "sidebar:copy:session-id"
	default:
		return ""
	}
}
