package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runDetached implements `gact detached [--rm <sid>] [--probe]`. Reads
// the local detached-sessions registry (Ctrl+Z exits write to it) and
// prints one row per detached session so the user can find what they
// walked away from without having to remember opaque sess_xxxx ids.
func runDetached(args []string) int {
	fs := flag.NewFlagSet("detached", flag.ContinueOnError)
	rm := fs.String("rm", "", "remove entries for these session ids (comma-separated) from the registry")
	probe := fs.Bool("probe", false, "probe each backend, mark sessions that no longer exist")
	pruneDead := fs.Bool("prune-dead", false, "probe + remove every entry whose backend no longer has the session")
	format := fs.String("format", "pretty", "pretty | tsv | json")
	watch := fs.Bool("watch", false, "re-render every --interval")
	interval := fs.Duration("interval", 2*time.Second, "refresh cadence in --watch mode")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{
		"--rm": true, "-rm": true,
		"--probe": true, "-probe": true,
		"--prune-dead": true, "-prune-dead": true,
		"--format": true, "-format": true,
		"--watch": true, "-watch": true,
		"--interval": true, "-interval": true,
	})); err != nil {
		return 2
	}
	// --watch is a read-mode loop; it has no meaning
	// combined with write-mode flags. Reject fast so the user sees
	// the conflict instead of silently ignoring one of them.
	if *watch && (*rm != "" || *pruneDead) {
		fmt.Fprintln(os.Stderr, "gact detached: --watch cannot be combined with --rm or --prune-dead")
		return 2
	}
	// --prune-dead implies --probe (it has to probe to decide what to
	// remove). Set it implicitly so the rendered output also shows
	// the alive column for the survivors.
	if *pruneDead {
		*probe = true
	}
	switch *format {
	case "pretty", "tsv", "json":
	default:
		fmt.Fprintf(os.Stderr, "gact detached: unknown format %q (want pretty|tsv|json)\n", *format)
		return 2
	}
	path, err := config.DetachedPath()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact detached: %v\n", err)
		return 1
	}
	if *rm != "" {
		// `--rm` removes by sid across all backends — the user
		// thinks in sids, not (backend, sid) pairs. Accepts a
		// comma-separated list for batch cleanup.
		sids := strings.Split(*rm, ",")
		total := 0
		for _, sid := range sids {
			sid = strings.TrimSpace(sid)
			if sid == "" {
				continue
			}
			n, err := config.RemoveDetached(path, "", sid)
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact detached: %v\n", err)
				return 1
			}
			total += n
		}
		fmt.Fprintf(os.Stderr, "removed %d entr(y/ies) for %s\n", total, *rm)
		return 0
	}
	// renderOnce captures the load + probe + render path
	// so --watch can call it per tick. Returns a non-zero exit on
	// fatal errors (read path only); render-only errors are surfaced
	// to stderr but don't abort the watch loop.
	renderOnce := func() int {
		reg, err := config.LoadDetached(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact detached: %v\n", err)
			return 1
		}
		// liveness[i] tracks whether record i is still on its backend.
		// nil = unprobed; true/false otherwise.
		liveness := make([]*bool, len(reg.Records))
		if *probe {
			for i, r := range reg.Records {
				c := client.New(r.Backend)
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				_, err := c.GetSession(ctx, r.SessionID)
				cancel()
				alive := err == nil
				liveness[i] = &alive
			}
		}
		// --prune-dead removes every entry whose probe came
		// back negative. Done after the probe pass so the rendered table
		// (below) shows the survivors with their (alive=yes) column,
		// confirming what's left. The dead rows themselves are dropped
		// silently from the rendered output but counted in stderr.
		if *pruneDead {
			survivors := reg.Records[:0]
			survivorLive := liveness[:0]
			removed := 0
			for i, r := range reg.Records {
				if liveness[i] != nil && !*liveness[i] {
					removed++
					continue
				}
				survivors = append(survivors, r)
				survivorLive = append(survivorLive, liveness[i])
			}
			reg.Records = survivors
			liveness = survivorLive
			if removed > 0 {
				if err := config.SaveDetached(reg, path); err != nil {
					fmt.Fprintf(os.Stderr, "gact detached: prune-dead: write %s: %v\n", path, err)
					return 1
				}
			}
			fmt.Fprintf(os.Stderr, "pruned %d dead entr(y/ies); %d alive remain\n",
				removed, len(reg.Records))
		}
		switch *format {
		case "json":
			type row struct {
				config.DetachedRecord
				Alive *bool `json:"alive,omitempty"`
			}
			rows := make([]row, len(reg.Records))
			for i, r := range reg.Records {
				rows[i] = row{DetachedRecord: r, Alive: liveness[i]}
			}
			b, _ := json.MarshalIndent(rows, "", "  ")
			fmt.Println(string(b))
		case "tsv":
			fmt.Println("session_id\ttitle\tbackend\tworkspace\tdetached_at\talive")
			for i, r := range reg.Records {
				alive := ""
				if liveness[i] != nil {
					if *liveness[i] {
						alive = "yes"
					} else {
						alive = "no"
					}
				}
				fmt.Printf("%s\t%s\t%s\t%s\t%s\t%s\n",
					r.SessionID, r.Title, r.Backend, r.Workspace,
					r.DetachedAt.Format(time.RFC3339), alive)
			}
		default: // pretty
			if len(reg.Records) == 0 {
				fmt.Println("(no detached sessions — Ctrl+Z in the TUI records one here)")
				return 0
			}
			// Reorder so dead entries sink to the bottom when
			// --probe is set — the user's next reattach target is almost
			// always one of the live ones. Stable sort preserves the
			// newest-first ordering within each group.
			order := make([]int, len(reg.Records))
			for i := range order {
				order[i] = i
			}
			sort.SliceStable(order, func(i, j int) bool {
				ai, aj := liveness[order[i]], liveness[order[j]]
				// Both unprobed or same liveness -> preserve index order.
				if ai == nil && aj == nil {
					return order[i] < order[j]
				}
				// Alive-or-unknown ranks above known-dead.
				iDead := ai != nil && !*ai
				jDead := aj != nil && !*aj
				if iDead != jDead {
					return !iDead
				}
				return order[i] < order[j]
			})
			fmt.Printf("%-20s  %-30s  %-30s  %-12s  %s\n",
				"SESSION", "TITLE", "BACKEND", "DETACHED", "ALIVE")
			alive, dead, unknown := 0, 0, 0
			for _, idx := range order {
				r := reg.Records[idx]
				aliveText := "?"
				col := ansiDim
				if liveness[idx] != nil {
					if *liveness[idx] {
						aliveText, col = "yes", ansiGreen
						alive++
					} else {
						aliveText, col = "no", ansiRed
						dead++
					}
				} else {
					unknown++
				}
				when := humanizeAge(time.Since(r.DetachedAt))
				title := r.Title
				if title == "" {
					title = "(untitled)"
				}
				fmt.Printf("%-20s  %-30s  %-30s  %-12s  %s\n",
					truncMid(r.SessionID, 20), truncMid(title, 30),
					truncMid(r.Backend, 30), when, colorize(aliveText, col))
			}
			fmt.Println()
			// Footer summary — only show probe counts if at least one
			// row was probed (otherwise the zeros are noise).
			if alive+dead > 0 {
				fmt.Printf("%d alive · %d dead · %d unprobed\n", alive, dead, unknown)
			}
			fmt.Println("Reattach: gact attach <session>")
		}
		return 0
	}

	if !*watch {
		return renderOnce()
	}
	// Watch loop. ANSI clear-screen + cursor-home between
	// frames so each render replaces the previous in place. Mirrors
	// the dashboard --watch pattern. Ctrl+C exits via default
	// SIGINT handling since there's no tea program to intercept.
	tick := time.NewTicker(*interval)
	defer tick.Stop()
	for {
		fmt.Print("\033[2J\033[H")
		fmt.Printf("gact detached --watch  refresh=%s  (Ctrl+C to exit)\n\n", *interval)
		if code := renderOnce(); code != 0 {
			return code
		}
		<-tick.C
	}
}
