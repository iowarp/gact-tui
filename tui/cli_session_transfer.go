package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func runExport(args []string) int {
	fs := flag.NewFlagSet("export", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	out := fs.String("o", "-", "output file path; '-' for stdout")
	all := fs.Bool("all", false, "export every session; writes one JSON per session into --out dir")
	wsID := fs.String("workspace", "", "with --all, restrict to one workspace")
	knownFlags := map[string]bool{"-o": true, "--backend": true, "-backend": true, "--workspace": true, "-workspace": true}
	if err := fs.Parse(reorderFlagsFirst(args, knownFlags)); err != nil {
		return 2
	}

	// V1: bulk export path. Takes --out as a directory (created if
	// absent) and writes one <session_id>.json per session; tolerates
	// per-session fetch errors so one bad session doesn't abort the
	// whole snapshot. Prints a summary to stderr.
	if *all {
		if *out == "-" || *out == "" {
			fmt.Fprintln(os.Stderr, "gact export --all requires -o DIR (cannot dump to stdout)")
			return 2
		}
		return runExportAll(*out, *wsID, *backend)
	}

	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact export <session_id> [-o path] [--backend URL]\n"+
			"   or: gact export --all -o DIR [--workspace WS_ID] [--backend URL]")
		return 2
	}
	sessionID := fs.Arg(0)
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	blob, err := c.ExportSession(ctx, sessionID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact export: %v\n", err)
		return 1
	}

	var w io.Writer
	if *out == "-" {
		w = os.Stdout
	} else {
		f, err := os.Create(*out)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact export: create %s: %v\n", *out, err)
			return 1
		}
		defer f.Close()
		w = f
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(blob); err != nil {
		fmt.Fprintf(os.Stderr, "gact export: encode: %v\n", err)
		return 1
	}
	if *out != "-" {
		fmt.Fprintf(os.Stderr, "gact export: wrote %d messages to %s\n", len(blob.Messages), *out)
	}
	return 0
}

// runExportAll walks every session (optionally scoped to a workspace)
// and writes one indented JSON per session into dir. Continues past
// per-session fetch errors — one 500 on a single session shouldn't
// trash the whole backup — and reports a summary to stderr.
//
// QQQQ1: each session's export+write runs on a bounded goroutine
// pool (8-wide) so a 200-session backup doesn't take 200×RTT. The
// pool size is fixed: chosen because it pairs with the same constant
// used by `gact tasks summary` (FFFF1) — 8 is enough to saturate a
// LAN backend without DoSing it.
func runExportAll(dir, wsID, backendFlag string) int {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "gact export: mkdir %s: %v\n", dir, err)
		return 1
	}
	finalBackend := resolveCLIBackend(backendFlag)
	c := client.New(finalBackend)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
	cancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact export: list sessions: %v\n", err)
		return 1
	}
	if len(sessions) == 0 {
		fmt.Fprintln(os.Stderr, "gact export: no sessions to export")
		return 0
	}

	const workers = 8
	type result struct {
		sid string
		err error
	}
	sem := make(chan struct{}, workers)
	results := make(chan result, len(sessions))
	var wg sync.WaitGroup
	for _, s := range sessions {
		s := s
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			ectx, ecancel := context.WithTimeout(context.Background(), 30*time.Second)
			blob, err := c.ExportSession(ectx, s.ID)
			ecancel()
			if err != nil {
				results <- result{sid: s.ID, err: err}
				return
			}
			path := filepath.Join(dir, s.ID+".json")
			f, err := os.Create(path)
			if err != nil {
				results <- result{sid: s.ID, err: fmt.Errorf("create %s: %w", path, err)}
				return
			}
			enc := json.NewEncoder(f)
			enc.SetIndent("", "  ")
			if err := enc.Encode(blob); err != nil {
				f.Close()
				results <- result{sid: s.ID, err: fmt.Errorf("encode: %w", err)}
				return
			}
			f.Close()
			results <- result{sid: s.ID}
		}()
	}
	wg.Wait()
	close(results)

	ok, failed := 0, 0
	for r := range results {
		if r.err != nil {
			fmt.Fprintf(os.Stderr, "  %s: %v\n", r.sid, r.err)
			failed++
			continue
		}
		ok++
	}
	fmt.Fprintf(os.Stderr, "gact export: %d ok, %d failed → %s\n", ok, failed, dir)
	if failed > 0 {
		return 1
	}
	return 0
}

// runImport implements `gact import <file|->` reading a session blob and
// POSTing it to the backend's /v1/sessions/import endpoint.
func runImport(args []string) int {
	fs := flag.NewFlagSet("import", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	knownFlags := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, knownFlags)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact import <file|-> [--backend URL]")
		return 2
	}
	src := fs.Arg(0)
	finalBackend := resolveCLIBackend(*backend)

	var r io.Reader
	if src == "-" {
		r = os.Stdin
	} else {
		f, err := os.Open(src)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact import: open %s: %v\n", src, err)
			return 1
		}
		defer f.Close()
		r = f
	}
	var blob client.SessionExportBlob
	if err := json.NewDecoder(r).Decode(&blob); err != nil {
		fmt.Fprintf(os.Stderr, "gact import: decode: %v\n", err)
		return 1
	}
	if blob.Format == "" {
		fmt.Fprintln(os.Stderr, "gact import: missing 'format' field — not a GACT export blob")
		return 1
	}
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	created, err := c.ImportSession(ctx, blob)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact import: %v\n", err)
		return 1
	}
	fmt.Fprintf(os.Stderr, "gact import: created session %s with %d messages\n",
		created.ID, created.MessageCount)
	fmt.Println(created.ID)
	return 0
}
