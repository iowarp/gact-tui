package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CLIO-BBBBBBBBBB4: the footer shows an ARC memory hit-rate chip when the
// backend advertises capabilities.memory AND memoryStats has at
// least one hit-or-miss recorded.
func TestFooter_MemoryChip_RendersWhenCapAndStats(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 160
	a.session.caps.Capabilities.Memory = true
	a.session.memoryStats = gact.MemoryStats{
		Cache: gact.CacheStats{
			Hits:     80,
			Misses:   20,
			HitRate:  0.80,
			Capacity: 1000,
		},
	}

	got := stripANSI(a.chrome.renderFooter())
	if !strings.Contains(got, "ARC hit") {
		t.Errorf("footer should contain ARC hit label; got:\n%s", got)
	}
	if !strings.Contains(got, "80%") {
		t.Errorf("footer should contain '80%%' hit-rate readout; got:\n%s", got)
	}
}

func TestFooter_MemoryChipUsesSemanticHitTarget(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 180
	a.height = 30
	a.session.caps.Capabilities.Memory = true
	a.session.memoryStats = gact.MemoryStats{
		Cache: gact.CacheStats{
			Hits:    80,
			Misses:  20,
			HitRate: 0.80,
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "footer:memory")
	if !ok {
		t.Fatal("missing semantic memory footer target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd == nil {
		t.Fatal("memory footer click should dispatch memory inspector load command")
	}
	if a.detail.visible {
		t.Fatal("memory footer click should wait for async inspector result before opening detail")
	}
}

// CLIO-BBBBBBBBBB4: v0.1 backends (capabilities.memory = false) see
// no chip.
func TestFooter_MemoryChip_HiddenWhenCapFalse(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 160
	a.session.caps.Capabilities.Memory = false
	a.session.memoryStats = gact.MemoryStats{
		Cache: gact.CacheStats{Hits: 80, Misses: 20, HitRate: 0.80},
	}

	got := stripANSI(a.chrome.renderFooter())
	if strings.Contains(got, "cache") {
		t.Errorf("v0.1 backend should NOT show memory chip; got:\n%s", got)
	}
}

// CLIO-BBBBBBBBBB4: zero-stats (fresh session before first fetch)
// hides the chip even when the capability is on.
func TestFooter_MemoryChip_HiddenWithZeroStats(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 160
	a.session.caps.Capabilities.Memory = true
	// memoryStats zero-value (no hits, no misses).

	got := stripANSI(a.chrome.renderFooter())
	if strings.Contains(got, "cache") {
		t.Errorf("zero stats should hide the chip; got:\n%s", got)
	}
}

func TestFooter_ContextHintsChangeByFocus(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 180

	a.focus = FocusSidebar
	sidebar := stripANSI(a.chrome.renderFooter())
	for _, want := range []string{"Enter open", "e rename", "x delete", "c children"} {
		if !strings.Contains(sidebar, want) {
			t.Fatalf("sidebar footer missing %q:\n%s", want, sidebar)
		}
	}

	a.focus = FocusBody
	body := stripANSI(a.chrome.renderFooter())
	for _, want := range []string{"Enter/Ctrl+E details", "y copy", "G bottom"} {
		if !strings.Contains(body, want) {
			t.Fatalf("conversation footer missing %q:\n%s", want, body)
		}
	}

	a.focus = FocusInput
	input := stripANSI(a.chrome.renderFooter())
	for _, want := range []string{"Enter send", "\\+Enter newline", "Ctrl+G compose"} {
		if !strings.Contains(input, want) {
			t.Fatalf("input footer missing %q:\n%s", want, input)
		}
	}
}

func TestPaletteMemoryCommandLoadsInspectorWhenSupported(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.Memory = true
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "/memory"

	_, cmd := a.cmdPalette.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if cmd == nil {
		t.Fatal("/memory should load the memory inspector when capabilities.memory is true")
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("/memory should close the command palette before opening detail")
	}
}

func TestStandaloneMemoryDetailLoadedOpensInspector(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = false

	model, _ := a.Update(catalogDetailLoadedMsg{
		title:      "Memory · context",
		text:       "ARC cache\nhits: 1",
		standalone: true,
	})
	got := model.(*App)

	if !got.detail.visible || got.detail.ref == nil {
		t.Fatal("standalone memory detail should open detail view")
	}
	if got.detail.ref.title != "Memory · context" {
		t.Fatalf("detail title = %q, want memory inspector title", got.detail.ref.title)
	}
}

func TestPaletteMemoryFilterPrioritizesExactCommand(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.Memory = true
	a.cmdPalette.commands = []gact.Command{
		{ID: "/clear", Title: "Clear session messages", Description: "clear memory-like transcript text"},
		{ID: "/memory", Title: "Memory", Description: "inspect retained memory and context"},
	}
	a.cmdPalette.paletteFilter = "memory"

	matches := a.cmdPalette.matches()
	if len(matches) == 0 || matches[0].ID != "/memory" {
		t.Fatalf("exact /memory match should be first, got %#v", matches)
	}
}

// TestPaletteMemoryCommandHiddenWhenUnsupported asserts the hide-when-
// unsupported contract: a backend that does not advertise the memory
// capability must not offer /memory in the palette at all (rather than
// offering it and flashing an "unsupported by this backend" hint on
// invocation). The transient-hint dispatch path remains as a defensive
// fallback for a direct keybind but is unreachable from the palette.
func TestPaletteMemoryCommandHiddenWhenUnsupported(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.Memory = false
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "/memory"

	for _, cmd := range a.cmdPalette.matches() {
		if cmd.ID == "/memory" {
			t.Fatalf("unsupported /memory should be hidden from the palette, got %#v", cmd)
		}
	}
}

func TestPaletteMemoryCommandShowsCapabilityStatusWhenSupported(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.caps.Capabilities.Memory = false
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = "memory"

	out := ansi.Strip(a.cmdPalette.view())
	if strings.Contains(out, "/memory") {
		t.Fatalf("palette should hide memory command when unsupported:\n%s", out)
	}

	a.session.caps.Capabilities.Memory = true
	out = ansi.Strip(a.cmdPalette.view())
	if !strings.Contains(out, "/memory") {
		t.Fatalf("palette should surface memory command when supported:\n%s", out)
	}
	if !strings.Contains(out, "[retained context]") {
		t.Fatalf("palette should mark supported memory command with purpose:\n%s", out)
	}
}

func TestFooter_NarrowKeepsQuitVisible(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 100
	a.focus = FocusInput

	got := stripANSI(a.chrome.renderFooter())
	if !strings.Contains(got, "Ctrl+C quit") {
		t.Fatalf("narrow footer should keep quit visible:\n%s", got)
	}
	if strings.Contains(got, "compose") {
		t.Fatalf("narrow footer should drop low-priority compose hint:\n%s", got)
	}
}

func TestFooter_SidebarWithMemoryChipKeepsHelpAndQuitVisible(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.focus = FocusSidebar
	a.session.caps.Capabilities.Memory = true
	a.session.memoryStats = gact.MemoryStats{
		Cache: gact.CacheStats{Hits: 99, Misses: 64, HitRate: 0.607},
	}

	got := stripANSI(a.chrome.renderFooter())
	for _, want := range []string{"? help", "Ctrl+C quit", "ARC hit"} {
		if !strings.Contains(got, want) {
			t.Fatalf("footer should keep %q visible with right-side chips:\n%s", want, got)
		}
	}
	if strings.Contains(got, "o add context") {
		t.Fatalf("footer should drop low-priority sidebar hints before help/quit:\n%s", got)
	}
}
