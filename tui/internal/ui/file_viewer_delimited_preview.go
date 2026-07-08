package ui

// file_viewer_delimited_preview.go renders CSV/TSV file previews as aligned tables.

import (
	"encoding/csv"
	"fmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"io"
	"os"
	"strings"
)

func previewDelimitedBytes(data []byte, ext string, limit int) (string, error) {
	r := csv.NewReader(strings.NewReader(string(data)))
	return previewDelimitedRecords(r, ext, limit)
}

func previewDelimitedFilePath(path string, ext string, limit int) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	r := csv.NewReader(f)
	return previewDelimitedRecords(r, ext, limit)
}

func previewDelimitedRecords(r *csv.Reader, ext string, limit int) (string, error) {
	if ext == ".tsv" {
		r.Comma = '\t'
	}
	r.FieldsPerRecord = -1
	header, err := r.Read()
	if err != nil {
		if err == io.EOF {
			return "(empty file)", nil
		}
		return "", err
	}
	rows := make([][]string, 0, limit)
	totalRows := 0
	for {
		row, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		totalRows++
		if len(rows) < limit {
			rows = append(rows, row)
		}
	}
	widths := make([]int, len(header))
	for i, h := range header {
		widths[i] = valuefmt.MinInt(displayCellWidth(h), maxDelimitedPreviewCellWidth)
	}
	for _, row := range rows {
		for i := range header {
			if i < len(row) {
				widths[i] = maxInt(widths[i], valuefmt.MinInt(displayCellWidth(row[i]), maxDelimitedPreviewCellWidth))
			}
		}
	}
	var out strings.Builder
	writePreviewRow(&out, header, widths)
	sep := make([]string, len(header))
	for i, w := range widths {
		sep[i] = strings.Repeat("-", w)
	}
	writePreviewRow(&out, sep, widths)
	for _, row := range rows {
		writePreviewRow(&out, row, widths)
	}
	fmt.Fprintf(&out, "\n%d data rows total (showing %d), %d columns", totalRows, len(rows), len(header))
	return out.String(), nil
}

const maxDelimitedPreviewCellWidth = 32

func writePreviewRow(out *strings.Builder, cells []string, widths []int) {
	for i, w := range widths {
		cell := ""
		if i < len(cells) {
			cell = truncateDelimitedCell(cells[i], w)
		}
		fmt.Fprintf(out, "%-*s  ", w, cell)
	}
	out.WriteString("\n")
}

func displayCellWidth(s string) int {
	return len([]rune(strings.ReplaceAll(s, "\n", " ")))
}

func truncateDelimitedCell(s string, width int) string {
	s = strings.ReplaceAll(s, "\n", " ")
	runes := []rune(s)
	if len(runes) <= width {
		return s
	}
	if width <= 3 {
		return strings.Repeat(".", maxInt(1, width))
	}
	return string(runes[:width-3]) + "..."
}
