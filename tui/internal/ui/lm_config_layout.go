package ui

// lm_config_layout.go computes the LM-config modal layout (grid widths, body rows, modal width).

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strings"
)

type lmConfigLayout struct {
	bodyRows     int
	providerRows int
	selectedRows int
	modelRows    int
	configRows   int
	gridGapRows  int
	buttonRows   int
	compact      bool
}

func renderedLineCount(parts []string) int {
	total := 0
	for _, part := range parts {
		if part == "" {
			total++
			continue
		}
		total += strings.Count(part, "\n") + 1
	}
	return total
}

func (c *lmConfigComponent) bodyRows() int {
	if c.app.height <= 0 {
		return 18
	}
	// Modal chrome is title, intro, hint, their spacing, and the outer
	// border/padding. Keep the body short enough that provider setup shares
	// the fixed overlay origin used by the other menu families.
	rows := c.app.height - 14
	if c.app.height <= 28 {
		// Very short terminals need the older budget so the save action remains
		// visible; the overlay already has no vertical slack there.
		rows = c.app.height - 12
	}
	if c.open && c.saving {
		rows -= 2
	}
	return maxInt(4, rows)
}

func (c *lmConfigComponent) layout(innerW int, bodyRows int) lmConfigLayout {
	leftW, rightW := lmConfigGridWidths(innerW)
	stacked := leftW < 38 || rightW < 38

	buttonRows := 0
	if bodyRows >= 12 {
		buttonRows = 3
	}
	gridRows := bodyRows - buttonRows
	if buttonRows > 0 && gridRows >= 10 {
		gridRows--
	}
	gridGapRows := 0
	if gridRows >= 9 {
		gridGapRows = 1
	}

	providerCount := 1
	if c.open {
		providerCount = maxInt(1, len(c.providerIndexes()))
	}
	modelCount := c.selectableModelCount()
	if modelCount == 0 {
		modelCount = 1
	}
	configCount := maxInt(1, len(c.lmConfigAdvancedFields()))

	if !stacked && bodyRows < 9 {
		topBodyRows := maxInt(1, bodyRows-3)
		return lmConfigLayout{
			bodyRows:     bodyRows,
			providerRows: topBodyRows,
			selectedRows: topBodyRows,
			modelRows:    0,
			configRows:   0,
			gridGapRows:  0,
			buttonRows:   0,
			compact:      true,
		}
	}

	if stacked {
		cellBodyRows := maxInt(1, (gridRows-(3*gridGapRows))/4-3)
		return lmConfigLayout{
			bodyRows:     bodyRows,
			providerRows: clampInt(cellBodyRows, 1, providerCount),
			selectedRows: maxInt(1, valuefmt.MinInt(cellBodyRows, c.providerDetailsRowCount())),
			modelRows:    clampInt(cellBodyRows, 1, modelCount),
			configRows:   maxInt(1, valuefmt.MinInt(cellBodyRows, configCount)),
			gridGapRows:  gridGapRows,
			buttonRows:   buttonRows,
		}
	}

	availableBoxRows := gridRows - gridGapRows
	if availableBoxRows < 8 {
		availableBoxRows = 8
	}
	topTotalRows := availableBoxRows / 2
	bottomTotalRows := availableBoxRows - topTotalRows
	if providerCount > modelCount+configCount && availableBoxRows >= 10 {
		topTotalRows = (availableBoxRows * 55) / 100
		bottomTotalRows = availableBoxRows - topTotalRows
	}
	if topTotalRows < 4 {
		topTotalRows = 4
	}
	if bottomTotalRows < 4 {
		bottomTotalRows = 4
	}

	providerRows := maxInt(1, topTotalRows-3)
	modelRows := maxInt(1, bottomTotalRows-3)

	return lmConfigLayout{
		bodyRows:     bodyRows,
		providerRows: providerRows,
		selectedRows: providerRows,
		modelRows:    modelRows,
		configRows:   modelRows,
		gridGapRows:  gridGapRows,
		buttonRows:   buttonRows,
	}
}

func lmConfigGridWidths(innerW int) (int, int) {
	leftW := (innerW - 2) / 2
	rightW := innerW - leftW - 2
	return leftW, rightW
}

func (c *lmConfigComponent) modalWidth() int {
	return c.app.modals.modalWidth()
}
