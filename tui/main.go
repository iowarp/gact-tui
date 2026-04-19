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
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
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
		case "list":
			os.Exit(runList(os.Args[2:]))
		case "tail":
			os.Exit(runTail(os.Args[2:]))
		case "ping":
			os.Exit(runPing(os.Args[2:]))
		case "send":
			os.Exit(runSend(os.Args[2:]))
		case "wait":
			os.Exit(runWait(os.Args[2:]))
		case "cancel":
			os.Exit(runCancel(os.Args[2:]))
		case "run":
			os.Exit(runRun(os.Args[2:]))
		case "log":
			os.Exit(runLog(os.Args[2:]))
		case "ask":
			os.Exit(runAsk(os.Args[2:]))
		case "new":
			os.Exit(runNew(os.Args[2:]))
		case "delete":
			os.Exit(runDelete(os.Args[2:]))
		case "rename":
			os.Exit(runRename(os.Args[2:]))
		case "archive":
			os.Exit(runArchive(os.Args[2:], true))
		case "unarchive":
			os.Exit(runArchive(os.Args[2:], false))
		case "completion":
			// Add summarize to the static completion script too.
			os.Exit(runCompletion(os.Args[2:]))
		case "metrics":
			os.Exit(runMetrics(os.Args[2:]))
		case "quick":
			os.Exit(runQuick(os.Args[2:]))
		case "summarize":
			os.Exit(runSummarize(os.Args[2:]))
		case "context":
			os.Exit(runContext(os.Args[2:]))
		case "catalog":
			os.Exit(runCatalog(os.Args[2:]))
		case "dump-bundle":
			os.Exit(runDumpBundle(os.Args[2:]))
		case "stream":
			os.Exit(runStream(os.Args[2:]))
		case "perms", "perm", "permissions":
			os.Exit(runPerms(os.Args[2:]))
		case "diff", "diffs":
			os.Exit(runDiff(os.Args[2:]))
		case "search":
			os.Exit(runSearch(os.Args[2:]))
		case "workspaces", "workspace", "ws":
			os.Exit(runWorkspaces(os.Args[2:]))
		case "fork":
			os.Exit(runFork(os.Args[2:]))
		case "models", "model":
			os.Exit(runModels(os.Args[2:]))
		case "info":
			os.Exit(runInfo(os.Args[2:]))
		case "undo":
			os.Exit(runUndo(os.Args[2:]))
		case "files", "file":
			os.Exit(runFiles(os.Args[2:]))
		case "repo-map", "repomap":
			os.Exit(runRepoMap(os.Args[2:]))
		case "mcp":
			os.Exit(runMcp(os.Args[2:]))
		case "tool", "tools":
			os.Exit(runTool(os.Args[2:]))
		case "agent", "agents":
			os.Exit(runAgent(os.Args[2:]))
		case "watch":
			os.Exit(runWatch(os.Args[2:]))
		case "capabilities", "caps":
			os.Exit(runCapabilities(os.Args[2:]))
		case "tell":
			os.Exit(runTell(os.Args[2:]))
		case "hooks", "hook":
			os.Exit(runHooks(os.Args[2:]))
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
	rev, when, dirty := readVCSInfo()
	if rev != "" {
		suffix := ""
		if dirty {
			suffix = " (dirty)"
		}
		fmt.Printf("  revision: %s%s\n", rev, suffix)
	}
	if when != "" {
		fmt.Printf("  built:    %s\n", when)
	}
	if info, ok := debug.ReadBuildInfo(); ok {
		fmt.Printf("  go:       %s\n", info.GoVersion)
	}
}

// readVCSInfo extracts (short revision, build time, dirty?) from
// runtime/debug.ReadBuildInfo. Used by both `gact version` and
// `gact diag` so the output stays consistent across both surfaces.
func readVCSInfo() (rev, when string, dirty bool) {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "", "", false
	}
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			rev = s.Value
			if len(rev) > 12 {
				rev = rev[:12]
			}
		case "vcs.time":
			when = s.Value
		case "vcs.modified":
			dirty = s.Value == "true"
		}
	}
	return rev, when, dirty
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
	if rev, when, dirty := readVCSInfo(); rev != "" {
		suffix := ""
		if dirty {
			suffix = " (dirty)"
		}
		fmt.Printf("  revision:   %s%s\n", rev, suffix)
		if when != "" {
			fmt.Printf("  built:      %s\n", when)
		}
	}

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
  gact list                  list recent sessions (tab-separated)
  gact export --all -o DIR   bulk-export every session as JSON files
  gact tail [SID]            stream SSE events as JSON lines
  gact ping                  probe /v1/health (exit 0 if healthy)
  gact send <sid> <text|->   post a user message to a session
  gact wait <sid>            block until the session status is idle
  gact cancel <sid>          POST /v1/sessions/{id}/cancel
  gact run <sid> <text|->    send + wait in one command
  gact log <sid>             dump conversation messages to stdout
  gact ask <sid> <q|->       send + wait + print assistant reply
  gact new [--title T]       create a session; print id to stdout
  gact delete <sid>          DELETE /v1/sessions/{id}
  gact rename <sid> <title>  PATCH session title
  gact archive <sid>         hide a session from the default sidebar
  gact unarchive <sid>       restore an archived session
  gact completion <shell>    print bash|zsh|fish completion script
  gact metrics [--format]    backend metrics summary (text or json)
  gact quick <q|->           one-shot Q&A (creates+asks+deletes session)
  gact summarize <sid>       trigger backend summary; prints result
  gact context list <sid>    list session context files (mode + path)
  gact context add <sid> <p> attach a file (--mode read|edit|pin)
  gact context rm <sid> <p>  detach a file
  gact catalog <kind>        list tools|agents|mcp|commands (TSV or JSON)
  gact dump-bundle [-o DIR]  diag + metrics + every session as a bundle
  gact stream [SID]          pretty-print SSE events as a one-liner timeline
  gact perms list <sid>      list permissions for a session
  gact perms allow <pid>     allow / deny / allow-session / allow-workspace
  gact diff list <sid>       list file_diff parts (path + status)
  gact diff apply <sid> [p…] apply pending diffs (no paths = all)
  gact diff reject <sid> [p…] reject pending diffs
  gact search <sid> <query>  full-text search across session messages
  gact workspaces list       list workspaces (TSV: id  name  root_path)
  gact fork <sid> [--at MID] spawn a child session forked from another
  gact models list           list providers + models (TSV: pid mid name ctx)
  gact info <sid>            print one session's metadata (text or json)
  gact undo <sid> [--count N] revert the last N messages (default 1)
  gact files list <ws-id>    list workspace files (TSV: type  size  path)
  gact files read <ws-id> <path> dump file bytes to stdout
  gact repo-map <ws-id>      tree-render the workspace repo map
  gact mcp tools <srv-id>    list one MCP server's tools (TSV or JSON)
  gact mcp resources <srv-id> list one MCP server's resources
  gact mcp prompts <srv-id>  list one MCP server's prompt templates
  gact mcp reconnect <srv-id> force-reconnect an MCP server
  gact mcp resource-read <srv-id> <uri> dump MCP resource bytes to stdout
  gact tool show <id>        print one tool's metadata + input schema
  gact agent show <id>       print one agent's metadata + system prompt
  gact watch <sid>           tail status changes (TSV: time status msgs tokens)
  gact capabilities          backend contract version + capability matrix
  gact tell <name> <msg>     find-or-create session by title; send + print reply
                              (re-run with same name to continue the conversation)
                              --async returns immediately with sid<TAB>msg_id
  gact hooks list|add|rm     manage §6.17 event hooks
                              add: --event STR --command PATH or --url URL
                                   [--session SID] [--workspace WS_ID]

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
	// LLL2: restore disabled tools so the catalog browser hides them
	// across restarts.
	if len(cfg.DisabledTools) > 0 {
		app.SetDisabledTools(cfg.DisabledTools)
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
		cur.DisabledTools = app.GetDisabledTools()
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
// runList implements `gact list [--backend URL] [--workspace WS_ID]`.
// Prints one tab-separated row per session (id, status, title,
// updated_at RFC3339) so shell pipelines can grep / awk the output.
// No TUI launch; useful for remote scripting.
// runDelete DELETEs /v1/sessions/{id}. Exits 0 on 204; 1 on
// transport / API error. Pairs with `gact new` so shell scripts
// can clean up scratch sessions.
func runDelete(args []string) int {
	fs := flag.NewFlagSet("delete", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact delete <session_id> [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.DeleteSession(ctx, sid); err != nil {
		fmt.Fprintf(os.Stderr, "gact delete: %v\n", err)
		return 1
	}
	return 0
}

// runDiff dispatches the `gact diff <verb>` family for managing
// file diffs the agent has produced. The contract has apply/reject
// endpoints but no list endpoint, so `list` walks the session's
// messages and aggregates file_diff parts client-side — same logic
// the TUI uses to gate the `a` / `r` keys.
//
//	gact diff list <sid>                — path  status (pending/applied/rejected)
//	gact diff apply <sid> [paths...]    — POST apply
//	gact diff reject <sid> [paths...]   — POST reject
//
// With no paths, apply/reject act on every pending diff.
func runDiff(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact diff list|apply|reject <session_id> [paths...]")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "list":
		return runDiffList(rest)
	case "apply":
		return runDiffApplyReject(rest, true)
	case "reject":
		return runDiffApplyReject(rest, false)
	default:
		fmt.Fprintf(os.Stderr, "gact diff: unknown verb %q (want list|apply|reject)\n", verb)
		return 2
	}
}

func runDiffList(args []string) int {
	fs := flag.NewFlagSet("diff list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact diff list <session_id>")
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	msgs, _, err := c.ListMessages(ctx, client.MessageFilter{SessionID: sid, Limit: 10000})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact diff list: %v\n", err)
		return 1
	}
	for _, m := range msgs {
		for _, p := range m.Parts {
			if p.Type != gact.PartTypeFileDiff {
				continue
			}
			status := "pending"
			if p.Applied {
				status = "applied"
			}
			if rj, ok := p.Metadata["rejected"].(bool); ok && rj {
				status = "rejected"
			}
			fmt.Printf("%s\t%s\n", p.Path, status)
		}
	}
	return 0
}

func runDiffApplyReject(args []string, apply bool) int {
	verb := "apply"
	if !apply {
		verb = "reject"
	}
	fs := flag.NewFlagSet("diff "+verb, flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() < 1 {
		fmt.Fprintf(os.Stderr, "usage: gact diff %s <session_id> [paths...]\n", verb)
		return 2
	}
	sid := fs.Arg(0)
	var paths []string
	for i := 1; i < fs.NArg(); i++ {
		paths = append(paths, fs.Arg(i))
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var (
		hit []string
		err error
	)
	if apply {
		hit, err = c.ApplyDiffs(ctx, sid, paths)
	} else {
		hit, err = c.RejectDiffs(ctx, sid, paths)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact diff %s: %v\n", verb, err)
		return 1
	}
	for _, p := range hit {
		fmt.Println(p)
	}
	return 0
}

// runSearch implements `gact search <sid> <query>` — full-text search
// across a session's messages via the §6.3 search endpoint. Output
// columns are `mid<TAB>role<TAB>snippet`; one ListMessages call up
// front resolves message-id → role so the rows include the speaker.
// `--format json` pretty-prints the raw match objects (mid, part_id,
// snippet, score).
func runSearch(args []string) int {
	fs := flag.NewFlagSet("search", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "tsv", "tsv | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() < 2 {
		fmt.Fprintln(os.Stderr, "usage: gact search <session_id> <query>")
		return 2
	}
	sid := fs.Arg(0)
	query := strings.Join(fs.Args()[1:], " ")
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact search: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	matches, err := c.SearchMessages(ctx, sid, query)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact search: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(matches); err != nil {
			fmt.Fprintf(os.Stderr, "gact search: %v\n", err)
			return 1
		}
		return 0
	}
	roleByMid := map[string]string{}
	msgs, _, err := c.ListMessages(ctx, client.MessageFilter{SessionID: sid, Limit: 500})
	if err == nil {
		for _, m := range msgs {
			roleByMid[m.ID] = string(m.Role)
		}
	}
	for _, m := range matches {
		role := roleByMid[m.MessageID]
		if role == "" {
			role = "?"
		}
		snippet := strings.ReplaceAll(m.Snippet, "\n", " ")
		fmt.Printf("%s\t%s\t%s\n", m.MessageID, role, snippet)
	}
	return 0
}

// resolveSessionByName returns the id of the newest session whose
// title equals `name`. If `name` already starts with "sess_" it's
// treated as a literal id and returned unchanged. Returns
// (id, found, err); found=false means no session has that title yet.
func resolveSessionByName(ctx context.Context, c *client.Client, name string) (string, bool, error) {
	if strings.HasPrefix(name, "sess_") {
		// Literal id — verify it exists so misspellings fail fast.
		if _, err := c.GetSession(ctx, name); err != nil {
			return "", false, err
		}
		return name, true, nil
	}
	sessions, err := c.ListSessions(ctx, client.SessionFilter{})
	if err != nil {
		return "", false, err
	}
	// ListSessions returns newest-first per the SPEC; pick the first
	// matching title so re-running `gact tell foo "..."` resumes the
	// most recent foo rather than creating a parallel foo.
	for _, s := range sessions {
		if s.Title == name {
			return s.ID, true, nil
		}
	}
	return "", false, nil
}

// runPermsRules dispatches `gact perms rules <subverb>` for MMM4
// §6.11 policy management:
//
//	gact perms rules list
//	gact perms rules set <json-file|->     (whole-list replace)
//	gact perms rules clear
func runPermsRules(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact perms rules list|set|clear ...")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "list", "ls":
		return runPermsRulesList(rest)
	case "set":
		return runPermsRulesSet(rest)
	case "clear":
		return runPermsRulesClear(rest)
	}
	fmt.Fprintf(os.Stderr, "gact perms rules: unknown verb %q (want list|set|clear)\n", verb)
	return 2
}

func runPermsRulesList(args []string) int {
	fs := flag.NewFlagSet("perms rules list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{"--backend": true, "-backend": true})); err != nil {
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	policies, err := c.ListPolicies(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact perms rules list: %v\n", err)
		return 1
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(map[string]any{"policies": policies})
	return 0
}

func runPermsRulesSet(args []string) int {
	fs := flag.NewFlagSet("perms rules set", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{"--backend": true, "-backend": true})); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact perms rules set <json-file|->")
		return 2
	}
	src := fs.Arg(0)
	var r io.Reader
	if src == "-" {
		r = os.Stdin
	} else {
		f, err := os.Open(src)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact perms rules set: open: %v\n", err)
			return 1
		}
		defer f.Close()
		r = f
	}
	var body struct {
		Policies []gact.Policy `json:"policies"`
	}
	if err := json.NewDecoder(r).Decode(&body); err != nil {
		fmt.Fprintf(os.Stderr, "gact perms rules set: parse: %v\n", err)
		return 1
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := c.PutPolicies(ctx, body.Policies)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact perms rules set: %v\n", err)
		return 1
	}
	fmt.Fprintf(os.Stderr, "%d policy(s) installed\n", len(out))
	return 0
}

