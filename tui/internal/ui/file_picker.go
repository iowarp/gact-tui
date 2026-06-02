// At-sign (@) file picker (M6). Typing `@` as the first character of a
// new word in the input opens a floating fuzzy-file picker scoped to the
// current workspace. Selecting a file inserts a visible `@path/to/file`
// mention and records a structured composer attachment. The attachment
// is posted before the message is sent so failures can keep the draft
// editable instead of creating a failed turn with a raw @path.
//
// Design:
//   - Fuzzy matching is simple case-insensitive substring scoring. Good
//     enough for the sizes we're dealing with (workspace listings are
//     typically hundreds of entries, not thousands) and debuggable.
//   - Tree mode shows directories for browsing, but inserting still only
//     selects concrete files.
//   - The picker modal sits above the input and uses the same centred
//     spliceRow overlay as every other modal so the base view stays
//     visible behind the gutter.
package ui

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// filePickerState holds the live state of the @-picker modal.
type filePickerState struct {
	entries      []gact.FileEntry // workspace-rooted file/dir entries
	filter       string           // user-typed filter; empty = tree/list browse
	sel          int              // index into active filtered/tree slice
	loaded       bool             // true once entries have been fetched
	errText      string           // non-empty when the workspace file fetch failed
	treeMode     bool             // true = structural tree browse, false = flat list
	treeExpanded map[string]bool  // expanded directory paths in tree mode
}

type composerFileMention struct {
	Path string
	Mode string
}

type filePickerTreeRow struct {
	entry gact.FileEntry
	depth int
}

// filePickerLoadedMsg delivers the initial fetch result.
type filePickerLoadedMsg struct {
	entries []gact.FileEntry
	err     error
}

// loadFilePickerCmd hits /v1/workspaces/{id}/files and converts the
// response into a filePickerLoadedMsg. Tree browsing keeps directories
// visible, while insertion paths still ignore them.
func loadFilePickerCmd(c *client.Client, workspaceID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		entries, err := c.ListWorkspaceFiles(ctx, workspaceID)
		if err != nil {
			return filePickerLoadedMsg{err: err}
		}
		return filePickerLoadedMsg{entries: entries}
	}
}

// openFilePicker puts the modal in its initial "loading" state and
// kicks off the fetch. The user can start typing immediately — the
// filter state is preserved across the load.
func (a *App) openFilePicker() tea.Cmd {
	a.filePickerOpen = true
	a.filePicker = &filePickerState{treeMode: true, treeExpanded: map[string]bool{}}
	if a.wsID == "" {
		a.filePicker.loaded = true
		a.filePicker.errText = "no workspace selected"
		return nil
	}
	return loadFilePickerCmd(a.c, a.wsID)
}

// closeFilePicker drops modal state and ensures the input doesn't
// re-open the picker on the next key.
func (a *App) closeFilePicker() {
	a.filePickerOpen = false
	a.filePicker = nil
}

func cloneComposerFileMentions(in []composerFileMention) []composerFileMention {
	if len(in) == 0 {
		return nil
	}
	out := make([]composerFileMention, len(in))
	copy(out, in)
	return out
}

func (a *App) addComposerFileMention(path, mode string) {
	path = strings.TrimSpace(path)
	if path == "" {
		return
	}
	if mode == "" {
		mode = "read"
	}
	for i := range a.fileMentions {
		if a.fileMentions[i].Path == path {
			a.fileMentions[i].Mode = mode
			return
		}
	}
	a.fileMentions = append(a.fileMentions, composerFileMention{Path: path, Mode: mode})
}

func sanitizeSelectedFileMentions(text string, mentions []composerFileMention) string {
	if text == "" || len(mentions) == 0 {
		return text
	}
	ordered := cloneComposerFileMentions(mentions)
	sort.SliceStable(ordered, func(i, j int) bool {
		return len(ordered[i].Path) > len(ordered[j].Path)
	})
	out := text
	for _, mention := range ordered {
		path := strings.TrimSpace(mention.Path)
		if path == "" {
			continue
		}
		out = strings.ReplaceAll(out, "@"+path, path)
	}
	return strings.TrimSpace(out)
}

