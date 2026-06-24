package server

import (
	"encoding/base64"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §6.9 Files / context / repo_map ---------------------------------------

// In-memory context-files storage (per-session). Lives on Server because
// it's emulator-specific (not part of store, since store is the message DB).
// Would move to its own package if we built persistence later.
type contextFileSet struct {
	files map[string][]gact.ContextFile // sessionID -> files
}

func (s *Server) handleListContextFiles(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"files": s.contextFiles.get(id)})
}

type contextFileRequest struct {
	Path string `json:"path"`
	Mode string `json:"mode"`
}

type attachmentUploadRequest struct {
	File     string `json:"file"`
	Filename string `json:"filename"`
	MimeType string `json:"mime_type"`
	Mode     string `json:"mode"`
}

func (s *Server) handleAddContextFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	if s.cfg.ContextAddFailures {
		writeError(w, http.StatusBadGateway, "context_add_failed", "context add failed: workspace file index is temporarily unavailable")
		return
	}
	var req contextFileRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Path == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "path required")
		return
	}
	if req.Mode == "" {
		req.Mode = "read"
	}
	cf := gact.ContextFile{Path: req.Path, Mode: req.Mode, AddedAt: time.Now().UTC().Format(time.RFC3339)}
	if info, err := os.Stat(req.Path); err == nil && info.Mode().IsRegular() {
		cf.Size = info.Size()
		cf.LastModified = info.ModTime().UTC().Format(time.RFC3339)
		cf.Language = contextFileLanguage(req.Path)
	}
	s.contextFiles.add(id, cf)
	writeJSON(w, http.StatusCreated, cf)
}

func (s *Server) handleUploadAttachment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req attachmentUploadRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.File) == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "file required")
		return
	}
	data, err := base64.StdEncoding.DecodeString(req.File)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", "file must be valid base64")
		return
	}
	name := path.Base(strings.ReplaceAll(strings.TrimSpace(req.Filename), "\\", "/"))
	if name == "." || name == "/" || name == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "filename required")
		return
	}
	mode := req.Mode
	if mode == "" {
		mode = "read"
	}
	if mode != "read" && mode != "pin" {
		writeError(w, http.StatusBadRequest, "invalid_body", "mode must be read or pin")
		return
	}
	dir, err := os.MkdirTemp("", "gact-attachment-"+id+"-")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "attachment_error", err.Error())
		return
	}
	dest := filepath.Join(dir, name)
	if err := os.WriteFile(dest, data, 0o600); err != nil {
		writeError(w, http.StatusInternalServerError, "attachment_error", err.Error())
		return
	}
	cf := gact.ContextFile{
		Path:     dest,
		Mode:     mode,
		AddedAt:  time.Now().UTC().Format(time.RFC3339),
		Size:     int64(len(data)),
		Language: contextFileLanguage(name),
		Uploaded: true,
	}
	s.contextFiles.add(id, cf)
	s.bus.Publish(events.Event{
		Type:      "context.file.added",
		SessionID: id,
		Payload:   map[string]any{"session_id": id, "file": cf},
	})
	writeJSON(w, http.StatusOK, cf)
}

func (s *Server) handleContextFileContent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	rawPath := strings.TrimSpace(r.URL.Query().Get("path"))
	if rawPath == "" {
		writeError(w, http.StatusBadRequest, "invalid_query", "path required")
		return
	}
	var cf gact.ContextFile
	found := false
	for _, candidate := range s.contextFiles.get(id) {
		if candidate.Path == rawPath {
			cf = candidate
			found = true
			break
		}
	}
	if !found {
		writeError(w, http.StatusNotFound, "file_not_in_context", "no such file in context")
		return
	}
	data, err := os.ReadFile(cf.Path)
	if err != nil {
		writeError(w, http.StatusNotFound, "file_not_found", "context file not found on disk")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"file": gact.ContextFileContent{
			Path:        cf.Path,
			DisplayPath: cf.Path,
			Size:        int64(len(data)),
			MediaType:   contextFileMediaType(cf.Path, data),
			Encoding:    "base64",
			Data:        base64.StdEncoding.EncodeToString(data),
		},
	})
}

func (s *Server) handleDeleteContextFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req contextFileRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if !s.contextFiles.remove(id, req.Path) {
		writeError(w, http.StatusNotFound, "file_not_in_context", "no such file in context")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePatchContextFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req contextFileRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if cf, ok := s.contextFiles.update(id, req.Path, req.Mode); ok {
		writeJSON(w, http.StatusOK, cf)
		return
	}
	writeError(w, http.StatusNotFound, "file_not_in_context", "no such file in context")
}

func contextFileLanguage(filePath string) string {
	switch strings.ToLower(filepath.Ext(filePath)) {
	case ".md", ".markdown":
		return "markdown"
	case ".go":
		return "go"
	case ".py":
		return "python"
	case ".json":
		return "json"
	case ".yaml", ".yml":
		return "yaml"
	case ".txt", ".log":
		return "text"
	default:
		return ""
	}
}

func contextFileMediaType(filePath string, data []byte) string {
	if len(data) >= 8 && string(data[:8]) == "\x89PNG\r\n\x1a\n" {
		return "image/png"
	}
	switch strings.ToLower(filepath.Ext(filePath)) {
	case ".md", ".markdown":
		return "text/markdown; charset=utf-8"
	case ".json":
		return "application/json; charset=utf-8"
	case ".yaml", ".yml":
		return "application/yaml; charset=utf-8"
	case ".go":
		return "text/x-go; charset=utf-8"
	case ".py":
		return "text/x-python; charset=utf-8"
	case ".txt", ".log":
		return "text/plain; charset=utf-8"
	default:
		if utf8.Valid(data) {
			return "text/plain; charset=utf-8"
		}
		return "application/octet-stream"
	}
}
