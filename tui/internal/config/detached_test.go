package config

import (
	"path/filepath"
	"testing"
	"time"
)

func TestDetached_AppendLoadRoundtrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "detached.json")

	r1 := DetachedRecord{
		SessionID: "sess_a",
		Title:     "first",
		Backend:   "http://localhost:7777",
		Workspace: "ws_local",
	}
	if err := AppendDetached(path, r1, 0); err != nil {
		t.Fatal(err)
	}

	reg, err := LoadDetached(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(reg.Records) != 1 {
		t.Fatalf("got %d records, want 1", len(reg.Records))
	}
	got := reg.Records[0]
	if got.SessionID != "sess_a" || got.Title != "first" || got.Backend != "http://localhost:7777" {
		t.Fatalf("roundtrip mismatch: %+v", got)
	}
	if got.DetachedAt.IsZero() {
		t.Fatal("DetachedAt should be auto-stamped on append")
	}
}

func TestDetached_AppendDedupesBySIDAndBackend(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "detached.json")

	old := time.Now().Add(-1 * time.Hour).UTC()
	if err := AppendDetached(path, DetachedRecord{
		SessionID: "sess_a", Backend: "http://b1", DetachedAt: old, Title: "old",
	}, 0); err != nil {
		t.Fatal(err)
	}
	// Second append with same (sid, backend) should replace, not stack.
	if err := AppendDetached(path, DetachedRecord{
		SessionID: "sess_a", Backend: "http://b1", Title: "new",
	}, 0); err != nil {
		t.Fatal(err)
	}
	// A second backend with same sid is a different entry.
	if err := AppendDetached(path, DetachedRecord{
		SessionID: "sess_a", Backend: "http://b2", Title: "other backend",
	}, 0); err != nil {
		t.Fatal(err)
	}

	reg, err := LoadDetached(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(reg.Records) != 2 {
		t.Fatalf("got %d, want 2 (one per backend): %+v", len(reg.Records), reg.Records)
	}
	// Newest first by DetachedAt.
	if !reg.Records[0].DetachedAt.After(reg.Records[1].DetachedAt) &&
		!reg.Records[0].DetachedAt.Equal(reg.Records[1].DetachedAt) {
		t.Fatalf("expected newest-first ordering: %+v", reg.Records)
	}
	// The dedupe target's title was overwritten with the new one.
	for _, r := range reg.Records {
		if r.Backend == "http://b1" && r.Title != "new" {
			t.Fatalf("dedupe should overwrite title: %+v", r)
		}
	}
}

func TestDetached_AppendTrimsToMaxRecords(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "detached.json")
	for i := 0; i < 10; i++ {
		if err := AppendDetached(path, DetachedRecord{
			SessionID:  "sess_" + string(rune('0'+i)),
			Backend:    "http://b",
			DetachedAt: time.Now().Add(time.Duration(i) * time.Second).UTC(),
		}, 5); err != nil {
			t.Fatal(err)
		}
	}
	reg, err := LoadDetached(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(reg.Records) != 5 {
		t.Fatalf("got %d, want 5 (trimmed)", len(reg.Records))
	}
}

func TestDetached_LoadMissingFileReturnsEmpty(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "does-not-exist.json")
	reg, err := LoadDetached(path)
	if err != nil {
		t.Fatalf("missing file should not error: %v", err)
	}
	if len(reg.Records) != 0 {
		t.Fatalf("got %d records, want 0", len(reg.Records))
	}
}

func TestDetached_RemoveDropsMatching(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "detached.json")
	for _, sid := range []string{"sess_a", "sess_b", "sess_c"} {
		if err := AppendDetached(path, DetachedRecord{
			SessionID: sid, Backend: "http://b",
		}, 0); err != nil {
			t.Fatal(err)
		}
	}
	n, err := RemoveDetached(path, "http://b", "sess_b")
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("removed %d, want 1", n)
	}
	reg, _ := LoadDetached(path)
	if len(reg.Records) != 2 {
		t.Fatalf("got %d after rm, want 2", len(reg.Records))
	}
	for _, r := range reg.Records {
		if r.SessionID == "sess_b" {
			t.Fatal("sess_b should have been removed")
		}
	}
}
