package ui

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

const (
	fileViewerMaxDepth   = 5
	fileViewerMaxEntries = 600
)

type fileTreeEntry struct {
	Path  string
	Name  string
	Dir   bool
	Depth int
	Size  int64
}

func (a *App) initFileViewerFromCwd() {
	cwd, err := os.Getwd()
	if err != nil {
		a.fileViewerRoot = "."
		a.fileTreeErr = err.Error()
		a.fileTreeExpanded = map[string]bool{}
		return
	}
	a.SetFileViewerRoot(cwd)
}

func (a *App) SetFileViewerRoot(root string) {
	root = strings.TrimSpace(root)
	if root == "" {
		root = "."
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		abs = root
	}
	a.fileViewerRoot = abs
	a.fileTreeExpanded = map[string]bool{}
	a.fileTreeSel = 0
	a.reloadFileViewer()
}

func (a *App) reloadFileViewer() {
	entries, err := scanFileTree(a.fileViewerRoot)
	a.fileTreeEntries = entries
	a.fileTreeErr = ""
	if err != nil {
		a.fileTreeErr = err.Error()
	}
	a.clampFileTreeSelection()
}

func scanFileTree(root string) ([]fileTreeEntry, error) {
	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", root)
	}
	entries := make([]fileTreeEntry, 0, 128)
	var walk func(abs string, rel string, depth int)
	walk = func(abs string, rel string, depth int) {
		if depth > fileViewerMaxDepth || len(entries) >= fileViewerMaxEntries {
			return
		}
		children, err := os.ReadDir(abs)
		if err != nil {
			return
		}
		sort.Slice(children, func(i, j int) bool {
			if children[i].IsDir() != children[j].IsDir() {
				return children[i].IsDir()
			}
			return strings.ToLower(children[i].Name()) < strings.ToLower(children[j].Name())
		})
		for _, child := range children {
			if len(entries) >= fileViewerMaxEntries {
				return
			}
			name := child.Name()
			if shouldSkipFileViewerEntry(name, child.IsDir()) {
				continue
			}
			childRel := name
			if rel != "" {
				childRel = filepath.ToSlash(filepath.Join(rel, name))
			}
			entry := fileTreeEntry{
				Path:  childRel,
				Name:  name,
				Dir:   child.IsDir(),
				Depth: depth,
			}
			if info, err := child.Info(); err == nil {
				entry.Size = info.Size()
			}
			entries = append(entries, entry)
			if child.IsDir() {
				walk(filepath.Join(abs, name), childRel, depth+1)
			}
		}
	}
	walk(root, "", 0)
	return entries, nil
}

func shouldSkipFileViewerEntry(name string, isDir bool) bool {
	if isDir && strings.HasPrefix(name, ".") {
		return true
	}
	switch name {
	case ".git", ".hg", ".svn", "node_modules", ".venv", "venv", ".tox", ".mypy_cache", ".pytest_cache", ".tools":
		return true
	default:
		return false
	}
}

func (a *App) visibleFileTreeEntries() []fileTreeEntry {
	visible := make([]fileTreeEntry, 0, len(a.fileTreeEntries))
	parentExpanded := map[int]bool{-1: true}
	for _, entry := range a.fileTreeEntries {
		parentDepth := entry.Depth - 1
		if !parentExpanded[parentDepth] {
			parentExpanded[entry.Depth] = false
			continue
		}
		visible = append(visible, entry)
		if entry.Dir {
			parentExpanded[entry.Depth] = a.fileTreeExpanded[entry.Path]
		}
	}
	return visible
}

func (a *App) clampFileTreeSelection() {
	visible := a.visibleFileTreeEntries()
	if len(visible) == 0 {
		a.fileTreeSel = 0
		return
	}
	a.fileTreeSel = clampSelection(a.fileTreeSel, len(visible))
}

func (a *App) activateFileTreeSelection() {
	visible := a.visibleFileTreeEntries()
	if len(visible) == 0 {
		return
	}
	a.fileTreeSel = clampSelection(a.fileTreeSel, len(visible))
	entry := visible[a.fileTreeSel]
	if entry.Dir {
		a.fileTreeExpanded[entry.Path] = !a.fileTreeExpanded[entry.Path]
		return
	}
	a.openFileViewerDetail(entry)
}

