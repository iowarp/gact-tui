package cli

import (
	"fmt"
	"os"
	"strings"
)

// commandGroup buckets a command for help rendering. Every command lands in
// exactly one group, so a command can never be listed twice (the historical
// drift where `gact list` / `gact send` appeared in both the "Common" and the
// "All Commands" blocks).
type commandGroup int

const (
	// groupTop renders under the "Usage:" synopsis (interactive TUI plus the
	// local-agent lifecycle commands).
	groupTop commandGroup = iota
	// groupCommon renders under "Common:" — the everyday session commands.
	groupCommon
	// groupAll renders under "All Commands:" — everything else.
	groupAll
	// groupHidden is dispatchable but never listed (the --help flag itself).
	groupHidden
)

// commandSpec is the single source of truth for one gact subcommand: how it is
// dispatched (Name/Aliases → Run), how it renders in `gact --help`
// (Group/Argspec/Summary/FlagHelp), and how it renders in `gact man`
// (ManBody, when non-empty). Dispatch, usage, and the man page are all derived
// from commandTable so the three can never drift apart.
type commandSpec struct {
	// Name is the canonical subcommand token.
	Name string
	// Aliases are additional dispatch tokens (including flag forms such as
	// "--version"). Never rendered in the command listing.
	Aliases []string
	// Group selects the help section this command renders in.
	Group commandGroup
	// Argspec is the positional-argument hint shown after the name.
	Argspec string
	// Summary is the one-line description on the command's usage line.
	Summary string
	// FlagHelp holds continuation lines rendered indented under the command.
	FlagHelp []string
	// ManBody, when non-empty, gives the command a section in `gact man`.
	ManBody string
	// Run executes the command with the args that follow the subcommand token
	// and returns the process exit code.
	Run func(rest []string) int
	// HandsOff commands print-and-return or hand control to the interactive TUI
	// (attach/replay/resume); Dispatch returns true for them instead of calling
	// os.Exit with the return value.
	HandsOff bool
}

// void adapts a no-return handler (runVersion, runDiag, …) to the commandSpec
// Run signature. The return value is ignored for HandsOff commands.
func void(fn func()) func(rest []string) int {
	return func(_ []string) int {
		fn()
		return 0
	}
}

// commandTable is the one list every command surface is generated from. Order
// is the render order within each group. It is populated in init (rather than a
// var initializer) because the Run closures reference handlers — e.g. runMan —
// that transitively read commandTable, which a static initializer would reject
// as an initialization cycle.
var commandTable []commandSpec

func init() { commandTable = commandSpecs() }

