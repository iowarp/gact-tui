package ui

// doctor_capabilities.go renders the capability matrix and gaps and registers capability row hits.

import (
	"fmt"
	"sort"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// renderDoctorCapabilities tabulates every spec capability as
// {name, status} where status is one of:
//   - "supported" (●  green) — backend advertises it true
//   - "missing"   (●  red)   — backend advertises it false
//   - "unknown"   (?  muted) — backend is missing the flag entirely
func renderDoctorCapabilities(caps gact.Capabilities, t Theme, innerW int) string {
	rows := doctorCapabilityRows(caps)

	// Score header — count supported across the core + v0.2 axes
	// since those map best to "is this backend actually GACT-capable?".
	supported := 0
	measured := 0
	for _, r := range rows {
		if r.bucket == capCore || r.bucket == capV02 {
			measured++
			if r.on {
				supported++
			}
		}
	}
	score := lipgloss.NewStyle().Bold(true).Foreground(t.Success).
		Render(fmt.Sprintf("%d/%d", supported, measured))
	if supported < measured {
		score = lipgloss.NewStyle().Bold(true).Foreground(t.Warning).
			Render(fmt.Sprintf("%d/%d", supported, measured))
	}
	header := lipgloss.NewStyle().Foreground(t.FgMuted).
		Render("Release readiness: core + v0.2 surfaces ") + score

	out := []string{header, ""}

	// Operator-facing table. Raw /v1/capabilities field names remain
	// available from row details; the list itself should describe surfaces.
	nameW := 36
	statusW := 14
	uiW := 14
	bucketW := innerW - nameW - statusW - uiW - 3
	if bucketW < 18 {
		bucketW = 18
	}
	out = append(out,
		lipgloss.NewStyle().Foreground(t.FgFaint).Bold(true).
			Render(textutil.PadRight("SURFACE", nameW)+textutil.PadRight("BACKEND", statusW)+textutil.PadRight("TUI", uiW)+"SCOPE"),
	)
	for _, r := range rows {
		out = append(out, textutil.PadRight(textutil.Truncate(capabilityDisplayName(r.name), nameW-1), nameW)+
			textutil.PadRight(capStatusCell(r.on, t), statusW)+
			textutil.PadRight(capUISupportCell(r.ui, t), uiW)+
			capBucketLabel(r.bucket, t),
		)
	}
	return strings.Join(out, "\n")
}

func renderCapabilityGaps(gaps map[string]gact.CapabilityGap, t Theme, innerW int) string {
	if len(gaps) == 0 {
		return lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
			Render("No explicit capability gaps reported by this backend.")
	}
	names := make([]string, 0, len(gaps))
	for name := range gaps {
		names = append(names, name)
	}
	sort.Strings(names)
	nameW := 22
	statusW := 14
	behaviorW := innerW - nameW - statusW - 2
	if behaviorW < 24 {
		behaviorW = 24
	}
	rows := []string{
		lipgloss.NewStyle().Foreground(t.FgMuted).
			Render("Backend-declared unsupported, deferred, or disabled surfaces."),
		"",
		lipgloss.NewStyle().Foreground(t.FgFaint).Bold(true).
			Render(textutil.PadRight("GAP", nameW) + textutil.PadRight("STATUS", statusW) + "CLIENT BEHAVIOR"),
	}
	for _, name := range names {
		gap := gaps[name]
		status := valuefmt.FirstNonEmpty(gap.Status, "unknown")
		style := lipgloss.NewStyle().Foreground(t.Warning)
		if status == "unsupported" {
			style = lipgloss.NewStyle().Foreground(t.Danger)
		}
		rows = append(rows, textutil.PadRight(name, nameW)+textutil.PadRight(style.Render(status), statusW)+textutil.Truncate(valuefmt.FirstNonEmpty(gap.ClientBehavior, gap.Category, "not specified"), behaviorW))
		if len(gap.RelatedCommands) > 0 {
			rows = append(rows, "  commands: "+strings.Join(gap.RelatedCommands, ", "))
		}
		if len(gap.RelatedEndpoints) > 0 {
			rows = append(rows, "  endpoints: "+strings.Join(gap.RelatedEndpoints, ", "))
		}
		if len(gap.RecoveryActions) > 0 {
			rows = append(rows, "  recovery: "+strings.Join(gap.RecoveryActions, ", "))
		}
	}
	return strings.Join(rows, "\n")
}

func (d *doctorComponent) capabilityRowHits() []modalRowHit {
	if !d.open {
		return nil
	}
	rows := doctorCapabilityRows(d.caps)
	hits := make([]modalRowHit, 0, len(rows))
	for i, row := range rows {
		row := row
		hits = append(hits, modalRowHit{
			id:     "doctor:capability:" + row.name,
			start:  3 + i,
			height: 1,
			action: func(app *App) tea.Cmd {
				app.doctor.openCapabilityDetail(row)
				return nil
			},
		})
	}
	return hits
}

func capStatusCell(on bool, t Theme) string {
	if on {
		return lipgloss.NewStyle().Foreground(t.Success).Bold(true).
			Render("● supported")
	}
	return lipgloss.NewStyle().Foreground(t.Danger).Bold(true).
		Render("● missing")
}

func capUISupportCell(s capUISupport, t Theme) string {
	style := lipgloss.NewStyle().Foreground(t.Success).Bold(true)
	label := "full"
	switch s {
	case capUIPartial:
		style = lipgloss.NewStyle().Foreground(t.Warning).Bold(true)
		label = "partial"
	case capUIGated:
		style = lipgloss.NewStyle().Foreground(t.FgMuted).Bold(true)
		label = "gated"
	case capUINotSurfaced:
		style = lipgloss.NewStyle().Foreground(t.Danger).Bold(true)
		label = "none"
	}
	return style.Render(label)
}

func capBucketLabel(b capBucket, t Theme) string {
	style := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
	switch b {
	case capCore:
		return style.Render("v0.1 core")
	case capExtra:
		return style.Render("v0.1 useful")
	case capV02:
		return style.Render("v0.2")
	case capVendor:
		return style.Render("vendor-specific")
	}
	return style.Render("?")
}

func (d *doctorComponent) openCapabilityDetail(row capRow) {
	rows := appendDetailSection(nil, "Capability",
		detailField{"surface", capabilityDisplayName(row.name)},
		detailField{"backend_field", row.name},
		detailField{"status", capabilityStatusText(row.on)},
		detailField{"tui_support", capUISupportPlainLabel(row.ui)},
		detailField{"scope", capBucketPlainLabel(row.bucket)},
		detailField{"meaning", capabilityMeaning(row.name, row.bucket)},
		detailField{"tui_notes", orPlaceholder(row.notes, "none")},
	)
	if d.open {
		rows = appendDetailSection(rows, "Backend",
			detailField{"contract_version", orPlaceholder(d.caps.ContractVersion, "unknown")},
			detailField{"name", orPlaceholder(d.caps.Backend.Name, "unknown")},
			detailField{"version", orPlaceholder(d.caps.Backend.Version, "unknown")},
			detailField{"vendor", orPlaceholder(d.caps.Backend.Vendor, "unknown")},
		)
	}
	d.app.detail.open(&bulkyPartRef{
		messageID: "doctor",
		partID:    "capability:" + row.name,
		title:     "Capability · " + capabilityDisplayName(row.name),
		fullText:  strings.Join(rows, "\n"),
	})
}
