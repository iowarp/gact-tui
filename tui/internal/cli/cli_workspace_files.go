package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// runRepoMap fetches the workspace repo map and renders it as a tree
// (default) or raw JSON. Tree mode uses tree(1)-style box-drawing
// glyphs and hangs symbol outlines under each file as `· name`.
//
//	gact repo-map ws_default            # tree view, with token cost
//	gact repo-map ws_default --format json
func runRepoMap(args []string) int {
	var format *string
	cc, rest, code := newCmdCtx("repo-map", args, withFlags(func(fs *flag.FlagSet) {
		format = fs.String("format", "tree", "tree | json")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact repo-map <workspace_id> [--format tree|json]")
		return 2
	}
	if *format != "tree" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact repo-map: unknown format %q (want tree|json)\n", *format)
		return 2
	}
	wsID := rest[0]
	c := cc.client
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
	var (
		format *string
		glob   *string
	)
	cc, rest, code := newCmdCtx("files list", args, withFlags(func(fs *flag.FlagSet) {
		format = fs.String("format", "tsv", "tsv | json")
		// ZZZZ1: --glob applies a Go path.Match pattern to entry.Path
		// (the relative-to-workspace-root path the backend already
		// returns). Empty = no filter (back-compat). We deliberately use
		// path.Match (forward-slash, no recursion across `/`) rather
		// than filepath.Match so behavior is portable across hosts.
		glob = fs.String("glob", "", "filter to entries whose path matches this Go path.Match pattern (e.g. '*.go', 'cmd/*')")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
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
	wsID := rest[0]
	c := cc.client
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
	cc, rest, code := newCmdCtx("files read", args)
	if cc == nil {
		return code
	}
	if len(rest) != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact files read <workspace_id> <path>")
		return 2
	}
	wsID := rest[0]
	path := rest[1]
	c := cc.client
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