func runPermsRulesClear(args []string) int {
	fs := flag.NewFlagSet("perms rules clear", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{"--backend": true, "-backend": true})); err != nil {
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.PutPolicies(ctx, []gact.Policy{}); err != nil {
		fmt.Fprintf(os.Stderr, "gact perms rules clear: %v\n", err)
		return 1
	}
	return 0
}

// runHooks dispatches the §6.17 hooks CLI (MMM3):
//
//	gact hooks list                                       — TSV: id event command/url scope
//	gact hooks add --event <ev> --command|--url <target>  — register; prints id
//	gact hooks rm <hook-id>                               — DELETE
//
// Optional --session / --workspace flags scope hooks at add time.
func runHooks(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact hooks list|add|rm ...")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "list", "ls":
		return runHooksList(rest)
	case "add":
		return runHooksAdd(rest)
	case "rm", "delete", "remove":
		return runHooksRm(rest)
	}
	fmt.Fprintf(os.Stderr, "gact hooks: unknown verb %q (want list|add|rm)\n", verb)
	return 2
}

func runHooksList(args []string) int {
	fs := flag.NewFlagSet("hooks list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "tsv", "tsv | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact hooks list: unknown format %q\n", *format)
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	hooks, err := c.ListHooks(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact hooks list: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(hooks)
		return 0
	}
	for _, h := range hooks {
		target := h.Command
		if h.URL != "" {
			target = h.URL
		}
		scope := ""
		if h.SessionID != "" {
			scope = "session=" + h.SessionID
		} else if h.WorkspaceID != "" {
			scope = "workspace=" + h.WorkspaceID
		}
		fmt.Printf("%s\t%s\t%s\t%s\n", h.ID, h.Event, target, scope)
	}
	return 0
}

func runHooksAdd(args []string) int {
	fs := flag.NewFlagSet("hooks add", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	event := fs.String("event", "", "event type to match (e.g. tool.call.completed; * matches all)")
	cmdPath := fs.String("command", "", "shell command to exec on match (event JSON on stdin)")
	url := fs.String("url", "", "URL to POST event JSON to on match")
	sid := fs.String("session", "", "scope: session id (optional)")
	wsID := fs.String("workspace", "", "scope: workspace id (optional)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--event": true, "-event": true,
		"--command": true, "-command": true,
		"--url": true, "-url": true,
		"--session": true, "-session": true,
		"--workspace": true, "-workspace": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if *event == "" {
		fmt.Fprintln(os.Stderr, "gact hooks add: --event required")
		return 2
	}
	if *cmdPath == "" && *url == "" {
		fmt.Fprintln(os.Stderr, "gact hooks add: --command or --url required")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	created, err := c.CreateHook(ctx, gact.Hook{
		Event:       *event,
		Command:     *cmdPath,
		URL:         *url,
		SessionID:   *sid,
		WorkspaceID: *wsID,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact hooks add: %v\n", err)
		return 1
	}
	fmt.Println(created.ID)
	return 0
}

func runHooksRm(args []string) int {
	fs := flag.NewFlagSet("hooks rm", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact hooks rm <hook-id>")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.DeleteHook(ctx, fs.Arg(0)); err != nil {
		fmt.Fprintf(os.Stderr, "gact hooks rm: %v\n", err)
		return 1
	}
	return 0
}

// runTell implements `gact tell <name> <msg>` — name-based, idempotent
// session messaging. First call creates a session titled <name>;
// subsequent calls resume that same session. Always: post the user
// message, wait for idle, print the assistant's reply text. Designed
// for scripted multi-turn conversations:
//
//	gact tell jaime "hello, my name is jaime"
//	gact tell jaime "what is my name?"   # appends to same session
//
// `name` may also be a literal sess_id; the resolver short-circuits.
func runTell(args []string) int {
	fs := flag.NewFlagSet("tell", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	timeout := fs.Duration("timeout", 5*time.Minute, "abandon wait after this long")
	interval := fs.Duration("interval", 500*time.Millisecond, "wait poll cadence")
	wsID := fs.String("workspace", "", "workspace id for new sessions (default: first listed)")
	async := fs.Bool("async", false, "fire-and-return: post the message and exit; print sid + msg_id without waiting for the assistant reply (LLL8)")
	// `known` only lists flags that take a value; bool flags like
	// --async are intentionally omitted so reorderFlagsFirst won't
	// gobble the next positional as their value.
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--timeout": true, "-timeout": true,
		"--interval": true, "-interval": true,
		"--workspace": true, "-workspace": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact tell <name|sess_id> <message|->")
		return 2
	}
	name := fs.Arg(0)
	msg := fs.Arg(1)
	if msg == "-" {
		buf, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact tell: read stdin: %v\n", err)
			return 1
		}
		msg = strings.TrimRight(string(buf), "\n")
	}
	if msg == "" {
		fmt.Fprintln(os.Stderr, "gact tell: empty message")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	sid, found, err := resolveSessionByName(ctx, c, name)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tell: %v\n", err)
		return 1
	}
	if !found {
		// Create path: pick the first workspace if not given.
		if *wsID == "" {
			wss, err := c.ListWorkspaces(ctx)
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact tell: list workspaces: %v\n", err)
				return 1
			}
			if len(wss) == 0 {
				fmt.Fprintln(os.Stderr, "gact tell: no workspaces; pass --workspace WS_ID")
				return 1
			}
			*wsID = wss[0].ID
		}
		s, err := c.CreateSession(ctx, client.CreateSessionRequest{
			WorkspaceID: *wsID,
			Title:       name,
			Model:       &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Agent:       &gact.AgentRef{ID: "default"},
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact tell: create %q: %v\n", name, err)
			return 1
		}
		sid = s.ID
		fmt.Fprintf(os.Stderr, "gact tell: created session %s (%q)\n", sid, name)
	}

	// Snapshot pre-send count to identify the assistant's new reply.
	preCtx, preCancel := context.WithTimeout(context.Background(), 10*time.Second)
	preMsgs, _, err := c.ListMessages(preCtx, client.MessageFilter{SessionID: sid, Limit: 10000})
	preCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tell: list-before: %v\n", err)
		return 1
	}
	preCount := len(preMsgs)

	postCtx, postCancel := context.WithTimeout(context.Background(), 10*time.Second)
	posted, err := c.PostMessage(postCtx, sid, client.PostMessageRequest{
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: msg}},
	})
	if err != nil {
		postCancel()
		fmt.Fprintf(os.Stderr, "gact tell: send: %v\n", err)
		return 1
	}
	postCancel()

	// LLL8: --async fires and returns. Print sid<TAB>msg_id on stdout
	// so chained scripts can capture both. The session keeps running
	// in the background; users can `gact log <sid>` or `gact watch
	// <sid>` to see the reply when ready.
	if *async {
		fmt.Printf("%s\t%s\n", sid, posted.MessageID)
		return 0
	}

	deadline := time.Now().Add(*timeout)
	for {
		pollCtx, pollCancel := context.WithTimeout(context.Background(), 5*time.Second)
		s, err := c.GetSession(pollCtx, sid)
		pollCancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact tell: poll: %v\n", err)
			return 1
		}
		if s.Status == gact.StatusIdle {
			break
		}
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "gact tell: timeout (status=%s)\n", s.Status)
			return 2
		}
		time.Sleep(*interval)
	}

	listCtx, listCancel := context.WithTimeout(context.Background(), 10*time.Second)
	msgs, _, err := c.ListMessages(listCtx, client.MessageFilter{SessionID: sid, Limit: 10000})
	listCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tell: list-after: %v\n", err)
		return 1
	}
	if len(msgs) <= preCount {
		fmt.Fprintln(os.Stderr, "gact tell: no new messages after wait")
		return 1
	}
	reply, ok := lastAssistantTextFromMessages(msgs[preCount:])
	if !ok {
		fmt.Fprintln(os.Stderr, "gact tell: no assistant reply")
		return 1
	}
	fmt.Print(reply)
	return 0
}

