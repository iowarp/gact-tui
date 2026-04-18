package opencode

import (
	"encoding/json"
	"testing"
)

func TestTranslateEvent_Idle(t *testing.T) {
	raw := []byte(`{"type":"session.idle","properties":{"sessionID":"ses_x"}}`)
	ev, payload, sid, ok := translateEvent(raw)
	if !ok {
		t.Fatal("ok = false")
	}
	if ev != "session.status_changed" {
		t.Errorf("ev = %q", ev)
	}
	if sid != "ses_x" {
		t.Errorf("sid = %q", sid)
	}
	if payload["status"] != "idle" {
		t.Errorf("payload = %+v", payload)
	}
}

func TestTranslateEvent_MessageUpdated(t *testing.T) {
	raw := []byte(`{"type":"message.updated","properties":{"info":{"id":"m1","sessionID":"ses_x","role":"assistant"}}}`)
	ev, payload, sid, ok := translateEvent(raw)
	if !ok {
		t.Fatal("ok = false")
	}
	if ev != "message.created" {
		t.Errorf("ev = %q", ev)
	}
	if sid != "ses_x" {
		t.Errorf("sid = %q", sid)
	}
	info, _ := payload["payload"].(map[string]any)
	if info["id"] != "m1" {
		t.Errorf("info missing: %+v", payload)
	}
}

func TestTranslateEvent_PermissionAsked(t *testing.T) {
	raw := []byte(`{"type":"permission.asked","properties":{"sessionID":"ses_x","permissionID":"perm_1"}}`)
	ev, _, sid, ok := translateEvent(raw)
	if !ok || ev != "permission.requested" || sid != "ses_x" {
		t.Errorf("ev=%q sid=%q ok=%v", ev, sid, ok)
	}
}

func TestTranslateEvent_PermissionReplied(t *testing.T) {
	raw := []byte(`{"type":"permission.replied","properties":{"sessionID":"ses_x","permissionID":"perm_1","action":"allow"}}`)
	ev, payload, _, ok := translateEvent(raw)
	if !ok {
		t.Fatal("ok = false")
	}
	if ev != "permission.resolved" {
		t.Errorf("ev = %q", ev)
	}
	if payload["permission_id"] != "perm_1" || payload["action"] != "allow" {
		t.Errorf("payload = %+v", payload)
	}
}

func TestTranslateEvent_UnknownPassthrough(t *testing.T) {
	raw := []byte(`{"type":"session.compacted","properties":{"sessionID":"ses_x","extra":42}}`)
	ev, payload, sid, ok := translateEvent(raw)
	if !ok {
		t.Fatal("ok = false")
	}
	if ev != "x.opencode.session.compacted" {
		t.Errorf("ev = %q (expected x.opencode.* prefix per SPEC §8.4)", ev)
	}
	if sid != "ses_x" {
		t.Errorf("sid = %q", sid)
	}
	if payload["extra"].(float64) != 42 {
		t.Errorf("payload missing extra: %+v", payload)
	}
}

func TestTranslateEvent_DropsLocalGreetings(t *testing.T) {
	for _, t_ := range []string{"server.connected", "server.heartbeat"} {
		raw, _ := json.Marshal(map[string]any{"type": t_})
		_, _, _, ok := translateEvent(raw)
		if ok {
			t.Errorf("upstream %q should be dropped (proxy generates its own)", t_)
		}
	}
}

func TestTranslateEvent_Malformed(t *testing.T) {
	if _, _, _, ok := translateEvent([]byte("not json")); ok {
		t.Errorf("malformed input returned ok")
	}
}
