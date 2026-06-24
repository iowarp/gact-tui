package ui

// chrome_footer_hits.go registers footer action/hint mouse hit regions and routes footer key actions.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func (c *chromeComponent) registerFooterActionHits(rendered string) {
	if c.app.height <= 0 {
		return
	}
	plain := ansi.Strip(rendered)
	y := c.app.height - 1
	focus := c.focusLabel(c.app.focus)
	if c.app.lmConfig.open {
		focus = c.app.localizer.t(msgChromeFocusProviderSetup, nil)
	}
	focusText := c.app.localizer.t(msgChromeFocus, map[string]string{"value": focus})
	c.registerFooterPlainHit(plain, y, "footer:focus", focusText, func(app *App) tea.Cmd {
		app.chrome.focusNextPane()
		return nil
	})
	c.registerFooterPlainHit(plain, y, "footer:reconnect", "(reconnecting…)", func(app *App) tea.Cmd {
		return app.connection.connectCmd()
	})
	c.registerFooterPlainHit(plain, y, "footer:memory", c.app.localizer.t(msgFooterMemoryHit, nil), func(app *App) tea.Cmd {
		if !app.session.caps.Capabilities.Memory {
			return nil
		}
		return loadMemoryInspectorCmd(app.c, app.session.runtimeScope(), app.conversation.messages)
	})
	c.registerFooterActionHit(plain, y, "footer:pane", "Tab", c.app.localizer.t(msgFooterPane, nil), func(app *App) tea.Cmd {
		app.chrome.focusNextPane()
		return nil
	})
	c.registerFooterActionHit(plain, y, "footer:settings", "Ctrl+S", c.app.localizer.t(msgFooterSettings, nil), func(app *App) tea.Cmd {
		return app.settings.openTab(0)
	})
	c.registerFooterActionHit(plain, y, "footer:command", "/", c.app.localizer.t(msgFooterCommand, nil), func(app *App) tea.Cmd {
		app.cmdPalette.openModal()
		return nil
	})
	c.registerFooterActionHit(plain, y, "footer:help", "?", c.app.localizer.t(msgFooterHelp, nil), func(app *App) tea.Cmd {
		app.help.openModal()
		return nil
	})
	c.registerFooterConversationHits(plain, y)
	c.registerFooterSidebarHits(plain, y)
	c.registerFooterActionHit(plain, y, "footer:quit", "Ctrl+C", c.app.localizer.t(msgFooterQuit, nil), func(app *App) tea.Cmd {
		app.quitConfirm.openModal()
		return nil
	})
}

func (c *chromeComponent) registerFooterConversationHits(plain string, y int) {
	c.registerFooterActionHit(plain, y, "footer:conversation:details", "Enter/Ctrl+E", c.app.localizer.t(msgFooterConversationDetails, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.conversation.handleKey(keyMsg("enter"))
		return cmd
	})
	c.registerFooterActionHit(plain, y, "footer:conversation:bottom", "G", c.app.localizer.t(msgFooterConversationBottom, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.conversation.handleKey(keyMsg("G"))
		return cmd
	})
	c.registerFooterActionHit(plain, y, "footer:conversation:copy", "y", c.app.localizer.t(msgFooterConversationCopy, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.conversation.handleKey(keyMsg("y"))
		return cmd
	})
	c.registerFooterActionHit(plain, y, "footer:conversation:copy-full", "Y", c.app.localizer.t(msgFooterConversationCopyFull, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.conversation.handleKey(keyMsg("Y"))
		return cmd
	})
	c.registerFooterActionHit(plain, y, "footer:conversation:retry", "R", c.app.localizer.t(msgFooterConversationRetry, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.conversation.handleKey(keyMsg("R"))
		return cmd
	})
	c.registerFooterActionHit(plain, y, "footer:conversation:delete", "d", c.app.localizer.t(msgFooterConversationDelete, nil), func(app *App) tea.Cmd {
		app.focus = FocusBody
		_, cmd := app.conversation.handleKey(keyMsg("d"))
		return cmd
	})
}

