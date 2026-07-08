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

// DetachedRecord is one entry in the detached-sessions registry. The
// TUI writes one of these on Ctrl+Z (clean detach) so the user can
// later list "sessions I walked away from but did not stop". The
// backend doesn't track this — from its perspective every session
// is just a session — so the registry lives client-side.
type DetachedRecord struct {
	SessionID  string    `json:"session_id"`
	Title      string    `json:"title,omitempty"`
	Backend    string    `json:"backend"`
	Workspace  string    `json:"workspace,omitempty"`
	DetachedAt time.Time `json:"detached_at"`
}

// DetachedRegistry is the on-disk shape: a JSON array of records,
// newest first. Entries are deduped by (Backend, SessionID) so
// detaching twice from the same session updates the timestamp
// instead of stacking duplicates.
type DetachedRegistry struct {
	Records []DetachedRecord `json:"records"`
}

// DetachedPath returns the canonical path for the detached-sessions
// registry — sibling of config.json under $XDG_CONFIG_HOME/gact (or
// $HOME/.config/gact). Honoured by every reader/writer here.
func DetachedPath() (string, error) {
	if p := os.Getenv("GACT_DETACHED_PATH"); p != "" {
		return p, nil
	}
	cfg, err := DefaultPath()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(cfg), "detached.json"), nil
}

// LoadDetached reads the registry from path. Missing file → empty
// registry, no error. Returned records are sorted newest-first by
// DetachedAt so callers can render them as-is.
func LoadDetached(path string) (DetachedRegistry, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return DetachedRegistry{}, nil
		}
		return DetachedRegistry{}, err
	}
	var reg DetachedRegistry
	if len(b) == 0 {
		return reg, nil
	}
	if err := json.Unmarshal(b, &reg); err != nil {
		return DetachedRegistry{}, err
	}
	sort.SliceStable(reg.Records, func(i, j int) bool {
		return reg.Records[i].DetachedAt.After(reg.Records[j].DetachedAt)
	})
	return reg, nil
}

// SaveDetached overwrites the registry file. Caller is responsible
// for first reading + mutating + writing if they want to preserve
// existing entries (use AppendDetached for the common case).
func SaveDetached(reg DetachedRegistry, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

// AppendDetached records a new detach event. Dedupes by (Backend,
// SessionID) — re-detaching the same session updates the existing
// row's timestamp/title. Truncates to keep the most recent
// maxRecords entries (default 64) so the file doesn't grow without
// bound. Pass maxRecords <= 0 for the default.
func AppendDetached(path string, rec DetachedRecord, maxRecords int) error {
	if maxRecords <= 0 {
		maxRecords = 64
	}
	if rec.DetachedAt.IsZero() {
		rec.DetachedAt = time.Now().UTC()
	}
	reg, err := LoadDetached(path)
	if err != nil {
		return err
	}
	// Dedupe.
	out := make([]DetachedRecord, 0, len(reg.Records)+1)
	out = append(out, rec)
	for _, r := range reg.Records {
		if r.SessionID == rec.SessionID && r.Backend == rec.Backend {
			continue
		}
		out = append(out, r)
	}
	if len(out) > maxRecords {
		out = out[:maxRecords]
	}
	return SaveDetached(DetachedRegistry{Records: out}, path)
}

// RemoveDetached drops every record whose (Backend, SessionID)
// matches. Returns the number removed. Used by `gact detached --rm`
// + by the TUI when the user destroys a session through `x` so
// stale entries don't accumulate.
func RemoveDetached(path, backend, sessionID string) (int, error) {
	reg, err := LoadDetached(path)
	if err != nil {
		return 0, err
	}
	out := reg.Records[:0]
	removed := 0
	for _, r := range reg.Records {
		if r.SessionID == sessionID && (backend == "" || r.Backend == backend) {
			removed++
			continue
		}
		out = append(out, r)
	}
	if removed == 0 {
		return 0, nil
	}
	return removed, SaveDetached(DetachedRegistry{Records: out}, path)
}
