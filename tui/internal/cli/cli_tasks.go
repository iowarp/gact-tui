package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
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
	var (
		format       *string
		statusFilter *string
	)
	cc, rest, code := newCmdCtx("tasks list", args, withFlags(func(fs *flag.FlagSet) {
		format = fs.String("format", "tsv", "tsv | json")
		statusFilter = fs.String("status", "", "comma-separated status filter: pending|running|completed|failed")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
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
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tasks, err := c.ListSessionTasks(ctx, rest[0])
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
	var status *string
	cc, rest, code := newCmdCtx("tasks add", args, withFlags(func(fs *flag.FlagSet) {
		status = fs.String("status", "pending", "initial status: pending|running|completed|failed")
	}))
	if cc == nil {
		return code
	}
	if len(rest) < 2 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks add <session-id> <title> [--status ...]")
		return 2
	}
	sid := rest[0]
	title := strings.Join(rest[1:], " ")
	c := cc.client
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
	var (
		title  *string
		status *string
	)
	cc, rest, code := newCmdCtx("tasks set", args, withFlags(func(fs *flag.FlagSet) {
		title = fs.String("title", "", "new title (empty = unchanged)")
		status = fs.String("status", "", "new status (empty = unchanged)")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks set <task-id> [--title T] [--status S]")
		return 2
	}
	if *title == "" && *status == "" {
		fmt.Fprintln(os.Stderr, "gact tasks set: at least one of --title or --status required")
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.PatchTask(ctx, rest[0], gact.SessionTask{
		Title: *title, Status: *status,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks set: %v\n", err)
		return 1
	}
	return 0
}

func runTasksRm(args []string) int {
	cc, rest, code := newCmdCtx("tasks rm", args)
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact tasks rm <task-id>")
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.DeleteTask(ctx, rest[0]); err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks rm: %v\n", err)
		return 1
	}
	return 0
}
