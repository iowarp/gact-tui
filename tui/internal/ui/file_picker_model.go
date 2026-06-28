package ui

// file_picker_model.go builds the file-picker tree rows and manages selection/expansion.

import (
	"sort"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

type filePickerTreeRow struct {
	entry gact.FileEntry
	depth int
}

func (m *filePickerComponent) clampSelection() {
	if !m.open {
		return
	}
	m.sel = clampSelection(m.sel, m.activeCount())
}

func (m *filePickerComponent) activeCount() int {
	if !m.open || m.errText != "" {
		return 0
	}
	if m.treeMode && m.filter == "" {
		return len(m.treeRows())
	}
	return len(m.matches())
}

func (m *filePickerComponent) treeRows() []filePickerTreeRow {
	if !m.open || m.errText != "" {
		return nil
	}
	entries := map[string]gact.FileEntry{}
	for _, e := range m.entries {
		path := strings.Trim(strings.TrimSpace(e.Path), "/")
		if path == "" {
			continue
		}
		entry := e
		entry.Path = path
		entries[path] = entry
		parts := strings.Split(path, "/")
		for i := 1; i < len(parts); i++ {
			dir := strings.Join(parts[:i], "/")
			if _, ok := entries[dir]; !ok {
				entries[dir] = gact.FileEntry{Path: dir, Type: "dir"}
			}
		}
	}
	paths := make([]string, 0, len(entries))
	for path := range entries {
		paths = append(paths, path)
	}
	sort.Slice(paths, func(i, j int) bool {
		di := entries[paths[i]].Type == "dir"
		dj := entries[paths[j]].Type == "dir"
		parentI, nameI := filePickerParentName(paths[i])
		parentJ, nameJ := filePickerParentName(paths[j])
		if parentI == parentJ && di != dj {
			return di
		}
		if parentI == parentJ {
			return strings.ToLower(nameI) < strings.ToLower(nameJ)
		}
		return strings.ToLower(paths[i]) < strings.ToLower(paths[j])
	})
	visible := make([]filePickerTreeRow, 0, len(paths))
	for _, path := range paths {
		entry := entries[path]
		depth := strings.Count(path, "/")
		if !m.treeParentsExpanded(path) {
			continue
		}
		visible = append(visible, filePickerTreeRow{entry: entry, depth: depth})
	}
	return visible
}

func filePickerParentName(path string) (string, string) {
	if i := strings.LastIndex(path, "/"); i >= 0 {
		return path[:i], path[i+1:]
	}
	return "", path
}

func (m *filePickerComponent) treeParentsExpanded(path string) bool {
	if !m.open {
		return false
	}
	parent, _ := filePickerParentName(path)
	for parent != "" {
		if !m.treeExpanded[parent] {
			return false
		}
		parent, _ = filePickerParentName(parent)
	}
	return true
}

func (m *filePickerComponent) toggleTreeRow(index int) bool {
	if !m.open {
		return false
	}
	rows := m.treeRows()
	if index < 0 || index >= len(rows) {
		return false
	}
	row := rows[index]
	if row.entry.Type != "dir" {
		return false
	}
	if m.treeExpanded == nil {
		m.treeExpanded = map[string]bool{}
	}
	m.treeExpanded[row.entry.Path] = !m.treeExpanded[row.entry.Path]
	m.sel = clampSelection(m.sel, len(m.treeRows()))
	return true
}

func (m *filePickerComponent) selectTreeRow(index int) tea.Cmd {
	if !m.open {
		return nil
	}
	rows := m.treeRows()
	if index < 0 || index >= len(rows) {
		return nil
	}
	row := rows[index]
	if row.entry.Type == "dir" {
		m.toggleTreeRow(index)
		return nil
	}
	return m.insertEntry(row.entry)
}
