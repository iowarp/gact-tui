// Command gact-opencode-adapter exposes a GACT v0.1 HTTP surface that
// proxies to an OpenCode upstream. Run alongside an OpenCode server and
// point your GACT TUI at the adapter's port.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/JaimeCernuda/gact-tui/adapters/opencode"
)

func main() {
	upstream := flag.String("upstream", "http://localhost:4096",
		"OpenCode HTTP base URL")
	port := flag.Int("port", 7778, "TCP port to listen on for GACT clients")
	flag.Parse()

	srv := opencode.New(*upstream, nil)
	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", *port),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("opencode adapter on :%d → %s", *port, *upstream)
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
