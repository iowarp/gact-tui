package ui

// lm_config_provider_details.go renders the LM-config provider details panel.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func (c *lmConfigComponent) renderProviderDetails(innerW int, visibleRows int) string {
	rows, _ := c.renderProviderDetailsRowsAndHits(innerW, visibleRows)
	return c.renderBox(c.app.localizer.t(msgLMConfigSelectedTitle, nil), rows, innerW, visibleRows)
}

func (c *lmConfigComponent) renderProviderDetailsRowsAndHits(innerW int, visibleRows int) ([]string, []modalCellHit) {
	t := c.app.Theme
	p := c.currentPreset()
	if p == nil {
		return []string{c.app.localizer.t(msgLMConfigNoProviderSelected, nil)}, nil
	}
	statusText := c.presetStatusDetail(*p)
	statusColor := t.Success
	if statusText != "ready" {
		statusColor = t.Warning
	}
	bodyW := lmConfigBoxBodyWidth(innerW)
	rows := []string{
		lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render(p.Label),
	}
	hits := []modalCellHit{}
	appendLines := func(lines []string, style lipgloss.Style, limit int) {
		for _, line := range lines {
			if limit >= 0 && len(rows) >= limit {
				return
			}
			rows = append(rows, style.Render(line))
		}
	}
	if applied := c.appliedSummary(); applied != "" {
		appliedLines := textutil.WrapPlainRows(c.app.localizer.t(msgLMConfigApplied, map[string]string{"value": applied}), bodyW, "  ")
		appendLines(appliedLines, lipgloss.NewStyle().Foreground(t.FgMuted), visibleRows)
		if pending := c.pendingSummary(*p); pending != "" && c.pendingDiffersFromApplied(*p) {
			pendingLines := textutil.WrapPlainRows(c.app.localizer.t(msgLMConfigPending, map[string]string{"value": pending}), bodyW, "  ")
			appendLines(pendingLines, lipgloss.NewStyle().Foreground(t.Warning), visibleRows)
		}
	}
	visibleHitHeight := func(start int) int {
		if start >= visibleRows {
			return 0
		}
		return valuefmt.MinInt(len(rows), visibleRows) - start
	}
	if p.RequiresAPIKey {
		start := len(rows)
		rows = append(rows, lmConfigField_render(c.app.localizer.t(msgLMConfigAPIKey, nil), c.apiKey, true,
			c.field == lmFieldAPIKey, t))
		if h := visibleHitHeight(start); h > 0 {
			hits = append(hits, modalCellHit{
				id:     "lm-config:api-key",
				row:    start,
				width:  innerW,
				height: h,
				action: func(app *App) tea.Cmd {
					if app.lmConfig.open {
						app.lmConfig.field = lmFieldAPIKey
					}
					return nil
				},
			})
		}
	} else if c.lmConfigSelectedUsesOAuth() {
		authText := c.app.localizer.t(msgLMConfigAuthRequired, nil)
		authColor := t.Warning
		if p.IsAuthenticated || p.Status == "ready" {
			authText = c.app.localizer.t(msgLMConfigAuthReady, nil)
			authColor = t.Success
		}
		rows = append(rows, lipgloss.NewStyle().Foreground(authColor).Render(authText))
		label := c.app.localizer.t(msgLMConfigAuthenticate, nil)
		if p.IsAuthenticated || p.Status == "ready" {
			label = c.app.localizer.t(msgLMConfigRefreshToken, nil)
		}
		marker := "    "
		labelStyle := lipgloss.NewStyle().Foreground(t.Fg)
		if c.field == lmFieldAuth {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("    ▌ ")
			labelStyle = labelStyle.Foreground(t.Secondary).Bold(true)
		}
		if c.authenticating {
			label = c.app.localizer.t(msgLMConfigLaunchingLogin, nil)
		}
		start := len(rows)
		rows = append(rows, marker+labelStyle.Render(label))
		if h := visibleHitHeight(start); h > 0 {
			hits = append(hits, modalCellHit{
				id:     "lm-config:auth",
				row:    start,
				width:  innerW,
				height: h,
				action: func(app *App) tea.Cmd {
					if !app.lmConfig.open {
						return nil
					}
					app.lmConfig.field = lmFieldAuth
					_, cmd := app.lmConfig.handleKey(keyMsg("enter"))
					return cmd
				},
			})
		}
		if msg := strings.TrimSpace(c.authMessage); msg != "" {
			appendLines(textutil.WrapPlainRows(msg, bodyW, "  "),
				lipgloss.NewStyle().Foreground(t.FgMuted), visibleRows)
		}
	} else {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(c.app.localizer.t(msgLMConfigNoKeyRequired, nil)))
	}
	statusLines := textutil.WrapPlainRows(c.app.localizer.t(msgLMConfigStatus, map[string]string{"status": statusText}), bodyW, "  ")
	if c.lmConfigSelectedCanEditAPIBase() {
		start := len(rows)
		if c.field == lmFieldAPIBase {
			rows = append(rows, lmConfigField_render(c.app.localizer.t(msgLMConfigAPIBase, nil), c.apiBase, false, true, t))
		} else {
			apiLines := []string{c.app.localizer.t(msgLMConfigAPIBase, nil) + ":"}
			apiLines = append(apiLines, textutil.WrapPlainRows(c.apiBase, bodyW, "  ")...)
			apiLimit := visibleRows - maxInt(1, len(statusLines))
			if apiLimit < len(rows)+1 {
				apiLimit = len(rows) + 1
			}
			appendLines(apiLines, lipgloss.NewStyle().Foreground(t.Fg), apiLimit)
		}
		if h := visibleHitHeight(start); h > 0 {
			hits = append(hits, modalCellHit{
				id:     "lm-config:api-base",
				row:    start,
				width:  innerW,
				height: h,
				action: func(app *App) tea.Cmd {
					if app.lmConfig.open {
						app.lmConfig.field = lmFieldAPIBase
					}
					return nil
				},
			})
		}
	} else {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.FgMuted).Render(c.app.localizer.t(msgLMConfigLocalCLI, nil)))
	}
	appendLines(statusLines, lipgloss.NewStyle().Foreground(statusColor), visibleRows)
	if c.info != nil && strings.EqualFold(strings.TrimSpace(c.info.Provider), strings.TrimSpace(p.Provider)) {
		infoRows := []string{}
		if c.info.ChosenContext > 0 {
			infoRows = append(infoRows, c.app.localizer.tf(msgLMConfigChosenContext, map[string]any{"tokens": c.info.ChosenContext}))
		}
		if c.info.IsReasoning {
			infoRows = append(infoRows, c.app.localizer.t(msgLMConfigReasoningModel, nil))
		}
		if c.info.NativeToolCall {
			infoRows = append(infoRows, c.app.localizer.t(msgLMConfigNativeTools, nil))
		}
		appendLines(infoRows, lipgloss.NewStyle().Foreground(t.FgMuted), visibleRows)
	}
	if desc := strings.TrimSpace(c.localizedProviderDescription(*p)); desc != "" {
		remaining := visibleRows - len(rows)
		if remaining > 0 {
			descLines := textutil.WrapPlainRows(desc, bodyW, "")
			if len(descLines) > remaining {
				descLines = descLines[:remaining]
			}
			appendLines(descLines, lipgloss.NewStyle().Foreground(t.FgMuted), visibleRows)
		}
	}
	return rows, hits
}

func (c *lmConfigComponent) providerDetailsRowCount() int {
	p := c.currentPreset()
	if p == nil {
		return 1
	}
	rows := 3 // label, auth, status
	if c.appliedSummary() != "" {
		rows++
		if c.pendingDiffersFromApplied(*p) && c.pendingSummary(*p) != "" {
			rows++
		}
	}
	if c.lmConfigSelectedCanEditAPIBase() {
		rows++
	} else {
		rows++ // transport row
	}
	return rows
}
