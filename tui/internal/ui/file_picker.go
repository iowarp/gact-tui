// At-sign (@) file picker (M6). Typing `@` as the first character of a
// new word in the input opens a floating fuzzy-file picker scoped to the
// current workspace. Selecting a file:
//
//  1. Inserts `@path/to/file` into the input at the cursor position.
//  2. Attaches the file to the session's context via POST
//     /v1/sessions/{id}/context/files (mode=read) so the backend sees
//     it as extra context on the next send. Same plumbing as the K14
//     sidebar `o` key, reached from the input side.
//
// Design:
//   - Fuzzy matching is simple case-insensitive substring scoring. Good
//     enough for the sizes we're dealing with (workspace listings are
//     typically hundreds of entries, not thousands) and debuggable.
//   - Files only — directories are skipped. The @-syntax refers to
//     concrete files; directories confuse the context-attach semantics.
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
	entries []gact.FileEntry // all file entries from the workspace (dirs filtered out)
	filter  string           // user-typed filter; empty = show all
	sel     int              // index into the filtered slice
	loaded  bool             // true once entries have been fetched
	errText string           // non-empty when the workspace file fetch failed
}

// filePickerLoadedMsg delivers the initial fetch result.
type filePickerLoadedMsg struct {
	entries []gact.FileEntry
	err     error
}

// loadFilePickerCmd hits /v1/workspaces/{id}/files and converts the
// response into a filePickerLoadedMsg. Filters out directories so the
// picker only deals with pickable files.
func loadFilePickerCmd(c *client.Client, workspaceID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		entries, err := c.ListWorkspaceFiles(ctx, workspaceID)
		if err != nil {
			return filePickerLoadedMsg{err: err}
		}
		out := entries[:0:0]
		for _, e := range entries {
			if e.Type == "dir" {
				continue
			}
			out = append(out, e)
		}
		return filePickerLoadedMsg{entries: out}
	}
}

// openFilePicker puts the modal in its initial "loading" state and
// kicks off the fetch. The user can start typing immediately — the
// filter state is preserved across the load.
func (a *App) openFilePicker() tea.Cmd {
	a.filePickerOpen = true
	a.filePicker = &filePickerState{}
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

func (a *App) handleFilePickerWheel(button tea.MouseButton) tea.Cmd {
	if a.filePicker == nil {
		return nil
	}
	matches := a.filePickerMatches()
	a.filePicker.sel = moveSelectionByWheel(a.filePicker.sel, len(matches), button)
	return nil
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
		out := make([]gact.FileEntry, len(a.filePicker.entries))
		copy(out, a.filePicker.entries)
		sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
		return out
	}
	needle := strings.ToLower(a.filePicker.filter)
	type scored struct {
		entry gact.FileEntry
		score int // lower is better
	}
	var hits []scored
	for _, e := range a.filePicker.entries {
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
	case "up":
		if a.filePicker.sel > 0 {
			a.filePicker.sel--
		}
	case "down":
		if a.filePicker.sel < len(matches)-1 {
			a.filePicker.sel++
		}
	case "enter":
		if a.filePicker.sel < 0 || a.filePicker.sel >= len(matches) {
			return a, nil
		}
		selected := matches[a.filePicker.sel]
		a.closeFilePicker()

		// Insert `@path ` into the input. We append rather than insert-
		// at-cursor because bubbles/v2/textarea doesn't expose a
		// cursor-position insert primitive; in practice the user typed
		// @ last, so append reaches the right spot.
		cur := a.input.Value()
		if cur != "" && !strings.HasSuffix(cur, " ") && !strings.HasSuffix(cur, "\n") {
			cur += " "
		}
		a.input.SetValue(cur + "@" + selected.Path + " ")

		// Attach the file to session context so the backend auto-reads
		// it on the next send. Failure is non-fatal — the @-reference
		// still lands in the prompt, which is enough for most backends
		// that interpret @-refs directly. Reuses K14's
		// addContextFileCmd so sidebar CONTEXT updates the same way.
		if sid := a.currentSessionID(); sid != "" {
			return a, addContextFileCmd(a.c, sid, selected.Path, "read")
		}
		return a, nil
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
	listW := w - 8
	if listW < 1 {
		listW = w - 4
	}
	if a.filePicker == nil {
		return ""
	}

	buttons := []menuButton{closeMenuButton("file-picker:close", func(app *App) { app.closeFilePicker() })}

	filterRow := t.HintKey.Render("@") + t.HintLabel.Render(a.filePicker.filter) +
		lipgloss.NewStyle().Foreground(t.Primary).Blink(true).Render("_")

	matches := a.filePickerMatches()

	// Always show a fixed rows height so the modal doesn't reflow its
	// surrounding chrome as the user types.
	const resultRows = 10
	rows := []string{filterRow, ""}
	resultStartRow := len(rows)
	var list modalListRender
	if a.filePicker.errText != "" {
		rows = append(rows, t.HintLabel.Italic(true).Render(
			"file picker unavailable: "+truncate(a.filePicker.errText, w-6)))
	} else if !a.filePicker.loaded && len(matches) == 0 {
		rows = append(rows, t.HintLabel.Italic(true).Render("loading workspace files…"))
	} else if len(matches) == 0 {
		rows = append(rows, t.HintLabel.Italic(true).Render("no matches"))
	}
	availableListRows := resultRows - (len(rows) - resultStartRow)
	if availableListRows < 1 {
		availableListRows = 1
	}
	win := selectedItemWindow(len(matches), a.filePicker.sel, availableListRows)
	listStartRow := len(rows)
	listItems := make([]modalListItem, 0, win.end-win.start)
	for i := win.start; i < win.end; i++ {
		m := matches[i]
		idx := i
		listItems = append(listItems, modalListItem{
			id:       fmt.Sprintf("file-picker:item:%d", idx),
			title:    m.Path,
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
				_, cmd := app.handleFilePickerKey(keyMsg("enter"))
				return cmd
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
		"type to filter   ↑/↓ pick   Enter insert   Esc cancel")

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
