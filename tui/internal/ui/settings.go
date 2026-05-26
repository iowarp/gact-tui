package ui

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// settingsState holds the Settings modal's internal state. Lives on App
// when settingsOpen is true.
type settingsState struct {
	tab         int // 0 = Model, 1 = Agent, 2 = Theme, 3 = TUI prefs, 4 = Language
	agentSel    int // index into agentList
	agentScroll int // first visible row in the Agent tab list
	themeSel    int // index into AllThemeModes
	tuiRow      int // TUI tab active row (0 = collapse threshold)
	languageSel int // index into availableLanguageOptions()
	agentList   []gact.AgentDef
	loadErr     string // set when loadSettingsCmd surfaces failures
}

// tuiPrefsRowCount is the number of editable rows in the TUI tab.
// Bump when adding new knobs; key navigation clamps against this.
// Rows: 0=collapse threshold, 1=cost warn, 2=cost danger,
// 3=paste-compress threshold (YYYYY1), 4=intro splash (YYYYY1),
// 5=terminal mouse capture.
const tuiPrefsRowCount = 6

// YYYYY1: paste-compress threshold steps by 1 line (small range
// — 2 means "compress almost everything", 20 means "rarely
// bother") and the intro toggle is just on/off.
const (
	pasteThresholdMin = 2
	pasteThresholdMax = 20
)

// LLLLL1: cost token thresholds adjust in 25k-token increments —
// fine enough to land on practical values (50K/75K/100K…), coarse
// enough that one keypress moves the dial meaningfully. Min 1k so
// the warn band can't be silenced entirely; max 1M covers the
// largest current context windows with headroom.
const (
	costStep = 25_000
	costMin  = 1_000
	costMax  = 1_000_000
)

// settingsTabCount is the canonical number of tabs — updating the list
// in viewSettings without touching the wrap-around in handleSettingsKey
// caused Tab to go stale in past iterations. Single source of truth.
const settingsTabCount = 5

// loadSettingsCmd fetches the agent catalog for the Agent tab. Model
// data is intentionally NOT fetched here — Tab 0 hands off to the
// lifecycle LM-config modal which has its own catalog logic and is the
// single source of truth for provider/model state. Removing the
// per-provider /v1/providers/{id}/models calls also drops Ctrl+S
// latency from seconds (fan-out across every preset) to one
// round-trip.
func loadSettingsCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		agents, err := c.ListAgents(ctx)
		if err != nil {
			return settingsLoadedMsg{loadErr: "agents: " + err.Error()}
		}
		return settingsLoadedMsg{agents: agents}
	}
}

// applySettingsCmd PATCHes the session with the chosen model + agent.
func applySettingsCmd(c *client.Client, sessionID string, model *gact.ModelRef, agent *gact.AgentRef) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		req := client.PatchSessionRequest{Model: model, Agent: agent}
		updated, err := c.PatchSession(ctx, sessionID, req)
		if err != nil {
			return errMsg{err: err, stage: "patch-session"}
		}
		msg := sessionUpdatedMsg{session: updated}
		if model != nil {
			ref := *model
			msg.model = &ref
		}
		if agent != nil {
			msg.agentID = agent.ID
		}
		return msg
	}
}

type settingsLoadedMsg struct {
	agents  []gact.AgentDef
	loadErr string
}

type sessionUpdatedMsg struct {
	session gact.Session
	model   *gact.ModelRef
	agentID string
}

func (a *App) closeSettingsModal() {
	a.settingsOpen = false
}

func selectableSessionAgents(agents []gact.AgentDef) []gact.AgentDef {
	out := make([]gact.AgentDef, 0, len(agents))
	for _, ag := range agents {
		if ag.Source == "skill" || ag.Tier == 3 {
			continue
		}
		out = append(out, ag)
	}
	return out
}

