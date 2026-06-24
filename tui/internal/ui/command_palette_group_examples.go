package ui

// command_palette_group_examples.go computes palette command group counts and per-group example commands.

import (
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func paletteCommandGroupCounts(commands []gact.Command) map[string]int {
	counts := make(map[string]int, 8)
	for _, c := range commands {
		counts[paletteCommandGroup(c)]++
	}
	return counts
}

func paletteCommandGroupExamples(commands []gact.Command, maxPerGroup int) map[string][]string {
	examples := make(map[string][]string, 8)
	if maxPerGroup <= 0 {
		return examples
	}
	seenIDs := map[string]bool{}
	for _, c := range commands {
		id := strings.TrimSpace(c.ID)
		if id != "" {
			seenIDs[id] = true
		}
	}
	byGroup := make(map[string][]gact.Command, 8)
	for _, c := range commands {
		if paletteCommandIsExampleHiddenAlias(c.ID, seenIDs) {
			continue
		}
		group := paletteCommandGroup(c)
		byGroup[group] = append(byGroup[group], c)
	}
	for group, groupCommands := range byGroup {
		sort.SliceStable(groupCommands, func(i, j int) bool {
			left := paletteCommandGroupExampleRank(group, groupCommands[i].ID)
			right := paletteCommandGroupExampleRank(group, groupCommands[j].ID)
			if left != right {
				return left < right
			}
			return groupCommands[i].ID < groupCommands[j].ID
		})
		for _, c := range groupCommands {
			if len(examples[group]) >= maxPerGroup {
				break
			}
			id := strings.TrimSpace(c.ID)
			if id == "" {
				continue
			}
			examples[group] = append(examples[group], id)
		}
	}
	return examples
}

func paletteCommandIsExampleHiddenAlias(id string, seen map[string]bool) bool {
	if paletteCommandAliasTarget(id) != "" {
		return true
	}
	return paletteCommandIsDefaultHiddenAlias(id, seen)
}

func paletteCommandGroupExampleRank(group string, id string) int {
	id = strings.ToLower(strings.TrimSpace(id))
	preferred := map[string][]string{
		"Session":            {"/clear", "/copy", "/new"},
		"Workspace":          {"/diff", "/add", "/drop"},
		"Runtime":            {"/tools", "/mcp", "/prompts"},
		"Experts":            {"/agent-blueprints", "/experts", "/expert-packs"},
		"Settings":           {"/theme", "/agent", "/model"},
		"Diagnostics":        {"/doctor", "/permissions", "/metrics"},
		"Workflow Commands":  {"/validate-dataset"},
		"Extension Commands": {"/custom"},
	}
	for rank, candidate := range preferred[group] {
		if id == candidate {
			return rank
		}
	}
	return 1000
}
