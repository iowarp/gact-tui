package server

import (
	"encoding/base64"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §6.12 Providers / Models ----------------------------------------------

func TestProviders(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	{
		rec := do(t, h, http.MethodGet, "/v1/providers", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("list: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodGet, "/v1/providers/anthropic", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("get: %d", rec.Code)
		}
		var got gact.Provider
		mustDecode(t, rec, &got)
		if got.ID != "anthropic" {
			t.Errorf("id = %q", got.ID)
		}
	}
	{
		rec := do(t, h, http.MethodGet, "/v1/providers/anthropic/models", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("models: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodGet, "/v1/providers/nope", nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("missing provider: %d", rec.Code)
		}
		rec2 := do(t, h, http.MethodGet, "/v1/providers/nope/models", nil)
		if rec2.Code != http.StatusNotFound {
			t.Errorf("missing models: %d", rec2.Code)
		}
	}
}

func TestLMProviderConfig(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/providers/lm", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get lm provider: %d", rec.Code)
	}
	var got struct {
		Configured     bool    `json:"configured"`
		Temperature    float64 `json:"temperature"`
		MaxTokens      int     `json:"max_tokens"`
		ChosenContext  int     `json:"chosen_context"`
		IsReasoning    bool    `json:"is_reasoning"`
		NativeToolCall bool    `json:"native_tool_calling"`
		Presets        []struct {
			ID             string `json:"id"`
			SuggestedModel string `json:"suggested_model"`
		} `json:"presets"`
	}
	mustDecode(t, rec, &got)
	if !got.Configured || got.Temperature != 0 || got.MaxTokens != 0 || got.ChosenContext == 0 || !got.IsReasoning || !got.NativeToolCall || len(got.Presets) < 3 || got.Presets[0].ID != "anthropic" {
		t.Fatalf("unexpected lm provider info: %+v", got)
	}

	rec = do(t, h, http.MethodGet, "/v1/providers/lm/wait?timeout=1", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("wait lm provider: %d", rec.Code)
	}
	var waited lmProviderInfo
	mustDecode(t, rec, &waited)
	if waited.State != "ready" || waited.ChosenContext == 0 {
		t.Fatalf("waited provider info = %+v", waited)
	}

	rec = do(t, h, http.MethodPut, "/v1/providers/lm", lmProviderRequest{
		Provider: "local",
		Model:    "llama3.3",
		Parallel: 2,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("put lm provider: %d", rec.Code)
	}
	var updated lmProviderInfo
	mustDecode(t, rec, &updated)
	if updated.Provider != "local" || updated.Model != "llama3.3" {
		t.Fatalf("updated provider = %s/%s", updated.Provider, updated.Model)
	}

	rec = do(t, h, http.MethodPut, "/v1/providers/lm", lmProviderRequest{
		Provider: "local",
		Model:    "missing",
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad model should surface error, got %d", rec.Code)
	}
}

func TestProviderHandshake(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/providers/anthropic/handshake", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("provider handshake: %d", rec.Code)
	}
	var got struct {
		Source       string       `json:"source"`
		Connectivity string       `json:"connectivity"`
		Auth         string       `json:"auth"`
		Models       []gact.Model `json:"models"`
	}
	mustDecode(t, rec, &got)
	if got.Source != "live" || got.Connectivity != "ok" || got.Auth != "ok" || len(got.Models) == 0 {
		t.Fatalf("handshake = %+v", got)
	}
	if got.Models[0].ChosenContext == 0 || !got.Models[0].NativeToolCalls {
		t.Fatalf("handshake model missing runtime metadata: %+v", got.Models[0])
	}
}

func TestLMProviderEdgeStates(t *testing.T) {
	srv := New(Config{ProviderEdgeStates: true})
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/providers/lm", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get lm provider: %d", rec.Code)
	}
	var got struct {
		Presets []struct {
			ID            string `json:"id"`
			Status        string `json:"status"`
			StatusMessage string `json:"status_message"`
		} `json:"presets"`
	}
	mustDecode(t, rec, &got)
	foundSophia := false
	foundLocal := false
	for _, p := range got.Presets {
		if p.ID == "argonne_sophia" {
			foundSophia = p.Status == "auth_required" && strings.Contains(p.StatusMessage, "token expired")
		}
		if p.ID == "local" {
			foundLocal = p.Status == "unavailable" && strings.Contains(p.StatusMessage, "connection refused")
		}
	}
	if !foundSophia || !foundLocal {
		t.Fatalf("edge presets missing sophia/local states: %#v", got.Presets)
	}

	rec = do(t, h, http.MethodGet, "/v1/providers/local/models", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("local models: %d", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, `"source":"unavailable"`) || !strings.Contains(body, "connection refused") {
		t.Fatalf("local model warning body = %s", body)
	}

	rec = do(t, h, http.MethodPost, "/v1/providers/argonne_sophia/auth", map[string]any{"force": true})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("sophia auth status = %d body %s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "Globus token expired") {
		t.Fatalf("sophia auth body = %s", body)
	}
}

func TestLMProviderEdgeAuthSuccessClearsSophiaModelWarning(t *testing.T) {
	srv := New(Config{ProviderEdgeStates: true, ProviderAuthSucceeds: true})
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/providers/argonne_sophia/models", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("pre-auth sophia models: %d", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, `"source":"unavailable"`) || !strings.Contains(body, "token expired") {
		t.Fatalf("pre-auth sophia body = %s", body)
	}

	rec = do(t, h, http.MethodPost, "/v1/providers/argonne_sophia/auth", map[string]any{"force": true})
	if rec.Code != http.StatusOK {
		t.Fatalf("sophia auth status = %d body %s", rec.Code, rec.Body.String())
	}

	rec = do(t, h, http.MethodGet, "/v1/providers/argonne_sophia/models", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("post-auth sophia models: %d", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, `"source":"live"`) || !strings.Contains(body, "openai/gpt-oss-120b") || strings.Contains(body, "token expired") {
		t.Fatalf("post-auth sophia body = %s", body)
	}
}

// --- §6.6 Tools ------------------------------------------------------------

func TestTools(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/tools", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: %d", rec.Code)
	}
	rec2 := do(t, h, http.MethodGet, "/v1/tools/bash", nil)
	if rec2.Code != http.StatusOK {
		t.Fatalf("get: %d", rec2.Code)
	}
	recUnavailable := do(t, h, http.MethodGet, "/v1/tools/legacy_waveform_fetch", nil)
	if recUnavailable.Code != http.StatusServiceUnavailable {
		t.Fatalf("unavailable: %d, want 503", recUnavailable.Code)
	}
	rec3 := do(t, h, http.MethodGet, "/v1/tools/nope", nil)
	if rec3.Code != http.StatusNotFound {
		t.Errorf("missing: %d", rec3.Code)
	}
}

