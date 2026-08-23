package ui

// context_detail.go opens the context-file detail modal and builds its rows from file metadata/content.

import (
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *contextFilesComponent) openDetail(cf gact.ContextFile) tea.Cmd {
	a := c.app
	rows := c.detailRows(cf)
	a.detail.open(&bulkyPartRef{
		messageID: "context",
		partID:    cf.Path,
		title:     "Context file · " + shortContextPath(cf.Path),
		fullText:  strings.Join(rows, "\n"),
	})
	if c.shouldLoadContent() {
		return loadContextFileContentCmd(a.c, a.session.currentID(), cf.Path)
	}
	return nil
}

type contextFileContentLoadedMsg struct {
	sessionID string
	path      string
	content   gact.ContextFileContent
	err       error
}

func (c *contextFilesComponent) handleContentLoaded(m contextFileContentLoadedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if a.session.currentID() != m.sessionID {
		return a, nil
	}
	if !a.detail.visible || a.detail.ref == nil || a.detail.ref.messageID != "context" || a.detail.ref.partID != m.path {
		return a, nil
	}
	cf, ok := c.byPath(m.path)
	if !ok {
		return a, nil
	}
	a.detail.ref.fullText = strings.Join(c.detailRowsWithContent(cf, m.content, m.err), "\n")
	a.detail.scroll = 0
	return a, nil
}

func (c *contextFilesComponent) shouldLoadContent() bool {
	return c.app.session.currentID() != ""
}

func (c *contextFilesComponent) detailRows(cf gact.ContextFile) []string {
	return c.detailRowsWithContent(cf, gact.ContextFileContent{}, nil)
}

func (c *contextFilesComponent) detailRowsWithContent(cf gact.ContextFile, content gact.ContextFileContent, contentErr error) []string {
	a := c.app
	fileFields := []detailField{
		{"path", cf.Path},
		{"mode", contextModeDescription(cf.Mode)},
		{"status", contextFileStatusDescription(cf)},
		{"source", contextFileSourceDescription(cf)},
		{"session use", contextFileSessionUseDescription(cf)},
	}
	if cf.Size > 0 {
		fileFields = append(fileFields, detailField{"size", fmt.Sprintf("%s (%d bytes)", textutil.HumanBytes(cf.Size), cf.Size)})
	}
	if strings.TrimSpace(cf.Language) != "" {
		fileFields = append(fileFields, detailField{"language", cf.Language})
	}
	if strings.TrimSpace(cf.AddedAt) != "" {
		fileFields = append(fileFields, detailField{"added", cf.AddedAt})
	}
	if strings.TrimSpace(cf.LastModified) != "" {
		fileFields = append(fileFields, detailField{"last modified", cf.LastModified})
	}
	rows := appendDetailSection(nil, "File", fileFields...)
	rows = c.appendPreviewRows(rows, cf, content, contentErr)
	if a.session.selected >= 0 && a.session.selected < len(a.session.sessions) {
		s := a.session.sessions[a.session.selected]
		sessionFields := []detailField{
			{"title", orPlaceholder(s.Title, a.localizer.t(msgSidebarUntitled, nil))},
			{"id", s.ID},
			{"status", orPlaceholder(s.Status, "unknown")},
		}
		if s.WorkspaceID != "" {
			sessionFields = append(sessionFields, detailField{"workspace", s.WorkspaceID})
		}
		if s.ParentSessionID != "" {
			sessionFields = append(sessionFields, detailField{"parent session", s.ParentSessionID})
		}
		if s.Agent.ID != "" {
			sessionFields = append(sessionFields, detailField{"agent", s.Agent.ID})
		}
		if !s.UpdatedAt.IsZero() || !s.CreatedAt.IsZero() {
			activity := sessionActivityTime(s)
			sessionFields = append(sessionFields, detailField{"latest activity", activity.UTC().Format(time.RFC3339)})
		}
		if s.MessageCount > 0 {
			sessionFields = append(sessionFields, detailField{"messages", fmt.Sprintf("%d", s.MessageCount)})
		}
		rows = appendDetailSection(rows, "Session", sessionFields...)
	}
	rows = appendDetailSection(rows, "Actions",
		detailField{"Enter / click", "open this context detail and load a content preview when " + brandName() + " exposes it"},
		detailField{"o", "add another context file"},
		detailField{"Esc / Ctrl+E", "close detail"},
	)
	return rows
}

func (c *contextFilesComponent) byPath(path string) (gact.ContextFile, bool) {
	for _, cf := range c.app.session.contextFiles {
		if cf.Path == path {
			return cf, true
		}
	}
	return gact.ContextFile{}, false
}

func contextModeDescription(mode string) string {
	switch mode {
	case "read":
		return "read (backend may inspect contents)"
	case "edit":
		return "edit (backend may propose changes)"
	case "pin":
		return "pin (always retained in context)"
	case "":
		return "unknown"
	default:
		return mode
	}
}

func contextFileStatusDescription(cf gact.ContextFile) string {
	mode := contextModeDescription(cf.Mode)
	if cf.Uploaded {
		return brandName() + " uploaded attachment attached to selected session as " + mode
	}
	return "workspace file attached to selected session as " + mode
}

func contextFileSourceDescription(cf gact.ContextFile) string {
	if cf.Uploaded {
		return "uploaded attachment (created through attachments_upload, not workspace browsing)"
	}
	return "workspace context file (path resolved by " + brandName() + " workspace context)"
}

func contextFileSessionUseDescription(cf gact.ContextFile) string {
	mode := contextModeDescription(cf.Mode)
	if cf.Uploaded {
		return "copied into selected " + brandName() + " session context as " + mode
	}
	return "referenced by selected " + brandName() + " session context as " + mode
}
