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
	"image/color"
	"io"
	"path"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"runtime/debug"
	"sort"
	"strings"
	"sync"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/conformance"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
	"github.com/JaimeCernuda/gact-tui/tui/internal/plugins"
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
		case "rewind":
			os.Exit(runRewind(os.Args[2:]))
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
		case "attach":
			runAttach(os.Args[2:])
			return
		case "voice":
			os.Exit(runVoice(os.Args[2:]))
		case "bench":
			os.Exit(runBench(os.Args[2:]))
		case "conformance":
			os.Exit(runConformance(os.Args[2:]))
		case "dashboard", "dash":
			os.Exit(runDashboard(os.Args[2:]))
		case "detached":
			// AAAAAAAA1: list (or prune) sessions the user has
			// detached from across reboots.
			os.Exit(runDetached(os.Args[2:]))
		case "resume":
			// IIIIIIII1: `gact resume` is a more-discoverable alias
			// for `gact attach` with no arguments — attaches to the
			// most-recent Ctrl+Z-detached session on the current
			// backend. Any trailing args are rejected so the alias
			// stays narrow ("resume X" should be `attach X` — we
			// don't want two ways to pick a specific sid).
			if len(os.Args) > 2 {
				fmt.Fprintln(os.Stderr, "usage: gact resume  (no args — use `gact attach <sid>` for a specific session)")
				os.Exit(2)
			}
			runAttach(nil)
			return
		case "grep":
			os.Exit(runGrep(os.Args[2:]))
		case "follow":
			os.Exit(runFollow(os.Args[2:]))
		case "replay":
			runReplay(os.Args[2:])
			return
		case "env":
			os.Exit(runEnv(os.Args[2:]))
		case "theme":
			os.Exit(runTheme(os.Args[2:]))
		case "hooks", "hook":
			os.Exit(runHooks(os.Args[2:]))
		case "tasks", "task":
			os.Exit(runTasks(os.Args[2:]))
		case "plugins", "plugin":
			os.Exit(runPlugins(os.Args[2:]))
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
	pt := 3
	sample := config.Config{
		BackendURL:             &bk,
		Theme:                  &th,
		VoiceCommand:           &vc,
		CollapseThreshold:      &ct,
		CostWarnTokens:         &cw,
		CostDangerTokens:       &cd,
		PasteCompressThreshold: &pt,
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
  gact tail [SID]            stream SSE events (NDJSON default; --format text for human one-liners)
  gact ping                  probe /v1/health (exit 0 if healthy)
  gact send <sid> <text|->   post a user message to a session
  gact wait <sid>            block until the session status is idle
  gact cancel <sid>          POST /v1/sessions/{id}/cancel
  gact run <sid> <text|->    send + wait in one command
  gact log <sid>             dump conversation messages (text by default; --format json for NDJSON)
                              --role user,assistant,tool,system filters to one or more roles
                              --grep REGEX drops messages whose text doesn't match (case-insensitive)
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
  gact context list <sid>    list session context files; --mode read|edit|pin --glob PATTERN to filter
  gact context add <sid> <p> attach a file (--mode read|edit|pin)
  gact context rm <sid> <p>  detach a file
  gact catalog <kind>        list tools|agents|mcp|commands (TSV or JSON)
  gact dump-bundle [-o DIR]  diag + metrics + every session as a bundle
  gact stream [SID]          pretty-print SSE events as a one-liner timeline; --filter type1,type2 to narrow
  gact perms list <sid>      list permissions for a session
  gact perms allow <pid>     allow / deny / allow-session / allow-workspace
  gact diff list <sid>       list file_diff parts (path + status)
  gact diff apply <sid> [p…] apply pending diffs (no paths = all)
  gact diff reject <sid> [p…] reject pending diffs
  gact search <sid> <query>  full-text search across session messages
  gact workspaces list       list workspaces (TSV: id  name  root_path)
  gact fork <sid> [--at MID] spawn a child session forked from another
  gact models list           list providers + models (TSV: pid mid name ctx)
  gact info <sid>            print one session's metadata; --include tasks,hooks,perms for composite view
  gact undo <sid> [--count N] revert the last N messages (default 1)
  gact rewind <sid> <mid>    delete every message after <mid> [--include-target]
  gact files list <ws-id>    list workspace files; --glob PATTERN to filter (e.g. '*.go')
  gact files read <ws-id> <path> dump file bytes to stdout
  gact repo-map <ws-id>      tree-render the workspace repo map
  gact mcp list              list all connected MCP servers (TSV or JSON)
  gact mcp tools <srv-id>    list one MCP server's tools (TSV or JSON)
  gact mcp resources <srv-id> list one MCP server's resources
  gact mcp prompts <srv-id>  list one MCP server's prompt templates
  gact mcp reconnect <srv-id> force-reconnect an MCP server
  gact mcp resource-read <srv-id> <uri> dump MCP resource bytes to stdout
  gact tool show <id>        print one tool's metadata + input schema
  gact agent show <id>       print one agent's metadata + system prompt
  gact watch <sid>           tail status changes (TSV default; --format json for NDJSON)
  gact capabilities          backend contract version + capability matrix
  gact tell <name> <msg>     find-or-create session by title; send + print reply
                              (re-run with same name to continue the conversation)
                              --async returns immediately with sid<TAB>msg_id
  gact attach [<name|sid>]   launch the TUI pre-selected on a session;
                              no arg = most-recent Ctrl+Z-detached on this backend
                              --print-only: resolve + print sid, no TUI (for scripting)
  gact resume                alias for gact attach (no args) — resume most-recent detach
  gact voice <sid> <audio>   POST audio bytes to /voice/transcribe; print text
  gact bench [-n N]          run N turns; report p50/p90/p99 latency
  gact conformance           run contract/conformance suite against backend
  gact dashboard             one-shot table of every session; --status idle|running|waiting|error to filter
                              --sort newest|oldest|status|tokens|backend (default: newest)
                              --detached-only restricts rows to the local detached registry
  gact detached              list sessions you've Ctrl+Z-detached from
                              --rm <sid[,sid,...]> drops one or many; --probe checks each is still on the backend
                              --prune-dead probes + removes every dead entry in one shot
  gact grep <query>          search across all sessions; --limit N to truncate (0 = unlimited)
                              --role user,assistant,tool,system narrows hits by role
  gact follow <sid>          tail -f the conversation log; --format text|json (NDJSON)
                              --role user,assistant,tool,system filters (same shape as gact log)
                              --grep REGEX drops messages whose text doesn't match (case-insensitive)
                              --since DUR trims the initial snapshot (streamed messages always emit)
  gact replay <file|-> [--attach] import a session export; --attach launches TUI on it
  gact env [--format tsv|json] print resolved config + GACT_* env vars
  gact theme show [--name N] print active theme palette as TSV (key\thex)
  gact theme list            list available palettes; '*' marks active
  gact theme set <name>      persist theme to config.json (env still wins)
  gact hooks list|add|rm     manage §6.17 event hooks
                              add: --event STR --command PATH or --url URL
                                   [--session SID] [--workspace WS_ID]
  gact tasks list|add|set|rm manage §6.18 session tasks
                              add: <sid> <title> [--status pending|…]
                              set: <task-id> [--title T] [--status S]
  gact plugins list|dir      list/inspect plugins under
                              ~/.config/gact/plugins/<name>/plugin.json

Common flags (all subcommands):
  --backend URL    GACT backend URL  (env: GACT_BACKEND)
  --theme STR      dark | light      (env: GACT_THEME)

TUI-only flags:
  --voice-cmd STR  shell command that records audio to stdout, run on
                   Ctrl+Y. See scripts/voice-record.sh for an example.
                   (env: GACT_VOICE_CMD, config: voice_command)`)
}

// runAttach: `gact attach [<name|sid>]` — launch the TUI pre-selected
// on a session. With no argument, defaults to the most recently
// Ctrl+Z-detached session on the current backend (CCCCCCCC1). Exits
// via os.Exit when done. Env var GACT_ATTACH_SESSION_ID is the
// bridge into runTUI's setup so the flag-parse path doesn't need
// new flags.
func runAttach(args []string) {
	// AAAAAAAAA1: extract --print-only (no value) ahead of the target
	// arg so the two usages compose cleanly:
	//   gact attach <name>           — launch TUI
	//   gact attach <name> --print-only  — print sid only, no TUI
	//   gact attach --print-only     — resolve no-args default, print
	printOnly := false
	kept := args[:0]
	for _, a := range args {
		if a == "--print-only" || a == "-print-only" {
			printOnly = true
			continue
		}
		kept = append(kept, a)
	}
	args = kept

	if len(args) > 1 {
		fmt.Fprintln(os.Stderr, "usage: gact attach [<name|sess_id>] [--print-only]")
		os.Exit(2)
	}
	target := ""
	if len(args) == 1 {
		target = args[0]
	} else {
		// CCCCCCCC1: no-arg path. Look up the most-recent detach for
		// the current backend (env > config > built-in default — same
		// resolution runTUI uses) and attach there. Friction-killer
		// for the common loop: gact → work → Ctrl+Z → `gact attach`.
		sid, err := defaultAttachTarget()
		if err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(2)
		}
		target = sid
	}
	// AAAAAAAAA1: --print-only short-circuits the TUI launch so
	// scripts can resolve the target sid without running bubbletea.
	// For a no-arg invocation, defaultAttachTarget already printed
	// the `attaching to most-recent detach: ...` hint to stderr; the
	// sid also goes to stdout so pipelines can capture it cleanly.
	// For an explicit name/sid, no hint is printed (we can't fuzzy-
	// resolve without a live backend, and the caller passed the
	// string so no disambiguation needed).
	if printOnly {
		fmt.Println(target)
		os.Exit(0)
	}
	_ = os.Setenv("GACT_ATTACH_SESSION_ID", target)
	// Trim os.Args so runTUI's flag.Parse doesn't choke on "attach
	// <name>" remnants. Set os.Args to just the program name.
	os.Args = []string{os.Args[0]}
	runTUI()
}

// defaultAttachTarget reads the detached.json registry and returns
// the SessionID of the most-recent record matching the current
// backend that the backend can still confirm exists. Probes each
// candidate newest-first and skips dead entries — a registry left
// over from a backend restart shouldn't crash the TUI on attach
// (FFFFFFFF1). Returns a typed error when nothing applies so the
// caller can exit with a helpful message instead of an opaque
// attach-failed crash later.
//
// Backend resolution mirrors runTUI's precedence: env > flag >
// config > built-in default. Flags aren't parsed yet here so we
// fall back to env-or-config-or-default.
func defaultAttachTarget() (string, error) {
	return defaultAttachTargetWithProbe(probeSessionAlive)
}

// defaultAttachTargetWithProbe is the testable variant — accepts a
// probe func so tests can stub liveness without standing up an HTTP
// server. defaultAttachTarget calls this with the real HTTP probe.
func defaultAttachTargetWithProbe(probe func(backend, sid string) bool) (string, error) {
	cfg, _, _ := config.Load()
	envBackend := os.Getenv("GACT_BACKEND")
	backend := config.Resolve(cfg.BackendURL, envBackend, "", defaultBackend)
	regPath, err := config.DetachedPath()
	if err != nil {
		return "", fmt.Errorf("gact attach: %v", err)
	}
	reg, err := config.LoadDetached(regPath)
	if err != nil {
		return "", fmt.Errorf("gact attach: read registry %s: %v", regPath, err)
	}
	skipped := 0
	for _, r := range reg.Records {
		if r.Backend != backend {
			continue
		}
		if !probe(r.Backend, r.SessionID) {
			skipped++
			continue
		}
		if skipped > 0 {
			fmt.Fprintf(os.Stderr, "attaching to %s (%s) — skipped %d dead entry(ies)\n",
				r.SessionID, r.Title, skipped)
		} else {
			fmt.Fprintf(os.Stderr, "attaching to most-recent detach: %s (%s)\n",
				r.SessionID, r.Title)
		}
		return r.SessionID, nil
	}
	if skipped > 0 {
		return "", fmt.Errorf("gact attach: %d detached entry(ies) on %s but none are still alive — `gact detached --probe` to inspect, or attach by sid explicitly", skipped, backend)
	}
	return "", fmt.Errorf("gact attach: no detached sessions on %s — Ctrl+Z in the TUI records one, or `gact detached` to inspect across backends", backend)
}

// probeSessionAlive is the production probe — a 2-second HTTP GET
// against /v1/sessions/{sid}. Any error or non-2xx response means
// "not alive" so a transient backend hiccup is treated the same as
// a deleted session. Slightly conservative but safer than letting
// the TUI hang on a bad attach target.
func probeSessionAlive(backend, sid string) bool {
	c := client.New(backend)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, err := c.GetSession(ctx, sid)
	return err == nil
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
	noIntro := flag.Bool("no-intro", false,
		"skip the JJJ1 splash screen (also: intro_skip in config)")
	introFile := flag.String("intro-file", "",
		"path to ASCII splash file (logo block, blank line, name block); env GACT_INTRO_FILE; config intro_file")
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
	// BBBBBBBB1: seed the previously-detached set so the sidebar can
	// mark sessions the user already walked away from. Soft-fails:
	// missing/malformed registry just means no markers on this run.
	if path, err := config.DetachedPath(); err == nil {
		if reg, err := config.LoadDetached(path); err == nil {
			entries := make([]ui.DetachedRegistryEntry, 0, len(reg.Records))
			for _, r := range reg.Records {
				entries = append(entries, ui.DetachedRegistryEntry{
					SessionID: r.SessionID,
					Backend:   r.Backend,
				})
			}
			app.LoadDetachedRegistry(entries)
		}
		// Wire the prune callback so x/x in the sidebar removes the
		// session from the registry too — best-effort, errors are
		// swallowed since the user has just deleted the session and
		// can't act on a registry-write failure.
		app.PruneDetachedRegistry = func(sid string) {
			_, _ = config.RemoveDetached(path, finalBackend, sid)
		}
	}
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
	// YYYYY1: restore paste-compress threshold (defaults to 3 via
	// Theme.applyStyles when nil/zero).
	if cfg.PasteCompressThreshold != nil && *cfg.PasteCompressThreshold > 0 {
		app.Theme.PasteCompressThreshold = *cfg.PasteCompressThreshold
	}
	// LLL2: restore disabled tools so the catalog browser hides them
	// across restarts.
	if len(cfg.DisabledTools) > 0 {
		app.SetDisabledTools(cfg.DisabledTools)
	}
	// JJJ1: enable splash unless --no-intro / GACT_NO_INTRO /
	// intro_skip in config. Load custom intro file if set.
	skipIntro := *noIntro
	if !skipIntro && os.Getenv("GACT_NO_INTRO") != "" {
		skipIntro = true
	}
	if !skipIntro && cfg.IntroSkip != nil && *cfg.IntroSkip {
		skipIntro = true
	}
	if !skipIntro {
		app.EnableIntro()
	}
	// YYYYY1: mirror the resolved skip-intro state onto the App so
	// Settings → TUI sees the current value when the user opens it.
	app.IntroDisabled = skipIntro
	finalIntroFile := *introFile
	if finalIntroFile == "" {
		finalIntroFile = os.Getenv("GACT_INTRO_FILE")
	}
	if finalIntroFile == "" && cfg.IntroFile != nil {
		finalIntroFile = *cfg.IntroFile
	}
	if finalIntroFile != "" {
		_ = app.SetIntroFromFile(finalIntroFile)
	}
	// OOO1: pre-select session from `gact attach <name|sid>` via env
	// bridge. Empty = default behaviour (first row).
	if attach := os.Getenv("GACT_ATTACH_SESSION_ID"); attach != "" {
		app.AttachSessionID = attach
	}
	// MMM8b: wire plugins discovered at default location into the
	// slash palette. Failures (missing dir, bad manifests) silently
	// skip the offending entries.
	if pluginsDir, err := plugins.DefaultDir(); err == nil {
		if loaded, _, err := plugins.LoadVerbose(pluginsDir); err == nil {
			converted := make([]ui.PluginsLoaded, 0, len(loaded))
			for _, p := range loaded {
				cmds := make([]ui.PluginsCommand, 0, len(p.Commands))
				for _, c := range p.Commands {
					cmds = append(cmds, ui.PluginsCommand{
						ID: c.ID, Title: c.Title, Description: c.Description,
						Command: c.Command, Args: c.Args,
					})
				}
				converted = append(converted, ui.PluginsLoaded{
					Name: p.Name, SourceDir: p.SourceDir, Commands: cmds,
				})
			}
			app.SetPlugins(converted)
		}
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
		// YYYYY1: persist paste-compress threshold + intro toggle so
		// they survive across launches like the other Settings → TUI
		// knobs.
		paste := app.Theme.PasteCompressThreshold
		cur.PasteCompressThreshold = &paste
		introSkip := app.IntroDisabled
		cur.IntroSkip = &introSkip
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
	// IIIII1: Ctrl+Z sets DetachedSessionID before tea.Quit. After
	// the TUI exits cleanly, surface the reattach command — the
	// session is still running on the backend, but the user has
	// no way to know that without being told. Printed to stderr so
	// it survives `gact ... | head` style pipelines.
	if app.DetachedSessionID != "" {
		fmt.Fprintf(os.Stderr,
			"Detached. Reattach with:\n  gact attach %s\n",
			app.DetachedSessionID)
		// AAAAAAAA1: persist a record of the detach to a local
		// registry so `gact detached` can list every session the
		// user walked away from across reboots — the user
		// shouldn't have to memorise opaque sess_xxxx ids to find
		// what they left running.
		if path, err := config.DetachedPath(); err == nil {
			_ = config.AppendDetached(path, config.DetachedRecord{
				SessionID: app.DetachedSessionID,
				Title:     app.DetachedTitle,
				Backend:   finalBackend,
				Workspace: app.DetachedWorkspace,
			}, 0)
		}
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
//	gact perms rules list [--format json|tsv]
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
	// Default kept as json for back-compat with existing scripting
	// callers (this verb predates --format). New TSV view added per
	// KKKK1 — opt in with --format tsv for human-scannable output.
	format := fs.String("format", "json", "json | tsv")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if *format != "json" && *format != "tsv" {
		fmt.Fprintf(os.Stderr, "gact perms rules list: unknown format %q (want json|tsv)\n", *format)
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
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(map[string]any{"policies": policies})
		return 0
	}
	// TSV columns: scope, scope_id, tool_pattern, path_pattern,
	// action, annotations_filter (compact k=v list or "-").
	fmt.Println("scope\tscope_id\ttool_pattern\tpath_pattern\taction\tannotations")
	for _, p := range policies {
		scopeID := p.ScopeID
		if scopeID == "" {
			scopeID = "*"
		}
		path := p.PathPattern
		if path == "" {
			path = "-"
		}
		ann := "-"
		if len(p.AnnotationsFilter) > 0 {
			parts := make([]string, 0, len(p.AnnotationsFilter))
			keys := make([]string, 0, len(p.AnnotationsFilter))
			for k := range p.AnnotationsFilter {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				parts = append(parts, fmt.Sprintf("%s=%v", k, p.AnnotationsFilter[k]))
			}
			ann = strings.Join(parts, ",")
		}
		fmt.Printf("%s\t%s\t%s\t%s\t%s\t%s\n",
			p.Scope, scopeID, p.ToolNamePattern, path, p.Action, ann)
	}
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

// runPlugins dispatches `gact plugins <verb>` for the MMM8 plugin
// loader. Sub-verbs:
//
//	gact plugins list [--format text|json] [--dir DIR]
//	gact plugins dir   (print the resolved plugin root)
func runPlugins(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact plugins list|dir [--dir DIR]")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "list", "ls":
		return runPluginsList(rest)
	case "dir", "path":
		return runPluginsDir(rest)
	}
	fmt.Fprintf(os.Stderr, "gact plugins: unknown verb %q (want list|dir)\n", verb)
	return 2
}

func runPluginsDir(args []string) int {
	fs := flag.NewFlagSet("plugins dir", flag.ContinueOnError)
	dir := fs.String("dir", "", "override plugin root (default: $XDG_CONFIG_HOME/gact/plugins)")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{"--dir": true, "-dir": true})); err != nil {
		return 2
	}
	resolved := *dir
	if resolved == "" {
		d, err := plugins.DefaultDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact plugins dir: %v\n", err)
			return 1
		}
		resolved = d
	}
	fmt.Println(resolved)
	return 0
}

func runPluginsList(args []string) int {
	fs := flag.NewFlagSet("plugins list", flag.ContinueOnError)
	dir := fs.String("dir", "", "override plugin root")
	format := fs.String("format", "text", "text | json")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{
		"--dir": true, "-dir": true,
		"--format": true, "-format": true,
	})); err != nil {
		return 2
	}
	resolved := *dir
	if resolved == "" {
		d, err := plugins.DefaultDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact plugins list: %v\n", err)
			return 1
		}
		resolved = d
	}
	loaded, errs, err := plugins.LoadVerbose(resolved)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact plugins list: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(loaded)
		for _, e := range errs {
			fmt.Fprintln(os.Stderr, "warn:", e)
		}
		return 0
	}
	if *format != "text" {
		fmt.Fprintf(os.Stderr, "gact plugins list: unknown format %q\n", *format)
		return 2
	}
	if len(loaded) == 0 {
		fmt.Fprintf(os.Stderr, "no plugins under %s\n", resolved)
		return 0
	}
	for _, p := range loaded {
		header := p.Name
		if p.Version != "" {
			header += " " + p.Version
		}
		if p.Description != "" {
			header += " — " + p.Description
		}
		fmt.Println(header)
		for _, c := range p.Commands {
			line := "  " + c.ID
			if c.Title != "" {
				line += "  " + c.Title
			}
			if c.Description != "" {
				line += " — " + c.Description
			}
			fmt.Println(line)
		}
	}
	for _, e := range errs {
		fmt.Fprintln(os.Stderr, "warn:", e)
	}
	return 0
}

// runTasks dispatches `gact tasks <verb>` for §6.18 session tasks
// (MMM5). Sub-verbs:
//
//	gact tasks list <sid> [--status pending,running,…]
//	gact tasks add <sid> <title> [--status pending|running|completed|failed]
//	gact tasks set <task-id> [--title T] [--status S]
//	gact tasks rm <task-id>
func runTasks(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks list|add|set|rm|summary ...")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "list", "ls":
		return runTasksList(rest)
	case "add":
		return runTasksAdd(rest)
	case "set", "patch":
		return runTasksSet(rest)
	case "rm", "delete", "remove":
		return runTasksRm(rest)
	case "summary":
		return runTasksSummary(rest)
	}
	fmt.Fprintf(os.Stderr, "gact tasks: unknown verb %q (want list|add|set|rm|summary)\n", verb)
	return 2
}

// runTasksSummary aggregates §6.18 task counts across every session
// in the workspace (default: all). Lists sessions, fans out
// ListSessionTasks calls with a bounded pool, prints per-session
// TSV rows + a TOTAL footer. (FFFF1)
func runTasksSummary(args []string) int {
	fs := flag.NewFlagSet("tasks summary", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "limit to one workspace; empty = all")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--workspace": true, "-workspace": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: *wsID})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks summary: list sessions: %v\n", err)
		return 1
	}

	type row struct {
		sid     string
		title   string
		pending int
		running int
		done    int
		failed  int
	}
	rows := make([]row, len(sessions))
	sem := make(chan struct{}, 8)
	var wg sync.WaitGroup
	for i, s := range sessions {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, s gact.Session) {
			defer wg.Done()
			defer func() { <-sem }()
			tctx, tcancel := context.WithTimeout(context.Background(), 5*time.Second)
			tasks, err := c.ListSessionTasks(tctx, s.ID)
			tcancel()
			if err != nil {
				return // best-effort; absent backend = no row
			}
			r := row{sid: s.ID, title: s.Title}
			for _, t := range tasks {
				switch t.Status {
				case "pending":
					r.pending++
				case "running":
					r.running++
				case "completed":
					r.done++
				case "failed":
					r.failed++
				}
			}
			rows[i] = r
		}(i, s)
	}
	wg.Wait()

	fmt.Println("SID\tTITLE\tPENDING\tRUNNING\tCOMPLETED\tFAILED")
	var total row
	printed := 0
	for _, r := range rows {
		if r.sid == "" {
			continue
		}
		if r.pending+r.running+r.done+r.failed == 0 {
			continue // skip sessions without any tasks — keeps output focused
		}
		fmt.Printf("%s\t%s\t%d\t%d\t%d\t%d\n",
			r.sid, r.title, r.pending, r.running, r.done, r.failed)
		total.pending += r.pending
		total.running += r.running
		total.done += r.done
		total.failed += r.failed
		printed++
	}
	fmt.Printf("TOTAL\t(%d sessions)\t%d\t%d\t%d\t%d\n",
		printed, total.pending, total.running, total.done, total.failed)
	return 0
}

func runTasksList(args []string) int {
	fs := flag.NewFlagSet("tasks list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "tsv", "tsv | json")
	// WWWW1: --status filters to one status (or comma-separated list).
	// Empty = all (back-compat). Validation happens client-side so a
	// typo errors fast instead of returning a silently-empty set.
	statusFilter := fs.String("status", "", "comma-separated status filter: pending|running|completed|failed")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
		"--status": true, "-status": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks list <session-id> [--status pending,running,…] [--format tsv|json]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact tasks list: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	var keep map[string]bool
	if *statusFilter != "" {
		keep = map[string]bool{}
		for _, s := range strings.Split(*statusFilter, ",") {
			s = strings.TrimSpace(s)
			switch s {
			case "":
			case "pending", "running", "completed", "failed":
				keep[s] = true
			default:
				fmt.Fprintf(os.Stderr, "gact tasks list: unknown --status value %q (want pending|running|completed|failed)\n", s)
				return 2
			}
		}
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tasks, err := c.ListSessionTasks(ctx, fs.Arg(0))
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks list: %v\n", err)
		return 1
	}
	if keep != nil {
		filtered := tasks[:0]
		for _, t := range tasks {
			if keep[t.Status] {
				filtered = append(filtered, t)
			}
		}
		tasks = filtered
	}
	if *format == "json" {
		if tasks == nil {
			tasks = []gact.SessionTask{}
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(tasks)
		return 0
	}
	for _, t := range tasks {
		fmt.Printf("%s\t%s\t%s\n", t.ID, t.Status, t.Title)
	}
	return 0
}

func runTasksAdd(args []string) int {
	fs := flag.NewFlagSet("tasks add", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	status := fs.String("status", "pending", "initial status: pending|running|completed|failed")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--status": true, "-status": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() < 2 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks add <session-id> <title> [--status …]")
		return 2
	}
	sid := fs.Arg(0)
	title := strings.Join(fs.Args()[1:], " ")
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	created, err := c.CreateSessionTask(ctx, sid, gact.SessionTask{
		Title: title, Status: *status,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks add: %v\n", err)
		return 1
	}
	fmt.Println(created.ID)
	return 0
}

func runTasksSet(args []string) int {
	fs := flag.NewFlagSet("tasks set", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	title := fs.String("title", "", "new title (empty = unchanged)")
	status := fs.String("status", "", "new status (empty = unchanged)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--title": true, "-title": true,
		"--status": true, "-status": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks set <task-id> [--title T] [--status S]")
		return 2
	}
	if *title == "" && *status == "" {
		fmt.Fprintln(os.Stderr, "gact tasks set: at least one of --title or --status required")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.PatchTask(ctx, fs.Arg(0), gact.SessionTask{
		Title: *title, Status: *status,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks set: %v\n", err)
		return 1
	}
	return 0
}

func runTasksRm(args []string) int {
	fs := flag.NewFlagSet("tasks rm", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks rm <task-id>")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.DeleteTask(ctx, fs.Arg(0)); err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks rm: %v\n", err)
		return 1
	}
	return 0
}

// runHooks dispatches the §6.17 hooks CLI (MMM3):
//
//	gact hooks list [--event TYPE] [--scope global|session|workspace] [--format tsv|json]
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
	// XXXX1: --event filters by hook event type (exact match, or
	// '*' wildcard which matches the universal-hook entry too).
	// --scope filters by scope kind (global|session|workspace).
	// Both are empty by default = no filter (back-compat).
	eventFilter := fs.String("event", "", "filter to one event type (exact); empty = all")
	scopeFilter := fs.String("scope", "", "filter by scope kind: global|session|workspace; empty = all")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
		"--event": true, "-event": true,
		"--scope": true, "-scope": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact hooks list: unknown format %q\n", *format)
		return 2
	}
	switch *scopeFilter {
	case "", "global", "session", "workspace":
	default:
		fmt.Fprintf(os.Stderr, "gact hooks list: unknown --scope %q (want global|session|workspace)\n", *scopeFilter)
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
	if *eventFilter != "" || *scopeFilter != "" {
		filtered := hooks[:0]
		for _, h := range hooks {
			if *eventFilter != "" && h.Event != *eventFilter {
				continue
			}
			if *scopeFilter != "" {
				kind := "global"
				switch {
				case h.SessionID != "":
					kind = "session"
				case h.WorkspaceID != "":
					kind = "workspace"
				}
				if kind != *scopeFilter {
					continue
				}
			}
			filtered = append(filtered, h)
		}
		hooks = filtered
	}
	if *format == "json" {
		if hooks == nil {
			hooks = []gact.Hook{}
		}
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

// runReplay imports a session export blob and (optionally) attaches
// the TUI to the resulting session. Workflow shortcut for
// `gact import FILE | gact attach $(gact import FILE)`. (CCCC1)
//
// With --attach: trims argv + sets GACT_ATTACH_SESSION_ID like
// runAttach does, then calls runTUI. Without --attach: prints the
// new sid and exits 0 (same as `gact import`).
func runReplay(args []string) {
	fs := flag.NewFlagSet("replay", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	attach := fs.Bool("attach", false, "launch the TUI on the imported session after import")
	known := map[string]bool{
		"--backend": true, "-backend": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		os.Exit(2)
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact replay <export-file|-> [--attach]")
		os.Exit(2)
	}
	src := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)

	var r io.Reader
	if src == "-" {
		r = os.Stdin
	} else {
		f, err := os.Open(src)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact replay: open %s: %v\n", src, err)
			os.Exit(1)
		}
		defer f.Close()
		r = f
	}
	var blob client.SessionExportBlob
	if err := json.NewDecoder(r).Decode(&blob); err != nil {
		fmt.Fprintf(os.Stderr, "gact replay: decode: %v\n", err)
		os.Exit(1)
	}
	if blob.Format == "" {
		fmt.Fprintln(os.Stderr, "gact replay: missing 'format' field — not a GACT export blob")
		os.Exit(1)
	}
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	created, err := c.ImportSession(ctx, blob)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact replay: %v\n", err)
		os.Exit(1)
	}
	fmt.Fprintf(os.Stderr, "gact replay: created session %s with %d messages\n",
		created.ID, created.MessageCount)
	if !*attach {
		fmt.Println(created.ID)
		os.Exit(0)
	}
	// --attach: hand off to runTUI. Bridge via env (same pattern as
	// runAttach) so we don't duplicate the TUI bootstrap.
	_ = os.Setenv("GACT_ATTACH_SESSION_ID", created.ID)
	os.Args = []string{os.Args[0]}
	runTUI()
}

// runFollow is `tail -f` for a session's conversation log. Prints
// the existing messages, then subscribes to SSE for the session and
// renders any newly-completed assistant/tool messages until Ctrl+C.
// (ZZZ1)
func runFollow(args []string) int {
	fs := flag.NewFlagSet("follow", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	// NNNN1: --format json emits NDJSON (one message per line) for
	// both the snapshot and streamed messages. Default text mode
	// unchanged.
	format := fs.String("format", "text", "text | json (NDJSON)")
	// WWWWWWWW1: --role filter mirrors VVVVVVVV1's `gact log --role`.
	// Applied to both the snapshot and every streamed message so
	// `gact follow <sid> --role assistant` tails just the model's
	// replies.
	role := fs.String("role", "", "comma-separated role filter: user|assistant|tool|system")
	// CCCCCCCCC1: --grep regex filter mirrors BBBBBBBBB1's
	// `gact log --grep`. Applied to both the snapshot + every
	// streamed message.
	grep := fs.String("grep", "", "regex: drop messages whose flattened text doesn't match (case-insensitive)")
	// EEEEEEEEE1: --since DUR trims the initial snapshot to messages
	// created within the last DUR. Streamed messages are live so the
	// cutoff doesn't apply to them.
	since := fs.Duration("since", 0, "trim snapshot to messages created within the last DUR (e.g. 5m, 1h); 0 = unset")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
		"--role":   true, "-role": true,
		"--grep":   true, "-grep": true,
		"--since":  true, "-since": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact follow <session_id> [--role user,assistant,...] [--grep REGEX] [--since DUR] [--format text|json]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact follow: unknown format %q (want text|json)\n", *format)
		return 2
	}
	// WWWWWWWW1: build + validate the keep-set up front so a typo
	// errors fast instead of silently producing an empty stream.
	var keepRole map[string]bool
	if *role != "" {
		keepRole = map[string]bool{}
		for _, r := range strings.Split(*role, ",") {
			r = strings.TrimSpace(r)
			switch r {
			case "":
			case "user", "assistant", "tool", "system":
				keepRole[r] = true
			default:
				fmt.Fprintf(os.Stderr, "gact follow: unknown --role %q (want user|assistant|tool|system)\n", r)
				return 2
			}
		}
	}
	// CCCCCCCCC1: compile the regex up-front so a bad pattern
	// errors fast before we subscribe to SSE.
	var grepRE *regexp.Regexp
	if *grep != "" {
		re, err := regexp.Compile("(?i)" + *grep)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact follow: bad --grep pattern %q: %v\n", *grep, err)
			return 2
		}
		grepRE = re
	}
	emit := func(m gact.Message) {
		if keepRole != nil && !keepRole[string(m.Role)] {
			return
		}
		if grepRE != nil {
			txt, ok := flattenMessageForGrep(m)
			if !ok || !grepRE.MatchString(txt) {
				return
			}
		}
		if *format == "json" {
			b, err := json.Marshal(m)
			if err != nil {
				return
			}
			os.Stdout.Write(b)
			os.Stdout.Write([]byte{'\n'})
			return
		}
		printLogMessage(m)
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)

	// 1. Snapshot the existing log so the user lands on the latest
	//    state, not an empty pane. ListMessages returns newest-first;
	//    reverse for chronological display.
	listCtx, listCancel := context.WithTimeout(context.Background(), 10*time.Second)
	msgs, _, err := c.ListMessages(listCtx, client.MessageFilter{
		SessionID: sid, Limit: 200, IncludeSystem: true,
	})
	listCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact follow: list: %v\n", err)
		return 1
	}
	// EEEEEEEEE1: --since DUR drops snapshot messages older than the
	// cutoff before emit. Mirrors TTT1 `gact log --since`. Zero-
	// CreatedAt survives (defensive against backends that don't
	// stamp). Streamed messages are live so the cutoff doesn't
	// apply to them — seen-tracking below still uses the full
	// listing so SSE replay doesn't re-emit a message that was
	// older than --since but is still in the backend's history.
	snapshotEmit := msgs
	if *since > 0 {
		cutoff := time.Now().UTC().Add(-*since)
		trimmed := make([]gact.Message, 0, len(msgs))
		for _, m := range msgs {
			if m.CreatedAt.IsZero() || !m.CreatedAt.Before(cutoff) {
				trimmed = append(trimmed, m)
			}
		}
		snapshotEmit = trimmed
	}
	for i := len(snapshotEmit) - 1; i >= 0; i-- {
		emit(snapshotEmit[i])
	}
	// Track ids we've already printed so the SSE loop doesn't
	// re-render the snapshot (replay events arrive on every connect).
	// NB: seen is populated off the FULL msgs slice even when --since
	// trims the emit set, so the SSE loop doesn't re-emit older
	// messages on replay.
	seen := map[string]bool{}
	for _, m := range msgs {
		seen[m.ID] = true
	}

	// 2. Subscribe to SSE for the session. On message.completed, fetch
	//    the message (one quick ListMessages with that mid filter would
	//    be ideal but we just use limit=1+seen-tracking) and render.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	events, errs, err := c.StreamEvents(ctx, client.EventStreamScope{SessionID: sid})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact follow: subscribe: %v\n", err)
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
			if e.Type != "message.completed" && e.Type != "message.created" {
				continue
			}
			pl, _ := e.Payload["payload"].(map[string]any)
			var mid string
			if msgID, ok := pl["message_id"].(string); ok {
				mid = msgID
			} else if msg, ok := pl["message"].(map[string]any); ok {
				if id, ok := msg["id"].(string); ok {
					mid = id
				}
			}
			if mid == "" || seen[mid] {
				continue
			}
			// Refetch the canonical message — we want the
			// completed parts, not the part-by-part deltas.
			fetchCtx, fetchCancel := context.WithTimeout(context.Background(), 5*time.Second)
			latest, _, ferr := c.ListMessages(fetchCtx, client.MessageFilter{
				SessionID: sid, Limit: 50, IncludeSystem: true,
			})
			fetchCancel()
			if ferr != nil {
				continue
			}
			for i := len(latest) - 1; i >= 0; i-- {
				m := latest[i]
				if seen[m.ID] {
					continue
				}
				emit(m)
				seen[m.ID] = true
			}
		case err, ok := <-errs:
			if !ok {
				return 0
			}
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact follow: stream: %v\n", err)
				return 1
			}
		}
	}
}

// runGrep extends `gact search` (per-session) to every session in
// parallel. Lists sessions, fans out SearchMessages calls with a
// small goroutine pool, aggregates results. Useful for "did I ever
// mention X anywhere?" (WWW1).
func runGrep(args []string) int {
	fs := flag.NewFlagSet("grep", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "limit to one workspace; empty = all")
	format := fs.String("format", "tsv", "tsv | json")
	// VVVV1: --limit caps the output. Default 0 means unlimited
	// (back-compat). Truncation happens AFTER sorting so the kept
	// rows are still the lexicographically-smallest sids.
	limit := fs.Int("limit", 0, "max hits to print (0 = unlimited)")
	// DDDDDDDDD1: --role filter mirrors VVVVVVVV1 on log/follow.
	// Applies AFTER the cross-session search gathers hits, so the
	// keep-set filters the role-decorated rows built from midRoles.
	role := fs.String("role", "", "comma-separated role filter: user|assistant|tool|system")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--workspace": true, "-workspace": true,
		"--format": true, "-format": true,
		"--limit": true, "-limit": true,
		"--role":  true, "-role": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "usage: gact grep <query> [--workspace WS_ID] [--role user,assistant,...] [--format tsv|json] [--limit N]")
		return 2
	}
	query := strings.Join(fs.Args(), " ")
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact grep: unknown format %q\n", *format)
		return 2
	}
	if *limit < 0 {
		fmt.Fprintln(os.Stderr, "gact grep: --limit must be >= 0")
		return 2
	}
	// DDDDDDDDD1: build + validate the role keep-set up front.
	var keepRole map[string]bool
	if *role != "" {
		keepRole = map[string]bool{}
		for _, r := range strings.Split(*role, ",") {
			r = strings.TrimSpace(r)
			switch r {
			case "":
			case "user", "assistant", "tool", "system":
				keepRole[r] = true
			default:
				fmt.Fprintf(os.Stderr, "gact grep: unknown --role %q (want user|assistant|tool|system)\n", r)
				return 2
			}
		}
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: *wsID})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact grep: list sessions: %v\n", err)
		return 1
	}

	type hit struct {
		SID     string `json:"sid"`
		Title   string `json:"title"`
		MID     string `json:"mid"`
		Role    string `json:"role"`
		Snippet string `json:"snippet"`
	}
	var hits []hit
	var mu sync.Mutex

	// Bounded goroutine pool — don't fan out 1000 sessions to 1000
	// concurrent SearchMessages calls.
	sem := make(chan struct{}, 8)
	var wg sync.WaitGroup
	for _, sess := range sessions {
		wg.Add(1)
		sem <- struct{}{}
		go func(s gact.Session) {
			defer wg.Done()
			defer func() { <-sem }()
			sctx, scancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer scancel()
			matches, err := c.SearchMessages(sctx, s.ID, query)
			if err != nil {
				return // best-effort — skip sessions whose search fails
			}
			if len(matches) == 0 {
				return
			}
			// Build mid → role map for the few hit message ids only
			// (cheaper than ListMessages on every session).
			midRoles := map[string]string{}
			msgs, _, mErr := c.ListMessages(sctx, client.MessageFilter{SessionID: s.ID, Limit: 500})
			if mErr == nil {
				for _, m := range msgs {
					midRoles[m.ID] = string(m.Role)
				}
			}
			mu.Lock()
			defer mu.Unlock()
			for _, m := range matches {
				role := midRoles[m.MessageID]
				if role == "" {
					role = "?"
				}
				hits = append(hits, hit{
					SID: s.ID, Title: s.Title, MID: m.MessageID,
					Role: role,
					Snippet: strings.ReplaceAll(m.Snippet, "\n", " "),
				})
			}
		}(sess)
	}
	wg.Wait()
	// DDDDDDDDD1: drop hits whose role isn't in the keep-set. Runs
	// after the parallel search finishes — before sort + limit so
	// the kept rows are the lexicographically-first post-filter.
	if keepRole != nil {
		kept := hits[:0]
		for _, h := range hits {
			if keepRole[h.Role] {
				kept = append(kept, h)
			}
		}
		hits = kept
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].SID < hits[j].SID })
	if *limit > 0 && len(hits) > *limit {
		hits = hits[:*limit]
	}

	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(hits)
		return 0
	}
	for _, h := range hits {
		fmt.Printf("%s\t%s\t%s\t%s\t%s\n", h.SID, h.Title, h.MID, h.Role, h.Snippet)
	}
	return 0
}

// runDashboard prints a supervisory overview of every session in
// the workspace (default: all). One-shot — for scripting or quick
// "what's everything doing?" checks without launching the TUI. (VVV1)
func runDashboard(args []string) int {
	fs := flag.NewFlagSet("dashboard", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "limit to one workspace; empty = all")
	format := fs.String("format", "pretty", "pretty | tsv | json")
	watch := fs.Bool("watch", false, "re-render every --interval (BBBB1)")
	interval := fs.Duration("interval", 2*time.Second, "refresh cadence in --watch mode")
	// YYYY1: --status filters rows to one status (or comma-list).
	// Empty = all (back-compat). Validation runs client-side so a
	// typo errors fast instead of returning a silently-empty board.
	statusFilter := fs.String("status", "", "comma-separated status filter: idle|running|waiting|error")
	// KKKKKKKK1: --sort controls row ordering. Default newest-first
	// so "what was I just working on?" answers itself at the top.
	sortBy := fs.String("sort", "newest", "sort by: newest | oldest | status | tokens | backend")
	// YYYYYYYY1: --detached-only filters rows to sessions in the
	// local registry (filtered to current backend). Mirrors the
	// sidebar JJJJJJJJ1 `d` toggle on the CLI side — lets scripts
	// query "what detached work is still alive".
	detachedOnly := fs.Bool("detached-only", false, "show only sessions in the local detached registry")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{
		"--backend": true, "-backend": true,
		"--workspace": true, "-workspace": true,
		"--format": true, "-format": true,
		"--interval": true, "-interval": true,
		"--status": true, "-status": true,
		"--sort":   true, "-sort": true,
		"--detached-only": true, "-detached-only": true,
	})); err != nil {
		return 2
	}
	switch *format {
	case "pretty", "tsv", "json":
	default:
		fmt.Fprintf(os.Stderr, "gact dashboard: unknown format %q (want pretty|tsv|json)\n", *format)
		return 2
	}
	switch *sortBy {
	case "newest", "oldest", "status", "tokens", "backend":
	default:
		fmt.Fprintf(os.Stderr, "gact dashboard: unknown sort %q (want newest|oldest|status|tokens|backend)\n", *sortBy)
		return 2
	}
	var keep map[string]bool
	if *statusFilter != "" {
		keep = map[string]bool{}
		for _, s := range strings.Split(*statusFilter, ",") {
			s = strings.TrimSpace(s)
			// Translate user-friendly "waiting" alias to the actual
			// server status string `waiting_permission` (see SPEC).
			switch s {
			case "":
			case "idle", "running", "error":
				keep[s] = true
			case "waiting", "waiting_permission":
				keep["waiting_permission"] = true
			default:
				fmt.Fprintf(os.Stderr, "gact dashboard: unknown --status %q (want idle|running|waiting|error)\n", s)
				return 2
			}
		}
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)

	if !*watch {
		// One-shot path (back-compat).
		return renderDashboardOnce(c, *wsID, *format, keep, *sortBy, *detachedOnly)
	}

	// BBBB1: watch loop. ANSI clear-screen + cursor-home between
	// frames so each render replaces the previous in place. Caller
	// uses Ctrl+C to exit.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	tick := time.NewTicker(*interval)
	defer tick.Stop()
	first := true
	for {
		if first || true {
			fmt.Print("\033[2J\033[H") // clear + home
			fmt.Printf("gact dashboard --watch  backend=%s  refresh=%s  (Ctrl+C to exit)\n\n",
				finalBackend, *interval)
			if code := renderDashboardOnce(c, *wsID, *format, keep, *sortBy, *detachedOnly); code != 0 {
				cancel()
				return code
			}
			first = false
		}
		select {
		case <-ctx.Done():
			return 0
		case <-tick.C:
		}
	}
}

// runDetached implements `gact detached [--rm <sid>] [--probe]`. Reads
// the local detached-sessions registry (Ctrl+Z exits write to it) and
// prints one row per detached session so the user can find what they
// walked away from without having to remember opaque sess_xxxx ids.
// (AAAAAAAA1)
func runDetached(args []string) int {
	fs := flag.NewFlagSet("detached", flag.ContinueOnError)
	rm := fs.String("rm", "", "remove entries for these session ids (comma-separated) from the registry")
	probe := fs.Bool("probe", false, "probe each backend, mark sessions that no longer exist")
	pruneDead := fs.Bool("prune-dead", false, "probe + remove every entry whose backend no longer has the session (GGGGGGGG1)")
	format := fs.String("format", "pretty", "pretty | tsv | json")
	watch := fs.Bool("watch", false, "re-render every --interval (UUUUUUUU1)")
	interval := fs.Duration("interval", 2*time.Second, "refresh cadence in --watch mode")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{
		"--rm": true, "-rm": true,
		"--probe":      true, "-probe": true,
		"--prune-dead": true, "-prune-dead": true,
		"--format":   true, "-format": true,
		"--watch":    true, "-watch": true,
		"--interval": true, "-interval": true,
	})); err != nil {
		return 2
	}
	// UUUUUUUU1: --watch is a read-mode loop; it has no meaning
	// combined with write-mode flags. Reject fast so the user sees
	// the conflict instead of silently ignoring one of them.
	if *watch && (*rm != "" || *pruneDead) {
		fmt.Fprintln(os.Stderr, "gact detached: --watch cannot be combined with --rm or --prune-dead")
		return 2
	}
	// --prune-dead implies --probe (it has to probe to decide what to
	// remove). Set it implicitly so the rendered output also shows
	// the alive column for the survivors.
	if *pruneDead {
		*probe = true
	}
	switch *format {
	case "pretty", "tsv", "json":
	default:
		fmt.Fprintf(os.Stderr, "gact detached: unknown format %q (want pretty|tsv|json)\n", *format)
		return 2
	}
	path, err := config.DetachedPath()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact detached: %v\n", err)
		return 1
	}
	if *rm != "" {
		// `--rm` removes by sid across all backends — the user
		// thinks in sids, not (backend, sid) pairs. NNNNNNNN1:
		// accepts a comma-separated list for batch cleanup.
		sids := strings.Split(*rm, ",")
		total := 0
		for _, sid := range sids {
			sid = strings.TrimSpace(sid)
			if sid == "" {
				continue
			}
			n, err := config.RemoveDetached(path, "", sid)
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact detached: %v\n", err)
				return 1
			}
			total += n
		}
		fmt.Fprintf(os.Stderr, "removed %d entr(y/ies) for %s\n", total, *rm)
		return 0
	}
	// UUUUUUUU1: renderOnce captures the load + probe + render path
	// so --watch can call it per tick. Returns a non-zero exit on
	// fatal errors (read path only); render-only errors are surfaced
	// to stderr but don't abort the watch loop.
	renderOnce := func() int {
		reg, err := config.LoadDetached(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact detached: %v\n", err)
			return 1
		}
		// liveness[i] tracks whether record i is still on its backend.
		// nil = unprobed; true/false otherwise.
		liveness := make([]*bool, len(reg.Records))
		if *probe {
			for i, r := range reg.Records {
				c := client.New(r.Backend)
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				_, err := c.GetSession(ctx, r.SessionID)
				cancel()
				alive := err == nil
				liveness[i] = &alive
			}
		}
	// GGGGGGGG1: --prune-dead removes every entry whose probe came
	// back negative. Done after the probe pass so the rendered table
	// (below) shows the survivors with their (alive=yes) column,
	// confirming what's left. The dead rows themselves are dropped
	// silently from the rendered output but counted in stderr.
	if *pruneDead {
		survivors := reg.Records[:0]
		survivorLive := liveness[:0]
		removed := 0
		for i, r := range reg.Records {
			if liveness[i] != nil && !*liveness[i] {
				removed++
				continue
			}
			survivors = append(survivors, r)
			survivorLive = append(survivorLive, liveness[i])
		}
		reg.Records = survivors
		liveness = survivorLive
		if removed > 0 {
			if err := config.SaveDetached(reg, path); err != nil {
				fmt.Fprintf(os.Stderr, "gact detached: prune-dead: write %s: %v\n", path, err)
				return 1
			}
		}
		fmt.Fprintf(os.Stderr, "pruned %d dead entr(y/ies); %d alive remain\n",
			removed, len(reg.Records))
	}
	switch *format {
	case "json":
		type row struct {
			config.DetachedRecord
			Alive *bool `json:"alive,omitempty"`
		}
		rows := make([]row, len(reg.Records))
		for i, r := range reg.Records {
			rows[i] = row{DetachedRecord: r, Alive: liveness[i]}
		}
		b, _ := json.MarshalIndent(rows, "", "  ")
		fmt.Println(string(b))
	case "tsv":
		fmt.Println("session_id\ttitle\tbackend\tworkspace\tdetached_at\talive")
		for i, r := range reg.Records {
			alive := ""
			if liveness[i] != nil {
				if *liveness[i] {
					alive = "yes"
				} else {
					alive = "no"
				}
			}
			fmt.Printf("%s\t%s\t%s\t%s\t%s\t%s\n",
				r.SessionID, r.Title, r.Backend, r.Workspace,
				r.DetachedAt.Format(time.RFC3339), alive)
		}
	default: // pretty
		if len(reg.Records) == 0 {
			fmt.Println("(no detached sessions — Ctrl+Z in the TUI records one here)")
			return 0
		}
		// BBBBBBBB2: reorder so dead entries sink to the bottom when
		// --probe is set — the user's next reattach target is almost
		// always one of the live ones. Stable sort preserves the
		// newest-first ordering within each group.
		order := make([]int, len(reg.Records))
		for i := range order {
			order[i] = i
		}
		sort.SliceStable(order, func(i, j int) bool {
			ai, aj := liveness[order[i]], liveness[order[j]]
			// Both unprobed or same liveness → preserve index order.
			if ai == nil && aj == nil {
				return order[i] < order[j]
			}
			// Alive-or-unknown ranks above known-dead.
			iDead := ai != nil && !*ai
			jDead := aj != nil && !*aj
			if iDead != jDead {
				return !iDead
			}
			return order[i] < order[j]
		})
		fmt.Printf("%-20s  %-30s  %-30s  %-12s  %s\n",
			"SESSION", "TITLE", "BACKEND", "DETACHED", "ALIVE")
		alive, dead, unknown := 0, 0, 0
		for _, idx := range order {
			r := reg.Records[idx]
			aliveText := "?"
			col := ansiDim
			if liveness[idx] != nil {
				if *liveness[idx] {
					aliveText, col = "yes", ansiGreen
					alive++
				} else {
					aliveText, col = "no", ansiRed
					dead++
				}
			} else {
				unknown++
			}
			when := humanizeAge(time.Since(r.DetachedAt))
			title := r.Title
			if title == "" {
				title = "(untitled)"
			}
			fmt.Printf("%-20s  %-30s  %-30s  %-12s  %s\n",
				truncMid(r.SessionID, 20), truncMid(title, 30),
				truncMid(r.Backend, 30), when, colorize(aliveText, col))
		}
		fmt.Println()
		// Footer summary — only show probe counts if at least one
		// row was probed (otherwise the zeros are noise).
		if alive+dead > 0 {
			fmt.Printf("%d alive · %d dead · %d unprobed\n", alive, dead, unknown)
		}
		fmt.Println("Reattach: gact attach <session>")
		}
		return 0
	}

	if !*watch {
		return renderOnce()
	}
	// UUUUUUUU1: watch loop. ANSI clear-screen + cursor-home between
	// frames so each render replaces the previous in place. Mirrors
	// the BBBB1 dashboard --watch pattern. Ctrl+C exits via default
	// SIGINT handling since there's no tea program to intercept.
	tick := time.NewTicker(*interval)
	defer tick.Stop()
	for {
		fmt.Print("\033[2J\033[H")
		fmt.Printf("gact detached --watch  refresh=%s  (Ctrl+C to exit)\n\n", *interval)
		if code := renderOnce(); code != 0 {
			return code
		}
		<-tick.C
	}
}

// ansi* are the single-byte-sequence color codes used by runDetached.
// We stay dependency-free in main.go (no lipgloss) so the CLI binary
// stays small; these 4 strings cover the narrow palette we need here.
const (
	ansiReset = "\x1b[0m"
	ansiGreen = "\x1b[32m"
	ansiRed   = "\x1b[31m"
	ansiDim   = "\x1b[2m"
)

// colorize wraps s in an ANSI sequence when stdout is a terminal
// (detected via file-mode check) — otherwise returns the raw string
// so piped output isn't cluttered with escape codes. Matches the
// behaviour of most modern CLIs (git, ls, etc.).
func colorize(s, code string) string {
	fi, err := os.Stdout.Stat()
	if err != nil || (fi.Mode()&os.ModeCharDevice) == 0 {
		return s
	}
	return code + s + ansiReset
}

// humanizeAge renders a duration as a short human string ("3m",
// "2h", "5d") for the detached registry's age column. Uses days as
// the upper bound — older entries just say "Nd". Negative durations
// (clock skew between the writing host and `gact detached` host)
// clamp to "0s" so we don't print confusing "-6515s" rows.
func humanizeAge(d time.Duration) string {
	if d < 0 {
		return "0s"
	}
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

// truncMid trims s to width by replacing the middle with `…` —
// keeps both prefix + suffix so sess_<random> ids stay recognisable.
func truncMid(s string, width int) string {
	if len(s) <= width {
		return s
	}
	if width <= 1 {
		return "…"
	}
	half := (width - 1) / 2
	return s[:half] + "…" + s[len(s)-half:]
}

// renderDashboardOnce runs a single dashboard fetch+print. Extracted
// from runDashboard so --watch can call it on each tick. Returns
// the exit code (non-zero on backend error). When keep is non-nil,
// only sessions whose status is in the set are rendered (YYYY1).
// CCCCCCCC2: cross-references the local detached.json registry so
// pretty/tsv output marks sessions the user has previously
// Ctrl+Z-detached from with `↩` in a new DET column. Same source of
// truth the TUI sidebar uses (BBBBBBBB1).
func renderDashboardOnce(c *client.Client, wsID, format string, keep map[string]bool, sortBy string, detachedOnly bool) int {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact dashboard: %v\n", err)
		return 1
	}
	if keep != nil {
		filtered := sessions[:0]
		for _, s := range sessions {
			if keep[s.Status] {
				filtered = append(filtered, s)
			}
		}
		sessions = filtered
	}
	// KKKKKKKK1: sort sessions per user choice. Default "newest"
	// puts the most-recently-updated rows at the top — the row the
	// user is almost always looking for. Stable sort preserves
	// backend order within tied keys (e.g. same UpdatedAt).
	sortSessions(sessions, sortBy)

	// CCCCCCCC2: build the detach lookup once per render. Soft-fails
	// to an empty set so a missing/malformed registry just leaves
	// the column blank instead of breaking the dashboard.
	detached := map[string]bool{}
	if path, err := config.DetachedPath(); err == nil {
		if reg, err := config.LoadDetached(path); err == nil {
			for _, r := range reg.Records {
				if r.Backend == c.BaseURL() {
					detached[r.SessionID] = true
				}
			}
		}
	}
	// YYYYYYYY1: --detached-only drops every session whose id isn't
	// in the registry. Applied AFTER the detach lookup is built and
	// AFTER sort — preserves stable ordering within the surviving
	// subset.
	if detachedOnly {
		kept := sessions[:0]
		for _, s := range sessions {
			if detached[s.ID] {
				kept = append(kept, s)
			}
		}
		sessions = kept
	}

	if format == "json" {
		// SSSSSSSS1: emit decorated rows so jq pipelines can see the
		// detached marker too — the pretty/tsv formats already carry
		// it as a DET column. Each row is the original Session
		// flattened in, plus a top-level `detached` bool.
		type decorated struct {
			gact.Session
			Detached bool `json:"detached"`
		}
		out := make([]decorated, 0, len(sessions))
		for _, s := range sessions {
			out = append(out, decorated{Session: s, Detached: detached[s.ID]})
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(out)
		return 0
	}

	type row struct {
		id, status, title, model, age, tokens, cost, det string
	}
	rows := make([]row, 0, len(sessions))
	now := time.Now().UTC()
	for _, s := range sessions {
		title := s.Title
		if title == "" {
			title = "(untitled)"
		}
		model := s.Model.ModelID
		if model == "" {
			model = "-"
		}
		var age string
		if !s.UpdatedAt.IsZero() {
			d := now.Sub(s.UpdatedAt.UTC())
			age = humanAge(d)
		} else {
			age = "-"
		}
		det := ""
		if detached[s.ID] {
			det = "↩"
		}
		rows = append(rows, row{
			id:     s.ID,
			status: s.Status,
			title:  title,
			model:  model,
			age:    age,
			tokens: fmt.Sprintf("%s/%s", humanTokensCLI(s.Tokens.Input), humanTokensCLI(s.Tokens.Output)),
			cost:   fmt.Sprintf("$%.4f", s.CostUSD),
			det:    det,
		})
	}

	headers := []string{"ID", "STATUS", "TITLE", "MODEL", "AGE", "TOK in/out", "COST", "DET"}
	if format == "tsv" {
		fmt.Println(strings.Join(headers, "\t"))
		for _, r := range rows {
			fmt.Printf("%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n",
				r.id, r.status, r.title, r.model, r.age, r.tokens, r.cost, r.det)
		}
		return 0
	}
	cols := [][]string{
		{headers[0]}, {headers[1]}, {headers[2]}, {headers[3]},
		{headers[4]}, {headers[5]}, {headers[6]}, {headers[7]},
	}
	for _, r := range rows {
		cols[0] = append(cols[0], r.id)
		cols[1] = append(cols[1], r.status)
		cols[2] = append(cols[2], r.title)
		cols[3] = append(cols[3], r.model)
		cols[4] = append(cols[4], r.age)
		cols[5] = append(cols[5], r.tokens)
		cols[6] = append(cols[6], r.cost)
		cols[7] = append(cols[7], r.det)
	}
	widths := make([]int, len(cols))
	for i, col := range cols {
		for _, s := range col {
			// Use rune count, not byte length, so the ↩ glyph
			// (3 bytes UTF-8) doesn't widen the column.
			w := len([]rune(s))
			if w > widths[i] {
				widths[i] = w
			}
		}
	}
	printRow := func(vals []string) {
		out := make([]string, len(vals))
		for i, v := range vals {
			pad := widths[i] - len([]rune(v))
			if pad < 0 {
				pad = 0
			}
			out[i] = v + strings.Repeat(" ", pad)
		}
		fmt.Println(strings.Join(out, "  "))
	}
	printRow(headers)
	printRow([]string{
		strings.Repeat("-", widths[0]), strings.Repeat("-", widths[1]),
		strings.Repeat("-", widths[2]), strings.Repeat("-", widths[3]),
		strings.Repeat("-", widths[4]), strings.Repeat("-", widths[5]),
		strings.Repeat("-", widths[6]), strings.Repeat("-", widths[7]),
	})
	for _, r := range rows {
		printRow([]string{r.id, r.status, r.title, r.model, r.age, r.tokens, r.cost, r.det})
	}
	return 0
}

// sortSessions reorders the slice in place by the KKKKKKKK1 --sort
// key. Stable sort preserves backend order within tied keys. Unknown
// key falls through to newest (the default), but runDashboard
// validates the key up front so that path should be unreachable.
func sortSessions(sessions []gact.Session, key string) {
	switch key {
	case "oldest":
		sort.SliceStable(sessions, func(i, j int) bool {
			return sessions[i].UpdatedAt.Before(sessions[j].UpdatedAt)
		})
	case "status":
		sort.SliceStable(sessions, func(i, j int) bool {
			return sessions[i].Status < sessions[j].Status
		})
	case "tokens":
		// Tokens = input + output so the most-expensive session
		// surfaces first. Descending.
		total := func(s gact.Session) int64 {
			return int64(s.Tokens.Input) + int64(s.Tokens.Output)
		}
		sort.SliceStable(sessions, func(i, j int) bool {
			return total(sessions[i]) > total(sessions[j])
		})
	case "backend":
		sort.SliceStable(sessions, func(i, j int) bool {
			return sessions[i].WorkspaceID < sessions[j].WorkspaceID
		})
	default: // "newest" (and any unknown — validated up front)
		sort.SliceStable(sessions, func(i, j int) bool {
			return sessions[i].UpdatedAt.After(sessions[j].UpdatedAt)
		})
	}
}

// humanAge formats a duration as a 1-2 char age stamp (5s, 4m, 3h,
// 2d). Used by the dashboard for compact rows.
func humanAge(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

// humanTokensCLI formats token counts compactly (1234→1.2K, 1234567
// →1.2M). Mirrors humanTokens in the TUI; duplicated here so this
// file doesn't import internal/ui.
func humanTokensCLI(n int) string {
	switch {
	case n >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	case n >= 1_000:
		return fmt.Sprintf("%.1fK", float64(n)/1_000)
	default:
		return fmt.Sprintf("%d", n)
	}
}

// runConformance runs the contract/conformance suite against the
// configured backend and prints per-section pass/fail. Backend
// implementers can use this to verify their server matches the v0.1
// SPEC without writing test code (SSS1).
//
// Exit codes:
//   0 — every section passed (or was explicitly skipped)
//   1 — at least one section failed
//   2 — bad usage
func runConformance(args []string) int {
	fs := flag.NewFlagSet("conformance", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "workspace id (default: first listed)")
	skip := fs.String("skip", "", "comma-separated section names to skip (Health,Capabilities,Workspaces,Sessions,CreateSession,PostMessage,SSE,Commands,Tools,Metrics)")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{
		"--backend": true, "-backend": true,
		"--workspace": true, "-workspace": true,
		"--skip": true, "-skip": true,
	})); err != nil {
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	opts := conformance.Options{WorkspaceID: *wsID}
	for _, s := range strings.Split(*skip, ",") {
		switch strings.TrimSpace(s) {
		case "":
		case "Health":
			opts.SkipHealth = true
		case "Capabilities":
			opts.SkipCapabilities = true
		case "Workspaces":
			opts.SkipWorkspaces = true
		case "Sessions":
			opts.SkipSessions = true
		case "CreateSession":
			opts.SkipCreateSession = true
		case "PostMessage":
			opts.SkipPostMessage = true
		case "SSE":
			opts.SkipSSE = true
		case "Commands":
			opts.SkipCommands = true
		case "Tools":
			opts.SkipTools = true
		case "Metrics":
			opts.SkipMetrics = true
		case "Hooks":
			opts.SkipHooks = true
		case "Policies":
			opts.SkipPolicies = true
		case "Tasks":
			opts.SkipTasks = true
		default:
			fmt.Fprintf(os.Stderr, "gact conformance: unknown --skip section %q\n", s)
			return 2
		}
	}

	fmt.Fprintf(os.Stderr, "gact conformance  backend=%s\n", finalBackend)
	r := conformance.NewCLIReporter(func(line string) { fmt.Println(line) })
	conformance.Run(r, finalBackend, opts)
	if failed := r.FailedSections(); len(failed) > 0 {
		fmt.Fprintf(os.Stderr, "FAIL: %d section(s)\n", len(failed))
		for _, f := range failed {
			fmt.Fprintln(os.Stderr, "  -", f)
		}
		return 1
	}
	fmt.Fprintln(os.Stderr, "PASS")
	return 0
}

// runBench implements `gact bench [-n N] [--message TEXT]` (QQQ1) —
// a latency probe useful for measuring backend adapter performance
// against the emulator baseline. Creates a fresh session, sends N
// turns serially (each timed send→idle), reports p50/p90/p99/avg/
// total, deletes the session.
func runBench(args []string) int {
	fs := flag.NewFlagSet("bench", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	n := fs.Int("n", 5, "number of turns per goroutine")
	concurrent := fs.Int("concurrent", 1, "number of parallel goroutines (XXX1)")
	message := fs.String("message", "say hello in one word", "message body for each turn")
	wsID := fs.String("workspace", "", "workspace id (default: first listed)")
	timeout := fs.Duration("timeout", 5*time.Minute, "per-turn timeout")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"-n": true, "--n": true,
		"--concurrent": true, "-concurrent": true,
		"--message": true, "-message": true,
		"--workspace": true, "-workspace": true,
		"--timeout": true, "-timeout": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if *n < 1 {
		fmt.Fprintln(os.Stderr, "gact bench: -n must be >= 1")
		return 2
	}
	if *concurrent < 1 {
		fmt.Fprintln(os.Stderr, "gact bench: --concurrent must be >= 1")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	if *wsID == "" {
		wss, err := c.ListWorkspaces(ctx)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact bench: list workspaces: %v\n", err)
			return 1
		}
		if len(wss) == 0 {
			fmt.Fprintln(os.Stderr, "gact bench: no workspaces; pass --workspace WS_ID")
			return 1
		}
		*wsID = wss[0].ID
	} else {
		cancel()
	}

	// XXX1: spawn `concurrent` goroutines, each running its own
	// session × N serial turns. Aggregate durations across all
	// goroutines so percentiles cover the whole load.
	type result struct {
		durations []time.Duration
		err       error
	}
	results := make([]result, *concurrent)
	var wg sync.WaitGroup
	totalStart := time.Now()
	for w := 0; w < *concurrent; w++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = runBenchWorker(c, *wsID, *n, *message, *timeout, idx)
		}(w)
	}
	wg.Wait()
	totalElapsed := time.Since(totalStart)

	var durations []time.Duration
	for i, r := range results {
		if r.err != nil {
			fmt.Fprintf(os.Stderr, "gact bench: worker %d: %v\n", i, r.err)
			return 1
		}
		durations = append(durations, r.durations...)
	}

	// Stats.
	sorted := append([]time.Duration(nil), durations...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	pct := func(p float64) time.Duration {
		if len(sorted) == 0 {
			return 0
		}
		idx := int(float64(len(sorted)-1) * p)
		if idx < 0 {
			idx = 0
		}
		return sorted[idx]
	}
	var sum time.Duration
	for _, d := range durations {
		sum += d
	}
	avg := sum / time.Duration(len(durations))

	fmt.Printf("gact bench  backend=%s  n=%d  concurrent=%d  message=%q\n",
		finalBackend, *n, *concurrent, *message)
	fmt.Printf("  total:    %s\n", totalElapsed.Round(time.Millisecond))
	fmt.Printf("  samples:  %d\n", len(durations))
	fmt.Printf("  avg:      %s\n", avg.Round(time.Millisecond))
	fmt.Printf("  p50:      %s\n", pct(0.50).Round(time.Millisecond))
	fmt.Printf("  p90:      %s\n", pct(0.90).Round(time.Millisecond))
	fmt.Printf("  p99:      %s\n", pct(0.99).Round(time.Millisecond))
	fmt.Printf("  min:      %s\n", sorted[0].Round(time.Millisecond))
	fmt.Printf("  max:      %s\n", sorted[len(sorted)-1].Round(time.Millisecond))
	if *concurrent > 1 {
		// Throughput: total turns ÷ wall clock.
		thrpt := float64(len(durations)) / totalElapsed.Seconds()
		fmt.Printf("  thrpt:    %.2f turns/s\n", thrpt)
	}
	return 0
}

// runBenchWorker is one parallel bench goroutine: creates a session,
// runs N turns serially, deletes when done, returns durations + any
// error. Each worker owns its session, so fan-out doesn't contend on
// session-level locks in the backend.
func runBenchWorker(c *client.Client, wsID string, n int, message string, timeout time.Duration, idx int) (out struct {
	durations []time.Duration
	err       error
}) {
	createCtx, createCancel := context.WithTimeout(context.Background(), 10*time.Second)
	sess, err := c.CreateSession(createCtx, client.CreateSessionRequest{
		WorkspaceID: wsID,
		Title:       fmt.Sprintf("bench-%d %s", idx, time.Now().UTC().Format("15:04:05")),
		Model:       &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
		Agent:       &gact.AgentRef{ID: "default"},
	})
	createCancel()
	if err != nil {
		out.err = fmt.Errorf("create session: %w", err)
		return
	}
	defer func() {
		delCtx, delCancel := context.WithTimeout(context.Background(), 10*time.Second)
		_ = c.DeleteSession(delCtx, sess.ID)
		delCancel()
	}()
	out.durations = make([]time.Duration, 0, n)
	for i := 0; i < n; i++ {
		turnStart := time.Now()
		postCtx, postCancel := context.WithTimeout(context.Background(), 10*time.Second)
		if _, err := c.PostMessage(postCtx, sess.ID, client.PostMessageRequest{
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: message}},
		}); err != nil {
			postCancel()
			out.err = fmt.Errorf("turn %d send: %w", i+1, err)
			return
		}
		postCancel()
		deadline := time.Now().Add(timeout)
		for {
			pollCtx, pollCancel := context.WithTimeout(context.Background(), 5*time.Second)
			s, err := c.GetSession(pollCtx, sess.ID)
			pollCancel()
			if err != nil {
				out.err = fmt.Errorf("turn %d poll: %w", i+1, err)
				return
			}
			if s.Status == gact.StatusIdle {
				break
			}
			if time.Now().After(deadline) {
				out.err = fmt.Errorf("turn %d timeout (status=%s)", i+1, s.Status)
				return
			}
			time.Sleep(50 * time.Millisecond)
		}
		out.durations = append(out.durations, time.Since(turnStart))
	}
	return
}

// runVoice implements `gact voice <sid> <audio-file|->`. Reads the
// audio bytes (file path or `-` for stdin), POSTs to the §6.14 voice
// endpoint via client.VoiceTranscribe, prints the transcribed text.
// Mime type defaults to audio/wav (matches scripts/voice-record.sh
// output) and is overridable via --mime. (PPP1)
func runVoice(args []string) int {
	fs := flag.NewFlagSet("voice", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	mime := fs.String("mime", "audio/wav", "audio MIME type (e.g. audio/wav, audio/webm)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--mime": true, "-mime": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact voice <session_id> <audio-file|->")
		return 2
	}
	sid := fs.Arg(0)
	src := fs.Arg(1)
	var audio []byte
	if src == "-" {
		b, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact voice: read stdin: %v\n", err)
			return 1
		}
		audio = b
	} else {
		b, err := os.ReadFile(src)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact voice: read %s: %v\n", src, err)
			return 1
		}
		audio = b
	}
	if len(audio) == 0 {
		fmt.Fprintln(os.Stderr, "gact voice: empty audio")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	resp, err := c.VoiceTranscribe(ctx, sid, audio, *mime)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact voice: %v\n", err)
		return 1
	}
	fmt.Print(resp.Text)
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
	// SSSS1: --format json emits one NDJSON record per state change
	// for jq pipelines. Default tsv kept for back-compat.
	format := fs.String("format", "tsv", "tsv | json (NDJSON, one record per state change)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--interval": true, "-interval": true,
		"--timeout": true, "-timeout": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact watch <session_id> [--interval DUR] [--timeout DUR] [--format tsv|json]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact watch: unknown format %q (want tsv|json)\n", *format)
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
		now := time.Now().UTC()
		if *format == "json" {
			rec := map[string]any{
				"ts":            now.Format(time.RFC3339Nano),
				"sid":           s.ID,
				"status":        s.Status,
				"message_count": s.MessageCount,
				"tokens_out":    s.Tokens.Output,
			}
			b, err := json.Marshal(rec)
			if err != nil {
				return
			}
			os.Stdout.Write(b)
			os.Stdout.Write([]byte{'\n'})
			return
		}
		fmt.Printf("%s\t%s\t%d\t%d\n",
			now.Format("15:04:05"),
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
		fmt.Fprintln(os.Stderr, "usage: gact mcp list|tools|resources|prompts <server-id> [--format tsv|json]")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "list", "ls":
		return runMcpList(rest)
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
	fmt.Fprintf(os.Stderr, "gact mcp: unknown verb %q (want list|tools|resources|prompts|reconnect|resource-read)\n", verb)
	return 2
}

// runMcpList enumerates the backend's MCP servers (`GET
// /v1/mcp/servers`). TSV columns: id, name, status, transport,
// protocol_version, capabilities (compact "tools,resources,
// prompts,logging"), last_error. JSON mode dumps the array as-is
// for downstream tooling. (JJJJ1)
func runMcpList(args []string) int {
	fs, backend, format := mcpFlagSet("mcp list")
	known := map[string]bool{"--backend": true, "-backend": true, "--format": true, "-format": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "usage: gact mcp list [--format tsv|json]")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	servers, err := c.ListMcpServers(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact mcp list: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(servers); err != nil {
			fmt.Fprintf(os.Stderr, "gact mcp list: encode: %v\n", err)
			return 1
		}
		return 0
	}
	if *format != "tsv" {
		fmt.Fprintf(os.Stderr, "gact mcp list: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	fmt.Println("id\tname\tstatus\ttransport\tprotocol\tcaps\tlast_error")
	for _, s := range servers {
		caps := []string{}
		if s.DeclaredCapabilities.Tools {
			caps = append(caps, "tools")
		}
		if s.DeclaredCapabilities.Resources != nil {
			caps = append(caps, "resources")
		}
		if s.DeclaredCapabilities.Prompts != nil {
			caps = append(caps, "prompts")
		}
		if s.DeclaredCapabilities.Logging {
			caps = append(caps, "logging")
		}
		capStr := strings.Join(caps, ",")
		if capStr == "" {
			capStr = "-"
		}
		errStr := s.LastError
		if errStr == "" {
			errStr = "-"
		}
		fmt.Printf("%s\t%s\t%s\t%s\t%s\t%s\t%s\n",
			s.ID, s.Name, s.Status, s.Transport, s.ProtocolVersion, capStr, errStr)
	}
	return 0
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
	// ZZZZ1: --glob applies a Go path.Match pattern to entry.Path
	// (the relative-to-workspace-root path the backend already
	// returns). Empty = no filter (back-compat). We deliberately use
	// path.Match (forward-slash, no recursion across `/`) rather
	// than filepath.Match so behavior is portable across hosts.
	glob := fs.String("glob", "", "filter to entries whose path matches this Go path.Match pattern (e.g. '*.go', 'cmd/*')")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
		"--glob": true, "-glob": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact files list <workspace_id> [--format tsv|json] [--glob PATTERN]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact files list: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	if *glob != "" {
		if _, err := path.Match(*glob, ""); err != nil {
			fmt.Fprintf(os.Stderr, "gact files list: bad --glob %q: %v\n", *glob, err)
			return 2
		}
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
	if *glob != "" {
		// path.Match is non-recursive across '/', so try the full
		// path first and the basename as a fallback. This matches
		// the natural intuition that '*.go' should match
		// 'src/foo.go' as well as 'foo.go'.
		filtered := entries[:0]
		for _, e := range entries {
			if matched, _ := path.Match(*glob, e.Path); matched {
				filtered = append(filtered, e)
				continue
			}
			if matched, _ := path.Match(*glob, path.Base(e.Path)); matched {
				filtered = append(filtered, e)
			}
		}
		entries = filtered
	}
	if *format == "json" {
		if entries == nil {
			entries = []gact.FileEntry{}
		}
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

// runRewind POSTs /v1/sessions/{id}/rewind, deleting every message
// after `to-msg-id`. With --include-target also drops the target.
// Different from `gact undo` — rewind targets a specific message id
// rather than counting backward from the tail (MMM7):
//
//	gact rewind <sid> <msg-id> [--include-target]
//
// Stdout: one deleted msg id per line. Stderr: count summary.
func runRewind(args []string) int {
	fs := flag.NewFlagSet("rewind", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	includeTarget := fs.Bool("include-target", false, "also delete the target message itself")
	known := map[string]bool{
		"--backend": true, "-backend": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact rewind <session_id> <to-msg-id> [--include-target]")
		return 2
	}
	sid := fs.Arg(0)
	toMid := fs.Arg(1)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	deleted, err := c.RewindSession(ctx, sid, toMid, *includeTarget)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact rewind: %v\n", err)
		return 1
	}
	for _, m := range deleted {
		fmt.Println(m)
	}
	fmt.Fprintf(os.Stderr, "deleted %d message(s)\n", len(deleted))
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
//
// OOOO1: --include CSV pulls in extra sections. Supported tokens:
//
//	tasks  — session tasks (GET /v1/sessions/{id}/tasks)
//	hooks  — hooks scoped to this session (filtered from ListHooks)
//
// In text mode, extra sections are appended under "--- tasks ---" /
// "--- hooks ---" headers. In JSON mode the response is wrapped:
// {"session": {...}, "tasks": [...], "hooks": [...]}.
func runInfo(args []string) int {
	fs := flag.NewFlagSet("info", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "text", "text | json")
	include := fs.String("include", "", "comma-separated extras: tasks,hooks")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
		"--include": true, "-include": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact info <session_id> [--format text|json] [--include tasks,hooks,perms]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact info: unknown format %q (want text|json)\n", *format)
		return 2
	}
	wantTasks, wantHooks, wantPerms := false, false, false
	for _, t := range strings.Split(*include, ",") {
		switch strings.TrimSpace(t) {
		case "":
		case "tasks":
			wantTasks = true
		case "hooks":
			wantHooks = true
		case "perms":
			// NNNNN1: --include perms pulls every permission request
			// the session has seen (pending + resolved). Useful for
			// "what did I allow/deny in this session?" audits without
			// chaining info + perms list.
			wantPerms = true
		default:
			fmt.Fprintf(os.Stderr, "gact info: unknown --include token %q (want tasks|hooks|perms)\n", t)
			return 2
		}
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
	var tasks []gact.SessionTask
	if wantTasks {
		tasks, err = c.ListSessionTasks(ctx, sid)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact info: list tasks: %v\n", err)
			return 1
		}
	}
	var perms []client.PermissionWire
	if wantPerms {
		// All permissions the session has seen — including resolved
		// ones — so the user can see the full a/d/s/w trail. Pass
		// onlyPending=false to get the full set.
		perms, err = c.ListPermissions(ctx, sid, false)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact info: list permissions: %v\n", err)
			return 1
		}
	}
	var sessionHooks []gact.Hook
	if wantHooks {
		all, err := c.ListHooks(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact info: list hooks: %v\n", err)
			return 1
		}
		// Keep hooks scoped to this session OR with no scope (global
		// applies to every session). Workspace-scoped hooks for this
		// session's workspace also count — they fire for this session.
		for _, h := range all {
			switch {
			case h.SessionID == sid:
				sessionHooks = append(sessionHooks, h)
			case h.SessionID == "" && h.WorkspaceID == "":
				sessionHooks = append(sessionHooks, h)
			case h.SessionID == "" && h.WorkspaceID == s.WorkspaceID:
				sessionHooks = append(sessionHooks, h)
			}
		}
	}
	if *format == "json" {
		out := map[string]any{"session": s}
		if wantTasks {
			if tasks == nil {
				tasks = []gact.SessionTask{}
			}
			out["tasks"] = tasks
		}
		if wantHooks {
			if sessionHooks == nil {
				sessionHooks = []gact.Hook{}
			}
			out["hooks"] = sessionHooks
		}
		if wantPerms {
			if perms == nil {
				perms = []client.PermissionWire{}
			}
			out["perms"] = perms
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(out); err != nil {
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
	if wantTasks {
		fmt.Println("--- tasks ---")
		if len(tasks) == 0 {
			fmt.Println("(none)")
		} else {
			for _, t := range tasks {
				fmt.Printf("%s\t%s\t%s\n", t.Status, t.ID, t.Title)
			}
		}
	}
	if wantHooks {
		fmt.Println("--- hooks ---")
		if len(sessionHooks) == 0 {
			fmt.Println("(none)")
		} else {
			for _, h := range sessionHooks {
				target := h.Command
				if h.URL != "" {
					target = h.URL
				}
				scope := "global"
				if h.SessionID != "" {
					scope = "session=" + h.SessionID
				} else if h.WorkspaceID != "" {
					scope = "workspace=" + h.WorkspaceID
				}
				fmt.Printf("%s\t%s\t%s\t%s\n", h.ID, h.Event, target, scope)
			}
		}
	}
	if wantPerms {
		fmt.Println("--- perms ---")
		if len(perms) == 0 {
			fmt.Println("(none)")
		} else {
			for _, p := range perms {
				summary := p.Summary
				if summary == "" {
					summary = p.ToolCall.ToolName
				}
				row := fmt.Sprintf("%s\t%s\t%s", p.Status, p.ID, summary)
				if p.Action != "" {
					row += "\taction=" + string(p.Action)
				}
				fmt.Println(row)
			}
		}
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
	// OOOOO1: --format json emits the raw PermissionWire array with
	// the full ToolCall payload (input args + annotations) intact —
	// the TSV view loses that. Default tsv preserved for back-compat
	// with the existing perms-list scripting + the test harness.
	format := fs.String("format", "tsv", "tsv | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--pending": true, "-pending": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact perms list <session_id> [--pending] [--format tsv|json] [--backend URL]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact perms list: unknown format %q (want tsv|json)\n", *format)
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
	if *format == "json" {
		if perms == nil {
			perms = []client.PermissionWire{}
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(perms); err != nil {
			fmt.Fprintf(os.Stderr, "gact perms list: encode: %v\n", err)
			return 1
		}
		return 0
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
	// UUUU1: --filter mirrors `gact tail --filter` (RRR1) so the
	// human-readable view can drop noise (e.g. message.part.delta
	// floods) just as easily as the JSON view.
	filter := fs.String("filter", "", "comma-separated event types to keep; empty = all")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--workspace": true, "-workspace": true,
		"--filter": true, "-filter": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	var keep map[string]bool
	if *filter != "" {
		keep = map[string]bool{}
		for _, t := range strings.Split(*filter, ",") {
			if t = strings.TrimSpace(t); t != "" {
				keep[t] = true
			}
		}
	}
	scope := client.EventStreamScope{WorkspaceID: *wsID}
	if fs.NArg() == 1 {
		scope.SessionID = fs.Arg(0)
	} else if fs.NArg() > 1 {
		fmt.Fprintln(os.Stderr, "usage: gact stream [session_id] [--workspace WS_ID] [--filter type1,type2]")
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
			if keep != nil && !keep[e.Type] {
				continue
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
	since := fs.Duration("since", 0, "include only sessions with UpdatedAt within the last DUR (EEEE1)")
	known := map[string]bool{
		"--backend": true, "-backend": true, "-o": true,
		"--since": true, "-since": true,
	}
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

	// detached.json — local Ctrl+Z-detach registry. Best-effort:
	// missing/unreadable file just doesn't add the entry. Useful for
	// bug reports about resume / re-attach UX where the registry's
	// state is the load-bearing context. (TTTTTTTT1)
	if regPath, err := config.DetachedPath(); err == nil {
		if reg, err := config.LoadDetached(regPath); err == nil {
			f, ferr := os.Create(filepath.Join(*out, "detached.json"))
			if ferr == nil {
				enc := json.NewEncoder(f)
				enc.SetIndent("", "  ")
				_ = enc.Encode(reg)
				f.Close()
			}
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
	// EEEE1: --since filter — drop sessions whose UpdatedAt is older
	// than the cutoff. Sessions with zero UpdatedAt always survive
	// (defensive against backends that don't stamp).
	if *since > 0 {
		cutoff := time.Now().UTC().Add(-*since)
		filtered := sessions[:0]
		for _, s := range sessions {
			if s.UpdatedAt.IsZero() || !s.UpdatedAt.Before(cutoff) {
				filtered = append(filtered, s)
			}
		}
		fmt.Fprintf(os.Stderr, "gact dump-bundle: --since %s kept %d/%d sessions\n",
			*since, len(filtered), len(sessions))
		sessions = filtered
	}
	// RRRR1: same 8-wide bounded fanout as runExportAll (QQQQ1) so a
	// big bundle doesn't pay sessions×RTT.
	const dumpWorkers = 8
	type dumpResult struct {
		sid string
		err error
	}
	dumpSem := make(chan struct{}, dumpWorkers)
	dumpResults := make(chan dumpResult, len(sessions))
	var dumpWG sync.WaitGroup
	for _, s := range sessions {
		s := s
		dumpWG.Add(1)
		dumpSem <- struct{}{}
		go func() {
			defer dumpWG.Done()
			defer func() { <-dumpSem }()
			ectx, ecancel := context.WithTimeout(context.Background(), 30*time.Second)
			blob, err := c.ExportSession(ectx, s.ID)
			ecancel()
			if err != nil {
				dumpResults <- dumpResult{sid: s.ID, err: err}
				return
			}
			f, ferr := os.Create(filepath.Join(sessDir, s.ID+".json"))
			if ferr != nil {
				dumpResults <- dumpResult{sid: s.ID, err: fmt.Errorf("create: %w", ferr)}
				return
			}
			enc := json.NewEncoder(f)
			enc.SetIndent("", "  ")
			_ = enc.Encode(blob)
			f.Close()
			dumpResults <- dumpResult{sid: s.ID}
		}()
	}
	dumpWG.Wait()
	close(dumpResults)
	ok := 0
	for r := range dumpResults {
		if r.err != nil {
			fmt.Fprintf(os.Stderr, "  %s: %v\n", r.sid, r.err)
			continue
		}
		ok++
	}

	fmt.Fprintf(os.Stderr, "gact dump-bundle: wrote %d sessions + version + diag + metrics + detached → %s\n", ok, *out)
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
	// PPPP1: --format json emits the raw ContextFile array for jq
	// pipelines. Default tsv kept for back-compat.
	format := fs.String("format", "tsv", "tsv | json")
	// AAAAA1: --mode filters to one of read|edit|pin. Empty = all.
	modeFilter := fs.String("mode", "", "filter by mode: read|edit|pin; empty = all")
	// AAAAA1: --glob filters by Go path.Match against the entry's
	// path (with basename fallback like ZZZZ1).
	glob := fs.String("glob", "", "filter by Go path.Match pattern (e.g. '*.go'); basename fallback")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--format": true, "-format": true,
		"--mode": true, "-mode": true,
		"--glob": true, "-glob": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact context list <session_id> [--format tsv|json] [--mode read|edit|pin] [--glob PATTERN] [--backend URL]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact context list: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	switch *modeFilter {
	case "", "read", "edit", "pin":
	default:
		fmt.Fprintf(os.Stderr, "gact context list: unknown --mode %q (want read|edit|pin)\n", *modeFilter)
		return 2
	}
	if *glob != "" {
		if _, err := path.Match(*glob, ""); err != nil {
			fmt.Fprintf(os.Stderr, "gact context list: bad --glob %q: %v\n", *glob, err)
			return 2
		}
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
	if *modeFilter != "" || *glob != "" {
		filtered := files[:0]
		for _, f := range files {
			if *modeFilter != "" && f.Mode != *modeFilter {
				continue
			}
			if *glob != "" {
				matched, _ := path.Match(*glob, f.Path)
				if !matched {
					if m2, _ := path.Match(*glob, path.Base(f.Path)); !m2 {
						continue
					}
				}
			}
			filtered = append(filtered, f)
		}
		files = filtered
	}
	if *format == "json" {
		if files == nil {
			files = []gact.ContextFile{}
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(files); err != nil {
			fmt.Fprintf(os.Stderr, "gact context list: encode: %v\n", err)
			return 1
		}
		return 0
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
	instructions := fs.String("instructions", "", "custom summarizer prompt (MMM6, optional)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--auto": true, "-auto": true,
		"--instructions": true, "-instructions": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact summarize <session_id> [--auto=false] [--instructions \"...\"] [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := c.SummarizeSession(ctx, sid, *auto, *instructions); err != nil {
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
    cmds="agent agents archive ask attach bench cancel capabilities caps catalog completion conformance context dashboard delete diag diff dump-bundle emit-config env export files follow fork grep hooks import info list log mcp metrics models new perms ping plugins quick rename replay repo-map rewind run search send stream summarize tail tasks tell theme tool tools unarchive undo version voice wait watch workspaces"

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
    cmds=(agent agents archive ask attach bench cancel capabilities caps catalog completion conformance context dashboard delete diag diff dump-bundle emit-config env export files follow fork grep hooks import info list log mcp metrics models new perms ping plugins quick rename replay repo-map rewind run search send stream summarize tail tasks tell theme tool tools unarchive undo version voice wait watch workspaces)
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
complete -c gact -n "__fish_use_subcommand" -a "agent agents archive ask attach bench cancel capabilities caps catalog completion conformance context dashboard delete diag diff dump-bundle emit-config env export files follow fork grep hooks import info list log mcp metrics models new perms ping plugins quick rename replay repo-map rewind run search send stream summarize tail tasks tell theme tool tools unarchive undo version voice wait watch workspaces"
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
	since := fs.Duration("since", 0, "only print messages with created_at within the last DUR (e.g. 5m, 1h); 0 = unset")
	// MMMM1: --format json emits NDJSON (one message per line) so
	// callers can pipe to jq. Default stays text for back-compat.
	format := fs.String("format", "text", "text | json (NDJSON, one message per line)")
	// VVVVVVVV1: --role filter narrows to one or more roles
	// (comma-separated). Accepted: user|assistant|tool|system. Empty
	// = show everything (back-compat).
	role := fs.String("role", "", "comma-separated role filter: user|assistant|tool|system")
	// BBBBBBBBB1: --grep PATTERN drops messages whose flattened text
	// doesn't match the regex (case-insensitive by default — prepend
	// `(?-i)` to override). Composes with --role/--since/--limit.
	grep := fs.String("grep", "", "regex: drop messages whose flattened text doesn't match (case-insensitive)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--limit": true, "-limit": true,
		"--since": true, "-since": true,
		"--format": true, "-format": true,
		"--role":   true, "-role": true,
		"--grep":   true, "-grep": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact log <session_id> [--limit N] [--since DUR] [--role user,assistant,...] [--grep REGEX] [--format text|json] [--backend URL]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact log: unknown format %q (want text|json)\n", *format)
		return 2
	}
	// BBBBBBBBB1: compile the regex up-front so a bad pattern errors
	// fast instead of silently producing an empty log. Default to
	// case-insensitive; callers who need case-sensitive can prefix
	// the pattern with `(?-i)`.
	var grepRE *regexp.Regexp
	if *grep != "" {
		re, err := regexp.Compile("(?i)" + *grep)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact log: bad --grep pattern %q: %v\n", *grep, err)
			return 2
		}
		grepRE = re
	}
	// VVVVVVVV1: validate + build the role keep-set up front so a
	// typo in --role errors fast instead of silently returning an
	// empty log.
	var keepRole map[string]bool
	if *role != "" {
		keepRole = map[string]bool{}
		for _, r := range strings.Split(*role, ",") {
			r = strings.TrimSpace(r)
			switch r {
			case "":
			case "user", "assistant", "tool", "system":
				keepRole[r] = true
			default:
				fmt.Fprintf(os.Stderr, "gact log: unknown --role %q (want user|assistant|tool|system)\n", r)
				return 2
			}
		}
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
	// TTT1: --since drops messages older than the cutoff. Computed
	// once vs each message's CreatedAt; missing timestamps survive
	// (unprintable to filter).
	if *since > 0 {
		cutoff := time.Now().UTC().Add(-*since)
		filtered := msgs[:0]
		for _, m := range msgs {
			if m.CreatedAt.IsZero() || !m.CreatedAt.Before(cutoff) {
				filtered = append(filtered, m)
			}
		}
		msgs = filtered
	}
	// VVVVVVVV1: drop messages whose role isn't in the keep-set.
	// Applied after --since so both filters stack cleanly.
	if keepRole != nil {
		kept := msgs[:0]
		for _, m := range msgs {
			if keepRole[string(m.Role)] {
				kept = append(kept, m)
			}
		}
		msgs = kept
	}
	// BBBBBBBBB1: drop messages whose flattened text doesn't match
	// the --grep regex. Uses the same messageText() helper the
	// clipboard path uses so the search target matches what the
	// user actually sees in the rendered log (text + thinking, tool
	// calls + results excluded). Messages with no text content
	// (e.g. pure tool_call assistant turns) never match.
	if grepRE != nil {
		kept := msgs[:0]
		for _, m := range msgs {
			txt, ok := flattenMessageForGrep(m)
			if !ok {
				continue
			}
			if grepRE.MatchString(txt) {
				kept = append(kept, m)
			}
		}
		msgs = kept
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		// One message per line — explicit no-indent so it's true
		// NDJSON, not pretty-printed JSON-Lines.
		for _, m := range msgs {
			if err := enc.Encode(m); err != nil {
				fmt.Fprintf(os.Stderr, "gact log: encode: %v\n", err)
				return 1
			}
		}
		return 0
	}
	for _, m := range msgs {
		printLogMessage(m)
	}
	return 0
}

// printLogMessage renders one message in the canonical role-headered
// shape used by `gact log` and `gact follow`. Extracted so both
// callers stay in sync.
func printLogMessage(m gact.Message) {
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

// indent prefixes every line of s with prefix. Used by `gact log` to
// keep multi-line bodies aligned under their role header.
func indent(s, prefix string) string {
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	for i := range lines {
		lines[i] = prefix + lines[i]
	}
	return strings.Join(lines, "\n")
}

// flattenMessageForGrep joins every text-bearing part in a message
// (text, thinking, tool_call name + serialized input, tool_result
// flattened content) into a single string so `--grep` (BBBBBBBBB1)
// can match any of them. Returns ("", false) when the message has
// no grep-able content — caller treats that as "doesn't match".
func flattenMessageForGrep(m gact.Message) (string, bool) {
	var b strings.Builder
	for _, p := range m.Parts {
		switch p.Type {
		case gact.PartTypeText:
			if p.Text == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(p.Text)
		case gact.PartTypeThinking:
			if p.Thinking == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(p.Thinking)
		case gact.PartTypeToolCall:
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(p.ToolName)
			if len(p.Input) > 0 {
				args, _ := json.Marshal(p.Input)
				b.WriteString(" ")
				b.Write(args)
			}
		case gact.PartTypeToolResult:
			body := flattenToolResultParts(p.Content)
			if body == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			b.WriteString(body)
		}
	}
	if b.Len() == 0 {
		return "", false
	}
	return b.String(), true
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
	anyOf := fs.String("any-of", "", "comma-separated session ids; return on first idle (YYY1)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--timeout": true, "-timeout": true,
		"--interval": true, "-interval": true,
		"--any-of": true, "-any-of": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}

	// Build the list of sids to watch. --any-of comma-list takes
	// precedence; otherwise expect one positional arg (back-compat).
	var sids []string
	if *anyOf != "" {
		for _, s := range strings.Split(*anyOf, ",") {
			if s = strings.TrimSpace(s); s != "" {
				sids = append(sids, s)
			}
		}
	} else if fs.NArg() == 1 {
		sids = []string{fs.Arg(0)}
	}
	if len(sids) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact wait <session_id> | --any-of sid1,sid2,... [--timeout DUR] [--interval DUR]")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)

	deadline := time.Now().Add(*timeout)
	for {
		// Poll each sid in this round; first to land idle wins.
		// Single-id path stays trivially equivalent to the old
		// behaviour.
		for _, sid := range sids {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			s, err := c.GetSession(ctx, sid)
			cancel()
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact wait: %v\n", err)
				return 1
			}
			if s.Status == gact.StatusIdle {
				if len(sids) > 1 {
					// In --any-of mode, print the winning sid so
					// pipes can branch on it.
					fmt.Println(sid)
				}
				return 0
			}
		}
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "gact wait: timeout after %s (none of %d sessions idle)\n",
				*timeout, len(sids))
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
	filter := fs.String("filter", "", "comma-separated event types to keep (e.g. permission.requested,tool.call.completed); empty = all")
	// TTTT1: --format text reuses the runStream `streamRow()`
	// human-readable formatter. Default kept as json (NDJSON) for
	// back-compat with existing scripting callers.
	format := fs.String("format", "json", "json (NDJSON) | text (one human-readable line per event, like `gact stream`)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--workspace": true, "-workspace": true,
		"--filter": true, "-filter": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if *format != "json" && *format != "text" {
		fmt.Fprintf(os.Stderr, "gact tail: unknown format %q (want json|text)\n", *format)
		return 2
	}
	// RRR1: parse --filter into a quick-lookup set; nil means "all".
	var keep map[string]bool
	if *filter != "" {
		keep = map[string]bool{}
		for _, t := range strings.Split(*filter, ",") {
			if t = strings.TrimSpace(t); t != "" {
				keep[t] = true
			}
		}
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
			// RRR1: when --filter is set, drop events whose type
			// isn't in the keep set. nil keep = passthrough.
			if keep != nil && !keep[e.Type] {
				continue
			}
			// TTTT1: --format text reuses streamRow() so the human-
			// readable view matches `gact stream` exactly.
			if *format == "text" {
				fmt.Println(streamRow(e))
				continue
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
	jsonOut := fs.Bool("json", false, "emit a single-line JSON object (overrides -q)")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	h, err := c.Health(ctx)
	if err != nil {
		if *jsonOut {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"ok":      false,
				"backend": finalBackend,
				"error":   err.Error(),
			})
		} else if !*quiet {
			fmt.Fprintf(os.Stderr, "gact ping: %v\n", err)
		}
		return 1
	}
	if !h.Healthy {
		if *jsonOut {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"ok":       false,
				"backend":  finalBackend,
				"uptime_s": h.UptimeS,
				"error":    "backend reports unhealthy",
			})
		} else if !*quiet {
			fmt.Fprintf(os.Stderr, "gact ping: backend reports unhealthy\n")
		}
		return 1
	}
	if *jsonOut {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
			"ok":       true,
			"backend":  finalBackend,
			"uptime_s": h.UptimeS,
		})
	} else if !*quiet {
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
		// Translate user-friendly "waiting" alias to server status
		// `waiting_permission`. Same fix applied to dashboard (YYYY1).
		want := *status
		if want == "waiting" {
			want = "waiting_permission"
		}
		filtered := sessions[:0]
		for _, s := range sessions {
			if s.Status == want {
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
//
// QQQQ1: each session's export+write runs on a bounded goroutine
// pool (8-wide) so a 200-session backup doesn't take 200×RTT. The
// pool size is fixed: chosen because it pairs with the same constant
// used by `gact tasks summary` (FFFF1) — 8 is enough to saturate a
// LAN backend without DoSing it.
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
	cancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact export: list sessions: %v\n", err)
		return 1
	}
	if len(sessions) == 0 {
		fmt.Fprintln(os.Stderr, "gact export: no sessions to export")
		return 0
	}

	const workers = 8
	type result struct {
		sid string
		err error
	}
	sem := make(chan struct{}, workers)
	results := make(chan result, len(sessions))
	var wg sync.WaitGroup
	for _, s := range sessions {
		s := s
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			ectx, ecancel := context.WithTimeout(context.Background(), 30*time.Second)
			blob, err := c.ExportSession(ectx, s.ID)
			ecancel()
			if err != nil {
				results <- result{sid: s.ID, err: err}
				return
			}
			path := filepath.Join(dir, s.ID+".json")
			f, err := os.Create(path)
			if err != nil {
				results <- result{sid: s.ID, err: fmt.Errorf("create %s: %w", path, err)}
				return
			}
			enc := json.NewEncoder(f)
			enc.SetIndent("", "  ")
			if err := enc.Encode(blob); err != nil {
				f.Close()
				results <- result{sid: s.ID, err: fmt.Errorf("encode: %w", err)}
				return
			}
			f.Close()
			results <- result{sid: s.ID}
		}()
	}
	wg.Wait()
	close(results)

	ok, failed := 0, 0
	for r := range results {
		if r.err != nil {
			fmt.Fprintf(os.Stderr, "  %s: %v\n", r.sid, r.err)
			failed++
			continue
		}
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
