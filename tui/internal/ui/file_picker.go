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

// file_picker.go declares the file-picker component state and its open/close/load lifecycle.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

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

// filePickerComponent is a modal (despite the "Component" suffix): the open bool
// is its show/hide flag, and it is opened/closed like the *Modal types. Renaming
// the type would be high-churn, so the modal nature is documented here instead.
//
// filePickerComponent owns the @-file-picker overlay: its open flag, its
// backing state (embedded filePickerState, so callers keep reading
// p.entries/p.sel/… directly), and a back-reference to the root App for shared
// services (client, theme, composer). It replaces the old nil-pointer pair
// (filePickerOpen bool + filePicker *filePickerState): open==false is the
// closed/unloaded state, so the former nil checks become !p.open.
type filePickerComponent struct {
	app  *App
	open bool
	filePickerState
}

// reset closes the overlay and clears its data, keeping the app back-ref.
func (m *filePickerComponent) reset() { *m = filePickerComponent{app: m.app} }

// filePickerLoadedMsg delivers the initial fetch result.
type filePickerLoadedMsg struct {
	entries []gact.FileEntry
	err     error
}

func (m *filePickerComponent) handleLoaded(msg filePickerLoadedMsg) (tea.Model, tea.Cmd) {
	if !m.open {
		return m.app, nil
	}
	m.loaded = true
	if msg.err != nil {
		m.entries = nil
		m.errText = msg.err.Error()
		m.clampSelection()
		return m.app, nil
	}
	m.entries = msg.entries
	m.errText = ""
	m.clampSelection()
	return m.app, nil
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

// openModal puts the modal in its initial "loading" state and
// kicks off the fetch. The user can start typing immediately — the
// filter state is preserved across the load.
func (m *filePickerComponent) openModal() tea.Cmd {
	m.reset()
	m.open = true
	m.treeMode = true
	m.treeExpanded = map[string]bool{}
	if m.app.session.wsID == "" {
		m.loaded = true
		m.errText = "no workspace selected"
		return nil
	}
	return loadFilePickerCmd(m.app.c, m.app.session.wsID)
}

// close drops modal state and ensures the input doesn't re-open the picker on
// the next key.
func (m *filePickerComponent) close() {
	m.reset()
}

func (m *filePickerComponent) handleWheel(button tea.MouseButton) tea.Cmd {
	if !m.open {
		return nil
	}
	m.sel = moveSelectionByWheel(m.sel, m.activeCount(), button)
	return nil
}

func (m *filePickerComponent) insertEntry(selected gact.FileEntry) tea.Cmd {
	a := m.app
	m.close()
	cur := a.inputComposer.input.Value()
	if cur != "" && !strings.HasSuffix(cur, " ") && !strings.HasSuffix(cur, "\n") {
		cur += " "
	}
	a.inputComposer.input.SetValue(cur + "@" + selected.Path + " ")
	a.inputComposer.addFileMention(selected.Path, "read")
	return nil
}

// handleKey routes keypresses while the @-picker modal is open.
func (m *filePickerComponent) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if !m.open {
		m.close()
		return m.app, nil
	}
	matches := m.matches()
	switch k.String() {
	case "esc", "ctrl+c":
		m.close()
		return m.app, nil
	case "tab", "ctrl+t":
		m.treeMode = !m.treeMode
		m.sel = 0
		return m.app, nil
	case "right":
		if m.treeMode && m.filter == "" {
			m.toggleTreeRow(m.sel)
		}
	case "left":
		if m.treeMode && m.filter == "" {
			rows := m.treeRows()
			if m.sel >= 0 && m.sel < len(rows) && rows[m.sel].entry.Type == "dir" && m.treeExpanded[rows[m.sel].entry.Path] {
				m.treeExpanded[rows[m.sel].entry.Path] = false
			}
		}
	case "up":
		if m.sel > 0 {
			m.sel--
		}
	case "down":
		if m.sel < m.activeCount()-1 {
			m.sel++
		}
	case "enter":
		if m.treeMode && m.filter == "" {
			return m.app, m.selectTreeRow(m.sel)
		}
		if m.sel < 0 || m.sel >= len(matches) {
			return m.app, nil
		}
		selected := matches[m.sel]
		return m.app, m.insertEntry(selected)
	case "backspace":
		if m.errText != "" {
			return m.app, nil
		}
		if len(m.filter) > 0 {
			m.filter = m.filter[:len(m.filter)-1]
			m.sel = 0
		}
	default:
		if k.Text != "" && m.errText == "" {
			m.filter += k.Text
			m.sel = 0
		}
	}
	return m.app, nil
}
