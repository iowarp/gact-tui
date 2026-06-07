package ui

import (
	"context"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
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
		a.fileTreeRootMode = "cwd"
		a.fileTreeErr = err.Error()
		a.fileTreeExpanded = map[string]bool{}
		return
	}
	a.SetFileViewerRoot(cwd)
	a.fileTreeRootMode = "cwd"
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
	if a.fileViewerRoot == abs && len(a.fileTreeEntries) > 0 {
		return
	}
	a.fileViewerRoot = abs
	a.fileTreeExpanded = map[string]bool{}
	a.fileTreeSel = 0
	a.reloadFileViewer()
}

func (a *App) syncFileViewerRootToWorkspace() {
	root := strings.TrimSpace(a.currentWorkspaceRootPath())
	if root == "" {
		if a.fileViewerRoot == "" {
			a.initFileViewerFromCwd()
		}
		a.fileTreeRootMode = "cwd"
		return
	}
	a.SetFileViewerRoot(root)
	a.fileTreeRootMode = "workspace"
}

func (a *App) currentWorkspaceRootPath() string {
	for _, ws := range a.workspaces {
		if ws.ID == a.wsID {
			return ws.RootPath
		}
	}
	return ""
}

func (a *App) reloadFileViewer() {
	entries, err := scanFileTreeDir(a.fileViewerRoot, "", 0)
	a.fileTreeEntries = entries
	a.fileTreeErr = ""
	if err != nil {
		a.fileTreeErr = err.Error()
	}
	a.clampFileTreeSelection()
}

func scanFileTreeDir(root string, rel string, depth int) ([]fileTreeEntry, error) {
	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", root)
	}
	abs := root
	if rel != "" {
		abs = filepath.Join(root, filepath.FromSlash(rel))
	}
	children, err := os.ReadDir(abs)
	if err != nil {
		return nil, err
	}
	sort.Slice(children, func(i, j int) bool {
		if children[i].IsDir() != children[j].IsDir() {
			return children[i].IsDir()
		}
		return strings.ToLower(children[i].Name()) < strings.ToLower(children[j].Name())
	})
	entries := make([]fileTreeEntry, 0, len(children))
	for _, child := range children {
		name := child.Name()
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
	}
	return entries, nil
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
	if strings.TrimSpace(a.fileTreeErr) != "" {
		a.openFileViewerRootDetail()
		return
	}
	visible := a.visibleFileTreeEntries()
	if len(visible) == 0 {
		return
	}
	a.fileTreeSel = clampSelection(a.fileTreeSel, len(visible))
	entry := visible[a.fileTreeSel]
	if entry.Dir {
		if !a.fileTreeExpanded[entry.Path] {
			a.loadFileTreeChildren(entry)
		}
		a.fileTreeExpanded[entry.Path] = !a.fileTreeExpanded[entry.Path]
		return
	}
	a.openFileViewerDetail(entry)
}

func (a *App) loadFileTreeChildren(entry fileTreeEntry) {
	if !entry.Dir || a.fileTreeChildrenLoaded(entry.Path) {
		return
	}
	children, err := scanFileTreeDir(a.fileViewerRoot, entry.Path, entry.Depth+1)
	if err != nil {
		a.fileTreeErr = err.Error()
		return
	}
	insertAt := -1
	for i, existing := range a.fileTreeEntries {
		if existing.Path == entry.Path {
			insertAt = i + 1
			break
		}
	}
	if insertAt < 0 {
		return
	}
	next := make([]fileTreeEntry, 0, len(a.fileTreeEntries)+len(children))
	next = append(next, a.fileTreeEntries[:insertAt]...)
	next = append(next, children...)
	next = append(next, a.fileTreeEntries[insertAt:]...)
	a.fileTreeEntries = next
}