func activeComposerFileMentions(text string, mentions []composerFileMention) []composerFileMention {
	if strings.TrimSpace(text) == "" || len(mentions) == 0 {
		return nil
	}
	out := make([]composerFileMention, 0, len(mentions))
	seen := map[string]bool{}
	for _, mention := range mentions {
		path := strings.TrimSpace(mention.Path)
		if path == "" || seen[path] || !strings.Contains(text, "@"+path) {
			continue
		}
		seen[path] = true
		out = append(out, mention)
	}
	return out
}

func (a *App) handleFilePickerWheel(button tea.MouseButton) tea.Cmd {
	if a.filePicker == nil {
		return nil
	}
	a.filePicker.sel = moveSelectionByWheel(a.filePicker.sel, a.filePickerActiveCount(), button)
	return nil
}

func (a *App) filePickerActiveCount() int {
	if a.filePicker == nil || a.filePicker.errText != "" {
		return 0
	}
	if a.filePicker.treeMode && a.filePicker.filter == "" {
		return len(a.filePickerTreeRows())
	}
	return len(a.filePickerMatches())
}

func (a *App) filePickerFileEntries() []gact.FileEntry {
	if a.filePicker == nil {
		return nil
	}
	out := make([]gact.FileEntry, 0, len(a.filePicker.entries))
	seen := map[string]bool{}
	for _, e := range a.filePicker.entries {
		if e.Type == "dir" || strings.TrimSpace(e.Path) == "" || seen[e.Path] {
			continue
		}
		seen[e.Path] = true
		out = append(out, e)
	}
	return out
}

// filePickerMatches returns the entries that pass the current filter,
// sorted by fuzzy match quality. Tie-breaker is path alphabetical so
// ordering is deterministic across renders.
//
// Scoring rules (lower is better):
//   - a direct substring match beats a scattered-char match — the
//     substring score is its 0-based start index plus a small
//     constant, so "rout" against "router.go" scores 0, a skip-match
//     scores in the hundreds.
//   - for skip-match, we prefer matches that start earlier in the
//     path and have less gap between characters.
//   - matches on the basename (after the last '/') beat matches that
//     land earlier in a directory component — users typing "picker"
//     mean the file, not a directory called "picker-notes".
func (a *App) filePickerMatches() []gact.FileEntry {
	if a.filePicker == nil {
		return nil
	}
	if a.filePicker.errText != "" {
		return nil
	}
	if a.filePicker.filter == "" {
		out := a.filePickerFileEntries()
		sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
		return out
	}
	needle := strings.ToLower(a.filePicker.filter)
	type scored struct {
		entry gact.FileEntry
		score int // lower is better
	}
	var hits []scored
	for _, e := range a.filePickerFileEntries() {
		s, ok := fuzzyScore(strings.ToLower(e.Path), needle)
		if !ok {
			continue
		}
		hits = append(hits, scored{entry: e, score: s})
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].score != hits[j].score {
			return hits[i].score < hits[j].score
		}
		return hits[i].entry.Path < hits[j].entry.Path
	})
	out := make([]gact.FileEntry, len(hits))
	for i, h := range hits {
		out[i] = h.entry
	}
	return out
}

func (a *App) filePickerTreeRows() []filePickerTreeRow {
	if a.filePicker == nil || a.filePicker.errText != "" {
		return nil
	}
	entries := map[string]gact.FileEntry{}
	for _, e := range a.filePicker.entries {
		path := strings.Trim(strings.TrimSpace(e.Path), "/")
		if path == "" {
			continue
		}
		entry := e
		entry.Path = path
		entries[path] = entry
		parts := strings.Split(path, "/")
		for i := 1; i < len(parts); i++ {
			dir := strings.Join(parts[:i], "/")
			if _, ok := entries[dir]; !ok {
				entries[dir] = gact.FileEntry{Path: dir, Type: "dir"}
			}
		}
	}
	paths := make([]string, 0, len(entries))
	for path := range entries {
		paths = append(paths, path)
	}
	sort.Slice(paths, func(i, j int) bool {
		di := entries[paths[i]].Type == "dir"
		dj := entries[paths[j]].Type == "dir"
		parentI, nameI := filePickerParentName(paths[i])
		parentJ, nameJ := filePickerParentName(paths[j])
		if parentI == parentJ && di != dj {
			return di
		}
		if parentI == parentJ {
			return strings.ToLower(nameI) < strings.ToLower(nameJ)
		}
		return strings.ToLower(paths[i]) < strings.ToLower(paths[j])
	})
	visible := make([]filePickerTreeRow, 0, len(paths))
	for _, path := range paths {
		entry := entries[path]
		depth := strings.Count(path, "/")
		if !a.filePickerTreeParentsExpanded(path) {
			continue
		}
		visible = append(visible, filePickerTreeRow{entry: entry, depth: depth})
	}
	return visible
}

