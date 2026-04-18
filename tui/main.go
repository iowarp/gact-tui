// Command gact is the GACT TUI client.
//
// Subcommands:
//
//	gact                       run the interactive TUI (default)
//	gact export <session_id>   write a session export blob to stdout/file
//	gact import <file|-stdin>  upload a session export blob to the backend
//
// Configuration precedence (lowest → highest): built-in defaults, on-disk
// config file (JSON; see internal/config), env vars (GACT_BACKEND,
// GACT_THEME), CLI flags.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"runtime"
	"runtime/debug"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui"
)

const (
	defaultBackend = "http://localhost:7777"
	defaultTheme   = "dark"
)

func main() {
	// Subcommand dispatch — preserve all flags after the subcommand for
	// the subcommand's own flag set.
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "export":
			os.Exit(runExport(os.Args[2:]))
		case "import":
			os.Exit(runImport(os.Args[2:]))
		case "version", "--version", "-v":
			runVersion()
			return
		case "diag", "--diag":
			runDiag()
			return
		case "emit-config", "--emit-config":
			runEmitConfig()
			return
		case "-h", "--help":
			printUsage()
			return
		}
	}
	runTUI()
}

// runVersion prints binary + contract version and (when available)
// the VCS revision and build time from Go's embedded build info.
// Lets users confirm which commit they're running when filing bugs.
// Falls back to the manual binaryVersion when ReadBuildInfo is empty
// (e.g. tests without a module context).
func runVersion() {
	fmt.Printf("gact %s (contract %s)\n", binaryVersion, contractVersion)
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return
	}
	var rev, when, modified string
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			rev = s.Value
		case "vcs.time":
			when = s.Value
		case "vcs.modified":
			modified = s.Value
		}
	}
	if rev != "" {
		short := rev
		if len(short) > 12 {
			short = short[:12]
		}
		suffix := ""
		if modified == "true" {
			suffix = " (dirty)"
		}
		fmt.Printf("  revision: %s%s\n", short, suffix)
	}
	if when != "" {
		fmt.Printf("  built:    %s\n", when)
	}
	fmt.Printf("  go:       %s\n", info.GoVersion)
}

// runEmitConfig prints a sample config.json to stdout so users have a
// starting point for customisation. Shows every field with its default
// value — JSON doesn't allow comments, so the field names themselves
// serve as documentation. Users redirect to the canonical path:
//
//     gact emit-config > ~/.config/gact/config.json
func runEmitConfig() {
	bk := "http://localhost:7777"
	th := "dark"
	vc := ""
	ct := 5
	cw := 100_000
	cd := 150_000
	sample := config.Config{
		BackendURL:        &bk,
		Theme:             &th,
		VoiceCommand:      &vc,
		CollapseThreshold: &ct,
		CostWarnTokens:    &cw,
		CostDangerTokens:  &cd,
	}
	buf, _ := json.MarshalIndent(sample, "", "  ")
	fmt.Println(string(buf))
}

// runDiag writes a structured diagnostic report to stdout: binary
// version, contract version, Go runtime, resolved config path + its
// fields, resolved theme, and whether a custom theme file was found.
// Non-interactive; exits zero after printing. Useful for bug reports.
func runDiag() {
	fmt.Printf("gact %s\n", binaryVersion)
	fmt.Printf("  contract:   %s\n", contractVersion)
	fmt.Printf("  runtime:    %s\n", runtime.Version())
	fmt.Printf("  platform:   %s/%s\n", runtime.GOOS, runtime.GOARCH)

	cfgPath, err := config.DefaultPath()
	if err != nil {
		fmt.Printf("  config path: (error: %v)\n", err)
	} else {
		fmt.Printf("  config path: %s\n", cfgPath)
	}
	cfg, _, cfgErr := config.Load()
	if cfgErr != nil {
		fmt.Printf("  config load: (error: %v)\n", cfgErr)
	}
	print := func(label string, val *string) {
		if val != nil && *val != "" {
			fmt.Printf("  %s: %s\n", label, *val)
		} else {
			fmt.Printf("  %s: (unset)\n", label)
		}
	}
	print("backend_url", cfg.BackendURL)
	print("theme      ", cfg.Theme)
	print("voice_cmd  ", cfg.VoiceCommand)
	if cfg.CollapseThreshold != nil {
		fmt.Printf("  collapse_threshold: %d\n", *cfg.CollapseThreshold)
	}
	if cfg.CostWarnTokens != nil {
		fmt.Printf("  cost_warn_tokens:   %d\n", *cfg.CostWarnTokens)
	}
	if cfg.CostDangerTokens != nil {
		fmt.Printf("  cost_danger_tokens: %d\n", *cfg.CostDangerTokens)
	}

	// Custom theme file.
	themePath, _ := ui.CustomThemeDefaultPath()
	if themePath != "" {
		if _, err := os.Stat(themePath); err == nil {
			fmt.Printf("  custom theme: %s (present)\n", themePath)
			if _, err := ui.LoadCustomTheme(themePath); err != nil {
				fmt.Printf("    parse error: %v\n", err)
			}
		} else {
			fmt.Printf("  custom theme: %s (not present)\n", themePath)
		}
	}

	// Environment.
	for _, name := range []string{"GACT_BACKEND", "GACT_THEME", "GACT_VOICE_CMD", "GACT_CONFIG", "GACT_THEME_FILE"} {
		if v := os.Getenv(name); v != "" {
			fmt.Printf("  env %s: %s\n", name, v)
		}
	}
}

