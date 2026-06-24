package main

import (
	"fmt"
	"os"
)

// runDiag writes a structured diagnostic report to stdout: binary
// version, contract version, Go runtime, resolved config path + its
// fields, resolved theme, and whether a custom theme file was found.
// Non-interactive; exits zero after printing. Useful for bug reports.
// runDiag prints the diag report to stdout. IIIIIIIII1: delegates
// to writeDiagTo(os.Stdout, verbose=true) so there's exactly one
// place that knows the report shape. `verbose=true` adds the
// "custom theme" + "config load error" rows that the dump-bundle
// variant historically omitted.
func runDiag() { writeDiagToVerbose(os.Stdout) }

func printUsage() {
	fmt.Println(`gact — GACT TUI client

Usage:
  gact                       run the interactive TUI against the configured backend
  gact deploy <kind> <name>  spawn an adapter detached; registers locally
                              alias: gact agent deploy <kind> <name>
                              --bin PATH override adapter binary; --port N; --cwd DIR
  gact connect <name>        launch TUI pointed at a deployed agent
                              alias: gact agent connect <name>
  gact agent list            show deployed agents (name, kind, port, pid, alive status)
  gact agent stop <name>     stop the adapter process
                              alias: gact stop <name>
  gact agent rm <name>       drop the entry (stops first if running)
                              alias: gact rm <name>
  gact man                   print the manual; --install wires man(1)/PowerShell

Common:
  gact new [--title T]       create a session; print id to stdout
  gact ask <sid> <q|->       send + wait + print assistant reply
  gact send <sid> <text|->   post a user message to a session
  gact run <sid> <text|->    send + wait in one command
  gact log <sid>             dump conversation messages (text by default; --format json for NDJSON)
                              --role user,assistant,tool,system filters to one or more roles
                              --grep REGEX drops messages whose text doesn't match (case-insensitive)
  gact list                  list recent sessions (tab-separated)
                              --detached-only, --sort newest|oldest|status|tokens|backend, --limit N

All Commands:
  gact list                  list recent sessions (tab-separated)
                              --detached-only, --sort newest|oldest|status|tokens|backend, --limit N
  gact export <session_id>   download a session blob (JSON) to stdout
  gact import <file|->       upload a previously-exported session blob
  gact version               print version + contract version
  gact diag                  print environment + config for bug reports
  gact emit-config           print sample config.json to stdout
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
  gact context show <sid> <p> preview context file content (--format text|json)
  gact context upload <sid> <p> upload a local file into session context
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
  gact man                   print the manual; --format text|roff; --install
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
  gact session <verb>        backend-side session lifecycle alias:
                              create | list | show | connect | rename | stop | rm
                              (parallels "gact agent *"; wraps new/list/info/attach/rename/cancel/delete)
  gact deploy <kind> <name>  spawn an adapter detached; registers locally
                              alias: gact agent deploy <kind> <name>
                              --bin PATH override adapter binary; --port N; --cwd DIR
  gact agent deploy <kind> <name>  same as gact deploy
  gact agent list            show deployed agents (name, kind, port, pid, alive status)
  gact agent stop <name>     stop the adapter process
  gact agent rm <name>       drop the entry (stops first if running)
  gact agent connect <name>  launch TUI pointed at a deployed agent
  gact connect <name>        alias for gact agent connect
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
  --workspace STR  startup workspace id, exact name, or root path
                   (env: GACT_WORKSPACE; config: workspace).
  --voice-cmd STR  shell command that records audio to stdout, run on
                   Ctrl+Y. See scripts/voice-record.sh for an example.
                   (env: GACT_VOICE_CMD, config: voice_command)`)
}
