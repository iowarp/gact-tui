package ui

// doctor_integration_detail.go registers health-row hits and opens integration/capability detail.

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (d *doctorComponent) healthRowHits(innerW int) []modalRowHit {
	if !d.open || len(d.health.Integrations) == 0 {
		return nil
	}
	rows := appendDetailSection(nil, "Overview",
		detailField{"status", doctorStatusText(d.health.OverallStatus)},
		detailField{"uptime", textutil.FormatUptime(d.health.UptimeS)},
	)
	start := len(rows) + 2 // blank separator + Integrations section title.
	hits := make([]modalRowHit, 0, len(d.health.Integrations))
	for _, integ := range d.health.Integrations {
		integ := integ
		rowHeight := len(detailFieldRows(integ.Name, doctorIntegrationValue(integ, innerW)))
		if rowHeight < 1 {
			rowHeight = 1
		}
		hits = append(hits, modalRowHit{
			id:     "doctor:integration:" + integ.Name,
			start:  start,
			height: rowHeight,
			action: func(app *App) tea.Cmd {
				app.doctor.openIntegrationDetail(integ)
				return nil
			},
		})
		start += rowHeight
	}
	return hits
}

func (d *doctorComponent) openIntegrationDetail(integ gact.Integration) {
	rows := appendDetailSection(nil, "Integration",
		detailField{"name", integ.Name},
		detailField{"status", doctorStatusText(integ.Status)},
		detailField{"detail", orPlaceholder(integ.Detail, "not reported")},
	)
	if d.open {
		overall := d.health.OverallStatus
		if overall == "" {
			if d.health.Healthy {
				overall = "ready"
			} else {
				overall = "unavailable"
			}
		}
		rows = appendDetailSection(rows, "Backend",
			detailField{"overall_status", doctorStatusText(overall)},
			detailField{"uptime", textutil.FormatUptime(d.health.UptimeS)},
		)
	}
	d.app.detail.open(&bulkyPartRef{
		messageID: "doctor",
		partID:    "integration:" + integ.Name,
		title:     "Doctor · " + integ.Name,
		fullText:  strings.Join(rows, "\n"),
	})
}
