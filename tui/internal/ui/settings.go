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
	tab       int // 0 = Model, 1 = Agent, 2 = Theme, 3 = TUI prefs
	agentSel  int // index into agentList
	themeSel  int // 0 = dark, 1 = light
	tuiRow    int // TUI tab active row (0 = collapse threshold)
	agentList []gact.AgentDef
	loadErr   string // set when loadSettingsCmd surfaces failures
}

// tuiPrefsRowCount is the number of editable rows in the TUI tab.
// Bump when adding new knobs; key navigation clamps against this.
// Rows: 0=collapse threshold, 1=cost warn, 2=cost danger,
// 3=paste-compress threshold (YYYYY1), 4=intro splash (YYYYY1).
const tuiPrefsRowCount = 5

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
const settingsTabCount = 4

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
		return sessionUpdatedMsg{session: updated}
	}
}

type settingsLoadedMsg struct {
	agents  []gact.AgentDef
	loadErr string
}

type sessionUpdatedMsg struct {
	session gact.Session
}

// handleSettingsKey routes keypresses while the Settings modal is open.
func (a *App) handleSettingsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.settings == nil {
		a.settings = &settingsState{}
	}
	s := a.settings
	switch k.String() {
	case "esc", "ctrl+s":
		a.settingsOpen = false
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
		case 2:
			if s.themeSel > 0 {
				s.themeSel--
			}
			a.previewTheme(s.themeSel)
		case 3:
			if s.tuiRow > 0 {
				s.tuiRow--
			}
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
		case 2:
			if s.themeSel < len(AllThemeModes)-1 {
				s.themeSel++
			}
			a.previewTheme(s.themeSel)
		case 3:
			if s.tuiRow < tuiPrefsRowCount-1 {
				s.tuiRow++
			}
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
		case 3:
			// TUI prefs tab is read-only for now — Enter just closes.
			a.settingsOpen = false
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

	tabs := func(i int) string {
		labels := []string{"Model", "Agent", "Theme", "TUI"}
		var rendered []string
		for j, l := range labels {
			st := lipgloss.NewStyle().Foreground(t.FgMuted).Padding(0, 2)
			if j == i {
				st = st.Foreground(t.Bg).Background(t.Primary).Bold(true)
			}
			rendered = append(rendered, st.Render(l))
		}
		return strings.Join(rendered, " ")
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

	// LLL4: title bar — full-width Primary-background strip with the
	// modal title in inverted text. Reads as a real header instead of
	// a floating dim word.
	titleBar := lipgloss.NewStyle().
		Background(t.Primary).Foreground(t.Bg).Bold(true).
		Padding(0, 2).Width(w - 4).Render("Settings")

	rows := []string{
		titleBar,
		"",
		tabs(s.tab),
		"",
	}
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
		rows = append(rows, t.HintLabel.Render("current: "+orPlaceholder(currentModel, "(unset)")))
		rows = append(rows, "")
		rows = append(rows, rowLine(true, "Change provider…",
			"open the provider/model picker (global CLIO LM)"))
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render(
			"Enter opens the same picker shown on first connect — "+
				"saving there reconfigures CLIO's active global LM."))
	case 1:
		rows = append(rows, t.HintLabel.Render("current: "+orPlaceholder(currentAgent, "(unset)")))
		rows = append(rows, "")
		if len(s.agentList) == 0 {
			rows = append(rows, t.HintLabel.Render("loading…"))
		}
		for i, ag := range s.agentList {
			rows = append(rows, rowLine(i == s.agentSel, ag.ID, ag.Title))
		}
	case 2:
		// Theme tab — pick any of the AllThemeModes palettes. ↑/↓
		// previews live so users can see what they're picking
		// before committing. Enter commits + persists via N5's
		// config hook.
		rows = append(rows, t.HintLabel.Render("current: "+themeName(a.Theme)))
		rows = append(rows, "")
		for i, mode := range AllThemeModes {
			label := ThemeModeName(mode)
			if mode == ModeCustom {
				label = customThemeDisplayName
			}
			rows = append(rows, rowLine(i == s.themeSel, label, themeDescription(mode)))
		}
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render(
			"↑/↓ previews live · Enter commits + persists to ~/.config/gact/config.json"))
	case 3:
		// TUI preferences. Mix of editable knobs and read-only runtime
		// state. Editable rows have ◀/▶ affordances; the selected row
		// is highlighted so ←/→ target is unambiguous.
		rows = append(rows, t.HintLabel.Render("Display preferences"))
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

		rows = append(rows, editableRow(0,
			"collapse threshold",
			"◀ "+itoa2(a.Theme.CollapseThreshold)+" lines ▶",
			"tool_result bodies longer than N lines collapse to a preview. "+
				"Ctrl+E opens the full content.")...)
		rows = append(rows, editableRow(1,
			"cost warn tokens   ",
			"◀ "+humanTokens(a.Theme.CostWarnTokens)+" ▶",
			"footer turns yellow when input tokens cross this threshold "+
				"(approaching the model's context window).")...)
		rows = append(rows, editableRow(2,
			"cost danger tokens ",
			"◀ "+humanTokens(a.Theme.CostDangerTokens)+" ▶",
			"footer turns red — usually the hard ceiling of typical "+
				"frontier-model context windows.")...)
		// YYYYY1: paste compression threshold + intro splash toggle.
		pt := a.Theme.PasteCompressThreshold
		if pt <= 0 {
			pt = 3
		}
		rows = append(rows, editableRow(3,
			"paste compress     ",
			"◀ "+itoa2(pt)+" lines ▶",
			"bracketed pastes ≥ N lines collapse to a "+
				"`[pasted content: N lines]` placeholder; Ctrl+P to expand.")...)
		introState := "off"
		if a.IntroDisabled {
			introState = "on  (skip splash)"
		} else {
			introState = "off (show splash)"
		}
		rows = append(rows, editableRow(4,
			"intro splash skip  ",
			"◀ "+introState+" ▶",
			"persists to config; --no-intro CLI flag still wins as override.")...)

		// Read-only runtime state for confirmation.
		rows = append(rows, t.HintLabel.Render("Runtime state (edit config.json to change)"))
		rows = append(rows, "  "+t.HintKey.Render("backend URL  ")+a.BackendURL)
		if a.VoiceCommand == "" {
			rows = append(rows, "  "+t.HintKey.Render("voice cmd    ")+t.HintLabel.Render("(unset — Ctrl+Y sends placeholder)"))
		} else {
			rows = append(rows, "  "+t.HintKey.Render("voice cmd    ")+a.VoiceCommand)
		}
		rows = append(rows, "  "+t.HintKey.Render("theme        ")+themeName(a.Theme))
		rows = append(rows, "  "+t.HintKey.Render("AltScreen    ")+boolPretty(!a.DisableAltScreen))
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render(
			"←/→ on the selected row adjusts the value. Ctrl+L reloads the config file."))
	}
	rows = append(rows, "", t.HintLabel.Render("↑/↓ select  Tab switch tab  Enter apply  Esc close"))

	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Background(t.BgSubtle).
		Padding(1, 2).
		Width(w).
		Render(body)
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

// boolPretty renders a bool as "on"/"off" for the TUI-prefs tab.
func boolPretty(b bool) string {
	if b {
		return "on"
	}
	return "off"
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
