package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

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
	finalBackend := resolveCLIBackend(*backend)
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
	finalBackend := resolveCLIBackend(*backend)
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
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.PutPolicies(ctx, []gact.Policy{}); err != nil {
		fmt.Fprintf(os.Stderr, "gact perms rules clear: %v\n", err)
		return 1
	}
	return 0
}
