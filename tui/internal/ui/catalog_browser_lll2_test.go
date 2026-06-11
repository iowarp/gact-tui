package ui

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func writeJSONForTest(t *testing.T, w http.ResponseWriter, v any) {
	t.Helper()
	if err := json.NewEncoder(w).Encode(v); err != nil {
		t.Fatalf("encode JSON: %v", err)
	}
}

func catalogItemsTextForTest(items []catalogItem) string {
	var b strings.Builder
	for _, item := range items {
		b.WriteString(item.id)
		b.WriteByte('\n')
		b.WriteString(item.title)
		b.WriteByte('\n')
		b.WriteString(item.inlineDesc)
		b.WriteByte('\n')
		b.WriteString(item.desc)
		b.WriteByte('\n')
		b.WriteString(item.statusTag)
		b.WriteByte('\n')
	}
	return b.String()
}

// TestToggleToolDisabled_persists toggles a tool id and verifies the
// disabled set updates + SaveConfig fires.
func TestToggleToolDisabled_persists(t *testing.T) {
	a := newReadyApp(nil, nil)
	saves := 0
	a.SaveConfig = func() error { saves++; return nil }

	a.toggleToolDisabled("bash")
	if !a.disabledTools["bash"] {
		t.Errorf("expected bash disabled after first toggle")
	}
	if saves != 1 {
		t.Errorf("expected 1 SaveConfig call, got %d", saves)
	}
	a.toggleToolDisabled("bash")
	if a.disabledTools["bash"] {
		t.Errorf("expected bash re-enabled after second toggle")
	}
	if saves != 2 {
		t.Errorf("expected 2 SaveConfig calls, got %d", saves)
	}
}

// TestSetGetDisabledTools_roundTrip seeds + reads back the disabled
// set, expecting a sorted slice (config diffs need stable order).
func TestSetGetDisabledTools_roundTrip(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.SetDisabledTools([]string{"web_search", "bash", "edit_file"})
	got := a.GetDisabledTools()
	want := []string{"bash", "edit_file", "web_search"}
	if len(got) != len(want) {
		t.Fatalf("len mismatch: got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("idx %d: got %q, want %q", i, got[i], want[i])
		}
	}
}

// TestCatalogBrowser_SpaceTogglesTool: pressing Space on a tools
// catalog row toggles its disabled state via the modal key handler.
func TestCatalogBrowser_SpaceTogglesTool(t *testing.T) {
	a := newReadyApp(nil, nil)
	saves := 0
	a.SaveConfig = func() error { saves++; return nil }
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{id: "bash", title: "bash", desc: "shell"}},
		sel:   0,
	}
	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: ' ', Text: " "})
	if !a.disabledTools["bash"] {
		t.Errorf("space did not disable bash; disabledTools=%v", a.disabledTools)
	}
	if saves != 1 {
		t.Errorf("expected 1 save after toggle, got %d", saves)
	}
}

// TestCatalogBrowser_EscPopsMcpDetail: when a parent state is set,
// esc returns to the parent rather than closing the modal.
func TestCatalogBrowser_EscPopsMcpDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	parent := &catalogBrowserState{kind: catalogKindMcp, title: "MCP Connections"}
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · fake",
		mcpServerID: "fake",
		parent:      parent,
	}
	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEscape})
	if !a.catalogBrowserOpen {
		t.Errorf("esc closed the modal; should have popped to parent")
	}
	if a.catalogBrowser != parent {
		t.Errorf("esc did not restore parent state")
	}
}

func TestCatalogBrowser_EscapeClosesTopLevelToolsCatalog(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Actions and MCP",
		items: []catalogItem{{id: "mcpserver/fake-mcp", title: "MCP · fake-mcp"}},
	}

	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEscape})

	if a.catalogBrowserOpen || a.catalogBrowser != nil {
		t.Fatalf("escape should close top-level tools catalog, open=%v browser=%#v", a.catalogBrowserOpen, a.catalogBrowser)
	}
}

func TestCatalogBrowser_SlashClosesCatalogAndStartsCommandInput(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.focus = FocusBody
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Actions and MCP",
		items: []catalogItem{{id: "mcpserver/fake-mcp", title: "MCP · fake-mcp"}},
	}

	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: '/', Text: "/"})

	if a.catalogBrowserOpen || a.catalogBrowser != nil {
		t.Fatalf("slash should close catalog, open=%v browser=%#v", a.catalogBrowserOpen, a.catalogBrowser)
	}
	if a.focus != FocusInput {
		t.Fatalf("slash should focus input, got %v", a.focus)
	}
	if got := a.input.Value(); got != "/" {
		t.Fatalf("slash should seed command input, got %q", got)
	}
}

// TestCatalogBrowserTitle_AgentsAndDetail: new kinds get titles.
func TestCatalogBrowserTitle_AgentsAndDetail(t *testing.T) {
	cases := map[catalogBrowserKind]string{
		catalogKindMcp:         "MCP Connections",
		catalogKindTools:       "Actions and MCP",
		catalogKindSkills:      "Skills",
		catalogKindMcpDetail:   "MCP detail",
		catalogKindAgentDetail: "Agent detail",
		catalogKindAgents:      "Experts",
	}
	for k, want := range cases {
		if got := catalogBrowserTitle(k); got != want {
			t.Errorf("kind %d: title=%q, want %q", k, got, want)
		}
	}
}

func TestCatalogBrowser_EnterOnAgentDrillsIntoDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	parent := &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Experts",
		items: []catalogItem{{id: "analysis", title: "Analysis expert"}},
	}
	a.catalogBrowserOpen = true
	a.catalogBrowser = parent

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalogBrowser == parent {
		t.Fatal("enter on agent row did not replace browser with detail state")
	}
	if a.catalogBrowser.kind != catalogKindAgentDetail {
		t.Fatalf("browser kind = %v, want catalogKindAgentDetail", a.catalogBrowser.kind)
	}
	if a.catalogBrowser.agentID != "analysis" {
		t.Fatalf("agentID = %q, want analysis", a.catalogBrowser.agentID)
	}
	if a.catalogBrowser.parent != parent {
		t.Fatal("detail browser did not retain parent for back navigation")
	}
	if cmd == nil {
		t.Fatal("expected detail load command")
	}
}

func TestCatalogBrowser_OOnAgentSetsOneTurnOverride(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Experts",
		items: []catalogItem{{id: "analysis", title: "Analysis expert"}},
	}

	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: 'o', Text: "o"})

	if a.nextTurnAgentID != "analysis" {
		t.Fatalf("nextTurnAgentID = %q, want analysis", a.nextTurnAgentID)
	}
	if a.catalogBrowserOpen {
		t.Fatal("agent one-turn selection should close the catalog")
	}
	if !strings.Contains(a.transientHint, "Analysis expert") {
		t.Fatalf("transient hint should name selected agent, got %q", a.transientHint)
	}
}

func TestCatalogBrowser_AgentActionsOpenWriteModals(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.AgentWrite = true
	a.caps.Capabilities.SkillsExtraction = true
	a.sessions = []gact.Session{{ID: "sess_demo", Title: "demo"}}
	a.selected = 0
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Experts",
		items: []catalogItem{{id: "analysis", title: "Analysis expert"}},
	}

	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: 'c', Text: "c"})
	if !a.agentWriteOpen || a.agentWriteMode != agentWriteModeCreate {
		t.Fatalf("create shortcut should open create modal, open=%v mode=%q", a.agentWriteOpen, a.agentWriteMode)
	}

	a.closeAgentWrite()
	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if !a.agentWriteOpen || a.agentWriteMode != agentWriteModeExtract || !strings.Contains(a.agentWriteDraft, "demo") {
		t.Fatalf("extract shortcut should open extract modal with session-derived id, open=%v mode=%q draft=%q", a.agentWriteOpen, a.agentWriteMode, a.agentWriteDraft)
	}
}

func TestCatalogBrowser_AgentCatalogRendersHierarchyFirst(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Experts",
		items: []catalogItem{{id: "analysis", title: "Analysis expert", desc: "reviews results"}},
	}

	out := a.viewCatalogBrowser()
	for _, want := range []string{"Expert hierarchy", "Analysis expert", "c create expert", "x extract expert", "o set next turn"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent catalog missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{"Expert actions", "button:agents:create", "button:agents:extract", "create expert  extract expert from session"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("agent catalog should not render management actions as list content %q:\n%s", notWant, out)
		}
	}
}

func TestCatalogBrowser_AgentDetailCloneActionOpensWriteModal(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.AgentWrite = true
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · Data",
		agentID: "data",
		items:   []catalogItem{{id: "agent/data", title: "Expert · Data expert", statusTag: "expert_pack"}},
	}

	_ = a.runCatalogBrowserItemAction("agent-action/clone")

	if !a.agentWriteOpen || a.agentWriteMode != agentWriteModeClone || a.agentWriteSourceID != "data" {
		t.Fatalf("clone action should open clone modal, open=%v mode=%q source=%q", a.agentWriteOpen, a.agentWriteMode, a.agentWriteSourceID)
	}
}

func TestCatalogBrowser_AgentDetailCloneShortcutOpensWriteModal(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.AgentWrite = true
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · Data",
		agentID: "data",
		items: []catalogItem{
			{id: "agent/data", title: "Expert · Data expert", statusTag: "expert_pack"},
		},
	}

	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: 'c', Text: "c"})

	if !a.agentWriteOpen || a.agentWriteMode != agentWriteModeClone || a.agentWriteSourceID != "data" {
		t.Fatalf("clone shortcut should open clone modal, open=%v mode=%q source=%q", a.agentWriteOpen, a.agentWriteMode, a.agentWriteSourceID)
	}
}

func TestCatalogBrowser_AgentDetailActionsRenderOutsideStructureRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.AgentWrite = true
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · Data",
		agentID: "data",
		items: []catalogItem{
			{id: "agent/data", title: "Expert · Data expert", desc: "orchestrates data work", statusTag: "user"},
			{id: "tool/earthscope", title: "Tool · earthscope"},
		},
	}

	out := a.viewCatalogBrowser()
	for _, want := range []string{"Expert actions", "clone", "edit", "delete", "Expert structure", "Expert · Data expert", "Tool · earthscope"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent detail missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"Clone expert", "Edit expert", "Delete expert"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("agent action leaked into structure rows as %q:\n%s", unwanted, out)
		}
	}
}

func TestCatalogBrowser_AgentDeleteRequiresConfirmation(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.AgentWrite = true
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · Data",
		agentID: "data",
		items: []catalogItem{
			{id: "agent/data", title: "Expert · Data expert", statusTag: "user"},
		},
	}

	cmd := a.runCatalogBrowserItemAction("agent-action/delete")
	if cmd == nil {
		t.Fatal("first delete press should schedule a confirmation hint")
	}
	if !a.catalogBrowserOpen || a.catalogBrowser == nil {
		t.Fatal("first delete press should keep agent detail open")
	}
	if a.catalogBrowser.pendingDeleteAgentID != "data" {
		t.Fatalf("pending delete id = %q, want data", a.catalogBrowser.pendingDeleteAgentID)
	}
	if !strings.Contains(a.transientHint, "confirm deleting data") {
		t.Fatalf("transient hint = %q, want confirm deleting data", a.transientHint)
	}
	out := stripANSI(a.viewCatalogBrowser())
	if !strings.Contains(out, "confirm delete") {
		t.Fatalf("armed delete should change the action/hint text:\n%s", out)
	}

	cmd = a.runCatalogBrowserItemAction("agent-action/delete")
	if cmd == nil {
		t.Fatal("second delete press should return the delete command")
	}
	if a.catalogBrowserOpen || a.catalogBrowser != nil {
		t.Fatalf("confirmed delete should close agent detail: open=%v browser=%+v", a.catalogBrowserOpen, a.catalogBrowser)
	}
}

func TestCatalogBrowser_AgentDeleteConfirmationCancelsOnOtherKey(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.AgentWrite = true
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:    catalogKindAgentDetail,
		title:   "Agent · Data",
		agentID: "data",
		items: []catalogItem{
			{id: "agent/data", title: "Expert · Data expert", statusTag: "user"},
		},
	}

	_ = a.runCatalogBrowserItemAction("agent-action/delete")
	if a.catalogBrowser.pendingDeleteAgentID != "data" {
		t.Fatalf("pending delete id = %q, want data", a.catalogBrowser.pendingDeleteAgentID)
	}
	model, cmd := a.handleCatalogBrowserKey(keyMsg("down"))
	a = model.(*App)
	if cmd != nil {
		t.Fatalf("down should only move selection/cancel confirmation, got command %#v", cmd)
	}
	if a.catalogBrowser.pendingDeleteAgentID != "" {
		t.Fatalf("pending delete should clear after navigation, got %q", a.catalogBrowser.pendingDeleteAgentID)
	}
	out := stripANSI(a.viewCatalogBrowser())
	if strings.Contains(out, "confirm delete") {
		t.Fatalf("cancelled delete should not keep confirm action visible:\n%s", out)
	}
}

