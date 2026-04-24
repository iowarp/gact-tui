// Command emulator-server runs the GACT v0.1 emulator HTTP server.
//
// Usage:
//
//	emulator-server [--port 7777] [--scenario default] [--timing fast|realistic]
//	                [--seed-workspace true] [--seed-workspaces name:/path,…]
//	                [--seed-sessions ws_id=count,ws_id=count]
//	                [--seed-messages ses_id=count,ses_id=count]
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
		port           = flag.Int("port", 7777, "TCP port to listen on")
		scenarioName   = flag.String("scenario", "default", "scenario name to load")
		timingMode     = flag.String("timing", "realistic", "scenario timing: fast | realistic")
		seedWorkspace  = flag.Bool("seed-workspace", true, "create a default workspace at startup")
		seedWorkspaces = flag.String("seed-workspaces", "",
			"comma-separated list of extra workspaces to seed as "+
				"`name:/path,name:/path`. Useful for multi-workspace demos.")
		seedSessions = flag.String("seed-sessions", "",
			"comma-separated `ws_id=N` entries; seeds N placeholder "+
				"sessions in each listed workspace. Useful for demos "+
				"of multi-session sidebar behaviour.")
		seedMessages = flag.String("seed-messages", "",
			"comma-separated `ses_id=N` entries; seeds N placeholder "+
				"user+assistant message pairs in each listed session. "+
				"Useful for demos of populated-conversation rendering.")
		walkFiles = flag.Bool("walk-files", false,
			"serve real files from each workspace's RootPath for "+
				"GET /v1/workspaces/{id}/files (instead of the static demo list). "+
				"Off by default so deterministic tests keep passing.")
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

	extras, err := parseSeedWorkspaces(*seedWorkspaces)
	if err != nil {
		log.Fatalf("--seed-workspaces: %v", err)
	}
	for _, ws := range extras {
		created, err := st.CreateWorkspace(ws)
		if err != nil {
			log.Fatalf("seed extra workspace %q: %v", ws.Name, err)
		}
		log.Printf("seeded workspace %s at %s", created.ID, created.RootPath)
	}

	sessionPlan, err := parseSeedSessions(*seedSessions)
	if err != nil {
		log.Fatalf("--seed-sessions: %v", err)
	}
	for _, step := range sessionPlan {
		for i := 0; i < step.count; i++ {
			// Deterministic seeded session IDs so operators and
			// chained flags (--seed-messages) can refer to them
			// without first booting the server to discover hash-
			// based IDs. ses_seed_<wsID>_<n> is documented in
			// --seed-sessions usage.
			sess, err := st.CreateSession(gact.Session{
				ID:          fmt.Sprintf("ses_seed_%s_%d", step.wsID, i+1),
				WorkspaceID: step.wsID,
				Title:       fmt.Sprintf("seeded session %d", i+1),
				Status:      gact.StatusIdle,
			})
			if err != nil {
				log.Fatalf("seed session #%d for %q: %v", i+1, step.wsID, err)
			}
			log.Printf("seeded session %s (%q) in workspace %s", sess.ID, sess.Title, step.wsID)
		}
	}

	messagePlan, err := parseSeedMessages(*seedMessages)
	if err != nil {
		log.Fatalf("--seed-messages: %v", err)
	}
	for _, step := range messagePlan {
		for i := 0; i < step.count; i++ {
			// One user turn + one assistant turn per count — a single
			// N=3 creates 6 messages, matching how users think about
			// "turns" rather than raw message counts.
			if _, err := st.AppendMessage(gact.Message{
				SessionID: step.sessionID,
				Role:      gact.RoleUser,
				Parts:     []gact.Part{gact.NewTextPart(fmt.Sprintf("seeded user message %d", i+1))},
			}); err != nil {
				log.Fatalf("seed user message #%d for %q: %v", i+1, step.sessionID, err)
			}
			if _, err := st.AppendMessage(gact.Message{
				SessionID: step.sessionID,
				Role:      gact.RoleAssistant,
				Parts:     []gact.Part{gact.NewTextPart(fmt.Sprintf("seeded assistant reply %d", i+1))},
			}); err != nil {
				log.Fatalf("seed assistant message #%d for %q: %v", i+1, step.sessionID, err)
			}
		}
		log.Printf("seeded %d message pairs in session %s", step.count, step.sessionID)
	}

	srv := server.NewWithStore(server.Config{
		Scenario:           *scenarioName,
		WalkWorkspaceFiles: *walkFiles,
	}, st)

	// Wire the scenario engine: it consumes the OnUserMessage hook, drives
	// assistant responses through the bus, and is cancelled by the cancel
	// hook. The engine shares the server's bus + store + permissions store.
	timing := scenario.Realistic
	if *timingMode == "fast" {
		timing = scenario.Fast
	}
	// CLIO-BBBBBBBBBB4: wire the scenario engine to the server's
	// synthetic memory-cache counters so /v1/memory/stats has real
	// data. Scripts call engine.NoteMemoryHit/Miss.
	engine := scenario.New(srv.Bus(), srv.Store(), srv.Permissions(), scenario.Config{
		Timing:       timing,
		OnMemoryHit:  srv.BumpMemoryHit,
		OnMemoryMiss: srv.BumpMemoryMiss,
	})
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

