package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestPermissionBannerShowsConcreteDecision(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	rendered, actions := a.permission.renderBanner(client.PermissionWire{
		PermissionRequest: gact.PermissionRequest{
			ID:        "perm_1",
			SessionID: "sess_1",
			Summary:   "Run shell command: rm -rf /tmp/scratch",
			ToolCall: gact.PermissionToolCall{
				ToolName: "shell",
				Input: map[string]any{
					"command": "rm -rf /tmp/scratch",
				},
				Annotations: gact.ToolAnnotations{DestructiveHint: true},
			},
		},
		Status: "pending",
	}, 110)
	plain := ansi.Strip(rendered)

	for _, want := range []string{
		"Approval needed: Shell(rm -rf /tmp/scratch)",
		"destructive",
		"A:allow",
		"D:deny",
		"S:sess",
		"W:work",
	} {
		if !strings.Contains(plain, want) {
			t.Fatalf("permission banner missing %q in %q", want, plain)
		}
	}
	if strings.Contains(plain, "/v1/permissions") {
		t.Fatalf("permission banner should not expose backend route copy: %q", plain)
	}
	if len(actions) != 4 {
		t.Fatalf("actions = %d, want 4", len(actions))
	}
}

func TestPermissionBannerActionsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusWaitingPermission}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusWaitingPermission
	a.session.pendingPermissions = []client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{
			ID:        "perm_1",
			SessionID: "sess_1",
			Summary:   "Run shell command: rm -rf /tmp/scratch",
		},
		Status: "pending",
	}}

	_ = a.View()
	for _, id := range []string{
		"permission:allow",
		"permission:deny",
		"permission:session",
		"permission:workspace",
	} {
		if _, ok := findHitTargetForTest(a, id); !ok {
			t.Fatalf("missing semantic permission hit target %q", id)
		}
	}

	target, _ := findHitTargetForTest(a, "permission:allow")
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd == nil {
		t.Fatal("clicking allow should dispatch a permission response command")
	}
}

func TestPermissionBannerActionRectUsesPaneContentGeometry(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36

	rect, ok := a.permission.bannerActionRect(permissionBannerAction{
		id:    "allow",
		col:   12,
		width: 7,
	}, 90)
	if !ok {
		t.Fatalf("expected visible permission action rect")
	}
	want := mouseRect{x: 45, y: 3, w: 7, h: 1}
	if rect != want {
		t.Fatalf("permission rect mismatch: got %+v want %+v", rect, want)
	}

	rect, ok = a.permission.bannerActionRect(permissionBannerAction{
		id:    "workspace",
		col:   84,
		width: 12,
	}, 90)
	if !ok {
		t.Fatalf("expected clipped permission action rect")
	}
	want = mouseRect{x: 117, y: 3, w: 2, h: 1}
	if rect != want {
		t.Fatalf("clipped permission rect mismatch: got %+v want %+v", rect, want)
	}

	if _, ok := a.permission.bannerActionRect(permissionBannerAction{
		id:    "hidden",
		col:   86,
		width: 5,
	}, 90); ok {
		t.Fatalf("expected hidden permission action outside content width")
	}
}

func TestPermissionBannerActionsStayInsideBodyWithRightSidebar(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 150
	a.height = 36
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "sess_perm", Title: "approval", Status: gact.StatusWaitingPermission}}
	a.session.selected = 0
	a.session.currentStatus = gact.StatusWaitingPermission
	a.conversation.messages = []gact.Message{{
		ID:        "msg_user",
		SessionID: "sess_perm",
		Role:      gact.RoleUser,
		Parts:     []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "remove scratch files"}},
	}}
	a.session.pendingPermissions = []client.PermissionWire{{
		PermissionRequest: gact.PermissionRequest{
			ID:        "perm_sidebar",
			SessionID: "sess_perm",
			Summary:   "Run shell command: rm -rf /tmp/scratch",
		},
		Status: "pending",
	}}
	a.sidebar.rightSidebarModuleIDs = []sidebarModuleID{sidebarModuleFiles}
	a.fileViewer.fileTreeEntries = []fileTreeEntry{
		{Path: "src/main.go"},
		{Path: "visual_loop/report.md"},
	}

	_ = a.View()
	right, ok := findHitTargetForTest(a, "right-sidebar:focus")
	if !ok {
		t.Fatal("missing right sidebar focus hit target")
	}
	for _, id := range []string{"permission:allow", "permission:deny", "permission:session", "permission:workspace"} {
		target, ok := findHitTargetForTest(a, id)
		if !ok {
			t.Fatalf("missing semantic permission hit target %q", id)
		}
		if target.rect.x+target.rect.w > right.rect.x {
			t.Fatalf("%s rect overlaps right sidebar: permission=%+v right=%+v", id, target.rect, right.rect)
		}
		if target.rect.y != 3 {
			t.Fatalf("%s row = %d, want banner row 3", id, target.rect.y)
		}
	}
}
