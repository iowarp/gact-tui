package ui

// app_sse_commands.go defines the SSE stream start command, its lifecycle messages, and their connection handlers.

import (
	"context"
	"errors"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// startSSE opens the SSE stream and returns the first event.
//
// Connection setup (StreamEvents -> http.Client.Do) blocks until the
// server returns the SSE response headers - for a healthy backend
// that's <50 ms, but a wedged or slow-to-accept server can stall the
// Update loop for the full HTTP timeout. Wrap the whole open inside
// the returned tea.Cmd so the goroutine takes the hit, never the
// render thread. The first event lands as a sseConnectedMsg that
// stashes the channels on the app and arms waitForSSE.
func (c *sessionComponent) startSSE(sessionID string) tea.Cmd {
	a := c.app
	if a.connection.sseCancel != nil {
		a.connection.sseCancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.connection.sseCancel = cancel
	lastSeen := a.connection.lastSeenSeqID
	cl := a.c
	return func() tea.Msg {
		events, errs, err := cl.StreamEvents(ctx, client.EventStreamScope{
			SessionID:   sessionID,
			LastEventID: lastSeen,
		})
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return sseOpenCanceledMsg{sessionID: sessionID}
			}
			return errMsg{err: err, stage: "sse"}
		}
		return sseConnectedMsg{events: events, errs: errs}
	}
}

// sseConnectedMsg carries the freshly-opened SSE channels back to the
// Update loop so it can stash them on App and arm waitForSSE.
type sseConnectedMsg struct {
	events <-chan client.SSEEvent
	errs   <-chan error
}

type sseBatchMsg struct {
	Events []client.SSEEvent
}

type sseOpenCanceledMsg struct {
	sessionID string
}

type sseEventMsg struct {
	Event client.SSEEvent
}

type sseClosedMsg struct{}

type reconnectMsg struct {
	sessionID string
}

func (c *connectionComponent) handleSSEConnected(m sseConnectedMsg) (tea.Model, tea.Cmd) {
	// Stream just finished its handshake off the Update goroutine. Stash
	// the channels on the component and start blocking on the first event.
	c.sseEvents = m.events
	c.sseErrs = m.errs
	return c.app, waitForSSE(m.events, m.errs)
}

func (c *connectionComponent) handleSSEOpenCanceled(m sseOpenCanceledMsg) (tea.Model, tea.Cmd) {
	// Expected during fast session/model/provider transitions: opening an
	// old SSE stream can lose the race to the next selection and get
	// cancelled before response headers arrive. The newer stream/reconnect
	// path owns recovery.
	return c.app, nil
}

func (c *connectionComponent) handleSSEEvent(m sseEventMsg) (tea.Model, tea.Cmd) {
	return c.app, c.app.conversation.applySSEBatch([]client.SSEEvent{m.Event})
}

func (c *connectionComponent) handleSSEBatch(m sseBatchMsg) (tea.Model, tea.Cmd) {
	return c.app, c.app.conversation.applySSEBatch(m.Events)
}

func (c *connectionComponent) handleSSEClosed(m sseClosedMsg) (tea.Model, tea.Cmd) {
	// Stream ended, either cancelled or remote-closed. Wait per the
	// backoff schedule, then reopen for the current session.
	if sid := c.app.session.currentID(); sid != "" {
		// Stamp the start of the outage on the first drop in this run so
		// the renderer can hide reconnecting noise until it lasts long
		// enough to matter. Later backoff ticks must not reset this.
		if c.sseBackoffAttempts == 0 {
			c.sseDownSince = time.Now()
		}
		delay := c.nextReconnectDelay()
		c.sseBackoffAttempts++
		return c.app, scheduleTick(delay, func() tea.Msg {
			return reconnectMsg{sessionID: sid}
		})
	}
	return c.app, nil
}

func (c *connectionComponent) handleReconnect(m reconnectMsg) (tea.Model, tea.Cmd) {
	if c.app.session.currentID() == m.sessionID {
		return c.app, c.app.session.startSSE(m.sessionID)
	}
	return c.app, nil
}

const maxSSEBatchEvents = 128

func waitForSSE(events <-chan client.SSEEvent, errs <-chan error) tea.Cmd {
	return func() tea.Msg {
		select {
		case e, ok := <-events:
			if !ok {
				return sseClosedMsg{}
			}
			batch := []client.SSEEvent{e}
			for len(batch) < maxSSEBatchEvents {
				select {
				case next, ok := <-events:
					if !ok {
						return sseBatchMsg{Events: batch}
					}
					batch = append(batch, next)
				default:
					return sseBatchMsg{Events: batch}
				}
			}
			return sseBatchMsg{Events: batch}
		case err, ok := <-errs:
			if !ok {
				return sseClosedMsg{}
			}
			return errMsg{err: err, stage: "sse-read"}
		}
	}
}