// handleSettingsKey routes keypresses while the Settings modal is open.
func (a *App) handleSettingsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.settings == nil {
		a.settings = &settingsState{}
	}
	s := a.settings
	switch k.String() {
	case "esc", "ctrl+s":
		a.closeSettingsModal()
		return a, nil
	case "tab":
		s.tab = (s.tab + 1) % settingsTabCount
		return a, nil
	case "shift+tab":
		s.tab = (s.tab + settingsTabCount - 1) % settingsTabCount
		return a, nil
	case "up", "k":
		switch s.tab {
		case 0:
			// Tab 0 has a single row (the change-provider action) — no
			// list to navigate.
		case 1:
			if s.agentSel > 0 {
				s.agentSel--
			}
			a.ensureAgentSelectionVisible()
		case 2:
			if s.themeSel > 0 {
				s.themeSel--
			}
			a.previewTheme(s.themeSel)
		case 3:
			if s.tuiRow > 0 {
				s.tuiRow--
			}
		case 4:
			if s.languageSel > 0 {
				s.languageSel--
			}
			a.previewLanguage(s.languageSel)
		}
		return a, nil
	case "down", "j":
		switch s.tab {
		case 0:
			// Tab 0 has a single row (the change-provider action) — no
			// list to navigate.
		case 1:
			if s.agentSel < len(s.agentList)-1 {
				s.agentSel++
			}
			a.ensureAgentSelectionVisible()
		case 2:
			if s.themeSel < len(AllThemeModes)-1 {
				s.themeSel++
			}
			a.previewTheme(s.themeSel)
		case 3:
			if s.tuiRow < tuiPrefsRowCount-1 {
				s.tuiRow++
			}
		case 4:
			if s.languageSel < len(availableLanguageOptions())-1 {
				s.languageSel++
			}
			a.previewLanguage(s.languageSel)
		}
		return a, nil
	case "left", "h":
		// LLLLL1: ←/→ on the selected TUI pref. Each row clamps
		// independently. Collapse threshold (row 0) stays at the old
		// 1..50 line range. Cost rows (1, 2) move in costStep
		// increments and stay clamped to costMin..costMax.
		if s.tab == 3 {
			switch s.tuiRow {
			case 0:
				if a.Theme.CollapseThreshold > 1 {
					a.Theme.CollapseThreshold--
					a.persistPrefs()
				}
			case 1:
				if a.Theme.CostWarnTokens > costMin+costStep {
					a.Theme.CostWarnTokens -= costStep
					a.persistPrefs()
				} else if a.Theme.CostWarnTokens > costMin {
					a.Theme.CostWarnTokens = costMin
					a.persistPrefs()
				}
			case 2:
				if a.Theme.CostDangerTokens > costMin+costStep {
					a.Theme.CostDangerTokens -= costStep
					a.persistPrefs()
				} else if a.Theme.CostDangerTokens > costMin {
					a.Theme.CostDangerTokens = costMin
					a.persistPrefs()
				}
			case 3:
				// YYYYY1: paste-compress threshold ↓
				cur := a.Theme.PasteCompressThreshold
				if cur <= 0 {
					cur = 3
				}
				if cur > pasteThresholdMin {
					a.Theme.PasteCompressThreshold = cur - 1
					a.persistPrefs()
				}
			case 4:
				// YYYYY1: intro toggle is bool — left/right both flip.
				a.IntroDisabled = !a.IntroDisabled
				a.persistPrefs()
			case 5:
				a.MouseEnabled = !a.MouseEnabled
				a.persistPrefs()
			}
		}
		return a, nil
	case "right", "l":
		if s.tab == 3 {
			switch s.tuiRow {
			case 0:
				if a.Theme.CollapseThreshold < 50 {
					a.Theme.CollapseThreshold++
					a.persistPrefs()
				}
			case 1:
				if a.Theme.CostWarnTokens+costStep <= costMax {
					a.Theme.CostWarnTokens += costStep
					a.persistPrefs()
				}
			case 2:
				if a.Theme.CostDangerTokens+costStep <= costMax {
					a.Theme.CostDangerTokens += costStep
					a.persistPrefs()
				}
			case 3:
				cur := a.Theme.PasteCompressThreshold
				if cur <= 0 {
					cur = 3
				}
				if cur < pasteThresholdMax {
					a.Theme.PasteCompressThreshold = cur + 1
					a.persistPrefs()
				}
			case 4:
				a.IntroDisabled = !a.IntroDisabled
				a.persistPrefs()
			case 5:
				a.MouseEnabled = !a.MouseEnabled
				a.persistPrefs()
			}
		}
		return a, nil
	case "enter":
		switch s.tab {
		case 0:
			// Tab 0 is a single "Change provider…" entry point — Enter
			// hands off to the lifecycle LM-config modal. CLIO exposes
			// runtime model changes as a global LM provider swap
			// (PUT /v1/providers/lm), not as per-session model refs.
			a.settingsOpen = false
			a.lmConfigOpen = true
			a.lmConfig = &lmConfigState{}
			return a, lmConfigFetchCmd(a.c)
		case 2:
			// Theme apply is local — no backend PATCH. Live-swap the
			// lipgloss Theme so the conversation redraws with the new
			// palette; same plumbing K9 uses for config-reload. We
			// also persist the choice via SaveConfig so it survives
			// restart (N5 plumbing).
			mode := ModeDark
			if s.themeSel >= 0 && s.themeSel < len(AllThemeModes) {
				mode = AllThemeModes[s.themeSel]
			}
			prev := a.Theme.CollapseThreshold
			a.Theme = ThemeForMode(mode)
			a.Theme.CollapseThreshold = prev // preserve the user's pref across swap
			a.Theme.applyStyles()            // re-run so HintKey/etc. see the new palette
			a.settingsOpen = false
			a.transientHint = "theme: " + ThemeModeName(mode)
			a.persistPrefs()
			return a, nil
		case 1:
			a.openSettingsAgentDetail()
			return a, nil
		case 3:
			// TUI prefs tab is read-only for now — Enter just closes.
			a.settingsOpen = false
			return a, nil
		}
		if s.tab == 4 {
			opt := activeLanguageOption(a.Locale())
			options := availableLanguageOptions()
			if s.languageSel >= 0 && s.languageSel < len(options) {
				opt = options[s.languageSel]
			}
			a.SetLocale(opt.Locale)
			a.settingsOpen = false
			a.transientHint = a.localizer.t(msgLanguageApplied,
				map[string]string{"label": a.localizer.languageOptionLabel(opt)})
			a.persistPrefs()
			return a, nil
		}
		sid := a.currentSessionID()
		if sid == "" {
			a.settingsOpen = false
			return a, nil
		}
		var agentRef *gact.AgentRef
		if s.tab == 1 && s.agentSel < len(s.agentList) {
			ag := s.agentList[s.agentSel]
			agentRef = &gact.AgentRef{ID: ag.ID}
		}
		a.settingsOpen = false
		return a, applySettingsCmd(a.c, sid, nil, agentRef)
	}
	return a, nil
}

