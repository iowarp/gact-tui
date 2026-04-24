// Package scenario drives the emulator's assistant-side behavior. When a
// user posts a message, an Engine fires a Script that synthesizes an
// assistant response — emitting the canonical SSE event sequence (SPEC §7.4)
// against the bus and persisting the resulting messages in the store.
//
// Scripts are pluggable. The default script approximates a realistic agent
// turn: text intro, tool call, tool result, follow-up text, finish. If the
// user message contains a danger keyword (e.g. "delete" or "rm "), the tool
// call requires permission via /v1/permissions/{id}.
package scenario

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// Timing controls per-step pacing. Use Fast in tests, Realistic for demos.
type Timing struct {
	BetweenParts time.Duration
	PerToken     time.Duration
	ToolThink    time.Duration
}

var (
	// Fast emits everything as quickly as possible. Suitable for tests.
	Fast = Timing{}
	// Realistic feels like watching an agent type. ~25ms per token, brief
	// pauses between part boundaries, a half-second of "tool execution".
	Realistic = Timing{
		BetweenParts: 150 * time.Millisecond,
		PerToken:     25 * time.Millisecond,
		ToolThink:    500 * time.Millisecond,
	}
)

// Config configures an Engine.
type Config struct {
	Timing Timing
	// Script overrides DefaultScript when non-nil.
	Script Script

	// CLIO-BBBBBBBBBB4 (v0.2 §6.19): optional hooks scripts use to
	// bump the server's synthetic memory-cache counters. Left nil in
	// tests where GET /v1/memory/stats isn't under test. Wired by
	// server.New() to point at Server.BumpMemoryHit/Miss.
	OnMemoryHit  func()
	OnMemoryMiss func()
}

// Script is one full user-turn handler. It must:
//   - Update session status, emit session.status_changed
//   - Create one or more messages, append parts with deltas, emit events
//   - End by setting session status back to idle
//
// Honor ctx.Done(): a cancellation request from the user must short-circuit.
type Script func(ctx context.Context, e *Engine, sessionID, userMessageID string)

// Engine runs Scripts. Each user message gets its own goroutine. If a new
// user message arrives while one is running, the old one is cancelled first
// (mirrors how a real agent backend would handle interruption).
type Engine struct {
	bus   *events.Bus
	store *store.Store
	perms *store.Permissions
	cfg   Config

	mu      sync.Mutex
	running map[string]context.CancelFunc // by sessionID
	// scriptCalls counts how many times a named script has been
	// invoked for a given (sessionID, scriptKey) pair. Scripts use
	// this via NextCallIndex() to vary their output across repeated
	// turns — e.g. so multiple "dump the log" calls return different
	// log payloads instead of the same canned text. (GGGGG1)
	scriptCalls map[string]int
}

// New constructs an Engine.
func New(bus *events.Bus, st *store.Store, perms *store.Permissions, cfg Config) *Engine {
	if cfg.Script == nil {
		cfg.Script = DefaultScript
	}
	return &Engine{
		bus:         bus,
		store:       st,
		perms:       perms,
		cfg:         cfg,
		running:     make(map[string]context.CancelFunc),
		scriptCalls: make(map[string]int),
	}
}

// NextCallIndex returns and increments the call counter for a given
// (sessionID, scriptKey) pair. Scripts use this to pick a variant
// from a list so repeated turns produce different output, exercising
// the cursor-aware Ctrl+E path (FFFFF1) where multiple bulky outputs
// must be individually addressable. (GGGGG1)
func (e *Engine) NextCallIndex(sessionID, scriptKey string) int {
	e.mu.Lock()
	defer e.mu.Unlock()
	k := sessionID + "\x00" + scriptKey
	idx := e.scriptCalls[k]
	e.scriptCalls[k] = idx + 1
	return idx
}

