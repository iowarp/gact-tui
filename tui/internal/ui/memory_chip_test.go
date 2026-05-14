package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CLIO-BBBBBBBBBB4: the footer shows a `cache <pct>%` chip when the
// backend advertises capabilities.memory AND memoryStats has at
// least one hit-or-miss recorded.
func TestFooter_MemoryChip_RendersWhenCapAndStats(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 160
	a.caps.Capabilities.Memory = true
	a.memoryStats = gact.MemoryStats{
		Cache: gact.CacheStats{
			Hits:    80,
			Misses:  20,
			HitRate: 0.80,
			Capacity: 1000,
		},
	}

	got := stripANSI(a.renderFooter())
	if !strings.Contains(got, "cache") {
		t.Errorf("footer should contain 'cache' label; got:\n%s", got)
	}
	if !strings.Contains(got, "80%") {
		t.Errorf("footer should contain '80%%' hit-rate readout; got:\n%s", got)
	}
}

// CLIO-BBBBBBBBBB4: v0.1 backends (capabilities.memory = false) see
// no chip.
func TestFooter_MemoryChip_HiddenWhenCapFalse(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 160
	a.caps.Capabilities.Memory = false
	a.memoryStats = gact.MemoryStats{
		Cache: gact.CacheStats{Hits: 80, Misses: 20, HitRate: 0.80},
	}

	got := stripANSI(a.renderFooter())
	if strings.Contains(got, "cache") {
		t.Errorf("v0.1 backend should NOT show memory chip; got:\n%s", got)
	}
}

// CLIO-BBBBBBBBBB4: zero-stats (fresh session before first fetch)
// hides the chip even when the capability is on.
func TestFooter_MemoryChip_HiddenWithZeroStats(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 160
	a.caps.Capabilities.Memory = true
	// memoryStats zero-value (no hits, no misses).

	got := stripANSI(a.renderFooter())
	if strings.Contains(got, "cache") {
		t.Errorf("zero stats should hide the chip; got:\n%s", got)
	}
}
