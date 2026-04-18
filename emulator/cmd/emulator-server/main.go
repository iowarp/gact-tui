// Command emulator-server runs the GACT v0.1 emulator HTTP server.
//
// Usage:
//
//	emulator-server [--port 7777] [--scenario default] [--seed-workspace true]
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

	"github.com/JaimeCernuda/gact-tui/emulator/internal/server"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

const (
	seedWorkspaceID   = "ws_default"
	seedWorkspaceName = "default"
	seedWorkspaceRoot = "/tmp/gact-emulator-workspace"
)

func main() {
	var (
		port          = flag.Int("port", 7777, "TCP port to listen on")
		scenario      = flag.String("scenario", "default", "scenario name to load")
		seedWorkspace = flag.Bool("seed-workspace", true, "create a default workspace at startup")
	)
	flag.Parse()

	st := store.New()
	if *seedWorkspace {
		if _, err := st.CreateWorkspace(gact.Workspace{
			ID:       seedWorkspaceID,
			Name:     seedWorkspaceName,
			RootPath: seedWorkspaceRoot,
			Metadata: map[string]any{"seeded": true},
		}); err != nil {
			log.Fatalf("seed workspace: %v", err)
		}
		log.Printf("seeded workspace %s at %s", seedWorkspaceID, seedWorkspaceRoot)
	}

	srv := server.NewWithStore(server.Config{Scenario: *scenario}, st)

	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", *port),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("emulator listening on %s (scenario=%s)", httpServer.Addr, *scenario)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
		close(errCh)
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	select {
	case s := <-sig:
		log.Printf("received %s, shutting down", s)
	case err := <-errCh:
		log.Fatalf("server error: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("shutdown error: %v", err)
		os.Exit(1)
	}
	log.Println("bye")
}
