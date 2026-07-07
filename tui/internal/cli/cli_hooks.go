package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runHooks dispatches the hooks CLI:
//
//	gact hooks list [--event TYPE] [--scope global|session|workspace] [--format tsv|json]
//	gact hooks add --event <ev> --command|--url <target>
//	gact hooks rm <hook-id>
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
	eventFilter := fs.String("event", "", "filter to one event type (exact); empty = all")
	scopeFilter := fs.String("scope", "", "filter by scope kind: global|session|workspace; empty = all")
	known := map[string]bool{
		"--backend": true,
		"-backend":  true,
		"--format":  true,
		"-format":   true,
		"--event":   true,
		"-event":    true,
		"--scope":   true,
		"-scope":    true,
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
	finalBackend := resolveCLIBackend(*backend)
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
		"--backend":   true,
		"-backend":    true,
		"--event":     true,
		"-event":      true,
		"--command":   true,
		"-command":    true,
		"--url":       true,
		"-url":        true,
		"--session":   true,
		"-session":    true,
		"--workspace": true,
		"-workspace":  true,
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
	finalBackend := resolveCLIBackend(*backend)
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
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.DeleteHook(ctx, fs.Arg(0)); err != nil {
		fmt.Fprintf(os.Stderr, "gact hooks rm: %v\n", err)
		return 1
	}
	return 0
}
