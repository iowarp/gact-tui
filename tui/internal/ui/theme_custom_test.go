package ui

import (
	"os"
	"path/filepath"
	"testing"
)

// TestLoadCustomTheme_EndToEnd writes a minimal theme.json, loads it,
// and verifies that AllThemeModes grew to include ModeCustom, the
// registry returns the same palette, and ThemeModeFor round-trips.
func TestLoadCustomTheme_EndToEnd(t *testing.T) {
	resetCustomThemeForTest(t)

	dir := t.TempDir()
	path := filepath.Join(dir, "theme.json")
	doc := `{
		"name": "neon",
		"bg": "#100020",
		"fg": "#EEFFEE",
		"primary": "#FF00FF",
		"warning": "#FFFF00"
	}`
	if err := os.WriteFile(path, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}

	name, err := LoadCustomTheme(path)
	if err != nil {
		t.Fatalf("LoadCustomTheme: %v", err)
	}
	if name != "neon" {
		t.Errorf("name = %q, want 'neon'", name)
	}
	if !IsCustomThemeAvailable() {
		t.Fatalf("registry not set after load")
	}

	// ModeCustom now in AllThemeModes.
	sawCustom := false
	for _, m := range AllThemeModes {
		if m == ModeCustom {
			sawCustom = true
			break
		}
	}
	if !sawCustom {
		t.Fatalf("ModeCustom missing from AllThemeModes")
	}

	// ThemeForMode(ModeCustom) returns the loaded palette.
	th := ThemeForMode(ModeCustom)
	r, g, b, _ := th.Bg.RGBA()
	if r != 0x1010 || g != 0x0000 || b != 0x2020 {
		t.Errorf("loaded Bg = %X %X %X, want 10 00 20 (8-bit)", r>>8, g>>8, b>>8)
	}

	// ThemeModeFor round-trips.
	if got := ThemeModeFor(th); got != ModeCustom {
		t.Errorf("round-trip = %d, want ModeCustom", got)
	}
}

// TestLoadCustomTheme_MissingFileNoError keeps startup resilient —
// a missing theme.json should not break LoadCustomTheme.
func TestLoadCustomTheme_MissingFileNoError(t *testing.T) {
	resetCustomThemeForTest(t)

	name, err := LoadCustomTheme(filepath.Join(t.TempDir(), "nope.json"))
	if err != nil {
		t.Fatalf("missing file should be non-fatal, got %v", err)
	}
	if name != "" {
		t.Errorf("name should be empty when file missing, got %q", name)
	}
	if IsCustomThemeAvailable() {
		t.Fatalf("registry should remain unset after missing-file load")
	}
}

// resetCustomThemeForTest clears the package-level custom-theme state
// so each test starts from a clean slate. Cleanup restores the state
// after the test so parallel tests don't interfere.
func resetCustomThemeForTest(t *testing.T) {
	t.Helper()
	prevRegistry := customThemeRegistry
	prevName := customThemeDisplayName
	prevAll := AllThemeModes

	customThemeRegistry = nil
	customThemeDisplayName = "custom"
	// Strip ModeCustom if present.
	out := out(prevAll)
	AllThemeModes = out

	t.Cleanup(func() {
		customThemeRegistry = prevRegistry
		customThemeDisplayName = prevName
		AllThemeModes = prevAll
	})
}

func out(modes []ThemeMode) []ThemeMode {
	filtered := make([]ThemeMode, 0, len(modes))
	for _, m := range modes {
		if m != ModeCustom {
			filtered = append(filtered, m)
		}
	}
	return filtered
}
