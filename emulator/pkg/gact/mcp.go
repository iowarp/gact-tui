package gact

// McpServer is one connected MCP server (SPEC §6.7).
type McpServer struct {
	ID                   string          `json:"id"`
	Name                 string          `json:"name"`
	Version              string          `json:"version,omitempty"`
	Transport            string          `json:"transport"` // "stdio" | "http"
	ProtocolVersion      string          `json:"protocol_version"`
	Status               string          `json:"status"` // connecting|ready|error|disconnected
	ServerInfo           map[string]any  `json:"server_info,omitempty"`
	Instructions         string          `json:"instructions,omitempty"`
	DeclaredCapabilities McpCapabilities `json:"declared_capabilities"`
	LastError            string          `json:"last_error,omitempty"`
}

// McpCapabilities describes which MCP capabilities a server declares.
type McpCapabilities struct {
	Tools     bool                    `json:"tools"`
	Resources *McpResourcesCapability `json:"resources,omitempty"`
	Prompts   *McpPromptsCapability   `json:"prompts,omitempty"`
	Logging   bool                    `json:"logging"`
}

type McpResourcesCapability struct {
	Subscribe   bool `json:"subscribe"`
	ListChanged bool `json:"list_changed"`
}

type McpPromptsCapability struct {
	ListChanged bool `json:"list_changed"`
}

// McpResource is a resource exposed by an MCP server (SPEC §6.7).
type McpResource struct {
	ServerID    string         `json:"server_id"`
	URI         string         `json:"uri"`
	Name        string         `json:"name,omitempty"`
	Title       string         `json:"title,omitempty"`
	Description string         `json:"description,omitempty"`
	MimeType    string         `json:"mime_type,omitempty"`
	Size        int64          `json:"size,omitempty"`
	Annotations map[string]any `json:"annotations,omitempty"`
}

// McpResourceTemplate is a parameterized resource URI template.
type McpResourceTemplate struct {
	ServerID    string `json:"server_id"`
	URITemplate string `json:"uri_template"`
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mime_type,omitempty"`
}

// McpContent is the content returned from resources/read.
type McpContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mime_type,omitempty"`
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"` // base64
}

// McpPrompt is a templated prompt exposed by a server (SPEC §6.7).
type McpPrompt struct {
	ServerID    string         `json:"server_id"`
	Name        string         `json:"name"`
	Title       string         `json:"title,omitempty"`
	Description string         `json:"description,omitempty"`
	Arguments   []McpPromptArg `json:"arguments,omitempty"`
}

type McpPromptArg struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Required    bool   `json:"required,omitempty"`
}

// McpMessage is one message returned from prompts/get.
type McpMessage struct {
	Role    string `json:"role"`
	Content []Part `json:"content"`
}
