package events

import (
	"sync"
	"testing"
	"time"
)

func TestPublishFanOut(t *testing.T) {
	b := NewBus(64)
	subA := b.Subscribe(Filter{}, 4)
	subB := b.Subscribe(Filter{}, 4)
	defer subA.Cancel()
	defer subB.Cancel()

	if got := b.SubscriberCount(); got != 2 {
		t.Fatalf("subscriber count = %d, want 2", got)
	}

	e := b.Publish(Event{Type: "test", Payload: "x"})
	if e.SeqID != 1 {
		t.Errorf("first SeqID = %d, want 1", e.SeqID)
	}

	for _, sub := range []*Subscription{subA, subB} {
		select {
		case got := <-sub.C:
			if got.Type != "test" || got.Payload != "x" {
				t.Errorf("unexpected event: %+v", got)
			}
		case <-time.After(time.Second):
			t.Fatalf("subscriber missed event")
		}
	}
}

func TestFilterByWorkspace(t *testing.T) {
	b := NewBus(64)
	a := b.Subscribe(Filter{WorkspaceID: "ws_a"}, 4)
	bSub := b.Subscribe(Filter{WorkspaceID: "ws_b"}, 4)
	defer a.Cancel()
	defer bSub.Cancel()

	b.Publish(Event{Type: "x", WorkspaceID: "ws_a"})
	b.Publish(Event{Type: "y", WorkspaceID: "ws_b"})

	select {
	case e := <-a.C:
		if e.Type != "x" {
			t.Errorf("a got %q", e.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("a missed")
	}
	select {
	case e := <-bSub.C:
		if e.Type != "y" {
			t.Errorf("b got %q", e.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("b missed")
	}

	// No second event in either buffer.
	select {
	case unexpected := <-a.C:
		t.Errorf("a got crosstalk: %+v", unexpected)
	case unexpected := <-bSub.C:
		t.Errorf("b got crosstalk: %+v", unexpected)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestSlowSubscriberDoesntBlock(t *testing.T) {
	b := NewBus(64)
	slow := b.Subscribe(Filter{}, 2) // tiny buffer
	defer slow.Cancel()

	// Don't read from slow; publish more than buffer can hold.
	for i := 0; i < 10; i++ {
		b.Publish(Event{Type: "x"})
	}
	if got := b.DroppedCount(); got == 0 {
		t.Errorf("expected drops > 0, got 0")
	}
}

func TestReplayAfterCursor(t *testing.T) {
	b := NewBus(64)
	for i := 0; i < 5; i++ {
		b.Publish(Event{Type: "e", SessionID: "sess_x"})
	}
	got := b.Replay(2, Filter{SessionID: "sess_x"})
	if len(got) != 3 {
		t.Errorf("Replay after 2: count = %d, want 3 (events 3,4,5)", len(got))
	}
	if got[0].SeqID != 3 {
		t.Errorf("first replayed SeqID = %d, want 3", got[0].SeqID)
	}
}

func TestCancelSubscriptionCleansUp(t *testing.T) {
	b := NewBus(64)
	sub := b.Subscribe(Filter{}, 4)
	if got := b.SubscriberCount(); got != 1 {
		t.Errorf("count = %d", got)
	}
	sub.Cancel()
	if got := b.SubscriberCount(); got != 0 {
		t.Errorf("count after cancel = %d", got)
	}
	// Channel should be closed.
	select {
	case _, open := <-sub.C:
		if open {
			t.Errorf("channel still open after cancel")
		}
	case <-time.After(time.Second):
		t.Fatal("recv on cancelled sub blocked")
	}

	// Cancel again is a no-op (must not panic).
	sub.Cancel()
}

func TestConcurrentPublishersAndSubscribers(t *testing.T) {
	b := NewBus(2048)
	var subs []*Subscription
	for i := 0; i < 5; i++ {
		subs = append(subs, b.Subscribe(Filter{}, 256))
	}
	defer func() {
		for _, s := range subs {
			s.Cancel()
		}
	}()

	var wg sync.WaitGroup
	for p := 0; p < 4; p++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				b.Publish(Event{Type: "e"})
			}
		}()
	}
	wg.Wait()

	// Drain a subscriber to confirm at least 100 events made it through.
	count := 0
	timeout := time.After(time.Second)
loop:
	for {
		select {
		case <-subs[0].C:
			count++
			if count == 200 {
				break loop
			}
		case <-timeout:
			break loop
		}
	}
	if count < 100 {
		t.Errorf("subscriber received %d, want at least 100", count)
	}
}
