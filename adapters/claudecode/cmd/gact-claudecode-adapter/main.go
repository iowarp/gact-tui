// Command gact-claudecode-adapter is a single-binary GACT v0.1
// adapter that drives Anthropic's `claude` CLI directly via
// stream-json. Replaces the Python claude-agent-sdk-server sidecar
// for the eventual single-binary release of gact.
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
		"workspace root passed to claude (defaults to $PWD)")
	bin := flag.String("claude", "claude",
		"path to the claude CLI (defaults to $PATH lookup)")
	port := flag.Int("port", 7780, "TCP port to listen on for GACT clients")
	host := flag.String("host", "127.0.0.1", "bind interface")
	flag.Parse()

	if *cwd == "" {
		wd, err := os.Getwd()
		if err != nil {
			log.Fatalf("getwd: %v", err)
		}
		*cwd = wd
	}
	if _, err := exec.LookPath(*bin); err != nil {
		log.Fatalf("claude CLI not on PATH: %v (use --claude /path/to/claude)", err)
	}

	srv := claudecode.New(*cwd, *bin)
	httpServer := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", *host, *port),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("claudecode adapter on %s:%d -> cwd=%s claude=%s",
			*host, *port, *cwd, *bin)
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
