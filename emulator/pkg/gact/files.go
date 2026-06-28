package gact

// ContextFile is a file pinned into a session's context (SPEC §6.9).
type ContextFile struct {
	Path         string `json:"path"`
	Mode         string `json:"mode"` // "edit"|"read"|"pin"
	AddedAt      string `json:"added_at"`
	LastModified string `json:"last_modified,omitempty"`
	Size         int64  `json:"size,omitempty"`
	Language     string `json:"language,omitempty"`
	Uploaded     bool   `json:"uploaded,omitempty"`
}

type ContextFileContent struct {
	Path        string `json:"path"`
	DisplayPath string `json:"display_path,omitempty"`
	Size        int64  `json:"size,omitempty"`
	MediaType   string `json:"media_type,omitempty"`
	Encoding    string `json:"encoding,omitempty"`
	Data        string `json:"data,omitempty"`
}

// FileEntry is one entry from a directory listing.
type FileEntry struct {
	Path     string `json:"path"`
	Type     string `json:"type"` // "file" | "dir"
	Size     int64  `json:"size,omitempty"`
	Modified string `json:"modified,omitempty"`
}

// RepoMapNode is one node in the repo map tree.
type RepoMapNode struct {
	Path     string         `json:"path"`
	Type     string         `json:"type"` // "file" | "dir"
	Children []*RepoMapNode `json:"children,omitempty"`
	// Symbols is a brief code outline if available (e.g. tree-sitter).
	Symbols []string `json:"symbols,omitempty"`
}

// FileDiff is a proposed file change (also a Part type via Part.Path/Before/After).
type FileDiff struct {
	Path     string  `json:"path"`
	Before   *string `json:"before"`
	After    *string `json:"after"`
	Language string  `json:"language,omitempty"`
	Applied  bool    `json:"applied"`
}
