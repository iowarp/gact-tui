package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

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
