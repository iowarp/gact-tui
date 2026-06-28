package ui

import "strings"

func findHitTargetForTest(a *App, id string) (uiHitTarget, bool) {
	if a.interaction.hits == nil {
		return uiHitTarget{}, false
	}
	for _, target := range a.interaction.hits.targets {
		if target.id == id {
			return target, true
		}
	}
	return uiHitTarget{}, false
}

func renderedCellsForTest(line string, x int, width int) string {
	if x < 0 || width < 1 {
		return ""
	}
	cells := []rune(line)
	if x >= len(cells) {
		return ""
	}
	end := x + width
	if end > len(cells) {
		end = len(cells)
	}
	return string(cells[x:end])
}

func findLastHitTargetWithPrefixForTest(a *App, prefix string) (uiHitTarget, bool) {
	if a.interaction.hits == nil {
		return uiHitTarget{}, false
	}
	var got uiHitTarget
	ok := false
	for _, target := range a.interaction.hits.targets {
		if strings.HasPrefix(target.id, prefix) {
			got = target
			ok = true
		}
	}
	return got, ok
}
