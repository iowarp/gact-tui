package ui

// command_palette_items.go renders the palette command list rows and footer hint.

import (
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (p *commandPaletteComponent) renderCommandList(matches []gact.Command, win scrollWindow, width int) modalListRender {
	if len(matches) == 0 || win.end <= win.start {
		return modalListRender{}
	}
	t := p.app.Theme
	rows := make([]string, 0, (win.end-win.start)*2)
	hits := make([]modalListHit, 0, win.end-win.start)
	groupCounts := paletteCommandGroupCounts(matches)
	lastGroup := ""
	for i := win.start; i < win.end; i++ {
		c := matches[i]
		group := paletteCommandGroup(c)
		if group != lastGroup {
			rows = append(rows, t.HintLabel.Render(paletteCommandGroupHeader(group, groupCounts[group])))
			lastGroup = group
		}
		startRow := len(rows)
		if c.CommandSource == "agent_blueprint" || c.AgentBlueprintID != "" {
			rows = append(rows, p.renderCommandTile(c, width, i == p.paletteSel)...)
		} else {
			item := modalListItem{
				title:    "  " + c.ID,
				meta:     paletteCommandSubtitle(c),
				status:   p.currentValue(c.ID),
				selected: i == p.paletteSel,
			}
			rows = append(rows, p.app.modals.renderModalListItemLine(item, width))
		}
		hits = append(hits, modalListHit{
			id:     fmt.Sprintf("palette:command:%d", i),
			row:    startRow,
			width:  width,
			height: len(rows) - startRow,
			action: func(idx int) uiHitAction {
				return func(app *App) tea.Cmd {
					matches := app.cmdPalette.visibleMatches()
					if idx < 0 || idx >= len(matches) {
						return nil
					}
					app.cmdPalette.paletteSel = idx
					_, cmd := app.cmdPalette.handleKey(keyMsg("enter"))
					return cmd
				}
			}(i),
		})
	}
	return modalListRender{rows: rows, hits: hits, renderedItems: len(hits)}
}

func (c *commandPaletteComponent) footerHint(matches []gact.Command, groupOverview bool) string {
	if groupOverview {
		return c.app.localizer.t(msgPaletteBrowseHint, nil)
	}
	if len(matches) == 0 {
		return c.app.localizer.t(msgPaletteCloseHint, nil)
	}
	idx := clampSelection(c.paletteSel, len(matches))
	hint := "↑/↓ select  Enter " + paletteCommandEnterAction(matches[idx])
	if strings.TrimSpace(c.paletteFilter) == "" && c.paletteGroup != "" {
		hint += "  Backspace areas"
	}
	return hint + "  Esc close"
}

func paletteCommandEnterAction(c gact.Command) string {
	id := strings.ToLower(strings.TrimSpace(c.ID))
	if kind, ok := catalogCommandForID(id); ok {
		return "open " + catalogBrowserTitle(kind)
	}
	switch id {
	case "/agent", "/agents":
		return "open Expert settings"
	case "/theme", "/themes":
		return "open Theme settings"
	case "/theme-next":
		return "apply next theme"
	case "/theme-prev":
		return "apply previous theme"
	case "/theme-export":
		return "export current theme"
	case "/mouse":
		return "toggle mouse controls"
	case "/copy":
		return "copy selected block"
	case "/clear":
		return "confirm clear"
	case "/mode":
		return "cycle routing mode"
	case "/diff":
		return "open workspace diff"
	case "/add":
		return "open add context"
	case "/drop":
		return "drop selected context"
	case "/permissions":
		return "open permission audit"
	case "/metrics":
		return "open metrics"
	case "/memory":
		return "open memory"
	case "/doctor":
		return "open doctor"
	}
	if c.CommandSource == "mcp_prompt" || c.Source == "mcp_prompt" || c.Invocation == "mcp_prompt" {
		return "run prompt"
	}
	if strings.TrimSpace(c.CommandSource) == "agent_blueprint" || strings.TrimSpace(c.AgentBlueprintID) != "" {
		return "run workflow command"
	}
	if target := paletteCommandSecondaryTarget(id); target != "" {
		return "open " + target
	}
	return "run"
}
