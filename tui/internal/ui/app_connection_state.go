package ui

// connectionComponent: backend connection, SSE replay, reconnect-backoff, and execution-projection state.

import (
	"context"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// connectionComponent owns the backend connect handshake and the SSE stream +
// reconnect lifecycle. It embeds appConnectionState (the stream/replay/backoff
// fields, so its own methods keep direct c.field access) and holds a back-ref
// to the root App for shared services (client, session/conversation domains,
// stage). App.Update routes the connect/SSE/reconnect messages to its methods;
// other components reach the shared stream state via c.app.connection.X.
type connectionComponent struct {
	app *App
	appConnectionState
}

// appConnectionState groups backend connection, SSE replay, and execution
// projection state. It is embedded in connectionComponent so stream handlers and
// renderers keep their direct field access while the root model's field list
// stays readable.
type appConnectionState struct {
	sseEvents <-chan client.SSEEvent
	sseErrs   <-chan error
	sseCancel context.CancelFunc

	// sseBackoffAttempts is the count of consecutive reconnects since
	// the last successful event arrival. Used by nextReconnectDelay()
	// to pick 250 ms, 500 ms, 1 s, ... up to 30 s. Reset to 0 whenever
	// an event is delivered, so a flaky backend that comes back quickly
	// snaps back to the baseline.
	sseBackoffAttempts int

	// sseDownSince is the wall-clock time the current SSE outage
	// started; zero when the stream is healthy. Used by renderFooter to
	// suppress the reconnecting badge during sub-second blips.
	sseDownSince time.Time

	// lastSeenSeqID is the highest SSE event SeqID processed for the
	// current stream. Passed as Last-Event-ID on reconnect so the
	// backend ring buffer can replay events published during an outage.
	lastSeenSeqID uint64

	// lastSeenSeqIDBySession keeps independent SSE high-water marks per
	// session. CLIO event streams are session-scoped; a single global
	// counter made revisits unstable by replaying the whole ring.
	lastSeenSeqIDBySession map[string]uint64

	// semanticLiveMessagesBySession preserves TUI-synthesized live
	// semantic timeline rows while a session is still running. Backend
	// message reloads remain authoritative.
	semanticLiveMessagesBySession map[string][]gact.Message

	// connectRetryAttempts is the count of consecutive failed connectCmd
	// dispatches. It uses the same backoff schedule as SSE reconnect and
	// resets on connectedMsg.
	connectRetryAttempts int
}
