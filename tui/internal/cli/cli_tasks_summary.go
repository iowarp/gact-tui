package cli

import (
	"context"
	"flag"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runTasksSummary aggregates task counts across every session in the
// workspace. It prints per-session TSV rows and a TOTAL footer.
func runTasksSummary(args []string) int {
	var wsID *string
	cc, _, code := newCmdCtx("tasks summary", args, withFlags(func(fs *flag.FlagSet) {
		wsID = fs.String("workspace", "", "limit to one workspace; empty = all")
	}))
	if cc == nil {
		return code
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: *wsID})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tasks summary: list sessions: %v\n", err)
		return 1
	}

	type row struct {
		sid     string
		title   string
		pending int
		running int
		done    int
		failed  int
	}
	rows := make([]row, len(sessions))
	sem := make(chan struct{}, 8)
	var wg sync.WaitGroup
	for i, s := range sessions {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, s gact.Session) {
			defer wg.Done()
			defer func() { <-sem }()
			tctx, tcancel := context.WithTimeout(context.Background(), 5*time.Second)
			tasks, err := c.ListSessionTasks(tctx, s.ID)
			tcancel()
			if err != nil {
				return
			}
			r := row{sid: s.ID, title: s.Title}
			for _, t := range tasks {
				switch t.Status {
				case "pending":
					r.pending++
				case "running":
					r.running++
				case "completed":
					r.done++
				case "failed":
					r.failed++
				}
			}
			rows[i] = r
		}(i, s)
	}
	wg.Wait()

	fmt.Println("SID\tTITLE\tPENDING\tRUNNING\tCOMPLETED\tFAILED")
	var total row
	printed := 0
	for _, r := range rows {
		if r.sid == "" {
			continue
		}
		if r.pending+r.running+r.done+r.failed == 0 {
			continue
		}
		fmt.Printf("%s\t%s\t%d\t%d\t%d\t%d\n",
			r.sid, r.title, r.pending, r.running, r.done, r.failed)
		total.pending += r.pending
		total.running += r.running
		total.done += r.done
		total.failed += r.failed
		printed++
	}
	fmt.Printf("TOTAL\t(%d sessions)\t%d\t%d\t%d\t%d\n",
		printed, total.pending, total.running, total.done, total.failed)
	return 0
}
