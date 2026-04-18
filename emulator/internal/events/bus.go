// Package events implements the in-memory pub/sub bus used by the emulator
// to deliver SSE events to subscribed clients.
//
// Concurrency model:
//   - Publishers call Publish; the call is non-blocking (events are dropped
//     for slow subscribers — see DroppedCount).
//   - Subscribers receive on a buffered channel; reading is the subscriber's
//     responsibility. A small ring buffer per bus retains the last N events
//     for SSE Last-Event-ID resume.
//   - Each event is assigned a monotonic SeqID at Publish time.
package events

import (
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// Event is the wire-level shape of an SSE event before serialization.
// Type is the discriminator (e.g. "session.created", "message.part.delta").
type Event struct {
	SeqID       uint64    `json:"-"`
	Type        string    `json:"type"`
	OccurredAt  time.Time `json:"occurred_at"`
	WorkspaceID string    `json:"-"` // routing only
	SessionID   string    `json:"-"` // routing only
	Payload     any       `json:"payload"`
}

// SeqString returns the sequence ID as a string suitable for SSE id: lines.
func (e Event) SeqString() string {
	return strconv.FormatUint(e.SeqID, 10)
}

// Filter narrows what a subscriber receives.
type Filter struct {
	WorkspaceID string // empty = any
	SessionID   string // empty = any
}

func (f Filter) match(e Event) bool {
	if f.WorkspaceID != "" && e.WorkspaceID != "" && e.WorkspaceID != f.WorkspaceID {
		return false
	}
	if f.SessionID != "" && e.SessionID != "" && e.SessionID != f.SessionID {
		return false
	}
	return true
}

// Subscription is what Subscribe returns. C delivers events; Cancel stops the
// subscription and closes C.
type Subscription struct {
	C      <-chan Event
	cancel func()
}

// Cancel cleans up the subscription. Idempotent.
func (s *Subscription) Cancel() {
	if s.cancel != nil {
		s.cancel()
	}
}

// Bus is the central pub/sub.
type Bus struct {
	mu          sync.RWMutex
	subscribers map[*subscriber]struct{}

	seq atomic.Uint64

	// Ring buffer for resume.
	ringMu  sync.RWMutex
	ring    []Event
	ringCap int

	dropped atomic.Uint64
}

type subscriber struct {
	filter Filter
	ch     chan Event
}

// NewBus constructs a Bus with a ring buffer of the given size (events).
// Pass 0 for the default (1024).
func NewBus(ringCap int) *Bus {
	if ringCap <= 0 {
		ringCap = 1024
	}
	return &Bus{
		subscribers: make(map[*subscriber]struct{}),
		ringCap:     ringCap,
	}
}

// Publish routes an event to all matching subscribers.
//
// Slow subscribers don't block the publisher: if a subscriber's channel is
// full the event is dropped for that subscriber and DroppedCount increments.
// This trades reliability for liveness; the SPEC allows event loss and SSE
// clients can recover via Last-Event-ID + the ring buffer.
func (b *Bus) Publish(e Event) Event {
	if e.OccurredAt.IsZero() {
		e.OccurredAt = time.Now().UTC()
	}
	e.SeqID = b.seq.Add(1)

	// Append to ring under its own lock to keep the publish path short.
	b.ringMu.Lock()
	if len(b.ring) < b.ringCap {
		b.ring = append(b.ring, e)
	} else {
		// Shift left by one — simple, fine for ringCap of a few thousand.
		copy(b.ring, b.ring[1:])
		b.ring[len(b.ring)-1] = e
	}
	b.ringMu.Unlock()

	// Fan-out to subscribers.
	b.mu.RLock()
	subs := make([]*subscriber, 0, len(b.subscribers))
	for s := range b.subscribers {
		subs = append(subs, s)
	}
	b.mu.RUnlock()

	for _, s := range subs {
		if !s.filter.match(e) {
			continue
		}
		select {
		case s.ch <- e:
		default:
			b.dropped.Add(1)
		}
	}
	return e
}

// Subscribe creates a new subscription with the given filter and channel
// capacity. Cancel the subscription via the returned Subscription.Cancel().
func (b *Bus) Subscribe(filter Filter, chanCap int) *Subscription {
	if chanCap <= 0 {
		chanCap = 64
	}
	s := &subscriber{
		filter: filter,
		ch:     make(chan Event, chanCap),
	}
	b.mu.Lock()
	b.subscribers[s] = struct{}{}
	b.mu.Unlock()

	cancel := func() {
		b.mu.Lock()
		if _, ok := b.subscribers[s]; ok {
			delete(b.subscribers, s)
			close(s.ch)
		}
		b.mu.Unlock()
	}
	return &Subscription{C: s.ch, cancel: cancel}
}

// Replay returns events with SeqID strictly greater than after that match the
// filter, in original order. Used for SSE Last-Event-ID resume.
func (b *Bus) Replay(after uint64, filter Filter) []Event {
	b.ringMu.RLock()
	defer b.ringMu.RUnlock()
	out := make([]Event, 0, 8)
	for _, e := range b.ring {
		if e.SeqID <= after {
			continue
		}
		if !filter.match(e) {
			continue
		}
		out = append(out, e)
	}
	return out
}

// DroppedCount returns the number of events dropped due to slow subscribers.
// Useful for observability/tests.
func (b *Bus) DroppedCount() uint64 { return b.dropped.Load() }

// SubscriberCount returns the current number of active subscribers.
func (b *Bus) SubscriberCount() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.subscribers)
}