const (
	// binaryVersion is bumped manually for now. A future enhancement
	// could thread version info from the build via -ldflags.
	binaryVersion   = "0.1.0"
	contractVersion = "0.1"
)

func printUsage() {
	fmt.Println(`gact — GACT TUI client

Usage:
  gact                       run the interactive TUI
  gact export <session_id>   download a session blob (JSON) to stdout
  gact import <file|->       upload a previously-exported session blob
  gact version               print version + contract version
  gact diag                  print environment + config for bug reports
  gact emit-config           print sample config.json to stdout

Common flags (all subcommands):
  --backend URL    GACT backend URL  (env: GACT_BACKEND)
  --theme STR      dark | light      (env: GACT_THEME)

TUI-only flags:
  --voice-cmd STR  shell command that records audio to stdout, run on
                   Ctrl+Y. See scripts/voice-record.sh for an example.
                   (env: GACT_VOICE_CMD, config: voice_command)`)
}

func runTUI() {
	cfg, cfgPath, cfgErr := config.Load()
	if cfgErr != nil {
		fmt.Fprintf(os.Stderr, "gact: warning — failed to read %s: %v\n", cfgPath, cfgErr)
	}

	backend := flag.String("backend", defaultBackend,
		"GACT backend URL (env: GACT_BACKEND, config: backend_url)")
	theme := flag.String("theme", defaultTheme,
		"colour theme (env: GACT_THEME, config: theme) — use --list-themes to see options")
	voiceCmd := flag.String("voice-cmd", "",
		"shell cmd that writes audio/wav to stdout (env: GACT_VOICE_CMD, config: voice_command)")
	listThemes := flag.Bool("list-themes", false,
		"print available theme names (for --theme) and exit")
	flag.Parse()

	if *listThemes {
		fmt.Println("Available themes:")
		for _, m := range ui.AllThemeModes {
			fmt.Printf("  %s\n", ui.ThemeModeName(m))
		}
		return
	}

	finalBackend := config.Resolve(cfg.BackendURL, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	finalTheme := config.Resolve(cfg.Theme, os.Getenv("GACT_THEME"), *theme, defaultTheme)

	// P2: load a user-supplied custom theme if present at
	// ~/.config/gact/theme.json. Failures are logged but non-fatal —
	// the TUI still boots with whatever finalTheme resolved to.
	if themePath, err := ui.CustomThemeDefaultPath(); err == nil {
		if name, err := ui.LoadCustomTheme(themePath); err != nil {
			fmt.Fprintf(os.Stderr, "gact: warning — failed to load %s: %v\n", themePath, err)
		} else if name != "" {
			log.Printf("custom theme loaded: %s (from %s)", name, themePath)
		}
	}
	finalVoice := config.Resolve(cfg.VoiceCommand, os.Getenv("GACT_VOICE_CMD"), *voiceCmd, "")

	app := ui.NewWithTheme(finalBackend, ui.ThemeForMode(ui.ParseThemeMode(finalTheme)))
	app.VoiceCommand = finalVoice
	// N5: restore the persisted collapse threshold. If the file
	// didn't have it, Theme.applyStyles already picked the 5-line
	// default in NewWithTheme above.
	if cfg.CollapseThreshold != nil && *cfg.CollapseThreshold > 0 {
		app.Theme.CollapseThreshold = *cfg.CollapseThreshold
	}
	// P3: restore persisted cost-meter thresholds. Zero falls back
	// to the Claude-sized defaults via applyStyles.
	if cfg.CostWarnTokens != nil && *cfg.CostWarnTokens > 0 {
		app.Theme.CostWarnTokens = *cfg.CostWarnTokens
	}
	if cfg.CostDangerTokens != nil && *cfg.CostDangerTokens > 0 {
		app.Theme.CostDangerTokens = *cfg.CostDangerTokens
	}
	// Wire the save hook so Settings > TUI ◀/▶ adjustments flush to
	// disk on every change. The hook captures the resolved config
	// path so writes always land at the canonical location even when
	// only GACT_CONFIG is set.
	persistPath, _ := config.DefaultPath()
	app.SaveConfig = func() error {
		cur, _, _ := config.Load() // preserve fields we don't touch
		ct := app.Theme.CollapseThreshold
		cur.CollapseThreshold = &ct
		themeName := ui.ThemeModeName(ui.ThemeModeFor(app.Theme))
		cur.Theme = &themeName
		warn := app.Theme.CostWarnTokens
		danger := app.Theme.CostDangerTokens
		cur.CostWarnTokens = &warn
		cur.CostDangerTokens = &danger
		return config.Save(cur, persistPath)
	}
	// Hot-reload: Ctrl+L re-reads the on-disk config and reapplies
	// runtime-tweakable fields (theme, voice command). Backend changes
	// require a restart — flagged in the toast so the user knows.
	startBackend := finalBackend
	app.ReloadConfig = func() (string, error) {
		newCfg, _, err := config.Load()
		if err != nil {
			return "", err
		}
		nextTheme := config.Resolve(newCfg.Theme, os.Getenv("GACT_THEME"), *theme, defaultTheme)
		nextVoice := config.Resolve(newCfg.VoiceCommand, os.Getenv("GACT_VOICE_CMD"), *voiceCmd, "")
		nextBackend := config.Resolve(newCfg.BackendURL, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
		app.Theme = ui.ThemeForMode(ui.ParseThemeMode(nextTheme))
		app.VoiceCommand = nextVoice
		if nextBackend != startBackend {
			return fmt.Sprintf("config reloaded (theme=%s); backend changed — restart to apply", nextTheme), nil
		}
		return fmt.Sprintf("config reloaded (theme=%s, voice=%t)", nextTheme, nextVoice != ""), nil
	}
	p := tea.NewProgram(app)
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "gact:", err)
		log.Fatal(err)
	}
}

