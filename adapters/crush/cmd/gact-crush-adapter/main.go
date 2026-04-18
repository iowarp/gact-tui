// Command gact-crush-adapter exposes a GACT v0.1 HTTP surface that
// proxies to a Crush HTTP upstream. Run alongside a Crush server and
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

	"github.com/JaimeCernuda/gact-tui/adapters/crush"
)

func main() {
	upstream := flag.String("upstream", "http://localhost:8080",
		"Crush HTTP base URL (use a TCP listener — Unix-socket support is a follow-up)")
	defaultWs := flag.String("default-workspace", "",
		"workspace ID to use when GACT requests omit one (single-workspace deployments)")
	port := flag.Int("port", 7779, "TCP port to listen on for GACT clients")
	flag.Parse()

	srv := crush.New(*upstream, *defaultWs, nil)
	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", *port),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("crush adapter on :%d → %s (default ws=%q)", *port, *upstream, *defaultWs)
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
