package scenario

import (
	"strings"
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func newRig(t *testing.T) (*Engine, *store.Store, *events.Bus, string) {
	t.Helper()
	st := store.New()
	ws, _ := st.CreateWorkspace(gact.Workspace{ID: "ws_test", RootPath: "/tmp/x"})
	sess, _ := st.CreateSession(gact.Session{WorkspaceID: ws.ID})
	perms := store.NewPermissions()
	bus := events.NewBus(256)
	eng := New(bus, st, perms, Config{Timing: Fast})
	return eng, st, bus, sess.ID
}

// collectEventTypes reads up to maxCount events or returns when the predicate
// fires, whichever comes first. timeout caps total wait. Use stop=nil to read
// until maxCount or timeout.
func collectEventTypes(sub *events.Subscription, maxCount int, timeout time.Duration, stop func(string) bool) []string {
	out := make([]string, 0, 64)
	deadline := time.After(timeout)
	for len(out) < maxCount {
		select {
		case e, ok := <-sub.C:
			if !ok {
				return out
			}
			out = append(out, e.Type)
			if stop != nil && stop(e.Type) {
				return out
			}
		case <-deadline:
			return out
		}
	}
	return out
}

// collectStatusEvents drains events until a session.status_changed event
// whose payload carries the requested status is seen. Returns the type
// names in the order they arrived. Unlike collectEventTypes, this looks
// at the event's *own* payload — never the store — so it can't be fooled
// by the script publishing newer events while we're still draining.
func collectStatusEvents(sub *events.Subscription, maxCount int, timeout time.Duration, wantStatus string) []string {
	out := make([]string, 0, 64)
	deadline := time.After(timeout)
	for len(out) < maxCount {
		select {
		case e, ok := <-sub.C:
			if !ok {
				return out
			}
			out = append(out, e.Type)
			if e.Type != "session.status_changed" {
				continue
			}
			payload, _ := e.Payload.(map[string]any)
			if payload != nil && payload["status"] == wantStatus {
				return out
			}
		case <-deadline:
			return out
		}
	}
	return out
}

func collectEventsUntilStatus(sub *events.Subscription, maxCount int, timeout time.Duration, wantStatus string) []events.Event {
	out := make([]events.Event, 0, 64)
	deadline := time.After(timeout)
	for len(out) < maxCount {
		select {
		case e, ok := <-sub.C:
			if !ok {
				return out
			}
			out = append(out, e)
			if e.Type != "session.status_changed" {
				continue
			}
			payload, _ := e.Payload.(map[string]any)
			if payload != nil && payload["status"] == wantStatus {
				return out
			}
		case <-deadline:
			return out
		}
	}
	return out
}

func TestDefaultScriptHappyPath(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 256)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart("read main.go")},
	})

	eng.OnUserMessage(sid, user.ID)

	// Stop on session.status_changed → idle (terminal signal). Multiple
	// message.completed events fire (one per assistant turn), so don't
	// stop on the first.
	// Stop on the actual idle event payload, not the store's current
	// status — the script can race ahead and set the store to idle
	// while we're still reading earlier "running" events from the
	// channel, causing the predicate to fire on the wrong event.
	// 30 s deadline absorbs slow-CI variance.
	got := collectStatusEvents(sub, 500, 30*time.Second, gact.StatusIdle)

	wantInOrder := []string{
		"session.status_changed", // running
		"message.created",        // assistant #1
		"message.part.added",     // thinking
		"message.part.delta",
		"message.part.completed",
		"message.part.added", // intro text
	}
	idx := 0
	for _, want := range wantInOrder {
		found := false
		for ; idx < len(got); idx++ {
			if got[idx] == want {
				idx++
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing event %q in sequence; got=%v", want, got)
		}
	}

	// Tool lifecycle should be present (no permission needed).
	mustContain(t, got, "tool.call.started")
	mustContain(t, got, "tool.call.completed")
	mustContain(t, got, "message.completed")

	// Final status idle.
	idleSeen := false
	for _, e := range got {
		if e == "session.status_changed" {
			// Check session state — final transition should be to idle.
			latest, _ := st.GetSession(sid)
			if latest.Status == gact.StatusIdle {
				idleSeen = true
			}
		}
	}
	if !idleSeen {
		t.Errorf("session never returned to idle; final state = %s", mustGetStatus(t, st, sid))
	}
}