func TestEmptyMcpConnectionsFixture(t *testing.T) {
	srv := New(Config{EmptyMcpConnections: true})
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/mcp/servers", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list MCP connections: %d", rec.Code)
	}
	if body := rec.Body.String(); !strings.Contains(body, `"servers":[]`) {
		t.Fatalf("empty MCP connection fixture body = %s", body)
	}
}

func TestCommandsCanExposeLongPaletteFixture(t *testing.T) {
	st := store.New()
	if _, err := st.CreateWorkspace(gact.Workspace{ID: "ws_test", RootPath: "/tmp/test"}); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	srv := NewWithStore(Config{LongCommands: true}, st)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/commands", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("commands: %d", rec.Code)
	}
	body := rec.Body.String()
	for _, want := range []string{"/runtime-demo-01", "/runtime-demo-24", "Synthetic runtime command"} {
		if !strings.Contains(body, want) {
			t.Fatalf("long command fixture missing %q:\n%s", want, body)
		}
	}
}

func TestAgentBlueprintFailureFixture(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	srv.cfg.AgentBlueprintFailures = true
	h := srv.Handler()

	rec := do(t, h, http.MethodPost, "/v1/agent-blueprints/validate", gact.AgentBlueprintValidateRequest{Path: "/tmp/warning/AGENT.md"})
	if rec.Code != http.StatusOK {
		t.Fatalf("validate warning: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "optional MCP server") {
		t.Fatalf("validate warning body = %s", rec.Body.String())
	}

	rec = do(t, h, http.MethodPost, "/v1/agent-blueprints/validate", gact.AgentBlueprintValidateRequest{Path: "/tmp/invalid/AGENT.md"})
	if rec.Code != http.StatusOK {
		t.Fatalf("validate invalid: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "root_expert not found") {
		t.Fatalf("validate invalid body = %s", rec.Body.String())
	}

	rec = do(t, h, http.MethodPost, "/v1/agent-blueprints/install", gact.AgentBlueprintInstallRequest{Source: "install-fail://missing-agent-md"})
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("install failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "source archive is missing AGENT.md") {
		t.Fatalf("install failure body = %s", rec.Body.String())
	}

	rec = do(t, h, http.MethodPost, "/v1/agent-blueprints/broken-blueprint/update", gact.AgentBlueprintUpdateRequest{Scope: "workspace"})
	if rec.Code != http.StatusConflict {
		t.Fatalf("update failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "validation errors must be fixed first") {
		t.Fatalf("update failure body = %s", rec.Body.String())
	}

	rec = do(t, h, http.MethodDelete, "/v1/agent-blueprints/broken-blueprint?scope=workspace", nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("delete failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "workspace policy is locking this blueprint") {
		t.Fatalf("delete failure body = %s", rec.Body.String())
	}

	rec = do(t, h, http.MethodPost, "/v1/agent-blueprints/sources/data-semantics-agents/refresh", nil)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("source refresh failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "unable to fetch remote refs") {
		t.Fatalf("source refresh failure body = %s", rec.Body.String())
	}
}

func TestPromptStressAndSaveFailureFixtures(t *testing.T) {
	st := store.New()
	if _, err := st.CreateWorkspace(gact.Workspace{ID: "ws_test", RootPath: "/tmp/test"}); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	srv := NewWithStore(Config{PromptStress: true, PromptSaveFailures: true}, st)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/prompts", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list prompts: %d body %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{
		"workspace.seismic.main",
		"workspace.invalid.placeholder",
		"unknown placeholder",
		"argonne_sophia",
		"openai/gpt-oss-120b",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("prompt stress fixture missing %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, "session.nws.warning") {
		t.Fatalf("unscoped prompt fixture should hide session prompts:\n%s", body)
	}

	rec = do(t, h, http.MethodGet, "/v1/prompts?session_id=ses_seed_ws_default_1", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list scoped prompts: %d body %s", rec.Code, rec.Body.String())
	}
	body = rec.Body.String()
	if !strings.Contains(body, "session.nws.warning") {
		t.Fatalf("scoped prompt fixture should include matching session prompt:\n%s", body)
	}

	rec = do(t, h, http.MethodGet, "/v1/prompts?session_id=other_session", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list nonmatching scoped prompts: %d body %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "session.nws.warning") {
		t.Fatalf("nonmatching session scope should hide session prompt:\n%s", rec.Body.String())
	}

	rec = do(t, h, http.MethodPut, "/v1/prompts/workspace.seismic.main", gact.PromptSaveRequest{
		Profile: "codex",
		Text:    "override",
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("save failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "read-only") {
		t.Fatalf("save failure body = %s", rec.Body.String())
	}
}

func TestAgentStressAndFailureFixtures(t *testing.T) {
	st := store.New()
	if _, err := st.CreateWorkspace(gact.Workspace{ID: "ws_test", RootPath: "/tmp/test"}); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	srv := NewWithStore(Config{LongAgents: true, AgentFailures: true}, st)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/agents", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list agents: %d body %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{
		"clio-live-benchmark-orchestrator-with-long-routing-title",
		"earthscope_catalog_expert",
		"sac_trace_quality_reviewer",
		"waveform_visualization_publisher",
		"fragile-user-expert",
		"invalid-disabled-demo-expert",
		"station feed freshness must be checked before demo",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("agent stress fixture missing %q:\n%s", want, body)
		}
	}

	rec = do(t, h, http.MethodPost, "/v1/agents", gact.AgentDef{
		ID:          "agent-write-fail",
		Title:       "Agent Write Fail",
		Description: "should fail",
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("create failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "workspace registry rejected this id") {
		t.Fatalf("create failure body = %s", rec.Body.String())
	}

	rec = do(t, h, http.MethodPut, "/v1/agents/fragile-user-expert", gact.AgentDef{
		ID:          "fragile-user-expert",
		Title:       "Edited",
		Description: "edited",
		Enabled:     true,
	})
	if rec.Code != http.StatusConflict {
		t.Fatalf("update failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "source file changed on disk") {
		t.Fatalf("update failure body = %s", rec.Body.String())
	}

	rec = do(t, h, http.MethodDelete, "/v1/agents/fragile-user-expert", nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("delete failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "referenced by active session routing") {
		t.Fatalf("delete failure body = %s", rec.Body.String())
	}

	rec = do(t, h, http.MethodPost, "/v1/agents/extract", gact.AgentExtractRequest{
		SessionIDs: []string{"ses_missing"},
		AgentID:    "extract-fail",
	})
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("extract failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "session transcript is unavailable") {
		t.Fatalf("extract failure body = %s", rec.Body.String())
	}
}

func TestExpertPackLifecycleFailureFixture(t *testing.T) {
	st := store.New()
	if _, err := st.CreateWorkspace(gact.Workspace{ID: "ws_test", RootPath: "/tmp/test"}); err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	srv := NewWithStore(Config{ExpertPackFailures: true}, st)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/expert-packs", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list packs: %d body %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{
		"data-semantics",
		"git@github.com:example/data-semantics-agents.git",
		"last_synced_at",
		"fedcba98765432100123456789abcdef",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("expert-pack provenance missing %q:\n%s", want, body)
		}
	}

	rec = do(t, h, http.MethodPost, "/v1/expert-packs/install", gact.ExpertPackInstallRequest{Source: "install-fail://missing-manifest"})
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("install failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "manifest clio-pack.yaml was not found") {
		t.Fatalf("install failure body = %s", rec.Body.String())
	}

	rec = do(t, h, http.MethodPost, "/v1/expert-packs/data-semantics/update", nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("update failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "marketplace source has validation errors") {
		t.Fatalf("update failure body = %s", rec.Body.String())
	}

	rec = do(t, h, http.MethodDelete, "/v1/expert-packs/data-semantics", nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("delete failure: %d body %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "pack is active in the selected session") {
		t.Fatalf("delete failure body = %s", rec.Body.String())
	}
}

func TestLongAgentBlueprintFixture(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	srv.cfg.LongAgentBlueprints = true
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/agent-blueprints", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list blueprints: %d body %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, want := range []string{
		longAgentBlueprintID,
		"San Diego EarthScope and NDP Live Benchmark Review With Very Long Name",
		"disabled-benchmark-blueprint-with-long-title",
		"local-lab-blueprint-with-extremely-specific-scratch-analysis-name",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("long blueprint list missing %q:\n%s", want, body)
		}
	}

	rec = do(t, h, http.MethodGet, "/v1/agent-blueprints/"+longAgentBlueprintID, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get long blueprint: %d body %s", rec.Code, rec.Body.String())
	}
	body = rec.Body.String()
	for _, want := range []string{"earthscope_catalog", "seismic_analysis", "visualization"} {
		if !strings.Contains(body, want) {
			t.Fatalf("long blueprint detail missing %q:\n%s", want, body)
		}
	}

	rec = do(t, h, http.MethodGet, "/v1/agent-blueprints/sources", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list sources: %d body %s", rec.Code, rec.Body.String())
	}
	body = rec.Body.String()
	for _, want := range []string{"earthscope-ndp-long-source", "Weather And NWS Advisory Marketplace Source With Long Branch Metadata"} {
		if !strings.Contains(body, want) {
			t.Fatalf("long source list missing %q:\n%s", want, body)
		}
	}
}

// --- §6.5 Agents -----------------------------------------------------------

func TestAgents(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/agents", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: %d", rec.Code)
	}
	rec2 := do(t, h, http.MethodGet, "/v1/agents/default", nil)
	if rec2.Code != http.StatusOK {
		t.Fatalf("get: %d", rec2.Code)
	}
	rec3 := do(t, h, http.MethodPost, "/v1/agents", map[string]any{"id": "x", "title": "X"})
	if rec3.Code != http.StatusCreated {
		t.Fatalf("POST: %d, want 201", rec3.Code)
	}
	rec4 := do(t, h, http.MethodPut, "/v1/agents/x", map[string]any{"title": "X2", "enabled": true})
	if rec4.Code != http.StatusOK {
		t.Fatalf("PUT: %d, want 200", rec4.Code)
	}
	rec5 := do(t, h, http.MethodPost, "/v1/agents/extract", map[string]any{"agent_id": "from-session", "session_ids": []string{"s1"}})
	if rec5.Code != http.StatusCreated {
		t.Fatalf("extract: %d, want 201", rec5.Code)
	}
	rec6 := do(t, h, http.MethodDelete, "/v1/agents/x", nil)
	if rec6.Code != http.StatusNoContent {
		t.Fatalf("DELETE: %d, want 204", rec6.Code)
	}
}

// --- §6.7 MCP --------------------------------------------------------------

func TestMcpEndpoints(t *testing.T) {
	srv, _ := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	{
		rec := do(t, h, http.MethodGet, "/v1/mcp/servers", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("list: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodGet, "/v1/mcp/handshake", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("handshake: %d", rec.Code)
		}
		var got struct {
			Servers []struct {
				Name       string   `json:"name"`
				Reachable  bool     `json:"reachable"`
				State      string   `json:"state"`
				ToolsCount int      `json:"tools_count"`
				Tools      []string `json:"tools"`
				Error      string   `json:"error"`
			} `json:"servers"`
		}
		mustDecode(t, rec, &got)
		if len(got.Servers) < 2 {
			t.Fatalf("handshake servers = %+v", got.Servers)
		}
		foundReady := false
		foundDown := false
		for _, server := range got.Servers {
			if server.Name == "mcp_fake" && server.Reachable && server.State == "ready" && server.ToolsCount > 0 {
				foundReady = true
			}
			if server.Name == "mcp_docs" && !server.Reachable && server.Error != "" {
				foundDown = true
			}
		}
		if !foundReady || !foundDown {
			t.Fatalf("handshake did not expose independent ready/down states: %+v", got.Servers)
		}
	}
	{
		rec := do(t, h, http.MethodGet, "/v1/mcp/servers/mcp_fake", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("get: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodGet, "/v1/mcp/servers/nope", nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("missing: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodPost, "/v1/mcp/servers/mcp_fake/reconnect", nil)
		if rec.Code != http.StatusNoContent {
			t.Errorf("reconnect: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodPost, "/v1/mcp/servers/mcp_docs/reconnect", nil)
		if rec.Code != http.StatusBadGateway {
			t.Errorf("failed reconnect: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodDelete, "/v1/mcp/servers/mcp_fake", nil)
		if rec.Code != http.StatusNoContent {
			t.Errorf("delete: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodDelete, "/v1/mcp/servers/mcp_docs", nil)
		if rec.Code != http.StatusConflict {
			t.Errorf("failed delete: %d", rec.Code)
		}
	}
	for _, p := range []string{
		"/v1/mcp/servers/mcp_fake/tools",
		"/v1/mcp/servers/mcp_fake/resources",
		"/v1/mcp/servers/mcp_fake/resource_templates",
		"/v1/mcp/servers/mcp_fake/prompts",
	} {
		rec := do(t, h, http.MethodGet, p, nil)
		if rec.Code != http.StatusOK {
			t.Errorf("GET %s: %d", p, rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodPost, "/v1/mcp/servers/mcp_fake/resources/read", map[string]any{
			"uri": "file:///docs/welcome.md",
		})
		if rec.Code != http.StatusOK {
			t.Errorf("read: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodPost, "/v1/mcp/servers/mcp_fake/resources/subscribe", map[string]any{
			"uri": "file:///docs/welcome.md",
		})
		if rec.Code != http.StatusNoContent {
			t.Errorf("subscribe: %d", rec.Code)
		}
	}
	{
		rec := do(t, h, http.MethodPost, "/v1/mcp/servers/mcp_fake/prompts/get", map[string]any{
			"name": "summarize", "arguments": map[string]any{"text": "hi"},
		})
		if rec.Code != http.StatusOK {
			t.Errorf("prompts/get: %d", rec.Code)
		}
	}
}

// --- §6.13 Commands --------------------------------------------------------

func TestCommands(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/commands", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: %d", rec.Code)
	}
	// /clear now actually wipes messages — seed some first so the
	// count-in-response is meaningful.
	for i := 0; i < 3; i++ {
		_, _ = srv.Store().AppendMessage(gact.Message{
			SessionID: sid, Role: gact.RoleUser,
			Parts: []gact.Part{gact.NewTextPart("hi")},
		})
	}
	rec2 := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/commands/%2Fclear", nil)
	if rec2.Code != http.StatusOK {
		t.Errorf("/clear: %d", rec2.Code)
	}
	// Listing messages should now return an empty slice.
	rec2b := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages", nil)
	if !strings.Contains(rec2b.Body.String(), `"messages":[]`) && !strings.Contains(rec2b.Body.String(), `"messages":null`) {
		t.Errorf("messages after /clear: %s", rec2b.Body.String())
	}

	// /help is a side-effecting command that emits an assistant note.
	// 204 is fine; ensure the assistant note landed in the store.
	rec3 := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/commands/%2Fhelp", nil)
	if rec3.Code != http.StatusNoContent {
		t.Errorf("/help: %d", rec3.Code)
	}
	rec3b := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages", nil)
	if !strings.Contains(rec3b.Body.String(), "GACT slash commands") {
		t.Errorf("help note missing: %s", rec3b.Body.String())
	}

	// Unknown command.
	rec4 := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/commands/nope", nil)
	if rec4.Code != http.StatusNotFound {
		t.Errorf("unknown: %d", rec4.Code)
	}
}

func TestCommandsIncludeActiveAgentBlueprintPackagedCommands(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/commands", nil)
	if strings.Contains(rec.Body.String(), "/validate-dataset") {
		t.Fatalf("packaged command leaked into unscoped workspace command list: %s", rec.Body.String())
	}

	activate := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/agent-blueprint", map[string]string{"blueprint_id": "data-exploration"})
	if activate.Code != http.StatusOK {
		t.Fatalf("activate blueprint: %d %s", activate.Code, activate.Body.String())
	}

	sessionCommands := do(t, h, http.MethodGet, "/v1/commands?session_id="+sid, nil)
	if sessionCommands.Code != http.StatusOK {
		t.Fatalf("session commands: %d", sessionCommands.Code)
	}
	for _, want := range []string{
		`"id":"/validate-dataset"`,
		`"command_source":"agent_blueprint"`,
		`"agent_blueprint_id":"data-exploration"`,
		`"command_scope":"agent_blueprint"`,
		`"command_path":"/workspace/.clio/agent-blueprints/data-exploration/commands/validate-dataset.md"`,
	} {
		if !strings.Contains(sessionCommands.Body.String(), want) {
			t.Fatalf("packaged command response missing %q:\n%s", want, sessionCommands.Body.String())
		}
	}

	plannerCommands := do(t, h, http.MethodGet, "/v1/commands?session_id="+sid+"&planner=true&agent_id=data", nil)
	if plannerCommands.Code != http.StatusOK || !strings.Contains(plannerCommands.Body.String(), "/validate-dataset") {
		t.Fatalf("planner commands missing packaged command: %d %s", plannerCommands.Code, plannerCommands.Body.String())
	}
}

func TestSessionCommandCancelFailureFixtureKeepsSessionRunning(t *testing.T) {
	st := store.New()
	ws, err := st.CreateWorkspace(gact.Workspace{ID: "ws_test", RootPath: "/tmp/test"})
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}
	sess, err := st.CreateSession(gact.Session{
		WorkspaceID: ws.ID,
		Title:       "running demo",
		Status:      gact.StatusRunning,
	})
	if err != nil {
		t.Fatalf("seed session: %v", err)
	}
	srv := NewWithStore(Config{CancelFailures: true}, st)
	h := srv.Handler()

	rec := do(t, h, http.MethodPost, "/v1/sessions/"+sess.ID+"/commands/%2Fcancel", nil)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("/cancel failure status = %d body %s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "cancel_failed") ||
		!strings.Contains(body, "runtime supervisor did not acknowledge") {
		t.Fatalf("/cancel failure body = %s", body)
	}
	got, err := st.GetSession(sess.ID)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	if got.Status != gact.StatusRunning {
		t.Fatalf("/cancel failure should leave status running, got %q", got.Status)
	}
}

// --- §6.16 Metrics ---------------------------------------------------------

func TestMetrics(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()
	_, _ = srv.Store().AppendMessage(gact.Message{
		SessionID: sid, Role: gact.RoleUser, Parts: []gact.Part{gact.NewTextPart("x")},
	})

	rec := do(t, h, http.MethodGet, "/v1/metrics", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("metrics: %d", rec.Code)
	}
	var m gact.Metrics
	mustDecode(t, rec, &m)
	if m.Sessions.Total < 1 {
		t.Errorf("sessions.total = %d", m.Sessions.Total)
	}
	if m.Messages.Total < 1 {
		t.Errorf("messages.total = %d", m.Messages.Total)
	}
}

// --- §6.9 Files / context --------------------------------------------------

func TestContextFiles(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()
	dir := t.TempDir()
	readme := filepath.Join(dir, "readme.md")
	if err := os.WriteFile(readme, []byte("# Readme\n\nPreview text.\n"), 0o600); err != nil {
		t.Fatalf("write context fixture: %v", err)
	}

	// add
	rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/context/files", contextFileRequest{
		Path: readme, Mode: "edit",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("add: %d", rec.Code)
	}

	// list
	rec2 := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/context/files", nil)
	var listBody struct {
		Files []gact.ContextFile `json:"files"`
	}
	mustDecode(t, rec2, &listBody)
	if len(listBody.Files) != 1 || listBody.Files[0].Path != readme || listBody.Files[0].Size == 0 || listBody.Files[0].Language != "markdown" {
		t.Errorf("list = %+v", listBody)
	}

	recContent := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/context/files/content?path="+url.QueryEscape(readme), nil)
	if recContent.Code != http.StatusOK {
		t.Fatalf("content: %d", recContent.Code)
	}
	var contentBody struct {
		File gact.ContextFileContent `json:"file"`
	}
	mustDecode(t, recContent, &contentBody)
	decoded, err := base64.StdEncoding.DecodeString(contentBody.File.Data)
	if err != nil {
		t.Fatalf("decode content: %v", err)
	}
	if string(decoded) != "# Readme\n\nPreview text.\n" || contentBody.File.MediaType != "text/markdown; charset=utf-8" {
		t.Fatalf("content = %+v decoded=%q", contentBody.File, string(decoded))
	}

	// upload bytes as an attachment and preview them through the same context content endpoint.
	recUpload := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/attachments", attachmentUploadRequest{
		File:     base64.StdEncoding.EncodeToString([]byte("uploaded body\n")),
		Filename: "upload.txt",
		Mode:     "read",
	})
	if recUpload.Code != http.StatusOK {
		t.Fatalf("upload: %d", recUpload.Code)
	}
	var uploaded gact.ContextFile
	mustDecode(t, recUpload, &uploaded)
	if !uploaded.Uploaded || uploaded.Size != int64(len("uploaded body\n")) {
		t.Fatalf("uploaded context file = %+v", uploaded)
	}
	recUploadedContent := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/context/files/content?path="+url.QueryEscape(uploaded.Path), nil)
	if recUploadedContent.Code != http.StatusOK {
		t.Fatalf("uploaded content: %d", recUploadedContent.Code)
	}
	mustDecode(t, recUploadedContent, &contentBody)
	decoded, err = base64.StdEncoding.DecodeString(contentBody.File.Data)
	if err != nil {
		t.Fatalf("decode uploaded content: %v", err)
	}
	if string(decoded) != "uploaded body\n" || contentBody.File.MediaType != "text/plain; charset=utf-8" {
		t.Fatalf("uploaded content = %+v decoded=%q", contentBody.File, string(decoded))
	}

	// patch
	rec3 := do(t, h, http.MethodPatch, "/v1/sessions/"+sid+"/context/files", contextFileRequest{
		Path: readme, Mode: "read",
	})
	if rec3.Code != http.StatusOK {
		t.Errorf("patch: %d", rec3.Code)
	}
	// patch missing
	rec3b := do(t, h, http.MethodPatch, "/v1/sessions/"+sid+"/context/files", contextFileRequest{
		Path: "nope.go", Mode: "read",
	})
	if rec3b.Code != http.StatusNotFound {
		t.Errorf("patch missing: %d", rec3b.Code)
	}

	// delete
	rec4 := do(t, h, http.MethodDelete, "/v1/sessions/"+sid+"/context/files", contextFileRequest{Path: readme})
	if rec4.Code != http.StatusNoContent {
		t.Errorf("delete: %d", rec4.Code)
	}

	// delete missing
	rec5 := do(t, h, http.MethodDelete, "/v1/sessions/"+sid+"/context/files", contextFileRequest{Path: "nope.go"})
	if rec5.Code != http.StatusNotFound {
		t.Errorf("delete missing: %d", rec5.Code)
	}
}

func TestContextAddFailureFixtureUsesStructuredError(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	srv.cfg.ContextAddFailures = true
	h := srv.Handler()

	rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/context/files", contextFileRequest{
		Path: "docs/readme.md",
		Mode: "read",
	})
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("context add failure status = %d body %s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "context_add_failed") ||
		!strings.Contains(body, "workspace file index is temporarily unavailable") {
		t.Fatalf("context add failure body = %s", body)
	}

	recList := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/context/files", nil)
	var listBody struct {
		Files []gact.ContextFile `json:"files"`
	}
	mustDecode(t, recList, &listBody)
	if len(listBody.Files) != 0 {
		t.Fatalf("failed add should not mutate context files: %+v", listBody.Files)
	}
}

func TestWorkspaceFiles(t *testing.T) {
	srv, wsID := newServerWithSeededWorkspace(t)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/workspaces/"+wsID+"/files", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("files: %d", rec.Code)
	}

	rec2 := do(t, h, http.MethodGet, "/v1/workspaces/"+wsID+"/files/read?path=main.go", nil)
	if rec2.Code != http.StatusOK {
		t.Fatalf("read: %d", rec2.Code)
	}
	if rec2.Body.Len() == 0 {
		t.Errorf("read returned empty body")
	}

	rec3 := do(t, h, http.MethodGet, "/v1/workspaces/"+wsID+"/files/read", nil)
	if rec3.Code != http.StatusBadRequest {
		t.Errorf("read missing path: %d", rec3.Code)
	}

	rec4 := do(t, h, http.MethodGet, "/v1/workspaces/"+wsID+"/repo_map", nil)
	if rec4.Code != http.StatusOK {
		t.Errorf("repo_map: %d", rec4.Code)
	}
}

// --- §6.10 Diffs -----------------------------------------------------------

func TestDiffs(t *testing.T) {
	srv, _, sid := newServerWithSession(t)
	h := srv.Handler()

	// Seed an assistant message with a file_diff part.
	before := "old\n"
	after := "new\n"
	msg, _ := srv.Store().AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleAssistant,
		Parts: []gact.Part{
			gact.NewFileDiffPart("a.go", &before, &after, "go"),
		},
	})

	// session diffs
	{
		rec := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/diffs", nil)
		var body struct {
			Diffs []gact.FileDiff `json:"diffs"`
		}
		mustDecode(t, rec, &body)
		if len(body.Diffs) != 1 || body.Diffs[0].Path != "a.go" {
			t.Errorf("diffs: %+v", body)
		}
	}

	// per-message diffs
	{
		rec := do(t, h, http.MethodGet, "/v1/sessions/"+sid+"/messages/"+msg.ID+"/diffs", nil)
		if rec.Code != http.StatusOK {
			t.Errorf("msg diffs: %d", rec.Code)
		}
	}

	// apply
	{
		rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/diffs/apply", applyRejectRequest{Paths: []string{"a.go"}})
		if rec.Code != http.StatusOK {
			t.Errorf("apply: %d", rec.Code)
		}
	}

	// reject
	{
		rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/diffs/reject", applyRejectRequest{Paths: []string{"a.go"}})
		if rec.Code != http.StatusOK {
			t.Errorf("reject: %d", rec.Code)
		}
	}

	// undo (deletes 1 message)
	{
		rec := do(t, h, http.MethodPost, "/v1/sessions/"+sid+"/undo", undoRequest{Count: 1})
		if rec.Code != http.StatusOK {
			t.Errorf("undo: %d", rec.Code)
		}
	}

	_ = store.SessionFilter{} // pull store import if otherwise unused
}

// TestWorkspaceFiles_WalkMode covers T3: with WalkWorkspaceFiles=true
// and a real directory as the workspace root, the handler returns
// entries discovered on disk instead of the static demo list.
func TestWorkspaceFiles_WalkMode(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "alpha.go"), []byte("package x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "nested", "beta.md"), []byte("# hi"), 0o644); err != nil {
		t.Fatal(err)
	}

	st := store.New()
	ws, err := st.CreateWorkspace(gact.Workspace{ID: "ws_real", Name: "real", RootPath: dir})
	if err != nil {
		t.Fatal(err)
	}
	srv := NewWithStore(Config{WalkWorkspaceFiles: true}, st)
	h := srv.Handler()

	rec := do(t, h, http.MethodGet, "/v1/workspaces/"+ws.ID+"/files", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: %d %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, "alpha.go") {
		t.Errorf("walk didn't surface alpha.go: %s", body)
	}
	if !strings.Contains(body, "nested/beta.md") {
		t.Errorf("walk didn't surface nested/beta.md: %s", body)
	}
	// Static demo entry must NOT appear — walk wins when enabled.
	if strings.Contains(body, "docs/architecture.md") {
		t.Errorf("static-demo entry bled into walk output: %s", body)
	}
}
