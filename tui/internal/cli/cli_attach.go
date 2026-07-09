package cli

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runAttach: `gact attach [<name|sid>]` — launch the TUI pre-selected
// on a session. With no argument, defaults to the most recently
// Ctrl+Z-detached session on the current backend. Exits
// via os.Exit when done. Env var GACT_ATTACH_SESSION_ID is the
// bridge into runTUI's setup so the flag-parse path doesn't need
// new flags.
func runAttach(args []string) {
	// Extract --print-only (no value) ahead of the target
	// arg so the two usages compose cleanly:
	//   gact attach <name>           — launch TUI
	//   gact attach <name> --print-only  — print sid only, no TUI
	//   gact attach --print-only     — resolve no-args default, print
	printOnly := false
	kept := args[:0]
	for _, a := range args {
		if a == "--print-only" || a == "-print-only" {
			printOnly = true
			continue
		}
		kept = append(kept, a)
	}
	args = kept

	if len(args) > 1 {
		fmt.Fprintln(os.Stderr, "usage: gact attach [<name|sess_id>] [--print-only]")
		os.Exit(2)
	}
	target := ""
	if len(args) == 1 {
		target = args[0]
	} else {
		// No-arg path. Look up the most-recent detach for
		// the current backend (env > config > built-in default — same
		// resolution runTUI uses) and attach there. Friction-killer
		// for the common loop: gact → work → Ctrl+Z → `gact attach`.
		sid, err := defaultAttachTarget()
		if err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(2)
		}
		target = sid
	}
	// --print-only short-circuits the TUI launch so
	// scripts can resolve the target sid without running bubbletea.
	// For a no-arg invocation, defaultAttachTarget already printed
	// the `attaching to most-recent detach: ...` hint to stderr; the
	// sid also goes to stdout so pipelines can capture it cleanly.
	// For an explicit name/sid, no hint is printed (we can't fuzzy-
	// resolve without a live backend, and the caller passed the
	// string so no disambiguation needed).
	if printOnly {
		fmt.Println(target)
		os.Exit(0)
	}
	_ = os.Setenv("GACT_ATTACH_SESSION_ID", target)
	// Trim os.Args so runTUI's flag.Parse doesn't choke on "attach
	// <name>" remnants. Set os.Args to just the program name.
	os.Args = []string{os.Args[0]}
	RunTUI()
}

// defaultAttachTarget reads the detached.json registry and returns
// the SessionID of the most-recent record matching the current
// backend that the backend can still confirm exists. Probes each
// candidate newest-first and skips dead entries — a registry left
// over from a backend restart shouldn't crash the TUI on attach.
// Returns a typed error when nothing applies so the
// caller can exit with a helpful message instead of an opaque
// attach-failed crash later.
//
// Backend resolution mirrors runTUI's precedence: env > flag >
// config > built-in default. Flags aren't parsed yet here so we
// fall back to env-or-config-or-default.
func defaultAttachTarget() (string, error) {
	return defaultAttachTargetWithProbe(probeSessionAlive)
}

// defaultAttachTargetWithProbe is the testable variant — accepts a
// probe func so tests can stub liveness without standing up an HTTP
// server. defaultAttachTarget calls this with the real HTTP probe.
func defaultAttachTargetWithProbe(probe func(backend, sid string) bool) (string, error) {
	cfg, _, _ := config.Load()
	envBackend := os.Getenv("GACT_BACKEND")
	backend := config.Resolve(cfg.BackendURL, envBackend, "", defaultBackend)
	regPath, err := config.DetachedPath()
	if err != nil {
		return "", fmt.Errorf("gact attach: %v", err)
	}
	reg, err := config.LoadDetached(regPath)
	if err != nil {
		return "", fmt.Errorf("gact attach: read registry %s: %v", regPath, err)
	}
	skipped := 0
	for _, r := range reg.Records {
		if r.Backend != backend {
			continue
		}
		if !probe(r.Backend, r.SessionID) {
			skipped++
			continue
		}
		if skipped > 0 {
			fmt.Fprintf(os.Stderr, "attaching to %s (%s) — skipped %d dead entry(ies)\n",
				r.SessionID, r.Title, skipped)
		} else {
			fmt.Fprintf(os.Stderr, "attaching to most-recent detach: %s (%s)\n",
				r.SessionID, r.Title)
		}
		return r.SessionID, nil
	}
	if skipped > 0 {
		return "", fmt.Errorf("gact attach: %d detached entry(ies) on %s but none are still alive — `gact detached --probe` to inspect, or attach by sid explicitly", skipped, backend)
	}
	return "", fmt.Errorf("gact attach: no detached sessions on %s — Ctrl+Z in the TUI records one, or `gact detached` to inspect across backends", backend)
}

// probeSessionAlive is the production probe — a 2-second HTTP GET
// against /v1/sessions/{sid}. Any error or non-2xx response means
// "not alive" so a transient backend hiccup is treated the same as
// a deleted session. Slightly conservative but safer than letting
// the TUI hang on a bad attach target.
func probeSessionAlive(backend, sid string) bool {
	c := client.New(backend)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, err := c.GetSession(ctx, sid)
	return err == nil
}