// runCapabilities prints the backend's contract version, identity, and
// capability flag matrix. Lets shell scripts feature-detect before
// calling endpoints (e.g. skip `gact undo` if `session_branching` is
// off). The TUI Connect screen already calls this on startup; this
// just exposes it from the shell.
func runCapabilities(args []string) int {
	fs := flag.NewFlagSet("capabilities", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "text", "text | json")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact capabilities: unknown format %q\n", *format)
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	caps, err := c.Capabilities(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact capabilities: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(caps)
		return 0
	}
	fmt.Printf("contract_version: %s\n", caps.ContractVersion)
	fmt.Printf("backend:          %s %s (%s)\n", caps.Backend.Name, caps.Backend.Version, caps.Backend.Vendor)
	if caps.Backend.Homepage != "" {
		fmt.Printf("homepage:         %s\n", caps.Backend.Homepage)
	}
	fmt.Printf("transports:       sse=%t websocket=%t\n", caps.Transports.EventsSSE, caps.Transports.EventsWebSocket)
	if len(caps.Auth.Schemes) > 0 {
		fmt.Printf("auth:             %s (current: %s)\n", strings.Join(caps.Auth.Schemes, ","), caps.Auth.Current)
	}
	fmt.Println("capabilities:")
	flags := []struct {
		name string
		on   bool
	}{
		{"workspaces", caps.Capabilities.Workspaces},
		{"sessions", caps.Capabilities.Sessions},
		{"subagents", caps.Capabilities.Subagents},
		{"mcp", caps.Capabilities.MCP},
		{"lsp", caps.Capabilities.LSP},
		{"files", caps.Capabilities.Files},
		{"diffs", caps.Capabilities.Diffs},
		{"permissions", caps.Capabilities.Permissions},
		{"providers", caps.Capabilities.Providers},
		{"commands", caps.Capabilities.Commands},
		{"voice", caps.Capabilities.Voice},
		{"scheduled_sessions", caps.Capabilities.ScheduledSessions},
		{"metrics", caps.Capabilities.Metrics},
		{"session_branching", caps.Capabilities.SessionBranching},
		{"session_sharing", caps.Capabilities.SessionSharing},
		{"session_export", caps.Capabilities.SessionExport},
		{"cost_tracking", caps.Capabilities.CostTracking},
		{"thinking_blocks", caps.Capabilities.ThinkingBlocks},
		{"edit_modes", caps.Capabilities.EditModes},
		{"plan_mode", caps.Capabilities.PlanMode},
		{"search_messages", caps.Capabilities.SearchMessages},
		{"agent_write", caps.Capabilities.AgentWrite},
		{"skills_extraction", caps.Capabilities.SkillsExtraction},
	}
	for _, f := range flags {
		mark := "·"
		if f.on {
			mark = "✓"
		}
		fmt.Printf("  %s %s\n", mark, f.name)
	}
	for _, e := range caps.Extensions {
		fmt.Printf("extension:        %s %s %s\n", e.ID, e.Version, e.Docs)
	}
	return 0
}

// runAgent dispatches the `gact agent <verb>` family. Right now only
// `show` is implemented (list is covered by `gact catalog agents`):
//
//	gact agent show <id> [--format text|json]
func runAgent(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact agent show <id> [--format text|json]")
		return 2
	}
	verb := args[0]
	if verb != "show" {
		fmt.Fprintf(os.Stderr, "gact agent: unknown verb %q (want show — list is `gact catalog agents`)\n", verb)
		return 2
	}
	rest := args[1:]
	fs := flag.NewFlagSet("agent show", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "text", "text | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(rest, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact agent show <id> [--format text|json]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact agent show: unknown format %q\n", *format)
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	a, err := c.GetAgent(ctx, fs.Arg(0))
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact agent show: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(a)
		return 0
	}
	fmt.Printf("id:            %s\n", a.ID)
	fmt.Printf("source:        %s\n", a.Source)
	fmt.Printf("title:         %s\n", a.Title)
	if a.Description != "" {
		fmt.Printf("description:   %s\n", a.Description)
	}
	if a.DefaultModel != nil {
		fmt.Printf("default_model: %s/%s\n", a.DefaultModel.ProviderID, a.DefaultModel.ModelID)
	}
	if len(a.Tools) > 0 {
		fmt.Printf("tools:         %s\n", strings.Join(a.Tools, ", "))
	}
	for _, p := range a.Parameters {
		req := ""
		if p.Required {
			req = " (required)"
		}
		fmt.Printf("param:         %s [%s]%s — %s\n", p.Name, p.Type, req, p.Description)
	}
	if a.SystemPrompt != "" {
		fmt.Printf("system_prompt:\n%s\n", a.SystemPrompt)
	}
	return 0
}

// runWatch polls GetSession every --interval and prints one TSV row
// per status change: time<TAB>status<TAB>messages<TAB>tokens_out.
// Different from `gact wait` (which exits on first idle): this
// surfaces transitions, useful for "what's the agent doing?" tail.
// Stops after status hits idle and stays idle for one extra interval.
func runWatch(args []string) int {
	fs := flag.NewFlagSet("watch", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	interval := fs.Duration("interval", time.Second, "polling cadence")
	timeout := fs.Duration("timeout", 5*time.Minute, "abandon after this long")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--interval": true, "-interval": true,
		"--timeout": true, "-timeout": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact watch <session_id> [--interval DUR] [--timeout DUR]")
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	prevStatus, prevMessages, prevTokens := "", -1, -1
	sawActivity := false
	idleStreak := 0
	tick := time.NewTicker(*interval)
	defer tick.Stop()
	emit := func(s gact.Session) {
		fmt.Printf("%s\t%s\t%d\t%d\n",
			time.Now().UTC().Format("15:04:05"),
			s.Status, s.MessageCount, s.Tokens.Output)
	}
	for {
		s, err := c.GetSession(ctx, sid)
		if err != nil {
			if ctx.Err() != nil {
				fmt.Fprintln(os.Stderr, "gact watch: timeout")
				return 1
			}
			fmt.Fprintf(os.Stderr, "gact watch: %v\n", err)
			return 1
		}
		// Activity = any non-idle status, or any change in message/token
		// counts after the first poll. Either signal means we've seen
		// the session do something — without it, --timeout is the only
		// exit. The first poll itself never counts (prevMessages == -1).
		if s.Status != "idle" {
			sawActivity = true
		}
		if prevMessages != -1 && (s.MessageCount != prevMessages || s.Tokens.Output != prevTokens) {
			sawActivity = true
		}
		if s.Status != prevStatus || s.MessageCount != prevMessages || s.Tokens.Output != prevTokens {
			emit(s)
			prevStatus = s.Status
			prevMessages = s.MessageCount
			prevTokens = s.Tokens.Output
			idleStreak = 0
		} else if s.Status == "idle" && sawActivity {
			idleStreak++
			if idleStreak >= 2 {
				return 0
			}
		}
		select {
		case <-tick.C:
		case <-ctx.Done():
			fmt.Fprintln(os.Stderr, "gact watch: timeout")
			return 1
		}
	}
}

// runTool dispatches the `gact tool <verb>` family. Right now only
// `show` is implemented (list is covered by `gact catalog tools`):
//
//	gact tool show <id> [--format text|json]
func runTool(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact tool show <id> [--format text|json]")
		return 2
	}
	verb := args[0]
	if verb != "show" {
		fmt.Fprintf(os.Stderr, "gact tool: unknown verb %q (want show — list is `gact catalog tools`)\n", verb)
		return 2
	}
	rest := args[1:]
	fs := flag.NewFlagSet("tool show", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "text", "text | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(rest, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact tool show <id> [--format text|json]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact tool show: unknown format %q\n", *format)
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	t, err := c.GetTool(ctx, fs.Arg(0))
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tool show: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(t)
		return 0
	}
	fmt.Printf("id:                 %s\n", t.ID)
	fmt.Printf("source:             %s\n", t.Source)
	if t.ServerID != "" {
		fmt.Printf("server_id:          %s\n", t.ServerID)
	}
	fmt.Printf("name:               %s\n", t.Name)
	if t.Title != "" {
		fmt.Printf("title:              %s\n", t.Title)
	}
	if t.Description != "" {
		fmt.Printf("description:        %s\n", t.Description)
	}
	if t.PermissionDefault != "" {
		fmt.Printf("permission_default: %s\n", t.PermissionDefault)
	}
	if len(t.InputSchema) > 0 {
		schema, _ := json.MarshalIndent(t.InputSchema, "", "  ")
		fmt.Printf("input_schema:\n%s\n", schema)
	}
	if len(t.OutputSchema) > 0 {
		schema, _ := json.MarshalIndent(t.OutputSchema, "", "  ")
		fmt.Printf("output_schema:\n%s\n", schema)
	}
	return 0
}

// runMcp dispatches per-server MCP detail subcommands. `gact catalog
// mcp` lists all servers; this drills into one to inspect what it
// exposes:
//
//	gact mcp tools     <server-id>   — TSV: id  name
//	gact mcp resources <server-id>   — TSV: uri  mime  name
//	gact mcp prompts   <server-id>   — TSV: name  title
func runMcp(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp tools|resources|prompts <server-id> [--format tsv|json]")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "tools":
		return runMcpTools(rest)
	case "resources":
		return runMcpResources(rest)
	case "prompts":
		return runMcpPrompts(rest)
	case "reconnect":
		return runMcpReconnect(rest)
	case "resource-read", "read":
		return runMcpResourceRead(rest)
	}
	fmt.Fprintf(os.Stderr, "gact mcp: unknown verb %q (want tools|resources|prompts|reconnect|resource-read)\n", verb)
	return 2
}

func runMcpResourceRead(args []string) int {
	fs := flag.NewFlagSet("mcp resource-read", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp resource-read <server-id> <uri>")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	contents, err := c.McpResourceRead(ctx, fs.Arg(0), fs.Arg(1))
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp resource-read: %v\n", err)
		return 1
	}
	for _, ch := range contents {
		if ch.Text != "" {
			_, _ = os.Stdout.WriteString(ch.Text)
			continue
		}
		if ch.Data != "" {
			decoded, err := base64.StdEncoding.DecodeString(ch.Data)
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact mcp resource-read: bad base64 for %s: %v\n", ch.URI, err)
				return 1
			}
			_, _ = os.Stdout.Write(decoded)
		}
	}
	return 0
}

func runMcpReconnect(args []string) int {
	fs := flag.NewFlagSet("mcp reconnect", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp reconnect <server-id>")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.McpReconnect(ctx, fs.Arg(0)); err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp reconnect: %v\n", err)
		return 1
	}
	return 0
}

func mcpFlagSet(name string) (*flag.FlagSet, *string, *string) {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "tsv", "tsv | json")
	return fs, backend, format
}

func runMcpTools(args []string) int {
	fs, backend, format := mcpFlagSet("mcp tools")
	known := map[string]bool{"--backend": true, "-backend": true, "--format": true, "-format": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp tools <server-id> [--format tsv|json]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact mcp tools: unknown format %q\n", *format)
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tools, err := c.McpServerTools(ctx, fs.Arg(0))
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp tools: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(tools)
		return 0
	}
	for _, t := range tools {
		fmt.Printf("%s\t%s\n", t.ID, t.Name)
	}
	return 0
}

func runMcpResources(args []string) int {
	fs, backend, format := mcpFlagSet("mcp resources")
	known := map[string]bool{"--backend": true, "-backend": true, "--format": true, "-format": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp resources <server-id> [--format tsv|json]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact mcp resources: unknown format %q\n", *format)
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	rs, err := c.McpServerResources(ctx, fs.Arg(0))
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp resources: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(rs)
		return 0
	}
	for _, r := range rs {
		fmt.Printf("%s\t%s\t%s\n", r.URI, r.MimeType, r.Name)
	}
	return 0
}