func TestDefaultScriptDangerousRequiresPermission(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 256)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart("delete /tmp/scratch")},
	})

	eng.OnUserMessage(sid, user.ID)

	// Wait for permission.requested. Generous deadline same as below.
	var permID string
	deadline := time.After(30 * time.Second)
loop:
	for {
		select {
		case e, ok := <-sub.C:
			if !ok {
				break loop
			}
			if e.Type == "permission.requested" {
				if pr, ok := e.Payload.(*store.PermissionRequest); ok {
					permID = pr.ID
				}
				break loop
			}
		case <-deadline:
			t.Fatal("permission.requested never arrived")
		}
	}
	if permID == "" {
		t.Fatal("permission.requested arrived without ID")
	}

	// Allow it.
	if _, ok := eng.perms.Resolve(permID, store.PermAllow); !ok {
		t.Fatal("Resolve returned false")
	}

	// Drain until session.status_changed → idle (the script's terminal
	// signal). The pre-tool-call assistant message also fires
	// message.completed (with stop_reason=tool_use), so we can't stop on
	// the first message.completed — wait for the run to actually settle.
	// Stop on the actual idle event payload, not the store's current
	// status — the script can race ahead and set the store to idle
	// while we're still reading earlier "running" events from the
	// channel, causing the predicate to fire on the wrong event.
	// 30 s deadline absorbs slow-CI variance.
	got := collectStatusEvents(sub, 500, 30*time.Second, gact.StatusIdle)
	mustContain(t, got, "tool.call.completed")
	mustContain(t, got, "message.completed")

	final, _ := st.GetSession(sid)
	if final.Status != gact.StatusIdle {
		t.Errorf("status = %q, want idle", final.Status)
	}
}

func TestEarthScopeSACScriptProducesStructuredToolResult(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 256)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart("earthscope sac demo")},
	})

	eng.OnUserMessage(sid, user.ID)
	got := collectStatusEvents(sub, 500, 30*time.Second, gact.StatusIdle)
	mustContain(t, got, "tool.call.started")
	mustContain(t, got, "tool.call.completed")

	msgs, _, _ := st.ListMessages(store.MessageFilter{
		SessionID: sid, Limit: 100, IncludeSystem: false,
	})
	var sawCall, sawResult bool
	for _, m := range msgs {
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeToolCall && p.ToolName == "sac_discover_earthscope_region_waveform" {
				sawCall = true
			}
			if p.Type != gact.PartTypeToolResult {
				continue
			}
			for _, c := range p.Content {
				if strings.Contains(c.Text, "earthscope_CI_BAR_--_BHZ_2026-05-29T021201.sac") &&
					strings.Contains(c.Text, `"trace_count":1`) {
					sawResult = true
				}
			}
		}
	}
	if !sawCall {
		t.Fatal("expected EarthScope SAC tool call in transcript")
	}
	if !sawResult {
		t.Fatal("expected structured EarthScope SAC tool result in transcript")
	}
}

func TestNDPWarningsScriptProducesStructuredToolResult(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 256)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart("nws warning demo")},
	})

	eng.OnUserMessage(sid, user.ID)
	got := collectStatusEvents(sub, 500, 30*time.Second, gact.StatusIdle)
	mustContain(t, got, "tool.call.started")
	mustContain(t, got, "tool.call.completed")

	msgs, _, _ := st.ListMessages(store.MessageFilter{
		SessionID: sid, Limit: 100, IncludeSystem: false,
	})
	var sawCall, sawResult bool
	for _, m := range msgs {
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeToolCall && p.ToolName == "ndp_query_arcgis_features" {
				sawCall = true
			}
			if p.Type != gact.PartTypeToolResult {
				continue
			}
			for _, c := range p.Content {
				if strings.Contains(c.Text, "california_nws_warnings.json") &&
					strings.Contains(c.Text, "Flood Warning issued June 5") {
					sawResult = true
				}
			}
		}
	}
	if !sawCall {
		t.Fatal("expected NWS feature tool call in transcript")
	}
	if !sawResult {
		t.Fatal("expected structured NWS warning result in transcript")
	}
}