// viewSettings renders the modal.
func (a *App) viewSettings() string {
	t := a.Theme
	if a.settings == nil {
		a.settings = &settingsState{}
	}
	s := a.settings
	w := a.modalWidth()
	var rowHits []modalListHit
	var arrowHits []modalCellHit
	addRowHit := func(id string, row int, action uiHitAction) {
		rowHits = append(rowHits, modalListHit{id: id, row: row, height: 1, action: action})
	}
	addRowHitHeight := func(id string, row int, height int, action uiHitAction) {
		if height < 1 {
			height = 1
		}
		rowHits = append(rowHits, modalListHit{id: id, row: row, height: height, action: action})
	}
	addArrowHit := func(id string, row int, col int, width int, action uiHitAction) {
		arrowHits = append(arrowHits, modalCellHit{id: id, row: row, col: col, width: width, height: 1, action: action})
	}
	addListHits := func(list modalListRender, rowOffset int) {
		for _, hit := range list.hits {
			rowHits = append(rowHits, modalListHit{
				id:     hit.id,
				row:    rowOffset + hit.row,
				height: hit.height,
				action: hit.action,
			})
		}
	}
	tabLabels := []string{
		a.localizer.t(msgSettingsTabModel, nil),
		a.localizer.t(msgSettingsTabAgent, nil),
		a.localizer.t(msgSettingsTabTheme, nil),
		a.localizer.t(msgSettingsTabTUI, nil),
		a.localizer.t(msgSettingsTabLanguage, nil),
	}
	tabIDs := []string{
		"settings-model",
		"settings-agent",
		"settings-theme",
		"settings-tui",
		"settings-language",
	}
	tabHits := make([]menuTab, 0, len(tabLabels))
	for i, label := range tabLabels {
		idx := i
		tabHits = append(tabHits, menuTab{
			id:     tabIDs[i],
			label:  label,
			active: s.tab == i,
			action: func(app *App) tea.Cmd {
				if app.settings == nil {
					app.settings = &settingsState{}
				}
				app.settings.tab = idx
				return nil
			},
		})
	}
	currentModel := ""
	currentAgent := ""
	if a.selected >= 0 && a.selected < len(a.sessions) {
		sess := a.sessions[a.selected]
		if sess.Model.ModelID != "" {
			currentModel = sess.Model.ProviderID + "/" + sess.Model.ModelID
		}
		if sess.Agent.ID != "" {
			currentAgent = sess.Agent.ID
		}
	}
	// CLIO-style backends ship a global LM config rather than per-session
	// ModelRefs; surface it so the Settings 'current' line doesn't read
	// '(unset)' even when /v1/providers/lm clearly has a model wired.
	if currentModel == "" && a.lmProviderInfo != nil && a.lmProviderInfo.Configured && a.lmProviderInfo.Model != "" {
		currentModel = a.lmProviderInfo.Provider + "/" + a.lmProviderInfo.Model
	}

	buttons := []menuButton{closeMenuButton("settings:close", func(app *App) { app.closeSettingsModal() })}
	rows := []string{}
	if s.loadErr != "" {
		rows = append(rows,
			lipgloss.NewStyle().Foreground(t.Warning).Render(s.loadErr),
			"",
		)
	}
	// LLL4: shared row renderer — selected row gets a Bg background
	// strip + Secondary-bold text; non-selected just plain Fg. The
	// `▌` marker stays for keyboard-only users who want to verify
	// the cursor at a glance.
	rowLine := func(selected bool, primaryText, secondaryText string) string {
		marker := "  "
		titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
		descStyle := lipgloss.NewStyle().Foreground(t.FgMuted)
		if selected {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
			titleStyle = titleStyle.Foreground(t.Secondary).Bold(true)
		}
		line := marker + titleStyle.Render(primaryText)
		if secondaryText != "" {
			line += "  " + descStyle.Render(secondaryText)
		}
		out := truncate(line, w-2)
		if selected {
			// Bg strip behind the entire row to make the selection
			// pop. Width(w-4) matches modal interior; the row bg
			// extends past the text so even short rows feel selected.
			out = lipgloss.NewStyle().Background(t.Bg).
				Width(w - 4).Render(out)
		}
		return out
	}

	switch s.tab {
	case 0:
		// Tab 0 (Model) is intentionally a thin shim: show the active
		// provider/model and a single "change provider" action that
		// hands off to the lifecycle LM-config modal in global-provider
		// mode. ONE picker implementation; this tab is just an entry
		// point. Embedding the full picker inside Settings duplicated
		// state and produced a cramped layout — the standalone modal
		// already has the wide list view + advanced collapse.
		rows = append(rows, t.HintLabel.Render(a.localizer.t(msgSettingsCurrent,
			map[string]string{"value": orPlaceholder(currentModel, a.localizer.t(msgSettingsUnset, nil))})))
		rows = append(rows, "")
		row := len(rows)
		rows = append(rows, rowLine(true, a.localizer.t(msgSettingsModelChange, nil),
			a.localizer.t(msgSettingsModelChangeDesc, nil)))
		addRowHit("settings:model:change-provider", row, func(app *App) tea.Cmd {
			app.settingsOpen = false
			app.lmConfigOpen = true
			app.lmConfig = &lmConfigState{}
			return lmConfigFetchCmd(app.c)
		})
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render(
			a.localizer.t(msgSettingsModelHint, nil)))
	case 1:
		rows = append(rows, t.HintLabel.Render(a.localizer.t(msgSettingsCurrent,
			map[string]string{"value": orPlaceholder(currentAgent, a.localizer.t(msgSettingsUnset, nil))})))
		rows = append(rows, "")
		if len(s.agentList) == 0 {
			rows = append(rows, t.HintLabel.Render(a.localizer.t(msgSettingsLoading, nil)))
		}
		if s.agentSel >= len(s.agentList) {
			s.agentSel = max(0, len(s.agentList)-1)
		}
		a.ensureAgentSelectionVisible()
		start, end := a.visibleAgentRange()
		if start > 0 {
			rows = append(rows, t.HintLabel.Render("  ↑ "+itoa2(start)))
		}
		for i, ag := range s.agentList[start:end] {
			absolute := start + i
			row := len(rows)
			idx := absolute
			rows = append(rows, rowLine(absolute == s.agentSel, a.localizedAgentTitle(ag), a.localizedAgentDescription(ag)))
			addRowHit("settings:agent:"+ag.ID, row, func(app *App) tea.Cmd {
				if app.settings == nil {
					app.settings = &settingsState{tab: 1}
				}
				if idx < 0 || idx >= len(app.settings.agentList) {
					return nil
				}
				app.settings.agentSel = idx
				app.openSettingsAgentDetail()
				return nil
			})
		}
		if end < len(s.agentList) {
			rows = append(rows, t.HintLabel.Render("  ↓ "+itoa2(len(s.agentList)-end)))
		}
		if len(s.agentList) > 0 {
			rows = append(rows, "")
			rows = append(rows, lipgloss.NewStyle().Foreground(t.Secondary).Bold(true).Render("Details"))
			detailLines := a.agentDetailLines(s.agentList[s.agentSel], w-4)
			maxDetails := max(3, (a.height-4)/4)
			if len(detailLines) > maxDetails {
				detailLines = append(detailLines[:maxDetails], t.HintLabel.Render("  …"))
			}
			rows = append(rows, detailLines...)
		}
	case 2:
		// Theme tab — pick any of the AllThemeModes palettes. ↑/↓
		// previews live so users can see what they're picking
		// before committing. Enter commits + persists via N5's
		// config hook.
		rows = append(rows, t.HintLabel.Render(a.localizer.t(msgSettingsCurrent,
			map[string]string{"value": a.localizedThemeName(ThemeModeFor(a.Theme))})))
		rows = append(rows, "")
		listStart := len(rows)
		items := make([]modalListItem, 0, len(AllThemeModes))
		for i, mode := range AllThemeModes {
			idx := i
			items = append(items, modalListItem{
				id:          "settings:theme:" + ThemeModeName(mode),
				title:       a.localizedThemeName(mode),
				description: a.localizedThemeDescription(mode),
				selected:    i == s.themeSel,
				action: func(app *App) tea.Cmd {
					if app.settings == nil {
						app.settings = &settingsState{tab: 2}
					}
					app.settings.themeSel = idx
					app.previewTheme(idx)
					return nil
				},
			})
		}
		list := a.renderModalList(items, modalListOptions{
			width:            w - 4,
			rowBudget:        len(items) * 2,
			descriptionLines: 1,
		})
		rows = append(rows, list.rows...)
		addListHits(list, listStart)
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render(
			a.localizer.t(messageID("settings.theme.hint"), nil)))
	case 3:
		// TUI preferences. Mix of editable knobs and read-only runtime
		// state. Editable rows have ◀/▶ affordances; the selected row
		// is highlighted so ←/→ target is unambiguous.
		rows = append(rows, t.HintLabel.Render(a.localizer.t(msgSettingsTUIDisplayPrefs, nil)))
		rows = append(rows, "")

		// LLLLL1: shared editable-row renderer for the TUI tab so
		// rows 0..tuiPrefsRowCount-1 share the same selection visual
		// (▌ marker + Secondary-bold label + Secondary-bold value).
		editableRow := func(rowIdx int, label, value, hint string) []string {
			marker := "  "
			labelStyle := lipgloss.NewStyle().Foreground(t.Fg)
			valueStyle := t.HintLabel
			if s.tuiRow == rowIdx {
				marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
				labelStyle = labelStyle.Foreground(t.Secondary).Bold(true)
				valueStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
			}
			out := []string{marker + labelStyle.Render(label) + "  " + valueStyle.Render(value)}
			if hint != "" {
				out = append(out, "  "+t.HintLabel.Italic(true).Render(hint))
			}
			out = append(out, "")
			return out
		}
		addTUIControlHits := func(id string, rowIdx int, row int, label string, value string) {
			valueStart := 2 + lipgloss.Width(label) + 2
			leftCol := valueStart
			rightCol := valueStart + lipgloss.Width("◀ "+value+" ")
			selectRow := func(app *App) {
				if app.settings == nil {
					app.settings = &settingsState{tab: 3}
				}
				app.settings.tuiRow = rowIdx
			}
			addArrowHit("settings:tui:"+id+":value", row, leftCol, maxInt(1, lipgloss.Width("◀ "+value+" ▶")), func(app *App) tea.Cmd {
				selectRow(app)
				return nil
			})
			addArrowHit("settings:tui:"+id+":dec", row, leftCol, 3, func(app *App) tea.Cmd {
				selectRow(app)
				_, cmd := app.handleSettingsKey(keyMsg("left"))
				return cmd
			})
			addArrowHit("settings:tui:"+id+":inc", row, rightCol, 3, func(app *App) tea.Cmd {
				selectRow(app)
				_, cmd := app.handleSettingsKey(keyMsg("right"))
				return cmd
			})
		}
		addTUIRowHit := func(id string, rowIdx int, row int, block []string) {
			addRowHitHeight("settings:tui:"+id, row, maxInt(1, len(block)-1), func(app *App) tea.Cmd {
				if app.settings != nil {
					app.settings.tuiRow = rowIdx
				}
				return nil
			})
		}

		label := a.localizer.t(messageID("settings.tui.collapse_threshold"), nil)
		value := itoa2(a.Theme.CollapseThreshold) + " " + a.localizer.t(messageID("settings.tui.lines"), nil)
		row := len(rows)
		block := editableRow(0,
			label,
			"◀ "+value+" ▶",
			a.localizer.t(messageID("settings.tui.collapse_threshold_hint"), nil))
		rows = append(rows, block...)
		addTUIRowHit("collapse-threshold", 0, row, block)
		addTUIControlHits("collapse-threshold", 0, row, label, value)
		label = a.localizer.t(messageID("settings.tui.cost_warn_tokens"), nil)
		value = humanTokens(a.Theme.CostWarnTokens)
		row = len(rows)
		block = editableRow(1,
			label,
			"◀ "+value+" ▶",
			a.localizer.t(messageID("settings.tui.cost_warn_hint"), nil))
		rows = append(rows, block...)
		addTUIRowHit("cost-warn", 1, row, block)
		addTUIControlHits("cost-warn", 1, row, label, value)
		label = a.localizer.t(messageID("settings.tui.cost_danger_tokens"), nil)
		value = humanTokens(a.Theme.CostDangerTokens)
		row = len(rows)
		block = editableRow(2,
			label,
			"◀ "+value+" ▶",
			a.localizer.t(messageID("settings.tui.cost_danger_hint"), nil))
		rows = append(rows, block...)
		addTUIRowHit("cost-danger", 2, row, block)
		addTUIControlHits("cost-danger", 2, row, label, value)
		// YYYYY1: paste compression threshold + intro splash toggle.
		pt := a.Theme.PasteCompressThreshold
		if pt <= 0 {
			pt = 3
		}
		label = a.localizer.t(messageID("settings.tui.paste_compress"), nil)
		value = itoa2(pt) + " " + a.localizer.t(messageID("settings.tui.lines"), nil)
		row = len(rows)
		block = editableRow(3,
			label,
			"◀ "+value+" ▶",
			a.localizer.t(messageID("settings.tui.paste_compress_hint"), nil))
		rows = append(rows, block...)
		addTUIRowHit("paste-compress", 3, row, block)
		addTUIControlHits("paste-compress", 3, row, label, value)
		introState := a.localizer.t(msgSettingsOff, nil)
		if a.IntroDisabled {
			introState = a.localizer.t(msgSettingsOn, nil) + "  (" + a.localizer.t(messageID("settings.tui.skip_splash"), nil) + ")"
		} else {
			introState = a.localizer.t(msgSettingsOff, nil) + " (" + a.localizer.t(messageID("settings.tui.show_splash"), nil) + ")"
		}
		label = a.localizer.t(messageID("settings.tui.intro_splash_skip"), nil)
		value = introState
		row = len(rows)
		block = editableRow(4,
			label,
			"◀ "+value+" ▶",
			a.localizer.t(messageID("settings.tui.intro_splash_hint"), nil))
		rows = append(rows, block...)
		addTUIRowHit("intro", 4, row, block)
		addTUIControlHits("intro", 4, row, label, value)

		mouseState := a.localizer.t(msgSettingsOn, nil)
		if !a.MouseEnabled {
			mouseState = a.localizer.t(msgSettingsOff, nil)
		}
		label = a.localizer.t(messageID("settings.tui.mouse_controls"), nil)
		value = mouseState
		row = len(rows)
		block = editableRow(5,
			label,
			"◀ "+value+" ▶",
			a.localizer.t(messageID("settings.tui.mouse_controls_hint"), nil))
		rows = append(rows, block...)
		addTUIRowHit("mouse", 5, row, block)
		addTUIControlHits("mouse", 5, row, label, value)

		// Read-only runtime state for confirmation.
		rows = append(rows, t.HintLabel.Render(a.localizer.t(msgSettingsTUIRuntimeState, nil)))
		rows = append(rows, "  "+t.HintKey.Render(a.localizer.t(msgSettingsTUIBackendURL, nil)+"  ")+a.BackendURL)
		if a.VoiceCommand == "" {
			rows = append(rows, "  "+t.HintKey.Render(a.localizer.t(msgSettingsTUIVoiceCmd, nil)+"    ")+t.HintLabel.Render(a.localizer.t(msgSettingsTUIVoiceUnset, nil)))
		} else {
			rows = append(rows, "  "+t.HintKey.Render(a.localizer.t(msgSettingsTUIVoiceCmd, nil)+"    ")+a.VoiceCommand)
		}
		rows = append(rows, "  "+t.HintKey.Render(a.localizer.t(msgSettingsTUITheme, nil)+"        ")+a.localizedThemeName(ThemeModeFor(a.Theme)))
		rows = append(rows, "  "+t.HintKey.Render(a.localizer.t(msgSettingsTUIAltScreen, nil)+"    ")+a.boolPretty(!a.DisableAltScreen))
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render(
			a.localizer.t(msgSettingsTUIAdjustHint, nil)))
	}
	if s.tab == 4 {
		rows = append(rows, t.HintLabel.Render(a.localizer.t(msgLanguageCurrent, nil)+": "+
			a.localizer.activeLanguageLabel()))
		rows = append(rows, "")
		options := availableLanguageOptions()
		listStart := len(rows)
		items := make([]modalListItem, 0, len(options))
		for i, opt := range options {
			idx := i
			items = append(items, modalListItem{
				id:          "settings:language:" + opt.Locale,
				title:       a.localizer.languageOptionLabel(opt),
				description: opt.Locale,
				selected:    i == s.languageSel,
				action: func(app *App) tea.Cmd {
					if app.settings == nil {
						app.settings = &settingsState{tab: 4}
					}
					app.settings.languageSel = idx
					app.previewLanguage(idx)
					return nil
				},
			})
		}
		list := a.renderModalList(items, modalListOptions{
			width:            w - 4,
			rowBudget:        len(items) * 2,
			descriptionLines: 1,
		})
		rows = append(rows, list.rows...)
		addListHits(list, listStart)
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Render(a.localizer.t(msgLanguageDescription, nil)))
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render(a.localizer.t(msgLanguageHint, nil)))
	}

	body := padModalBody(lipgloss.JoinVertical(lipgloss.Left, rows...), a.settingsBodyPageSize())
	rendered := a.renderModalFrameWithLayout(modalFrameOptions{
		width:      w,
		title:      a.localizer.t(msgSettingsTitle, nil),
		buttons:    buttons,
		tabs:       tabHits,
		tabPadding: 2,
		tabSpacing: 2,
		body:       body,
		footer:     t.HintLabel.Render(a.localizer.t(msgSettingsFooter, nil)),
	})
	a.registerModalSurfaceWheel(rendered, "settings")
	bodyList := modalListRender{
		rows: strings.Split(body, "\n"),
		hits: rowHits,
	}
	a.registerModalListRegion(rendered.modal, rendered.bodyRow, 0, w-4, bodyList, "settings:body:wheel", func(app *App, button tea.MouseButton) tea.Cmd {
		if app.settings == nil {
			app.settings = &settingsState{}
		}
		switch button {
		case tea.MouseWheelUp:
			_, cmd := app.handleSettingsKey(keyMsg("up"))
			return cmd
		case tea.MouseWheelDown:
			_, cmd := app.handleSettingsKey(keyMsg("down"))
			return cmd
		}
		return nil
	})
	a.registerModalCellHits(rendered.modal, rendered.bodyRow, arrowHits)
	return rendered.modal
}

