package ui

// detail_file_modes.go defines detail-modal file view modes (upload/external/preview) and their tab switching.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
)

type fileDetailMode struct {
	id    string
	label string
	text  string
}

func (m *detailViewModal) fileUploadAvailable() bool {
	return m.ref != nil &&
		m.ref.messageID == "files" &&
		m.ref.partID != "root" &&
		strings.TrimSpace(m.ref.localPath) != "" &&
		m.app.session.caps.Capabilities.AttachmentsUpload
}

func (m *detailViewModal) fileExternalAvailable() bool {
	return m.ref != nil &&
		m.ref.messageID == "files" &&
		strings.TrimSpace(m.ref.localPath) != ""
}

func (m *detailViewModal) fileHasModes() bool {
	return m.ref != nil && len(m.ref.fileModes) > 1
}

func (m *detailViewModal) cycleFileMode(delta int) bool {
	if m.ref == nil || len(m.ref.fileModes) <= 1 {
		return false
	}
	idx := m.fileModeIndex()
	next := (idx + delta) % len(m.ref.fileModes)
	if next < 0 {
		next += len(m.ref.fileModes)
	}
	m.setFileMode(m.ref.fileModes[next].id)
	return true
}

func (m *detailViewModal) fileModeIndex() int {
	if m.ref == nil || len(m.ref.fileModes) == 0 {
		return 0
	}
	for i, mode := range m.ref.fileModes {
		if mode.id == m.ref.fileMode {
			return i
		}
	}
	return 0
}

func (m *detailViewModal) setFileMode(id string) {
	if m.ref == nil {
		return
	}
	for _, mode := range m.ref.fileModes {
		if mode.id != id {
			continue
		}
		m.ref.fileMode = mode.id
		m.ref.fullText = mode.text
		m.scroll = 0
		m.wrap = detailWrapCache{}
		return
	}
}

func (m *detailViewModal) fileTabs() []menuTab {
	if m.ref == nil || len(m.ref.fileModes) <= 1 {
		return nil
	}
	tabs := make([]menuTab, 0, len(m.ref.fileModes))
	for _, mode := range m.ref.fileModes {
		mode := mode
		tabs = append(tabs, menuTab{
			id:     "file-detail:" + mode.id,
			label:  mode.label,
			active: mode.id == m.ref.fileMode,
			action: func(app *App) tea.Cmd {
				app.detail.setFileMode(mode.id)
				return nil
			},
		})
	}
	return tabs
}
