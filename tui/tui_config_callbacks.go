package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui"
)

func wireConfigCallbacks(app *ui.App, startBackend string, backendFlag, themeFlag, voiceCmdFlag *string) {
	persistPath, _ := config.DefaultPath()
	app.SaveConfig = func() error {
		cur, _, _ := config.Load() // preserve fields we don't touch
		ct := app.Theme.CollapseThreshold
		cur.CollapseThreshold = &ct
		themeName := ui.ThemeModeName(ui.ThemeModeFor(app.Theme))
		cur.Theme = &themeName
		locale := app.Locale()
		cur.Locale = &locale
		warn := app.Theme.CostWarnTokens
		danger := app.Theme.CostDangerTokens
		cur.CostWarnTokens = &warn
		cur.CostDangerTokens = &danger
		if bp := strings.TrimSpace(app.DefaultAgentBlueprintID); bp != "" {
			cur.DefaultBlueprint = &bp
		} else {
			cur.DefaultBlueprint = nil
		}
		if pack := strings.TrimSpace(app.DefaultExpertPackID); pack != "" {
			cur.DefaultExpertPack = &pack
		} else {
			cur.DefaultExpertPack = nil
		}
		paste := app.Theme.PasteCompressThreshold
		cur.PasteCompressThreshold = &paste
		introSkip := app.IntroDisabled
		cur.IntroSkip = &introSkip
		mouseEnabled := app.MouseEnabled
		cur.MouseEnabled = &mouseEnabled
		cur.DisabledTools = app.GetDisabledTools()
		layout := config.SidebarLayout{}
		if cur.SidebarLayout != nil {
			layout = *cur.SidebarLayout
		}
		layout.Left, layout.Right = app.SidebarLayoutIDs()
		cur.SidebarLayout = &layout
		return config.Save(cur, persistPath)
	}

	app.ReloadConfig = func() (string, error) {
		newCfg, _, err := config.Load()
		if err != nil {
			return "", err
		}
		nextTheme := config.Resolve(newCfg.Theme, os.Getenv("GACT_THEME"), *themeFlag, defaultTheme)
		nextLocale := config.Resolve(newCfg.Locale, os.Getenv("GACT_LOCALE"), "", "en")
		nextVoice := config.Resolve(newCfg.VoiceCommand, os.Getenv("GACT_VOICE_CMD"), *voiceCmdFlag, "")
		nextBackend := config.Resolve(newCfg.BackendURL, os.Getenv("GACT_BACKEND"), *backendFlag, defaultBackend)
		app.Theme = ui.ThemeForMode(ui.ParseThemeMode(nextTheme))
		app.SetLocale(nextLocale)
		app.VoiceCommand = nextVoice
		if newCfg.MouseEnabled != nil {
			app.MouseEnabled = *newCfg.MouseEnabled
		}
		if newCfg.SidebarLayout != nil {
			app.SetSidebarLayout(newCfg.SidebarLayout.Left, newCfg.SidebarLayout.Right)
		}
		if nextBackend != startBackend {
			return fmt.Sprintf("config reloaded (theme=%s, locale=%s); backend changed — restart to apply", nextTheme, nextLocale), nil
		}
		return fmt.Sprintf("config reloaded (theme=%s, locale=%s, voice=%t)", nextTheme, nextLocale, nextVoice != ""), nil
	}
}