func (a *App) openFileViewerDetail(entry fileTreeEntry) {
	fullPath := filepath.Join(a.fileViewerRoot, filepath.FromSlash(entry.Path))
	data, err := os.ReadFile(fullPath)
	rows := []string{
		"path: " + entry.Path,
		"root: " + a.fileViewerRoot,
	}
	if entry.Size > 0 {
		rows = append(rows, "size: "+humanBytes(entry.Size))
	}
	if err != nil {
		rows = append(rows, "error: "+err.Error())
	} else {
		text := string(data)
		if len(text) > 12000 {
			text = text[:12000] + "\n[truncated]"
		}
		rows = append(rows, "", text)
	}
	a.detailView = &bulkyPartRef{
		messageID: "files",
		partID:    entry.Path,
		title:     "File · " + entry.Path,
		fullText:  strings.Join(rows, "\n"),
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func (a *App) fileViewerRootLabel() string {
	base := filepath.Base(a.fileViewerRoot)
	if base == "." || base == string(filepath.Separator) || base == "" {
		return a.fileViewerRoot
	}
	return base
}

func (a *App) renderFileViewerModuleRows(width int, startRow int, rowBudget int) []string {
	t := a.Theme
	title := a.sidebarModuleTitle(sidebarModuleFiles)
	visible := a.visibleFileTreeEntries()
	disclosure := "▾ "
	if a.sidebarFilesCollapsed {
		disclosure = "▸ "
		title += fmt.Sprintf(" (%d)", len(a.fileTreeEntries))
	}
	prefix := ""
	if a.focus == a.sidebarHitFocus && (a.sidebarSessionsCollapsed || a.sidebarSectionCursor) && a.sidebarSectionFocus == sidebarSectionFiles {
		prefix = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
	}
	rows := []string{
		prefix + lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render(disclosure+title),
	}
	a.registerSidebarSectionHeaderHit(startRow, width, sidebarSectionFiles)
	if a.sidebarFilesCollapsed {
		return rows
	}
	rootLabel := a.fileViewerRootLabel()
	if rootLabel != "" {
		rows = append(rows, t.HintLabel.Italic(true).Render(truncate("root: "+rootLabel, width-6)))
	}
	if a.fileTreeErr != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).Render(truncate("error: "+a.fileTreeErr, width-6)))
		return rows
	}
	if len(visible) == 0 {
		rows = append(rows, t.HintLabel.Render("(empty)"))
		return rows
	}
	a.clampFileTreeSelection()
	if rowBudget < 1 {
		rowBudget = 8
	}
	win := selectedItemWindow(len(visible), a.fileTreeSel, rowBudget)
	if win.start > 0 {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d above", win.start)))
	}
	for i := win.start; i < win.end; i++ {
		row := startRow + len(rows)
		entry := visible[i]
		rows = append(rows, a.renderFileTreeRow(entry, width, i == a.fileTreeSel))
		a.registerSidebarFileTreeHit(row, width, i)
	}
	if win.end < len(visible) {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(fmt.Sprintf(" … %d below", len(visible)-win.end)))
	}
	return rows
}

func (a *App) sidebarFileViewerRowCount(rowBudget int) int {
	if !a.sidebarHasEnabledModule(sidebarModuleFiles) {
		return 0
	}
	rows := 1
	if a.sidebarFilesCollapsed {
		return rows
	}
	rows++
	if a.fileTreeErr != "" || len(a.visibleFileTreeEntries()) == 0 {
		return rows + 1
	}
	visible := len(a.visibleFileTreeEntries())
	if visible > rowBudget {
		rows += rowBudget
		if a.fileTreeSel > 0 {
			rows++
		}
		if a.fileTreeSel < visible-1 {
			rows++
		}
		return rows
	}
	return rows + visible
}

func (a *App) renderFileTreeRow(entry fileTreeEntry, width int, selected bool) string {
	t := a.Theme
	marker := " "
	nameStyle := t.HintLabel
	if selected && a.focus == a.sidebarHitFocus && a.sidebarSectionFocus == sidebarSectionFiles && !a.sidebarSectionCursor {
		marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌")
		nameStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
	}
	indent := strings.Repeat("  ", entry.Depth)
	icon := "• "
	meta := ""
	if entry.Dir {
		if a.fileTreeExpanded[entry.Path] {
			icon = "▾ "
		} else {
			icon = "▸ "
		}
	} else if entry.Size > 0 {
		meta = humanBytes(entry.Size)
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
	line := marker + indent + icon + nameStyle.Render(truncate(name, nameBudget))
	if meta != "" {
		line += " " + metaStyle.Render(meta)
	}
	return truncate(line, contentW)
}

func (a *App) registerSidebarFileTreeHit(row int, width int, visibleIndex int) {
	if a.hits == nil {
		return
	}
	zone := a.sidebarHitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:files:item:" + itoa2(visibleIndex)
	if zone == FocusRightSidebar {
		id = "right-sidebar:files:item:" + itoa2(visibleIndex)
	}
	a.registerSidebarContentHit(id, row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		app.sidebarSectionFocus = sidebarSectionFiles
		app.sidebarSectionCursor = false
		app.fileTreeSel = visibleIndex
		app.activateFileTreeSelection()
		return nil
	})
}