func runMcpPrompts(args []string) int {
	fs, backend, format := mcpFlagSet("mcp prompts")
	known := map[string]bool{"--backend": true, "-backend": true, "--format": true, "-format": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp prompts <server-id> [--format tsv|json]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact mcp prompts: unknown format %q\n", *format)
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	ps, err := c.McpServerPrompts(ctx, fs.Arg(0))
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp prompts: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(ps)
		return 0
	}
	for _, p := range ps {
		fmt.Printf("%s\t%s\n", p.Name, p.Title)
	}
	return 0
}

// runRepoMap fetches the workspace repo map and renders it as a tree
// (default) or raw JSON. Tree mode uses tree(1)-style box-drawing
// glyphs and hangs symbol outlines under each file as `· name`.
//
//	gact repo-map ws_default            # tree view, with token cost
//	gact repo-map ws_default --format json
func runRepoMap(args []string) int {
	fs := flag.NewFlagSet("repo-map", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "tree", "tree | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact repo-map <workspace_id> [--format tree|json]")
		return 2
	}
	if *format != "tree" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact repo-map: unknown format %q (want tree|json)\n", *format)
		return 2
	}
	wsID := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	rm, err := c.WorkspaceRepoMap(ctx, wsID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact repo-map: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(rm); err != nil {
			fmt.Fprintf(os.Stderr, "gact repo-map: %v\n", err)
			return 1
		}
		return 0
	}
	if rm.Tree != nil {
		fmt.Println(rm.Tree.Path)
		printRepoMapNode(rm.Tree, "")
	}
	fmt.Fprintf(os.Stderr, "%d tokens\n", rm.Tokens)
	return 0
}

func printRepoMapNode(n *gact.RepoMapNode, prefix string) {
	if n == nil {
		return
	}
	total := len(n.Children) + len(n.Symbols)
	idx := 0
	for _, sym := range n.Symbols {
		idx++
		glyph := "├── "
		if idx == total {
			glyph = "└── "
		}
		fmt.Printf("%s%s· %s\n", prefix, glyph, sym)
	}
	for _, ch := range n.Children {
		idx++
		glyph := "├── "
		nextPrefix := prefix + "│   "
		if idx == total {
			glyph = "└── "
			nextPrefix = prefix + "    "
		}
		fmt.Printf("%s%s%s\n", prefix, glyph, ch.Path)
		printRepoMapNode(ch, nextPrefix)
	}
}

// runFiles dispatches the `gact files <verb>` family for workspace
// file inspection from the shell:
//
//	gact files list <ws-id>          — TSV: type  size  path
//	gact files list <ws-id> --format json
//	gact files read <ws-id> <path>   — raw bytes to stdout
func runFiles(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact files list|read ...")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "list", "ls":
		return runFilesList(rest)
	case "read", "cat":
		return runFilesRead(rest)
	}
	fmt.Fprintf(os.Stderr, "gact files: unknown verb %q (want list|read)\n", verb)
	return 2
}

