package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestSkillsCatalogEmptyStateExplainsInstallPath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/agents" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"agents":[]}`))
	}))
	defer server.Close()

	msg, ok := loadCatalogBrowserCmd(client.New(server.URL), catalogKindSkills, client.RuntimeScope{})().(catalogBrowserLoadedMsg)
	if !ok {
		t.Fatal("skills catalog loader should return catalogBrowserLoadedMsg")
	}
	if msg.errText != "" {
		t.Fatalf("skills catalog load failed: %s", msg.errText)
	}
	if len(msg.items) != 1 {
		t.Fatalf("items len = %d, want one empty-state row", len(msg.items))
	}
	row := msg.items[0]
	if row.id != "none" || row.title != "No skills available" || row.statusTag != "empty" {
		t.Fatalf("skills empty row = %#v", row)
	}
	for _, want := range []string{"Install or activate", "agent blueprint", "skills"} {
		if !strings.Contains(row.desc, want) {
			t.Fatalf("skills empty row missing %q: %#v", want, row)
		}
	}
	for _, notWant := range []string{"source=skill", "backend", "agent source"} {
		if strings.Contains(row.title+" "+row.desc, notWant) {
			t.Fatalf("skills empty row leaked backend wording %q: %#v", notWant, row)
		}
	}
	if intro := catalogBrowserIntro(catalogKindSkills); intro != "" {
		t.Fatalf("skills catalog should keep install guidance in empty rows, not intro chrome, got %q", intro)
	}
	emptyHint := catalogBrowserHintText(&catalogBrowserState{kind: catalogKindSkills, items: msg.items})
	for _, want := range []string{"open /agent-blueprints", "install workflow with skills"} {
		if !strings.Contains(emptyHint, want) {
			t.Fatalf("empty skills hint missing %q, got %q", want, emptyHint)
		}
	}
	if strings.Contains(emptyHint, "/agent-blueprints add skills") || strings.Contains(emptyHint, "Enter details") {
		t.Fatalf("empty skills hint should route operators to blueprint install path, got %q", emptyHint)
	}
	if hint := catalogBrowserHintText(&catalogBrowserState{kind: catalogKindSkills, items: []catalogItem{{id: "skill", title: "Skill"}}}); !strings.Contains(hint, "Enter details") {
		t.Fatalf("skills hint should advertise details drill-down, got %q", hint)
	}

	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindSkills,
		title: "Skills",
		items: msg.items,
	}
	_, cmd := a.catalog.handleKey(keyMsg("enter"))
	if cmd != nil {
		t.Fatal("enter on skills empty state should not dispatch detail load")
	}
}

func TestSkillsCatalogRowsLeadWithSkillPurpose(t *testing.T) {
	items := agentCatalogItems([]gact.AgentDef{{
		ID:          "test_writer",
		Source:      "skill",
		Title:       "Test Writer",
		Description: "Writes table-driven Go tests for a target package.",
		Tools:       []string{"read_file", "edit_file"},
		Enabled:     true,
	}}, catalogKindSkills)

	if len(items) != 1 {
		t.Fatalf("items len = %d, want one skill row", len(items))
	}
	if items[0].title != "Test Writer" || items[0].statusTag != "2 tools" {
		t.Fatalf("skill row identity = %#v", items[0])
	}
	for _, want := range []string{"Writes table-driven Go tests", "2 tools"} {
		if !strings.Contains(items[0].inlineDesc, want) {
			t.Fatalf("skill inline summary missing %q: %#v", want, items[0])
		}
	}
	if strings.HasPrefix(items[0].inlineDesc, "2 tools") {
		t.Fatalf("skill inline summary should lead with purpose, not only tool count: %#v", items[0])
	}
}
