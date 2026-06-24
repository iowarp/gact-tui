package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

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