func (a *App) fileTreeChildrenLoaded(path string) bool {
	for _, entry := range a.fileTreeEntries {
		if entry.Path == path {
			continue
		}
		if filepath.ToSlash(filepath.Dir(entry.Path)) == path {
			return true
		}
	}
	return false
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
		localPath: fullPath,
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func (a *App) openFileViewerRootDetail() {
	mode := strings.TrimSpace(a.fileTreeRootMode)
	if mode == "" {
		mode = "folder"
	}
	status := "available"
	if strings.TrimSpace(a.fileTreeErr) != "" {
		status = "unavailable"
	}
	rows := []string{
		"root: " + a.fileViewerRoot,
		"mode: " + mode,
		"status: " + status,
	}
	if strings.TrimSpace(a.fileTreeErr) != "" {
		rows = append(rows,
			"",
			"The file browser cannot read this folder right now.",
			"",
			"details: "+a.fileTreeErr,
		)
	}
	a.detailView = &bulkyPartRef{
		messageID: "files",
		partID:    "root",
		title:     "Files · " + fileViewerUnavailableTitle(mode),
		fullText:  strings.Join(rows, "\n"),
		localPath: a.fileViewerRoot,
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func (a *App) uploadCurrentFileDetail() tea.Cmd {
	if a.detailView == nil || a.detailView.messageID != "files" || strings.TrimSpace(a.detailView.localPath) == "" {
		a.transientHint = "upload unavailable for this detail"
		return scheduleHintExpire(a.transientHint)
	}
	sid := a.currentSessionID()
	if sid == "" {
		a.transientHint = "no active session to upload into"
		return scheduleHintExpire(a.transientHint)
	}
	if !a.caps.Capabilities.AttachmentsUpload {
		a.transientHint = "attachment upload unsupported by this backend"
		return scheduleHintExpire(a.transientHint)
	}
	path := a.detailView.localPath
	a.transientHint = "uploading " + filepath.Base(path) + "..."
	return tea.Batch(scheduleHintExpire(a.transientHint), uploadAttachmentFileCmd(a.c, sid, path, "read"))
}

func uploadAttachmentFileCmd(c *client.Client, sessionID, path, mode string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		data, err := os.ReadFile(path)
		if err != nil {
			return contextFileUploadedMsg{sessionID: sessionID, localPath: path, err: err}
		}
		mimeType := mime.TypeByExtension(filepath.Ext(path))
		if mimeType == "" && len(data) > 0 {
			mimeType = http.DetectContentType(data[:minInt(len(data), 512)])
		}
		cf, err := c.UploadAttachment(ctx, sessionID, filepath.Base(path), mimeType, mode, data)
		return contextFileUploadedMsg{sessionID: sessionID, localPath: path, file: cf, err: err}
	}
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
		label := "root: " + rootLabel
		if a.fileTreeRootMode == "workspace" {
			label = "workspace: " + rootLabel
		}
		rows = append(rows, t.HintLabel.Italic(true).Render(truncate(label, width-6)))
	}
	if a.fileTreeErr != "" {
		errorRow := startRow + len(rows)
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).Render(truncate("folder unavailable", width-6)))
		if rowBudget > 2 {
			rows = append(rows, t.HintLabel.Render(truncate("Enter for details", width-6)))
		}
		a.registerSidebarFileViewerErrorHit(errorRow, width)
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

func fileViewerUnavailableTitle(mode string) string {
	if strings.TrimSpace(mode) == "workspace" {
		return "workspace folder unavailable"
	}
	return "folder unavailable"
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

func (a *App) registerSidebarFileViewerErrorHit(row int, width int) {
	if a.hits == nil {
		return
	}
	zone := a.sidebarHitFocus
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	id := "sidebar:files:error"
	if zone == FocusRightSidebar {
		id = "right-sidebar:files:error"
	}
	a.registerSidebarContentHit(id, row, width, 1, func(app *App) tea.Cmd {
		app.focus = zone
		app.sidebarSectionFocus = sidebarSectionFiles
		app.sidebarSectionCursor = false
		app.openFileViewerRootDetail()
		return nil
	})
}
