package server

// SPEC §6.17 hooks (MMM3). Registered hooks fire asynchronously
// whenever the bus publishes an event whose Type matches Hook.Event
// (or Hook.Event=="*"). Scoped hooks only fire on matching session_id
// or workspace_id. The runner times out at 10s per spec; failures
// are logged but never propagate back to the originating request.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/google/uuid"
)

// hooksStore is the emulator's in-memory hook registry. Purely
// runtime — restarting the server clears it. Production backends
// would persist to disk.
type hooksStore struct {
	mu    sync.RWMutex
	hooks map[string]gact.Hook
}

func newHooksStore() *hooksStore {
	return &hooksStore{hooks: map[string]gact.Hook{}}
}

func (h *hooksStore) list() []gact.Hook {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]gact.Hook, 0, len(h.hooks))
	for _, hk := range h.hooks {
		out = append(out, hk)
	}
	return out
}

func (h *hooksStore) add(hk gact.Hook) gact.Hook {
	h.mu.Lock()
	defer h.mu.Unlock()
	if hk.ID == "" {
		hk.ID = "hk_" + uuid.NewString()[:24]
	}
	h.hooks[hk.ID] = hk
	return hk
}

func (h *hooksStore) delete(id string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.hooks[id]; !ok {
		return false
	}
	delete(h.hooks, id)
	return true
}

// hooksMatch reports whether the hook's filters match the event.
// `event=="*"` is a wildcard; missing scope fields mean "any scope".
func hooksMatch(hk gact.Hook, ev events.Event) bool {
	if hk.Event != "*" && hk.Event != ev.Type {
		return false
	}
	if hk.SessionID != "" && hk.SessionID != ev.SessionID {
		return false
	}
	if hk.WorkspaceID != "" && hk.WorkspaceID != ev.WorkspaceID {
		return false
	}
	return true
}

// runHook fires hk against ev. URL takes precedence over Command per
// SPEC. Returns nil on success; caller logs but does not bubble.
func runHook(ctx context.Context, hk gact.Hook, ev events.Event) error {
	body, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}
	if hk.URL != "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, hk.URL, bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("build req: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return fmt.Errorf("post: %w", err)
		}
		_ = resp.Body.Close()
		return nil
	}
	if hk.Command != "" {
		cmd := exec.CommandContext(ctx, hk.Command)
		cmd.Stdin = bytes.NewReader(body)
		return cmd.Run()
	}
	return fmt.Errorf("hook %s has neither command nor url", hk.ID)
}

// startHookDispatcher subscribes to the bus and fans events out to
// matching hooks. Runs until ctx is cancelled (typically the server's
// shutdown context).
func (s *Server) startHookDispatcher(ctx context.Context) {
	sub := s.bus.Subscribe(events.Filter{}, 256)
	go func() {
		defer sub.Cancel()
		for {
			select {
			case <-ctx.Done():
				return
			case ev, ok := <-sub.C:
				if !ok {
					return
				}
				for _, hk := range s.hooks.list() {
					if !hooksMatch(hk, ev) {
						continue
					}
					hk := hk // copy for goroutine
					ev := ev
					go func() {
						hctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
						defer cancel()
						_ = runHook(hctx, hk, ev)
					}()
				}
			}
		}
	}()
}

// --- HTTP handlers ---------------------------------------------------------

func (s *Server) handleListHooks(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"hooks": s.hooks.list()})
}

func (s *Server) handleCreateHook(w http.ResponseWriter, r *http.Request) {
	var req gact.Hook
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Event == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "event required")
		return
	}
	if req.Command == "" && req.URL == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "either command or url required")
		return
	}
	created := s.hooks.add(req)
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleDeleteHook(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.hooks.delete(id) {
		writeError(w, http.StatusNotFound, "hook_not_found", "no hook with id "+id)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
