package client

import (
	"context"
	"net/http"
	"net/url"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// ListPrompts fetches CLIO prompt registry definitions. Backends advertise
// this vendor surface with capabilities.x_clio_prompt_registry.
func (c *Client) ListPrompts(ctx context.Context) ([]gact.PromptDefinition, error) {
	return c.ListPromptsScoped(ctx, RuntimeScope{})
}

func (c *Client) ListPromptsScoped(ctx context.Context, scope RuntimeScope) ([]gact.PromptDefinition, error) {
	var out struct {
		Prompts []gact.PromptDefinition `json:"prompts"`
	}
	q := url.Values{}
	scope.appendTo(q)
	err := c.do(ctx, http.MethodGet, "/v1/prompts"+queryString(q), nil, &out)
	return out.Prompts, err
}

// GetPrompt resolves one prompt/profile to the effective text and provenance.
func (c *Client) GetPrompt(ctx context.Context, promptID, profile string) (gact.ResolvedPrompt, error) {
	return c.GetPromptScoped(ctx, promptID, profile, RuntimeScope{})
}

func (c *Client) GetPromptScoped(ctx context.Context, promptID, profile string, scope RuntimeScope) (gact.ResolvedPrompt, error) {
	path := "/v1/prompts/" + url.PathEscape(promptID)
	q := url.Values{}
	if profile != "" {
		q.Set("profile", profile)
	}
	scope.appendTo(q)
	path += queryString(q)
	var out struct {
		Prompt gact.ResolvedPrompt `json:"prompt"`
	}
	err := c.do(ctx, http.MethodGet, path, nil, &out)
	return out.Prompt, err
}

// SavePrompt writes a profile override through the CLIO prompt registry.
func (c *Client) SavePrompt(ctx context.Context, promptID string, req gact.PromptSaveRequest) (gact.PromptDefinition, error) {
	return c.SavePromptScoped(ctx, promptID, req, RuntimeScope{})
}

func (c *Client) SavePromptScoped(ctx context.Context, promptID string, req gact.PromptSaveRequest, scope RuntimeScope) (gact.PromptDefinition, error) {
	var out struct {
		Prompt gact.PromptDefinition `json:"prompt"`
	}
	q := url.Values{}
	scope.appendTo(q)
	err := c.do(ctx, http.MethodPut, "/v1/prompts/"+url.PathEscape(promptID)+queryString(q), req, &out)
	return out.Prompt, err
}

func (c *Client) RenderPrompt(ctx context.Context, promptID string, req gact.PromptRenderRequest) (gact.ResolvedPrompt, error) {
	var out struct {
		Prompt gact.ResolvedPrompt `json:"prompt"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/prompts/"+url.PathEscape(promptID)+"/render", req, &out)
	return out.Prompt, err
}

func (c *Client) RenderPromptScoped(ctx context.Context, promptID, profile string, scope RuntimeScope) (gact.ResolvedPrompt, error) {
	return c.RenderPrompt(ctx, promptID, gact.PromptRenderRequest{
		Profile:     profile,
		SessionID:   scope.SessionID,
		WorkspaceID: scope.WorkspaceID,
	})
}

func (c *Client) ValidatePrompt(ctx context.Context, promptID string, req gact.PromptValidateRequest) (gact.PromptValidationResult, error) {
	var out gact.PromptValidationResult
	err := c.do(ctx, http.MethodPost, "/v1/prompts/"+url.PathEscape(promptID)+"/validate", req, &out)
	return out, err
}

func (c *Client) ValidatePromptScoped(ctx context.Context, promptID, profile, text string, scope RuntimeScope) (gact.PromptValidationResult, error) {
	return c.ValidatePrompt(ctx, promptID, gact.PromptValidateRequest{
		Profile:     profile,
		Text:        text,
		SessionID:   scope.SessionID,
		WorkspaceID: scope.WorkspaceID,
	})
}

func (c *Client) ReloadPrompts(ctx context.Context, scope RuntimeScope) (gact.PromptReloadResult, error) {
	var out struct {
		Reload gact.PromptReloadResult `json:"reload"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/prompts/reload", map[string]any{
		"session_id":   scope.SessionID,
		"workspace_id": scope.WorkspaceID,
	}, &out)
	return out.Reload, err
}
