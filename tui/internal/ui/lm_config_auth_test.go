package ui

import (
	"errors"
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestLMConfigArgonneShowsAuthActionAndBlocksUntilAuthenticated(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
		ID:             "argonne_sophia",
		Label:          "ALCF Sophia (Globus Auth)",
		Provider:       "argonne",
		APIBase:        "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
		SuggestedModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
		RequiresAPIKey: false,
		AuthMethod:     "oauth",
		Description:    "Argonne Sophia inference gateway.",
		Status:         "auth_required",
		StatusMessage:  "no Globus token stored; authenticate ALCF before connecting",
	})
	a.lmConfig.selected = len(a.lmConfig.info.Presets) - 1
	a.lmConfig.field = lmFieldPreset

	fields := a.lmConfig.lmConfigVisibleFields()
	foundAuth := false
	for _, field := range fields {
		if field == lmFieldAuth {
			foundAuth = true
		}
	}
	if !foundAuth {
		t.Fatal("argonne oauth provider should expose an auth field")
	}
	if a.lmConfig.canSave(a.lmConfig.info.Presets[a.lmConfig.selected]) {
		t.Fatal("argonne provider should not be saveable before auth succeeds")
	}
	out := ansi.Strip(a.lmConfig.view())
	for _, want := range []string{
		"auth: Globus login required",
		"Authenticate",
		"no Globus token stored",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("render missing %q\n%s", want, out)
		}
	}
}

func TestLMConfigArgonneReadyTokenRendersAsUsable(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
		ID:              "argonne_sophia",
		Label:           "ALCF Sophia (Globus Auth)",
		Provider:        "argonne",
		APIBase:         "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
		SuggestedModel:  "meta-llama/Meta-Llama-3.1-8B-Instruct",
		RequiresAPIKey:  false,
		AuthMethod:      "oauth",
		IsAuthenticated: true,
		Description:     "Argonne Sophia inference gateway.",
		Status:          "ready",
		StatusMessage:   "Globus token validated",
	})
	a.lmConfig.selected = len(a.lmConfig.info.Presets) - 1
	a.lmConfig.modelCatalogs["argonne_sophia"] = []gact.Model{
		{ID: "meta-llama/Meta-Llama-3.1-8B-Instruct", Name: "Meta-Llama-3.1-8B-Instruct"},
	}
	a.lmConfig.modelCatalogSources["argonne_sophia"] = "live"

	if !a.lmConfig.canSave(a.lmConfig.info.Presets[a.lmConfig.selected]) {
		t.Fatal("ready argonne provider should be saveable")
	}
	out := ansi.Strip(a.lmConfig.view())
	for _, want := range []string{
		"auth: Globus token ready",
		"Refresh token",
		"status: ready",
		"Meta-Llama-3.1-8B-Instruct",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("render missing %q\n%s", want, out)
		}
	}
	if strings.Contains(out, "Globus login required") || strings.Contains(out, "Authenticate") {
		t.Fatalf("ready argonne provider still looks unauthenticated\n%s", out)
	}
}

func TestLMConfigArgonneAuthFailureStaysVisible(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
		ID:         "argonne_sophia",
		Label:      "ALCF Sophia (Globus Auth)",
		Provider:   "argonne",
		AuthMethod: "oauth",
		Status:     "auth_required",
	})
	a.lmConfig.selected = len(a.lmConfig.info.Presets) - 1
	a.lmConfig.field = lmFieldAuth
	a.lmConfig.authenticating = true
	a.lmConfig.authMessage = "launching ALCF Globus login terminal..."

	model, cmd := a.Update(lmConfigAuthedMsg{
		providerID: "argonne_sophia",
		err:        errors.New("Globus token expired"),
	})
	a = model.(*App)

	if cmd != nil {
		t.Fatal("auth failure should not dispatch follow-up commands")
	}
	if !a.lmConfig.open {
		t.Fatal("auth failure should keep the provider modal open")
	}
	if a.lmConfig.authenticating {
		t.Fatal("authenticating should be cleared after failure")
	}
	if a.lmConfig.authMessage != "auth failed: Globus token expired" {
		t.Fatalf("auth failure message = %q", a.lmConfig.authMessage)
	}
	if a.lmConfig.info.Presets[a.lmConfig.selected].Status != "auth_required" {
		t.Fatalf("auth failure should not mark provider ready: %#v", a.lmConfig.info.Presets[a.lmConfig.selected])
	}
}

func TestLMConfigArgonneAuthFailureUsesOperatorError(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.authenticating = true

	model, _ := a.Update(lmConfigAuthedMsg{
		providerID: "argonne_sophia",
		err: &client.Error{
			Status:  401,
			Code:    "auth_failed",
			Message: "auth failed: Globus token expired; run clio auth login for ALCF and retry",
		},
	})
	a = model.(*App)

	if got := a.lmConfig.authMessage; got != "auth failed: Globus token expired; run clio auth login for ALCF and retry" {
		t.Fatalf("auth failure message = %q", got)
	}
	if strings.Contains(a.lmConfig.authMessage, "gact:") || strings.Contains(a.lmConfig.authMessage, "401") || strings.Contains(a.lmConfig.authMessage, "auth_failed") {
		t.Fatalf("auth failure leaked backend wrapper: %q", a.lmConfig.authMessage)
	}
}

func TestLMConfigArgonneAuthSuccessMarksReadyAndRefreshesModels(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Presets = append(a.lmConfig.info.Presets, client.LMProviderPreset{
		ID:         "argonne_sophia",
		Label:      "ALCF Sophia (Globus Auth)",
		Provider:   "argonne",
		AuthMethod: "oauth",
		APIBase:    "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
		Status:     "auth_required",
	})
	a.lmConfig.selected = len(a.lmConfig.info.Presets) - 1
	a.lmConfig.field = lmFieldAuth
	a.lmConfig.authenticating = true
	a.lmConfig.modelCatalogs["argonne_sophia"] = []gact.Model{{ID: "stale"}}
	a.lmConfig.modelCatalogWarnings["argonne_sophia"] = "token expired"
	a.lmConfig.modelCatalogSources["argonne_sophia"] = "unavailable"

	model, cmd := a.Update(lmConfigAuthedMsg{
		providerID: "argonne_sophia",
		resp: client.ProviderAuthResponse{
			ProviderID:      "argonne_sophia",
			IsAuthenticated: true,
		},
	})
	a = model.(*App)

	if cmd == nil {
		t.Fatal("auth success should queue a fresh model catalog fetch")
	}
	if a.lmConfig.authenticating {
		t.Fatal("authenticating should be cleared after success")
	}
	if a.lmConfig.authMessage != "ALCF Globus token ready" {
		t.Fatalf("auth success message = %q", a.lmConfig.authMessage)
	}
	preset := a.lmConfig.info.Presets[a.lmConfig.selected]
	if preset.Status != "ready" || preset.StatusMessage != "Globus token ready" || !preset.IsAuthenticated {
		t.Fatalf("auth success should mark provider ready: %#v", preset)
	}
	if _, ok := a.lmConfig.modelCatalogs["argonne_sophia"]; ok {
		t.Fatal("auth success should clear stale model catalog cache")
	}
	if _, ok := a.lmConfig.modelCatalogWarnings["argonne_sophia"]; ok {
		t.Fatal("auth success should clear stale model catalog warnings")
	}
	if !a.lmConfig.modelCatalogPending["argonne_sophia"] {
		t.Fatal("auth success should mark a model fetch pending")
	}
}