func commandSpecs() []commandSpec {
	return []commandSpec{
		// ── groupTop: interactive TUI + local-agent lifecycle ──────────────────
		{
			Name: "deploy", Group: groupTop, Argspec: "<kind> <name>",
			Summary: "spawn an adapter detached; registers locally",
			FlagHelp: []string{
				"alias: gact agent deploy <kind> <name>",
				"--bin PATH override adapter binary; --port N; --cwd DIR",
			},
			ManBody: "Spawn an adapter in the background and register it locally.\nA common flow is:\n    gact deploy <kind> myagent\n    gact connect myagent",
			Run:     func(r []string) int { return runAgentDeploy(r) },
		},
		{
			Name: "connect", Group: groupTop, Argspec: "<name>",
			Summary:  "launch TUI pointed at a deployed agent",
			FlagHelp: []string{"alias: gact agent connect <name>"},
			ManBody:  "Launch the TUI pointed at a deployed agent.",
			Run:      func(r []string) int { return runAgentConnect(r) }, HandsOff: false,
		},
		{
			Name: "agent", Aliases: []string{"agents"}, Group: groupTop, Argspec: "<verb>",
			Summary: "deployed-agent registry (list, deploy, connect, stop, rm, show)",
			FlagHelp: []string{
				"list                  show deployed agents (name, kind, port, pid, alive status)",
				"show <id>             print one agent's metadata + system prompt",
			},
			ManBody: "Show deployed agents, including host, port, pid, and liveness.",
			Run:     func(r []string) int { return runAgent(r) },
		},
		{
			Name: "stop", Group: groupTop, Argspec: "<name>",
			Summary:  "stop a deployed adapter process",
			FlagHelp: []string{"alias: gact agent stop <name>"},
			ManBody:  "Stop a deployed adapter process.",
			Run:      func(r []string) int { return runAgentStop(r) },
		},
		{
			Name: "rm", Group: groupTop, Argspec: "<name>",
			Summary:  "drop a deployed-agent entry (stops first if running)",
			FlagHelp: []string{"alias: gact agent rm <name>"},
			ManBody:  "Remove the local registry entry. Stops the process first if it is\nstill running.",
			Run:      func(r []string) int { return runAgentRm(r) },
		},
		{
			Name: "man", Aliases: []string{"manual"}, Group: groupTop,
			Summary: "print the manual; --format text|roff; --install",
			Run:     func(r []string) int { return runMan(r) },
		},

		// ── groupCommon: everyday session commands ─────────────────────────────
		{
			Name: "new", Group: groupCommon, Argspec: "[--title T]",
			Summary: "create a session; print id to stdout",
			ManBody: "Create a session and print its id.",
			Run:     func(r []string) int { return runNew(r) },
		},
		{
			Name: "ask", Group: groupCommon, Argspec: "<sid> <q|->",
			Summary: "send + wait + print assistant reply",
			ManBody: "Send a question, wait for completion, and print the assistant\nreply.",
			Run:     func(r []string) int { return runAsk(r) },
		},
		{
			Name: "send", Group: groupCommon, Argspec: "<sid> <text|->",
			Summary: "post a user message to a session",
			ManBody: "Post a user message to a session.",
			Run:     func(r []string) int { return runSend(r) },
		},
		{
			Name: "run", Group: groupCommon, Argspec: "<sid> <text|->",
			Summary: "send + wait in one command",
			ManBody: "Send and wait in one command.",
			Run:     func(r []string) int { return runRun(r) },
		},
		{
			Name: "log", Group: groupCommon, Argspec: "<sid>",
			Summary: "dump conversation messages (text by default; --format json for NDJSON)",
			FlagHelp: []string{
				"--role user,assistant,tool,system filters to one or more roles",
				"--grep REGEX drops messages whose text doesn't match (case-insensitive)",
			},
			ManBody: "Dump conversation messages. Use --format json for NDJSON,\n--role to filter roles, and --grep to filter text.",
			Run:     func(r []string) int { return runLog(r) },
		},
		{
			Name: "list", Group: groupCommon,
			Summary:  "list recent sessions (tab-separated)",
			FlagHelp: []string{"--detached-only, --sort newest|oldest|status|tokens|backend, --limit N"},
			ManBody:  "List recent sessions.",
			Run:      func(r []string) int { return runList(r) },
		},

		// ── groupAll: everything else ──────────────────────────────────────────
		{
			Name: "export", Group: groupAll, Argspec: "<session_id>",
			Summary:  "download a session blob (JSON) to stdout",
			FlagHelp: []string{"--all -o DIR   bulk-export every session as JSON files"},
			Run:      func(r []string) int { return runExport(r) },
		},
		{
			Name: "import", Group: groupAll, Argspec: "<file|->",
			Summary: "upload a previously-exported session blob",
			Run:     func(r []string) int { return runImport(r) },
		},
		{
			Name: "version", Aliases: []string{"--version", "-v"}, Group: groupAll,
			Summary: "print version + contract version",
			Run:     void(runVersion), HandsOff: true,
		},
		{
			Name: "diag", Aliases: []string{"--diag"}, Group: groupAll,
			Summary: "print environment + config for bug reports",
			Run:     void(runDiag), HandsOff: true,
		},
		{
			Name: "emit-config", Aliases: []string{"--emit-config"}, Group: groupAll,
			Summary: "print sample config.json to stdout",
			Run:     void(runEmitConfig), HandsOff: true,
		},
		{
			Name: "tail", Group: groupAll, Argspec: "[SID]",
			Summary: "stream SSE events (NDJSON default; --format text for human one-liners)",
			Run:     func(r []string) int { return runTail(r) },
		},
		{
			Name: "ping", Group: groupAll,
			Summary: "probe /v1/health (exit 0 if healthy)",
			Run:     func(r []string) int { return runPing(r) },
		},
		{
			Name: "wait", Group: groupAll, Argspec: "<sid>",
			Summary: "block until the session status is idle",
			Run:     func(r []string) int { return runWait(r) },
		},
		{
			Name: "cancel", Group: groupAll, Argspec: "<sid>",
			Summary: "POST /v1/sessions/{id}/cancel",
			Run:     func(r []string) int { return runCancel(r) },
		},
		{
			Name: "delete", Group: groupAll, Argspec: "<sid>",
			Summary: "DELETE /v1/sessions/{id}",
			Run:     func(r []string) int { return runDelete(r) },
		},
		{
			Name: "rename", Group: groupAll, Argspec: "<sid> <title>",
			Summary: "PATCH session title",
			Run:     func(r []string) int { return runRename(r) },
		},
		{
			Name: "archive", Group: groupAll, Argspec: "<sid>",
			Summary: "hide a session from the default sidebar",
			Run:     func(r []string) int { return runArchive(r, true) },
		},
		{
			Name: "unarchive", Group: groupAll, Argspec: "<sid>",
			Summary: "restore an archived session",
			Run:     func(r []string) int { return runArchive(r, false) },
		},
		{
			Name: "completion", Group: groupAll, Argspec: "<shell>",
			Summary: "print bash|zsh|fish completion script",
			Run:     func(r []string) int { return runCompletion(r) },
		},
		{
			Name: "metrics", Group: groupAll, Argspec: "[--format]",
			Summary: "backend metrics summary (text or json)",
			Run:     func(r []string) int { return runMetrics(r) },
		},
		{
			Name: "quick", Group: groupAll, Argspec: "<q|->",
			Summary: "one-shot Q&A (creates+asks+deletes session)",
			Run:     func(r []string) int { return runQuick(r) },
		},
		{
			Name: "summarize", Group: groupAll, Argspec: "<sid>",
			Summary: "trigger backend summary; prints result",
			Run:     func(r []string) int { return runSummarize(r) },
		},
		{
			Name: "context", Group: groupAll, Argspec: "<verb>",
			Summary: "manage session context files",
			FlagHelp: []string{
				"list <sid>          list context files; --mode read|edit|pin --glob PATTERN to filter",
				"show <sid> <p>      preview context file content (--format text|json)",
				"upload <sid> <p>    upload a local file into session context",
				"add <sid> <p>       attach a file (--mode read|edit|pin)",
				"rm <sid> <p>        detach a file",
			},
			Run: func(r []string) int { return runContext(r) },
		},
		{
			Name: "catalog", Group: groupAll, Argspec: "<kind>",
			Summary: "list tools|agents|mcp|commands (TSV or JSON)",
			Run:     func(r []string) int { return runCatalog(r) },
		},
		{
			Name: "dump-bundle", Group: groupAll, Argspec: "[-o DIR]",
			Summary: "diag + metrics + every session as a bundle",
			Run:     func(r []string) int { return runDumpBundle(r) },
		},
		{
			Name: "stream", Group: groupAll, Argspec: "[SID]",
			Summary: "pretty-print SSE events as a one-liner timeline; --filter type1,type2 to narrow",
			Run:     func(r []string) int { return runStream(r) },
		},
		{
			Name: "perms", Aliases: []string{"perm", "permissions"}, Group: groupAll, Argspec: "<verb>",
			Summary: "manage session permissions",
			FlagHelp: []string{
				"list <sid>          list permissions for a session",
				"allow <pid>         allow / deny / allow-session / allow-workspace",
			},
			Run: func(r []string) int { return runPerms(r) },
		},
		{
			Name: "diff", Aliases: []string{"diffs"}, Group: groupAll, Argspec: "<verb>",
			Summary: "manage pending file diffs",
			FlagHelp: []string{
				"list <sid>          list file_diff parts (path + status)",
				"apply <sid> [p…]    apply pending diffs (no paths = all)",
				"reject <sid> [p…]   reject pending diffs",
			},
			Run: func(r []string) int { return runDiff(r) },
		},
		{
			Name: "search", Group: groupAll, Argspec: "<sid> <query>",
			Summary: "full-text search across session messages",
			Run:     func(r []string) int { return runSearch(r) },
		},
		{
			Name: "workspaces", Aliases: []string{"workspace", "ws"}, Group: groupAll, Argspec: "list",
			Summary: "list workspaces (TSV: id  name  root_path)",
			Run:     func(r []string) int { return runWorkspaces(r) },
		},
		{
			Name: "fork", Group: groupAll, Argspec: "<sid> [--at MID]",
			Summary: "spawn a child session forked from another",
			Run:     func(r []string) int { return runFork(r) },
		},
		{
			Name: "models", Aliases: []string{"model"}, Group: groupAll, Argspec: "list",
			Summary: "list providers + models (TSV: pid mid name ctx)",
			Run:     func(r []string) int { return runModels(r) },
		},
		{
			Name: "info", Group: groupAll, Argspec: "<sid>",
			Summary: "print one session's metadata; --include tasks,hooks,perms for composite view",
			Run:     func(r []string) int { return runInfo(r) },
		},
		{
			Name: "undo", Group: groupAll, Argspec: "<sid> [--count N]",
			Summary: "revert the last N messages (default 1)",
			Run:     func(r []string) int { return runUndo(r) },
		},
		{
			Name: "rewind", Group: groupAll, Argspec: "<sid> <mid>",
			Summary: "delete every message after <mid> [--include-target]",
			Run:     func(r []string) int { return runRewind(r) },
		},
		{
			Name: "files", Aliases: []string{"file"}, Group: groupAll, Argspec: "<verb>",
			Summary: "workspace files",
			FlagHelp: []string{
				"list <ws-id>        list workspace files; --glob PATTERN to filter (e.g. '*.go')",
				"read <ws-id> <path> dump file bytes to stdout",
			},
			Run: func(r []string) int { return runFiles(r) },
		},
		{
			Name: "repo-map", Aliases: []string{"repomap"}, Group: groupAll, Argspec: "<ws-id>",
			Summary: "tree-render the workspace repo map",
			Run:     func(r []string) int { return runRepoMap(r) },
		},
		{
			Name: "mcp", Group: groupAll, Argspec: "<verb>",
			Summary: "inspect connected MCP servers",
			FlagHelp: []string{
				"list                list all connected MCP servers (TSV or JSON)",
				"tools <srv-id>      list one MCP server's tools (TSV or JSON)",
				"resources <srv-id>  list one MCP server's resources",
				"prompts <srv-id>    list one MCP server's prompt templates",
				"reconnect <srv-id>  force-reconnect an MCP server",
				"resource-read <srv-id> <uri>  dump MCP resource bytes to stdout",
			},
			Run: func(r []string) int { return runMcp(r) },
		},
		{
			Name: "tool", Aliases: []string{"tools"}, Group: groupAll, Argspec: "show <id>",
			Summary: "print one tool's metadata + input schema",
			Run:     func(r []string) int { return runTool(r) },
		},
		{
			Name: "watch", Group: groupAll, Argspec: "<sid>",
			Summary: "tail status changes (TSV default; --format json for NDJSON)",
			Run:     func(r []string) int { return runWatch(r) },
		},
		{
			Name: "capabilities", Aliases: []string{"caps"}, Group: groupAll,
			Summary: "backend contract version + capability matrix",
			Run:     func(r []string) int { return runCapabilities(r) },
		},
		{
			Name: "tell", Group: groupAll, Argspec: "<name> <msg>",
			Summary: "find-or-create session by title; send + print reply",
			FlagHelp: []string{
				"(re-run with same name to continue the conversation)",
				"--async returns immediately with sid<TAB>msg_id",
			},
			Run: func(r []string) int { return runTell(r) },
		},
		{
			Name: "attach", Group: groupAll, Argspec: "[<name|sid>]",
			Summary: "launch the TUI pre-selected on a session;",
			FlagHelp: []string{
				"no arg = most-recent Ctrl+Z-detached on this backend",
				"--print-only: resolve + print sid, no TUI (for scripting)",
			},
			Run: func(r []string) int { runAttach(r); return 0 }, HandsOff: true,
		},
		{
			Name: "resume", Group: groupAll,
			Summary: "alias for gact attach (no args) — resume most-recent detach",
			Run:     func(r []string) int { return runResume(r) }, HandsOff: true,
		},
		{
			Name: "session", Group: groupAll, Argspec: "<verb>",
			Summary: "backend-side session lifecycle alias:",
			FlagHelp: []string{
				"create | list | show | connect | rename | stop | rm",
				"(parallels \"gact agent *\"; wraps new/list/info/attach/rename/cancel/delete)",
			},
			Run: func(r []string) int { return runSession(r) },
		},
		{
			Name: "voice", Group: groupAll, Argspec: "<sid> <audio>",
			Summary: "POST audio bytes to /voice/transcribe; print text",
			Run:     func(r []string) int { return runVoice(r) },
		},
		{
			Name: "bench", Group: groupAll, Argspec: "[-n N]",
			Summary: "run N turns; report p50/p90/p99 latency",
			Run:     func(r []string) int { return runBench(r) },
		},
		{
			Name: "conformance", Group: groupAll,
			Summary: "run contract/conformance suite against backend",
			Run:     func(r []string) int { return runConformance(r) },
		},
		{
			Name: "dashboard", Aliases: []string{"dash"}, Group: groupAll,
			Summary: "one-shot table of every session; --status idle|running|waiting|error to filter",
			FlagHelp: []string{
				"--sort newest|oldest|status|tokens|backend (default: newest)",
				"--detached-only restricts rows to the local detached registry",
			},
			Run: func(r []string) int { return runDashboard(r) },
		},
		{
			Name: "detached", Group: groupAll,
			Summary: "list sessions you've Ctrl+Z-detached from",
			FlagHelp: []string{
				"--rm <sid[,sid,...]> drops one or many; --probe checks each is still on the backend",
				"--prune-dead probes + removes every dead entry in one shot",
			},
			Run: func(r []string) int { return runDetached(r) },
		},
		{
			Name: "grep", Group: groupAll, Argspec: "<query>",
			Summary:  "search across all sessions; --limit N to truncate (0 = unlimited)",
			FlagHelp: []string{"--role user,assistant,tool,system narrows hits by role"},
			Run:      func(r []string) int { return runGrep(r) },
		},
		{
			Name: "follow", Group: groupAll, Argspec: "<sid>",
			Summary: "tail -f the conversation log; --format text|json (NDJSON)",
			FlagHelp: []string{
				"--role user,assistant,tool,system filters (same shape as gact log)",
				"--grep REGEX drops messages whose text doesn't match (case-insensitive)",
				"--since DUR trims the initial snapshot (streamed messages always emit)",
			},
			Run: func(r []string) int { return runFollow(r) },
		},
		{
			Name: "replay", Group: groupAll, Argspec: "<file|-> [--attach]",
			Summary: "import a session export; --attach launches TUI on it",
			Run:     func(r []string) int { runReplay(r); return 0 }, HandsOff: true,
		},
		{
			Name: "env", Group: groupAll, Argspec: "[--format tsv|json]",
			Summary: "print resolved config + GACT_* env vars",
			Run:     func(r []string) int { return runEnv(r) },
		},
		{
			Name: "theme", Group: groupAll, Argspec: "<verb>",
			Summary: "manage theme",
			FlagHelp: []string{
				"show [--name N]     print active theme palette as TSV (key\\thex)",
				"list                list available palettes; '*' marks active",
				"set <name>          persist theme to config.json (env still wins)",
			},
			Run: func(r []string) int { return runTheme(r) },
		},
		{
			Name: "hooks", Aliases: []string{"hook"}, Group: groupAll, Argspec: "<verb>",
			Summary: "manage §6.17 event hooks (list|add|rm)",
			FlagHelp: []string{
				"add: --event STR --command PATH or --url URL",
				"     [--session SID] [--workspace WS_ID]",
			},
			Run: func(r []string) int { return runHooks(r) },
		},
		{
			Name: "tasks", Aliases: []string{"task"}, Group: groupAll, Argspec: "<verb>",
			Summary: "manage §6.18 session tasks (list|add|set|rm)",
			FlagHelp: []string{
				"add: <sid> <title> [--status pending|…]",
				"set: <task-id> [--title T] [--status S]",
			},
			Run: func(r []string) int { return runTasks(r) },
		},
		{
			Name: "plugins", Aliases: []string{"plugin"}, Group: groupAll, Argspec: "<verb>",
			Summary:  "list/inspect plugins (list|dir)",
			FlagHelp: []string{"under ~/.config/gact/plugins/<name>/plugin.json"},
			Run:      func(r []string) int { return runPlugins(r) },
		},

		// ── groupHidden: dispatchable but never listed ─────────────────────────
		{
			Name: "--help", Aliases: []string{"-h"}, Group: groupHidden,
			Run: void(printUsage), HandsOff: true,
		},
	}
}

