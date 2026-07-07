package cli

import (
	"encoding/json"
	"flag"
	"fmt"
	"image/color"
	"os"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
	"github.com/JaimeCernuda/gact-tui/tui/internal/plugins"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui"
)

// runTheme dispatches `gact theme <verb>`. Verbs: `show`, `list`.
// Theme picking still lives in Settings > Theme tab; this is the
// CLI inspection surface. (GGGG1, HHHH1)
func runTheme(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact theme show [--name dark|light|...]")
		fmt.Fprintln(os.Stderr, "       gact theme list")
		return 2
	}
	verb := args[0]
	switch verb {
	case "show":
		// fall through to historical show path below
	case "list":
		return runThemeList(args[1:])
	case "set":
		return runThemeSet(args[1:])
	default:
		fmt.Fprintf(os.Stderr, "gact theme: unknown verb %q (want show|list|set)\n", verb)
		return 2
	}
	rest := args[1:]
	fs := flag.NewFlagSet("theme show", flag.ContinueOnError)
	name := fs.String("name", "", "theme name to show (default: resolved active theme)")
	if err := fs.Parse(reorderFlagsFirst(rest, map[string]bool{"--name": true, "-name": true})); err != nil {
		return 2
	}
	cfg, _, _ := config.Load()
	resolved := *name
	if resolved == "" {
		resolved = config.Resolve(cfg.Theme, os.Getenv("GACT_THEME"), "", defaultTheme)
	}
	mode := ui.ParseThemeMode(resolved)
	theme := ui.ThemeForMode(mode)

	rows := [][2]string{
		{"name", ui.ThemeModeName(mode)},
	}
	add := func(k string, c color.Color) {
		rows = append(rows, [2]string{k, hexOfColor(c)})
	}
	add("bg", theme.Bg)
	add("bg_subtle", theme.BgSubtle)
	add("fg", theme.Fg)
	add("fg_muted", theme.FgMuted)
	add("fg_faint", theme.FgFaint)
	add("primary", theme.Primary)
	add("secondary", theme.Secondary)
	add("success", theme.Success)
	add("warning", theme.Warning)
	add("danger", theme.Danger)
	add("border", theme.Border)
	add("border_focus", theme.BorderFocus)
	add("role_user", theme.RoleUser)
	add("role_assistant", theme.RoleAssistant)
	add("role_system", theme.RoleSystem)
	add("role_tool", theme.RoleTool)
	for _, r := range rows {
		fmt.Printf("%s\t%s\n", r[0], r[1])
	}
	return 0
}

// hexOfColor returns the canonical "#RRGGBB" form of a color.Color
// (handles lipgloss.Color hex strings + RGBA fallback). Used by
// `gact theme show`.
func hexOfColor(c color.Color) string {
	r, g, b, _ := c.RGBA()
	return fmt.Sprintf("#%02X%02X%02X", r>>8, g>>8, b>>8)
}

// runThemeSet writes the chosen theme name to config.json so it
// survives across runs. Validates against ui.AllThemeModes (rejects
// unknown names with exit 2). Does not touch GACT_THEME — env still
// wins at resolution time, by design. (IIII1)
func runThemeSet(args []string) int {
	if len(args) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact theme set <name>")
		return 2
	}
	want := args[0]
	valid := false
	for _, m := range ui.AllThemeModes {
		if ui.ThemeModeName(m) == want {
			valid = true
			break
		}
	}
	if !valid {
		fmt.Fprintf(os.Stderr, "gact theme set: unknown theme %q\n", want)
		fmt.Fprintln(os.Stderr, "(see `gact theme list`)")
		return 2
	}
	cfg, path, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact theme set: load config: %v\n", err)
		return 1
	}
	if path == "" {
		// no config file resolved — fall back to default.
		p, derr := config.DefaultPath()
		if derr != nil {
			fmt.Fprintf(os.Stderr, "gact theme set: resolve config path: %v\n", derr)
			return 1
		}
		path = p
	}
	cfg.Theme = &want
	if err := config.Save(cfg, path); err != nil {
		fmt.Fprintf(os.Stderr, "gact theme set: write %s: %v\n", path, err)
		return 1
	}
	fmt.Printf("theme=%s saved to %s\n", want, path)
	return 0
}

// runThemeList prints all known theme names + a marker on the active
// one. Useful for shell completions and `gact theme show` discovery.
// (HHHH1)
func runThemeList(args []string) int {
	if len(args) > 0 {
		fmt.Fprintln(os.Stderr, "usage: gact theme list")
		return 2
	}
	cfg, _, _ := config.Load()
	resolved := config.Resolve(cfg.Theme, os.Getenv("GACT_THEME"), "", defaultTheme)
	active := ui.ParseThemeMode(resolved)
	for _, m := range ui.AllThemeModes {
		marker := ""
		if m == active {
			marker = "\t*"
		}
		fmt.Printf("%s%s\n", ui.ThemeModeName(m), marker)
	}
	return 0
}

// runEnv prints the fully-resolved configuration the binary will
// use. Pure local — no network calls. Useful debugging aid and
// pairs with `gact diag` (which exercises the backend side).
// Output is TSV `KEY<TAB>VALUE` for easy diff between hosts. (DDDD1)
func runEnv(args []string) int {
	fs := flag.NewFlagSet("env", flag.ContinueOnError)
	// MMMMM1: --format json emits a single object with the resolved
	// config + the GACT_* env snapshot. Default tsv kept for back-
	// compat with existing scripting callers + `gact diag` users.
	format := fs.String("format", "tsv", "tsv | json")
	known := map[string]bool{"--format": true, "-format": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact env: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	cfg, cfgPath, _ := config.Load()
	pluginsDir, _ := plugins.DefaultDir()
	resolved := func(field *string, env, fallback string) string {
		if v := os.Getenv(env); v != "" {
			return v
		}
		if field != nil && *field != "" {
			return *field
		}
		return fallback
	}
	pairs := [][2]string{
		{"BACKEND_URL", resolved(cfg.BackendURL, "GACT_BACKEND", defaultBackend)},
		{"THEME", resolved(cfg.Theme, "GACT_THEME", defaultTheme)},
		{"LOCALE", resolved(cfg.Locale, "GACT_LOCALE", "en")},
		{"VOICE_CMD", resolved(cfg.VoiceCommand, "GACT_VOICE_CMD", "")},
		{"INTRO_FILE", resolved(cfg.IntroFile, "GACT_INTRO_FILE", "")},
		{"CONFIG_PATH", cfgPath},
		{"PLUGINS_DIR", pluginsDir},
	}
	envSnap := map[string]string{}
	for _, e := range os.Environ() {
		if !strings.HasPrefix(e, "GACT_") {
			continue
		}
		if eq := strings.IndexByte(e, '='); eq >= 0 {
			envSnap[e[:eq]] = e[eq+1:]
		}
	}
	if *format == "json" {
		out := map[string]any{}
		for _, p := range pairs {
			out[strings.ToLower(p[0])] = p[1]
		}
		out["env"] = envSnap
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(out); err != nil {
			fmt.Fprintf(os.Stderr, "gact env: encode: %v\n", err)
			return 1
		}
		return 0
	}
	for _, p := range pairs {
		fmt.Printf("%s\t%s\n", p[0], p[1])
	}
	// All GACT_* env vars (snapshot — useful for "is this even
	// reaching the binary?" checks).
	fmt.Println("--- ENV ---")
	for _, e := range os.Environ() {
		if strings.HasPrefix(e, "GACT_") {
			fmt.Println(e)
		}
	}
	return 0
}
