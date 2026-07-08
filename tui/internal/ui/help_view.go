package ui

// helpModal: the tabbed help overlay.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// helpModal is the tabbed help overlay: which tab is active, how far its body
// is scrolled, the behaviour that drives it, and a back-reference to the root
// App for shared services.
type helpModal struct {
	app    *App
	open   bool
	tab    int // active tab index; see helpTabs
	scroll int
}

func (m *helpModal) reset() { m.open = false; m.tab = 0; m.scroll = 0 }

// openModal shows the tabbed help overlay on its first tab, scrolled to top.
func (m *helpModal) openModal() {
	m.open = true
	m.tab = 0
	m.scroll = 0
}

// handleKey drives the help overlay while it's open.
//
// Navigation: ←/→ or h/l or Tab cycles tabs; ?/Esc closes.
func (m *helpModal) handleKey(k tea.KeyPressMsg) {
	switch k.String() {
	case "?", "esc", "ctrl+c":
		m.reset()
	case "left", "h":
		if m.tab > 0 {
			m.tab--
			m.scroll = 0
		}
	case "right", "l", "tab":
		if m.tab < helpTabCount-1 {
			m.tab++
			m.scroll = 0
		}
	}
	if off, ok := applyScrollKey(m.scroll, m.currentBodyPageSize(), k); ok {
		m.scroll = off
	}
}

// view renders the help overlay as a tabbed modal. Each tab scopes
// keybindings to a pane or mode so the list always fits in-view —
// replacing the older L7 single-scroll layout that users reported as
// overflowing the viewport (issue #7).
func (m *helpModal) view() string {
	a := m.app
	t := a.Theme

	tabHits := make([]menuTab, 0, len(helpTabs))
	for i, tab := range helpTabs {
		tabIdx := i
		tabHits = append(tabHits, menuTab{
			id:     "help-" + strings.ToLower(tab.title),
			label:  m.localizedTabTitle(tab.title),
			active: i == m.tab,
			action: func(app *App) tea.Cmd {
				app.help.tab = tabIdx
				app.help.scroll = 0
				return nil
			},
		})
	}

	// Body — the current tab's key list. Clamp helpTab defensively so a
	// future out-of-range value doesn't crash the render.
	idx := m.tab
	if idx < 0 || idx >= len(helpTabs) {
		idx = 0
	}
	w := m.modalWidthForTab(helpTabs[idx].title)
	var (
		content   string
		helpList  modalListRender
		helpWidth = modalScrollableBodyWidth(w)
	)
	if helpTabs[idx].title == "Commands" {
		helpList = m.renderCommandAreaColumns(helpTabs[idx].keys, helpWidth)
		content = lipgloss.JoinVertical(lipgloss.Left, helpList.rows...)
	} else {
		items := make([]modalListItem, 0, len(helpTabs[idx].keys))
		for _, kp := range helpTabs[idx].keys {
			key := kp.key
			items = append(items, modalListItem{
				id:    "help:key:" + strings.NewReplacer("/", "", " ", "-", "⇧", "shift").Replace(strings.ToLower(key)),
				title: key,
				meta:  a.localizer.t(kp.descID, nil),
			})
		}
		if len(items) > 0 {
			columns := helpListColumns(helpTabs[idx].title, helpWidth)
			helpList = a.modals.renderModalList(items, modalListOptions{
				width:            helpWidth,
				rowBudget:        len(items),
				descriptionLines: 0,
				columns:          columns,
				minColumnWidth:   34,
			})
			content = lipgloss.JoinVertical(lipgloss.Left, helpList.rows...)
		} else {
			content = ""
		}
	}
	buttons := []menuButton{closeMenuButton("help:close", func(app *App) {
		app.help.reset()
	})}
	pageSize := m.bodyPageSizeForTab(
		helpTabs[idx].title,
		maxInt(len(helpTabs[idx].keys), len(helpList.rows)),
		maxInt(1, helpListColumns(helpTabs[idx].title, helpWidth)),
	)
	if helpTabs[idx].title == "Commands" {
		pageSize = valuefmt.MinInt(maxInt(6, len(helpList.rows)), a.modals.modalBodyRows(14))
	}
	hintStyle := lipgloss.NewStyle().Italic(true).Foreground(t.FgMuted)
	title := a.localizer.t(msgHelpTitle, nil)
	if helpTabs[idx].title == "Commands" {
		title = m.localizedTabTitle(helpTabs[idx].title)
	}
	rendered := a.modals.renderScrollableModalFrame(scrollableModalFrameOptions{
		frame: modalFrameOptions{
			width:      w,
			title:      title,
			buttons:    buttons,
			tabs:       tabHits,
			tabPadding: 1,
			tabSpacing: 0,
		},
		content:     content,
		pageSize:    pageSize,
		scroll:      m.scroll,
		wheelID:     "help",
		footerHint:  a.localizer.t(msgHelpHint, nil),
		footerStyle: &hintStyle,
		wheelAction: func(app *App, button tea.MouseButton) tea.Cmd {
			app.help.scroll = moveScrollOffsetByWheel(app.help.scroll, button)
			return nil
		},
		scrollTo: func(app *App, scroll int) tea.Cmd {
			app.help.scroll = scroll
			return nil
		},
	})
	m.scroll = rendered.window.scroll
	a.interaction.registerWindowedModalListHits(rendered, 0, helpWidth, helpList)
	return rendered.modal
}

func (m *helpModal) bodyPageSizeForTab(title string, itemCount int, columns int) int {
	maxRows := m.app.modals.modalBodyRows(14)
	if maxRows < 1 {
		maxRows = 1
	}
	if columns < 1 {
		columns = 1
	}
	if title == "Commands" {
		rows := (itemCount + columns - 1) / columns
		if rows < 6 {
			rows = 6
		}
		return valuefmt.MinInt(rows, maxRows)
	}
	return valuefmt.MinInt(8, maxRows)
}

func (m *helpModal) currentBodyPageSize() int {
	idx := m.tab
	if idx < 0 || idx >= len(helpTabs) {
		idx = 0
	}
	width := modalScrollableBodyWidth(m.modalWidthForTab(helpTabs[idx].title))
	columns := helpListColumns(helpTabs[idx].title, width)
	return m.bodyPageSizeForTab(helpTabs[idx].title, len(helpTabs[idx].keys), columns)
}

func (m *helpModal) modalWidthForTab(title string) int {
	a := m.app
	if title == "Commands" {
		return a.modals.modalWidthFor(modalWidthWide)
	}
	w := 76
	minW := 64
	gutter := 8
	if a.width <= 0 {
		return w
	}
	if w > a.width-gutter {
		w = a.width - gutter
	}
	if w < minW {
		return a.modals.modalWidth()
	}
	return w
}