func (a *App) settingsBodyPageSize() int {
	return a.modalBodyRows(14)
}

func orPlaceholder(s, placeholder string) string {
	if s == "" {
		return placeholder
	}
	return s
}

// themeName returns the canonical string identifier for a Theme.
// Used by the Theme tab's "current:" row, the settings hint, and
// the Ctrl+L / --theme config persistence round-trip. Previously
// keyed off background luminance (r,g,b > 60000 = light); now uses
// ThemeModeFor which matches against the known palettes exactly so
// adding new themes doesn't silently mislabel them.
func themeName(t Theme) string {
	return ThemeModeName(ThemeModeFor(t))
}

func (a *App) localizedThemeName(mode ThemeMode) string {
	switch mode {
	case ModeDark:
		return a.localizer.t(messageID("settings.theme.dark"), nil)
	case ModeLight:
		return a.localizer.t(messageID("settings.theme.light"), nil)
	case ModeDracula:
		return a.localizer.t(messageID("settings.theme.dracula"), nil)
	case ModeSolarizedDark:
		return a.localizer.t(messageID("settings.theme.solarized_dark"), nil)
	case ModeSolarizedLight:
		return a.localizer.t(messageID("settings.theme.solarized_light"), nil)
	case ModeNord:
		return a.localizer.t(messageID("settings.theme.nord"), nil)
	case ModeTokyoNight:
		return a.localizer.t(messageID("settings.theme.tokyo_night"), nil)
	case ModeCustom:
		return a.localizer.t(messageID("settings.theme.custom"), nil)
	default:
		return ThemeModeName(mode)
	}
}

