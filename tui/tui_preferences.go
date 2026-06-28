package main

import (
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui"
)

func applyStartupPreferences(app *ui.App, cfg config.Config, noIntro bool, introFile string) {
	if cfg.DefaultBlueprint != nil {
		app.DefaultAgentBlueprintID = strings.TrimSpace(*cfg.DefaultBlueprint)
	}
	if cfg.DefaultExpertPack != nil {
		app.DefaultExpertPackID = strings.TrimSpace(*cfg.DefaultExpertPack)
	}
	if cfg.CollapseThreshold != nil && *cfg.CollapseThreshold > 0 {
		app.Theme.CollapseThreshold = *cfg.CollapseThreshold
	}
	if cfg.CostWarnTokens != nil && *cfg.CostWarnTokens > 0 {
		app.Theme.CostWarnTokens = *cfg.CostWarnTokens
	}
	if cfg.CostDangerTokens != nil && *cfg.CostDangerTokens > 0 {
		app.Theme.CostDangerTokens = *cfg.CostDangerTokens
	}
	if cfg.PasteCompressThreshold != nil && *cfg.PasteCompressThreshold > 0 {
		app.Theme.PasteCompressThreshold = *cfg.PasteCompressThreshold
	}
	if cfg.MouseEnabled != nil {
		app.MouseEnabled = *cfg.MouseEnabled
	}
	if cfg.SidebarLayout != nil && (len(cfg.SidebarLayout.Left) > 0 || len(cfg.SidebarLayout.Right) > 0) {
		app.SetSidebarLayout(cfg.SidebarLayout.Left, cfg.SidebarLayout.Right)
	}
	if cfg.IntroFrameDelayMs != nil && *cfg.IntroFrameDelayMs > 0 {
		app.IntroFrameDelay = time.Duration(*cfg.IntroFrameDelayMs) * time.Millisecond
	}
	if len(cfg.DisabledTools) > 0 {
		app.SetDisabledTools(cfg.DisabledTools)
	}

	skipIntro := noIntro
	if !skipIntro && os.Getenv("GACT_NO_INTRO") != "" {
		skipIntro = true
	}
	if !skipIntro && cfg.IntroSkip != nil && *cfg.IntroSkip {
		skipIntro = true
	}
	if !skipIntro {
		app.EnableIntro()
	}
	app.IntroDisabled = skipIntro

	finalIntroFile := introFile
	if finalIntroFile == "" {
		finalIntroFile = os.Getenv("GACT_INTRO_FILE")
	}
	if finalIntroFile == "" && cfg.IntroFile != nil {
		finalIntroFile = *cfg.IntroFile
	}
	if finalIntroFile != "" {
		_ = app.SetIntroFromFile(finalIntroFile)
	}
}
