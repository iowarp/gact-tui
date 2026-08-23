package ui

// contextActionsModal: the context-file action menu overlay.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

// contextActionsModal is the context-file action menu: open flag plus the
// selectable-list cursor, the behaviour that drives it, and a back-reference to
// the root App for shared services.
type contextActionsModal struct {
	app  *App
	open bool
	sel  int
}

func (m *contextActionsModal) reset() { m.open = false; m.sel = 0 }

// openModal opens the context-actions overlay for the file at index, inferring
// the focus zone from the current focus.
func (m *contextActionsModal) openModal(index int) tea.Cmd {
	zone := FocusSidebar
	if m.app.focus == FocusRightSidebar {
		zone = FocusRightSidebar
	}
	return m.openForIndexInZone(index, zone)
}

// openForIndexInZone keeps its descriptive name because, unlike openModal, it
// carries an explicit focus zone (left vs right sidebar) that mouse hits in a
// specific sidebar need to pass through rather than infer.
func (m *contextActionsModal) openForIndexInZone(index int, zone FocusZone) tea.Cmd {
	if index < 0 || index >= len(m.app.session.contextFiles) {
		return nil
	}
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	m.app.focus = zone
	m.app.sidebar.setFocus(sidebarSectionContext, false)
	m.app.session.selectContextFile(index)
	m.open = true
	m.sel = 0
	return nil
}

func (m *contextActionsModal) close() { m.reset() }

func (m *contextActionsModal) selectedFile() (gact.ContextFile, bool) {
	if m.app.session.contextFileSel < 0 || m.app.session.contextFileSel >= len(m.app.session.contextFiles) {
		return gact.ContextFile{}, false
	}
	return m.app.session.contextFiles[m.app.session.contextFileSel], true
}

func (m *contextActionsModal) selectedItems() []actionMenuItem {
	cf, ok := m.selectedFile()
	if !ok {
		return nil
	}
	return []actionMenuItem{
		{
			id:          "detail",
			title:       "Open detail",
			description: "Review file details and how it is attached.",
			key:         "Enter",
			action: func(app *App) tea.Cmd {
				app.contextActions.close()
				return app.contextFiles.openDetail(cf)
			},
		},
		{
			id:          "copy-path",
			title:       "Copy path",
			description: "Copy the path as shown in this workspace.",
			key:         "y",
			action: func(app *App) tea.Cmd {
				app.contextActions.close()
				app.setHint(copyTextToClipboard(cf.Path, cf.Path))
				return nil
			},
		},
		{
			id:          "copy-detail",
			title:       "Copy metadata",
			description: "Copy file details for notes or support.",
			key:         "Y",
			action: func(app *App) tea.Cmd {
				app.contextActions.close()
				text := strings.Join(app.contextFiles.detailRows(cf), "\n")
				app.setHint(copyTextToClipboard("context metadata", text))
				return nil
			},
		},
		{
			id:          "add",
			title:       "Add another file",
			description: "Open the context file prompt for this session.",
			key:         "o",
			action: func(app *App) tea.Cmd {
				app.contextActions.close()
				app.contextAdd.openModal()
				return nil
			},
		},
		{
			id:          "remove",
			title:       "Remove from context",
			description: "Stop including this file in the selected session.",
			key:         "x",
			action: func(app *App) tea.Cmd {
				app.contextActions.close()
				sid := app.session.currentID()
				if sid == "" {
					app.setHint("no session selected")
					return nil
				}
				return removeContextFileCmd(app.c, sid, cf.Path)
			},
		},
	}
}

func (m *contextActionsModal) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	items := m.selectedItems()
	if cmd, handled := m.app.modals.handleActionMenuKey(k, items, &m.sel, func(app *App) { app.contextActions.close() }); handled {
		return m.app, cmd
	}
	return m.app, nil
}

func (m *contextActionsModal) view() string {
	items := m.selectedItems()

	title := "Context actions"
	contextLine := "No context file selected."
	if cf, ok := m.selectedFile(); ok {
		title = textutil.Truncate(shortContextPath(cf.Path), 44)
		mode := strings.TrimSpace(cf.Mode)
		if mode == "" {
			mode = "unknown"
		}
		meta := mode
		if cf.Size > 0 {
			meta += " · " + textutil.HumanBytes(cf.Size)
		}
		contextLine = fmt.Sprintf("%s · %s", textutil.Truncate(cf.Path, 52), meta)
	}

	return m.app.modals.renderActionMenu(actionMenuOptions{
		prefix:      "context-actions",
		title:       title,
		contextLine: contextLine,
		items:       items,
		selected:    &m.sel,
		rowBudget:   12,
		close:       func(app *App) { app.contextActions.close() },
	})
}
