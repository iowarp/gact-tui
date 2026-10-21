package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
	for _, want := range []string{"Add a plugin", "skills"} {
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
	for _, want := range []string{"no skills yet", "add plugins with skills to the agent"} {
		if !strings.Contains(emptyHint, want) {
			t.Fatalf("empty skills hint missing %q, got %q", want, emptyHint)
		}
	}
	if strings.Contains(emptyHint, "Enter details") {
		t.Fatalf("empty skills hint should route operators to adding a plugin, got %q", emptyHint)
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

func TestSkillsCatalogListsTheSessionAgentSkills(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/sessions/sess_1/agent" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"session_id":"sess_1","resolution":{"skills":[
			{"id":"test-writer","plugin":"go-dev","description":"Writes table-driven Go tests for a target package."}
		]}}`))
	}))
	defer server.Close()

	msg, ok := loadCatalogBrowserCmd(client.New(server.URL), catalogKindSkills, client.RuntimeScope{SessionID: "sess_1"})().(catalogBrowserLoadedMsg)
	if !ok || msg.errText != "" {
		t.Fatalf("skills catalog load = %#v", msg)
	}
	if len(msg.items) != 1 {
		t.Fatalf("items len = %d, want one skill row", len(msg.items))
	}
	item := msg.items[0]
	if item.id != "test-writer" || item.title != "test-writer" || item.statusTag != "skill" {
		t.Fatalf("skill row identity = %#v", item)
	}
	if !strings.Contains(item.desc, "Writes table-driven Go tests") || item.inlineDesc != "from plugin go-dev" {
		t.Fatalf("skill row should lead with purpose and name its plugin: %#v", item)
	}
}
