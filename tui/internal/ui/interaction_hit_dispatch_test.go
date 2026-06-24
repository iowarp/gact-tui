package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestHitRegistryReturnsTopmostTarget(t *testing.T) {
	var hits uiHitRegistry
	hits.add(uiHitTarget{id: "base", rect: mouseRect{x: 0, y: 0, w: 10, h: 10}, action: func(*App) tea.Cmd { return nil }})
	hits.add(uiHitTarget{id: "modal", rect: mouseRect{x: 2, y: 2, w: 4, h: 4}, action: func(*App) tea.Cmd { return nil }})

	got, ok := hits.at(3, 3)
	if !ok {
		t.Fatal("expected hit")
	}
	if got.id != "modal" {
		t.Fatalf("hit id = %q, want topmost modal", got.id)
	}
}

func TestOverlayHitActivationIgnoresBaseTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	baseHits := 0
	overlayHits := 0
	a.interaction.hits = &uiHitRegistry{}
	a.interaction.hits.add(uiHitTarget{id: "base", rect: mouseRect{x: 0, y: 0, w: 10, h: 10}, action: func(*App) tea.Cmd {
		baseHits++
		return nil
	}})
	a.interaction.baseHitTargetCount = len(a.interaction.hits.targets)

	if _, handled := a.interaction.activateOverlayHitAt(1, 1, tea.MouseLeft); handled {
		t.Fatal("overlay activation should ignore base-only targets")
	}
	if baseHits != 0 {
		t.Fatalf("base target fired through overlay activation: %d", baseHits)
	}

	a.interaction.hits.add(uiHitTarget{id: "overlay", rect: mouseRect{x: 0, y: 0, w: 10, h: 10}, action: func(*App) tea.Cmd {
		overlayHits++
		return nil
	}})
	if _, handled := a.interaction.activateOverlayHitAt(1, 1, tea.MouseLeft); !handled {
		t.Fatal("overlay activation should handle overlay targets")
	}
	if baseHits != 0 || overlayHits != 1 {
		t.Fatalf("baseHits=%d overlayHits=%d, want 0/1", baseHits, overlayHits)
	}
}

func TestOverlayWheelActivationIgnoresBaseTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	baseWheels := 0
	overlayWheels := 0
	a.interaction.hits = &uiHitRegistry{}
	a.interaction.hits.add(uiHitTarget{id: "base", rect: mouseRect{x: 0, y: 0, w: 10, h: 10}, wheelAction: func(*App, tea.MouseButton) tea.Cmd {
		baseWheels++
		return nil
	}})
	a.interaction.baseHitTargetCount = len(a.interaction.hits.targets)

	if _, handled := a.interaction.activateOverlayWheelHitAt(1, 1, tea.MouseWheelDown); handled {
		t.Fatal("overlay wheel activation should ignore base-only targets")
	}
	if baseWheels != 0 {
		t.Fatalf("base wheel target fired through overlay activation: %d", baseWheels)
	}

	a.interaction.hits.add(uiHitTarget{id: "overlay", rect: mouseRect{x: 0, y: 0, w: 10, h: 10}, wheelAction: func(*App, tea.MouseButton) tea.Cmd {
		overlayWheels++
		return nil
	}})
	if _, handled := a.interaction.activateOverlayWheelHitAt(1, 1, tea.MouseWheelDown); !handled {
		t.Fatal("overlay wheel activation should handle overlay targets")
	}
	if baseWheels != 0 || overlayWheels != 1 {
		t.Fatalf("baseWheels=%d overlayWheels=%d, want 0/1", baseWheels, overlayWheels)
	}
}

func TestWheelHitTargetsCanSitBehindRowClickTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.interaction.beginHitFrame()
	wheeled := false
	clicked := false
	a.interaction.registerScreenWheelHit("section:wheel", mouseRect{x: 0, y: 0, w: 10, h: 5}, func(*App, tea.MouseButton) tea.Cmd {
		wheeled = true
		return nil
	})
	a.interaction.registerScreenHit("row:click", mouseRect{x: 0, y: 0, w: 10, h: 1}, func(*App) tea.Cmd {
		clicked = true
		return nil
	})

	if _, handled := a.interaction.activateWheelHitAt(1, 0, tea.MouseWheelDown); !handled {
		t.Fatal("expected wheel hit to activate through overlaid row click target")
	}
	if !wheeled {
		t.Fatal("wheel action did not run")
	}
	if clicked {
		t.Fatal("wheel action should not run click handler")
	}
}
