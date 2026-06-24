package ui

// detail_external_open.go opens local files externally from the detail modal and handles the result message.

import (
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	tea "charm.land/bubbletea/v2"
)

type localFileExternalOpenMsg struct {
	path string
	err  error
}

func (md *detailViewModal) handleLocalFileExternalOpen(m localFileExternalOpenMsg) (tea.Model, tea.Cmd) {
	a := md.app
	if m.err != nil {
		a.setHint("open failed: " + m.err.Error())
		return a, scheduleHintExpire(a.transientHint)
	}
	a.setHint("opened " + filepath.Base(m.path) + " externally")
	return a, scheduleHintExpire(a.transientHint)
}

func (m *detailViewModal) openFileExternally() tea.Cmd {
	a := m.app
	if m.ref == nil || strings.TrimSpace(m.ref.localPath) == "" {
		a.setHint("no local file to open")
		return scheduleHintExpire(a.transientHint)
	}
	path := m.ref.localPath
	a.setHint("opening " + filepath.Base(path) + " externally")
	return tea.Batch(scheduleHintExpire(a.transientHint), func() tea.Msg {
		return localFileExternalOpenMsg{path: path, err: openLocalFileExternally(path)}
	})
}

func openLocalFileExternally(path string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", path).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", "", path).Start()
	default:
		return exec.Command("xdg-open", path).Start()
	}
}
