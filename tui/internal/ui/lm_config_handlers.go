package ui

// lm_config_handlers.go handles LM-config fetched/authed/saved messages and opens the current preset.

import (
	"errors"
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// handleFetched applies the backend's response to
// GET /v1/providers/lm.
func (c *lmConfigComponent) handleFetched(m lmConfigFetchedMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		if c.open {
			c.app.settings.showError("provider config unavailable: " + m.err.Error())
			c.reset()
		}
		return c.app, nil
	}
	if m.info == nil {
		if c.open {
			c.app.settings.showError("this backend does not support runtime LM provider config (/v1/providers/lm)")
			c.reset()
		}
		return c.app, nil
	}
	previousProviderState := ""
	if c.app.lmProviderInfo != nil {
		previousProviderState = strings.TrimSpace(c.app.lmProviderInfo.State)
	}
	// Cache for the header chip (#363) so renderHeader can show the
	// active model without poking lmConfig (which is only populated
	// when the modal is open).
	c.app.lmProviderInfo = m.info
	if !c.open && previousProviderState == "configuring" {
		switch m.info.State {
		case "ready":
			if m.info.Configured {
				c.app.session.clearLocalModelRefs()
				c.app.setHint("LM configured: " +
					m.info.Provider + "/" + m.info.Model)
				c.app.session.appendModelSwapMarker(m.info)
				cmds := []tea.Cmd{scheduleHintExpire(c.app.transientHint)}
				if c.app.session.wsID != "" {
					cmds = append(cmds, reloadSessionsCmd(c.app.c, c.app.session.wsID))
				}
				return c.app, tea.Batch(cmds...)
			}
		case "error":
			msg := lmConfigProviderError(m.info)
			c.app.setHint(msg)
			return c.app, scheduleHintExpire(c.app.transientHint)
		case "configuring":
			return c.app, lmConfigPollCmd(c.app.c)
		}
	}
	if c.open {
		// Modal was opened by the user (Settings -> Change provider...)
		// or already showing, so populate it with the fresh info.
		c.info = m.info
		if c.saving {
			switch m.info.State {
			case "ready":
				if m.info.Configured {
					c.saving = false
					c.app.session.clearLocalModelRefs()
					c.reset()
					c.app.setHint("LM configured: " +
						m.info.Provider + "/" + m.info.Model)
					c.app.session.appendModelSwapMarker(m.info)
					cmds := []tea.Cmd{scheduleHintExpire(c.app.transientHint)}
					if c.app.session.wsID != "" {
						cmds = append(cmds, reloadSessionsCmd(c.app.c, c.app.session.wsID))
					}
					return c.app, tea.Batch(cmds...)
				}
			case "error":
				c.saving = false
				c.err = errors.New(lmConfigProviderError(m.info))
				return c.app, nil
			case "configuring":
				return c.app, lmConfigPollCmd(c.app.c)
			}
		}
		return c.app, c.openWithCurrentPreset()
	}
	if !m.info.Configured {
		c.reset()
		c.open = true
		c.info = m.info
		return c.app, c.openWithCurrentPreset()
	}
	return c.app, nil
}

func (c *lmConfigComponent) handleAuthed(m lmConfigAuthedMsg) (tea.Model, tea.Cmd) {
	if !c.open {
		return c.app, nil
	}
	c.authenticating = false
	if m.err != nil {
		c.authMessage = "auth failed: " + operatorErrorMessage(m.err)
		return c.app, nil
	}
	if m.resp.IsAuthenticated {
		c.authMessage = "ALCF Globus token ready"
		if c.info != nil {
			for i := range c.info.Presets {
				if c.info.Presets[i].ID == m.providerID {
					c.info.Presets[i].Status = "ready"
					c.info.Presets[i].StatusMessage = "Globus token ready"
					c.info.Presets[i].IsAuthenticated = true
					break
				}
			}
		}
		delete(c.modelCatalogs, m.providerID)
		delete(c.modelCatalogWarnings, m.providerID)
		delete(c.modelCatalogSources, m.providerID)
		delete(c.modelCatalogPending, m.providerID)
		if p := c.currentPreset(); p != nil && p.ID == m.providerID {
			c.lmConfigEnsureVisibleField()
			return c.app, c.queueModelFetch(*p, c.apiBase)
		}
		return c.app, nil
	}
	if m.resp.Instructions != "" {
		c.authMessage = m.resp.Instructions
	} else {
		c.authMessage = "ALCF auth did not complete"
	}
	return c.app, nil
}

func (c *lmConfigComponent) handleSaved(m lmConfigSavedMsg) (tea.Model, tea.Cmd) {
	if !c.open {
		return c.app, nil
	}
	c.saving = false
	if m.err != nil {
		c.err = m.err
		return c.app, nil
	}
	if m.info != nil && m.info.State == "configuring" {
		c.app.lmProviderInfo = m.info
		c.app.setHint("LM configuration in progress: " +
			m.info.Provider + "/" + m.info.Model)
		c.reset()
		return c.app, tea.Batch(
			scheduleHintExpire(c.app.transientHint),
			lmConfigPollCmd(c.app.c),
		)
	}
	if m.info != nil && m.info.State == "error" {
		c.err = errors.New(lmConfigProviderError(m.info))
		return c.app, nil
	}
	// Success: the backend has already loaded/swapped the global
	// LM. Mirror that state locally now, before the next user send,
	// so stale per-session ModelRefs cannot leak into headers,
	// Settings, or a later PATCH flow.
	c.app.lmProviderInfo = m.info
	c.app.session.clearLocalModelRefs()
	c.reset()
	c.app.setHint("LM configured: " +
		m.info.Provider + "/" + m.info.Model)
	c.app.session.appendModelSwapMarker(m.info)
	cmds := []tea.Cmd{scheduleHintExpire(c.app.transientHint)}
	if c.app.session.wsID != "" {
		cmds = append(cmds, reloadSessionsCmd(c.app.c, c.app.session.wsID))
	}
	return c.app, tea.Batch(cmds...)
}

func (c *lmConfigComponent) openWithCurrentPreset() tea.Cmd {
	c.selectDefaultPreset()
	cmds := []tea.Cmd{}
	if cmd := c.syncFromPreset(); cmd != nil {
		cmds = append(cmds, cmd)
	}
	cmds = append(cmds, c.backgroundProbeCmds()...)
	return tea.Batch(cmds...)
}

func lmConfigProviderError(info *client.LMProviderInfo) string {
	if info != nil {
		if msg := strings.TrimSpace(info.StatusMessage); msg != "" {
			return msg
		}
		if msg := strings.TrimSpace(info.Error); msg != "" {
			return msg
		}
	}
	return "LM provider configuration failed"
}
