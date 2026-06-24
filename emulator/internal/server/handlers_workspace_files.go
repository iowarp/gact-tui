package server

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// Workspace files: minimal listing of a tree on disk. Returns 200 with empty
// list if the workspace's root_path doesn't exist (emulator may not have
// the directory). This avoids surprising the TUI with errors.
func (s *Server) handleWorkspaceFiles(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ws, err := s.store.GetWorkspace(id)
	if err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	// T3: if the workspace's RootPath exists on disk as a real dir
	// AND the cfg.WalkWorkspaceFiles flag is on, walk it. Otherwise
	// return the static demo list so deterministic tests keep
	// passing without touching the filesystem.
	if s.cfg.WalkWorkspaceFiles && ws.RootPath != "" {
		if entries, ok := walkWorkspaceFiles(ws.RootPath); ok {
			writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
			return
		}
	}
	// Static demo entries — the emulator doesn't walk a filesystem
	// by default to keep behaviour deterministic across CI
	// environments. The list is intentionally richer than the three
	// placeholders we started with so the TUI's @-file picker (M6)
	// has real material to fuzzy-match.
	const ts = "2026-04-15T10:00:00Z"
	writeJSON(w, http.StatusOK, map[string]any{"entries": []gact.FileEntry{
		{Path: "main.go", Type: "file", Size: 1024, Modified: ts},
		{Path: "README.md", Type: "file", Size: 512, Modified: ts},
		{Path: "go.mod", Type: "file", Size: 180, Modified: ts},
		{Path: "go.sum", Type: "file", Size: 4096, Modified: ts},
		{Path: "Makefile", Type: "file", Size: 320, Modified: ts},
		{Path: "internal", Type: "dir"},
		{Path: "internal/server/server.go", Type: "file", Size: 2400, Modified: ts},
		{Path: "internal/server/handlers.go", Type: "file", Size: 1800, Modified: ts},
		{Path: "internal/server/router.go", Type: "file", Size: 900, Modified: ts},
		{Path: "internal/store/store.go", Type: "file", Size: 3200, Modified: ts},
		{Path: "internal/store/store_test.go", Type: "file", Size: 2100, Modified: ts},
		{Path: "internal/events/bus.go", Type: "file", Size: 1500, Modified: ts},
		{Path: "pkg/gact/messaging.go", Type: "file", Size: 3600, Modified: ts},
		{Path: "pkg/gact/catalog.go", Type: "file", Size: 2800, Modified: ts},
		{Path: "cmd/server/main.go", Type: "file", Size: 1400, Modified: ts},
		{Path: "docs/architecture.md", Type: "file", Size: 5200, Modified: ts},
		{Path: "docs/contributing.md", Type: "file", Size: 1800, Modified: ts},
	}})
}

// walkWorkspaceFiles lists the real files under root. Returns
// (nil, false) if the root isn't a readable directory — callers fall
// back to the static list. Skips dotfiles + node_modules + .git to
// stay useful; a future flag could expose the full tree.
func walkWorkspaceFiles(root string) ([]gact.FileEntry, bool) {
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return nil, false
	}
	var entries []gact.FileEntry
	walkErr := filepath.Walk(root, func(p string, fi os.FileInfo, err error) error {
		if err != nil {
			return nil // skip unreadable nodes
		}
		if p == root {
			return nil
		}
		name := fi.Name()
		if strings.HasPrefix(name, ".") || name == "node_modules" ||
			name == "vendor" || name == "target" {
			if fi.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		rel, relErr := filepath.Rel(root, p)
		if relErr != nil {
			return nil
		}
		entry := gact.FileEntry{
			Path:     filepath.ToSlash(rel),
			Modified: fi.ModTime().UTC().Format("2006-01-02T15:04:05Z"),
		}
		if fi.IsDir() {
			entry.Type = "dir"
		} else {
			entry.Type = "file"
			entry.Size = fi.Size()
		}
		entries = append(entries, entry)
		// Cap at 2000 entries — protects the TUI from 100K-file
		// monorepo floods, which would blow up the picker anyway.
		if len(entries) >= 2000 {
			return filepath.SkipAll
		}
		return nil
	})
	if walkErr != nil {
		return nil, false
	}
	return entries, true
}

func (s *Server) handleWorkspaceFileRead(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetWorkspace(id); err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	p := r.URL.Query().Get("path")
	if p == "" {
		writeError(w, http.StatusBadRequest, "invalid_query", "path required")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("// demo content of " + path.Base(p) + "\npackage main\n\nfunc main() {}\n"))
}

func (s *Server) handleRepoMap(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetWorkspace(id); err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"tree": &gact.RepoMapNode{
			Path: "/", Type: "dir", Children: []*gact.RepoMapNode{
				{Path: "main.go", Type: "file", Symbols: []string{"main", "init"}},
				{Path: "README.md", Type: "file"},
				{Path: "internal", Type: "dir", Children: []*gact.RepoMapNode{
					{Path: "internal/handler.go", Type: "file", Symbols: []string{"Handler", "ServeHTTP"}},
				}},
			},
		},
		"tokens": 1024,
	})
}
