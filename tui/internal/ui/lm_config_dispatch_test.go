package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestLMConfigPresetSwitchUsesPresetAPIBaseForSameProviderKind(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.info.Provider = "argonne"
	a.lmConfig.info.APIBase = "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1"
	a.lmConfig.info.Model = "openai/gpt-oss-120b"
	a.lmConfig.info.Presets = []client.LMProviderPreset{
		{
			ID:             "argonne_metis",
			Label:          "ALCF Metis (Globus Auth)",
			Provider:       "argonne",
			APIBase:        "https://inference-api.alcf.anl.gov/resource_server/metis/api/v1",
			SuggestedModel: "gpt-oss-120b",
			AuthMethod:     "oauth",
			Status:         "ready",
		},
		{
			ID:             "argonne_sophia",
			Label:          "ALCF Sophia (Globus Auth)",
			Provider:       "argonne",
			APIBase:        "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
			SuggestedModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
			AuthMethod:     "oauth",
			Status:         "ready",
		},
	}
	a.lmConfig.selected = 0

	_ = a.lmConfig.syncFromPreset()

	if a.lmConfig.apiBase != "https://inference-api.alcf.anl.gov/resource_server/metis/api/v1" {
		t.Fatalf("metis preset inherited stale Sophia api_base: %q", a.lmConfig.apiBase)
	}
	if a.lmConfig.model != "gpt-oss-120b" {
		t.Fatalf("metis preset inherited stale Sophia model: %q", a.lmConfig.model)
	}
}

func TestLMConfigDispatchUsesSelectedPresetID(t *testing.T) {
	var got client.LMProviderRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut || r.URL.EscapedPath() != "/v1/providers/lm" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.EscapedPath())
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(client.LMProviderInfo{
			Configured: true,
			Provider:   got.Provider,
			APIBase:    got.APIBase,
			Model:      got.Model,
		})
	}))
	defer srv.Close()

	a := newLMConfigTestApp()
	a.c = client.New(srv.URL)
	a.lmConfig.info.Presets = []client.LMProviderPreset{
		{
			ID:             "argonne_metis",
			Label:          "ALCF Metis (Globus Auth)",
			Provider:       "argonne",
			APIBase:        "https://inference-api.alcf.anl.gov/resource_server/metis/api/v1",
			SuggestedModel: "gpt-oss-120b",
			AuthMethod:     "oauth",
			Status:         "ready",
		},
	}
	a.lmConfig.selected = 0
	a.lmConfig.model = "gpt-oss-120b"
	a.lmConfig.apiBase = a.lmConfig.info.Presets[0].APIBase
	a.lmConfig.field = lmFieldSave
	a.lmConfig.modelCatalogs = map[string][]gact.Model{
		"argonne_metis": {{ID: "gpt-oss-120b"}},
	}
	a.lmConfig.modelCatalogSources = map[string]string{"argonne_metis": "live"}
	a.lmConfig.modelCatalogWarnings = map[string]string{"argonne_metis": ""}
	a.lmConfig.modelCatalogPending = map[string]bool{}

	cmd := a.lmConfig.dispatch()
	if cmd == nil {
		t.Fatal("expected save command")
	}
	if msg := cmd(); msg == nil {
		t.Fatal("save command returned nil message")
	}

	if got.Provider != "argonne_metis" {
		t.Fatalf("provider = %q, want selected preset id argonne_metis", got.Provider)
	}
	if got.Model != "gpt-oss-120b" {
		t.Fatalf("model = %q", got.Model)
	}
	if !strings.Contains(got.APIBase, "/metis/") {
		t.Fatalf("api_base = %q, want Metis endpoint", got.APIBase)
	}
}

func TestLMConfigSessionPatchUsesSelectedPresetID(t *testing.T) {
	var got client.PatchSessionRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch || r.URL.EscapedPath() != "/v1/sessions/s1" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.EscapedPath())
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if got.Model == nil {
			t.Fatalf("missing model request: %#v", got)
		}
		_ = json.NewEncoder(w).Encode(gact.Session{
			ID:    "s1",
			Model: gact.ModelRef{ProviderID: got.Model.ProviderID, ModelID: got.Model.ModelID},
		})
	}))
	defer srv.Close()

	a := newLMConfigTestApp()
	a.c = client.New(srv.URL)
	a.lmConfig.info.Presets = []client.LMProviderPreset{
		{
			ID:             "argonne_sophia",
			Label:          "ALCF Sophia (Globus Auth)",
			Provider:       "argonne",
			APIBase:        "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
			SuggestedModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
			AuthMethod:     "oauth",
			Status:         "ready",
		},
	}
	a.lmConfig.selected = 0
	a.lmConfig.model = "meta-llama/Meta-Llama-3.1-8B-Instruct"
	a.lmConfig.sessionPatchMode = true
	a.lmConfig.targetSessionID = "s1"
	a.lmConfig.modelCatalogs = map[string][]gact.Model{
		"argonne_sophia": {{ID: "meta-llama/Meta-Llama-3.1-8B-Instruct"}},
	}
	a.lmConfig.modelCatalogSources = map[string]string{"argonne_sophia": "live"}
	a.lmConfig.modelCatalogWarnings = map[string]string{"argonne_sophia": ""}
	a.lmConfig.modelCatalogPending = map[string]bool{}

	cmd := a.lmConfig.dispatch()
	if cmd == nil {
		t.Fatal("expected session patch command")
	}
	if msg := cmd(); msg == nil {
		t.Fatal("session patch command returned nil message")
	}

	if got.Model.ProviderID != "argonne_sophia" {
		t.Fatalf("provider_id = %q, want selected preset id argonne_sophia", got.Model.ProviderID)
	}
	if got.Model.ModelID != "meta-llama/Meta-Llama-3.1-8B-Instruct" {
		t.Fatalf("model_id = %q", got.Model.ModelID)
	}
}