func TestAgentEditModalUpdatesStructuredFields(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.openAgentEdit(gact.AgentDef{
		ID: "user-agent", Source: "user", Title: "User Agent", Description: "old",
		Tools: []string{"read_file"}, Keywords: []string{"old"}, Enabled: true,
	})

	a.setAgentEditField(1)
	a.agentEditDraft.Description = ""
	a.agentEditCursor = 0
	a.insertAgentEditText("new description")
	if a.agentEditDraft.Description != "new description" {
		t.Fatalf("description = %q", a.agentEditDraft.Description)
	}

	a.setAgentEditField(3)
	a.agentEditDraft.Tools = nil
	a.insertAgentEditText("read_file, mcp.parquet.read")
	if got := strings.Join(a.agentEditDraft.Tools, ","); got != "read_file,mcp.parquet.read" {
		t.Fatalf("tools = %q", got)
	}
	a.setAgentEditField(5)
	_, _ = a.handleAgentEditKey(keyMsg("left"))
	if a.agentEditDraft.Enabled {
		t.Fatal("enabled toggle did not flip")
	}
}

func TestAgentWriteSanitizesIDs(t *testing.T) {
	if got := sanitizeAgentID("  Data Expert Copy!  "); got != "data-expert-copy" {
		t.Fatalf("sanitizeAgentID = %q", got)
	}
	if got := titleFromAgentID("data-expert.copy"); got != "Data Expert Copy" {
		t.Fatalf("titleFromAgentID = %q", got)
	}
}

func TestAgentWritePasteCompactsMultilineID(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.openAgentWrite(agentWriteModeCreate, "", "")

	_, _ = a.Update(tea.PasteMsg{Content: " Data\r\nExpert \nCopy! "})

	if a.agentWriteDraft != "Data Expert Copy!" {
		t.Fatalf("agent write draft = %q, want compact single-line paste", a.agentWriteDraft)
	}
	if a.agentWriteCursor != len([]rune(a.agentWriteDraft)) {
		t.Fatalf("agent write cursor = %d, want end of draft %d", a.agentWriteCursor, len([]rune(a.agentWriteDraft)))
	}
	if strings.ContainsAny(a.agentWriteDraft, "\r\n") {
		t.Fatalf("agent write paste kept raw newlines: %q", a.agentWriteDraft)
	}
}

func TestCatalogBrowser_EnterOnSkillDrillsIntoDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	parent := &catalogBrowserState{
		kind:  catalogKindSkills,
		title: "Skills",
		items: []catalogItem{{id: "tui-test", title: "TUI Test", statusTag: "skill"}},
	}
	a.catalogBrowserOpen = true
	a.catalogBrowser = parent

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalogBrowser == parent {
		t.Fatal("enter on skill row did not replace browser with agent detail state")
	}
	if a.catalogBrowser.kind != catalogKindAgentDetail {
		t.Fatalf("browser kind = %v, want catalogKindAgentDetail", a.catalogBrowser.kind)
	}
	if a.catalogBrowser.agentID != "tui-test" {
		t.Fatalf("agentID = %q, want tui-test", a.catalogBrowser.agentID)
	}
	if cmd == nil {
		t.Fatal("expected skill detail load command")
	}
}

