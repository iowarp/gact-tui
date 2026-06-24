package ui

// file_viewer_tree.go scans the filesystem tree and manages file-viewer entry selection/expansion.

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type fileTreeEntry struct {
	Path  string
	Name  string
	Dir   bool
	Depth int
	Size  int64
}

func scanFileTreeDir(root string, rel string, depth int) ([]fileTreeEntry, error) {
	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", root)
	}
	abs := root
	if rel != "" {
		abs = filepath.Join(root, filepath.FromSlash(rel))
	}
	children, err := os.ReadDir(abs)
	if err != nil {
		return nil, err
	}
	sort.Slice(children, func(i, j int) bool {
		if children[i].IsDir() != children[j].IsDir() {
			return children[i].IsDir()
		}
		return strings.ToLower(children[i].Name()) < strings.ToLower(children[j].Name())
	})
	entries := make([]fileTreeEntry, 0, len(children))
	for _, child := range children {
		name := child.Name()
		childRel := name
		if rel != "" {
			childRel = filepath.ToSlash(filepath.Join(rel, name))
		}
		entry := fileTreeEntry{
			Path:  childRel,
			Name:  name,
			Dir:   child.IsDir(),
			Depth: depth,
		}
		if info, err := child.Info(); err == nil {
			entry.Size = info.Size()
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

func scanFileTreeExpanded(root string, rel string, depth int, expanded map[string]bool) ([]fileTreeEntry, error) {
	entries, err := scanFileTreeDir(root, rel, depth)
	if err != nil {
		return nil, err
	}
	out := make([]fileTreeEntry, 0, len(entries))
	for _, entry := range entries {
		out = append(out, entry)
		if !entry.Dir || !expanded[entry.Path] {
			continue
		}
		children, err := scanFileTreeExpanded(root, entry.Path, entry.Depth+1, expanded)
		if err != nil {
			return out, err
		}
		out = append(out, children...)
	}
	return out, nil
}

func (c *fileViewerComponent) selectedPath() string {
	visible := c.visibleEntries()
	if c.fileTreeSel < 0 || c.fileTreeSel >= len(visible) {
		return ""
	}
	return visible[c.fileTreeSel].Path
}

func (c *fileViewerComponent) restoreSelection(path string) {
	if path == "" {
		return
	}
	visible := c.visibleEntries()
	for i, entry := range visible {
		if entry.Path == path {
			c.fileTreeSel = i
			return
		}
	}
}

func (c *fileViewerComponent) visibleEntries() []fileTreeEntry {
	visible := make([]fileTreeEntry, 0, len(c.fileTreeEntries))
	parentExpanded := map[int]bool{-1: true}
	for _, entry := range c.fileTreeEntries {
		parentDepth := entry.Depth - 1
		if !parentExpanded[parentDepth] {
			parentExpanded[entry.Depth] = false
			continue
		}
		visible = append(visible, entry)
		if entry.Dir {
			parentExpanded[entry.Depth] = c.fileTreeExpanded[entry.Path]
		}
	}
	return visible
}

// setTreeSel records the file-tree selection cursor. The seam for cross-domain
// callers (sidebar key navigation) that previously poked fileTreeSel directly;
// callers stay responsible for range validity, matching the former inline
// writes.
func (c *fileViewerComponent) setTreeSel(index int) {
	c.fileTreeSel = index
}

func (c *fileViewerComponent) clampSelection() {
	visible := c.visibleEntries()
	if len(visible) == 0 {
		c.fileTreeSel = 0
		return
	}
	c.fileTreeSel = clampSelection(c.fileTreeSel, len(visible))
}

func (c *fileViewerComponent) loadChildren(entry fileTreeEntry) {
	if !entry.Dir || c.childrenLoaded(entry.Path) {
		return
	}
	children, err := scanFileTreeDir(c.fileViewerRoot, entry.Path, entry.Depth+1)
	if err != nil {
		c.fileTreeErr = err.Error()
		return
	}
	insertAt := -1
	for i, existing := range c.fileTreeEntries {
		if existing.Path == entry.Path {
			insertAt = i + 1
			break
		}
	}
	if insertAt < 0 {
		return
	}
	next := make([]fileTreeEntry, 0, len(c.fileTreeEntries)+len(children))
	next = append(next, c.fileTreeEntries[:insertAt]...)
	next = append(next, children...)
	next = append(next, c.fileTreeEntries[insertAt:]...)
	c.fileTreeEntries = next
}

func (c *fileViewerComponent) childrenLoaded(path string) bool {
	for _, entry := range c.fileTreeEntries {
		if entry.Path == path {
			continue
		}
		if filepath.ToSlash(filepath.Dir(entry.Path)) == path {
			return true
		}
	}
	return false
}