func filePickerParentName(path string) (string, string) {
	if i := strings.LastIndex(path, "/"); i >= 0 {
		return path[:i], path[i+1:]
	}
	return "", path
}

func (a *App) filePickerTreeParentsExpanded(path string) bool {
	if a.filePicker == nil {
		return false
	}
	parent, _ := filePickerParentName(path)
	for parent != "" {
		if !a.filePicker.treeExpanded[parent] {
			return false
		}
		parent, _ = filePickerParentName(parent)
	}
	return true
}

func (a *App) toggleFilePickerTreeRow(index int) bool {
	if a.filePicker == nil {
		return false
	}
	rows := a.filePickerTreeRows()
	if index < 0 || index >= len(rows) {
		return false
	}
	row := rows[index]
	if row.entry.Type != "dir" {
		return false
	}
	if a.filePicker.treeExpanded == nil {
		a.filePicker.treeExpanded = map[string]bool{}
	}
	a.filePicker.treeExpanded[row.entry.Path] = !a.filePicker.treeExpanded[row.entry.Path]
	a.filePicker.sel = clampSelection(a.filePicker.sel, len(a.filePickerTreeRows()))
	return true
}

func (a *App) selectFilePickerTreeRow(index int) tea.Cmd {
	if a.filePicker == nil {
		return nil
	}
	rows := a.filePickerTreeRows()
	if index < 0 || index >= len(rows) {
		return nil
	}
	row := rows[index]
	if row.entry.Type == "dir" {
		a.toggleFilePickerTreeRow(index)
		return nil
	}
	return a.insertFilePickerEntry(row.entry)
}

func (a *App) insertFilePickerEntry(selected gact.FileEntry) tea.Cmd {
	a.closeFilePicker()
	cur := a.input.Value()
	if cur != "" && !strings.HasSuffix(cur, " ") && !strings.HasSuffix(cur, "\n") {
		cur += " "
	}
	a.input.SetValue(cur + "@" + selected.Path + " ")
	a.addComposerFileMention(selected.Path, "read")
	return nil
}

// fuzzyScore returns (score, ok) where ok is false if needle can't
// match hay at all. Both inputs must be lowercased.
//
// The score blends:
//   - substring bonus: needle is a direct substring → base_cost + idx
//   - basename bonus: matches in the filename component beat matches
//     in parent directories
//   - skip penalty: for scattered matches, each gap costs 10 so
//     "router" beats "r...o...u..t..e..r" in an unrelated file
//
// This intentionally avoids a proper edit-distance algorithm; the
// goal is "feels right for paths at the scale of a single repo",
// not optimal matching. Easy to read, easy to debug.
func fuzzyScore(hay, needle string) (int, bool) {
	if needle == "" {
		return 0, true
	}
	// Fast path: direct substring. Prefer the match that lands inside
	// the basename (the filename after the last '/') over matches in
	// parent directories — users typing "server" for
	// "internal/server/server.go" mean the file, not the folder.
	// strings.Index returns the earliest occurrence, so we also peek
	// at a basename-only search and pick whichever is better.
	if idx := strings.Index(hay, needle); idx >= 0 {
		base := idx
		slash := strings.LastIndex(hay, "/")
		if slash >= 0 {
			basename := hay[slash+1:]
			if bidx := strings.Index(basename, needle); bidx >= 0 {
				// Basename-substring match: much lower score so it
				// wins over directory-only substring matches.
				baseNameScore := bidx - 50
				if baseNameScore < base {
					base = baseNameScore
				}
			}
		}
		return base, true
	}
	// Skip-match: walk needle char by char through hay.
	score := 100
	hi := 0
	lastMatch := -1
	for _, nc := range needle {
		found := false
		for ; hi < len(hay); hi++ {
			if rune(hay[hi]) == nc {
				if lastMatch >= 0 {
					// Gap between consecutive matches costs 10.
					score += (hi - lastMatch - 1) * 10
				} else {
					// First-match early-start bonus.
					score += hi
				}
				lastMatch = hi
				hi++
				found = true
				break
			}
		}
		if !found {
			return 0, false
		}
	}
	return score, true
}

