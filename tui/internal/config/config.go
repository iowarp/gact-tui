// Package config loads the GACT TUI's user-level config file.
//
// Lookup order:
//  1. $GACT_CONFIG (if set, exact path)
//  2. $XDG_CONFIG_HOME/gact/config.json
//  3. $HOME/.config/gact/config.json
//
// Resolution precedence in main.go is then: defaults < config file <
// env vars < CLI flags. We use JSON instead of TOML to keep the TUI
// dependency-free; the file is small and infrequently edited so JSON
// noise is acceptable.
package config

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// Config is the on-disk shape. Fields are pointers so we can tell
// "absent from file" from "explicitly set to zero" — important for
// layering with env vars and flags.
type Config struct {
	BackendURL        *string `json:"backend_url,omitempty"`
	Theme             *string `json:"theme,omitempty"`         // "dark" | "light"
	VoiceCommand      *string `json:"voice_command,omitempty"` // shell cmd; stdout = audio/wav
	CollapseThreshold *int    `json:"collapse_threshold,omitempty"`
	CostWarnTokens    *int    `json:"cost_warn_tokens,omitempty"`
	CostDangerTokens  *int    `json:"cost_danger_tokens,omitempty"`
	// DisabledTools is a set of tool ids the user has hidden from the
	// catalog browser (LLL2). Persists across sessions. Backends that
	// honour an "allowed_tools" list at session-create time would read
	// this; today it's purely a TUI display filter.
	DisabledTools []string `json:"disabled_tools,omitempty"`
}

// Save writes cfg to path, creating parent directories as needed.
// Uses JSON with a two-space indent so humans can diff/edit by hand.
// Caller is responsible for choosing the path (usually DefaultPath()).
func Save(cfg Config, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

// Load reads the config file from the first path that exists. Returns
// an empty (zero) Config and nil error if no config file is present.
// Returns an error only if a file exists but cannot be parsed.
func Load() (Config, string, error) {
	path, err := DefaultPath()
	if err != nil {
		return Config{}, "", err
	}
	return LoadFrom(path)
}

// LoadFrom reads the named file. Missing file returns zero Config + no error.
func LoadFrom(path string) (Config, string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return Config{}, path, nil
		}
		return Config{}, path, err
	}
	var cfg Config
	if err := json.Unmarshal(b, &cfg); err != nil {
		return Config{}, path, err
	}
	return cfg, path, nil
}

// DefaultPath resolves the canonical config-file path per the lookup order.
// Returns the first explicit override or the XDG-conformant default; does
// not check whether the file actually exists.
func DefaultPath() (string, error) {
	if p := os.Getenv("GACT_CONFIG"); p != "" {
		return p, nil
	}
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "gact", "config.json"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "gact", "config.json"), nil
}

// Resolve picks the final value for a field given (config-file value,
// env-var value, flag value). Precedence: flag > env > file > fallback.
// A flag that equals the fallback is treated as "not explicitly set" so
// env/file get a chance to override (Go's flag library returns the default
// when the flag isn't passed; we can't otherwise tell the two apart).
// An empty string at any layer is treated as "not set".
func Resolve(file *string, env, flag, fallback string) string {
	if flag != "" && flag != fallback {
		return flag
	}
	if env != "" {
		return env
	}
	if file != nil && *file != "" {
		return *file
	}
	if flag != "" {
		return flag
	}
	return fallback
}