// seedSessionStep is one ws_id=count entry from --seed-sessions.
type seedSessionStep struct {
	wsID  string
	count int
}

// seedMessageStep is one ses_id=count entry from --seed-messages.
type seedMessageStep struct {
	sessionID string
	count     int
}

// parseSeedMessages parses --seed-messages. Shape mirrors
// parseSeedSessions so operators don't have to learn a third syntax —
// same whitespace tolerance, same positive-count requirement, same
// refuse-to-boot stance on malformed input.
func parseSeedMessages(raw string) ([]seedMessageStep, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var out []seedMessageStep
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		i := strings.IndexByte(entry, '=')
		if i <= 0 || i == len(entry)-1 {
			return nil, fmt.Errorf("bad entry %q: want `session_id=count`", entry)
		}
		sid := strings.TrimSpace(entry[:i])
		countStr := strings.TrimSpace(entry[i+1:])
		if sid == "" || countStr == "" {
			return nil, fmt.Errorf("bad entry %q: session id and count must be non-empty", entry)
		}
		n := 0
		for _, r := range countStr {
			if r < '0' || r > '9' {
				return nil, fmt.Errorf("bad entry %q: count must be a positive integer", entry)
			}
			n = n*10 + int(r-'0')
		}
		if n == 0 {
			return nil, fmt.Errorf("bad entry %q: count must be > 0", entry)
		}
		out = append(out, seedMessageStep{sessionID: sid, count: n})
	}
	return out, nil
}

// parseSeedSessions parses --seed-sessions. Empty input → nil, no
// error. Each entry is "ws_id=N"; N must be a positive integer
// (zero is pointless, negative is nonsense). Same whitespace
// tolerance + fail-on-malformed-input stance as parseSeedWorkspaces.
func parseSeedSessions(raw string) ([]seedSessionStep, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var out []seedSessionStep
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		i := strings.IndexByte(entry, '=')
		if i <= 0 || i == len(entry)-1 {
			return nil, fmt.Errorf("bad entry %q: want `ws_id=count`", entry)
		}
		wsID := strings.TrimSpace(entry[:i])
		countStr := strings.TrimSpace(entry[i+1:])
		if wsID == "" || countStr == "" {
			return nil, fmt.Errorf("bad entry %q: workspace id and count must be non-empty", entry)
		}
		n := 0
		for _, r := range countStr {
			if r < '0' || r > '9' {
				return nil, fmt.Errorf("bad entry %q: count must be a positive integer", entry)
			}
			n = n*10 + int(r-'0')
		}
		if n == 0 {
			return nil, fmt.Errorf("bad entry %q: count must be > 0", entry)
		}
		out = append(out, seedSessionStep{wsID: wsID, count: n})
	}
	return out, nil
}

// parseSeedWorkspaces parses --seed-workspaces. Empty input → nil, no
// error. Each entry is "name:/path"; name becomes gact.Workspace.Name,
// path becomes RootPath. We let the store assign IDs so tests aren't
// sensitive to IDs hashing differently between runs. Whitespace around
// each entry is trimmed; an empty entry between commas is skipped so
// `a:/a,,b:/b` is tolerated.
//
// Per-entry syntax errors fail the whole flag — better to refuse to
// boot than to silently start with an incomplete seed list.
func parseSeedWorkspaces(raw string) ([]gact.Workspace, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var out []gact.Workspace
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		i := strings.IndexByte(entry, ':')
		if i <= 0 || i == len(entry)-1 {
			return nil, fmt.Errorf("bad entry %q: want `name:/path`", entry)
		}
		name := strings.TrimSpace(entry[:i])
		path := strings.TrimSpace(entry[i+1:])
		if name == "" || path == "" {
			return nil, fmt.Errorf("bad entry %q: name and path must be non-empty", entry)
		}
		out = append(out, gact.Workspace{
			Name:     name,
			RootPath: path,
			Metadata: map[string]any{"seeded": true},
		})
	}
	return out, nil
}
