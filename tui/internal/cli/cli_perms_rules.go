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

	"github.com/JaimeCernuda/gact-tui/contract/gact"
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
	var format *string
	cc, _, code := newCmdCtx("perms rules list", args, withFlags(func(fs *flag.FlagSet) {
		// Default kept as json for back-compat with existing scripting
		// callers (this verb predates --format). New TSV view added per
		// KKKK1 — opt in with --format tsv for human-scannable output.
		format = fs.String("format", "json", "json | tsv")
	}))
	if cc == nil {
		return code
	}
	if *format != "json" && *format != "tsv" {
		fmt.Fprintf(os.Stderr, "gact perms rules list: unknown format %q (want json|tsv)\n", *format)
		return 2
	}
	c := cc.client
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
	cc, rest, code := newCmdCtx("perms rules set", args)
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact perms rules set <json-file|->")
		return 2
	}
	src := rest[0]
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
	c := cc.client
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
	cc, _, code := newCmdCtx("perms rules clear", args)
	if cc == nil {
		return code
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.PutPolicies(ctx, []gact.Policy{}); err != nil {
		fmt.Fprintf(os.Stderr, "gact perms rules clear: %v\n", err)
		return 1
	}
	return 0
}
