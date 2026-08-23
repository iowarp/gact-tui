package ui

// chrome_header_labels.go formats the header's backend/workspace/model/agent/routing labels.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (c *chromeComponent) headerBackendLabel() string {
	if label := strings.TrimSpace(c.app.BackendLabel); label != "" {
		return label
	}
	return c.app.BackendURL
}

func (c *chromeComponent) headerWorkspaceLabel() string {
	if len(c.app.session.workspaces) == 0 {
		return ""
	}
	for _, w := range c.app.session.workspaces {
		if w.ID == c.app.session.wsID {
			return workspaceHeaderLabelPlain(w)
		}
	}
	return workspaceHeaderLabelPlain(c.app.session.workspaces[0])
}

func (c *chromeComponent) headerModelLabel(s gact.Session) string {
	// Historical sessions may not have a persisted model ref. In that case,
	// avoid attributing the current backend model to old trace data.
	if s.MessageCount > 0 && s.Model.ModelID == "" {
		return ""
	}
	if c.app.lmProviderInfo != nil && c.app.lmProviderInfo.Configured && c.app.lmProviderInfo.Model != "" {
		return compactModelLabel(c.app.lmProviderInfo.Provider, c.app.lmProviderInfo.Model)
	}
	if s.Model.ModelID == "" {
		return ""
	}
	return compactModelLabel(s.Model.ProviderID, s.Model.ModelID)
}

func compactModelLabel(provider, model string) string {
	model = strings.TrimSpace(model)
	if model == "" {
		return ""
	}
	provider = strings.TrimSpace(provider)
	if provider == "" || strings.HasPrefix(model, provider+"/") {
		return model
	}
	return provider + "/" + model
}

func (c *chromeComponent) headerAgentLabel(agent gact.AgentRef) string {
	id := strings.TrimSpace(agent.ID)
	if id == "" || id == "default" || id == "main" {
		return ""
	}
	if mode := strings.TrimSpace(agent.Mode); mode != "" {
		id += " (" + mode + ")"
	}
	return c.app.localizer.t(msgChromeAgent, map[string]string{"id": id})
}

func (c *chromeComponent) headerRoutingLabel(s gact.Session) string {
	mode := strings.TrimSpace(s.RoutingMode)
	if mode == "" {
		mode = strings.TrimSpace(s.Mode)
	}
	if mode == "" {
		return ""
	}
	return c.app.localizer.t(msgChromeRouting, map[string]string{"value": mode})
}
