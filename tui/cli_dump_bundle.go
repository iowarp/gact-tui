package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runDumpBundle writes a complete bug-report bundle to a directory:
//
//	diag.txt            `gact diag` capture
//	metrics.json        /v1/metrics raw response
//	sessions/<sid>.json every session export, one file each
//	version.txt         binary/contract/runtime/VCS info
//
// Single command for "I'm filing a bug, attach this directory". Beats
// chaining diag + export --all + version + manual paste.
func runDumpBundle(args []string) int {
	fs := flag.NewFlagSet("dump-bundle", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	out := fs.String("o", "gact-bundle", "output directory")
	since := fs.Duration("since", 0, "include only sessions with UpdatedAt within the last DUR (EEEE1)")
	known := map[string]bool{
		"--backend": true, "-backend": true, "-o": true,
		"--since": true, "-since": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if err := os.MkdirAll(*out, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "gact dump-bundle: mkdir %s: %v\n", *out, err)
		return 1
	}

	// version.txt - captured directly from runVersion's logic so the
	// bundle is self-contained without shelling out.
	{
		var b strings.Builder
		writeVersionReport(&b, true)
		if err := os.WriteFile(filepath.Join(*out, "version.txt"), []byte(b.String()), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "gact dump-bundle: write version.txt: %v\n", err)
			return 1
		}
	}

	// diag.txt - re-route runDiag's stdout into a file. Easiest is to
	// inline the body so we don't have to swap os.Stdout temporarily.
	{
		f, err := os.Create(filepath.Join(*out, "diag.txt"))
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact dump-bundle: create diag.txt: %v\n", err)
			return 1
		}
		writeDiagTo(f)
		f.Close()
	}

	// metrics.json - best-effort; if backend is offline we still want
	// the rest of the bundle.
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	{
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		m, err := c.Metrics(ctx)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact dump-bundle: metrics: %v (continuing)\n", err)
		} else {
			f, err := os.Create(filepath.Join(*out, "metrics.json"))
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact dump-bundle: create metrics.json: %v\n", err)
				return 1
			}
			enc := json.NewEncoder(f)
			enc.SetIndent("", "  ")
			_ = enc.Encode(m)
			f.Close()
		}
	}

	// detached.json - local Ctrl+Z-detach registry. Best-effort:
	// missing/unreadable file just doesn't add the entry. Useful for
	// bug reports about resume / re-attach UX where the registry's
	// state is the load-bearing context. (TTTTTTTT1)
	if regPath, err := config.DetachedPath(); err == nil {
		if reg, err := config.LoadDetached(regPath); err == nil {
			f, ferr := os.Create(filepath.Join(*out, "detached.json"))
			if ferr == nil {
				enc := json.NewEncoder(f)
				enc.SetIndent("", "  ")
				_ = enc.Encode(reg)
				f.Close()
			}
		}
	}

	// sessions/<sid>.json - reuse runExportAll's loop semantics.
	sessDir := filepath.Join(*out, "sessions")
	if err := os.MkdirAll(sessDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "gact dump-bundle: mkdir sessions/: %v\n", err)
		return 1
	}
	listCtx, listCancel := context.WithTimeout(context.Background(), 30*time.Second)
	sessions, err := c.ListSessions(listCtx, client.SessionFilter{})
	listCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact dump-bundle: list sessions: %v (continuing)\n", err)
	}
	// EEEE1: --since filter - drop sessions whose UpdatedAt is older
	// than the cutoff. Sessions with zero UpdatedAt always survive
	// (defensive against backends that don't stamp).
	if *since > 0 {
		cutoff := time.Now().UTC().Add(-*since)
		filtered := sessions[:0]
		for _, s := range sessions {
			if s.UpdatedAt.IsZero() || !s.UpdatedAt.Before(cutoff) {
				filtered = append(filtered, s)
			}
		}
		fmt.Fprintf(os.Stderr, "gact dump-bundle: --since %s kept %d/%d sessions\n",
			*since, len(filtered), len(sessions))
		sessions = filtered
	}
	// RRRR1: same 8-wide bounded fanout as runExportAll (QQQQ1) so a
	// big bundle doesn't pay sessions x RTT.
	const dumpWorkers = 8
	type dumpResult struct {
		sid string
		err error
	}
	dumpSem := make(chan struct{}, dumpWorkers)
	dumpResults := make(chan dumpResult, len(sessions))
	var dumpWG sync.WaitGroup
	for _, s := range sessions {
		s := s
		dumpWG.Add(1)
		dumpSem <- struct{}{}
		go func() {
			defer dumpWG.Done()
			defer func() { <-dumpSem }()
			ectx, ecancel := context.WithTimeout(context.Background(), 30*time.Second)
			blob, err := c.ExportSession(ectx, s.ID)
			ecancel()
			if err != nil {
				dumpResults <- dumpResult{sid: s.ID, err: err}
				return
			}
			f, ferr := os.Create(filepath.Join(sessDir, s.ID+".json"))
			if ferr != nil {
				dumpResults <- dumpResult{sid: s.ID, err: fmt.Errorf("create: %w", ferr)}
				return
			}
			enc := json.NewEncoder(f)
			enc.SetIndent("", "  ")
			_ = enc.Encode(blob)
			f.Close()
			dumpResults <- dumpResult{sid: s.ID}
		}()
	}
	dumpWG.Wait()
	close(dumpResults)
	ok := 0
	for r := range dumpResults {
		if r.err != nil {
			fmt.Fprintf(os.Stderr, "  %s: %v\n", r.sid, r.err)
			continue
		}
		ok++
	}

	fmt.Fprintf(os.Stderr, "gact dump-bundle: wrote %d sessions + version + diag + metrics + detached → %s\n", ok, *out)
	return 0
}
