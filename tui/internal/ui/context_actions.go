package ui

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (a *App) openContextActionsForIndex(index int) tea.Cmd {
	zone := FocusSidebar
	if a.focus == FocusRightSidebar {
		zone = FocusRightSidebar
	}
	return a.openContextActionsForIndexInZone(index, zone)
}

func (a *App) openContextActionsForIndexInZone(index int, zone FocusZone) tea.Cmd {
	if index < 0 || index >= len(a.contextFiles) {
		return nil
	}
	if zone != FocusRightSidebar {
		zone = FocusSidebar
	}
	a.focus = zone
	a.sidebarSectionFocus = sidebarSectionContext
	a.sidebarSectionCursor = false
	a.contextFileSel = index
	a.contextActionsOpen = true
	a.contextActionsSel = 0
	return nil
}

func (a *App) closeContextActions() {
	a.contextActionsOpen = false
	a.contextActionsSel = 0
}

func (a *App) selectedContextFile() (gact.ContextFile, bool) {
	if a.contextFileSel < 0 || a.contextFileSel >= len(a.contextFiles) {
		return gact.ContextFile{}, false
	}
	return a.contextFiles[a.contextFileSel], true
}

func (a *App) selectedContextActionItems() []actionMenuItem {
	cf, ok := a.selectedContextFile()
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
				app.closeContextActions()
				return app.openContextFileDetail(cf)
			},
		},
		{
			id:          "copy-path",
			title:       "Copy path",
			description: "Copy the path as shown in this workspace.",
			key:         "y",
			action: func(app *App) tea.Cmd {
				app.closeContextActions()
				app.transientHint = copyTextToClipboard(cf.Path, cf.Path)
				return nil
			},
		},
		{
			id:          "copy-detail",
			title:       "Copy metadata",
			description: "Copy file details for notes or support.",
			key:         "Y",
			action: func(app *App) tea.Cmd {
				app.closeContextActions()
				text := strings.Join(app.contextFileDetailRows(cf), "\n")
				app.transientHint = copyTextToClipboard("context metadata", text)
				return nil
			},
		},
		{
			id:          "add",
			title:       "Add another file",
			description: "Open the context file prompt for this session.",
			key:         "o",
			action: func(app *App) tea.Cmd {
				app.closeContextActions()
				app.contextAddOpen = true
				app.contextAddDraft = ""
				app.contextAddCursor = 0
				app.contextAddMode = "read"
				return nil
			},
		},
		{
			id:          "remove",
			title:       "Remove from context",
			description: "Stop including this file in the selected session.",
			key:         "x",
			action: func(app *App) tea.Cmd {
				app.closeContextActions()
				sid := app.currentSessionID()
				if sid == "" {
					app.transientHint = "no session selected"
					return nil
				}
				return removeContextFileCmd(app.c, sid, cf.Path)
			},
		},
	}
}

func (a *App) applyContextActionSelection() tea.Cmd {
	items := a.selectedContextActionItems()
	return a.applyActionMenuSelection(items, &a.contextActionsSel, func(app *App) { app.closeContextActions() })
}

func (a *App) handleContextActionsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	items := a.selectedContextActionItems()
	if cmd, handled := a.handleActionMenuKey(k, items, &a.contextActionsSel, func(app *App) { app.closeContextActions() }); handled {
		return a, cmd
	}
	return a, nil
}

func (a *App) viewContextActions() string {
	items := a.selectedContextActionItems()

	title := "Context actions"
	contextLine := "No context file selected."
	if cf, ok := a.selectedContextFile(); ok {
		title = truncate(shortContextPath(cf.Path), 44)
		mode := strings.TrimSpace(cf.Mode)
		if mode == "" {
			mode = "unknown"
		}
		meta := mode
		if cf.Size > 0 {
			meta += " · " + humanBytes(cf.Size)
		}
		contextLine = fmt.Sprintf("%s · %s", truncate(cf.Path, 52), meta)
	}

	return a.renderActionMenu(actionMenuOptions{
		prefix:      "context-actions",
		title:       title,
		contextLine: contextLine,
		items:       items,
		selected:    &a.contextActionsSel,
		rowBudget:   12,
		close:       func(app *App) { app.closeContextActions() },
	})
}