func (a *App) localizedThemeDescription(mode ThemeMode) string {
	switch mode {
	case ModeDark:
		return a.localizer.t(messageID("settings.theme.desc.dark"), nil)
	case ModeLight:
		return a.localizer.t(messageID("settings.theme.desc.light"), nil)
	case ModeDracula:
		return a.localizer.t(messageID("settings.theme.desc.dracula"), nil)
	case ModeSolarizedDark:
		return a.localizer.t(messageID("settings.theme.desc.solarized_dark"), nil)
	case ModeSolarizedLight:
		return a.localizer.t(messageID("settings.theme.desc.solarized_light"), nil)
	case ModeNord:
		return a.localizer.t(messageID("settings.theme.desc.nord"), nil)
	case ModeTokyoNight:
		return a.localizer.t(messageID("settings.theme.desc.tokyo_night"), nil)
	case ModeCustom:
		return a.localizer.t(messageID("settings.theme.desc.custom"), nil)
	default:
		return ""
	}
}

func (a *App) localizedAgentTitle(ag gact.AgentDef) string {
	if key := knownAgentLocaleKey(ag.ID, false); key != "" {
		return a.localizer.t(messageID(key), nil)
	}
	if strings.TrimSpace(ag.Title) != "" {
		return ag.Title
	}
	return ag.ID
}