// lookupCommand returns the spec whose Name or one of whose Aliases equals name,
// or nil when nothing matches.
func lookupCommand(name string) *commandSpec {
	for i := range commandTable {
		c := &commandTable[i]
		if c.Name == name {
			return c
		}
		for _, alias := range c.Aliases {
			if alias == name {
				return c
			}
		}
	}
	return nil
}

// runResume implements `gact resume`: it takes no positional args and hands off
// to the most-recent-detach attach path. Extra args are a usage error.
func runResume(rest []string) int {
	if len(rest) > 0 {
		fmt.Fprintln(os.Stderr, "usage: gact resume  (no args — use `gact attach <sid>` for a specific session)")
		os.Exit(2)
	}
	runAttach(nil)
	return 0
}

// ── Usage rendering ───────────────────────────────────────────────────────

// summaryCol is the column (0-indexed) where summaries and continuation lines
// begin in the command listing.
const summaryCol = 29

// renderUsage builds the full `gact --help` / usage text from commandTable.
func renderUsage() string {
	var b strings.Builder
	b.WriteString("gact — GACT TUI client\n\n")
	b.WriteString("Usage:\n")
	writeUsageLine(&b, "gact", "run the interactive TUI against the configured backend")
	writeGroup(&b, groupTop)
	b.WriteString("\nCommon:\n")
	writeGroup(&b, groupCommon)
	b.WriteString("\nAll Commands:\n")
	writeGroup(&b, groupAll)
	b.WriteString(usageFlagsFooter)
	return b.String()
}