// handleFilePickerKey routes keypresses while the @-picker modal is open.
func (a *App) handleFilePickerKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.filePicker == nil {
		a.closeFilePicker()
		return a, nil
	}
	matches := a.filePickerMatches()
	switch k.String() {
	case "esc", "ctrl+c":
		a.closeFilePicker()
		return a, nil
	case "tab", "ctrl+t":
		a.filePicker.treeMode = !a.filePicker.treeMode
		a.filePicker.sel = 0
		return a, nil
	case "right":
		if a.filePicker.treeMode && a.filePicker.filter == "" {
			a.toggleFilePickerTreeRow(a.filePicker.sel)
		}
	case "left":
		if a.filePicker.treeMode && a.filePicker.filter == "" {
			rows := a.filePickerTreeRows()
			if a.filePicker.sel >= 0 && a.filePicker.sel < len(rows) && rows[a.filePicker.sel].entry.Type == "dir" && a.filePicker.treeExpanded[rows[a.filePicker.sel].entry.Path] {
				a.filePicker.treeExpanded[rows[a.filePicker.sel].entry.Path] = false
			}
		}
	case "up":
		if a.filePicker.sel > 0 {
			a.filePicker.sel--
		}
	case "down":
		if a.filePicker.sel < a.filePickerActiveCount()-1 {
			a.filePicker.sel++
		}
	case "enter":
		if a.filePicker.treeMode && a.filePicker.filter == "" {
			return a, a.selectFilePickerTreeRow(a.filePicker.sel)
		}
		if a.filePicker.sel < 0 || a.filePicker.sel >= len(matches) {
			return a, nil
		}
		selected := matches[a.filePicker.sel]
		return a, a.insertFilePickerEntry(selected)
	case "backspace":
		if a.filePicker.errText != "" {
			return a, nil
		}
		if len(a.filePicker.filter) > 0 {
			a.filePicker.filter = a.filePicker.filter[:len(a.filePicker.filter)-1]
			a.filePicker.sel = 0
		}
	default:
		if k.Text != "" && a.filePicker.errText == "" {
			a.filePicker.filter += k.Text
			a.filePicker.sel = 0
		}
	}
	return a, nil
}

