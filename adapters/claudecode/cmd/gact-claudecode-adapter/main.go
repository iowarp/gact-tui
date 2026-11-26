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
	"strings"
	"syscall"
	"time"

	"github.com/JaimeCernuda/gact-tui/adapters/claudecode"
	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func main() {
	cwd := flag.String("cwd", "",
		"workspace root passed to claude (defaults to $PWD)")
	bin := flag.String("claude", "claude",
		"path to the claude CLI (defaults to $PATH lookup)")
	port := flag.Int("port", 7780, "TCP port to listen on for GACT clients")
	host := flag.String("host", "127.0.0.1", "bind interface")
	token := flag.String("token", "",
		"bearer token clients must send (default $"+gact.TokenEnv+", else a new one printed at startup)")
	allowedHosts := flag.String("allowed-hosts", "",
		"comma-separated Host names to answer besides loopback (for access by name)")
	flag.Parse()
	bearer, generated := gact.AdapterToken(*token)

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
		Handler:           gact.Guard(srv.Handler(), bearer, strings.Split(*allowedHosts, ",")),
		ReadHeaderTimeout: 5 * time.Second,
	}

	if generated {
		log.Printf("clients connect with bearer token %s (set -token or $%s to choose one)", bearer, gact.TokenEnv)
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
