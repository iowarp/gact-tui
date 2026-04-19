// Package plugins loads third-party slash-command plugins from
// ~/.config/gact/plugins/<name>/plugin.json. Each plugin declares one
// or more commands that exec a local binary when invoked. (MMM8)
//
// Manifest schema:
//
//	{
//	  "name": "git-pr",
//	  "version": "0.1",
//	  "description": "...",        // optional, shown in `gact plugins list`
//	  "commands": [
//	    {
//	      "id":          "/pr",      // slash form, must start with `/`
//	      "title":       "Open PR",  // shown in palette
//	      "description": "...",      // optional
//	      "command":     "/abs/path/to/script.sh",   // exec'd on invoke
//	      "args":        ["--flag"]                  // optional, prepended
//	    }
//	  ]
//	}
//
// Commands are exec'd with:
//   - $GACT_SESSION_ID, $GACT_BACKEND env vars set if the TUI/CLI
//     knows them at invoke time
//   - argv: [args...] [user-typed-args]
//   - stdout/stderr captured by the caller
package plugins

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Plugin is one loaded plugin.
type Plugin struct {
	Name        string    `json:"name"`
	Version     string    `json:"version,omitempty"`
	Description string    `json:"description,omitempty"`
	Commands    []Command `json:"commands"`
	// SourceDir is the on-disk directory the manifest was loaded from.
	// Useful for resolving relative `command` paths.
	SourceDir string `json:"-"`
}

// Command is one slash command exposed by a plugin.
type Command struct {
	ID          string   `json:"id"`
	Title       string   `json:"title,omitempty"`
	Description string   `json:"description,omitempty"`
	Command     string   `json:"command"`
	Args        []string `json:"args,omitempty"`
}

// DefaultDir returns the per-user plugin root, honoring XDG and
// $GACT_PLUGINS_DIR overrides. Mirrors the lookup order in
// internal/config so the two layers feel cohesive.
func DefaultDir() (string, error) {
	if p := os.Getenv("GACT_PLUGINS_DIR"); p != "" {
		return p, nil
	}
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "gact", "plugins"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "gact", "plugins"), nil
}

// Load discovers every `<dir>/<name>/plugin.json`, parses it, and
// returns the slice sorted by plugin.Name. Missing root dir returns
// an empty slice and nil error (no plugins is a valid state). A bad
// manifest skips that plugin and continues — caller can re-load with
// LoadVerbose to see the per-plugin errors.
func Load(dir string) ([]Plugin, error) {
	plugins, _, err := LoadVerbose(dir)
	return plugins, err
}

// LoadVerbose returns plugins plus a parallel slice of per-manifest
// errors (one entry per failing plugin.json, with the manifest path
// prefixed). Errors don't abort the load — best-effort discovery.
func LoadVerbose(dir string) ([]Plugin, []string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil, nil
		}
		return nil, nil, fmt.Errorf("read plugins dir %s: %w", dir, err)
	}
	var plugins []Plugin
	var loadErrs []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		manifestPath := filepath.Join(dir, e.Name(), "plugin.json")
		raw, rerr := os.ReadFile(manifestPath)
		if rerr != nil {
			if !os.IsNotExist(rerr) {
				loadErrs = append(loadErrs, fmt.Sprintf("%s: %v", manifestPath, rerr))
			}
			continue
		}
		var p Plugin
		if jerr := json.Unmarshal(raw, &p); jerr != nil {
			loadErrs = append(loadErrs, fmt.Sprintf("%s: parse: %v", manifestPath, jerr))
			continue
		}
		if p.Name == "" {
			loadErrs = append(loadErrs, fmt.Sprintf("%s: name required", manifestPath))
			continue
		}
		// Validate each command's id starts with "/" — the slash
		// palette assumes it. Skip the bad commands but keep the
		// good ones (better than dropping the whole plugin).
		validCmds := p.Commands[:0]
		for _, c := range p.Commands {
			if !strings.HasPrefix(c.ID, "/") {
				loadErrs = append(loadErrs,
					fmt.Sprintf("%s: command %q skipped (id must start with /)",
						manifestPath, c.ID))
				continue
			}
			if c.Command == "" {
				loadErrs = append(loadErrs,
					fmt.Sprintf("%s: command %q skipped (no exec path)",
						manifestPath, c.ID))
				continue
			}
			validCmds = append(validCmds, c)
		}
		p.Commands = validCmds
		p.SourceDir = filepath.Join(dir, e.Name())
		plugins = append(plugins, p)
	}
	sort.Slice(plugins, func(i, j int) bool {
		return plugins[i].Name < plugins[j].Name
	})
	return plugins, loadErrs, nil
}