func (a *App) localizedAgentDescription(ag gact.AgentDef) string {
	if key := knownAgentLocaleKey(ag.ID, true); key != "" {
		return a.localizer.t(messageID(key), nil)
	}
	return ag.Description
}

func (a *App) visibleAgentRange() (int, int) {
	if a.settings == nil || len(a.settings.agentList) == 0 {
		return 0, 0
	}
	visible := a.maxVisibleAgentRows()
	if visible > len(a.settings.agentList) {
		visible = len(a.settings.agentList)
	}
	start := a.settings.agentScroll
	if start < 0 {
		start = 0
	}
	if start > len(a.settings.agentList)-visible {
		start = len(a.settings.agentList) - visible
	}
	end := start + visible
	a.settings.agentScroll = start
	return start, end
}

func (a *App) maxVisibleAgentRows() int {
	visible := a.height - 24
	if visible < 4 {
		visible = 4
	}
	if visible > 12 {
		visible = 12
	}
	return visible
}

func (a *App) ensureAgentSelectionVisible() {
	if a.settings == nil {
		return
	}
	if a.settings.agentSel < 0 {
		a.settings.agentSel = 0
	}
	if a.settings.agentSel >= len(a.settings.agentList) {
		a.settings.agentSel = max(0, len(a.settings.agentList)-1)
	}
	visible := a.maxVisibleAgentRows()
	if a.settings.agentSel < a.settings.agentScroll {
		a.settings.agentScroll = a.settings.agentSel
	}
	if a.settings.agentSel >= a.settings.agentScroll+visible {
		a.settings.agentScroll = a.settings.agentSel - visible + 1
	}
	if a.settings.agentScroll < 0 {
		a.settings.agentScroll = 0
	}
}

