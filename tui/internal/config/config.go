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
	// Name overrides the product/brand name for white-labeling: it drives the
	// OS window title and the generated splash wordmark, so a downstream brand
	// no longer needs a fork for the name. Empty = built-in default. A custom
	// `intro_file` still takes precedence for the splash art. Also settable via
	// the GACT_BRAND_NAME env var.
	Name              *string `json:"name,omitempty"`
	Workspace         *string `json:"workspace,omitempty"`     // startup workspace id, name, or root path
	Theme             *string `json:"theme,omitempty"`         // "dark" | "light"
	Locale            *string `json:"locale,omitempty"`        // "en" | "es" | "ja"
	VoiceCommand      *string `json:"voice_command,omitempty"` // shell cmd; stdout = audio/wav
	CollapseThreshold *int    `json:"collapse_threshold,omitempty"`
	CostWarnTokens    *int    `json:"cost_warn_tokens,omitempty"`
	CostDangerTokens  *int    `json:"cost_danger_tokens,omitempty"`
	// SidebarLayout controls the composable sidebar module order. Unknown
	// module ids are preserved so newer configs degrade visibly instead of
	// silently dropping future modules.
	SidebarLayout *SidebarLayout `json:"sidebar_layout,omitempty"`
	// YYYYY1: minimum line count for a paste to get the compressed
	// `[pasted content: N lines]` placeholder. nil/0 means default 3.
	PasteCompressThreshold *int `json:"paste_compress_threshold,omitempty"`
	// DisabledTools is a set of tool ids the user has hidden from the
	// catalog browser (LLL2). Persists across sessions. Backends that
	// honour an "allowed_tools" list at session-create time would read
	// this; today it's purely a TUI display filter.
	DisabledTools []string `json:"disabled_tools,omitempty"`
	// IntroSkip suppresses the JJJ1 splash screen. Default behaviour
	// (nil/false) is to show the splash on TUI startup.
	IntroSkip *bool `json:"intro_skip,omitempty"`
	// MouseEnabled controls terminal mouse reporting. Nil means on.
	MouseEnabled *bool `json:"mouse_enabled,omitempty"`
	// IntroFile points at a custom splash file (`logo` block followed
	// by a blank line and a `name` block, both ASCII art). Empty =
	// use the baked-in default. Resolves relative paths against
	// $XDG_CONFIG_HOME/gact/.
	IntroFile *string `json:"intro_file,omitempty"`
	// NNNNNNNNN1: frame delay (milliseconds) for the animated GRC
	// logo splash. Nil/0 = built-in default (90ms → ~3.2s per 36-
	// frame loop). Lower = faster rotation. Range-clamped at use
	// site to [20, 1000] so a typo doesn't freeze the splash.
	IntroFrameDelayMs *int `json:"intro_frame_delay_ms,omitempty"`
	// ConfigVersion tracks the schema generation. Bumped each time a
	// breaking config field rename/move lands; migrate.go's Run() walks
	// configs forward through the registered migrations on Load. Absent
	// (or 0) is treated as "pre-versioned" and runs all migrations.
	// MMM2.
	ConfigVersion *int `json:"config_version,omitempty"`
}

// SidebarLayout is the human-editable module placement shape for the TUI
// sidebars. Only Left is rendered today; Right is reserved for the paired
// composable module work without requiring another config migration.
type SidebarLayout struct {
	Left  []string `json:"left,omitempty"`
	Right []string `json:"right,omitempty"`
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
	// MMM2: walk the config forward through any migrations whose
	// version > cfg.ConfigVersion (or all of them if absent). Migration
	// runs are best-effort — a failure logs but doesn't block boot,
	// because a misbehaving migration shouldn't lock the user out.
	cfg, _ = Migrate(cfg)
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