func TestLoadAgentsCatalogIncludesChildAgents(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/agents" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"agents": [
				{"id":"data","source":"builtin","title":"Data expert","tier":2},
				{"id":"ndp_catalog","source":"builtin","title":"NDP catalog","tier":3,"specialization":"data_analysis","metadata":{"parent":"data"}},
				{"id":"tui-test","source":"skill","title":"TUI Test","tier":3}
			]
		}`))
	}))
	defer server.Close()

	msg := loadCatalogBrowserCmd(client.New(server.URL), catalogKindAgents, client.RuntimeScope{})()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("message type = %T, want catalogBrowserLoadedMsg", msg)
	}
	if loaded.errText != "" {
		t.Fatalf("unexpected catalog load error: %s", loaded.errText)
	}

	ids := map[string]bool{}
	var childDesc, childInline string
	for _, item := range loaded.items {
		if strings.HasPrefix(item.id, "action/") {
			t.Fatalf("agents catalog should not mix management actions into agent rows: %#v", loaded.items)
		}
		ids[item.id] = true
		if item.id == "ndp_catalog" {
			childDesc = item.desc
			childInline = item.inlineDesc
		}
	}
	if !ids["data"] || !ids["ndp_catalog"] {
		t.Fatalf("agents catalog should include parent and child agents, got %#v", loaded.items)
	}
	if ids["tui-test"] {
		t.Fatalf("agents catalog should exclude skills, got %#v", loaded.items)
	}
	if !strings.Contains(childDesc, "reports to Data expert") {
		t.Fatalf("child agent row should expose parent relationship, got %q", childDesc)
	}
	if !strings.Contains(childInline, "reports to Data expert") {
		t.Fatalf("child agent inline summary should expose parent in operator wording, got %q", childInline)
	}
	if !strings.Contains(childInline, "data analysis") || strings.Contains(childInline, "data_analysis") {
		t.Fatalf("child agent inline summary should humanize specialization, got %q", childInline)
	}
	if strings.Contains(childInline, "can use:") || strings.Contains(childInline, "model:") {
		t.Fatalf("child agent inline summary should stay compact, got %q", childInline)
	}
}

func TestCatalogBrowser_EnterOnToolRowLoadsToolDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{id: "shell_bash", title: "shell_bash"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if cmd == nil {
		t.Fatal("enter on tool row should fetch tool detail")
	}
}

func TestCatalogDetailLoadedOpensScrollableDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{kind: catalogKindTools, title: "Tools"}

	model, _ := a.Update(catalogDetailLoadedMsg{
		title: "Tool · shell_bash",
		text:  "owner: utility\nvisible_to: chat, planner, utility\ninput_schema:\n{}",
	})
	got := model.(*App)

	if !got.detailViewOpen || got.detailView == nil {
		t.Fatal("catalog detail should open detail view")
	}
	if !got.catalogBrowserOpen || got.catalogBrowser == nil {
		t.Fatal("catalog detail should keep the catalog behind the foreground detail view")
	}
	if !strings.Contains(got.detailView.fullText, "workflow area: utility") ||
		!strings.Contains(got.detailView.fullText, "available to: chat") ||
		!strings.Contains(got.detailView.fullText, "inputs:") {
		t.Fatalf("detail missing tool inspector metadata:\n%s", got.detailView.fullText)
	}
	for _, raw := range []string{"owner:", "visible_to:", "input_schema:"} {
		if strings.Contains(got.detailView.fullText, raw) {
			t.Fatalf("catalog detail should avoid raw label %q:\n%s", raw, got.detailView.fullText)
		}
	}
}

func TestCatalogDetailLoadedErrorUsesOperatorCopy(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{kind: catalogKindTools, title: "Tools"}

	model, _ := a.Update(catalogDetailLoadedMsg{
		title: "Tool · legacy_waveform_fetch",
		err:   &client.Error{Status: 503, Code: "tool_unavailable", Message: "tool unavailable: the EarthScope connector is not loaded in this workspace"},
	})
	got := model.(*App)

	if !got.detailViewOpen || got.detailView == nil {
		t.Fatal("catalog detail error should open detail view")
	}
	if !got.catalogBrowserOpen || got.catalogBrowser == nil {
		t.Fatal("catalog detail error should keep the catalog behind the foreground detail view")
	}
	for _, want := range []string{
		"Unable to load this detail.",
		"Reason: tool unavailable: the EarthScope connector is not loaded in this workspace",
	} {
		if !strings.Contains(got.detailView.fullText, want) {
			t.Fatalf("detail error missing %q:\n%s", want, got.detailView.fullText)
		}
	}
	for _, raw := range []string{"gact:", "tool_unavailable"} {
		if strings.Contains(got.detailView.fullText, raw) {
			t.Fatalf("detail error leaked raw backend wrapper %q:\n%s", raw, got.detailView.fullText)
		}
	}
}

func TestSanitizeCatalogDetailTextHumanizesBackendLabels(t *testing.T) {
	raw := strings.Join([]string{
		"owner: utility",
		"visible_to: chat, planner",
		"input_schema:",
		"  {}",
		"provider_id: argonne",
		"model_id: gpt-oss",
		"\"provider_id\": \"kept inside json\"",
	}, "\n")

	out := sanitizeCatalogDetailText(raw)
	for _, want := range []string{
		"workflow area: utility",
		"available to: chat, planner",
		"inputs:",
		"provider: argonne",
		"model: gpt-oss",
		"\"provider_id\": \"kept inside json\"",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("sanitized detail missing %q:\n%s", want, out)
		}
	}
	for _, rawLabel := range []string{"owner:", "visible_to:", "input_schema:", "provider_id:", "model_id:"} {
		if strings.Contains(out, rawLabel) && !strings.Contains(rawLabel, "\"") {
			t.Fatalf("sanitized detail leaked raw label %q:\n%s", rawLabel, out)
		}
	}
}

func TestCatalogBrowser_EnterOnAgentDetailRowOpensDetailModal(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Main Agent",
		items: []catalogItem{
			{id: "prompt", title: "Prompt", desc: "Route to the right expert."},
		},
	}

	_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("enter on agent detail row should open detail modal")
	}
	if a.detailView.title != "Prompt" || !strings.Contains(a.detailView.fullText, "Route to") {
		t.Fatalf("unexpected detail view: %#v", a.detailView)
	}
}

func TestLoadAgentDetailIncludesPlannerVisibleCommands(t *testing.T) {
	var commandQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/agents/clio.expert.data":
			writeJSONForTest(t, w, gact.AgentDef{ID: "clio.expert.data", Title: "Data Expert", Source: "user", Enabled: true})
		case "/v1/agents":
			writeJSONForTest(t, w, map[string]any{"agents": []gact.AgentDef{{ID: "clio.expert.data", Title: "Data Expert", Source: "user", Enabled: true}}})
		case "/v1/tools":
			writeJSONForTest(t, w, map[string]any{"tools": []gact.Tool{}})
		case "/v1/commands":
			commandQuery = r.URL.RawQuery
			trueValue := true
			writeJSONForTest(t, w, map[string]any{"commands": []gact.Command{{
				ID: "/summarize", Title: "Summarize dataset", Source: "user",
				AgentID: "clio.expert.data", PlannerVisible: &trueValue, AgentInvocable: &trueValue,
				ArgumentHint: "dataset_id required",
			}}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	msg := loadAgentDetailCmd(client.New(srv.URL), "clio.expert.data", client.RuntimeScope{WorkspaceID: "ws1", SessionID: "s1"})()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("msg = %T, want catalogBrowserLoadedMsg", msg)
	}
	found := false
	for _, item := range loaded.items {
		if strings.HasPrefix(item.id, "agent-action/") {
			t.Fatalf("agent action %q should not be mixed into expert structure rows: %#v", item.id, loaded.items)
		}
		if item.id == "command//summarize" {
			found = strings.Contains(item.title, "Summarize dataset") && strings.Contains(item.desc, "planner") && strings.Contains(item.desc, "dataset_id required")
		}
	}
	if !found {
		t.Fatalf("planner command row missing from agent detail: %#v", loaded.items)
	}
	for _, want := range []string{"workspace_id=ws1", "session_id=s1", "agent_id=clio.expert.data", "planner=true"} {
		if !strings.Contains(commandQuery, want) {
			t.Fatalf("command query missing %q: %s", want, commandQuery)
		}
	}
}

func TestCatalogBrowser_EnterOnAgentDetailToolLoadsToolDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Utility",
		items: []catalogItem{{id: "tool/shell_bash", title: "Tool · shell_bash"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if cmd == nil {
		t.Fatal("enter on agent tool row should fetch tool detail")
	}
}

func TestCatalogBrowser_EnterOnAgentDetailChildDrills(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Data",
		items: []catalogItem{{id: "agent/ndp_catalog", title: "Child agent · NDP Catalog"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalogBrowser.kind != catalogKindAgentDetail || a.catalogBrowser.agentID != "ndp_catalog" {
		t.Fatalf("child drill did not open ndp_catalog detail: %#v", a.catalogBrowser)
	}
	if cmd == nil {
		t.Fatal("expected child agent detail load command")
	}
}

func TestCatalogBrowser_EnterOnAgentDetailMcpServerDrills(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentDetail,
		title: "Agent · Data",
		items: []catalogItem{{id: "mcpserver/mcp_ndp", title: "MCP connection · mcp_ndp"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if a.catalogBrowser.kind != catalogKindMcpDetail || a.catalogBrowser.mcpServerID != "mcp_ndp" {
		t.Fatalf("MCP drill did not open mcp_ndp detail: %#v", a.catalogBrowser)
	}
	if cmd == nil {
		t.Fatal("expected MCP detail load command")
	}
}

func TestLoadAgentDetailSurfacesCapabilityRefs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/agents/data":
			writeJSONForTest(t, w, gact.AgentDef{
				ID:     "data",
				Title:  "Data",
				Source: "expert_pack",
				CapabilityRefs: []gact.AgentCapabilityRef{
					{Kind: "tool", ID: "hdf5_analyze_dataset", Status: "available", Source: "builtin"},
					{Kind: "command", ID: "/optimize", Status: "unavailable", Metadata: map[string]any{"error": "not_implemented"}},
				},
			})
		case "/v1/agents":
			writeJSONForTest(t, w, map[string]any{"agents": []gact.AgentDef{}})
		case "/v1/tools":
			writeJSONForTest(t, w, map[string]any{"tools": []gact.Tool{}})
		case "/v1/commands":
			writeJSONForTest(t, w, map[string]any{"commands": []gact.Command{}})
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	msg := loadAgentDetailCmd(client.New(server.URL), "data", client.RuntimeScope{})()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("msg = %T, want catalogBrowserLoadedMsg", msg)
	}
	var joined strings.Builder
	for _, item := range loaded.items {
		joined.WriteString(item.title)
		joined.WriteString(" ")
		joined.WriteString(item.desc)
		joined.WriteString("\n")
	}
	out := joined.String()
	for _, want := range []string{"hdf5_analyze_dataset", "available", "/optimize", "unavailable", "not_implemented"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent capability refs missing %q:\n%s", want, out)
		}
	}
}

func TestCatalogBrowser_EnterOnAgentBlueprintHookEnablesPackagedHook(t *testing.T) {
	var gotPath string
	var gotReq gact.AgentBlueprintHookEnableRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.Method + " " + r.URL.EscapedPath()
		if err := json.NewDecoder(r.Body).Decode(&gotReq); err != nil {
			t.Fatalf("decode hook enable request: %v", err)
		}
		writeJSONForTest(t, w, map[string]any{"id": "agent_blueprint_hook_bp1_pre_message"})
	}))
	defer server.Close()

	a := newReadyApp(nil, nil)
	a.c = client.New(server.URL)
	a.wsID = "ws1"
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Data",
		blueprintID: "bp1",
		items:       []catalogItem{{id: "hook/pre_message", title: "Hook · Pre Message"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("enter on blueprint hook row should enable packaged hook")
	}
	msg := cmd()
	got, ok := msg.(agentBlueprintHookEnabledMsg)
	if !ok {
		t.Fatalf("cmd msg = %T, want agentBlueprintHookEnabledMsg", msg)
	}
	if got.err != nil {
		t.Fatalf("enable hook command failed: %v", got.err)
	}
	if gotPath != "POST /v1/agent-blueprints/bp1/hooks/pre_message/enable" {
		t.Fatalf("hook enable path = %q", gotPath)
	}
	if gotReq.WorkspaceID != "ws1" || !gotReq.Trust {
		t.Fatalf("hook enable request = %#v, want workspace and explicit trust", gotReq)
	}
}

func TestAgentBlueprintManagedMsgSurfacesFailuresTruthfully(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Data",
		blueprintID: "bp1",
		items:       []catalogItem{{id: "blueprint-action/update", title: "Update"}},
	}

	model, cmd := a.Update(agentBlueprintManagedMsg{
		blueprintID: "bp1",
		action:      "updated",
		err:         errors.New("git fetch exited 128"),
	})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("failed blueprint management should schedule transient hint expiry")
	}
	if !a.catalogBrowserOpen || a.catalogBrowser == nil || a.catalogBrowser.blueprintID != "bp1" {
		t.Fatalf("failed update should leave detail browser open for inspection: open=%v browser=%+v", a.catalogBrowserOpen, a.catalogBrowser)
	}
	if got := a.transientHint; got != "agent blueprint update failed: git fetch exited 128" {
		t.Fatalf("failure hint = %q", got)
	}
}

func TestAgentBlueprintManagedMsgNormalizesClientFailures(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Broken",
		blueprintID: "broken-blueprint",
		items:       []catalogItem{{id: "blueprint-action/update", title: "Update"}},
	}

	model, _ := a.Update(agentBlueprintManagedMsg{
		blueprintID: "broken-blueprint",
		action:      "updated",
		err: &client.Error{
			Status:  409,
			Code:    "update_failed",
			Message: "agent blueprint update failed: validation errors must be fixed first",
		},
	})
	a = model.(*App)
	if got := a.transientHint; got != "agent blueprint update failed: validation errors must be fixed first" {
		t.Fatalf("failure hint = %q", got)
	}
	if strings.Contains(a.transientHint, "update_failed") || strings.Contains(a.transientHint, "gact:") {
		t.Fatalf("failure hint leaked backend wrapper: %q", a.transientHint)
	}
}

func TestAgentBlueprintSourceManagedMsgNormalizesClientFailures(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		items: []catalogItem{{id: "source/data-semantics-agents", title: "Data Semantics Agents"}},
	}

	model, _ := a.Update(agentBlueprintSourceManagedMsg{
		sourceID: "data-semantics-agents",
		action:   "refreshed",
		err: &client.Error{
			Status:  503,
			Code:    "source_refresh_failed",
			Message: "marketplace source refresh failed: unable to fetch remote refs",
		},
	})
	a = model.(*App)
	if got := a.transientHint; got != "marketplace source refresh failed: unable to fetch remote refs" {
		t.Fatalf("failure hint = %q", got)
	}
	if strings.Contains(a.transientHint, "source_refresh_failed") || strings.Contains(a.transientHint, "gact:") {
		t.Fatalf("failure hint leaked backend wrapper: %q", a.transientHint)
	}
}

func TestAgentBlueprintManageDoneMsgNormalizesClientFailures(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.openAgentBlueprintManage(agentBlueprintManageInstall)
	a.agentBlueprintManageSaving = true

	model, cmd := a.Update(agentBlueprintManageDoneMsg{
		action: agentBlueprintManageInstall,
		source: "install-fail",
		err: &client.Error{
			Status:  502,
			Code:    "install_failed",
			Message: "agent blueprint install failed: source archive is missing AGENT.md",
		},
	})
	a = model.(*App)
	if cmd != nil {
		t.Fatal("failed install should not dispatch follow-up command")
	}
	if !a.agentBlueprintManageOpen || a.agentBlueprintManageSaving {
		t.Fatalf("failed install should keep modal open and clear saving: open=%v saving=%v", a.agentBlueprintManageOpen, a.agentBlueprintManageSaving)
	}
	if got := a.agentBlueprintManageErr; got != "agent blueprint install failed: source archive is missing AGENT.md" {
		t.Fatalf("manage error = %q", got)
	}
	if strings.Contains(a.agentBlueprintManageErr, "install_failed") || strings.Contains(a.agentBlueprintManageErr, "gact:") {
		t.Fatalf("manage error leaked backend wrapper: %q", a.agentBlueprintManageErr)
	}
}

func TestCatalogBrowser_AgentBlueprintDetailActionsRenderOutsideStructureRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Seismic",
		blueprintID: "seismic",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "blueprint/seismic", title: "Blueprint · Seismic", desc: "review waveforms"},
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
			{id: "agent/main", title: "Agent · Main"},
			{id: "mcp/earthscope", title: "MCP · EarthScope"},
		},
	}

	out := a.viewCatalogBrowser()
	for _, want := range []string{"Blueprint actions", "activate", "update", "delete", "Blueprint structure", "Blueprint · Seismic", "Agent · Main", "MCP · EarthScope"} {
		if !strings.Contains(out, want) {
			t.Fatalf("blueprint detail missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"Activate for current session", "Update installed blueprint", "Delete installed blueprint"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("blueprint action leaked into structure rows as %q:\n%s", unwanted, out)
		}
	}
}

func TestCatalogBrowser_AgentBlueprintDeleteRequiresConfirmation(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Seismic",
		blueprintID: "seismic",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "blueprint/seismic", title: "Blueprint · Seismic"},
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
			{id: "agent/main", title: "Agent · Main"},
		},
	}

	cmd := a.runCatalogBrowserItemAction("blueprint-action/delete")
	if cmd == nil {
		t.Fatal("first delete press should schedule a confirmation hint")
	}
	if !a.catalogBrowserOpen || a.catalogBrowser == nil {
		t.Fatal("first delete press should keep blueprint detail open")
	}
	if a.catalogBrowser.pendingDeleteBlueprintID != "seismic" {
		t.Fatalf("pending delete id = %q, want seismic", a.catalogBrowser.pendingDeleteBlueprintID)
	}
	if !strings.Contains(a.transientHint, "confirm deleting seismic") {
		t.Fatalf("transient hint = %q, want confirm deleting seismic", a.transientHint)
	}
	out := stripANSI(a.viewCatalogBrowser())
	if !strings.Contains(out, "confirm delete") {
		t.Fatalf("armed delete should change the action/hint text:\n%s", out)
	}

	cmd = a.runCatalogBrowserItemAction("blueprint-action/delete")
	if cmd == nil {
		t.Fatal("second delete press should return the delete command")
	}
	if !a.catalogBrowserOpen || a.catalogBrowser == nil {
		t.Fatalf("confirmed delete should keep detail open until result: open=%v browser=%+v", a.catalogBrowserOpen, a.catalogBrowser)
	}

	model, follow := a.Update(agentBlueprintManagedMsg{blueprintID: "seismic", action: "deleted"})
	a = model.(*App)
	if follow == nil {
		t.Fatal("successful delete should schedule hint expiry")
	}
	if a.catalogBrowserOpen || a.catalogBrowser != nil {
		t.Fatalf("successful delete result should close blueprint detail: open=%v browser=%+v", a.catalogBrowserOpen, a.catalogBrowser)
	}
}

func TestCatalogBrowser_AgentBlueprintDeleteFailureKeepsDetailOpen(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Broken",
		blueprintID: "broken-blueprint",
		items: []catalogItem{
			{id: "blueprint/broken-blueprint", title: "Blueprint · Broken"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
		},
	}

	model, cmd := a.Update(agentBlueprintManagedMsg{
		blueprintID: "broken-blueprint",
		action:      "deleted",
		err: &client.Error{
			Status:  409,
			Code:    "delete_failed",
			Message: "agent blueprint delete failed: workspace policy is locking this blueprint",
		},
	})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("failed delete should schedule hint expiry")
	}
	if !a.catalogBrowserOpen || a.catalogBrowser == nil || a.catalogBrowser.blueprintID != "broken-blueprint" {
		t.Fatalf("failed delete should leave detail open: open=%v browser=%+v", a.catalogBrowserOpen, a.catalogBrowser)
	}
	if got := a.transientHint; got != "agent blueprint delete failed: workspace policy is locking this blueprint" {
		t.Fatalf("failure hint = %q", got)
	}
	if strings.Contains(a.transientHint, "delete_failed") || strings.Contains(a.transientHint, "gact:") {
		t.Fatalf("failure hint leaked backend wrapper: %q", a.transientHint)
	}
}

func TestCatalogBrowser_AgentBlueprintDeleteConfirmationCancelsOnOtherKey(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Seismic",
		blueprintID: "seismic",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "blueprint/seismic", title: "Blueprint · Seismic"},
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
			{id: "agent/main", title: "Agent · Main"},
		},
	}

	_ = a.runCatalogBrowserItemAction("blueprint-action/delete")
	if a.catalogBrowser.pendingDeleteBlueprintID != "seismic" {
		t.Fatalf("pending delete id = %q, want seismic", a.catalogBrowser.pendingDeleteBlueprintID)
	}
	model, cmd := a.handleCatalogBrowserKey(keyMsg("down"))
	a = model.(*App)
	if cmd != nil {
		t.Fatalf("down should only move selection/cancel confirmation, got command %#v", cmd)
	}
	if a.catalogBrowser.pendingDeleteBlueprintID != "" {
		t.Fatalf("pending delete should clear after navigation, got %q", a.catalogBrowser.pendingDeleteBlueprintID)
	}
	out := stripANSI(a.viewCatalogBrowser())
	if strings.Contains(out, "confirm delete") {
		t.Fatalf("cancelled delete should not keep confirm action visible:\n%s", out)
	}
}

func TestCatalogBrowser_AgentBlueprintBlockedActivationButtonIsExplicit(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Broken",
		blueprintID: "broken",
		items: []catalogItem{
			{id: "validation", title: "Check · Validation errors", desc: "root expert not found", statusTag: "error"},
			{id: "activate", title: "Activate for current session", desc: "cannot activate until validation errors are resolved", statusTag: "blocked", disabled: true},
			{id: "blueprint/broken", title: "Blueprint · Broken"},
		},
	}

	out := stripANSI(a.viewCatalogBrowser())
	if !strings.Contains(out, "Blueprint actions") || !strings.Contains(out, "activation blocked") {
		t.Fatalf("blocked activation should be explicit in action bar:\n%s", out)
	}
	if strings.Contains(out, " activate ") {
		t.Fatalf("blocked activation should not invite the user with an activate button:\n%s", out)
	}
}

func TestCatalogBrowser_ActiveAgentBlueprintActionReadsAsState(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Seismic",
		blueprintID: "seismic",
		items: []catalogItem{
			{id: "activate", title: "Active for current session", desc: "already active", statusTag: "active"},
			{id: "blueprint/seismic", title: "Blueprint · Seismic", statusTag: "active"},
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
			{id: "agent/main", title: "Agent · Main"},
		},
	}

	out := stripANSI(a.viewCatalogBrowser())
	for _, want := range []string{"Blueprint actions", "update", "delete", "Blueprint status", "active in selected session", "already active"} {
		if !strings.Contains(out, want) {
			t.Fatalf("active blueprint detail missing %q:\n%s", want, out)
		}
	}
	for _, button := range a.agentBlueprintDetailActionButtons() {
		if button.label == "active" || button.label == "activate" {
			t.Fatalf("active blueprint should render state outside action buttons, got button %#v", button)
		}
	}
	if strings.Contains(out, "a activate") || strings.Contains(out, "Active for current session") {
		t.Fatalf("active blueprint should not invite activation in controls or structure rows:\n%s", out)
	}
}

func TestCatalogBrowser_ActiveAgentBlueprintShortcutDoesNotReactivate(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Seismic",
		blueprintID: "seismic",
		items: []catalogItem{
			{id: "activate", title: "Active for current session", desc: "already active", statusTag: "active"},
			{id: "blueprint/seismic", title: "Blueprint · Seismic", statusTag: "active"},
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint-action/delete", title: "Delete installed blueprint"},
		},
	}

	_, cmd := a.handleCatalogBrowserKey(keyMsg("a"))
	if cmd == nil {
		t.Fatal("active shortcut should produce a visible hint")
	}
	if !strings.Contains(a.transientHint, "already active") {
		t.Fatalf("active shortcut should not reactivate, hint = %q", a.transientHint)
	}
}

func TestCatalogBrowser_AgentBlueprintDetailHumanizesRenderedBackendEnums(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Demo",
		blueprintID: "demo",
		items: []catalogItem{
			{id: "activate", title: "Activate for current session"},
			{id: "hook/pre_message", title: "Automation · Hook · Pre Message", inlineDesc: "runs on pre_message · disabled · provided by agent blueprint", statusTag: "agent_blueprint"},
			{id: "agent/data", title: "Expert · Data Root", inlineDesc: "1 tool", statusTag: "agent_blueprint"},
		},
	}

	out := stripANSI(a.viewCatalogBrowser())
	if strings.Contains(out, "agent_blueprint") {
		t.Fatalf("blueprint detail should not render raw backend source enums:\n%s", out)
	}
	if got := strings.Count(out, "[agent blueprint]"); got != 2 {
		t.Fatalf("blueprint detail should humanize raw status tags twice, got %d:\n%s", got, out)
	}
}

func TestCatalogBrowser_AgentBlueprintDetailUpdateShortcutDispatchesAction(t *testing.T) {
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.EscapedPath() == "/v1/agent-blueprints/bp1/update" {
			called = true
			writeJSONForTest(t, w, map[string]any{"status": "updated"})
			return
		}
		t.Fatalf("unexpected request: %s %s", r.Method, r.URL.EscapedPath())
	}))
	defer server.Close()

	a := newReadyApp(nil, nil)
	a.c = client.New(server.URL)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Data",
		blueprintID: "bp1",
		items: []catalogItem{
			{id: "blueprint-action/update", title: "Update installed blueprint"},
			{id: "blueprint/bp1", title: "Blueprint · Data"},
		},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: 'u', Text: "u"})
	if cmd == nil {
		t.Fatal("update shortcut did not dispatch command")
	}
	msg := cmd()
	if _, ok := msg.(agentBlueprintManagedMsg); !ok {
		t.Fatalf("update shortcut msg = %T, want agentBlueprintManagedMsg", msg)
	}
	if !called {
		t.Fatal("update shortcut did not call backend")
	}
}

func TestAgentBlueprintManagedMsgReloadsCurrentDetailOnSuccess(t *testing.T) {
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.Method + " " + r.URL.EscapedPath()
		writeJSONForTest(t, w, gact.AgentBlueprintDetail{
			AgentBlueprint: gact.AgentBlueprintDefinition{ID: "bp1", Title: "Blueprint One", Scope: "workspace"},
		})
	}))
	defer server.Close()

	a := newReadyApp(nil, nil)
	a.c = client.New(server.URL)
	a.wsID = "ws1"
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindAgentBlueprintDetail,
		title:       "Agent Blueprint · Data",
		blueprintID: "bp1",
		items:       []catalogItem{{id: "blueprint-action/update", title: "Update"}},
	}

	model, cmd := a.Update(agentBlueprintManagedMsg{
		blueprintID: "bp1",
		action:      "updated",
		result:      map[string]any{"status": "updated"},
	})
	a = model.(*App)
	if got := a.transientHint; got != "agent blueprint updated: bp1" {
		t.Fatalf("success hint = %q", got)
	}
	if cmd == nil {
		t.Fatal("successful detail update should reload the current blueprint detail")
	}
	msg := cmd()
	if batch, ok := msg.(tea.BatchMsg); ok {
		for _, c := range batch {
			if c == nil {
				continue
			}
			if loaded, ok := c().(catalogBrowserLoadedMsg); ok {
				msg = loaded
				break
			}
		}
	}
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("reload cmd returned %T, want catalogBrowserLoadedMsg", msg)
	}
	if loaded.errText != "" || loaded.blueprintID != "bp1" || len(loaded.items) == 0 {
		t.Fatalf("loaded detail = %#v", loaded)
	}
	if gotPath != "GET /v1/agent-blueprints/bp1" {
		t.Fatalf("reload path = %q", gotPath)
	}
}

func TestCatalogBrowser_EnterOnAgentBlueprintSourceOpensSourceDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: []catalogItem{{
			id:    "source/0",
			title: "Source · git · https://example.org/community/seismic-agents.git",
			desc:  "Marketplace Source\nsource: https://example.org/community/seismic-agents.git\nblueprints: Seismic Marketplace",
		}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd != nil {
		t.Fatal("source detail should open locally without backend command")
	}
	if !a.detailViewOpen || a.detailView == nil {
		t.Fatal("source row should open detail view")
	}
	if !strings.Contains(a.detailView.fullText, "blueprints: Seismic Marketplace") {
		t.Fatalf("source detail missing blueprint list:\n%s", a.detailView.fullText)
	}
}

func TestCatalogBrowser_EnterOnAgentBlueprintSourceRegistryOpensSourceBrowser(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: []catalogItem{{
			id:        "action/source-registry",
			title:     "Marketplace sources",
			desc:      "Browse configured marketplace sources and install blueprints from them.",
			statusTag: "sources",
		}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("source registry row should load marketplace sources")
	}
	if !a.catalogBrowserOpen || a.catalogBrowser == nil || a.catalogBrowser.kind != catalogKindAgentBlueprintSources {
		t.Fatalf("source registry should switch to source browser, got %#v", a.catalogBrowser)
	}
	if a.catalogBrowser.parent == nil || a.catalogBrowser.parent.kind != catalogKindAgentBlueprints {
		t.Fatalf("source browser should retain parent catalog, got %#v", a.catalogBrowser.parent)
	}
}

func TestCatalogBrowser_AgentBlueprintSourceRegistryItemsExposeActions(t *testing.T) {
	items := agentBlueprintSourceRegistryItems([]gact.AgentBlueprintSource{{
		ID:           "src1",
		Name:         "Data Semantics Agents",
		Source:       "git@github.com:example/agents.git",
		SourceKind:   "git",
		Ref:          "main",
		PinnedCommit: "abcdef123456",
		Status:       "ready",
		AvailableBlueprints: []gact.AgentBlueprintDefinition{{
			ID:         "seismic-waveform-review",
			Title:      "Seismic Waveform Review",
			Version:    "0.1.0",
			RootExpert: "orchestrator",
			Scope:      "marketplace",
			Enabled:    true,
		}},
	}})
	if len(items) != 2 {
		t.Fatalf("items len = %d, want source row and blueprint row: %#v", len(items), items)
	}
	if items[0].id != "source/src1" || items[0].statusTag != "ready" {
		t.Fatalf("source row = %#v", items[0])
	}
	if items[0].title != "▾ Data Semantics Agents" {
		t.Fatalf("source row title should be the source name, got %#v", items[0])
	}
	for _, want := range []string{"Git marketplace", "branch main", "ready", "pinned abcdef12", "1 available"} {
		if !strings.Contains(items[0].inlineDesc, want) {
			t.Fatalf("source row inline summary missing %q:\n%#v", want, items[0])
		}
	}
	for _, notWant := range []string{"git repository", "git source", "ref main", "status ready", "commit abcdef", "1 blueprint"} {
		if strings.Contains(items[0].inlineDesc, notWant) {
			t.Fatalf("source row inline summary leaked backend wording %q:\n%#v", notWant, items[0])
		}
	}
	for _, want := range []string{
		"Marketplace connection",
		"name: Data Semantics Agents",
		"status: ready",
		"available: 1 blueprint",
		"Repository",
		"url: git@github.com:example/agents.git",
		"type: git",
		"branch: main",
		"pinned revision: abcdef123456",
		"Registry",
		"registry id: src1",
		"Operator paths",
		"refresh source",
		"install blueprint",
		"remove source",
	} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("source row missing %q:\n%s", want, items[0].desc)
		}
	}
	for _, raw := range []string{"Source summary", "Marketplace source", "location:", "kind:", "branch/ref:", "current commit:", "pinned commit:", "available blueprints:", "source id:", "last updated:", "added to registry:", "\n  commit: abcdef"} {
		if strings.Contains(items[0].desc, raw) {
			t.Fatalf("source row detail leaked backend label %q:\n%s", raw, items[0].desc)
		}
	}
	for _, raw := range []string{"press r", "press d", "press Enter"} {
		if strings.Contains(items[0].desc, raw) {
			t.Fatalf("source row should keep keypress prose out of the body, found %q:\n%s", raw, items[0].desc)
		}
	}
	if items[1].id != "source-blueprint/src1/seismic-waveform-review" || items[1].statusTag != "0.1.0" {
		t.Fatalf("blueprint row = %#v", items[1])
	}
	if !strings.Contains(items[1].title, "Seismic Waveform Review") || strings.Contains(items[1].title, "Install") {
		t.Fatalf("source-registry blueprint row should be content, not an action label: %#v", items[1])
	}
	if items[1].inlineDesc != "available to install" {
		t.Fatalf("source-registry blueprint row should keep hierarchy compact: %#v", items[1])
	}
	for _, notWant := range []string{"v0.1.0", "version 0.1.0", "starts at", "orchestrator"} {
		if strings.Contains(items[1].inlineDesc, notWant) {
			t.Fatalf("source-registry blueprint row leaked noisy metadata %q: %#v", notWant, items[1])
		}
	}
	sourceID, blueprintID, ok := parseSourceBlueprintItemID(items[1].id)
	if !ok || sourceID != "src1" || blueprintID != "seismic-waveform-review" {
		t.Fatalf("parseSourceBlueprintItemID = %q, %q, %v", sourceID, blueprintID, ok)
	}
	cb := &catalogBrowserState{kind: catalogKindAgentBlueprintSources, items: items, sel: 0}
	if hint := catalogBrowserHintText(cb); !strings.Contains(hint, "Enter source details") || strings.Contains(hint, "details/install") {
		t.Fatalf("source row hint should be specific, got %q", hint)
	}
	cb.sel = 1
	if hint := catalogBrowserHintText(cb); !strings.Contains(hint, "Enter install selected blueprint") || strings.Contains(hint, "details/install") {
		t.Fatalf("blueprint row hint should be specific, got %q", hint)
	}
	if hint := catalogBrowserHintText(cb); strings.Contains(hint, "d remove") || strings.Contains(hint, "r refresh") {
		t.Fatalf("blueprint row hint should not expose source management actions, got %q", hint)
	}
}

func TestAgentBlueprintCatalogStressItemsPreserveHierarchyAndActiveMarker(t *testing.T) {
	blueprints := []gact.AgentBlueprintDefinition{{
		ID:         "active-long",
		Version:    "0.9.0",
		Title:      "San Diego EarthScope and NDP Live Benchmark Review With Very Long Name",
		Scope:      "workspace",
		RootExpert: "orchestrator",
		Enabled:    true,
		Metadata: map[string]any{"install": map[string]any{
			"source":      "https://aaa.example.org/very-long-source.git",
			"source_kind": "git",
			"status":      "installed",
		}},
	}, {
		ID:         "disabled-long",
		Version:    "0.8.0",
		Title:      "Disabled Benchmark Blueprint With Long Title",
		Scope:      "workspace",
		RootExpert: "orchestrator",
		Enabled:    false,
		Metadata: map[string]any{"install": map[string]any{
			"source":      "https://bbb.example.org/disabled-source.git",
			"source_kind": "git",
			"status":      "disabled",
		}},
	}}
	items := markActiveAgentBlueprintCatalogItems(agentBlueprintCatalogItems(blueprints), "active-long", "workspace")

	joined := catalogItemsTextForTest(items)
	for _, want := range []string{
		"Source · very-long-source",
		"└─ ◆ San Diego EarthScope and NDP Live Benchmark Review With Very Long Name",
		"active in selected session",
		"Source · disabled-source",
		"Disabled Benchmark Blueprint With Long Title",
		"disabled",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("stress catalog items missing %q:\n%s", want, joined)
		}
	}
}

func TestAgentBlueprintDetailStressItemsPreserveNestedExperts(t *testing.T) {
	items := agentBlueprintDetailItems(gact.AgentBlueprintDetail{
		AgentBlueprint: gact.AgentBlueprintDefinition{
			ID:         "bp",
			Title:      "Nested Blueprint",
			Scope:      "workspace",
			RootExpert: "orchestrator",
			Enabled:    true,
		},
		Agents: []gact.AgentDef{{
			ID: "orchestrator", Title: "Orchestrator", Source: "agent_blueprint", Enabled: true, Tier: 1,
		}, {
			ID: "data", Title: "Data Resolver", Source: "agent_blueprint", Enabled: true, ParentID: "orchestrator", Tier: 2,
		}, {
			ID: "catalog", Title: "Catalog Specialist", Source: "agent_blueprint", Enabled: true, ParentID: "data", Tier: 3,
		}, {
			ID: "plot", Title: "Visualization Publisher", Source: "agent_blueprint", Enabled: true, ParentID: "catalog", Tier: 4,
		}},
	})

	joined := catalogItemsTextForTest(items)
	for _, want := range []string{
		"Expert · Orchestrator",
		"└─ Expert · Data Resolver",
		"└─ Expert · Catalog Specialist",
		"└─ Expert · Visualization Publisher",
		"reports to Catalog Specialist",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("nested blueprint detail items missing %q:\n%s", want, joined)
		}
	}
}

func TestAgentCatalogStressItemsPreserveDeepHierarchy(t *testing.T) {
	agents := []gact.AgentDef{{
		ID: "orchestrator", Title: "Demo Orchestrator", Source: "recipe", Enabled: true, Tier: 1,
	}, {
		ID: "geo", Title: "Geographic Resolver", Source: "recipe", Enabled: true, ParentID: "orchestrator", Tier: 2,
	}, {
		ID: "earthscope", Title: "EarthScope Catalog", Source: "recipe", Enabled: true, ParentID: "geo", Tier: 3,
	}, {
		ID: "sac", Title: "SAC Trace Reviewer", Source: "recipe", Enabled: true, ParentID: "earthscope", Tier: 4,
	}, {
		ID: "plot", Title: "Waveform Plot Publisher", Source: "recipe", Enabled: true, ParentID: "sac", Tier: 5,
	}, {
		ID: "invalid", Title: "Invalid Disabled Expert", Source: "recipe", Enabled: false,
		ValidationErrors: []string{"missing required tool: ndp_stage_resource"},
	}}

	items := agentCatalogItems(agents, catalogKindAgents)
	joined := catalogItemsTextForTest(items)
	for _, want := range []string{
		"Root expert · Demo Orchestrator",
		"└─ Expert · Geographic Resolver",
		"└─ Expert · EarthScope Catalog",
		"└─ Expert · SAC Trace Reviewer",
		"└─ Expert · Waveform Plot Publisher",
		"reports to SAC Trace Reviewer",
		"Invalid Disabled Expert",
		"missing required tool",
		"invalid",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("agent stress catalog items missing %q:\n%s", want, joined)
		}
	}
}

func TestCatalogBrowser_AgentBlueprintSourceDeleteRequiresConfirmation(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		items: []catalogItem{
			{id: "source/src1", title: "▾ Data Semantics Agents"},
			{id: "source-blueprint/src1/seismic-waveform-review", title: "  Seismic Waveform Review"},
		},
	}

	model, cmd := a.handleCatalogBrowserKey(keyMsg("d"))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("first source remove press should schedule a confirmation hint")
	}
	if a.catalogBrowser.pendingDeleteSourceID != "src1" {
		t.Fatalf("pending source delete id = %q, want src1", a.catalogBrowser.pendingDeleteSourceID)
	}
	if !strings.Contains(a.transientHint, "confirm removing source src1") {
		t.Fatalf("transient hint = %q, want source confirmation", a.transientHint)
	}
	if hint := catalogBrowserHintText(a.catalogBrowser); !strings.Contains(hint, "confirm remove armed") || !strings.Contains(hint, "d confirm remove source") {
		t.Fatalf("armed source hint = %q", hint)
	}

	model, cmd = a.handleCatalogBrowserKey(keyMsg("d"))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("second source remove press should return delete command")
	}
	if a.catalogBrowser == nil || a.catalogBrowser.pendingDeleteSourceID != "" {
		t.Fatalf("confirmed source delete should keep browser open and clear pending id: %#v", a.catalogBrowser)
	}
}

func TestCatalogBrowser_AgentBlueprintSourceDeleteConfirmationCancelsOnChildSelection(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		items: []catalogItem{
			{id: "source/src1", title: "▾ Data Semantics Agents"},
			{id: "source-blueprint/src1/seismic-waveform-review", title: "  Seismic Waveform Review"},
		},
	}

	_, _ = a.handleCatalogBrowserKey(keyMsg("d"))
	if a.catalogBrowser.pendingDeleteSourceID != "src1" {
		t.Fatalf("pending source delete id = %q, want src1", a.catalogBrowser.pendingDeleteSourceID)
	}
	model, cmd := a.handleCatalogBrowserKey(keyMsg("down"))
	a = model.(*App)
	if cmd != nil {
		t.Fatalf("down should only move selection/cancel confirmation, got command %#v", cmd)
	}
	if a.catalogBrowser.pendingDeleteSourceID != "" {
		t.Fatalf("pending source delete should clear after selecting child row, got %q", a.catalogBrowser.pendingDeleteSourceID)
	}
	if hint := catalogBrowserHintText(a.catalogBrowser); strings.Contains(hint, "confirm remove") || strings.Contains(hint, "d remove") {
		t.Fatalf("child blueprint row should not expose source removal after cancel, got %q", hint)
	}
}

func TestCatalogBrowser_AgentBlueprintSourceActionsRenderForSelectedSource(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.EscapedPath())
		switch {
		case r.Method == http.MethodPost && r.URL.EscapedPath() == "/v1/agent-blueprints/sources/src1/refresh":
			writeJSONForTest(t, w, map[string]any{"source": map[string]any{"id": "src1", "name": "Data Semantics Agents"}})
		case r.Method == http.MethodDelete && r.URL.EscapedPath() == "/v1/agent-blueprints/sources/src1":
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.EscapedPath())
		}
	}))
	defer server.Close()

	a := newReadyApp(nil, nil)
	a.c = client.New(server.URL)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		items: []catalogItem{
			{id: "source/src1", title: "▾ Data Semantics Agents"},
			{id: "source-blueprint/src1/seismic-waveform-review", title: "  Seismic Waveform Review"},
		},
	}

	out := ansi.Strip(a.viewCatalogBrowser())
	for _, want := range []string{"Source flow:", "select a source to refresh/remove", "select a provided blueprint to install", "Source actions", "refresh source", "remove source", "Marketplace source tree", "Data Semantics Agents"} {
		if !strings.Contains(out, want) {
			t.Fatalf("source browser missing %q:\n%s", want, out)
		}
	}

	buttons := a.agentBlueprintSourceActionButtons()
	if len(buttons) != 2 || buttons[0].label != "refresh source" || buttons[1].label != "remove source" {
		t.Fatalf("source action buttons = %#v", buttons)
	}
	msg := buttons[0].action(a)()
	if got, ok := msg.(agentBlueprintSourceManagedMsg); !ok || got.sourceID != "src1" || got.action != "refreshed" || got.err != nil {
		t.Fatalf("refresh action msg = %#v", msg)
	}
	cmd := buttons[1].action(a)
	if cmd == nil || a.catalogBrowser.pendingDeleteSourceID != "src1" || !strings.Contains(a.transientHint, "confirm removing source src1") {
		t.Fatalf("remove should arm source confirmation, pending=%q hint=%q cmd=%v", a.catalogBrowser.pendingDeleteSourceID, a.transientHint, cmd)
	}
	buttons = a.agentBlueprintSourceActionButtons()
	if len(buttons) != 2 || buttons[1].label != "confirm remove" {
		t.Fatalf("armed source action buttons = %#v", buttons)
	}
	msg = buttons[1].action(a)()
	if got, ok := msg.(agentBlueprintSourceManagedMsg); !ok || got.sourceID != "src1" || got.action != "deleted" || got.err != nil {
		t.Fatalf("delete action msg = %#v", msg)
	}
	if !slices.Contains(paths, "POST /v1/agent-blueprints/sources/src1/refresh") || !slices.Contains(paths, "DELETE /v1/agent-blueprints/sources/src1") {
		t.Fatalf("source action requests = %#v", paths)
	}
}

func TestCatalogBrowser_AgentBlueprintSourceActionsRenderForSelectedBlueprint(t *testing.T) {
	var installBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.EscapedPath() == "/v1/agent-blueprints/install":
			if err := json.NewDecoder(r.Body).Decode(&installBody); err != nil {
				t.Fatalf("decode install body: %v", err)
			}
			writeJSONForTest(t, w, map[string]any{"status": "installed"})
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.EscapedPath())
		}
	}))
	defer server.Close()

	a := newReadyApp(nil, nil)
	a.c = client.New(server.URL)
	a.wsID = "ws1"
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprintSources,
		title: "Marketplace sources",
		sel:   1,
		items: []catalogItem{
			{id: "source/src1", title: "▾ Data Semantics Agents"},
			{id: "source-blueprint/src1/seismic-waveform-review", title: "  Seismic Waveform Review"},
		},
	}

	out := ansi.Strip(a.viewCatalogBrowser())
	for _, want := range []string{"Source flow:", "select a provided blueprint to install", "Source actions", "install blueprint", "refresh source", "Marketplace source tree", "Seismic Waveform Review"} {
		if !strings.Contains(out, want) {
			t.Fatalf("source blueprint browser missing %q:\n%s", want, out)
		}
	}
	buttons := a.agentBlueprintSourceActionButtons()
	if len(buttons) != 2 || buttons[0].label != "install blueprint" || buttons[1].label != "refresh source" {
		t.Fatalf("source blueprint action buttons = %#v", buttons)
	}
	msg := buttons[0].action(a)()
	if got, ok := msg.(agentBlueprintManagedMsg); !ok || got.blueprintID != "seismic-waveform-review" || got.action != "installed" || got.err != nil {
		t.Fatalf("install action msg = %#v", msg)
	}
	for key, want := range map[string]string{
		"source_id":    "src1",
		"blueprint_id": "seismic-waveform-review",
		"scope":        "workspace",
		"workspace_id": "ws1",
	} {
		if got := stringValue(installBody[key]); got != want {
			t.Fatalf("install body %s = %q, want %q; body=%#v", key, got, want, installBody)
		}
	}
}

func TestCatalogBrowser_AgentBlueprintActionsAreNotListRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: []catalogItem{{
			id:        "source/0",
			title:     "Marketplace · demo",
			desc:      "source detail",
			statusTag: "available",
		}, {
			id:        "seismic-waveform-review",
			title:     "Seismic Waveform Review",
			desc:      "review seismic waveforms",
			statusTag: "workspace",
		}},
	}

	out := a.viewCatalogBrowser()
	for _, want := range []string{"Setup flow:", "browse sources -> select blueprint -> install", "Blueprint library", "Marketplace", "Seismic Waveform Review", "Enter detail", "i install path", "v validate path", "s browse sources"} {
		if !strings.Contains(out, want) {
			t.Fatalf("blueprint browser missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"Blueprint actions", "install source  validate source", "Install agent blueprint", "Validate agent blueprint", "Installed and available blueprints"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("management action leaked into catalog rows as %q:\n%s", unwanted, out)
		}
	}
}

func TestAgentBlueprintCatalogGroupsBlueprintsBySourceAndProvider(t *testing.T) {
	items := agentBlueprintCatalogItems([]gact.AgentBlueprintDefinition{
		{
			ID:      "workspace-broken",
			Title:   "Broken Blueprint",
			Scope:   "workspace",
			Enabled: false,
		},
		{
			ID:      "builtin-data",
			Title:   "Data Exploration",
			Scope:   "builtin",
			Enabled: true,
		},
		{
			ID:      "seismic-marketplace",
			Title:   "Seismic Marketplace",
			Scope:   "workspace",
			Enabled: true,
			Metadata: map[string]any{"install": map[string]any{
				"source":      "https://example.org/community/seismic-agents.git",
				"source_kind": "git",
				"ref":         "main",
				"status":      "installed",
			}},
		},
	})

	got := make([]string, 0, len(items))
	for _, item := range items {
		got = append(got, item.title)
	}
	joined := strings.Join(got, "\n")
	for _, want := range []string{
		"Source · community/seismic-agents",
		"  └─ Seismic Marketplace",
		"Built-in blueprints",
		"  └─ Data Exploration",
		"Workspace blueprints",
		"  └─ Broken Blueprint",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("grouped blueprint catalog missing %q:\n%s", want, joined)
		}
	}
	if strings.Index(joined, "Built-in blueprints") > strings.Index(joined, "Workspace blueprints") {
		t.Fatalf("built-in provider should sort before workspace provider:\n%s", joined)
	}
}

func TestLoadMcpDetailIncludesOwningAgentContext(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/agents":
			_, _ = w.Write([]byte(`{"agents":[
					{"id":"data","source":"builtin","title":"Data expert","specialization":"data_analysis","tools":["adios_inspect_file"]}
				]}`))
		case "/v1/mcp/servers":
			_, _ = w.Write([]byte(`{"servers":[
					{"id":"mcp_adios","name":"ADIOS","status":"connected","transport":"stdio","capabilities":{"tools":["adios_inspect_file"]}}
				]}`))
		case "/v1/mcp/handshake":
			_, _ = w.Write([]byte(`{"servers":[]}`))
		case "/v1/mcp/servers/mcp_adios/tools":
			_, _ = w.Write([]byte(`{"tools":[
				{
					"id":"adios_inspect_file",
					"name":"adios_inspect_file",
					"source":"mcp",
					"server_id":"mcp_adios",
					"description":"Inspect ADIOS containers",
					"visible_to":["data"]
				}
			]}`))
		case "/v1/mcp/servers/mcp_adios/resources":
			_, _ = w.Write([]byte(`{"resources":[]}`))
		case "/v1/mcp/servers/mcp_adios/prompts":
			_, _ = w.Write([]byte(`{"prompts":[]}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	msg := loadMcpDetailCmd(client.New(server.URL), client.RuntimeScope{}, "mcp_adios")()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("message type = %T, want catalogBrowserLoadedMsg", msg)
	}
	if loaded.errText != "" {
		t.Fatalf("unexpected MCP detail error: %s", loaded.errText)
	}
	if len(loaded.items) != 2 {
		t.Fatalf("items = %#v, want server overview and one tool row", loaded.items)
	}
	if loaded.items[0].id != "server/mcp_adios" || loaded.items[0].title != "Connection overview" || !strings.Contains(loaded.items[0].desc, "status: connected") {
		t.Fatalf("first MCP detail row = %#v, want source overview", loaded.items[0])
	}
	if !strings.Contains(loaded.items[0].inlineDesc, "connected") || strings.Contains(loaded.items[0].inlineDesc, "Connection health") {
		t.Fatalf("source overview inline summary = %q, want compact list preview", loaded.items[0].inlineDesc)
	}
	if loaded.items[1].title != "Tool · adios_inspect_file" || loaded.items[1].statusTag != "tool" {
		t.Fatalf("MCP tool row presentation = %#v, want operator tool label and status", loaded.items[1])
	}
	for _, want := range []string{"Inspect ADIOS containers", "agents: Data expert · data_analysis"} {
		if !strings.Contains(loaded.items[1].desc, want) {
			t.Fatalf("MCP tool row missing %q:\n%#v", want, loaded.items[1])
		}
	}
	for _, notWant := range []string{"MCP connection: mcp_adios", "server: mcp_adios", "visible to:"} {
		if strings.Contains(loaded.items[1].desc, notWant) {
			t.Fatalf("MCP tool row leaked backend label %q:\n%#v", notWant, loaded.items[1])
		}
	}
}

