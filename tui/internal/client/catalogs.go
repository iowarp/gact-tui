package client

import (
	"context"
	"net/http"
	"net/url"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (c *Client) ListExpertPacks(ctx context.Context, scope RuntimeScope) ([]gact.ExpertPackDefinition, error) {
	var out struct {
		ExpertPacks []gact.ExpertPackDefinition `json:"expert_packs"`
	}
	q := url.Values{}
	if scope.WorkspaceID != "" {
		q.Set("workspace_id", scope.WorkspaceID)
	}
	if err := c.do(ctx, http.MethodGet, "/v1/expert-packs"+queryString(q), nil, &out); err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	packs := append([]gact.ExpertPackDefinition(nil), out.ExpertPacks...)
	for _, pack := range packs {
		seen[pack.ID] = true
	}
	blueprints, err := c.ListAgentBlueprints(ctx, scope)
	if err != nil {
		return packs, nil
	}
	for _, bp := range blueprints {
		if bp.Kind != "pack" || seen[bp.ID] {
			continue
		}
		definitionPath := bp.DefinitionPath
		if definitionPath == "" {
			definitionPath = bp.RootPath
		}
		packs = append(packs, gact.ExpertPackDefinition{
			ID:               bp.ID,
			Version:          bp.Version,
			Title:            bp.Title,
			Description:      bp.Description,
			Scope:            bp.Scope,
			Root:             bp.Root,
			DefinitionPath:   definitionPath,
			Enabled:          bp.Enabled,
			ValidationErrors: bp.ValidationErrors,
			Defaults:         bp.Defaults,
			Metadata:         bp.Metadata,
		})
		seen[bp.ID] = true
	}
	return packs, nil
}

func (c *Client) GetExpertPack(ctx context.Context, packID string, scope RuntimeScope) (gact.ExpertPackDetail, error) {
	var out gact.ExpertPackDetail
	q := url.Values{}
	if scope.WorkspaceID != "" {
		q.Set("workspace_id", scope.WorkspaceID)
	}
	err := c.do(ctx, http.MethodGet, "/v1/expert-packs/"+url.PathEscape(packID)+queryString(q), nil, &out)
	return out, err
}

func (c *Client) ValidateExpertPack(ctx context.Context, req gact.ExpertPackValidateRequest) (gact.ExpertPackValidationResult, error) {
	var out gact.ExpertPackValidationResult
	err := c.do(ctx, http.MethodPost, "/v1/expert-packs/validate", req, &out)
	return out, err
}

func (c *Client) InstallExpertPack(ctx context.Context, req gact.ExpertPackInstallRequest) (map[string]any, error) {
	var out map[string]any
	err := c.do(ctx, http.MethodPost, "/v1/expert-packs/install", req, &out)
	return out, err
}

func (c *Client) UpdateExpertPack(ctx context.Context, packID string, scope RuntimeScope) (map[string]any, error) {
	var out map[string]any
	body := map[string]any{"scope": "workspace"}
	if scope.WorkspaceID != "" {
		body["workspace_id"] = scope.WorkspaceID
	}
	err := c.do(ctx, http.MethodPost, "/v1/expert-packs/"+url.PathEscape(packID)+"/update", body, &out)
	return out, err
}

func (c *Client) DeleteExpertPack(ctx context.Context, packID string, scope RuntimeScope) error {
	q := url.Values{}
	if scope.WorkspaceID != "" {
		q.Set("workspace_id", scope.WorkspaceID)
	}
	// Expert-pack installs are workspace-scoped from the TUI. Passing the
	// scope keeps the 0.5.3 one-engine lifecycle from deleting the wrong
	// registry entry when global/workspace packs share an id.
	q.Set("scope", "workspace")
	return c.do(ctx, http.MethodDelete, "/v1/expert-packs/"+url.PathEscape(packID)+queryString(q), nil, nil)
}

func (c *Client) GetSessionExpertPack(ctx context.Context, sessionID string) (gact.SessionExpertPackState, error) {
	var out gact.SessionExpertPackState
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+url.PathEscape(sessionID)+"/expert-pack", nil, &out)
	return out, err
}

func (c *Client) SetSessionExpertPack(ctx context.Context, sessionID string, req gact.SetSessionExpertPackRequest) (gact.SessionExpertPackState, error) {
	var out gact.SessionExpertPackState
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+url.PathEscape(sessionID)+"/expert-pack", req, &out)
	return out, err
}

func (c *Client) ListAgentBlueprints(ctx context.Context, scope RuntimeScope) ([]gact.AgentBlueprintDefinition, error) {
	var out struct {
		AgentBlueprints []gact.AgentBlueprintDefinition `json:"agent_blueprints"`
	}
	q := url.Values{}
	if scope.WorkspaceID != "" {
		q.Set("workspace_id", scope.WorkspaceID)
	}
	err := c.do(ctx, http.MethodGet, "/v1/agent-blueprints"+queryString(q), nil, &out)
	return out.AgentBlueprints, err
}

