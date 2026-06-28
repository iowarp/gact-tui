package ui

// fileViewerComponent + appFileViewerState: the cwd/workspace-backed sidebar file tree.

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *fileViewerComponent) rootLabel() string {
	base := filepath.Base(c.fileViewerRoot)
	if base == "." || base == string(filepath.Separator) || base == "" {
		return c.fileViewerRoot
	}
	return base
}

func (c *fileViewerComponent) renderModuleRows(width int, startRow int, rowBudget int) []string {
	a := c.app
	t := a.Theme
	title := a.sidebar.moduleTitle(sidebarModuleFiles)
	visible := c.visibleEntries()
	disclosure := "▾ "
	if a.sidebar.filesCollapsed {
		disclosure = "▸ "
		title += fmt.Sprintf(" (%d)", len(c.fileTreeEntries))
	}
	prefix := ""
	if a.focus == a.sidebar.hitFocus && (a.sidebar.sessionsCollapsed || a.sidebar.sectionCursor) && a.sidebar.sectionFocus == sidebarSectionFiles {
		prefix = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
	}
	rows := []string{
		prefix + lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render(disclosure+title),
	}
	a.sidebar.registerSectionHeaderHit(startRow, width, sidebarSectionFiles)
	if a.sidebar.filesCollapsed {
		return rows
	}
	rootLabel := c.rootLabel()
	if rootLabel != "" {
		label := "root: " + rootLabel
		if c.fileTreeRootMode == "workspace" {
			label = "workspace: " + rootLabel
		}
		rows = append(rows, t.HintLabel.Italic(true).Render(textutil.Truncate(label, width-6)))
		if !c.fileTreeUpdated.IsZero() && rowBudget > 2 {
			rows = append(rows, t.HintLabel.Render(textutil.Truncate("updated "+textutil.HumanAgeShort(time.Since(c.fileTreeUpdated)), width-6)))
		}
	}
	if c.fileTreeErr != "" {
		errorRow := startRow + len(rows)
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).Render(textutil.Truncate("folder unavailable", width-6)))
		if rowBudget > 2 {
			rows = append(rows, t.HintLabel.Render(textutil.Truncate("Enter for details", width-6)))
		}
		c.registerErrorHit(errorRow, width)
		return rows
	}
	if len(visible) == 0 {
		rows = append(rows, t.HintLabel.Render("(empty)"))
		return rows
	}
	c.clampSelection()
	if rowBudget < 1 {
		rowBudget = 8
	}
	win := selectedItemWindow(len(visible), c.fileTreeSel, rowBudget)
	if win.start > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d above", win.start)))
	}
	for i := win.start; i < win.end; i++ {
		row := startRow + len(rows)
		entry := visible[i]
		rows = append(rows, c.renderTreeRow(entry, width, i == c.fileTreeSel))
		c.registerTreeHit(row, width, i)
	}
	if win.end < len(visible) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d below", len(visible)-win.end)))
	}
	return rows
}

func fileViewerUnavailableTitle(mode string) string {
	if strings.TrimSpace(mode) == "workspace" {
		return "workspace folder unavailable"
	}
	return "folder unavailable"
}

func (c *fileViewerComponent) rowCount(rowBudget int) int {
	a := c.app
	if !a.sidebar.hasEnabledModule(sidebarModuleFiles) {
		return 0
	}
	rows := 1
	if a.sidebar.filesCollapsed {
		return rows
	}
	rows++
	if !c.fileTreeUpdated.IsZero() && rowBudget > 2 {
		rows++
	}
	if c.fileTreeErr != "" || len(c.visibleEntries()) == 0 {
		return rows + 1
	}
	visible := len(c.visibleEntries())
	if visible > rowBudget {
		rows += rowBudget
		if c.fileTreeSel > 0 {
			rows++
		}
		if c.fileTreeSel < visible-1 {
			rows++
		}
		return rows
	}
	return rows + visible
}

func (c *fileViewerComponent) renderTreeRow(entry fileTreeEntry, width int, selected bool) string {
	a := c.app
	t := a.Theme
	marker := " "
	nameStyle := t.HintLabel
	if selected && a.focus == a.sidebar.hitFocus && a.sidebar.sectionFocus == sidebarSectionFiles && !a.sidebar.sectionCursor {
		marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
		nameStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	}
	indent := strings.Repeat("  ", entry.Depth)
	icon := "• "
	meta := ""
	if entry.Dir {
		if c.fileTreeExpanded[entry.Path] {
			icon = "▾ "
		} else {
			icon = "▸ "
		}
	} else if entry.Size > 0 {
		meta = textutil.HumanBytes(entry.Size)
	}
	contentW := width - 6
	if contentW < 8 {
		contentW = 8
	}
	metaStyle := lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true)
	metaW := lipgloss.Width(meta)
	nameBudget := contentW - lipgloss.Width(marker+indent+icon) - metaW - 1
	if nameBudget < 4 {
		nameBudget = 4
	}
	name := entry.Name
	if entry.Dir {
		name += "/"
	}
	line := marker + indent + icon + nameStyle.Render(textutil.Truncate(name, nameBudget))
	if meta != "" {
		line += " " + metaStyle.Render(meta)
	}
	return textutil.Truncate(line, contentW)
}

func (c *fileViewerComponent) registerTreeHit(row int, width int, visibleIndex int) {
	a := c.app
	if a.interaction.hits == nil {
		return
	}
	zone := a.sidebar.hitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:files:item:" + itoa2(visibleIndex)
	if zone == FocusRightSidebar {
		id = "right-sidebar:files:item:" + itoa2(visibleIndex)
	}
	a.sidebar.registerContentHit(id, row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		app.sidebar.sectionFocus = sidebarSectionFiles
		app.sidebar.sectionCursor = false
		app.fileViewer.fileTreeSel = visibleIndex
		app.fileViewer.activateSelection()
		return nil
	})
}

func (c *fileViewerComponent) registerErrorHit(row int, width int) {
	a := c.app
	if a.interaction.hits == nil {
		return
	}
	zone := a.sidebar.hitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:files:error"
	if zone == FocusRightSidebar {
		id = "right-sidebar:files:error"
	}
	a.sidebar.registerContentHit(id, row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		app.sidebar.sectionFocus = sidebarSectionFiles
		app.sidebar.sectionCursor = false
		app.fileViewer.openRootDetail()
		return nil
	})
}

// appFileViewerState groups the process-local file tree shown in the sidebar.
// It is cwd/workspace backed and does not require backend filesystem support.
type appFileViewerState struct {
	fileViewerRoot   string
	fileTreeEntries  []fileTreeEntry
	fileTreeExpanded map[string]bool
	fileTreeSel      int
	fileTreeErr      string
	fileTreeRootMode string
	fileTreeRefresh  bool
	fileTreeUpdated  time.Time
}

// fileViewerComponent owns the sidebar file tree: its backing state (embedded
// appFileViewerState, so the component's methods keep reading c.fileViewerRoot/
// c.fileTreeSel/… directly via promotion) plus a back-reference to the root App
// for shared services (theme, focus, sidebar layout, detail modal, client,
// workspaces). Unlike overlay components it has no open flag — the tree is
// always present; it is cwd/workspace backed.
type fileViewerComponent struct {
	app *App
	appFileViewerState
}