func (a *App) openSettingsAgentDetail() {
	if a.settings == nil || a.settings.agentSel < 0 || a.settings.agentSel >= len(a.settings.agentList) {
		return
	}
	ag := a.settings.agentList[a.settings.agentSel]
	ref := bulkyPartRef{
		messageID: "settings",
		partID:    "agent-" + ag.ID,
		title:     "Agent · " + a.localizedAgentTitle(ag),
		fullText:  a.agentDetailText(ag),
	}
	a.detailView = &ref
	a.detailViewOpen = true
	a.detailScroll = 0
}

func (a *App) agentDetailLines(ag gact.AgentDef, width int) []string {
	t := a.Theme
	lines := make([]string, 0, 8)
	add := func(label string, value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		line := lipgloss.NewStyle().Foreground(t.FgMuted).Render("  "+label+": ") +
			lipgloss.NewStyle().Foreground(t.Fg).Render(value)
		lines = append(lines, truncate(line, width))
	}
	add("ID", ag.ID)
	add("Source", ag.Source)
	if ag.Tier > 0 {
		add("Tier", itoa2(ag.Tier))
	}
	add("Specialization", ag.Specialization)
	if routes := stringListFromMetadata(ag.Metadata, "routes_to"); len(routes) > 0 {
		add("Routes to", strings.Join(routes, ", "))
	}
	if delegates := stringListFromMetadata(ag.Metadata, "delegates_to"); len(delegates) > 0 {
		add("Delegates to", strings.Join(delegates, ", "))
	}
	if ag.DefaultModel != nil && ag.DefaultModel.ModelID != "" {
		model := ag.DefaultModel.ModelID
		if ag.DefaultModel.ProviderID != "" {
			model = ag.DefaultModel.ProviderID + "/" + model
		}
		add("Default model", model)
	}
	if len(ag.Tools) > 0 {
		add("Tools", strings.Join(ag.Tools, ", "))
	} else {
		add("Tools", "none declared")
	}
	if len(ag.Keywords) > 0 {
		add("Keywords", strings.Join(ag.Keywords, ", "))
	}
	add("Prompt", ag.SystemPrompt)
	return lines
}

