package config

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// AgentRecord is one entry in the local agent registry. `gact agent
// deploy` writes one of these so `gact connect <name>` later knows
// where to find the running adapter. Backend-side there's no
// concept of "named agent" — the registry lives per-user per-
// machine. (OOOOOOOOO1)
type AgentRecord struct {
	Name      string    `json:"name"`
	Kind      string    `json:"kind"`     // "claudecode", "opencode", "crush", "goose", ...
	Bin       string    `json:"bin"`      // path to the adapter binary
	Host      string    `json:"host"`     // usually 127.0.0.1
	Port      int       `json:"port"`     // tcp port the adapter listens on
	PID       int       `json:"pid"`      // OS pid of the adapter process (0 if unknown)
	Cwd       string    `json:"cwd"`      // working directory passed at spawn time
	StartedAt time.Time `json:"started_at"`
	// LogPath is where the spawn's stdout/stderr were redirected at
	// deploy time. Empty for adapters spawned before the log-redirect
	// feature landed (registry rows persist across upgrades).
	LogPath string `json:"log_path,omitempty"`
}

// AgentRegistry is the on-disk shape: a JSON object with a single
// `agents` array. Name is the primary key — a second deploy with
// the same name replaces the existing entry.
type AgentRegistry struct {
	Agents []AgentRecord `json:"agents"`
}

// AgentsPath returns the canonical path for agents.json — sibling
// of config.json under $XDG_CONFIG_HOME/gact. Honoured by every
// reader/writer here; override via $GACT_AGENTS_PATH for tests.
func AgentsPath() (string, error) {
	if p := os.Getenv("GACT_AGENTS_PATH"); p != "" {
		return p, nil
	}
	cfg, err := DefaultPath()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(cfg), "agents.json"), nil
}

// LoadAgents reads the registry from path. Missing file → empty
// registry, no error. Entries sorted newest-first by StartedAt so
// the most recently deployed agent sits at the top of `agent list`.
func LoadAgents(path string) (AgentRegistry, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return AgentRegistry{}, nil
		}
		return AgentRegistry{}, err
	}
	var reg AgentRegistry
	if len(b) == 0 {
		return reg, nil
	}
	if err := json.Unmarshal(b, &reg); err != nil {
		return AgentRegistry{}, err
	}
	sort.SliceStable(reg.Agents, func(i, j int) bool {
		return reg.Agents[i].StartedAt.After(reg.Agents[j].StartedAt)
	})
	return reg, nil
}

// SaveAgents overwrites the registry file. Caller is responsible
// for first reading + mutating + writing if they want to preserve
// existing entries (use UpsertAgent for the common case).
func SaveAgents(reg AgentRegistry, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

// UpsertAgent inserts or replaces an entry by Name. Sets StartedAt
// to Now if zero so callers can skip stamping. Returns the registry
// it persisted so the caller can present the final state.
func UpsertAgent(path string, rec AgentRecord) (AgentRegistry, error) {
	if rec.Name == "" {
		return AgentRegistry{}, errors.New("agent record: Name is required")
	}
	if rec.StartedAt.IsZero() {
		rec.StartedAt = time.Now().UTC()
	}
	reg, err := LoadAgents(path)
	if err != nil {
		return AgentRegistry{}, err
	}
	out := make([]AgentRecord, 0, len(reg.Agents)+1)
	out = append(out, rec)
	for _, a := range reg.Agents {
		if a.Name == rec.Name {
			continue // replaced
		}
		out = append(out, a)
	}
	reg.Agents = out
	if err := SaveAgents(reg, path); err != nil {
		return AgentRegistry{}, err
	}
	return reg, nil
}

// RemoveAgent drops the entry with Name. Returns true if an entry
// was removed. No error when the name didn't exist — idempotent so
// scripts can always call rm without checking list first.
func RemoveAgent(path, name string) (bool, error) {
	reg, err := LoadAgents(path)
	if err != nil {
		return false, err
	}
	out := reg.Agents[:0]
	removed := false
	for _, a := range reg.Agents {
		if a.Name == name {
			removed = true
			continue
		}
		out = append(out, a)
	}
	if !removed {
		return false, nil
	}
	reg.Agents = out
	return true, SaveAgents(reg, path)
}

// FindAgent returns the entry with Name, or ok=false if none. Used
// by `gact connect <name>` to resolve the host+port.
func FindAgent(path, name string) (AgentRecord, bool, error) {
	reg, err := LoadAgents(path)
	if err != nil {
		return AgentRecord{}, false, err
	}
	for _, a := range reg.Agents {
		if a.Name == name {
			return a, true, nil
		}
	}
	return AgentRecord{}, false, nil
}