func TestCIMISWeatherScriptProducesProfileAndPlotResults(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 256)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart("cimis weather demo")},
	})

	eng.OnUserMessage(sid, user.ID)
	got := collectStatusEvents(sub, 500, 30*time.Second, gact.StatusIdle)
	mustContain(t, got, "tool.call.started")
	mustContain(t, got, "tool.call.completed")

	msgs, _, _ := st.ListMessages(store.MessageFilter{
		SessionID: sid, Limit: 100, IncludeSystem: false,
	})
	var sawProfileCall, sawPlotCall, sawProfileResult, sawPlotResult bool
	for _, m := range msgs {
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeToolCall && p.ToolName == "profile_csv_weather" {
				sawProfileCall = true
			}
			if p.Type == gact.PartTypeToolCall && p.ToolName == "plot_weather_timeseries" {
				sawPlotCall = true
			}
			if p.Type != gact.PartTypeToolResult {
				continue
			}
			for _, c := range p.Content {
				if strings.Contains(c.Text, "CIMIS Station 80 Fresno State hourly weather") &&
					strings.Contains(c.Text, "relative_humidity_pct") {
					sawProfileResult = true
				}
				if strings.Contains(c.Text, "cimis_fresno_weather.png") &&
					strings.Contains(c.Text, "time series") {
					sawPlotResult = true
				}
			}
		}
	}
	if !sawProfileCall {
		t.Fatal("expected CIMIS profile tool call in transcript")
	}
	if !sawPlotCall {
		t.Fatal("expected CIMIS plot tool call in transcript")
	}
	if !sawProfileResult {
		t.Fatal("expected structured CIMIS profile result in transcript")
	}
	if !sawPlotResult {
		t.Fatal("expected structured CIMIS plot result in transcript")
	}
}

func TestRedactedSemanticToolScriptProducesLifecycleOnlyToolEvents(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 256)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart("redacted semantic demo")},
	})

	eng.OnUserMessage(sid, user.ID)
	got := collectStatusEvents(sub, 500, 30*time.Second, gact.StatusIdle)
	mustContain(t, got, "tool.call.started")
	mustContain(t, got, "tool.call.completed")

	msgs, _, _ := st.ListMessages(store.MessageFilter{
		SessionID: sid, Limit: 100, IncludeSystem: false,
	})
	for _, m := range msgs {
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeToolCall || p.Type == gact.PartTypeToolResult {
				t.Fatalf("redacted semantic fixture should not mirror lifecycle events into stored tool parts: %#v", p)
			}
		}
	}
}

func TestWorkflowStateSemanticScriptProducesDelegationEvent(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 256)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart("workflow state semantic demo")},
	})

	eng.OnUserMessage(sid, user.ID)
	var got []events.Event
	for _, event := range collectEventsUntilStatus(sub, 500, 30*time.Second, gact.StatusIdle) {
		got = append(got, event)
	}
	sawWorkflowEvent := false
	for _, event := range got {
		if event.Type != "semantic.event" {
			continue
		}
		payload, _ := event.Payload.(map[string]any)
		nested, _ := payload["payload"].(map[string]any)
		workflowState, _ := nested["workflow_state"].(map[string]any)
		if payload["event_type"] == "blueprint.delegation.completed" && len(workflowState) > 0 {
			sawWorkflowEvent = true
			break
		}
	}
	if !sawWorkflowEvent {
		t.Fatalf("semantic workflow fixture did not emit delegation workflow_state event: %#v", got)
	}
}

func TestCancelStopsScript(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	// Use a slow timing so we can interrupt.
	eng.cfg.Timing = Timing{
		BetweenParts: 100 * time.Millisecond,
		PerToken:     50 * time.Millisecond,
		ToolThink:    500 * time.Millisecond,
	}

	sub := bus.Subscribe(events.Filter{SessionID: sid}, 256)
	defer sub.Cancel()

	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart("hi")},
	})
	eng.OnUserMessage(sid, user.ID)

	// Wait until at least one delta event arrives, then cancel.
	deadline := time.After(2 * time.Second)
	cancelled := false
loop:
	for {
		select {
		case e, ok := <-sub.C:
			if !ok {
				break loop
			}
			if e.Type == "message.part.delta" && !cancelled {
				eng.Cancel(sid)
				cancelled = true
			}
		case <-deadline:
			break loop
		}
	}

	if !cancelled {
		t.Fatal("never saw a delta to cancel against")
	}

	// Wait briefly and confirm the script stopped (no message.completed).
	time.Sleep(300 * time.Millisecond)
	more := collectEventTypes(sub, 5, 200*time.Millisecond, nil)
	for _, e := range more {
		if e == "message.completed" {
			t.Errorf("script ran to completion despite cancel; events: %v", more)
			break
		}
	}
}

func mustContain(t *testing.T, slice []string, want string) {
	t.Helper()
	for _, s := range slice {
		if s == want {
			return
		}
	}
	t.Errorf("expected %q in %v", want, slice)
}

