package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runTasks dispatches `gact tasks <verb>` for session tasks.
func runTasks(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks list|add|set|rm|summary ...")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "list", "ls":
		return runTasksList(rest)
	case "add":
		return runTasksAdd(rest)
	case "set", "patch":
		return runTasksSet(rest)
	case "rm", "delete", "remove":
		return runTasksRm(rest)
	case "summary":
		return runTasksSummary(rest)
	}
	fmt.Fprintf(os.Stderr, "gact tasks: unknown verb %q (want list|add|set|rm|summary)\n", verb)
	return 2
}

func runTasksList(args []string) int {
	fs := flag.NewFlagSet("tasks list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	format := fs.String("format", "tsv", "tsv | json")
	statusFilter := fs.String("status", "", "comma-separated status filter: pending|running|completed|failed")
	known := map[string]bool{
		"--backend": true,
		"-backend":  true,
		"--format":  true,
		"-format":   true,
		"--status":  true,
		"-status":   true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks list <session-id> [--status pending,running,...] [--format tsv|json]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact tasks list: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	var keep map[string]bool
	if *statusFilter != "" {
		keep = map[string]bool{}
		for _, s := range strings.Split(*statusFilter, ",") {
			s = strings.TrimSpace(s)
			switch s {
			case "":
			case "pending", "running", "completed", "failed":
				keep[s] = true
			default:
				fmt.Fprintf(os.Stderr, "gact tasks list: unknown --status value %q (want pending|running|completed|failed)\n", s)
				return 2
			}
		}
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tasks, err := c.ListSessionTasks(ctx, fs.Arg(0))
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks list: %v\n", err)
		return 1
	}
	if keep != nil {
		filtered := tasks[:0]
		for _, t := range tasks {
			if keep[t.Status] {
				filtered = append(filtered, t)
			}
		}
		tasks = filtered
	}
	if *format == "json" {
		if tasks == nil {
			tasks = []gact.SessionTask{}
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(tasks)
		return 0
	}
	for _, t := range tasks {
		fmt.Printf("%s\t%s\t%s\n", t.ID, t.Status, t.Title)
	}
	return 0
}

func runTasksAdd(args []string) int {
	fs := flag.NewFlagSet("tasks add", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	status := fs.String("status", "pending", "initial status: pending|running|completed|failed")
	known := map[string]bool{
		"--backend": true,
		"-backend":  true,
		"--status":  true,
		"-status":   true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() < 2 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks add <session-id> <title> [--status ...]")
		return 2
	}
	sid := fs.Arg(0)
	title := strings.Join(fs.Args()[1:], " ")
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	created, err := c.CreateSessionTask(ctx, sid, gact.SessionTask{
		Title: title, Status: *status,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks add: %v\n", err)
		return 1
	}
	fmt.Println(created.ID)
	return 0
}

func runTasksSet(args []string) int {
	fs := flag.NewFlagSet("tasks set", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	title := fs.String("title", "", "new title (empty = unchanged)")
	status := fs.String("status", "", "new status (empty = unchanged)")
	known := map[string]bool{
		"--backend": true,
		"-backend":  true,
		"--title":   true,
		"-title":    true,
		"--status":  true,
		"-status":   true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks set <task-id> [--title T] [--status S]")
		return 2
	}
	if *title == "" && *status == "" {
		fmt.Fprintln(os.Stderr, "gact tasks set: at least one of --title or --status required")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.PatchTask(ctx, fs.Arg(0), gact.SessionTask{
		Title: *title, Status: *status,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks set: %v\n", err)
		return 1
	}
	return 0
}

func runTasksRm(args []string) int {
	fs := flag.NewFlagSet("tasks rm", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks rm <task-id>")
		return 2
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.DeleteTask(ctx, fs.Arg(0)); err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks rm: %v\n", err)
		return 1
	}
	return 0
}
