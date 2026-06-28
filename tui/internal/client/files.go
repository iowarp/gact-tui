package client

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §6.9 context files ----------------------------------------------------

// ListContextFiles returns the files currently in a session's context.
func (c *Client) ListContextFiles(ctx context.Context, sessionID string) ([]gact.ContextFile, error) {
	var out struct {
		Files []gact.ContextFile `json:"files"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+sessionID+"/context/files", nil, &out)
	return out.Files, err
}

// AddContextFile pins a file into a session's context. Mode is one of
// "edit" | "read" | "pin"; defaults server-side to "read" if blank.
func (c *Client) AddContextFile(ctx context.Context, sessionID, path, mode string) (gact.ContextFile, error) {
	var out gact.ContextFile
	body := map[string]any{"path": path, "mode": mode}
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+sessionID+"/context/files", body, &out)
	return out, err
}

// RemoveContextFile drops a file from a session's context.
func (c *Client) RemoveContextFile(ctx context.Context, sessionID, path string) error {
	body := map[string]any{"path": path}
	return c.do(ctx, http.MethodDelete, "/v1/sessions/"+sessionID+"/context/files", body, nil)
}

func (c *Client) ContextFileContent(ctx context.Context, sessionID, path string) (gact.ContextFileContent, error) {
	var out struct {
		File gact.ContextFileContent `json:"file"`
	}
	q := url.Values{}
	q.Set("path", path)
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+sessionID+"/context/files/content?"+q.Encode(), nil, &out)
	return out.File, err
}

func (c *Client) UploadAttachment(ctx context.Context, sessionID, filename, mimeType, mode string, data []byte) (gact.ContextFile, error) {
	var out gact.ContextFile
	body := map[string]any{
		"file":     base64.StdEncoding.EncodeToString(data),
		"filename": filename,
	}
	if mimeType != "" {
		body["mime_type"] = mimeType
	}
	if mode != "" {
		body["mode"] = mode
	}
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+sessionID+"/attachments", body, &out)
	return out, err
}

// ListWorkspaceFiles returns the workspace-rooted file tree. The server
// returns a flat list of FileEntry (some may be type="dir"). Used by the
// M6 @-picker to let users reference files by path.
func (c *Client) ListWorkspaceFiles(ctx context.Context, workspaceID string) ([]gact.FileEntry, error) {
	var out struct {
		Entries []gact.FileEntry `json:"entries"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/workspaces/"+workspaceID+"/files", nil, &out)
	return out.Entries, err
}

// RepoMapResponse is the full response of /v1/workspaces/{id}/repo_map
// — the tree plus the backend's estimate of how many tokens
// it would cost to ship to the model as context.
type RepoMapResponse struct {
	Tree   *gact.RepoMapNode `json:"tree"`
	Tokens int               `json:"tokens"`
}

// WorkspaceRepoMap fetches the workspace's repo map — a tree of files
// and (optionally) symbol outlines per file. Used by both the @-picker
// and the CLI repo-map subcommand.
func (c *Client) WorkspaceRepoMap(ctx context.Context, workspaceID string) (RepoMapResponse, error) {
	var out RepoMapResponse
	err := c.do(ctx, http.MethodGet, "/v1/workspaces/"+workspaceID+"/repo_map", nil, &out)
	return out, err
}

// ReadWorkspaceFile fetches the raw bytes of a workspace-rooted file
// via /v1/workspaces/{id}/files/read?path=... Used for the M6 file
// preview and for shell scripts that want to pipe a file's content
// without round-tripping through the local filesystem.
func (c *Client) ReadWorkspaceFile(ctx context.Context, workspaceID, path string) ([]byte, error) {
	req, err := c.req(ctx, http.MethodGet,
		"/v1/workspaces/"+workspaceID+"/files/read?path="+url.QueryEscape(path), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var e gact.Error
		_ = json.NewDecoder(resp.Body).Decode(&e)
		return nil, &Error{
			Status:  resp.StatusCode,
			Code:    e.Error.Code,
			Message: e.Error.Message,
		}
	}
	return io.ReadAll(resp.Body)
}