func mustGetStatus(t *testing.T, st *store.Store, sid string) string {
	t.Helper()
	s, _ := st.GetSession(sid)
	if s == nil {
		return "<nil>"
	}
	return s.Status
}

// TestDefaultScriptSurvivesMessageDelete reproduces NNN1: delete the
// assistant message mid-flight while the scenario is still updating
// parts on it. Before the fix, the scenario panicked on nil Part
// returned by the addPart helper. After the fix, helpers return
// non-nil placeholders and the scenario silently degrades to no-op
// instead of crashing the server.
func TestDefaultScriptSurvivesMessageDelete(t *testing.T) {
	eng, st, _, sid := newRig(t)
	// Slow timing so we can race the delete in.
	eng.cfg.Timing = Timing{
		BetweenParts: 100 * time.Millisecond,
		PerToken:     50 * time.Millisecond,
		ToolThink:    300 * time.Millisecond,
	}
	user, _ := st.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart("hi")},
	})
	eng.OnUserMessage(sid, user.ID)

	// Give the scenario a beat to create the assistant message,
	// then nuke every assistant message in the session out from
	// under it.
	time.Sleep(150 * time.Millisecond)
	msgs, _, _ := st.ListMessages(store.MessageFilter{
		SessionID: sid, Limit: 100, IncludeSystem: true,
	})
	for _, m := range msgs {
		if m.Role == gact.RoleAssistant {
			_ = st.DeleteMessage(m.ID)
		}
	}

	// Without the NNN1 fix, the scenario goroutine would have
	// panicked already. Wait long enough for the rest of the
	// script to attempt its updates.
	time.Sleep(800 * time.Millisecond)

	// Sanity: getting the session shouldn't have errored or panicked.
	if _, err := st.GetSession(sid); err != nil {
		t.Errorf("session disappeared during scenario: %v", err)
	}
}

// QQQQQQQQ1: repeated default-script runs in the same session
// should produce visibly different intro/result/final text. Cycle
// is per-session via NextCallIndex with the "default" key, so two
// turns pull different variants. Asserts presence of two distinct
// intro variants in the persisted assistant messages.
func TestDefaultScriptCyclesIntroVariants(t *testing.T) {
	eng, st, bus, sid := newRig(t)
	sub := bus.Subscribe(events.Filter{SessionID: sid}, 256)
	defer sub.Cancel()

	send := func(text string) {
		t.Helper()
		user, _ := st.AppendMessage(gact.Message{
			SessionID: sid,
			Role:      gact.RoleUser,
			Parts:     []gact.Part{gact.NewTextPart(text)},
		})
		eng.OnUserMessage(sid, user.ID)
		// Wait for idle.
		_ = collectStatusEvents(sub, 500, 30*time.Second, gact.StatusIdle)
	}

	send("read main.go please")
	send("read main.go again")

	// Pull every assistant message out of the store + collect every
	// intro text we see. The script's first text-part on each turn
	// is the intro (per defaultIntroVariants).
	msgs, _, _ := st.ListMessages(store.MessageFilter{
		SessionID: sid, Limit: 100, IncludeSystem: false,
	})
	seenIntros := map[string]bool{}
	for _, m := range msgs {
		if m.Role != gact.RoleAssistant {
			continue
		}
		for _, p := range m.Parts {
			if p.Type != gact.PartTypeText {
				continue
			}
			for _, want := range defaultIntroVariants {
				if strings.Contains(p.Text, want) {
					seenIntros[want] = true
				}
			}
			break // only the first text part is the intro
		}
	}
	if len(seenIntros) < 2 {
		t.Errorf("expected at least 2 distinct intro variants across two turns; got %d (seen=%v)",
			len(seenIntros), seenIntros)
	}
}

// Tokenize sanity (string utility).
func TestTokenize(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"", 0},
		{"hello", 1},
		{"hello world", 2},
		{"a b c d", 4},
		{"line1\nline2", 2},
	}
	for _, c := range cases {
		got := tokenize(c.in)
		if len(got) != c.want {
			t.Errorf("tokenize(%q) = %d chunks, want %d (chunks=%v)",
				c.in, len(got), c.want, got)
		}
	}

	// Round-trip: joining tokens reconstructs the original.
	in := "the quick brown fox\njumps"
	if got := strings.Join(tokenize(in), ""); got != in {
		t.Errorf("round-trip: got %q, want %q", got, in)
	}
}
