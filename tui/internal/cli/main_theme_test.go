package cli

import (
	"os"
	"strings"
	"testing"
)

// TestCLI_ThemeShow covers GGGG1: `gact theme show` prints the active
// palette as TSV. Resolution honors --name and GACT_THEME. Pure local
// - no emulator.
func TestCLI_ThemeShow(t *testing.T) {
	bin := buildGact(t)
	// Default: env override wins.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_THEME": "dracula"},
		"theme", "show")
	if code != 0 {
		t.Fatalf("theme show: exit %d", code)
	}
	if !strings.Contains(stdout, "name\tdracula") {
		t.Errorf("expected name\\tdracula row, got: %q", stdout)
	}
	for _, k := range []string{"bg\t#", "fg\t#", "primary\t#", "role_user\t#"} {
		if !strings.Contains(stdout, k) {
			t.Errorf("expected row prefix %q, got: %q", k, stdout)
		}
	}
	// --name flag overrides env.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_THEME": "dracula"},
		"theme", "show", "--name", "light")
	if code != 0 {
		t.Fatalf("theme show --name light: exit %d", code)
	}
	if !strings.Contains(stdout, "name\tlight") {
		t.Errorf("expected --name to override env, got: %q", stdout)
	}
	// Unknown verb is a usage error.
	if _, _, code := runGact(t, bin, nil, "theme", "wat"); code != 2 {
		t.Errorf("theme wat: want exit 2, got %d", code)
	}
}

// TestCLI_ThemeList covers HHHH1: `gact theme list` enumerates the
// known palettes and marks the resolved active one with `\t*`.
func TestCLI_ThemeList(t *testing.T) {
	bin := buildGact(t)
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_THEME": "nord"},
		"theme", "list")
	if code != 0 {
		t.Fatalf("theme list: exit %d", code)
	}
	for _, name := range []string{"dark", "light", "dracula", "nord", "tokyo-night"} {
		if !strings.Contains(stdout, name) {
			t.Errorf("expected %q in output, got: %q", name, stdout)
		}
	}
	// Active marker must be on the resolved theme line.
	if !strings.Contains(stdout, "nord\t*") {
		t.Errorf("expected 'nord\\t*' active marker, got: %q", stdout)
	}
	// And only one star total.
	if got := strings.Count(stdout, "*"); got != 1 {
		t.Errorf("expected exactly one '*' marker, got %d in: %q", got, stdout)
	}
	// Extra args -> usage error.
	if _, _, code := runGact(t, bin, nil, "theme", "list", "extra"); code != 2 {
		t.Errorf("theme list extra: want exit 2, got %d", code)
	}
}

// TestCLI_ThemeSet covers IIII1: `gact theme set <name>` writes the
// chosen theme to config.json; unknown names exit 2 without touching
// the file. Uses a per-test XDG_CONFIG_HOME so we don't smear into
// the real user config.
func TestCLI_ThemeSet(t *testing.T) {
	bin := buildGact(t)
	tmp := t.TempDir()
	env := map[string]string{"XDG_CONFIG_HOME": tmp}

	// Happy path: write nord.
	stdout, _, code := runGact(t, bin, env, "theme", "set", "nord")
	if code != 0 {
		t.Fatalf("theme set nord: exit %d", code)
	}
	if !strings.Contains(stdout, "theme=nord saved to") {
		t.Errorf("expected save confirmation, got: %q", stdout)
	}
	cfgPath := tmp + "/gact/config.json"
	body, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if !strings.Contains(string(body), `"theme": "nord"`) {
		t.Errorf("expected theme=nord in config, got: %s", body)
	}
	// theme list should now mark nord as active when reading from
	// the same XDG dir.
	stdout, _, code = runGact(t, bin, env, "theme", "list")
	if code != 0 {
		t.Fatalf("theme list: exit %d", code)
	}
	if !strings.Contains(stdout, "nord\t*") {
		t.Errorf("expected list to mark nord active, got: %q", stdout)
	}
	// Unknown theme: exit 2, file unchanged.
	bodyBefore, _ := os.ReadFile(cfgPath)
	if _, _, code := runGact(t, bin, env, "theme", "set", "nonsense"); code != 2 {
		t.Errorf("theme set nonsense: want exit 2, got %d", code)
	}
	bodyAfter, _ := os.ReadFile(cfgPath)
	if string(bodyBefore) != string(bodyAfter) {
		t.Errorf("config mutated on rejected theme: before=%q after=%q",
			bodyBefore, bodyAfter)
	}
	// Wrong arity: exit 2.
	if _, _, code := runGact(t, bin, env, "theme", "set"); code != 2 {
		t.Errorf("theme set (no arg): want exit 2, got %d", code)
	}
}