func TestOpenMcpDetailNormalizesPrefixedSourceTitles(t *testing.T) {
	a := newReadyApp(nil, nil)
	_ = a.openMcpDetail("mcp_fake", "MCP connection · fake-mcp")
	if a.catalogBrowser == nil || a.catalogBrowser.title != "MCP · fake-mcp" {
		t.Fatalf("MCP detail title = %#v, want normalized source name", a.catalogBrowser)
	}

	a = newReadyApp(nil, nil)
	_ = a.openMcpDetail("mcp_fake", "MCP tools · fake-mcp")
	if a.catalogBrowser == nil || a.catalogBrowser.title != "MCP · fake-mcp" {
		t.Fatalf("MCP tools detail title = %#v, want normalized source name", a.catalogBrowser)
	}
}

func TestFormatMcpServerSummaryUsesConnectionWording(t *testing.T) {
	out := formatMcpServerSummary(gact.McpServer{
		ID:              "mcp_docs",
		Name:            "Docs",
		Status:          "ready",
		Transport:       "stdio",
		ProtocolVersion: "2025-03-26",
		ServerInfo:      map[string]any{"name": "docs", "version": "1.0.0"},
		DeclaredCapabilities: gact.McpCapabilities{
			Tools:     true,
			Resources: &gact.McpResourcesCapability{},
			Prompts:   &gact.McpPromptsCapability{},
		},
	})

	for _, want := range []string{
		"Operator summary",
		"connection: Docs",
		"status: ready",
		"provides: callable tools, resources, prompts",
		"manage: open /mcp to add, reconnect, or remove this connection",
		"tool access: open /tools to see callable actions from eligible connections and workflows",
		"resources and prompts: listed below when this connection exposes them",
		"Technical details",
		"id: mcp_docs",
		"MCP protocol: 2025-03-26",
		"server:",
		"name: docs",
		"version: 1.0.0",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("MCP summary missing %q:\n%s", want, out)
		}
	}
	for _, raw := range []string{"press r", "press d", "press Enter"} {
		if strings.Contains(out, raw) {
			t.Fatalf("MCP summary should keep keypresses in footer/actions, found %q:\n%s", raw, out)
		}
	}
	for _, raw := range []string{"Status and capabilities", "Operator paths", "Connection status", "Available capabilities", "Source health", "source id:", "source info:", "server info:", "\n  protocol:"} {
		if strings.Contains(out, raw) {
			t.Fatalf("MCP summary leaked old/backend label %q:\n%s", raw, out)
		}
	}
}

