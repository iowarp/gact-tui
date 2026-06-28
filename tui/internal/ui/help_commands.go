package ui

// help_commands.go builds help-modal command entries and tests command support.

import (
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

type helpCommandEntry struct {
	key   string
	desc  string
	group string
	idx   int
}

type helpCommandGroup struct {
	group string
	rows  []helpCommandEntry
}

func (m *helpModal) commandEntries(keys []helpKey) []helpCommandEntry {
	entries := make([]helpCommandEntry, 0, len(keys))
	for i, kp := range keys {
		key := strings.TrimSpace(kp.key)
		if key == "" {
			continue
		}
		if !m.commandSupported(key) {
			continue
		}
		entries = append(entries, helpCommandEntry{
			key:   key,
			desc:  m.app.localizer.t(kp.descID, nil),
			group: paletteCommandGroup(gact.Command{ID: key, Source: "builtin"}),
			idx:   i,
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		leftRank := paletteCommandGroupRank(entries[i].group)
		rightRank := paletteCommandGroupRank(entries[j].group)
		if leftRank != rightRank {
			return leftRank < rightRank
		}
		leftExample := paletteCommandGroupExampleRank(entries[i].group, entries[i].key)
		rightExample := paletteCommandGroupExampleRank(entries[j].group, entries[j].key)
		if leftExample != rightExample {
			return leftExample < rightExample
		}
		return entries[i].idx < entries[j].idx
	})
	return entries
}

// commandSupported is the single source of truth for whether a
// capability-gated slash command should be OFFERED to the user. Both the
// help/cheatsheet command list and the slash palette filter through it.
func (m *helpModal) commandSupported(id string) bool {
	a := m.app
	switch strings.ToLower(strings.TrimSpace(id)) {
	case "/prompts":
		return a.session.caps.Capabilities.XClioPromptRegistry
	case "/expert-packs":
		return a.session.caps.Capabilities.XClioExpertPacks
	case "/agent-blueprints":
		return a.session.caps.Capabilities.XClioAgentBlueprints
	case "/doctor":
		return a.session.caps.Capabilities.IntegrationHealth
	case "/memory":
		return a.session.caps.Capabilities.Memory
	case "/skills":
		return a.session.caps.Capabilities.SkillsExtraction
	default:
		return true
	}
}