// writeGroup renders every command in group g, in table order.
func writeGroup(b *strings.Builder, g commandGroup) {
	for i := range commandTable {
		c := &commandTable[i]
		if c.Group != g {
			continue
		}
		head := "gact " + c.Name
		if c.Argspec != "" {
			head += " " + c.Argspec
		}
		writeUsageLine(b, head, c.Summary)
		for _, line := range c.FlagHelp {
			b.WriteString(strings.Repeat(" ", summaryCol))
			b.WriteString(line)
			b.WriteByte('\n')
		}
	}
}

// writeUsageLine emits one "  <head>   <summary>" row, padding head out to the
// summary column (or a single space when head overflows the column).
func writeUsageLine(b *strings.Builder, head, summary string) {
	prefix := "  " + head
	b.WriteString(prefix)
	if len(prefix) < summaryCol {
		b.WriteString(strings.Repeat(" ", summaryCol-len(prefix)))
	} else {
		b.WriteByte(' ')
	}
	b.WriteString(summary)
	b.WriteByte('\n')
}

const usageFlagsFooter = `
Common flags (all subcommands):
  --backend URL    GACT backend URL  (env: GACT_BACKEND)
  --theme STR      dark | light      (env: GACT_THEME)

TUI-only flags:
  --workspace STR  startup workspace id, exact name, or root path
                   (env: GACT_WORKSPACE; config: workspace).
  --voice-cmd STR  shell command that records audio to stdout, run on
                   Ctrl+Y. See scripts/voice-record.sh for an example.
                   (env: GACT_VOICE_CMD, config: voice_command)
`