func TestMcpDetailSeparatesManagementFromCapabilityRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 140
	a.height = 36
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "mcp_docs",
		items: []catalogItem{
			{id: "server/mcp_docs", title: "Connection overview", desc: "status: ready", statusTag: "ready"},
			{id: "tool/read_file", title: "Tool · read_file", desc: "Read a file from the workspace", statusTag: "tool"},
		},
	}

	out := stripANSI(a.viewCatalogBrowser())
	for _, want := range []string{"Connection capabilities", "Connection overview", "Tool · read_file", "r reconnect"} {
		if !strings.Contains(out, want) {
			t.Fatalf("MCP detail missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Connection controls") || strings.Contains(out, "button:mcp:reconnect") || strings.Contains(out, "Management") || strings.Contains(out, "Server and capabilities") {
		t.Fatalf("MCP detail should not present reconnect as modal content:\n%s", out)
	}
	if strings.Contains(out, "Reconnect server") {
		t.Fatalf("MCP detail leaked reconnect as a content row:\n%s", out)
	}
}

func TestMcpDetailReconnectShortcutDispatchesBackendCall(t *testing.T) {
	var reconnects int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/v1/mcp/servers/mcp_docs/reconnect" {
			reconnects++
			w.WriteHeader(http.StatusNoContent)
			return
		}
		t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
	}))
	defer server.Close()

	a := NewWithTheme(server.URL, ThemeForMode(ModeDark))
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "mcp_docs",
		items:       []catalogItem{{id: "tool/read_file", title: "Tool · read_file"}},
	}

	_, cmd := a.handleCatalogBrowserKey(keyMsg("r"))
	if cmd == nil {
		t.Fatal("r in MCP detail should dispatch reconnect command")
	}
	msg := cmd()
	done, ok := msg.(mcpReconnectDoneMsg)
	if !ok {
		t.Fatalf("message = %#v, want mcpReconnectDoneMsg", msg)
	}
	if done.err != nil || done.serverID != "mcp_docs" || reconnects != 1 {
		t.Fatalf("done=%#v reconnects=%d", done, reconnects)
	}
}

