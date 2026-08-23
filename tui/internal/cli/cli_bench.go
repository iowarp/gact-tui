package cli

import (
	"context"
	"flag"
	"fmt"
	"os"
	"sort"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runBench implements `gact bench [-n N] [--message TEXT]` (QQQ1) —
// a latency probe useful for measuring backend adapter performance
// against the emulator baseline. Creates a fresh session, sends N
// turns serially (each timed send→idle), reports p50/p90/p99/avg/
// total, deletes the session.
func runBench(args []string) int {
	var (
		n          *int
		concurrent *int
		message    *string
		wsID       *string
	)
	cc, _, code := newCmdCtx("bench", args,
		withTimeout(5*time.Minute, "per-turn timeout"),
		withFlags(func(fs *flag.FlagSet) {
			n = fs.Int("n", 5, "number of turns per goroutine")
			concurrent = fs.Int("concurrent", 1, "number of parallel goroutines (XXX1)")
			message = fs.String("message", "say hello in one word", "message body for each turn")
			wsID = fs.String("workspace", "", "workspace id (default: first listed)")
		}),
	)
	if cc == nil {
		return code
	}
	if *n < 1 {
		fmt.Fprintln(os.Stderr, "gact bench: -n must be >= 1")
		return 2
	}
	if *concurrent < 1 {
		fmt.Fprintln(os.Stderr, "gact bench: --concurrent must be >= 1")
		return 2
	}

	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	if *wsID == "" {
		wss, err := c.ListWorkspaces(ctx)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact bench: list workspaces: %v\n", err)
			return 1
		}
		if len(wss) == 0 {
			fmt.Fprintln(os.Stderr, "gact bench: no workspaces; pass --workspace WS_ID")
			return 1
		}
		*wsID = wss[0].ID
	} else {
		cancel()
	}

	// XXX1: spawn `concurrent` goroutines, each running its own
	// session × N serial turns. Aggregate durations across all
	// goroutines so percentiles cover the whole load.
	type result struct {
		durations []time.Duration
		err       error
	}
	results := make([]result, *concurrent)
	var wg sync.WaitGroup
	totalStart := time.Now()
	for w := 0; w < *concurrent; w++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = runBenchWorker(c, *wsID, *n, *message, cc.timeout, idx)
		}(w)
	}
	wg.Wait()
	totalElapsed := time.Since(totalStart)

	var durations []time.Duration
	for i, r := range results {
		if r.err != nil {
			fmt.Fprintf(os.Stderr, "gact bench: worker %d: %v\n", i, r.err)
			return 1
		}
		durations = append(durations, r.durations...)
	}

	sorted := append([]time.Duration(nil), durations...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	pct := func(p float64) time.Duration {
		if len(sorted) == 0 {
			return 0
		}
		idx := int(float64(len(sorted)-1) * p)
		if idx < 0 {
			idx = 0
		}
		return sorted[idx]
	}
	var sum time.Duration
	for _, d := range durations {
		sum += d
	}
	avg := sum / time.Duration(len(durations))

	fmt.Printf("gact bench  backend=%s  n=%d  concurrent=%d  message=%q\n",
		cc.backend, *n, *concurrent, *message)
	fmt.Printf("  total:    %s\n", totalElapsed.Round(time.Millisecond))
	fmt.Printf("  samples:  %d\n", len(durations))
	fmt.Printf("  avg:      %s\n", avg.Round(time.Millisecond))
	fmt.Printf("  p50:      %s\n", pct(0.50).Round(time.Millisecond))
	fmt.Printf("  p90:      %s\n", pct(0.90).Round(time.Millisecond))
	fmt.Printf("  p99:      %s\n", pct(0.99).Round(time.Millisecond))
	fmt.Printf("  min:      %s\n", sorted[0].Round(time.Millisecond))
	fmt.Printf("  max:      %s\n", sorted[len(sorted)-1].Round(time.Millisecond))
	if *concurrent > 1 {
		// Throughput: total turns ÷ wall clock.
		thrpt := float64(len(durations)) / totalElapsed.Seconds()
		fmt.Printf("  thrpt:    %.2f turns/s\n", thrpt)
	}
	return 0
}

// runBenchWorker is one parallel bench goroutine: creates a session,
// runs N turns serially, deletes when done, returns durations + any
// error. Each worker owns its session, so fan-out doesn't contend on
// session-level locks in the backend.
func runBenchWorker(c *client.Client, wsID string, n int, message string, timeout time.Duration, idx int) (out struct {
	durations []time.Duration
	err       error
}) {
	createCtx, createCancel := context.WithTimeout(context.Background(), 10*time.Second)
	sess, err := c.CreateSession(createCtx, client.CreateSessionRequest{
		WorkspaceID: wsID,
		Title:       fmt.Sprintf("bench-%d %s", idx, time.Now().UTC().Format("15:04:05")),
		Model:       &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
		Agent:       &gact.AgentRef{ID: "default"},
	})
	createCancel()
	if err != nil {
		out.err = fmt.Errorf("create session: %w", err)
		return
	}
	defer func() {
		delCtx, delCancel := context.WithTimeout(context.Background(), 10*time.Second)
		_ = c.DeleteSession(delCtx, sess.ID)
		delCancel()
	}()
	out.durations = make([]time.Duration, 0, n)
	for i := 0; i < n; i++ {
		turnStart := time.Now()
		postCtx, postCancel := context.WithTimeout(context.Background(), 10*time.Second)
		if _, err := c.PostMessage(postCtx, sess.ID, client.PostMessageRequest{
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: message}},
		}); err != nil {
			postCancel()
			out.err = fmt.Errorf("turn %d send: %w", i+1, err)
			return
		}
		postCancel()
		deadline := time.Now().Add(timeout)
		for {
			pollCtx, pollCancel := context.WithTimeout(context.Background(), 5*time.Second)
			s, err := c.GetSession(pollCtx, sess.ID)
			pollCancel()
			if err != nil {
				out.err = fmt.Errorf("turn %d poll: %w", i+1, err)
				return
			}
			if s.Status == gact.StatusIdle {
				break
			}
			if time.Now().After(deadline) {
				out.err = fmt.Errorf("turn %d timeout (status=%s)", i+1, s.Status)
				return
			}
			time.Sleep(50 * time.Millisecond)
		}
		out.durations = append(out.durations, time.Since(turnStart))
	}
	return
}
