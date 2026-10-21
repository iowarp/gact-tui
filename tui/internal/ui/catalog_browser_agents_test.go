package ui

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestCatalogBrowser_OOnAgentSetsOneTurnOverride(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Experts",
		items: []catalogItem{{id: "analysis", title: "Analysis expert"}},
	}

	_, _ = a.catalog.handleKey(tea.KeyPressMsg{Code: 'o', Text: "o"})

	if a.agent.nextTurnAgentID != "analysis" {
		t.Fatalf("nextTurnAgentID = %q, want analysis", a.agent.nextTurnAgentID)
	}
	if a.catalog.open {
		t.Fatal("agent one-turn selection should close the catalog")
	}
	if !strings.Contains(a.transientHint, "Analysis expert") {
		t.Fatalf("transient hint should name selected agent, got %q", a.transientHint)
	}
}

func TestCatalogBrowser_AgentCatalogRendersHierarchyFirst(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 120
	a.height = 40
	a.catalog.open = true
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindAgents,
		title: "Experts",
		items: []catalogItem{{id: "analysis", title: "Analysis expert", desc: "reviews results"}},
	}

	out := a.catalog.view()
	for _, want := range []string{"Expert hierarchy", "Analysis expert", "o set next turn"} {
		if !strings.Contains(out, want) {
			t.Fatalf("agent catalog missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{"Expert actions", "button:agents:create", "c create expert", "x extract expert"} {
		if strings.Contains(out, notWant) {
			t.Fatalf("agent catalog should not render management actions as list content %q:\n%s", notWant, out)
		}
	}
}

func TestLoadAgentsCatalogListsInstalledAndUserAgents(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/agents" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"agents": [
				{"ref":"clio/standard","id":"standard","name":"CLIO","description":"A scientific assistant","kind":"agent"},
				{"ref":"user/my-analyst","id":"my-analyst","name":"My analyst","kind":"user","extends":"clio/standard"}
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
	byID := map[string]catalogItem{}
	for _, item := range loaded.items {
		if strings.HasPrefix(item.id, "action/") {
			t.Fatalf("agents catalog should not mix management actions into agent rows: %#v", loaded.items)
		}
		byID[item.id] = item
	}
	standard, mine := byID["clio/standard"], byID["user/my-analyst"]
	if !strings.Contains(standard.title, "CLIO") || standard.statusTag == "invalid" {
		t.Fatalf("installed agent row = %#v", standard)
	}
	if !strings.Contains(mine.title, "My analyst") || mine.statusTag == "invalid" {
		t.Fatalf("user agent row = %#v", mine)
	}
}