func TestMcpReconnectDoneSurfacesSuccessAndFailure(t *testing.T) {
	a := NewWithTheme("http://unused", ThemeForMode(ModeDark))
	a.stage = StageReady
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "mcp_docs",
	}

	model, cmd := a.Update(mcpReconnectDoneMsg{serverID: "mcp_docs"})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "MCP connection reconnected: mcp_docs") {
		t.Fatalf("success hint = %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("success should schedule hint expiry and refresh MCP state")
	}

	model, cmd = a.Update(mcpReconnectDoneMsg{serverID: "mcp_docs", err: errors.New("probe failed")})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "MCP reconnect failed: probe failed") {
		t.Fatalf("failure hint = %q", a.transientHint)
	}
	if strings.Contains(a.transientHint, "gact:") {
		t.Fatalf("failure hint should not leak transport wrapper: %q", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("failure should schedule hint expiry")
	}
}

func TestLoadAgentDetailIncludesToolAndMcpServerMapping(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/agents/data":
			_, _ = w.Write([]byte(`{
				"id":"data",
				"source":"builtin",
				"title":"Data expert",
				"description":"Dataset inspection",
				"default_model":{"provider_id":"lm_studio","model_id":"qwopus3.5-9b-v3"},
				"tools":["ndp_search_datasets"]
			}`))
		case "/v1/agents":
			_, _ = w.Write([]byte(`{"agents":[
				{"id":"data","source":"builtin","title":"Data expert"},
				{"id":"ndp_catalog","source":"builtin","title":"NDP catalog","metadata":{"parent":"data"}}
			]}`))
		case "/v1/tools":
			_, _ = w.Write([]byte(`{"tools":[
				{
					"id":"ndp_search_datasets",
					"name":"ndp_search_datasets",
					"source":"mcp",
					"server_id":"mcp_ndp",
					"description":"Search NDP datasets",
					"owner":"ndp_catalog",
					"tags":["catalog"],
					"visible_to":["data","ndp_catalog"],
					"input_schema":{"type":"object"}
				}
			]}`))
		case "/v1/commands":
			_, _ = w.Write([]byte(`{"commands":[]}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	msg := loadAgentDetailCmd(client.New(server.URL), "data", client.RuntimeScope{})()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("message type = %T, want catalogBrowserLoadedMsg", msg)
	}
	if loaded.errText != "" {
		t.Fatalf("unexpected agent detail load error: %s", loaded.errText)
	}

	var hasTool, hasServer, hasChild, hasModel bool
	for _, item := range loaded.items {
		switch item.id {
		case "model":
			hasModel = item.title == "Model · default" &&
				strings.Contains(item.desc, "provider: lm_studio") &&
				strings.Contains(item.desc, "model: qwopus3.5-9b-v3")
		case "tool/ndp_search_datasets":
			hasTool = item.title == "Can use · ndp_search_datasets" &&
				strings.Contains(item.desc, "connection: mcp_ndp") &&
				strings.Contains(item.desc, "available to: data, ndp_catalog")
		case "mcpserver/mcp_ndp":
			hasServer = true
		case "agent/ndp_catalog":
			hasChild = strings.HasPrefix(item.title, "Delegates to · ")
		}
	}
	if !hasTool || !hasServer || !hasChild || !hasModel {
		t.Fatalf("agent detail missing tool/server/child mapping: %#v", loaded.items)
	}
}

func TestAgentCatalogDescriptionSurfacesSkillsAndValidation(t *testing.T) {
	items := agentCatalogItems([]gact.AgentDef{{
		ID:                 "data",
		Source:             "agent_blueprint",
		Title:              "Data",
		Enabled:            true,
		Skills:             []string{"python", "ndp", "adios", "plots"},
		ValidationWarnings: []string{"skill path unresolved until install"},
		ValidationErrors:   []string{"missing skill: adios"},
	}}, catalogKindAgents)

	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].title != "Root expert · Data" {
		t.Fatalf("top-level agent should render as a root expert: %#v", items[0])
	}
	if items[0].statusTag != "invalid" {
		t.Fatalf("agent with errors should remain invalid, got %#v", items[0])
	}
	for _, want := range []string{"skills: python, ndp, adios, +1", "warnings: skill path unresolved until install", "errors: missing skill: adios"} {
		if !strings.Contains(items[0].desc, want) {
			t.Fatalf("agent desc missing %q: %#v", want, items[0])
		}
	}
}

func TestAgentCatalogHierarchyLabelsRootAndChildExperts(t *testing.T) {
	items := agentCatalogItems([]gact.AgentDef{{
		ID: "main", Title: "Default Agent", Source: "builtin", Enabled: true,
	}, {
		ID: "data", Title: "Data", Source: "builtin", Enabled: true, ParentID: "main",
	}}, catalogKindAgents)

	if len(items) != 2 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].title != "Root expert · Default Expert" {
		t.Fatalf("root title = %q", items[0].title)
	}
	if items[1].title != "  └─ Expert · Data" {
		t.Fatalf("child title = %q", items[1].title)
	}
	if !strings.Contains(items[1].inlineDesc, "reports to Default Expert") {
		t.Fatalf("child inline summary should preserve parent context: %#v", items[1])
	}
}

func TestAgentCatalogWarningsUseAttentionState(t *testing.T) {
	items := agentCatalogItems([]gact.AgentDef{{
		ID:                 "data",
		Source:             "agent_blueprint",
		Title:              "Data",
		Enabled:            true,
		ValidationWarnings: []string{"skill path unresolved until install"},
	}}, catalogKindAgents)

	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].statusTag != "warning" || !strings.Contains(items[0].desc, "warnings: skill path unresolved until install") {
		t.Fatalf("warning-only agent should be visually distinct: %#v", items[0])
	}
}

func TestLoadAgentDetailSurfacesDeclaredSkillsAndValidation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/agents/data":
			_, _ = w.Write([]byte(`{
				"id":"data",
				"source":"agent_blueprint",
				"title":"Data expert",
				"description":"Dataset inspection",
				"skills":["python","ndp"],
				"validation_warnings":["skill ndp resolved from community source"],
				"validation_errors":["skill not resolved: ndp"]
			}`))
		case "/v1/agents":
			_, _ = w.Write([]byte(`{"agents":[{"id":"data","source":"agent_blueprint","title":"Data expert"}]}`))
		case "/v1/tools":
			_, _ = w.Write([]byte(`{"tools":[]}`))
		case "/v1/commands":
			_, _ = w.Write([]byte(`{"commands":[]}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()

	msg := loadAgentDetailCmd(client.New(server.URL), "data", client.RuntimeScope{})()
	loaded, ok := msg.(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatalf("message type = %T, want catalogBrowserLoadedMsg", msg)
	}
	if loaded.errText != "" {
		t.Fatalf("unexpected agent detail load error: %s", loaded.errText)
	}

	var hasSkills, hasWarnings, hasValidation bool
	for _, item := range loaded.items {
		switch item.id {
		case "skills":
			hasSkills = item.title == "Declared skills" &&
				item.statusTag == "skills" &&
				strings.Contains(item.desc, "python, ndp")
		case "validation-warnings":
			hasWarnings = item.title == "Validation warnings" &&
				item.statusTag == "warning" &&
				strings.Contains(item.desc, "skill ndp resolved from community source")
		case "validation":
			hasValidation = item.statusTag == "error" &&
				strings.Contains(item.desc, "skill not resolved: ndp")
		}
	}
	if !hasSkills || !hasWarnings || !hasValidation {
		t.Fatalf("agent detail missing skills/validation rows: %#v", loaded.items)
	}
}

func TestCatalogBrowser_EnterOnMcpResourceLoadsResourceDetail(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:        catalogKindMcpDetail,
		title:       "MCP · docs",
		mcpServerID: "docs",
		items:       []catalogItem{{id: "res/" + "file://resource", title: "Resource · resource"}},
	}

	_, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if cmd == nil {
		t.Fatal("enter on MCP resource should fetch resource contents")
	}
}

func TestFormatMcpResourceContentsUsesDetailSections(t *testing.T) {
	out := formatMcpResourceContents([]gact.McpContent{{
		URI:      "file://resource",
		MimeType: "text/markdown",
		Text:     "first line\nsecond line",
	}, {
		Data: "YWJjZA==",
	}})

	for _, want := range []string{
		"Resource content",
		"uri: file://resource",
		"media type: text/markdown",
		"text:",
		"first line",
		"second line",
		"uri: content[1]",
		"base64 data: 8 bytes encoded",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("resource detail missing %q:\n%s", want, out)
		}
	}
}