// runExport implements `gact export <session_id> [-o path] [--backend URL]`.
// Returns the process exit code.
func runExport(args []string) int {
	fs := flag.NewFlagSet("export", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	out := fs.String("o", "-", "output file path; '-' for stdout")
	knownFlags := map[string]bool{"-o": true, "--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, knownFlags)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact export <session_id> [-o path] [--backend URL]")
		return 2
	}
	sessionID := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	blob, err := c.ExportSession(ctx, sessionID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact export: %v\n", err)
		return 1
	}

	var w io.Writer
	if *out == "-" {
		w = os.Stdout
	} else {
		f, err := os.Create(*out)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact export: create %s: %v\n", *out, err)
			return 1
		}
		defer f.Close()
		w = f
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(blob); err != nil {
		fmt.Fprintf(os.Stderr, "gact export: encode: %v\n", err)
		return 1
	}
	if *out != "-" {
		fmt.Fprintf(os.Stderr, "gact export: wrote %d messages to %s\n", len(blob.Messages), *out)
	}
	return 0
}

// reorderFlagsFirst moves recognized flags (and their values) ahead of
// positional args so users can write `gact export SID -o file` instead of
// being forced to put all flags before the positional.
//
// known maps recognized flag tokens (e.g. "-o", "--backend") to true.
// We assume every recognized flag takes one value unless it's of the
// form -flag=value.
func reorderFlagsFirst(args []string, known map[string]bool) []string {
	flags := make([]string, 0, len(args))
	positional := make([]string, 0, len(args))
	i := 0
	for i < len(args) {
		a := args[i]
		if strings.HasPrefix(a, "-") {
			// Token already includes its value? (e.g. -o=foo)
			if strings.Contains(a, "=") {
				flags = append(flags, a)
				i++
				continue
			}
			// Recognized flag — consume next arg as value.
			if known[a] && i+1 < len(args) {
				flags = append(flags, a, args[i+1])
				i += 2
				continue
			}
			// Bool/unknown flag — pass through alone.
			flags = append(flags, a)
			i++
			continue
		}
		positional = append(positional, a)
		i++
	}
	return append(flags, positional...)
}

// runImport implements `gact import <file|->` reading a session blob and
// POSTing it to the backend's /v1/sessions/import endpoint.
func runImport(args []string) int {
	fs := flag.NewFlagSet("import", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	knownFlags := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, knownFlags)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact import <file|-> [--backend URL]")
		return 2
	}
	src := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)

	var r io.Reader
	if src == "-" {
		r = os.Stdin
	} else {
		f, err := os.Open(src)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact import: open %s: %v\n", src, err)
			return 1
		}
		defer f.Close()
		r = f
	}
	var blob client.SessionExportBlob
	if err := json.NewDecoder(r).Decode(&blob); err != nil {
		fmt.Fprintf(os.Stderr, "gact import: decode: %v\n", err)
		return 1
	}
	if blob.Format == "" {
		fmt.Fprintln(os.Stderr, "gact import: missing 'format' field — not a GACT export blob")
		return 1
	}
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	created, err := c.ImportSession(ctx, blob)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact import: %v\n", err)
		return 1
	}
	fmt.Fprintf(os.Stderr, "gact import: created session %s with %d messages\n",
		created.ID, created.MessageCount)
	fmt.Println(created.ID)
	return 0
}
