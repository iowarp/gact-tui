// Command gact-claudecode-adapter exposes a GACT v0.1 HTTP surface
// that drives Anthropic's `claude` CLI in stream-json mode. Auth is
// handled entirely by the CLI (OAuth token from the user's keychain,
// or ANTHROPIC_API_KEY env if set) — the adapter never sees credentials.
//
// Run alongside a GACT TUI:
//
//	gact-claudecode-adapter --cwd ~/myrepo --port 7780 &
//	GACT_BACKEND=http://localhost:7780 gact
//
// One adapter instance == one workspace (Claude Code is cwd-scoped:
// CLAUDE.md, MCP config, and tool permissions all key off the
// directory). Run multiple adapters on different ports to drive
// multiple repos.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/JaimeCernuda/gact-tui/adapters/claudecode"
)

func main() {
	cwd := flag.String("cwd", "",
		"Workspace root passed to claude as --add-dir (defaults to current working directory)")
	claudeBin := flag.String("claude", "claude",
		"Path to the `claude` CLI binary (defaults to $PATH lookup)")
	port := flag.Int("port", 7780, "TCP port to listen on for GACT clients")
	flag.Parse()

	if *cwd == "" {
		wd, err := os.Getwd()
		if err != nil {
			log.Fatalf("getwd: %v", err)
		}
		*cwd = wd
	}

	// Sanity-check the CLI is on PATH (or at the explicit path) before
	// starting the server. Catches the most common misconfig early
	// instead of waiting for the first POST /messages to fail.
	if _, err := exec.LookPath(*claudeBin); err != nil {
		log.Fatalf("claude CLI not found: %v (use --claude /path/to/claude)", err)
	}

	srv := claudecode.New(*cwd, *claudeBin)
	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", *port),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("claudecode adapter on :%d → cwd=%s claude=%s", *port, *cwd, *claudeBin)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
		close(errCh)
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	select {
	case s := <-sig:
		log.Printf("received %s", s)
	case err := <-errCh:
		log.Fatalf("server error: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}
