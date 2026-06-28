package ui

// file_viewer_upload.go uploads the current file-viewer detail file as a session attachment.

import (
	"context"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (c *fileViewerComponent) uploadCurrentDetail() tea.Cmd {
	a := c.app
	if a.detail.ref == nil || a.detail.ref.messageID != "files" || strings.TrimSpace(a.detail.ref.localPath) == "" {
		a.setHint("upload unavailable for this detail")
		return scheduleHintExpire(a.transientHint)
	}
	sid := a.session.currentID()
	if sid == "" {
		a.setHint("no active session to upload into")
		return scheduleHintExpire(a.transientHint)
	}
	if !a.session.caps.Capabilities.AttachmentsUpload {
		a.setHint("attachment upload unsupported by this backend")
		return scheduleHintExpire(a.transientHint)
	}
	path := a.detail.ref.localPath
	a.setHint("uploading " + filepath.Base(path) + "...")
	return tea.Batch(scheduleHintExpire(a.transientHint), uploadAttachmentFileCmd(a.c, sid, path, "read"))
}

func uploadAttachmentFileCmd(c *client.Client, sessionID, path, mode string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		data, err := os.ReadFile(path)
		if err != nil {
			return contextFileUploadedMsg{sessionID: sessionID, localPath: path, err: err}
		}
		mimeType := mime.TypeByExtension(filepath.Ext(path))
		if mimeType == "" && len(data) > 0 {
			mimeType = http.DetectContentType(data[:minInt(len(data), 512)])
		}
		cf, err := c.UploadAttachment(ctx, sessionID, filepath.Base(path), mimeType, mode, data)
		return contextFileUploadedMsg{sessionID: sessionID, localPath: path, file: cf, err: err}
	}
}