func runFilesList(args []string) int {
	fs := flag.NewFlagSet("files list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "tsv", "tsv | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact files list <workspace_id> [--format tsv|json]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact files list: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	wsID := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	entries, err := c.ListWorkspaceFiles(ctx, wsID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact files list: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(entries); err != nil {
			fmt.Fprintf(os.Stderr, "gact files list: %v\n", err)
			return 1
		}
		return 0
	}
	for _, e := range entries {
		fmt.Printf("%s\t%d\t%s\n", e.Type, e.Size, e.Path)
	}
	return 0
}

func runFilesRead(args []string) int {
	fs := flag.NewFlagSet("files read", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact files read <workspace_id> <path>")
		return 2
	}
	wsID := fs.Arg(0)
	path := fs.Arg(1)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, err := c.ReadWorkspaceFile(ctx, wsID, path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact files read: %v\n", err)
		return 1
	}
	if _, err := os.Stdout.Write(body); err != nil {
		fmt.Fprintf(os.Stderr, "gact files read: stdout write: %v\n", err)
		return 1
	}
	return 0
}

// runUndo POSTs /v1/sessions/{id}/undo with optional count. Mirrors
// the `/undo` slash command for shell scripts. Prints reverted message
// ids one per line; count summary on stderr.
//
//	gact undo "$SID"           # revert last message
//	gact undo "$SID" --count 3 # revert last three
func runUndo(args []string) int {
	fs := flag.NewFlagSet("undo", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	count := fs.Int("count", 1, "number of messages to revert (>=1)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--count": true, "-count": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact undo <session_id> [--count N]")
		return 2
	}
	if *count < 1 {
		fmt.Fprintln(os.Stderr, "gact undo: --count must be >= 1")
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	reverted, err := c.UndoSession(ctx, sid, *count)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact undo: %v\n", err)
		return 1
	}
	for _, mid := range reverted {
		fmt.Println(mid)
	}
	fmt.Fprintf(os.Stderr, "reverted %d message(s)\n", len(reverted))
	return 0
}

// runInfo prints a single session's metadata. The default text format
// is a key:value layout — easy for humans to skim and easy for awk to
// parse (one key per line). `--format json` dumps the raw Session
// struct for jq pipelines. Useful when scripts need to check status,
// model, or message_count without parsing `gact list` TSV.
func runInfo(args []string) int {
	fs := flag.NewFlagSet("info", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "text", "text | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact info <session_id> [--format text|json]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact info: unknown format %q (want text|json)\n", *format)
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	s, err := c.GetSession(ctx, sid)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact info: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(s); err != nil {
			fmt.Fprintf(os.Stderr, "gact info: %v\n", err)
			return 1
		}
		return 0
	}
	fmt.Printf("id:            %s\n", s.ID)
	fmt.Printf("title:         %s\n", s.Title)
	fmt.Printf("status:        %s\n", s.Status)
	fmt.Printf("workspace:     %s\n", s.WorkspaceID)
	if s.ParentSessionID != "" {
		fmt.Printf("parent:        %s\n", s.ParentSessionID)
	}
	if s.Model.ProviderID != "" || s.Model.ModelID != "" {
		fmt.Printf("model:         %s/%s\n", s.Model.ProviderID, s.Model.ModelID)
	}
	if s.Agent.ID != "" {
		fmt.Printf("agent:         %s\n", s.Agent.ID)
	}
	fmt.Printf("messages:      %d\n", s.MessageCount)
	fmt.Printf("tokens_in:     %d\n", s.Tokens.Input)
	fmt.Printf("tokens_out:    %d\n", s.Tokens.Output)
	fmt.Printf("cost_usd:      %.4f\n", s.CostUSD)
	fmt.Printf("created_at:    %s\n", s.CreatedAt.Format(time.RFC3339))
	fmt.Printf("updated_at:    %s\n", s.UpdatedAt.Format(time.RFC3339))
	if s.ArchivedAt != nil {
		fmt.Printf("archived_at:   %s\n", s.ArchivedAt.Format(time.RFC3339))
	}
	if s.Summary != "" {
		fmt.Printf("summary:       %s\n", s.Summary)
	}
	return 0
}

// runModels handles `gact models list [--provider PID] [--format tsv|json]`.
// Walks `/v1/providers` and per-provider `/v1/providers/{id}/models`
// so callers don't have to chain two requests by hand. TSV columns:
// provider_id, model_id, name, context_window. With --provider, only
// that provider's models are listed (avoids the providers round-trip).
func runModels(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact models list [--provider PID] [--format tsv|json]")
		return 2
	}
	verb := args[0]
	if verb != "list" && verb != "ls" {
		fmt.Fprintf(os.Stderr, "gact models: unknown verb %q (want list)\n", verb)
		return 2
	}
	rest := args[1:]
	fs := flag.NewFlagSet("models list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	provider := fs.String("provider", "", "limit to one provider id")
	format := fs.String("format", "tsv", "tsv | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--provider": true, "-provider": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(rest, known)); err != nil {
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact models: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	type row struct {
		ProviderID    string     `json:"provider_id"`
		ModelID       string     `json:"model_id"`
		Name          string     `json:"name"`
		ContextWindow int        `json:"context_window"`
		Model         gact.Model `json:"model,omitempty"`
	}
	var rows []row
	var providers []string
	if *provider != "" {
		providers = []string{*provider}
	} else {
		ps, err := c.ListProviders(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact models list: providers: %v\n", err)
			return 1
		}
		for _, p := range ps {
			providers = append(providers, p.ID)
		}
	}
	for _, pid := range providers {
		ms, err := c.ListProviderModels(ctx, pid)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact models list %s: %v\n", pid, err)
			return 1
		}
		for _, m := range ms {
			rows = append(rows, row{
				ProviderID:    pid,
				ModelID:       m.ID,
				Name:          m.Name,
				ContextWindow: m.ContextWindow,
				Model:         m,
			})
		}
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(rows); err != nil {
			fmt.Fprintf(os.Stderr, "gact models list: %v\n", err)
			return 1
		}
		return 0
	}
	for _, r := range rows {
		fmt.Printf("%s\t%s\t%s\t%d\n", r.ProviderID, r.ModelID, r.Name, r.ContextWindow)
	}
	return 0
}

// runFork creates a child session via the same `/v1/sessions` POST
// `gact new` uses but with `parent_session_id` set (and optionally
// `fork_at_message_id`). Inherits the parent's workspace so callers
// don't have to re-specify it. Useful for what-if branches:
//
//	CHILD=$(gact fork "$SID" --at "$MID" --title "alt-branch")
//	gact ask "$CHILD" "what if we tried a different approach?"
//
// Prints the new session id to stdout. Exits 1 on backend failure,
// 2 on bad args.
func runFork(args []string) int {
	fs := flag.NewFlagSet("fork", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	atMid := fs.String("at", "", "fork at this message id (default: tail)")
	title := fs.String("title", "", "child session title; defaults to 'fork of <parent>'")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--at": true, "-at": true,
		"--title": true, "-title": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact fork <parent-session-id> [--at MID] [--title T]")
		return 2
	}
	parentID := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	parent, err := c.GetSession(ctx, parentID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact fork: %v\n", err)
		return 1
	}
	if *title == "" {
		*title = "fork of " + parentID
	}
	s, err := c.CreateSession(ctx, client.CreateSessionRequest{
		WorkspaceID:     parent.WorkspaceID,
		Title:           *title,
		ParentSessionID: parentID,
		ForkAtMessageID: *atMid,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact fork: %v\n", err)
		return 1
	}
	fmt.Println(s.ID)
	return 0
}

// runWorkspaces handles `gact workspaces list [--format tsv|json]`
// — single read-side wrapper over `/v1/workspaces`. Useful for
// scripts that need to discover workspace ids before chaining
// `gact list --workspace WS_ID` or `gact tail --workspace WS_ID`.
// TSV columns: id, name, root_path. JSON pretty-prints the raw slice.
func runWorkspaces(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact workspaces list [--format tsv|json]")
		return 2
	}
	verb := args[0]
	if verb != "list" && verb != "ls" {
		fmt.Fprintf(os.Stderr, "gact workspaces: unknown verb %q (want list)\n", verb)
		return 2
	}
	rest := args[1:]
	fs := flag.NewFlagSet("workspaces list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "tsv", "tsv | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(rest, known)); err != nil {
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact workspaces: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	wss, err := c.ListWorkspaces(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact workspaces list: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(wss); err != nil {
			fmt.Fprintf(os.Stderr, "gact workspaces list: %v\n", err)
			return 1
		}
		return 0
	}
	for _, w := range wss {
		fmt.Printf("%s\t%s\t%s\n", w.ID, w.Name, w.RootPath)
	}
	return 0
}

// runPerms dispatches the `gact perms <verb>` family for managing
// pending permissions from the shell. Same endpoints the TUI's
// a/d/s/w action keys use:
//
//	gact perms list <sid>                — pending+resolved (TSV)
//	gact perms allow <perm-id>           — POST allow
//	gact perms deny <perm-id>            — POST deny
//	gact perms allow-session <perm-id>   — POST allow_session
//	gact perms allow-workspace <perm-id> — POST allow_workspace
func runPerms(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact perms list|allow|deny|allow-session|allow-workspace|rules ...")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	if verb == "list" {
		return runPermsList(rest)
	}
	if verb == "rules" {
		// MMM4: nested verb for §6.11 policies. Subverbs:
		//   list             - print current policy list
		//   set <file|->     - replace whole list from JSON {policies:[…]}
		//   clear            - replace with empty list
		return runPermsRules(rest)
	}

	// Action verbs share the same shape: <perm-id> required.
	var action gact.PermissionAction
	switch verb {
	case "allow":
		action = gact.PermAllow
	case "deny":
		action = gact.PermDeny
	case "allow-session":
		action = gact.PermAllowSession
	case "allow-workspace":
		action = gact.PermAllowWorkspace
	default:
		fmt.Fprintf(os.Stderr, "gact perms: unknown verb %q\n", verb)
		return 2
	}

	fs := flag.NewFlagSet("perms "+verb, flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(rest, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintf(os.Stderr, "usage: gact perms %s <perm-id> [--backend URL]\n", verb)
		return 2
	}
	pid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.RespondPermission(ctx, pid, action); err != nil {
		fmt.Fprintf(os.Stderr, "gact perms %s: %v\n", verb, err)
		return 1
	}
	return 0
}

// runPermsList prints pending permissions for a session as
// tab-separated `id  status  action  summary` rows.
func runPermsList(args []string) int {
	fs := flag.NewFlagSet("perms list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	pending := fs.Bool("pending", false, "only pending; default lists every state")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--pending": true, "-pending": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact perms list <session_id> [--pending] [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	perms, err := c.ListPermissions(ctx, sid, *pending)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact perms list: %v\n", err)
		return 1
	}
	for _, p := range perms {
		summary := strings.ReplaceAll(p.Summary, "\n", " ")
		fmt.Printf("%s\t%s\t%s\t%s\n", p.ID, p.Status, p.Action, summary)
	}
	return 0
}

// runStream is `gact tail` with a human-friendly one-liner format:
//
//	14:32:01  message.created          msg=msg_abc role=user
//	14:32:01  message.part.added       part=text
//	14:32:01  message.part.delta       text+=I'll take a look. First, ...
//	14:32:02  message.part.completed
//	14:32:02  message.completed
//
// One row per event so a long stream remains scannable. JSON-line
// output stays available via `gact tail`.
func runStream(args []string) int {
	fs := flag.NewFlagSet("stream", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "workspace-scoped stream when no session_id")
	known := map[string]bool{"--backend": true, "-backend": true, "--workspace": true, "-workspace": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	scope := client.EventStreamScope{WorkspaceID: *wsID}
	if fs.NArg() == 1 {
		scope.SessionID = fs.Arg(0)
	} else if fs.NArg() > 1 {
		fmt.Fprintln(os.Stderr, "usage: gact stream [session_id] [--workspace WS_ID]")
		return 2
	}
	if scope.SessionID == "" && scope.WorkspaceID == "" {
		fmt.Fprintln(os.Stderr, "gact stream: pass <session_id> or --workspace WS_ID")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	events, errs, err := c.StreamEvents(ctx, scope)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact stream: connect: %v\n", err)
		return 1
	}
	for {
		select {
		case <-ctx.Done():
			return 0
		case e, ok := <-events:
			if !ok {
				return 0
			}
			fmt.Println(streamRow(e))
		case err, ok := <-errs:
			if !ok {
				return 0
			}
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact stream: %v\n", err)
				return 1
			}
		}
	}
}

// streamRow formats a single SSEEvent as `HH:MM:SS type summary`. The
// summary is event-type-specific: message events show role / part
// type / delta preview; status changes show old → new; errors show
// the message. Unknown types fall through to "type=name" only.
func streamRow(e client.SSEEvent) string {
	now := time.Now().UTC().Format("15:04:05")
	pl, _ := e.Payload["payload"].(map[string]any)
	summary := ""
	switch e.Type {
	case "message.created":
		role, _ := pickPath(pl, "role").(string)
		mid, _ := pickPath(pl, "id").(string)
		summary = fmt.Sprintf("msg=%s role=%s", mid, role)
	case "message.part.added":
		ptype, _ := pickPath(pl, "part", "type").(string)
		summary = "part=" + ptype
	case "message.part.delta":
		delta, _ := pickPath(pl, "delta").(map[string]any)
		if t, ok := delta["text_append"].(string); ok && t != "" {
			summary = "text+=" + truncateForRow(t)
		} else if th, ok := delta["thinking_append"].(string); ok && th != "" {
			summary = "thinking+=" + truncateForRow(th)
		} else if ji, ok := delta["input_json_append"].(string); ok && ji != "" {
			summary = "tool_input+=" + truncateForRow(ji)
		}
	case "session.status_changed":
		st, _ := pickPath(pl, "status").(string)
		reason, _ := pickPath(pl, "reason").(string)
		summary = "status=" + st
		if reason != "" {
			summary += " reason=" + reason
		}
	case "permission.requested":
		sum, _ := pickPath(pl, "summary").(string)
		summary = truncateForRow(sum)
	case "cost.updated":
		cost, _ := pickPath(pl, "cost_usd").(float64)
		summary = fmt.Sprintf("cost=$%.4f", cost)
	case "notification":
		// MMM1: backend-pushed banner-worthy message.
		level, _ := pickPath(pl, "level").(string)
		title, _ := pickPath(pl, "title").(string)
		body, _ := pickPath(pl, "body").(string)
		if level == "" {
			level = "info"
		}
		summary = fmt.Sprintf("[%s] %s", level, title)
		if body != "" {
			summary += " — " + truncateForRow(body)
		}
	}
	return fmt.Sprintf("%s  %-30s %s", now, e.Type, summary)
}

// pickPath traverses a nested map by string keys, returning the leaf
// value or nil. Avoids a chain of nested-cast guards in streamRow.
func pickPath(m map[string]any, keys ...string) any {
	cur := any(m)
	for _, k := range keys {
		mm, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = mm[k]
	}
	return cur
}

// truncateForRow caps a string at 60 chars so the one-liner stays
// scannable even for fat text deltas. Replaces newlines with `↵`
// so a paragraph delta renders as a single visual row.
func truncateForRow(s string) string {
	s = strings.ReplaceAll(s, "\n", "↵")
	if len(s) > 60 {
		s = s[:57] + "..."
	}
	return s
}

// runDumpBundle writes a complete bug-report bundle to a directory:
//
//	diag.txt           ← `gact diag` capture
//	metrics.json       ← /v1/metrics raw response
//	sessions/<sid>.json ← every session export (one file each)
//	version.txt        ← binary/contract/runtime/VCS info
//
// Single command for "I'm filing a bug, attach this directory". Beats
// chaining diag + export --all + version + manual paste.
func runDumpBundle(args []string) int {
	fs := flag.NewFlagSet("dump-bundle", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	out := fs.String("o", "gact-bundle", "output directory")
	known := map[string]bool{"--backend": true, "-backend": true, "-o": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if err := os.MkdirAll(*out, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "gact dump-bundle: mkdir %s: %v\n", *out, err)
		return 1
	}

	// version.txt — captured directly from runVersion's logic so the
	// bundle is self-contained without shelling out.
	{
		var b strings.Builder
		fmt.Fprintf(&b, "gact %s (contract %s)\n", binaryVersion, contractVersion)
		if rev, when, dirty := readVCSInfo(); rev != "" {
			suffix := ""
			if dirty {
				suffix = " (dirty)"
			}
			fmt.Fprintf(&b, "  revision: %s%s\n", rev, suffix)
			if when != "" {
				fmt.Fprintf(&b, "  built:    %s\n", when)
			}
		}
		fmt.Fprintf(&b, "  runtime:  %s\n", runtime.Version())
		fmt.Fprintf(&b, "  platform: %s/%s\n", runtime.GOOS, runtime.GOARCH)
		if err := os.WriteFile(filepath.Join(*out, "version.txt"), []byte(b.String()), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "gact dump-bundle: write version.txt: %v\n", err)
			return 1
		}
	}

	// diag.txt — re-route runDiag's stdout into a file. Easiest is to
	// inline the body so we don't have to swap os.Stdout temporarily.
	{
		f, err := os.Create(filepath.Join(*out, "diag.txt"))
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact dump-bundle: create diag.txt: %v\n", err)
			return 1
		}
		writeDiagTo(f)
		f.Close()
	}

	// metrics.json — best-effort; if backend is offline we still want
	// the rest of the bundle.
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	{
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		m, err := c.Metrics(ctx)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact dump-bundle: metrics: %v (continuing)\n", err)
		} else {
			f, err := os.Create(filepath.Join(*out, "metrics.json"))
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact dump-bundle: create metrics.json: %v\n", err)
				return 1
			}
			enc := json.NewEncoder(f)
			enc.SetIndent("", "  ")
			_ = enc.Encode(m)
			f.Close()
		}
	}

	// sessions/<sid>.json — reuse runExportAll's loop semantics.
	sessDir := filepath.Join(*out, "sessions")
	if err := os.MkdirAll(sessDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "gact dump-bundle: mkdir sessions/: %v\n", err)
		return 1
	}
	listCtx, listCancel := context.WithTimeout(context.Background(), 30*time.Second)
	sessions, err := c.ListSessions(listCtx, client.SessionFilter{})
	listCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact dump-bundle: list sessions: %v (continuing)\n", err)
	}
	ok := 0
	for _, s := range sessions {
		ectx, ecancel := context.WithTimeout(context.Background(), 30*time.Second)
		blob, err := c.ExportSession(ectx, s.ID)
		ecancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "  %s: %v\n", s.ID, err)
			continue
		}
		f, ferr := os.Create(filepath.Join(sessDir, s.ID+".json"))
		if ferr != nil {
			fmt.Fprintf(os.Stderr, "  %s: create: %v\n", s.ID, ferr)
			continue
		}
		enc := json.NewEncoder(f)
		enc.SetIndent("", "  ")
		_ = enc.Encode(blob)
		f.Close()
		ok++
	}

	fmt.Fprintf(os.Stderr, "gact dump-bundle: wrote %d sessions + version + diag + metrics → %s\n", ok, *out)
	return 0
}

// writeDiagTo writes the same content `runDiag` prints, but into an
// arbitrary writer. Extracted from runDiag so dump-bundle can capture
// the diag report into a file without process re-exec or pipes.
func writeDiagTo(w io.Writer) {
	fmt.Fprintf(w, "gact %s\n", binaryVersion)
	fmt.Fprintf(w, "  contract:   %s\n", contractVersion)
	fmt.Fprintf(w, "  runtime:    %s\n", runtime.Version())
	fmt.Fprintf(w, "  platform:   %s/%s\n", runtime.GOOS, runtime.GOARCH)
	if rev, when, dirty := readVCSInfo(); rev != "" {
		suffix := ""
		if dirty {
			suffix = " (dirty)"
		}
		fmt.Fprintf(w, "  revision:   %s%s\n", rev, suffix)
		if when != "" {
			fmt.Fprintf(w, "  built:      %s\n", when)
		}
	}
	cfgPath, err := config.DefaultPath()
	if err != nil {
		fmt.Fprintf(w, "  config path: (error: %v)\n", err)
	} else {
		fmt.Fprintf(w, "  config path: %s\n", cfgPath)
	}
	cfg, _, _ := config.Load()
	print := func(label string, val *string) {
		if val != nil && *val != "" {
			fmt.Fprintf(w, "  %s: %s\n", label, *val)
		} else {
			fmt.Fprintf(w, "  %s: (unset)\n", label)
		}
	}
	print("backend_url", cfg.BackendURL)
	print("theme      ", cfg.Theme)
	print("voice_cmd  ", cfg.VoiceCommand)
	if cfg.CollapseThreshold != nil {
		fmt.Fprintf(w, "  collapse_threshold: %d\n", *cfg.CollapseThreshold)
	}
	if cfg.CostWarnTokens != nil {
		fmt.Fprintf(w, "  cost_warn_tokens:   %d\n", *cfg.CostWarnTokens)
	}
	if cfg.CostDangerTokens != nil {
		fmt.Fprintf(w, "  cost_danger_tokens: %d\n", *cfg.CostDangerTokens)
	}
	for _, name := range []string{"GACT_BACKEND", "GACT_THEME", "GACT_VOICE_CMD", "GACT_CONFIG", "GACT_THEME_FILE"} {
		if v := os.Getenv(name); v != "" {
			fmt.Fprintf(w, "  env %s: %s\n", name, v)
		}
	}
}

