package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestFormatPermissionsInspectorShowsReviewQueueAndPolicies(t *testing.T) {
	out := formatPermissionsInspector([]client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{
			ID: "perm_1", SessionID: "sess_1", Summary: "Run shell",
			ToolCall: gact.PermissionToolCall{
				ToolName: "bash",
				CallID:   "call_1",
				ServerID: "local",
				Input:    map[string]any{"command": "rm -rf /tmp/scratch"},
				Annotations: gact.ToolAnnotations{
					DestructiveHint: true,
					OpenWorldHint:   true,
				},
			},
		},
		Status: "pending",
	}}, []gact.Policy{{
		Scope: "session", ToolNamePattern: "bash", Action: "ask",
	}}, "sess_1")

	for _, want := range []string{
		"Operator decision",
		"1 approval request waiting in current session.",
		"Next: bash needs approval before running · destructive, external access.",
		"Request: Run shell.",
		"Will run: Bash(rm -rf /tmp/scratch).",
		"Recommended choice: deny unless this exact destructive action is expected.",
		"Review queue",
		"reviewing: current session",
		"waiting for decision: 1",
		"1. bash · pending · destructive, external access",
		"risk: destructive, external access",
		"request: Run shell",
		"will run: Bash(rm -rf /tmp/scratch)",
		"connection: local MCP",
		"audit trail: call call_1 · request perm_1",
		"Decision history",
		"pending: 1",
		"destructive requests: 1",
		"external access requests: 1",
		"Review guardrails",
		"1. session requests · ask before running",
		"tool: bash",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("permissions inspector missing %q:\n%s", want, out)
		}
	}
	if strings.Index(out, "Review queue") > strings.Index(out, "Decision history") {
		t.Fatalf("permissions inspector should lead with the review queue, not accounting:\n%s", out)
	}
	if strings.Index(out, "Operator decision") > strings.Index(out, "Review queue") {
		t.Fatalf("permissions inspector should lead with operator decision guidance:\n%s", out)
	}
	for _, unwanted := range []string{"Decision shortcuts", "scope:", "source:", "pending decisions:", "evidence:", "status:", "next request:", "operator choice:", "allow this request once", "diagnostics:", "trace:", "open-world", "open_world", "policy_rules", "scope_id", "tool_call", "tool call:", "request id:", "review scope: sess_", "\n    call:", "\n    permission:"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("permissions inspector leaked backend label %q:\n%s", unwanted, out)
		}
	}
}

func TestFormatPermissionsInspectorStressStateShowsHistoryAndConflicts(t *testing.T) {
	out := formatPermissionsInspector([]client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{
			ID: "perm_shell", SessionID: "sess_1", Summary: "Delete scratch",
			ToolCall: gact.PermissionToolCall{
				ToolName: "shell",
				CallID:   "call_shell",
				Input:    map[string]any{"command": "rm -rf /tmp/clio"},
				Annotations: gact.ToolAnnotations{
					DestructiveHint: true,
				},
			},
		},
		Status: "pending",
	}, {
		PermissionRequest: gact.PermissionRequest{
			ID: "perm_web", SessionID: "sess_1", Summary: "Fetch NWS warnings",
			ToolCall: gact.PermissionToolCall{
				ToolName: "web_fetch",
				CallID:   "call_web",
				Input:    map[string]any{"url": "https://api.weather.gov/alerts/active?area=CA"},
				Annotations: gact.ToolAnnotations{
					ReadOnlyHint:  true,
					OpenWorldHint: true,
				},
			},
		},
		Status: "pending",
	}, {
		PermissionRequest: gact.PermissionRequest{
			ID: "perm_denied", SessionID: "sess_1", Summary: "Remove manifest",
			ToolCall: gact.PermissionToolCall{
				ToolName: "shell",
				CallID:   "call_denied",
				Input:    map[string]any{"command": "rm manifest.json"},
			},
		},
		Status: "resolved",
		Action: gact.PermDeny,
	}, {
		PermissionRequest: gact.PermissionRequest{
			ID: "perm_session", SessionID: "sess_1", Summary: "Read CSV",
			ToolCall: gact.PermissionToolCall{
				ToolName: "read_file",
				CallID:   "call_session",
				Input:    map[string]any{"path": "/workspace/tmp/cimis.csv"},
			},
		},
		Status: "resolved",
		Action: gact.PermAllowSession,
	}, {
		PermissionRequest: gact.PermissionRequest{
			ID: "perm_workspace", SessionID: "sess_1", Summary: "Read report",
			ToolCall: gact.PermissionToolCall{
				ToolName: "read_file",
				CallID:   "call_workspace",
				Input:    map[string]any{"path": "/workspace/README.md"},
			},
		},
		Status: "resolved",
		Action: gact.PermAllowWorkspace,
	}}, []gact.Policy{{
		Scope: "workspace", ToolNamePattern: "shell", PathPattern: "/tmp/**", Action: "ask",
	}, {
		Scope: "workspace", ToolNamePattern: "shell", PathPattern: "/tmp/**", Action: "deny",
	}}, "sess_1")

	for _, want := range []string{
		"2 approval requests waiting in current session.",
		"waiting for decision: 2",
		"1. shell · pending · destructive",
		"2. web_fetch · pending · read-only, external access",
		"denied",
		"allowed for session",
		"allowed for workspace",
		"policy conflict",
		"ask before running denied automatically on tool shell path /tmp/**",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("permissions stress inspector missing %q:\n%s", want, out)
		}
	}
}

