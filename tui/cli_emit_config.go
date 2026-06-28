package main

import (
	"encoding/json"
	"fmt"

	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runEmitConfig prints a sample config.json to stdout so users have a
// starting point for customisation. Shows every field with its default
// value — JSON doesn't allow comments, so the field names themselves
// serve as documentation. Users redirect to the canonical path:
//
//	gact emit-config > ~/.config/gact/config.json
func runEmitConfig() {
	bk := "http://localhost:7777"
	th := "dark"
	locale := "en"
	vc := ""
	defaultBlueprint := ""
	defaultExpertPack := ""
	ct := 5
	cw := 100_000
	cd := 150_000
	pt := 3
	ifd := 90
	mouse := true
	sample := config.Config{
		BackendURL:             &bk,
		Theme:                  &th,
		Locale:                 &locale,
		VoiceCommand:           &vc,
		DefaultBlueprint:       &defaultBlueprint,
		DefaultExpertPack:      &defaultExpertPack,
		CollapseThreshold:      &ct,
		CostWarnTokens:         &cw,
		CostDangerTokens:       &cd,
		SidebarLayout:          &config.SidebarLayout{Left: []string{"sessions", "context"}},
		PasteCompressThreshold: &pt,
		IntroFrameDelayMs:      &ifd,
		MouseEnabled:           &mouse,
	}
	buf, _ := json.MarshalIndent(sample, "", "  ")
	fmt.Println(string(buf))
}
