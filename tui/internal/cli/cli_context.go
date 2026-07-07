package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runContext dispatches the `gact context <verb>` subcommand family
// for managing per-session context files (the things sidebar K14
// adds via `o`). Core verbs:
//
//	gact context list <sid>                   — print path + mode per file
//	gact context show <sid> <path>            — preview content from the backend
//	gact context upload <sid> <path>          — POST local bytes as attachment
//	gact context add  <sid> <path> [--mode]   — POST add (default mode=read)
//	gact context rm   <sid> <path>            — DELETE remove
//
// Verb-then-flags structure mirrors `git remote` / `kubectl`. Returns
// 2 on usage errors, 1 on transport / API errors.
func runContext(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact context list|show|upload|add|rm <session_id> [path] [--mode read|edit|pin]")
		return 2
	}
	verb := args[0]
	rest := args[1:]

	switch verb {
	case "list":
		return runContextList(rest)
	case "show", "cat", "read":
		return runContextShow(rest)
	case "upload", "attach":
		return runContextUpload(rest)
	case "add":
		return runContextAdd(rest)
	case "rm", "remove", "delete":
		return runContextRm(rest)
	default:
		fmt.Fprintf(os.Stderr, "gact context: unknown verb %q (want list|show|upload|add|rm)\n", verb)
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
	finalBackend := resolveCLIBackend(*backend)
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

func firstNonEmptyCLI(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
