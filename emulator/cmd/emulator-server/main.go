// Command emulator-server runs the GACT v0.1 emulator HTTP server.
//
// Usage:
//
//	emulator-server [--port 7777] [--scenario default] [--timing fast|realistic]
//	                [--seed-workspace true]
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

	"github.com/JaimeCernuda/gact-tui/emulator/internal/scenario"
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
		scenarioName  = flag.String("scenario", "default", "scenario name to load")
		timingMode    = flag.String("timing", "realistic", "scenario timing: fast | realistic")
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

	srv := server.NewWithStore(server.Config{Scenario: *scenarioName}, st)

	// Wire the scenario engine: it consumes the OnUserMessage hook, drives
	// assistant responses through the bus, and is cancelled by the cancel
	// hook. The engine shares the server's bus + store + permissions store.
	timing := scenario.Realistic
	if *timingMode == "fast" {
		timing = scenario.Fast
	}
	engine := scenario.New(srv.Bus(), srv.Store(), srv.Permissions(), scenario.Config{Timing: timing})
	srv.SetOnUserMessage(engine.OnUserMessage)
	srv.SetOnCancel(engine.Cancel)

	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", *port),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("emulator listening on %s (scenario=%s timing=%s)", httpServer.Addr, *scenarioName, *timingMode)
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
