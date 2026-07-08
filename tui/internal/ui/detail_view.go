package ui

// detail_view.go renders the detail modal and formats part detail text and kind labels.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func partDetailText(p gact.Part) string {
	fields := []detailField{{"kind", humanizePartKind(p.Type)}}
	fields = append(fields, detailField{"part", p.ID})
	fields = append(fields, detailField{"call", p.CallID})
	fields = append(fields, detailField{"provenance", promotedEvidenceLabel(p)})
	var rows []string
	rows = appendDetailSection(rows, "Part", fields...)

	typeRows, fullText := partTypeDetailRows(p)
	if fullText != "" {
		return fullText
	}
	rows = append(rows, typeRows...)

	rows = appendJSONSection(rows, "metadata", detailMetadataRemainder(p))
	return strings.Join(rows, "\n")
}

func humanizePartKind(kind string) string {
	kind = valuefmt.HumanizeAgentLabel(kind)
	if kind == "" {
		return "unknown"
	}
	return kind
}

// view renders the floating detail modal. Mirrors the
// other modals' chrome (L2) so width and borders stay consistent.
func (m *detailViewModal) view() string {
	if m.ref == nil {
		return ""
	}
	a := m.app
	// Use the wider detail-specific width so file content
	// (the main payload of this modal) doesn't wrap at 72 cols.
	ref := m.ref
	closeLabel := "x"
	hint := ""
	if a.catalog.open && a.catalog.current != nil {
		closeLabel = "back"
		hint = "Up/Down scroll  Pg page  g/G top/bottom  y copy  Esc back"
	}
	rendered := a.modals.renderScrollableDetailModal(scrollableDetailOptions{
		width:      a.modals.detailModalWidth(),
		title:      ref.title,
		content:    ref.fullText,
		scroll:     m.scroll,
		page:       m.pageSize(),
		tabs:       m.fileTabs(),
		hint:       hint,
		closeID:    "detail:close",
		closeLabel: closeLabel,
		close:      func(app *App) { app.detail.close() },
	})
	m.scroll = rendered.scroll
	return rendered.modal
}
