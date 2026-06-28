package ui

// context_detail_preview.go appends content-preview rows to the context-file detail view.

import (
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

func (c *contextFilesComponent) appendPreviewRows(rows []string, cf gact.ContextFile, content gact.ContextFileContent, contentErr error) []string {
	a := c.app
	if contentErr != nil {
		return appendDetailSection(rows, "Content",
			detailField{"preview_error", contentErr.Error()},
		)
	}
	if strings.TrimSpace(content.Data) == "" {
		if !c.shouldLoadContent() {
			return appendDetailSection(rows, "Content",
				detailField{"preview", "unavailable (no active session)"},
			)
		}
		if !a.session.caps.Capabilities.XClioFilesContent {
			return appendDetailSection(rows, "Content",
				detailField{"preview", "loading..."},
				detailField{"capability", "x_clio_files_content not advertised; probing endpoint"},
			)
		}
		return appendDetailSection(rows, "Content",
			detailField{"preview", "loading..."},
		)
	}

	path := firstNonEmpty(content.Path, cf.Path)
	displayPath := firstNonEmpty(content.DisplayPath, path)
	contentFields := []detailField{
		{"path", path},
		{"display path", displayPath},
	}
	if content.Size > 0 {
		contentFields = append(contentFields, detailField{"size", fmt.Sprintf("%s (%d bytes)", textutil.HumanBytes(content.Size), content.Size)})
	}
	if strings.TrimSpace(content.MediaType) != "" {
		contentFields = append(contentFields, detailField{"media type", content.MediaType})
	}
	if strings.TrimSpace(content.Encoding) != "" {
		contentFields = append(contentFields, detailField{"encoding", content.Encoding})
	}
	if !contextFileContentIsText(content.MediaType) {
		contentFields = append(contentFields, detailField{"preview", "binary content not rendered in terminal detail"})
		return appendDetailSection(rows, "Content", contentFields...)
	}

	decoded, err := base64.StdEncoding.DecodeString(content.Data)
	if err != nil {
		contentFields = append(contentFields, detailField{"preview_error", "could not decode base64 content: " + err.Error()})
		return appendDetailSection(rows, "Content", contentFields...)
	}
	text := strings.ReplaceAll(string(decoded), "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	const maxPreviewRunes = 12000
	truncated := false
	if len([]rune(text)) > maxPreviewRunes {
		runes := []rune(text)
		text = string(runes[:maxPreviewRunes])
		truncated = true
	}
	contentFields = append(contentFields, detailField{"preview", text})
	if truncated {
		contentFields = append(contentFields, detailField{"truncated", fmt.Sprintf("shown first %d characters", maxPreviewRunes)})
	}
	return appendDetailSection(rows, "Content", contentFields...)
}

func contextFileContentIsText(mediaType string) bool {
	mediaType = strings.ToLower(strings.TrimSpace(mediaType))
	if strings.HasPrefix(mediaType, "text/") || strings.Contains(mediaType, "charset=utf-8") {
		return true
	}
	for _, prefix := range []string{
		"application/json",
		"application/javascript",
		"application/ecmascript",
		"application/xml",
		"application/yaml",
		"application/toml",
		"application/sql",
		"application/x-sh",
		"application/x-shellscript",
		"application/x-python",
		"application/x-ruby",
		"application/x-perl",
	} {
		if strings.HasPrefix(mediaType, prefix) {
			return true
		}
	}
	if strings.HasSuffix(mediaType, "+json") || strings.HasSuffix(mediaType, "+xml") {
		return true
	}
	return mediaType == ""
}
