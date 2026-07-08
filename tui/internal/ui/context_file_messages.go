package ui

// contextFilesComponent: context-file list rendering and detail/preview behaviour (data lives on sessionComponent).

import (
	"context"
	"path/filepath"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// addContextFileCmd POSTs the file to /v1/sessions/{id}/context/files.
// Returns contextFileAddedMsg; on success the handler folds the new
// entry into a.session.contextFiles so the sidebar updates without a list
// refetch.
func addContextFileCmd(c *client.Client, sessionID, path, mode string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		cf, err := c.AddContextFile(ctx, sessionID, path, mode)
		return contextFileAddedMsg{sessionID: sessionID, file: cf, err: err}
	}
}

func removeContextFileCmd(c *client.Client, sessionID, path string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		err := c.RemoveContextFile(ctx, sessionID, path)
		return contextFileRemovedMsg{sessionID: sessionID, path: path, err: err}
	}
}

type contextFileAddedMsg struct {
	sessionID string
	file      gact.ContextFile
	err       error
}

type contextFileUploadedMsg struct {
	sessionID string
	localPath string
	file      gact.ContextFile
	err       error
}

type contextFileRemovedMsg struct {
	sessionID string
	path      string
	err       error
}

type contextFilesLoadedMsg struct {
	sessionID string
	files     []gact.ContextFile
}

// contextFilesComponent owns the session context-file domain: the message
// handlers that fold add/upload/remove/load responses into the sidebar and
// the detail/preview rendering for a selected file. The backing slice lives
// on a.session (the sidebar and other components read it directly); this
// component carries only behaviour plus an app back-ref for shared services.
type contextFilesComponent struct {
	app *App
}

func (c *contextFilesComponent) handleFilesLoaded(m contextFilesLoadedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if a.session.currentID() == m.sessionID {
		a.session.contextFiles = m.files
		a.sidebar.clampContextFileSelection()
	}
	return a, nil
}

func (c *contextFilesComponent) handleAdded(m contextFileAddedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if m.err != nil {
		a.setHint("add failed: " + operatorErrorMessage(m.err))
		return a, nil
	}
	// Mirror the new file into the sidebar only if it's for the
	// session we're currently showing; stale switched-session responses
	// get dropped.
	if a.session.currentID() == m.sessionID {
		a.session.mergeContextFiles([]gact.ContextFile{m.file})
	}
	a.setHint("added " + m.file.Path + " to context")
	return a, nil
}

func (c *contextFilesComponent) handleUploaded(m contextFileUploadedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if m.err != nil {
		a.setHint("upload failed: " + m.err.Error())
		return a, nil
	}
	if a.session.currentID() == m.sessionID {
		a.session.mergeContextFiles([]gact.ContextFile{m.file})
	}
	label := valuefmt.FirstNonEmpty(m.file.Path, filepath.Base(m.localPath))
	a.setHint("uploaded " + label + " to context")
	return a, nil
}

func (c *contextFilesComponent) handleRemoved(m contextFileRemovedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if m.err != nil {
		a.setHint("remove failed: " + m.err.Error())
		return a, nil
	}
	if a.session.currentID() == m.sessionID {
		filtered := a.session.contextFiles[:0]
		for _, cf := range a.session.contextFiles {
			if cf.Path != m.path {
				filtered = append(filtered, cf)
			}
		}
		a.session.contextFiles = filtered
		a.sidebar.clampContextFileSelection()
		if a.detail.visible && a.detail.ref != nil && a.detail.ref.messageID == "context" && a.detail.ref.partID == m.path {
			a.detail.close()
		}
	}
	a.setHint("removed " + m.path + " from context")
	return a, nil
}
