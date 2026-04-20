package config

import (
	"path/filepath"
	"testing"
	"time"
)

func TestAgents_UpsertAppendsAndReplaces(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agents.json")

	_, err := UpsertAgent(path, AgentRecord{
		Name: "alpha", Kind: "claudecode", Port: 7780, Cwd: "/home",
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = UpsertAgent(path, AgentRecord{
		Name: "beta", Kind: "opencode", Port: 7781, Cwd: "/tmp",
	})
	if err != nil {
		t.Fatal(err)
	}
	reg, _ := LoadAgents(path)
	if len(reg.Agents) != 2 {
		t.Fatalf("expected 2 agents, got %d", len(reg.Agents))
	}

	// Replace alpha with a fresh port.
	_, err = UpsertAgent(path, AgentRecord{
		Name: "alpha", Kind: "claudecode", Port: 9999, Cwd: "/home2",
	})
	if err != nil {
		t.Fatal(err)
	}
	reg, _ = LoadAgents(path)
	if len(reg.Agents) != 2 {
		t.Fatalf("upsert should replace, not append; got %d agents", len(reg.Agents))
	}
	got, ok, _ := FindAgent(path, "alpha")
	if !ok {
		t.Fatal("alpha missing after replace")
	}
	if got.Port != 9999 || got.Cwd != "/home2" {
		t.Errorf("replace didn't take effect: %+v", got)
	}
}

func TestAgents_RemoveIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agents.json")
	_, _ = UpsertAgent(path, AgentRecord{Name: "alpha", Kind: "claudecode", Port: 7780})
	removed, err := RemoveAgent(path, "alpha")
	if err != nil {
		t.Fatal(err)
	}
	if !removed {
		t.Error("first remove should have flipped removed=true")
	}
	// Second rm of same name: no entry, no error, removed=false.
	removed, err = RemoveAgent(path, "alpha")
	if err != nil {
		t.Fatal(err)
	}
	if removed {
		t.Error("second remove should report removed=false")
	}
	// rm of non-existent name returns the same way.
	removed, err = RemoveAgent(path, "never-existed")
	if err != nil || removed {
		t.Errorf("rm of unknown name: removed=%v err=%v", removed, err)
	}
}

func TestAgents_FindMissingReturnsFalse(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agents.json")
	_, ok, err := FindAgent(path, "nope")
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Error("expected ok=false for missing name")
	}
}

func TestAgents_NewestFirstOrdering(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agents.json")
	now := time.Now().UTC()
	_, _ = UpsertAgent(path, AgentRecord{Name: "old", Port: 1, StartedAt: now.Add(-2 * time.Hour)})
	_, _ = UpsertAgent(path, AgentRecord{Name: "mid", Port: 2, StartedAt: now.Add(-1 * time.Hour)})
	_, _ = UpsertAgent(path, AgentRecord{Name: "new", Port: 3, StartedAt: now})

	reg, _ := LoadAgents(path)
	if len(reg.Agents) != 3 {
		t.Fatalf("want 3, got %d", len(reg.Agents))
	}
	if reg.Agents[0].Name != "new" || reg.Agents[2].Name != "old" {
		t.Errorf("order wrong; got %v", []string{reg.Agents[0].Name, reg.Agents[1].Name, reg.Agents[2].Name})
	}
}