// viewFilePicker renders the modal: title, filter row, sorted results,
// hint bar. Keeps the total rendered height fixed at ~15 rows so the
// bottom of the modal doesn't dance when filter results change size.
func (a *App) viewFilePicker() string {
	t := a.Theme
	w := a.modalWidth()
	listW := modalInsetListWidth(w)
	if a.filePicker == nil {
		return ""
	}

	buttons := []menuButton{closeMenuButton("file-picker:close", func(app *App) { app.closeFilePicker() })}

	mode := "tree"
	if !a.filePicker.treeMode || a.filePicker.filter != "" {
		mode = "fuzzy"
	}
	filterRow := t.HintKey.Render("@") + t.HintLabel.Render(a.filePicker.filter) +
		lipgloss.NewStyle().Foreground(t.Primary).Blink(true).Render("_") +
		t.HintLabel.Render("  "+mode)

	matches := a.filePickerMatches()
	treeRows := a.filePickerTreeRows()
	useTree := a.filePicker.treeMode && a.filePicker.filter == ""

	// Keep a stable result height while the user types, but let taller
	// terminals show more files instead of forcing a cramped 10-row picker.
	resultRows := a.filePickerResultRows()
	rows := []string{filterRow, ""}
	resultStartRow := len(rows)
	var list modalListRender
	if a.filePicker.errText != "" {
		prefix := "file picker unavailable: "
		rows = append(rows, t.HintLabel.Italic(true).Render(
			prefix+truncate(a.filePicker.errText, maxInt(1, listW-lipgloss.Width(prefix)))))
	} else if !a.filePicker.loaded && len(matches) == 0 && len(treeRows) == 0 {
		rows = append(rows, t.HintLabel.Italic(true).Render("loading workspace files…"))
	} else if (!useTree && len(matches) == 0) || (useTree && len(treeRows) == 0) {
		rows = append(rows, t.HintLabel.Italic(true).Render("no matches"))
	}
	availableListRows := resultRows - (len(rows) - resultStartRow)
	if availableListRows < 1 {
		availableListRows = 1
	}
	activeCount := len(matches)
	if useTree {
		activeCount = len(treeRows)
	}
	win := selectedItemWindow(activeCount, a.filePicker.sel, availableListRows)
	listStartRow := len(rows)
	listItems := make([]modalListItem, 0, win.end-win.start)
	for i := win.start; i < win.end; i++ {
		idx := i
		if useTree {
			row := treeRows[i]
			name := row.entry.Path
			if _, base := filePickerParentName(name); base != "" {
				name = base
			}
			icon := "• "
			if row.entry.Type == "dir" {
				icon = "▸ "
				if a.filePicker.treeExpanded[row.entry.Path] {
					icon = "▾ "
				}
			}
			listItems = append(listItems, modalListItem{
				id:       fmt.Sprintf("file-picker:item:%d", idx),
				title:    strings.Repeat("  ", row.depth) + icon + name,
				meta:     filePickerEntryMeta(row.entry),
				selected: i == a.filePicker.sel,
				action: func(app *App) tea.Cmd {
					if app.filePicker == nil {
						app.closeFilePicker()
						return nil
					}
					app.filePicker.sel = idx
					return app.selectFilePickerTreeRow(idx)
				},
			})
			continue
		}
		m := matches[i]
		listItems = append(listItems, modalListItem{
			id:       fmt.Sprintf("file-picker:item:%d", idx),
			title:    m.Path,
			meta:     filePickerEntryMeta(m),
			selected: i == a.filePicker.sel,
			action: func(app *App) tea.Cmd {
				if app.filePicker == nil {
					app.closeFilePicker()
					return nil
				}
				matches := app.filePickerMatches()
				if idx < 0 || idx >= len(matches) {
					return nil
				}
				app.filePicker.sel = idx
				return app.insertFilePickerEntry(matches[idx])
			},
		})
	}
	list = a.renderModalList(listItems, modalListOptions{
		width:     listW,
		rowBudget: availableListRows,
	})
	rows = append(rows, list.rows...)
	// Pad to fixed height so the hint bar doesn't jump.
	for len(rows) < resultStartRow+resultRows {
		rows = append(rows, "")
	}

	hint := t.HintLabel.Italic(true).Render(
		modalKeyHint("type to filter", "Tab tree/list", "←/→ collapse/expand", "Enter insert", "Esc cancel"))

	rendered := a.renderSelectableListModal(selectableListModalOptions{
		frame: modalFrameOptions{
			width:   w,
			title:   "Insert file reference",
			buttons: buttons,
			footer:  hint,
		},
		rows:           rows,
		list:           list,
		listStart:      listStartRow,
		listWidth:      listW,
		bodyRows:       resultStartRow + resultRows,
		window:         win,
		wheelID:        "file-picker:list:wheel",
		surfaceWheelID: "file-picker",
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			return app.handleFilePickerWheel(button)
		},
		railAction: func(app *App, index int) tea.Cmd {
			if app.filePicker != nil {
				app.filePicker.sel = clampSelection(index, len(app.filePickerMatches()))
			}
			return nil
		},
	})
	return rendered.modal
}

func (a *App) filePickerResultRows() int {
	if a.height <= 0 {
		return 10
	}
	return clampInt(a.height-20, 10, 18)
}

func filePickerEntryMeta(entry gact.FileEntry) string {
	if entry.Type == "dir" {
		return "folder"
	}
	if entry.Size > 0 {
		return humanBytes(entry.Size)
	}
	return ""
}
