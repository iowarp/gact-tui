package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"github.com/JaimeCernuda/gact-tui/tui/internal/plugins"
)

// runPlugins dispatches `gact plugins <verb>` for the plugin loader.
// Sub-verbs:
//
//	gact plugins list [--format text|json] [--dir DIR]
//	gact plugins dir   (print the resolved plugin root)
func runPlugins(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact plugins list|dir [--dir DIR]")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "list", "ls":
		return runPluginsList(rest)
	case "dir", "path":
		return runPluginsDir(rest)
	}
	fmt.Fprintf(os.Stderr, "gact plugins: unknown verb %q (want list|dir)\n", verb)
	return 2
}

func runPluginsDir(args []string) int {
	fs := flag.NewFlagSet("plugins dir", flag.ContinueOnError)
	dir := fs.String("dir", "", "override plugin root (default: $XDG_CONFIG_HOME/gact/plugins)")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{"--dir": true, "-dir": true})); err != nil {
		return 2
	}
	resolved := *dir
	if resolved == "" {
		d, err := plugins.DefaultDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact plugins dir: %v\n", err)
			return 1
		}
		resolved = d
	}
	fmt.Println(resolved)
	return 0
}

func runPluginsList(args []string) int {
	fs := flag.NewFlagSet("plugins list", flag.ContinueOnError)
	dir := fs.String("dir", "", "override plugin root")
	format := fs.String("format", "text", "text | json")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{
		"--dir": true, "-dir": true,
		"--format": true, "-format": true,
	})); err != nil {
		return 2
	}
	resolved := *dir
	if resolved == "" {
		d, err := plugins.DefaultDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact plugins list: %v\n", err)
			return 1
		}
		resolved = d
	}
	loaded, errs, err := plugins.LoadVerbose(resolved)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact plugins list: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(loaded)
		for _, e := range errs {
			fmt.Fprintln(os.Stderr, "warn:", e)
		}
		return 0
	}
	if *format != "text" {
		fmt.Fprintf(os.Stderr, "gact plugins list: unknown format %q\n", *format)
		return 2
	}
	if len(loaded) == 0 {
		fmt.Fprintf(os.Stderr, "no plugins under %s\n", resolved)
		return 0
	}
	for _, p := range loaded {
		header := p.Name
		if p.Version != "" {
			header += " " + p.Version
		}
		if p.Description != "" {
			header += " — " + p.Description
		}
		fmt.Println(header)
		for _, c := range p.Commands {
			line := "  " + c.ID
			if c.Title != "" {
				line += "  " + c.Title
			}
			if c.Description != "" {
				line += " — " + c.Description
			}
			fmt.Println(line)
		}
	}
	for _, e := range errs {
		fmt.Fprintln(os.Stderr, "warn:", e)
	}
	return 0
}
