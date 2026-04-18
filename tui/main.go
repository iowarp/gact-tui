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
// runList implements `gact list [--backend URL] [--workspace WS_ID]`.
// Prints one tab-separated row per session (id, status, title,
// updated_at RFC3339) so shell pipelines can grep / awk the output.
// No TUI launch; useful for remote scripting.
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
	format := fs.String("format", "tsv", "output format: tsv | json")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: *wsID})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact list: %v\n", err)
		return 1
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