func (a *App) agentDetailText(ag gact.AgentDef) string {
	lines := []string{
		"Title: " + a.localizedAgentTitle(ag),
		"ID: " + ag.ID,
		"Source: " + ag.Source,
	}
	if ag.Tier > 0 {
		lines = append(lines, "Tier: "+itoa2(ag.Tier))
	}
	if ag.Specialization != "" {
		lines = append(lines, "Specialization: "+ag.Specialization)
	}
	if routes := stringListFromMetadata(ag.Metadata, "routes_to"); len(routes) > 0 {
		lines = append(lines, "", "Routes to:")
		lines = append(lines, bulletLines(routes)...)
	}
	if delegates := stringListFromMetadata(ag.Metadata, "delegates_to"); len(delegates) > 0 {
		lines = append(lines, "", "Delegates to:")
		lines = append(lines, bulletLines(delegates)...)
	}
	if len(ag.Tools) > 0 {
		lines = append(lines, "", "Tools:")
		lines = append(lines, bulletLines(ag.Tools)...)
	}
	if len(ag.Keywords) > 0 {
		lines = append(lines, "", "Routing keywords:")
		lines = append(lines, bulletLines(ag.Keywords)...)
	}
	if strings.TrimSpace(ag.SystemPrompt) != "" {
		lines = append(lines, "", "Prompt:", strings.TrimSpace(ag.SystemPrompt))
	}
	return strings.Join(lines, "\n")
}

func bulletLines(items []string) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" {
			out = append(out, "  - "+item)
		}
	}
	return out
}

func stringListFromMetadata(metadata map[string]any, key string) []string {
	if len(metadata) == 0 {
		return nil
	}
	raw, ok := metadata[key]
	if !ok {
		return nil
	}
	switch v := raw.(type) {
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func knownAgentLocaleKey(id string, description bool) string {
	normalized := strings.ToLower(strings.TrimSpace(id))
	normalized = strings.ReplaceAll(normalized, "-", "_")
	normalized = strings.ReplaceAll(normalized, ".", "_")
	normalized = strings.ReplaceAll(normalized, ":", "_")
	if normalized == "" {
		return ""
	}
	switch normalized {
	case "default", "main", "chat", "data", "analysis", "visualization", "utility", "adios_validator", "data_validator":
	default:
		return ""
	}
	if description {
		return "settings.agent.desc." + normalized
	}
	return "settings.agent." + normalized
}

// boolPretty renders a bool as "on"/"off" for the TUI-prefs tab.
func boolPretty(b bool) string {
	if b {
		return "on"
	}
	return "off"
}

func (a *App) boolPretty(b bool) string {
	if b {
		return a.localizer.t(msgSettingsOn, nil)
	}
	return a.localizer.t(msgSettingsOff, nil)
}

func (a *App) seedSettingsSelections() {
	if a.settings == nil {
		a.settings = &settingsState{}
	}
	cur := ThemeModeFor(a.Theme)
	for i, mode := range AllThemeModes {
		if mode == cur {
			a.settings.themeSel = i
			break
		}
	}
	a.settings.languageSel = languageIndex(a.Locale())
}

// previewTheme live-swaps a.Theme as the user steps through the
// theme picker with ↑/↓. The current CollapseThreshold survives the
// swap — no one wants their pref reset just because they're
// flipping through palettes.
func (a *App) previewTheme(idx int) {
	if idx < 0 || idx >= len(AllThemeModes) {
		return
	}
	prev := a.Theme.CollapseThreshold
	a.Theme = ThemeForMode(AllThemeModes[idx])
	a.Theme.CollapseThreshold = prev
	a.Theme.applyStyles()
}

func (a *App) previewLanguage(idx int) {
	options := availableLanguageOptions()
	if idx < 0 || idx >= len(options) {
		return
	}
	a.SetLocale(options[idx].Locale)
}

// themeDescription returns a one-line hint shown next to each palette
// name in the Theme tab. Short and factual; keep the vibe in the
// palette itself, not the description.
func themeDescription(m ThemeMode) string {
	switch m {
	case ModeDark:
		return "default — purple + green on near-black"
	case ModeLight:
		return "Gruvbox-inspired cream + warm accents"
	case ModeDracula:
		return "purple + pink + cyan on deep graphite"
	case ModeSolarizedDark:
		return "Solarized low-contrast dark"
	case ModeSolarizedLight:
		return "Solarized paper-inspired light"
	case ModeNord:
		return "arctic blue + aurora accents"
	case ModeTokyoNight:
		return "navy + neon — cyberpunk glow"
	case ModeCustom:
		return "loaded from ~/.config/gact/theme.json"
	}
	return ""
}

// persistPrefs asks the host (main.go) to save the current Settings
// > TUI values to disk. No-op when SaveConfig isn't wired (tests,
// embedded-mode callers) so the in-memory UI still reflects the
// latest stepper click.
func (a *App) persistPrefs() {
	if a.SaveConfig == nil {
		return
	}
	if err := a.SaveConfig(); err != nil {
		a.transientHint = "config save failed: " + err.Error()
	}
}

// itoa2 is a tiny int-to-string helper for small positive integers.
// Spelled out to avoid pulling strconv into this file; only used by
// the settings display.
func itoa2(n int) string {
	if n == 0 {
		return "0"
	}
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
