package ui

// doctor_health_render.go renders the doctor health body and integration status text.

import (
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// renderDoctorBody formats a HealthResponse into the modal body —
// header (overall_status + uptime + version) + integrations table.
func renderDoctorBody(h gact.HealthResponse, t Theme, innerW int) string {
	overall := h.OverallStatus
	if overall == "" {
		if h.Healthy {
			overall = "ready"
		} else {
			overall = "unavailable"
		}
	}
	rows := appendDetailSection(nil, "Overview",
		detailField{"status", doctorStatusText(overall)},
		detailField{"uptime", textutil.FormatUptime(h.UptimeS)},
	)
	if len(h.Integrations) == 0 {
		rows = appendDetailSection(rows, "Integrations",
			detailField{"", "(no integrations reported by this backend)"},
		)
		return strings.Join(rows, "\n")
	}

	fields := make([]detailField, 0, len(h.Integrations))
	for _, integ := range h.Integrations {
		value := doctorIntegrationValue(integ, innerW)
		fields = append(fields, detailField{integ.Name, value})
	}
	rows = appendDetailSection(rows, "Integrations", fields...)
	return strings.Join(rows, "\n")
}

func doctorIntegrationValue(integ gact.Integration, innerW int) string {
	status := doctorStatusText(integ.Status)
	detail := strings.TrimSpace(integ.Detail)
	if detail == "" {
		return status
	}
	w := innerW - lipgloss.Width(integ.Name) - lipgloss.Width(status) - 8
	if w < 24 {
		w = 24
	}
	lines := textutil.WrapPlainRows(detail, w, "")
	if len(lines) == 0 {
		return status
	}
	out := status + " · " + lines[0]
	if len(lines) > 1 {
		out += "\n" + strings.Join(lines[1:], "\n")
	}
	return out
}

func doctorStatusText(status string) string {
	switch strings.TrimSpace(status) {
	case "":
		return "unknown"
	default:
		return status
	}
}
