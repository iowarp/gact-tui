// Command gact-goose-adapter exposes a GACT v0.1 HTTP surface that
// proxies to a Goose HTTP upstream. Run alongside a goosed (the
// Goose HTTP server) and point your gact TUI at the adapter's port.
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

	"github.com/JaimeCernuda/gact-tui/adapters/goose"
)

func main() {
	upstream := flag.String("upstream", "http://localhost:3001",
		"Goose HTTP base URL (default goosed listen port)")
	wsRoot := flag.String("workspace-root", "",
		"Workspace root path advertised to GACT clients (defaults to current working directory)")
	port := flag.Int("port", 7781, "TCP port to listen on for GACT clients")
	flag.Parse()

	if *wsRoot == "" {
		wd, err := os.Getwd()
		if err != nil {
			log.Fatalf("getwd: %v", err)
		}
		*wsRoot = wd
	}

	srv := goose.New(*upstream, *wsRoot, nil)
	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", *port),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("goose adapter on :%d → upstream %s, ws root %s",
			*port, *upstream, *wsRoot)
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
