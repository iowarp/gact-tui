package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRewindSessionRequestShape(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions/s1/rewind" {
			http.NotFound(w, r)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode rewind request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"deleted_messages": []string{"m2", "m3"}})
	}))
	defer srv.Close()

	deleted, err := New(srv.URL).RewindSession(t.Context(), "s1", "m1", true)
	if err != nil {
		t.Fatalf("RewindSession: %v", err)
	}
	if got["to_message_id"] != "m1" || got["include_target"] != true {
		t.Fatalf("request = %#v", got)
	}
	if len(deleted) != 2 || deleted[0] != "m2" || deleted[1] != "m3" {
		t.Fatalf("deleted = %#v", deleted)
	}
}