func TestPermissionInspectorRendersDecisionButtons(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "sess_1", Title: "Demo"}}, nil)
	a.width = 140
	a.height = 36
	a.session.selected = 0
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{
		title:    "Permissions · review queue",
		fullText: "Decision required\n  1. review shell · pending",
	}

	out := ansi.Strip(a.View().Content)
	for _, want := range []string{"allow", "deny", "session", "workspace", "copy"} {
		if !strings.Contains(out, want) {
			t.Fatalf("permissions detail missing action button %q:\n%s", want, out)
		}
	}
	for _, id := range []string{"permissions:allow", "permissions:deny", "permissions:session", "permissions:workspace"} {
		if _, ok := findHitTargetForTest(a, "button:"+id); !ok {
			t.Fatalf("missing permission action hit target %q", id)
		}
	}
}

func TestPermissionInspectorHidesDecisionButtonsWhenQueueEmpty(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "sess_1", Title: "Demo"}}, nil)
	a.width = 140
	a.height = 36
	a.session.selected = 0
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{
		title:    "Permissions · review queue",
		fullText: "Decision required\n  no pending requests for this scope",
	}

	_ = a.View()
	for _, id := range []string{"permissions:allow", "permissions:deny", "permissions:session", "permissions:workspace"} {
		if _, ok := findHitTargetForTest(a, "button:"+id); ok {
			t.Fatalf("empty permission queue should not register active hit target %q", id)
		}
	}
}

func TestPermissionInspectorKeyRespondsAndRefreshes(t *testing.T) {
	var calls []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, r.Method+" "+r.URL.RequestURI())
		switch {
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/v1/permissions"):
			status := r.URL.Query().Get("status")
			if status == "pending" {
				_ = json.NewEncoder(w).Encode(map[string]any{"permissions": []client.PermissionWire{{
					PermissionRequest: gact.PermissionRequest{
						ID:        "perm_1",
						SessionID: "sess_1",
						Summary:   "Run shell",
						ToolCall: gact.PermissionToolCall{
							ToolName: "bash",
							Input:    map[string]any{"command": "echo hi"},
						},
					},
					Status: "pending",
				}}})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"permissions": []client.PermissionWire{{
				PermissionRequest: gact.PermissionRequest{
					ID:        "perm_1",
					SessionID: "sess_1",
					Summary:   "Run shell",
					ToolCall:  gact.PermissionToolCall{ToolName: "bash"},
				},
				Status: "allowed",
			}}})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/permissions/perm_1":
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode permission response: %v", err)
			}
			if body["action"] != string(gact.PermAllowSession) {
				t.Fatalf("permission action = %q, want allow_session", body["action"])
			}
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/policies":
			_ = json.NewEncoder(w).Encode(map[string]any{"policies": []gact.Policy{{
				Scope: "session", ToolNamePattern: "bash", Action: "ask",
			}}})
		default:
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.RequestURI())
		}
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "Demo"}}
	a.session.selected = 0
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{title: "Permissions · review queue", fullText: "pending"}
	a.session.pendingPermissions = []client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{ID: "perm_1", SessionID: "sess_1"},
		Status:            "pending",
	}}

	model, cmd := a.detail.handleKey(tea.KeyPressMsg{Code: 's', Text: "s"})
	a = model.(*App)
	if cmd == nil {
		t.Fatal("permission inspector key should dispatch response command")
	}
	msg := cmd()
	model, _ = a.Update(msg)
	a = model.(*App)

	wantCalls := []string{
		"GET /v1/permissions?session_id=sess_1&status=pending",
		"POST /v1/permissions/perm_1",
		"GET /v1/permissions?session_id=sess_1",
		"GET /v1/policies",
	}
	if strings.Join(calls, "\n") != strings.Join(wantCalls, "\n") {
		t.Fatalf("calls:\n%s\nwant:\n%s", strings.Join(calls, "\n"), strings.Join(wantCalls, "\n"))
	}
	if len(a.session.pendingPermissions) != 0 {
		t.Fatalf("pending permissions should be cleared locally, got %#v", a.session.pendingPermissions)
	}
	if !a.detail.visible || a.detail.ref == nil || !strings.Contains(a.detail.ref.fullText, "allowed") {
		t.Fatalf("permission inspector should remain open with refreshed content: open=%v detail=%#v", a.detail.visible, a.detail.ref)
	}
	if !strings.Contains(a.transientHint, "permission allow session applied") {
		t.Fatalf("transient hint = %q", a.transientHint)
	}
}

func TestPermissionsInspectorResolvedRowsUseActionDisplay(t *testing.T) {
	out := formatPermissionsInspector([]client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{
			ID: "perm_1", SessionID: "sess_1", Summary: "Run shell",
			ToolCall: gact.PermissionToolCall{
				ToolName: "shell",
				CallID:   "call_1",
				Input:    map[string]any{"command": "echo hi"},
			},
		},
		Status: "resolved",
		Action: gact.PermDeny,
	}}, nil, "sess_1")

	if !strings.Contains(out, "shell · denied") {
		t.Fatalf("resolved deny row should show the actual decision:\n%s", out)
	}
	for _, want := range []string{"will run: Shell(echo hi)", "audit trail: call call_1 · session sess_1 · request perm_1"} {
		if !strings.Contains(out, want) {
			t.Fatalf("resolved row missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "shell · resolved") {
		t.Fatalf("resolved row leaked generic backend status:\n%s", out)
	}
	for _, unwanted := range []string{"operation:", "tool call:", "request id:", "diagnostics:"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("resolved row leaked backend label %q:\n%s", unwanted, out)
		}
	}
}
