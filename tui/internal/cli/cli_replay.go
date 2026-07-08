package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runReplay imports a session export blob and (optionally) attaches
// the TUI to the resulting session. Workflow shortcut for
// `gact import FILE | gact attach $(gact import FILE)`. (CCCC1)
//
// With --attach: trims argv + sets GACT_ATTACH_SESSION_ID like
// runAttach does, then calls runTUI. Without --attach: prints the
// new sid and exits 0 (same as `gact import`).
func runReplay(args []string) {
	var attach *bool
	cc, rest, code := newCmdCtx("replay", args, withFlags(func(fs *flag.FlagSet) {
		attach = fs.Bool("attach", false, "launch the TUI on the imported session after import")
	}))
	if cc == nil {
		os.Exit(code)
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact replay <export-file|-> [--attach]")
		os.Exit(2)
	}
	src := rest[0]

	var r io.Reader
	if src == "-" {
		r = os.Stdin
	} else {
		f, err := os.Open(src)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact replay: open %s: %v\n", src, err)
			os.Exit(1)
		}
		defer f.Close()
		r = f
	}
	var blob client.SessionExportBlob
	if err := json.NewDecoder(r).Decode(&blob); err != nil {
		fmt.Fprintf(os.Stderr, "gact replay: decode: %v\n", err)
		os.Exit(1)
	}
	if blob.Format == "" {
		fmt.Fprintln(os.Stderr, "gact replay: missing 'format' field — not a GACT export blob")
		os.Exit(1)
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	created, err := c.ImportSession(ctx, blob)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact replay: %v\n", err)
		os.Exit(1)
	}
	fmt.Fprintf(os.Stderr, "gact replay: created session %s with %d messages\n",
		created.ID, created.MessageCount)
	if !*attach {
		fmt.Println(created.ID)
		os.Exit(0)
	}
	// --attach: hand off to runTUI. Bridge via env (same pattern as
	// runAttach) so we don't duplicate the TUI bootstrap.
	_ = os.Setenv("GACT_ATTACH_SESSION_ID", created.ID)
	os.Args = []string{os.Args[0]}
	RunTUI()
}