// runCatalog browses the catalog endpoints from the shell:
//
//	gact catalog tools     — id  name        description
//	gact catalog agents    — id  title       description
//	gact catalog mcp       — id  status      transport
//	gact catalog commands  — id  source      title
//
// Tab-separated output so shell pipelines can grep / awk it. Use
// `gact catalog tools --format json` for the raw response shape.
func runCatalog(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact catalog tools|agents|mcp|commands [--format tsv|json]")
		return 2
	}
	kind := args[0]
	rest := args[1:]
	fs := flag.NewFlagSet("catalog "+kind, flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "tsv", "output format: tsv | json")
	if err := fs.Parse(rest); err != nil {
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var (
		payload  any
		printTSV func()
	)
	switch kind {
	case "tools":
		out, err := c.ListTools(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact catalog tools: %v\n", err)
			return 1
		}
		payload = out
		printTSV = func() {
			for _, t := range out {
				fmt.Printf("%s\t%s\n", t.Name, t.Description)
			}
		}
	case "agents":
		out, err := c.ListAgents(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact catalog agents: %v\n", err)
			return 1
		}
		payload = out
		printTSV = func() {
			for _, a := range out {
				fmt.Printf("%s\t%s\t%s\n", a.ID, a.Title, a.Description)
			}
		}
	case "mcp":
		out, err := c.ListMcpServers(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact catalog mcp: %v\n", err)
			return 1
		}
		payload = out
		printTSV = func() {
			for _, s := range out {
				fmt.Printf("%s\t%s\t%s\n", s.ID, s.Status, s.Transport)
			}
		}
	case "commands":
		out, err := c.ListCommands(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact catalog commands: %v\n", err)
			return 1
		}
		payload = out
		printTSV = func() {
			for _, cm := range out {
				fmt.Printf("%s\t%s\t%s\n", cm.ID, cm.Source, cm.Title)
			}
		}
	default:
		fmt.Fprintf(os.Stderr, "gact catalog: unknown kind %q (want tools|agents|mcp|commands)\n", kind)
		return 2
	}

	switch *format {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(payload); err != nil {
			fmt.Fprintf(os.Stderr, "gact catalog: encode: %v\n", err)
			return 1
		}
	case "tsv", "":
		printTSV()
	default:
		fmt.Fprintf(os.Stderr, "gact catalog: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	return 0
}

// runContext dispatches the `gact context <verb>` subcommand family
// for managing per-session context files (the things sidebar K14
// adds via `o`). Three verbs:
//
//	gact context list <sid>                   — print path + mode per file
//	gact context add  <sid> <path> [--mode]   — POST add (default mode=read)
//	gact context rm   <sid> <path>            — DELETE remove
//
// Verb-then-flags structure mirrors `git remote` / `kubectl`. Returns
// 2 on usage errors, 1 on transport / API errors.
func runContext(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact context list|add|rm <session_id> [path] [--mode read|edit|pin]")
		return 2
	}
	verb := args[0]
	rest := args[1:]

	switch verb {
	case "list":
		return runContextList(rest)
	case "add":
		return runContextAdd(rest)
	case "rm", "remove", "delete":
		return runContextRm(rest)
	default:
		fmt.Fprintf(os.Stderr, "gact context: unknown verb %q (want list|add|rm)\n", verb)
		return 2
	}
}

func runContextList(args []string) int {
	fs := flag.NewFlagSet("context list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact context list <session_id> [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	files, err := c.ListContextFiles(ctx, sid)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact context list: %v\n", err)
		return 1
	}
	for _, f := range files {
		mode := f.Mode
		if mode == "" {
			mode = "?"
		}
		fmt.Printf("%s\t%s\n", mode, f.Path)
	}
	return 0
}

func runContextAdd(args []string) int {
	fs := flag.NewFlagSet("context add", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	mode := fs.String("mode", "read", "context mode: read | edit | pin")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--mode": true, "-mode": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact context add <session_id> <path> [--mode read|edit|pin]")
		return 2
	}
	sid := fs.Arg(0)
	path := fs.Arg(1)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.AddContextFile(ctx, sid, path, *mode); err != nil {
		fmt.Fprintf(os.Stderr, "gact context add: %v\n", err)
		return 1
	}
	return 0
}

func runContextRm(args []string) int {
	fs := flag.NewFlagSet("context rm", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact context rm <session_id> <path> [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	path := fs.Arg(1)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.RemoveContextFile(ctx, sid, path); err != nil {
		fmt.Fprintf(os.Stderr, "gact context rm: %v\n", err)
		return 1
	}
	return 0
}

// runSummarize triggers POST /v1/sessions/{id}/summarize and prints
// the resulting Session.Summary to stdout. The endpoint may be a
// no-op + placeholder for backends that don't implement actual
// summarisation (the emulator stamps a "[auto-summary placeholder]"
// string); real backends produce real summaries asynchronously.
func runSummarize(args []string) int {
	fs := flag.NewFlagSet("summarize", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	auto := fs.Bool("auto", true, "request automatic summary if backend supports it")
	known := map[string]bool{"--backend": true, "-backend": true, "--auto": true, "-auto": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact summarize <session_id> [--auto=false] [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := c.SummarizeSession(ctx, sid, *auto); err != nil {
		fmt.Fprintf(os.Stderr, "gact summarize: %v\n", err)
		return 1
	}
	// Re-fetch to read the updated summary back.
	s, err := c.GetSession(ctx, sid)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact summarize: refetch: %v\n", err)
		return 1
	}
	if s.Summary == "" {
		fmt.Fprintln(os.Stderr, "gact summarize: backend produced empty summary")
		return 1
	}
	fmt.Println(s.Summary)
	return 0
}

// runQuick is "create + ask + delete" in one command. For users who
// just want an answer and don't care about session lifecycle:
//
//	answer=$(gact quick "what does main.go do?")
//
// Implementation is the standalone equivalent of runNew + runAsk + a
// best-effort cleanup delete. Cleanup failures are logged to stderr
// but don't change the exit code — the answer was already produced
// and that's the user-visible outcome that matters.
//
// --keep prevents the cleanup delete (useful when you want to drop
// into the TUI afterwards via the printed session id on stderr).
func runQuick(args []string) int {
	fs := flag.NewFlagSet("quick", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "workspace id; defaults to first listed")
	timeout := fs.Duration("timeout", 5*time.Minute, "abandon wait after this long")
	interval := fs.Duration("interval", 500*time.Millisecond, "wait poll cadence")
	keep := fs.Bool("keep", false, "skip the cleanup delete; print sid to stderr")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--workspace": true, "-workspace": true,
		"--timeout": true, "-timeout": true,
		"--interval": true, "-interval": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact quick <question|-> [--workspace WS_ID] [--timeout DUR] [--keep]")
		return 2
	}
	question := fs.Arg(0)
	if question == "-" {
		buf, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact quick: read stdin: %v\n", err)
			return 1
		}
		question = strings.TrimRight(string(buf), "\n")
	}
	if question == "" {
		fmt.Fprintln(os.Stderr, "gact quick: empty question")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)

	// Resolve default workspace.
	if *wsID == "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		wss, err := c.ListWorkspaces(ctx)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact quick: list workspaces: %v\n", err)
			return 1
		}
		if len(wss) == 0 {
			fmt.Fprintln(os.Stderr, "gact quick: no workspaces; pass --workspace WS_ID")
			return 1
		}
		*wsID = wss[0].ID
	}

	// Create scratch session.
	createCtx, createCancel := context.WithTimeout(context.Background(), 10*time.Second)
	s, err := c.CreateSession(createCtx, client.CreateSessionRequest{
		WorkspaceID: *wsID,
		Title:       "quick " + time.Now().UTC().Format("15:04:05"),
	})
	createCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact quick: create session: %v\n", err)
		return 1
	}
	sid := s.ID
	if *keep {
		fmt.Fprintf(os.Stderr, "gact quick: created %s (--keep, no cleanup)\n", sid)
	}

	// Schedule cleanup unless --keep.
	if !*keep {
		defer func() {
			delCtx, delCancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer delCancel()
			if delErr := c.DeleteSession(delCtx, sid); delErr != nil {
				fmt.Fprintf(os.Stderr, "gact quick: cleanup delete %s: %v\n", sid, delErr)
			}
		}()
	}

	// Send + wait + extract reply (same logic as runAsk, inlined to
	// reuse the local sid binding).
	postCtx, postCancel := context.WithTimeout(context.Background(), 10*time.Second)
	if _, err := c.PostMessage(postCtx, sid, client.PostMessageRequest{
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: question}},
	}); err != nil {
		postCancel()
		fmt.Fprintf(os.Stderr, "gact quick: send: %v\n", err)
		return 1
	}
	postCancel()

	deadline := time.Now().Add(*timeout)
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		s, err := c.GetSession(ctx, sid)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact quick: poll: %v\n", err)
			return 1
		}
		if s.Status == gact.StatusIdle {
			break
		}
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "gact quick: timeout (status=%s)\n", s.Status)
			return 2
		}
		time.Sleep(*interval)
	}

	listCtx, listCancel := context.WithTimeout(context.Background(), 10*time.Second)
	msgs, _, err := c.ListMessages(listCtx, client.MessageFilter{SessionID: sid, Limit: 10000})
	listCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact quick: list-after: %v\n", err)
		return 1
	}
	reply, ok := lastAssistantTextFromMessages(msgs)
	if !ok {
		fmt.Fprintln(os.Stderr, "gact quick: no assistant reply")
		return 1
	}
	fmt.Print(reply)
	return 0
}

// runMetrics fetches /v1/metrics and prints a human-readable summary
// to stdout (uptime, session counts, message totals, token totals,
// total cost). With --format=json, prints the raw response so
// monitoring scrapers can parse it.
func runMetrics(args []string) int {
	fs := flag.NewFlagSet("metrics", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "text", "output format: text | json")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	m, err := c.Metrics(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact metrics: %v\n", err)
		return 1
	}

	switch *format {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(m); err != nil {
			fmt.Fprintf(os.Stderr, "gact metrics: encode: %v\n", err)
			return 1
		}
	case "text", "":
		fmt.Printf("uptime:   %ds\n", m.UptimeS)
		fmt.Printf("sessions: %d total, %d active\n", m.Sessions.Total, m.Sessions.Active)
		if len(m.Sessions.ByStatus) > 0 {
			fmt.Print("  by status:")
			for k, v := range m.Sessions.ByStatus {
				fmt.Printf(" %s=%d", k, v)
			}
			fmt.Println()
		}
		fmt.Printf("messages: %d total\n", m.Messages.Total)
		if len(m.Messages.ByRole) > 0 {
			fmt.Print("  by role:")
			for k, v := range m.Messages.ByRole {
				fmt.Printf(" %s=%d", k, v)
			}
			fmt.Println()
		}
		fmt.Printf("tokens:   %d in / %d out (cache: %d read / %d write)\n",
			m.Tokens.InputTotal, m.Tokens.OutputTotal,
			m.Tokens.CacheReadTotal, m.Tokens.CacheWriteTotal)
		fmt.Printf("cost:     $%.4f total\n", m.Cost.TotalUSD)
		if len(m.Cost.ByProvider) > 0 {
			for prov, c := range m.Cost.ByProvider {
				fmt.Printf("  %s: $%.4f\n", prov, c)
			}
		}
	default:
		fmt.Fprintf(os.Stderr, "gact metrics: unknown format %q (want text|json)\n", *format)
		return 2
	}
	return 0
}

