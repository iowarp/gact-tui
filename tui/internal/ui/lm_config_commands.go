package ui

// lm_config_commands.go defines LM-config fetch/save/auth/poll backend commands and their messages.

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

type lmConfigFetchedMsg struct {
	info *client.LMProviderInfo
	err  error
}

type lmConfigSavedMsg struct {
	info *client.LMProviderInfo
	err  error
}

type lmConfigAuthedMsg struct {
	providerID string
	resp       client.ProviderAuthResponse
	err        error
}

func lmConfigFetchCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		info, err := c.GetLMProvider(ctx)
		lmConfigNormalizeInfo(info)
		return lmConfigFetchedMsg{info: info, err: err}
	}
}

func lmConfigNormalizeInfo(info *client.LMProviderInfo) {
	if info == nil {
		return
	}
	sort.SliceStable(info.Presets, func(i, j int) bool {
		return strings.ToLower(info.Presets[i].Label) < strings.ToLower(info.Presets[j].Label)
	})
}

func lmConfigSortModels(models []gact.Model) []gact.Model {
	out := append([]gact.Model(nil), models...)
	sort.SliceStable(out, func(i, j int) bool {
		left := strings.ToLower(strings.TrimSpace(out[i].ID))
		right := strings.ToLower(strings.TrimSpace(out[j].ID))
		if left == right {
			return strings.ToLower(strings.TrimSpace(out[i].Name)) <
				strings.ToLower(strings.TrimSpace(out[j].Name))
		}
		return left < right
	})
	return out
}

func lmConfigSaveCmd(c *client.Client, req client.LMProviderRequest) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
		defer cancel()
		info, err := c.PutLMProvider(ctx, req)
		if err == nil && info != nil && strings.EqualFold(strings.TrimSpace(info.State), "configuring") {
			waited, waitErr := c.WaitLMProvider(ctx, 150)
			if waitErr != nil {
				err = waitErr
			} else if waited != nil {
				info = waited
			}
		}
		if err == nil && info != nil && strings.EqualFold(strings.TrimSpace(info.State), "error") {
			err = fmt.Errorf("provider configuration failed: %s", valuefmt.FirstNonEmpty(info.Error, info.StatusMessage, "unknown error"))
		}
		lmConfigNormalizeInfo(info)
		return lmConfigSavedMsg{info: info, err: err}
	}
}

func lmConfigPollCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		time.Sleep(1 * time.Second)
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		info, err := c.GetLMProvider(ctx)
		lmConfigNormalizeInfo(info)
		return lmConfigFetchedMsg{info: info, err: err}
	}
}

func lmConfigAuthCmd(c *client.Client, providerID string, force bool) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		resp, err := c.AuthProvider(ctx, providerID, client.ProviderAuthRequest{Force: force})
		return lmConfigAuthedMsg{providerID: providerID, resp: resp, err: err}
	}
}

// lmConfigModelsLoadedMsg carries the model catalog for one PRESET so
// the modal can populate the Model picker. Source/warning surface
// fallback context (e.g. "ALCF token expired — re-auth") when the
// backend couldn't talk to the upstream catalog endpoint.
//
// Keyed by preset id, NOT provider kind, so multiple Argonne clusters
// (sophia / metis) keep independent catalogs even though they share
// kind="argonne".
type lmConfigModelsLoadedMsg struct {
	presetID string
	models   []gact.Model
	source   string // "live" / "static_catalog" / "unavailable" / ""
	warning  string // backend error message, empty when live
	err      error  // transport-level failure (different from a backend warning)
}

// lmConfigFetchModelsCmd issues GET /v1/providers/{preset_id}/models
// (the backend resolves preset id → cluster + framework path) and
// surfaces source + warning so the picker can render "stale because X".
func lmConfigFetchModelsCmd(c *client.Client, presetID string, apiBaseOverride string) tea.Cmd {
	return func() tea.Msg {
		timeout := 5 * time.Second
		if strings.HasPrefix(presetID, "argonne_") {
			timeout = 20 * time.Second
		}
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		resp, err := lmConfigFetchProviderCatalog(ctx, c, presetID, apiBaseOverride)
		return lmConfigModelsLoadedMsg{
			presetID: presetID,
			models:   resp.Models,
			source:   resp.Source,
			warning:  resp.Error,
			err:      err,
		}
	}
}

func lmConfigRetryFetchModelsCmd(
	c *client.Client,
	presetID string,
	apiBaseOverride string,
	delay time.Duration,
) tea.Cmd {
	return scheduleTick(delay, func() tea.Msg {
		timeout := 5 * time.Second
		if strings.HasPrefix(presetID, "argonne_") {
			timeout = 20 * time.Second
		}
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		resp, err := lmConfigFetchProviderCatalog(ctx, c, presetID, apiBaseOverride)
		return lmConfigModelsLoadedMsg{
			presetID: presetID,
			models:   resp.Models,
			source:   resp.Source,
			warning:  resp.Error,
			err:      err,
		}
	})
}

func lmConfigFetchProviderCatalog(
	ctx context.Context,
	c *client.Client,
	presetID string,
	apiBaseOverride string,
) (client.ProviderModelsResponse, error) {
	handshake, err := c.ProviderHandshake(ctx, presetID, apiBaseOverride, false)
	if err == nil && (handshake.Source != "" || len(handshake.Models) > 0 || handshake.Error != "") {
		return client.ProviderModelsResponse{
			Models: handshake.Models,
			Source: handshake.Source,
			Error:  handshake.Error,
		}, nil
	}
	resp, fallbackErr := c.ListProviderModelsDetailed(ctx, presetID, apiBaseOverride)
	if fallbackErr != nil {
		return resp, firstError(err, fallbackErr)
	}
	return resp, nil
}

func firstError(values ...error) error {
	for _, err := range values {
		if err != nil {
			return err
		}
	}
	return nil
}