func (c *Client) GetAgentBlueprint(ctx context.Context, blueprintID string, scope RuntimeScope) (gact.AgentBlueprintDetail, error) {
	var out gact.AgentBlueprintDetail
	q := url.Values{}
	if scope.WorkspaceID != "" {
		q.Set("workspace_id", scope.WorkspaceID)
	}
	err := c.do(ctx, http.MethodGet, "/v1/agent-blueprints/"+url.PathEscape(blueprintID)+queryString(q), nil, &out)
	return out, err
}

func (c *Client) ValidateAgentBlueprint(ctx context.Context, req gact.AgentBlueprintValidateRequest) (gact.AgentBlueprintValidationResult, error) {
	var out gact.AgentBlueprintValidationResult
	err := c.do(ctx, http.MethodPost, "/v1/agent-blueprints/validate", req, &out)
	return out, err
}

func (c *Client) InstallAgentBlueprint(ctx context.Context, req gact.AgentBlueprintInstallRequest) (map[string]any, error) {
	var out map[string]any
	err := c.do(ctx, http.MethodPost, "/v1/agent-blueprints/install", req, &out)
	return out, err
}

func (c *Client) ListAgentBlueprintSources(ctx context.Context) ([]gact.AgentBlueprintSource, error) {
	var out struct {
		Sources []gact.AgentBlueprintSource `json:"sources"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/agent-blueprints/sources", nil, &out)
	return out.Sources, err
}

func (c *Client) AddAgentBlueprintSource(ctx context.Context, req gact.AgentBlueprintSourceRequest) (gact.AgentBlueprintSource, error) {
	var out struct {
		Source gact.AgentBlueprintSource `json:"source"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/agent-blueprints/sources", req, &out)
	return out.Source, err
}

func (c *Client) RefreshAgentBlueprintSource(ctx context.Context, sourceID string) (gact.AgentBlueprintSource, error) {
	var out struct {
		Source gact.AgentBlueprintSource `json:"source"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/agent-blueprints/sources/"+url.PathEscape(sourceID)+"/refresh", nil, &out)
	return out.Source, err
}

func (c *Client) DeleteAgentBlueprintSource(ctx context.Context, sourceID string) error {
	return c.do(ctx, http.MethodDelete, "/v1/agent-blueprints/sources/"+url.PathEscape(sourceID), nil, nil)
}

func (c *Client) UpdateAgentBlueprint(ctx context.Context, blueprintID string, req gact.AgentBlueprintUpdateRequest) (map[string]any, error) {
	var out map[string]any
	err := c.do(ctx, http.MethodPost, "/v1/agent-blueprints/"+url.PathEscape(blueprintID)+"/update", req, &out)
	return out, err
}

func (c *Client) DeleteAgentBlueprint(ctx context.Context, blueprintID, scope, workspaceID string) (map[string]any, error) {
	var out map[string]any
	q := url.Values{}
	if scope != "" {
		q.Set("scope", scope)
	}
	if workspaceID != "" {
		q.Set("workspace_id", workspaceID)
	}
	err := c.do(ctx, http.MethodDelete, "/v1/agent-blueprints/"+url.PathEscape(blueprintID)+queryString(q), nil, &out)
	return out, err
}

func (c *Client) EnableAgentBlueprintMCP(ctx context.Context, blueprintID, descriptorID string, req gact.AgentBlueprintMCPEnableRequest) (map[string]any, error) {
	var out map[string]any
	path := "/v1/agent-blueprints/" + url.PathEscape(blueprintID) + "/mcp/" + url.PathEscape(descriptorID) + "/enable"
	err := c.do(ctx, http.MethodPost, path, req, &out)
	return out, err
}

func (c *Client) EnableAgentBlueprintHook(ctx context.Context, blueprintID, hookID string, req gact.AgentBlueprintHookEnableRequest) (map[string]any, error) {
	var out map[string]any
	path := "/v1/agent-blueprints/" + url.PathEscape(blueprintID) + "/hooks/" + url.PathEscape(hookID) + "/enable"
	err := c.do(ctx, http.MethodPost, path, req, &out)
	return out, err
}

func (c *Client) GetSessionAgentBlueprint(ctx context.Context, sessionID string) (gact.SessionAgentBlueprintState, error) {
	var out gact.SessionAgentBlueprintState
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+url.PathEscape(sessionID)+"/agent-blueprint", nil, &out)
	return out, err
}

func (c *Client) SetSessionAgentBlueprint(ctx context.Context, sessionID string, req gact.SetSessionAgentBlueprintRequest) (gact.SessionAgentBlueprintState, error) {
	var out gact.SessionAgentBlueprintState
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+url.PathEscape(sessionID)+"/agent-blueprint", req, &out)
	return out, err
}

func (c *Client) GetSessionAgentOverlay(ctx context.Context, sessionID string) (gact.SessionAgentOverlayResponse, error) {
	var out gact.SessionAgentOverlayResponse
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+url.PathEscape(sessionID)+"/agent-overlay", nil, &out)
	return out, err
}

func (c *Client) PutSessionAgentOverlay(ctx context.Context, sessionID string, overlay map[string]any) (gact.SessionAgentOverlayResponse, error) {
	var out gact.SessionAgentOverlayResponse
	err := c.do(ctx, http.MethodPut, "/v1/sessions/"+url.PathEscape(sessionID)+"/agent-overlay", overlay, &out)
	return out, err
}