// runArchive PATCHes session.archived. `archived=true` hides the
// session from the default sidebar view (TUI's `h` toggles back);
// `archived=false` restores it. Same code path for both via the
// boolean argument so the two subcommand cases stay one-liners.
func runArchive(args []string, archived bool) int {
	verb := "archive"
	if !archived {
		verb = "unarchive"
	}
	fs := flag.NewFlagSet(verb, flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintf(os.Stderr, "usage: gact %s <session_id> [--backend URL]\n", verb)
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.PatchSession(ctx, sid, client.PatchSessionRequest{Archived: &archived}); err != nil {
		fmt.Fprintf(os.Stderr, "gact %s: %v\n", verb, err)
		return 1
	}
	return 0
}

// runCompletion writes a shell-completion script to stdout. Supports
// bash, zsh, and fish — each emits a static list of subcommands +
// the most common flags. We don't try to enumerate every flag of
// every subcommand because (a) the list grows organically and (b)
// users tab-complete the subcommand name + filename half the time
// anyway.
func runCompletion(args []string) int {
	if len(args) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact completion bash|zsh|fish")
		return 2
	}
	switch args[0] {
	case "bash":
		fmt.Print(bashCompletionScript)
	case "zsh":
		fmt.Print(zshCompletionScript)
	case "fish":
		fmt.Print(fishCompletionScript)
	default:
		fmt.Fprintf(os.Stderr, "gact completion: unknown shell %q (want bash|zsh|fish)\n", args[0])
		return 2
	}
	return 0
}

const bashCompletionScript = `# gact bash completion. Source manually or copy to /etc/bash_completion.d/gact.
_gact() {
    local cur prev cmds
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    cmds="agent agents archive ask cancel capabilities caps catalog completion context delete diag diff dump-bundle emit-config export files fork hooks import info list log mcp metrics models new perms ping quick rename repo-map run search send stream summarize tail tell tool tools unarchive undo version wait watch workspaces"

    if [ $COMP_CWORD -eq 1 ]; then
        COMPREPLY=( $(compgen -W "$cmds" -- "$cur") )
        return 0
    fi
    case "$prev" in
        --backend|--workspace|--theme|--voice-cmd|--out|-o|--timeout|--interval|--limit|--title|--format)
            return 0 ;;
        completion)
            COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") ) ;;
    esac
    return 0
}
complete -F _gact gact
`

const zshCompletionScript = `#compdef gact
_gact() {
    local -a cmds
    cmds=(agent agents archive ask cancel capabilities caps catalog completion context delete diag diff dump-bundle emit-config export files fork hooks import info list log mcp metrics models new perms ping quick rename repo-map run search send stream summarize tail tell tool tools unarchive undo version wait watch workspaces)
    if (( CURRENT == 2 )); then
        _describe 'subcommand' cmds
        return
    fi
    case "$words[2]" in
        completion) _values 'shell' bash zsh fish ;;
    esac
}
compdef _gact gact
`

const fishCompletionScript = `# gact fish completion
complete -c gact -n "__fish_use_subcommand" -a "agent agents archive ask cancel capabilities caps catalog completion context delete diag diff dump-bundle emit-config export files fork hooks import info list log mcp metrics models new perms ping quick rename repo-map run search send stream summarize tail tell tool tools unarchive undo version wait watch workspaces"
complete -c gact -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"
`

// runRename PATCHes the session title. Useful in scripts that want
// to label a session retroactively (e.g. after the first reply
// lands and you know what the conversation was actually about).
func runRename(args []string) int {
	fs := flag.NewFlagSet("rename", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact rename <session_id> <new-title> [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	title := fs.Arg(1)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.PatchSession(ctx, sid, client.PatchSessionRequest{Title: &title}); err != nil {
		fmt.Fprintf(os.Stderr, "gact rename: %v\n", err)
		return 1
	}
	return 0
}

// runNew creates a new session and prints its id to stdout. With no
// flags, defaults the workspace to the first one in the backend's
// /v1/workspaces list (matches what the TUI does on startup) and the
// title to "session HH:MM:SS UTC". Pure shell plumbing:
//
//	SID=$(gact new --title "scratch")
//	gact ask "$SID" "what does main.go do?"
func runNew(args []string) int {
	fs := flag.NewFlagSet("new", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "workspace id; defaults to first listed")
	title := fs.String("title", "", "session title; defaults to current UTC time")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if *wsID == "" {
		wss, err := c.ListWorkspaces(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact new: list workspaces: %v\n", err)
			return 1
		}
		if len(wss) == 0 {
			fmt.Fprintln(os.Stderr, "gact new: no workspaces; pass --workspace WS_ID")
			return 1
		}
		*wsID = wss[0].ID
	}
	if *title == "" {
		*title = "session " + time.Now().UTC().Format("15:04:05 UTC")
	}

	s, err := c.CreateSession(ctx, client.CreateSessionRequest{
		WorkspaceID: *wsID,
		Title:       *title,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact new: %v\n", err)
		return 1
	}
	fmt.Println(s.ID)
	return 0
}

// runAsk is `run` + extract: posts a user message, waits for idle,
// then prints the assistant's reply text to stdout. Pure stdout
// (no role headers, no trailing newline) so shell capture works:
//
//	answer=$(gact ask "$SID" "what does main.go do?")
//	echo "got: $answer"
//
// Exits 0 on a non-empty reply, 1 if no assistant text appeared
// after the wait, 2 on bad args.
func runAsk(args []string) int {
	fs := flag.NewFlagSet("ask", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	timeout := fs.Duration("timeout", 5*time.Minute, "abandon wait after this long")
	interval := fs.Duration("interval", 500*time.Millisecond, "wait poll cadence")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--timeout": true, "-timeout": true,
		"--interval": true, "-interval": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact ask <session_id> <question|-> [--timeout DUR] [--interval DUR]")
		return 2
	}
	sid := fs.Arg(0)
	question := fs.Arg(1)
	if question == "-" {
		buf, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact ask: read stdin: %v\n", err)
			return 1
		}
		question = strings.TrimRight(string(buf), "\n")
	}
	if question == "" {
		fmt.Fprintln(os.Stderr, "gact ask: empty question")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)

	// Snapshot the message count BEFORE sending so we know which
	// assistant messages are "new" replies vs pre-existing context.
	var preCount int
	{
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		msgs, _, err := c.ListMessages(ctx, client.MessageFilter{SessionID: sid, Limit: 10000})
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact ask: list messages: %v\n", err)
			return 1
		}
		preCount = len(msgs)
	}

	// Send.
	postCtx, postCancel := context.WithTimeout(context.Background(), 10*time.Second)
	if _, err := c.PostMessage(postCtx, sid, client.PostMessageRequest{
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: question}},
	}); err != nil {
		postCancel()
		fmt.Fprintf(os.Stderr, "gact ask: send: %v\n", err)
		return 1
	}
	postCancel()

	// Wait for idle.
	deadline := time.Now().Add(*timeout)
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		s, err := c.GetSession(ctx, sid)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact ask: poll: %v\n", err)
			return 1
		}
		if s.Status == gact.StatusIdle {
			break
		}
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "gact ask: timeout (status=%s)\n", s.Status)
			return 2
		}
		time.Sleep(*interval)
	}

	// Read messages added since pre-send and concatenate the
	// newest assistant text. This handles backends that emit
	// multiple assistant turns (subagent fan-out, etc.) — only
	// the latest assistant text is what the user "asked for".
	listCtx, listCancel := context.WithTimeout(context.Background(), 10*time.Second)
	msgs, _, err := c.ListMessages(listCtx, client.MessageFilter{SessionID: sid, Limit: 10000})
	listCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact ask: list-after: %v\n", err)
		return 1
	}
	if len(msgs) <= preCount {
		fmt.Fprintln(os.Stderr, "gact ask: no new messages after wait")
		return 1
	}
	added := msgs[preCount:]
	reply, ok := lastAssistantTextFromMessages(added)
	if !ok {
		fmt.Fprintln(os.Stderr, "gact ask: no assistant reply in new messages")
		return 1
	}
	fmt.Print(reply)
	return 0
}

// lastAssistantTextFromMessages walks msgs in reverse for the newest
// assistant message and returns its concatenated text content. Same
// rule as the TUI's lastAssistantText, kept inline here so main has
// no dependency on internal/ui.
func lastAssistantTextFromMessages(msgs []gact.Message) (string, bool) {
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		if m.Role != gact.RoleAssistant {
			continue
		}
		var b strings.Builder
		for _, p := range m.Parts {
			if p.Type != gact.PartTypeText || p.Text == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n\n")
			}
			b.WriteString(p.Text)
		}
		if b.Len() == 0 {
			continue
		}
		return b.String(), true
	}
	return "", false
}

// runLog dumps a session's conversation to stdout in a human-readable
// shape — `[role] message text` per turn, with one-line summaries of
// tool_call / tool_result parts. Exits 0 on success. Useful to read
// what happened in a session without launching the TUI.
//
// Output is intentionally plain (no ANSI) so it's grep-friendly. If
// users want JSON, they should use `gact export <sid>` which already
// returns the raw blob.
func runLog(args []string) int {
	fs := flag.NewFlagSet("log", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	limit := fs.Int("limit", 100, "max messages to print")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--limit": true, "-limit": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact log <session_id> [--limit N] [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	msgs, _, err := c.ListMessages(ctx, client.MessageFilter{SessionID: sid, Limit: *limit, IncludeSystem: true})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact log: %v\n", err)
		return 1
	}
	for _, m := range msgs {
		fmt.Printf("[%s @ %s]\n", strings.ToUpper(m.Role), m.CreatedAt.UTC().Format(time.RFC3339))
		for _, p := range m.Parts {
			switch p.Type {
			case gact.PartTypeText:
				if p.Text != "" {
					fmt.Println(indent(p.Text, "  "))
				}
			case gact.PartTypeThinking:
				if p.Thinking != "" {
					fmt.Println(indent("(thinking) "+p.Thinking, "  "))
				}
			case gact.PartTypeToolCall:
				args, _ := json.Marshal(p.Input)
				fmt.Printf("  → %s(%s)\n", p.ToolName, string(args))
			case gact.PartTypeToolResult:
				body := flattenToolResultParts(p.Content)
				prefix := "  ⎿ "
				if p.IsError {
					prefix = "  ⎿! "
				}
				fmt.Println(indent(body, prefix))
			case gact.PartTypeFileDiff:
				fmt.Printf("  ◇ diff %s\n", p.Path)
			}
		}
		fmt.Println()
	}
	return 0
}

// indent prefixes every line of s with prefix. Used by `gact log` to
// keep multi-line bodies aligned under their role header.
func indent(s, prefix string) string {
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	for i := range lines {
		lines[i] = prefix + lines[i]
	}
	return strings.Join(lines, "\n")
}

// flattenToolResultParts joins a tool_result's nested text parts with
// blank lines — same flattening shape the TUI render uses.
func flattenToolResultParts(parts []gact.Part) string {
	var b strings.Builder
	for i, p := range parts {
		if p.Type != gact.PartTypeText {
			continue
		}
		if i > 0 && b.Len() > 0 {
			b.WriteString("\n")
		}
		b.WriteString(p.Text)
	}
	return b.String()
}

