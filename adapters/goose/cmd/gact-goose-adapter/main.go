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
	"strings"
	"syscall"
	"time"

	"github.com/JaimeCernuda/gact-tui/adapters/goose"
	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func main() {
	upstream := flag.String("upstream", "http://localhost:3001",
		"Goose HTTP base URL (default goosed listen port)")
	wsRoot := flag.String("workspace-root", "",
		"Workspace root path advertised to GACT clients (defaults to current working directory)")
	port := flag.Int("port", 7781, "TCP port to listen on for GACT clients")
	host := flag.String("host", "127.0.0.1", "bind interface (use 0.0.0.0 to serve other machines)")
	token := flag.String("token", "",
		"bearer token clients must send (default $"+gact.TokenEnv+", else a new one printed at startup)")
	allowedHosts := flag.String("allowed-hosts", "",
		"comma-separated Host names to answer besides loopback (for access by name)")
	flag.Parse()
	bearer, generated := gact.AdapterToken(*token)

	if *wsRoot == "" {
		wd, err := os.Getwd()
		if err != nil {
			log.Fatalf("getwd: %v", err)
		}
		*wsRoot = wd
	}

	srv := goose.New(*upstream, *wsRoot, nil)
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
		log.Printf("goose adapter on %s:%d → upstream %s, ws root %s",
			*host, *port, *upstream, *wsRoot)
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