func TestLoadToolDetailCmdFetchesSchemaAndMetadata(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/agents" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{
				"agents": [
					{"id":"utility","title":"Utility Expert","source":"builtin","tier":2,"specialization":"utility","tools":["shell_bash"]},
					{"id":"planner","title":"Planner","source":"builtin","tier":1}
				]
			}`))
			return
		}
		if r.URL.Path != "/v1/tools/shell_bash" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id":"shell_bash",
			"name":"shell_bash",
			"source":"mcp",
			"server_id":"mcp_shell",
			"description":"Run a shell command",
			"permission_default":"ask",
			"owner":"utility",
			"tags":["shell","diagnostic"],
			"visible_to":["chat","utility"],
			"input_schema":{"type":"object","properties":{"command":{"type":"string"}}}
		}`))
	}))
	defer server.Close()

	msg := loadToolDetailCmd(client.New(server.URL), client.RuntimeScope{}, "shell_bash")()
	detail, ok := msg.(catalogDetailLoadedMsg)
	if !ok {
		t.Fatalf("message type = %T, want catalogDetailLoadedMsg", msg)
	}
	if detail.err != nil {
		t.Fatalf("unexpected detail load error: %v", detail.err)
	}
	for _, want := range []string{
		"workflow area: utility",
		"available to: chat, utility",
		"used by:",
		"Utility Expert · utility",
		"Inputs",
		"command",
	} {
		if !strings.Contains(detail.text, want) {
			t.Fatalf("loaded tool detail missing %q:\n%s", want, detail.text)
		}
	}
}

func TestFormatToolDetailIncludesInspectorMetadata(t *testing.T) {
	out := formatToolDetailWithAgents(gact.Tool{
		ID:                "shell_bash",
		Name:              "shell_bash",
		Source:            "mcp",
		ServerID:          "mcp_shell",
		Description:       "Run a shell command",
		PermissionDefault: "ask",
		Owner:             "utility",
		Tags:              []string{"shell", "diagnostic"},
		VisibleTo:         []string{"chat", "planner", "utility"},
		InputSchema: map[string]any{
			"type": "object",
		},
	}, []gact.AgentDef{
		{ID: "utility", Title: "Utility Expert", Specialization: "utility", Tools: []string{"shell_bash"}},
	})

	for _, want := range []string{
		"Operator summary",
		"comes from: MCP",
		"connection: mcp_shell",
		"workflow area: utility",
		"available to: chat, planner, utility",
		"used by:",
		"Utility Expert · utility",
		"tagged: shell, diagnostic",
		"approval needed: ask",
		"Inputs",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("tool detail missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{"  source: mcp", "owner: utility", "visible to:", "owning agents:", "permission: ask", "server: mcp_shell", "provider:", "domain:", "approval:"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("tool detail leaked backend label %q:\n%s", notWant, out)
		}
	}
}

func TestFormatToolDetailSummarizesSchemaFields(t *testing.T) {
	out := formatToolDetailWithAgents(gact.Tool{
		ID:          "adios_inspect_file",
		Name:        "adios_inspect_file",
		Source:      "mcp",
		Description: "Inspect an ADIOS/BP container.",
		InputSchema: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []any{"filepath"},
			"properties": map[string]any{
				"filepath": map[string]any{
					"type":        "string",
					"description": "Path to the ADIOS/BP container to inspect.",
				},
				"include_variables": map[string]any{
					"type":        "boolean",
					"description": "Include variable-level metadata.",
				},
			},
		},
	}, nil)

	for _, want := range []string{
		"Inputs",
		"type: object",
		"required: filepath",
		"additional_properties: disabled",
		"fields:",
		"- filepath — string · required · Path to the ADIOS/BP container to inspect.",
		"- include_variables — boolean · Include variable-level metadata.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("tool detail schema summary missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{
		`"properties"`,
		`"additionalProperties"`,
	} {
		if strings.Contains(out, notWant) {
			t.Fatalf("tool detail should not expose raw schema JSON %q:\n%s", notWant, out)
		}
	}
}

func TestFormatToolDetailSummarizesAnnotationsWithoutRawJSON(t *testing.T) {
	out := formatToolDetailWithAgents(gact.Tool{
		ID:                "shell_bash",
		Name:              "shell_bash",
		Source:            "builtin",
		PermissionDefault: "ask",
		Annotations: &gact.ToolAnnotations{
			Title:           "Run shell command",
			DestructiveHint: true,
			OpenWorldHint:   true,
		},
	}, nil)

	for _, want := range []string{
		"Safety",
		"label: Run shell command",
		"hints: destructive, open-world",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("tool detail annotations summary missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{
		`"destructiveHint"`,
		`"openWorldHint"`,
		"{",
		"}",
	} {
		if strings.Contains(out, notWant) {
			t.Fatalf("tool detail should not expose raw annotations JSON %q:\n%s", notWant, out)
		}
	}
}

// TestCatalogBrowser_DisabledRowRendersDim: a disabled tool gets
// the (disabled) tag in the rendered output.
func TestCatalogBrowser_DisabledRowRendersDim(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.disabledTools = map[string]bool{"bash": true}
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{
			{id: "bash", title: "bash", desc: "shell"},
			{id: "read_file", title: "read_file", desc: "read"},
		},
	}
	a.width = 100
	a.height = 30
	out := a.viewCatalogBrowser()
	if !strings.Contains(out, "(disabled)") {
		t.Errorf("expected '(disabled)' in render of disabled tool, got: %q", out)
	}
}

