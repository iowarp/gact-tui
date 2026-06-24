package ui

// file_viewer_detail.go opens the file-viewer detail modal for a tree entry or the root.

import (
	"path/filepath"
	"strings"
)

func (c *fileViewerComponent) openDetail(entry fileTreeEntry) {
	fullPath := filepath.Join(c.fileViewerRoot, filepath.FromSlash(entry.Path))
	modes := c.fileDetailModes(entry, fullPath)
	active := ""
	fullText := ""
	if len(modes) > 0 {
		active = modes[0].id
		fullText = modes[0].text
	}
	c.app.detail.open(&bulkyPartRef{
		messageID: "files",
		partID:    entry.Path,
		title:     "File · " + entry.Path,
		fullText:  fullText,
		localPath: fullPath,
		fileModes: modes,
		fileMode:  active,
	})
}

func (c *fileViewerComponent) openRootDetail() {
	mode := strings.TrimSpace(c.fileTreeRootMode)
	if mode == "" {
		mode = "folder"
	}
	status := "available"
	if strings.TrimSpace(c.fileTreeErr) != "" {
		status = "unavailable"
	}
	rows := []string{
		"root: " + c.fileViewerRoot,
		"mode: " + mode,
		"status: " + status,
	}
	if strings.TrimSpace(c.fileTreeErr) != "" {
		rows = append(rows,
			"",
			"The file browser cannot read this folder right now.",
			"",
			"details: "+c.fileTreeErr,
		)
	}
	c.app.detail.open(&bulkyPartRef{
		messageID: "files",
		partID:    "root",
		title:     "Files · " + fileViewerUnavailableTitle(mode),
		fullText:  strings.Join(rows, "\n"),
		localPath: c.fileViewerRoot,
	})
}