// OnUserMessage starts a script run for the given user message. Returns
// immediately (the run happens in a goroutine).
func (e *Engine) OnUserMessage(sessionID, userMessageID string) {
	e.mu.Lock()
	if cancel, ok := e.running[sessionID]; ok {
		cancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	e.running[sessionID] = cancel
	e.mu.Unlock()

	go func() {
		defer func() {
			e.mu.Lock()
			if c, ok := e.running[sessionID]; ok && fmt.Sprintf("%p", c) == fmt.Sprintf("%p", cancel) {
				delete(e.running, sessionID)
			}
			e.mu.Unlock()
			cancel()
		}()
		e.cfg.Script(ctx, e, sessionID, userMessageID)
	}()
}

// Cancel stops any in-flight script for the given session. Safe to call when
// nothing is running.
func (e *Engine) Cancel(sessionID string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if cancel, ok := e.running[sessionID]; ok {
		cancel()
		delete(e.running, sessionID)
	}
}

// Bus exposes the underlying bus (for scripts).
func (e *Engine) Bus() *events.Bus { return e.bus }

// Store exposes the underlying store (for scripts).
func (e *Engine) Store() *store.Store { return e.store }

// Permissions exposes the underlying permissions store (for scripts).
func (e *Engine) Permissions() *store.Permissions { return e.perms }

// Timing exposes the engine's timing config (for scripts).
func (e *Engine) Timing() Timing { return e.cfg.Timing }

// CLIO-BBBBBBBBBB4: hooks scripts can call to nudge the server's
// synthetic memory-cache counters. Safe to call when the server
// didn't wire the hooks — no-ops in that case.
func (e *Engine) NoteMemoryHit() {
	if e.cfg.OnMemoryHit != nil {
		e.cfg.OnMemoryHit()
	}
}
func (e *Engine) NoteMemoryMiss() {
	if e.cfg.OnMemoryMiss != nil {
		e.cfg.OnMemoryMiss()
	}
}

// --- Helpers callable by Scripts -------------------------------------------

// publishStatus changes session.Status and emits session.status_changed.
func (e *Engine) publishStatus(sessionID, status string) {
	prev := ""
	updated, err := e.store.UpdateSession(sessionID, func(s *gact.Session) {
		prev = s.Status
		s.Status = status
	})
	if err != nil {
		return
	}
	e.bus.Publish(events.Event{
		Type:        "session.status_changed",
		WorkspaceID: updated.WorkspaceID,
		SessionID:   sessionID,
		Payload: map[string]any{
			"session_id": sessionID,
			"status":     status,
			"prev_status": prev,
		},
	})
}

// createAssistantMessage appends an empty assistant message and emits
// message.created. Returns the stored message. NNN1: on error
// (typically ErrNotFound when the session was deleted mid-flight)
// returns a placeholder with empty ID so callers that ignore the
// error don't nil-deref. Subsequent helpers see the empty ID,
// AppendPart/UpdateMessagePart return ErrNotFound, and the scenario
// gracefully degrades to no-op.
func (e *Engine) createAssistantMessage(sessionID string) (*gact.Message, error) {
	m, err := e.store.AppendMessage(gact.Message{
		SessionID: sessionID,
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{},
	})
	if err != nil {
		return &gact.Message{}, err
	}
	e.bus.Publish(events.Event{
		Type:      "message.created",
		SessionID: sessionID,
		Payload:   m,
	})
	return m, nil
}

// addPart appends a part shell (no streamed content yet) and emits
// message.part.added. NNN1: nil-safe like createAssistantMessage.
func (e *Engine) addPart(sessionID, msgID string, p gact.Part) (*gact.Part, error) {
	added, err := e.store.AppendPart(msgID, p)
	if err != nil {
		return &gact.Part{}, err
	}
	e.bus.Publish(events.Event{
		Type:      "message.part.added",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id": msgID,
			"part":       added,
		},
	})
	return added, nil
}

// streamText appends text to a part one chunk at a time and emits delta
// events. The complete part is updated in the store.
func (e *Engine) streamText(ctx context.Context, sessionID, msgID, partID, full string, field string) error {
	chunks := tokenize(full)
	for _, chunk := range chunks {
		if err := sleep(ctx, e.cfg.Timing.PerToken); err != nil {
			return err
		}
		_, err := e.store.UpdateMessagePart(msgID, partID, func(p *gact.Part) {
			switch field {
			case "thinking":
				p.Thinking += chunk
			default:
				p.Text += chunk
			}
		})
		if err != nil {
			return err
		}
		key := "text_append"
		if field == "thinking" {
			key = "thinking_append"
		}
		e.bus.Publish(events.Event{
			Type:      "message.part.delta",
			SessionID: sessionID,
			Payload: map[string]any{
				"message_id": msgID,
				"part_id":    partID,
				"delta":      map[string]any{key: chunk},
			},
		})
	}
	return nil
}

// completePart emits message.part.completed.
func (e *Engine) completePart(sessionID, msgID, partID string) {
	e.bus.Publish(events.Event{
		Type:      "message.part.completed",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id": msgID,
			"part_id":    partID,
		},
	})
}

// completeMessage emits message.completed and a cost.updated tick. The
// emulator fakes plausible per-turn usage from a fixed rate so the TUI's
// cost meter visibly increments without a real LLM call.
func (e *Engine) completeMessage(sessionID, msgID, stopReason string) {
	_, _ = e.store.UpdateMessagePart(msgID, "__nope__", func(*gact.Part) {}) // touch updated_at

	// Synthetic but plausible usage: ~1500 input + 600 output tokens per
	// assistant turn, priced like Sonnet ($3/MTok in, $15/MTok out).
	turnTokens := gact.Tokens{Input: 1500, Output: 600}
	turnCost := float64(turnTokens.Input)/1_000_000*3.0 + float64(turnTokens.Output)/1_000_000*15.0

	// Roll cost into the message.
	_, _ = e.store.UpdateMessagePart(msgID, "__nope__", func(*gact.Part) {})
	// Roll into the session aggregate.
	updated, err := e.store.UpdateSession(sessionID, func(s *gact.Session) {
		s.Tokens.Input += turnTokens.Input
		s.Tokens.Output += turnTokens.Output
		s.CostUSD += turnCost
	})

	e.bus.Publish(events.Event{
		Type:      "message.completed",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id":  msgID,
			"stop_reason": stopReason,
			"tokens":      turnTokens,
			"cost_usd":    turnCost,
		},
	})

	if err == nil && updated != nil {
		e.bus.Publish(events.Event{
			Type:      "cost.updated",
			SessionID: sessionID,
			Payload: map[string]any{
				"session_id": sessionID,
				"tokens":     updated.Tokens,
				"cost_usd":   updated.CostUSD,
			},
		})
	}
}

// --- Internal utilities -----------------------------------------------------

func sleep(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// tokenize splits s into "tokens" of roughly word size for a typing-feel
// streaming effect. Returns the original string as one chunk if Fast.
func tokenize(s string) []string {
	if s == "" {
		return nil
	}
	out := make([]string, 0, 16)
	cur := strings.Builder{}
	for _, r := range s {
		cur.WriteRune(r)
		if r == ' ' || r == '\n' {
			out = append(out, cur.String())
			cur.Reset()
		}
	}
	if cur.Len() > 0 {
		out = append(out, cur.String())
	}
	return out
}