func TestCatalogBrowserCompactsMultilineDescriptions(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{
			id:    "fs_apply_edit_write",
			title: "fs_apply_edit_write",
			desc:  "Write new_content to filepath.\n\nDesigned for accepted diffs.\nReturns path, unified_diff, new_content, lines_added, lines_removed.",
		}},
	}
	a.width = 100
	a.height = 30

	out := stripANSI(a.viewCatalogBrowser())
	if strings.Contains(out, "\n\nDesigned for accepted diffs") {
		t.Fatalf("catalog description kept embedded newlines:\n%s", out)
	}
	if strings.Count(out, "Designed for") != 1 {
		t.Fatalf("catalog description should preserve compact content on one visual row:\n%s", out)
	}
}

func TestCatalogBrowserToolsUseDenseInlineMetadata(t *testing.T) {
	a := newReadyApp(nil, nil)
	items := make([]catalogItem, 20)
	for i := range items {
		items[i] = catalogItem{
			id:        "tool-" + itoa2(i),
			title:     "tool-" + itoa2(i),
			desc:      "asks first · needs path",
			statusTag: "builtin",
		}
	}
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: items,
	}
	a.width = 120
	a.height = 36

	out := stripANSI(a.viewCatalogBrowser())
	if !strings.Contains(out, "tool-19") {
		t.Fatalf("tool catalog should fit all short metadata rows inline:\n%s", out)
	}
	if !strings.Contains(out, "tool-0  [built-in]  asks first") {
		t.Fatalf("tool catalog should render metadata on the title row:\n%s", out)
	}
}

func TestCatalogBrowserToolsHintDistinguishesSourceRowsFromToolRows(t *testing.T) {
	cb := &catalogBrowserState{
		kind: catalogKindTools,
		items: []catalogItem{
			{id: "bash", title: "bash", statusTag: "builtin"},
			{id: "mcpserver/fake-mcp", title: "MCP tools · fake-mcp", statusTag: "connected"},
			{id: "fetch", title: "  └─ fetch", statusTag: "fake-mcp"},
		},
	}

	cb.sel = 0
	toolHint := catalogBrowserHintText(cb)
	if !strings.Contains(toolHint, "Enter details") || !strings.Contains(toolHint, "Space hide/show selected tool") {
		t.Fatalf("tool row hint should explain detail and local visibility, got %q", toolHint)
	}

	cb.sel = 1
	sourceHint := catalogBrowserHintText(cb)
	for _, want := range []string{"Enter connection detail", "r reconnect", "i add connection", "d remove connection"} {
		if !strings.Contains(sourceHint, want) {
			t.Fatalf("MCP connection row hint missing %q: %q", want, sourceHint)
		}
	}
}

func TestCatalogBrowserToolsSourceRowsExposeMcpManagement(t *testing.T) {
	var reconnects int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/mcp/servers/fake-mcp/reconnect":
			reconnects++
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/mcp/servers":
			_, _ = w.Write([]byte(`{"servers":[{"id":"fake-mcp","name":"fake-mcp","transport":"stdio","status":"ready","builtin":false}]}`))
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	newCatalogApp := func() *App {
		a := NewWithTheme(server.URL, ThemeForMode(ModeDark))
		a.stage = StageReady
		a.catalogBrowserOpen = true
		a.catalogBrowser = &catalogBrowserState{
			kind: catalogKindTools,
			sel:  1,
			items: []catalogItem{
				{id: "bash", title: "Tool · bash"},
				{id: "mcpserver/fake-mcp", title: "MCP · fake-mcp"},
				{id: "fetch", title: "  └─ Tool · fetch"},
			},
		}
		return a
	}

	a := newCatalogApp()
	model, cmd := a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: 'r', Text: "r"})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("r on a Actions and MCP source row should dispatch reconnect")
	}
	done, ok := cmd().(mcpReconnectDoneMsg)
	if !ok || done.err != nil || done.serverID != "fake-mcp" || reconnects != 1 {
		t.Fatalf("reconnect result=%#v reconnects=%d", done, reconnects)
	}
	if !a.catalogBrowserOpen {
		t.Fatal("reconnect should keep the catalog open behind the result toast")
	}

	a = newCatalogApp()
	model, cmd = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: 'i', Text: "i"})
	a = model.(*App)
	if cmd != nil || !a.mcpInstallOpen || a.catalogBrowserOpen {
		t.Fatalf("i should open MCP install modal from unified catalog, install=%v catalog=%v cmd=%v", a.mcpInstallOpen, a.catalogBrowserOpen, cmd)
	}

	a = newCatalogApp()
	model, cmd = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: 'd', Text: "d"})
	a = model.(*App)
	if cmd == nil || !a.mcpRemoveOpen || a.catalogBrowserOpen {
		t.Fatalf("d should open MCP remove picker from unified source row, remove=%v catalog=%v cmd=%v", a.mcpRemoveOpen, a.catalogBrowserOpen, cmd)
	}
	if msg := cmd(); msg == nil {
		t.Fatal("remove picker should fetch removable MCP connections")
	}
}

func TestToolSummaryOmitsRepeatedCommandDescription(t *testing.T) {
	got := toolSummary(gact.Tool{
		ID:          "parquet_compute_statistics",
		Name:        "parquet_compute_statistics",
		Description: "parquet_compute_statistics",
		ServerID:    "facility-data",
		Tags:        []string{"parquet", "statistics"},
	})

	if strings.Contains(got, "parquet_compute_statistics") {
		t.Fatalf("tool summary should omit repeated command-name description: %q", got)
	}
	for _, want := range []string{"connection: facility-data", "tagged: parquet, statistics"} {
		if !strings.Contains(got, want) {
			t.Fatalf("tool summary missing useful metadata %q: %q", want, got)
		}
	}
}

func TestToolCatalogDescriptionUsesOperationalMetadata(t *testing.T) {
	got := toolCatalogDescription(gact.Tool{
		ID:                "parquet_compute_statistics",
		Name:              "parquet_compute_statistics",
		Description:       "Compute summary statistics for one Parquet column.\n\nAgent story: use this after schema inspection.",
		PermissionDefault: "ask",
		Owner:             "analysis",
		Tags:              []string{"parquet", "statistics", "tabular", "science"},
		VisibleTo:         []string{"analysis", "planner"},
		InputSchema: map[string]any{
			"properties": map[string]any{
				"filepath": map[string]any{"type": "string"},
				"column":   map[string]any{"type": "string"},
				"limit":    map[string]any{"type": "integer"},
				"method":   map[string]any{"type": "string"},
				"sample":   map[string]any{"type": "integer"},
			},
		},
	})

	for _, want := range []string{
		"owned by analysis",
		"asks first",
		"needs column, filepath, +3 more",
		"tagged parquet",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("tool catalog description missing %q: %q", want, got)
		}
	}
	for _, notWant := range []string{"owner:", "permission:", "inputs:", "tags:"} {
		if strings.Contains(got, notWant) {
			t.Fatalf("tool catalog description leaked backend label %q: %q", notWant, got)
		}
	}
	if strings.Contains(got, "Agent story") {
		t.Fatalf("catalog summary should omit long agent-story prose: %q", got)
	}
	if strings.Contains(got, "Compute summary statistics") {
		t.Fatalf("catalog summary should prefer operational metadata over prose when metadata exists: %q", got)
	}
}

func TestToolCatalogDescriptionOmitsRepeatedCommandName(t *testing.T) {
	got := toolCatalogDescription(gact.Tool{
		ID:                "parquet_compute_statistics",
		Name:              "parquet_compute_statistics",
		Description:       "parquet_compute_statistics",
		PermissionDefault: "ask",
		Owner:             "analysis",
	})

	if strings.Contains(got, "parquet_compute_statistics") {
		t.Fatalf("catalog description should omit repeated command-name description: %q", got)
	}
	for _, want := range []string{"owned by analysis", "asks first"} {
		if !strings.Contains(got, want) {
			t.Fatalf("tool catalog description missing fallback metadata %q: %q", want, got)
		}
	}
}

func TestToolCatalogDescriptionUsesPurposeWhenMetadataMissing(t *testing.T) {
	got := toolCatalogDescription(gact.Tool{
		ID:          "fetch_url",
		Name:        "fetch_url",
		Description: "Fetch a URL and return its response body.\n\nAgent story: useful for docs.",
	})

	if got != "Fetch a URL and return its response body." {
		t.Fatalf("fallback purpose = %q", got)
	}
}

func TestCatalogBrowserDetailKindsAdvertiseEnterDetails(t *testing.T) {
	for _, kind := range []catalogBrowserKind{catalogKindTools, catalogKindMcpDetail, catalogKindAgentDetail} {
		a := newReadyApp(nil, nil)
		a.catalogBrowserOpen = true
		a.catalogBrowser = &catalogBrowserState{
			kind:  kind,
			title: "Detail",
			items: []catalogItem{{id: "tool/shell_bash", title: "Tool · shell_bash"}},
		}
		a.width = 120
		a.height = 40

		out := stripANSI(a.viewCatalogBrowser())
		if !strings.Contains(out, "Enter details") {
			t.Fatalf("detail catalog kind %v should advertise Enter details:\n%s", kind, out)
		}
	}
}

func TestCatalogBrowserScrollsSelectionIntoView(t *testing.T) {
	a := newReadyApp(nil, nil)
	items := make([]catalogItem, 20)
	for i := range items {
		items[i] = catalogItem{id: itoa2(i), title: "item-" + itoa2(i)}
	}
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindSkills,
		title: "Skills",
		items: items,
		sel:   0,
	}
	for i := 0; i < 15; i++ {
		_, _ = a.handleCatalogBrowserKey(tea.KeyPressMsg{Code: tea.KeyDown})
	}

	if a.catalogBrowser.offset == 0 {
		t.Fatal("catalog browser offset did not move after selection passed visible budget")
	}
	out := a.viewCatalogBrowser()
	if !strings.Contains(out, "item-15") {
		t.Fatalf("selected item not visible after scrolling:\n%s", out)
	}
	if strings.Contains(out, "item-0") {
		t.Fatalf("top item still visible after scrolling past viewport:\n%s", out)
	}
}

func TestCatalogBrowserUsesSharedScrollRailInsteadOfRangeRows(t *testing.T) {
	a := newReadyApp(nil, nil)
	items := make([]catalogItem, 30)
	for i := range items {
		items[i] = catalogItem{id: itoa2(i), title: "item-" + itoa2(i)}
	}
	a.width = 120
	a.height = 36
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindSkills,
		title: "Skills",
		items: items,
		sel:   14,
	}
	a.catalogBrowser.offset = catalogBrowserClampOffset(a.catalogBrowser.sel, a.catalogBrowser.offset, len(items))

	out := stripANSI(a.viewCatalogBrowser())
	if !strings.Contains(out, "┃") {
		t.Fatalf("long catalog should render a shared side scroll rail:\n%s", out)
	}
	for _, notWant := range []string{"above", "and ", " more"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("catalog should not render textual scroll count %q:\n%s", notWant, out)
		}
	}
}

func TestAgentBlueprintCatalogScrollsSelectionIntoViewWithRail(t *testing.T) {
	a := newReadyApp(nil, nil)
	items := make([]catalogItem, 32)
	for i := range items {
		items[i] = catalogItem{
			id:        "blueprint-" + itoa2(i),
			title:     "Blueprint " + itoa2(i),
			desc:      "source grouped blueprint used to prove long blueprint libraries scroll cleanly",
			statusTag: "source",
		}
	}
	a.width = 120
	a.height = 36
	a.catalogBrowserOpen = true
	a.catalogBrowser = &catalogBrowserState{
		kind:  catalogKindAgentBlueprints,
		title: "Agent Blueprints",
		items: items,
		sel:   18,
	}
	a.catalogBrowser.offset = catalogBrowserClampOffsetForKind(a.catalogBrowser.kind, a.catalogBrowser.sel, a.catalogBrowser.offset, len(items))

	out := stripANSI(a.viewCatalogBrowser())
	if !strings.Contains(out, "Blueprint 18") {
		t.Fatalf("selected blueprint should remain visible after scrolling:\n%s", out)
	}
	if strings.Contains(out, "Blueprint 0") {
		t.Fatalf("top blueprint should be clipped after scrolling:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("long blueprint catalog should render a shared side scroll rail:\n%s", out)
	}
	for _, notWant := range []string{"above", "and ", " more"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("blueprint catalog should not render textual scroll count %q:\n%s", notWant, out)
		}
	}
}
