package ui

// command_palette_matches.go computes filtered/visible palette command matches and group navigation.

import (
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (p *commandPaletteComponent) matches() []gact.Command {
	// MMM8b: merge plugin commands in alongside the backend-provided
	// commands. Plugin commands get source="plugin" so the dispatch
	// branch can short-circuit before runCommandCmd.
	all := make([]gact.Command, 0, len(p.commands)+len(p.plugins)+8)
	all = append(all, p.commands...)
	for _, pc := range p.plugins {
		all = append(all, gact.Command{
			ID:          pc.ID,
			Title:       pc.Title,
			Description: pc.Description,
			Source:      "plugin",
		})
	}
	// Built-in local commands always show, independent of whether
	// the backend advertises /v1/commands. Skipped for commands the
	// current backend's capabilities don't support (/doctor for
	// backends that don't advertise integration_health, etc.) so
	// the user doesn't see greyed-out entries they can't actually
	// run.
	seen := map[string]bool{}
	for _, c := range all {
		seen[c.ID] = true
	}
	// Built-in commands offered in the palette. Capability-gated entries
	// are filtered through help.commandSupported (the single source of
	// truth shared with the help cheatsheet) so unsupported surfaces are
	// simply not shown rather than offered-then-rejected with a transient
	// "unsupported by this backend" hint.
	for _, c := range p.builtinCommands() {
		if !p.app.help.commandSupported(c.ID) {
			continue
		}
		if !seen[c.ID] {
			all = append(all, c)
			seen[c.ID] = true
		}
	}
	// Final safety net: drop any command (backend-advertised, plugin, or
	// builtin) whose capability flag is absent, so help.commandSupported is
	// the single source of truth across every palette source. Commands
	// without a clear cap gate default to supported.
	filtered := all[:0]
	for _, c := range all {
		if p.app.help.commandSupported(c.ID) {
			filtered = append(filtered, c)
		}
	}
	all = filtered
	all = p.normalizeBuiltinCommandCopy(all)
	if p.paletteFilter == "" {
		return all
	}
	needle := strings.ToLower(p.paletteFilter)
	out := make([]gact.Command, 0, len(all))
	byID := make(map[string]gact.Command, len(all))
	added := make(map[string]bool, len(all))
	for _, c := range all {
		byID[strings.ToLower(strings.TrimSpace(c.ID))] = c
	}
	for _, c := range all {
		hay := strings.ToLower(c.ID + " " + c.Title + " " + c.Description)
		if strings.Contains(hay, needle) {
			if paletteCommandSecondaryTarget(c.ID) != "" {
				continue
			}
			key := strings.ToLower(strings.TrimSpace(c.ID))
			if added[key] {
				continue
			}
			out = append(out, c)
			added[key] = true
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return paletteExactCommandMatch(out[i].ID, needle) && !paletteExactCommandMatch(out[j].ID, needle)
	})
	return out
}

func paletteExactCommandMatch(id, filter string) bool {
	id = strings.ToLower(strings.TrimSpace(id))
	filter = strings.ToLower(strings.TrimSpace(filter))
	if id == "" || filter == "" {
		return false
	}
	return id == filter || strings.TrimPrefix(id, "/") == strings.TrimPrefix(filter, "/")
}

func (p *commandPaletteComponent) visibleMatches() []gact.Command {
	matches := p.matches()
	if strings.TrimSpace(p.paletteFilter) != "" {
		return matches
	}
	seen := map[string]bool{}
	for _, c := range matches {
		seen[c.ID] = true
	}
	out := make([]gact.Command, 0, len(matches))
	for _, c := range matches {
		if paletteCommandIsDefaultHiddenAlias(c.ID, seen) {
			continue
		}
		if p.paletteGroup != "" && paletteCommandGroup(c) != p.paletteGroup {
			continue
		}
		out = append(out, c)
	}
	sort.SliceStable(out, func(i, j int) bool {
		leftGroup := paletteCommandGroup(out[i])
		rightGroup := paletteCommandGroup(out[j])
		left := paletteCommandGroupRank(leftGroup)
		right := paletteCommandGroupRank(rightGroup)
		if left != right {
			return left < right
		}
		leftExample := paletteCommandGroupExampleRank(leftGroup, out[i].ID)
		rightExample := paletteCommandGroupExampleRank(rightGroup, out[j].ID)
		if leftExample != rightExample {
			return leftExample < rightExample
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func (p *commandPaletteComponent) availableGroups() []string {
	matches := p.matches()
	seenIDs := map[string]bool{}
	for _, c := range matches {
		seenIDs[c.ID] = true
	}
	seenGroups := map[string]bool{}
	groups := make([]string, 0, 8)
	for _, c := range matches {
		if paletteCommandIsDefaultHiddenAlias(c.ID, seenIDs) {
			continue
		}
		group := paletteCommandGroup(c)
		if seenGroups[group] {
			continue
		}
		seenGroups[group] = true
		groups = append(groups, group)
	}
	sort.SliceStable(groups, func(i, j int) bool {
		left := paletteCommandGroupRank(groups[i])
		right := paletteCommandGroupRank(groups[j])
		if left != right {
			return left < right
		}
		return groups[i] < groups[j]
	})
	return groups
}

func (p *commandPaletteComponent) selectNextGroup(delta int) {
	groups := append([]string{""}, p.availableGroups()...)
	if len(groups) == 0 {
		p.paletteGroup = ""
		p.paletteSel = 0
		return
	}
	cur := 0
	for i, group := range groups {
		if group == p.paletteGroup {
			cur = i
			break
		}
	}
	next := (cur + delta) % len(groups)
	if next < 0 {
		next += len(groups)
	}
	p.paletteGroup = groups[next]
	p.paletteSel = 0
}

func paletteCommandIsDefaultHiddenAlias(id string, seen map[string]bool) bool {
	if target := paletteCommandSecondaryTarget(id); target != "" {
		if paletteCommandAliasTarget(id) != "" {
			return true
		}
		return seen[target]
	}
	return false
}