// runCancel POSTs /v1/sessions/{id}/cancel. Exits 0 on 204, 1 on
// transport / API error. Symmetric with the TUI's Ctrl+X but reachable
// from shell scripts.
func runCancel(args []string) int {
	fs := flag.NewFlagSet("cancel", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact cancel <session_id> [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.CancelSession(ctx, sid); err != nil {
		fmt.Fprintf(os.Stderr, "gact cancel: %v\n", err)
		return 1
	}
	return 0
}

// runRun is `gact send` followed by `gact wait` — a single command
// for "ask + block until reply" shell pipelines. Prints the message
// id once accepted, then blocks. Honours the same --timeout /
// --interval flags as wait.
func runRun(args []string) int {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	timeout := fs.Duration("timeout", 5*time.Minute, "abandon wait after this long")
	interval := fs.Duration("interval", 500*time.Millisecond, "wait poll cadence")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--timeout": true, "-timeout": true,
		"--interval": true, "-interval": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact run <session_id> <text|-> [--backend URL] [--timeout DUR] [--interval DUR]")
		return 2
	}
	sid := fs.Arg(0)
	text := fs.Arg(1)
	if text == "-" {
		buf, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact run: read stdin: %v\n", err)
			return 1
		}
		text = strings.TrimRight(string(buf), "\n")
	}
	if text == "" {
		fmt.Fprintln(os.Stderr, "gact run: empty text")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)

	postCtx, postCancel := context.WithTimeout(context.Background(), 10*time.Second)
	resp, err := c.PostMessage(postCtx, sid, client.PostMessageRequest{
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: text}},
	})
	postCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact run: send: %v\n", err)
		return 1
	}
	fmt.Println(resp.MessageID)

	deadline := time.Now().Add(*timeout)
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		s, err := c.GetSession(ctx, sid)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact run: poll: %v\n", err)
			return 1
		}
		if s.Status == gact.StatusIdle {
			return 0
		}
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "gact run: timeout after %s (status=%s)\n", *timeout, s.Status)
			return 2
		}
		time.Sleep(*interval)
	}
}

// runWait blocks until a session's status is idle, then exits 0.
// Polls GET /v1/sessions/{id} on a short interval rather than SSE —
// simpler, no reconnect loop, and a second of lag is fine for shell
// chaining. Exits with code 2 on timeout, 1 on transport error.
//
// Usage chain:
//
//	SID=$(gact list | head -1 | cut -f1)
//	gact send "$SID" "please read main.go" && \
//	  gact wait "$SID" && \
//	  gact tail "$SID" | head -20
func runWait(args []string) int {
	fs := flag.NewFlagSet("wait", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	timeout := fs.Duration("timeout", 5*time.Minute, "abandon after this long")
	interval := fs.Duration("interval", 500*time.Millisecond, "poll cadence")
	known := map[string]bool{"--backend": true, "-backend": true, "--timeout": true, "-timeout": true, "--interval": true, "-interval": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact wait <session_id> [--timeout DUR] [--interval DUR]")
		return 2
	}
	sid := fs.Arg(0)

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)

	deadline := time.Now().Add(*timeout)
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		s, err := c.GetSession(ctx, sid)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact wait: %v\n", err)
			return 1
		}
		if s.Status == gact.StatusIdle {
			return 0
		}
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "gact wait: timeout after %s (status=%s)\n", *timeout, s.Status)
			return 2
		}
		time.Sleep(*interval)
	}
}

// runSend posts a single user text message to a session from the
// shell. Accepts `-` as the text to read from stdin so pipes work:
//
//	echo "please read main.go" | gact send SID -
//	gact send SID "what does this project do?"
//
// Exits 0 on 202 Accepted; prints the returned message_id to stdout.
func runSend(args []string) int {
	fs := flag.NewFlagSet("send", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact send <session_id> <text|-> [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	text := fs.Arg(1)
	if text == "-" {
		buf, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact send: read stdin: %v\n", err)
			return 1
		}
		text = strings.TrimRight(string(buf), "\n")
	}
	if text == "" {
		fmt.Fprintln(os.Stderr, "gact send: empty text")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := c.PostMessage(ctx, sid, client.PostMessageRequest{
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: text}},
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact send: %v\n", err)
		return 1
	}
	fmt.Println(resp.MessageID)
	return 0
}

// runTail streams SSE events for a session (or workspace) to stdout
// as newline-delimited JSON. Each line contains {"type", "seq",
// "payload"}. Exits when the connection closes or Ctrl+C fires.
//
// Usage examples:
//
//	gact tail sess_abc123              # one session
//	gact tail --workspace ws_default   # workspace-scoped stream
//	gact tail SID | jq '.type'         # filter on event type
func runTail(args []string) int {
	fs := flag.NewFlagSet("tail", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "workspace-scoped stream (when no session_id)")
	known := map[string]bool{"--backend": true, "-backend": true, "--workspace": true, "-workspace": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}

	scope := client.EventStreamScope{WorkspaceID: *wsID}
	if fs.NArg() == 1 {
		scope.SessionID = fs.Arg(0)
	} else if fs.NArg() > 1 {
		fmt.Fprintln(os.Stderr, "usage: gact tail [session_id] [--workspace WS_ID] [--backend URL]")
		return 2
	}
	if scope.SessionID == "" && scope.WorkspaceID == "" {
		fmt.Fprintln(os.Stderr, "gact tail: specify either <session_id> or --workspace WS_ID")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)

	// Signal handling: Ctrl+C cleanly closes the stream.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	events, errs, err := c.StreamEvents(ctx, scope)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tail: connect: %v\n", err)
		return 1
	}

	enc := json.NewEncoder(os.Stdout)
	for {
		select {
		case <-ctx.Done():
			return 0
		case e, ok := <-events:
			if !ok {
				return 0
			}
			record := map[string]any{
				"type":    e.Type,
				"seq":     e.SeqID(),
				"payload": e.Payload,
			}
			if err := enc.Encode(record); err != nil {
				fmt.Fprintf(os.Stderr, "gact tail: encode: %v\n", err)
				return 1
			}
		case err, ok := <-errs:
			if !ok {
				return 0
			}
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact tail: stream: %v\n", err)
				return 1
			}
		}
	}
}

// runPing hits /v1/health and exits 0 on 200, non-zero otherwise.
// Shell-script-friendly: `gact ping && echo ok` works as expected.
func runPing(args []string) int {
	fs := flag.NewFlagSet("ping", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	quiet := fs.Bool("q", false, "suppress stdout output; only exit code")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	h, err := c.Health(ctx)
	if err != nil {
		if !*quiet {
			fmt.Fprintf(os.Stderr, "gact ping: %v\n", err)
		}
		return 1
	}
	if !h.Healthy {
		if !*quiet {
			fmt.Fprintf(os.Stderr, "gact ping: backend reports unhealthy\n")
		}
		return 1
	}
	if !*quiet {
		fmt.Printf("ok: %s (uptime %ds)\n", finalBackend, h.UptimeS)
	}
	return 0
}

func runList(args []string) int {
	fs := flag.NewFlagSet("list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "only sessions in this workspace")
	parentID := fs.String("parent", "", "only sub-sessions of this session id")
	status := fs.String("status", "", "filter by status (idle|running|waiting|error)")
	archived := fs.Bool("archived", false, "include archived sessions")
	limit := fs.Int("limit", 0, "truncate to first N rows after filtering (0 = no limit)")
	format := fs.String("format", "tsv", "output format: tsv | json")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *status != "" {
		switch *status {
		case "idle", "running", "waiting", "error":
		default:
			fmt.Fprintf(os.Stderr, "gact list: unknown --status %q (want idle|running|waiting|error)\n", *status)
			return 2
		}
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	sessions, err := c.ListSessions(ctx, client.SessionFilter{
		WorkspaceID:     *wsID,
		ParentSessionID: *parentID,
		Archived:        *archived,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact list: %v\n", err)
		return 1
	}
	if *status != "" {
		filtered := sessions[:0]
		for _, s := range sessions {
			if s.Status == *status {
				filtered = append(filtered, s)
			}
		}
		sessions = filtered
	}
	if *limit > 0 && len(sessions) > *limit {
		sessions = sessions[:*limit]
	}

	switch *format {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(sessions); err != nil {
			fmt.Fprintf(os.Stderr, "gact list: encode: %v\n", err)
			return 1
		}
	case "tsv", "":
		for _, s := range sessions {
			title := s.Title
			if title == "" {
				title = "(untitled)"
			}
			fmt.Printf("%s\t%s\t%s\t%s\n",
				s.ID, s.Status, title, s.UpdatedAt.UTC().Format(time.RFC3339))
		}
	default:
		fmt.Fprintf(os.Stderr, "gact list: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	return 0
}

func runExport(args []string) int {
	fs := flag.NewFlagSet("export", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	out := fs.String("o", "-", "output file path; '-' for stdout")
	all := fs.Bool("all", false, "export every session; writes one JSON per session into --out dir")
	wsID := fs.String("workspace", "", "with --all, restrict to one workspace")
	knownFlags := map[string]bool{"-o": true, "--backend": true, "-backend": true, "--workspace": true, "-workspace": true}
	if err := fs.Parse(reorderFlagsFirst(args, knownFlags)); err != nil {
		return 2
	}

	// V1: bulk export path. Takes --out as a directory (created if
	// absent) and writes one <session_id>.json per session; tolerates
	// per-session fetch errors so one bad session doesn't abort the
	// whole snapshot. Prints a summary to stderr.
	if *all {
		if *out == "-" || *out == "" {
			fmt.Fprintln(os.Stderr, "gact export --all requires -o DIR (cannot dump to stdout)")
			return 2
		}
		return runExportAll(*out, *wsID, *backend)
	}

	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact export <session_id> [-o path] [--backend URL]\n" +
			"   or: gact export --all -o DIR [--workspace WS_ID] [--backend URL]")
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

// runExportAll walks every session (optionally scoped to a workspace)
// and writes one indented JSON per session into dir. Continues past
// per-session fetch errors — one 500 on a single session shouldn't
// trash the whole backup — and reports a summary to stderr.
func runExportAll(dir, wsID, backendFlag string) int {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "gact export: mkdir %s: %v\n", dir, err)
		return 1
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), backendFlag, defaultBackend)
	c := client.New(finalBackend)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact export: list sessions: %v\n", err)
		return 1
	}
	if len(sessions) == 0 {
		fmt.Fprintln(os.Stderr, "gact export: no sessions to export")
		return 0
	}

	ok := 0
	failed := 0
	for _, s := range sessions {
		ectx, ecancel := context.WithTimeout(context.Background(), 30*time.Second)
		blob, err := c.ExportSession(ectx, s.ID)
		ecancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "  %s: %v\n", s.ID, err)
			failed++
			continue
		}
		path := filepath.Join(dir, s.ID+".json")
		f, err := os.Create(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "  %s: create %s: %v\n", s.ID, path, err)
			failed++
			continue
		}
		enc := json.NewEncoder(f)
		enc.SetIndent("", "  ")
		if err := enc.Encode(blob); err != nil {
			f.Close()
			fmt.Fprintf(os.Stderr, "  %s: encode: %v\n", s.ID, err)
			failed++
			continue
		}
		f.Close()
		ok++
	}
	fmt.Fprintf(os.Stderr, "gact export: %d ok, %d failed → %s\n", ok, failed, dir)
	if failed > 0 {
		return 1
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
		// Lone "-" is a positional convention (stdin sentinel) —
		// keep it out of the flags bucket. Without this, runSend's
		// `gact send SID -` interprets the `-` as an unknown flag.
		if a == "-" {
			positional = append(positional, a)
			i++
			continue
		}
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
