package ui

// metrics_detail.go opens cost/latency/TUI-latency detail panes in the metrics view.

import (
	"fmt"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func metricsFieldRowStart(sectionStart int) int {
	if sectionStart > 0 {
		return sectionStart + 2
	}
	return sectionStart + 1
}

func (c *metricsComponent) openCostDetail(provider string, amount float64) {
	rows := appendDetailSection(nil, "Provider cost",
		detailField{"provider", provider},
		detailField{"cost", fmt.Sprintf("$%.4f", amount)},
	)
	total := c.data.Cost.TotalUSD
	if total > 0 {
		rows = append(rows, detailFieldRows("share", fmt.Sprintf("%.1f%%", amount/total*100))...)
	}
	rows = appendDetailSection(rows, brandName()+" totals",
		detailField{"total cost", fmt.Sprintf("$%.4f", total)},
	)
	c.app.detail.open(&bulkyPartRef{
		messageID: "metrics",
		partID:    "cost:" + provider,
		title:     "Metrics · " + provider,
		fullText:  strings.Join(rows, "\n"),
	})
}

func (c *metricsComponent) openLatencyDetail(route string, stat gact.MetricsLatencyStat) {
	rows := appendDetailSection(nil, brandName()+" latency",
		detailField{"operation", metricsOperationLabel(route)},
		detailField{"api route", route},
		detailField{"count", fmt.Sprintf("%d", stat.Count)},
		detailField{"p50 latency", fmt.Sprintf("%.1f ms", stat.P50Ms)},
		detailField{"p95 latency", fmt.Sprintf("%.1f ms", stat.P95Ms)},
		detailField{"max latency", fmt.Sprintf("%.1f ms", stat.MaxMs)},
	)
	c.app.detail.open(&bulkyPartRef{
		messageID: "metrics",
		partID:    "latency:" + route,
		title:     "API latency · " + route,
		fullText:  strings.Join(rows, "\n"),
	})
}

func (c *metricsComponent) openTUILatencyDetail(stat tuiInteractionSummary) {
	rows := appendDetailSection(nil, "TUI interaction latency",
		detailField{"surface", stat.Surface},
		detailField{"input", stat.Kind},
		detailField{"samples", fmt.Sprintf("%d", stat.Count)},
		detailField{"total p50", formatTUIDuration(stat.TotalP50)},
		detailField{"total p95", formatTUIDuration(stat.TotalP95)},
		detailField{"total max", formatTUIDuration(stat.TotalMax)},
		detailField{"update p50", formatTUIDuration(stat.UpdateP50)},
		detailField{"update p95", formatTUIDuration(stat.UpdateP95)},
		detailField{"render p50", formatTUIDuration(stat.RenderP50)},
		detailField{"render p95", formatTUIDuration(stat.RenderP95)},
	)
	if stat.TargetLabel != "" {
		rows = appendDetailSection(rows, "Target",
			detailField{"label", stat.TargetLabel},
		)
	}
	if stat.Target != "" {
		rows = appendDetailSection(rows, "Evidence",
			detailField{"last hit target", stat.Target},
		)
	}
	c.app.detail.open(&bulkyPartRef{
		messageID: "metrics",
		partID:    "tui-latency:" + stat.Key,
		title:     "TUI latency · " + stat.Surface,
		fullText:  strings.Join(rows, "\n"),
	})
}

func (c *metricsComponent) openTUILatencySectionDetail(stat tuiInteractionLatencySection) {
	rows := appendDetailSection(nil, "TUI latency by section",
		detailField{"surface", stat.Surface},
		detailField{"samples", fmt.Sprintf("%d", stat.SampleCount)},
		detailField{"clicks", fmt.Sprintf("%d", stat.ClickCount)},
		detailField{"wheels", fmt.Sprintf("%d", stat.WheelCount)},
		detailField{"keys", fmt.Sprintf("%d", stat.KeyCount)},
		detailField{"slowest p95", formatTUIDuration(time.Duration(stat.SlowestP95MS * float64(time.Millisecond)))},
		detailField{"slowest max", formatTUIDuration(time.Duration(stat.SlowestMaxMS * float64(time.Millisecond)))},
		detailField{"slowest render", formatTUIDuration(time.Duration(stat.SlowestRender * float64(time.Millisecond)))},
	)
	if len(stat.TargetLabels) > 0 {
		rows = appendDetailSection(rows, "Targets",
			detailField{"labels", strings.Join(stat.TargetLabels, ", ")},
		)
	}
	c.app.detail.open(&bulkyPartRef{
		messageID: "metrics",
		partID:    "tui-section-latency:" + stat.Surface,
		title:     "TUI section latency · " + stat.Surface,
		fullText:  strings.Join(rows, "\n"),
	})
}