func (c *chromeComponent) registerFooterSidebarHits(plain string, y int) {
	c.registerFooterActionHit(plain, y, "footer:sidebar:open", "Enter", c.app.localizer.t(msgFooterSidebarOpen, nil), func(app *App) tea.Cmd {
		return app.chrome.routeSidebarFooterKey(keyMsg("enter"))
	})
	c.registerFooterActionHit(plain, y, "footer:sidebar:rename", "e", c.app.localizer.t(msgFooterSidebarRename, nil), func(app *App) tea.Cmd {
		return app.chrome.routeSidebarFooterKey(keyMsg("e"))
	})
	c.registerFooterActionHit(plain, y, "footer:sidebar:delete", "x", c.app.localizer.t(msgFooterSidebarDelete, nil), func(app *App) tea.Cmd {
		return app.chrome.routeSidebarFooterKey(keyMsg("x"))
	})
	c.registerFooterActionHit(plain, y, "footer:sidebar:children", "c", c.app.localizer.t(msgFooterSidebarChildren, nil), func(app *App) tea.Cmd {
		return app.chrome.routeSidebarFooterKey(keyMsg("c"))
	})
	c.registerFooterActionHit(plain, y, "footer:sidebar:context", "o", c.app.localizer.t(msgFooterSidebarContext, nil), func(app *App) tea.Cmd {
		return app.chrome.routeSidebarFooterKey(keyMsg("o"))
	})
	c.registerFooterActionHit(plain, y, "footer:sidebar:archive", "A", c.app.localizer.t(msgFooterSidebarArchive, nil), func(app *App) tea.Cmd {
		return app.chrome.routeSidebarFooterKey(keyMsg("A"))
	})
	c.registerFooterActionHit(plain, y, "footer:sidebar:copy-id", "y", c.app.localizer.t(msgFooterSidebarCopyID, nil), func(app *App) tea.Cmd {
		return app.chrome.routeSidebarFooterKey(keyMsg("y"))
	})
	c.registerFooterActionHit(plain, y, "footer:sidebar:filter", "f", c.app.localizer.t(msgFooterSidebarFilter, nil), func(app *App) tea.Cmd {
		return app.chrome.routeSidebarFooterKey(keyMsg("f"))
	})
	c.registerFooterActionHit(plain, y, "footer:sidebar:filter:apply", "Enter", c.app.localizer.t(msgFooterSidebarApply, nil), func(app *App) tea.Cmd {
		app.session.commitFilter()
		return nil
	})
	c.registerFooterActionHit(plain, y, "footer:sidebar:filter:cancel", "Esc", c.app.localizer.t(msgFooterSidebarCancel, nil), func(app *App) tea.Cmd {
		app.session.cancelFilter()
		return nil
	})
}

func (c *chromeComponent) registerFooterActionHit(plain string, y int, id string, key string, label string, action uiHitAction) {
	target := key + " " + label
	col := strings.Index(plain, target)
	if col < 0 {
		return
	}
	c.app.interaction.registerScreenTextSpanHit(id, 0, y, plain, col, target, action)
}

func (c *chromeComponent) routeSidebarFooterKey(k tea.KeyPressMsg) tea.Cmd {
	c.app.focus = FocusSidebar
	if c.app.sidebar.sessionsCollapsed {
		// Collapsed: steer focus to the sessions section but leave the
		// per-row cursor untouched (matches the old conditional poke).
		c.app.sidebar.setFocus(sidebarSectionSessions, c.app.sidebar.sectionCursor)
	} else {
		c.app.sidebar.setFocus(sidebarSectionSessions, false)
	}
	_, cmd := c.app.sidebar.handleKey(k)
	return cmd
}

func (c *chromeComponent) registerFooterPlainHit(plain string, y int, id string, target string, action uiHitAction) {
	if target == "" {
		return
	}
	col := strings.Index(plain, target)
	if col < 0 {
		return
	}
	c.app.interaction.registerScreenTextSpanHit(id, 0, y, plain, col, target, action)
}
