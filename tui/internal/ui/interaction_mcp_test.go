package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestMcpRemoveRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemove.open = true
	a.mcpRemove.options = []gact.McpServer{
		{ID: "srv_one", Name: "one", Transport: "stdio"},
		{ID: "srv_two", Name: "two", Transport: "http"},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "mcp-remove:item:1")
	if !ok {
		t.Fatal("missing semantic MCP remove row target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.mcpRemove.sel != 1 {
		t.Fatalf("mcpRemoveSel = %d, want clicked row", a.mcpRemove.sel)
	}
	if a.mcpRemove.saving {
		t.Fatal("first click on a remove row should arm confirmation, not remove immediately")
	}
	if cmd == nil {
		t.Fatal("first click on a remove row should schedule confirmation hint expiry")
	}
	if a.mcpRemove.confirmID != "srv_two" {
		t.Fatalf("mcpRemoveConfirmID = %q, want srv_two", a.mcpRemove.confirmID)
	}
	out := ansi.Strip(a.mcpRemove.view())
	if !strings.Contains(out, "confirm remove") || !strings.Contains(out, "Confirm removing srv_two") {
		t.Fatalf("armed MCP remove state should be visible:\n%s", out)
	}

	_ = a.View()
	target, ok = findHitTargetForTest(a, "mcp-remove:item:1")
	if !ok {
		t.Fatal("missing semantic MCP remove row target after arming")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if a.mcpRemove.sel != 1 || !a.mcpRemove.saving || a.mcpRemove.confirmID != "" || cmd == nil {
		t.Fatalf("second click should remove row 1, sel=%d saving=%v confirm=%q cmd=%v", a.mcpRemove.sel, a.mcpRemove.saving, a.mcpRemove.confirmID, cmd)
	}
}

func TestMcpRemoveTargetsAlignWithSharedFrameBody(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemove.open = true
	a.mcpRemove.options = []gact.McpServer{
		{ID: "srv_one", Name: "one", Transport: "stdio"},
		{ID: "srv_two", Name: "two", Transport: "http"},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "mcp-remove:item:0")
	if !ok {
		t.Fatal("missing semantic first MCP remove row target")
	}
	rect := overlayMouseRect(a.mcpRemove.view(), a.width, a.height)
	if wantY := rect.y + 2 + 5; target.rect.y != wantY {
		t.Fatalf("first MCP remove row y = %d, want shared frame body row after guidance %d", target.rect.y, wantY)
	}
}

func TestMcpRemoveRowsUseDenseInlineMetadata(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemove.open = true
	a.mcpRemove.options = []gact.McpServer{
		{ID: "srv_one", Name: "one", Transport: "stdio"},
		{ID: "srv_two", Name: "two", Transport: "http"},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "mcp-remove:item:1")
	if !ok {
		t.Fatal("missing semantic MCP remove row target")
	}
	if target.rect.h != 1 {
		t.Fatalf("MCP remove target height = %d, want dense one-line row", target.rect.h)
	}
	out := ansi.Strip(a.mcpRemove.view())
	if !strings.Contains(out, "two  [http]  srv_two") {
		t.Fatalf("MCP remove row should render server id inline:\n%s", out)
	}
	for _, want := range []string{"Remove custom MCP connections from the current workspace.", "Bundled CLIO connections stay available and are not listed here."} {
		if !strings.Contains(out, want) {
			t.Fatalf("MCP remove modal missing operator copy %q:\n%s", want, out)
		}
	}
	for _, old := range []string{"backend owns", "externally installed MCP servers"} {
		if strings.Contains(out, old) {
			t.Fatalf("MCP remove modal leaked backend wording %q:\n%s", old, out)
		}
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if a.mcpRemove.sel != 1 || a.mcpRemove.saving || a.mcpRemove.confirmID != "srv_two" || cmd == nil {
		t.Fatalf("dense row click should arm row 1, sel=%d saving=%v confirm=%q cmd=%v", a.mcpRemove.sel, a.mcpRemove.saving, a.mcpRemove.confirmID, cmd)
	}
	out = ansi.Strip(a.mcpRemove.view())
	if !strings.Contains(out, "two  [confirm remove]  srv_two") {
		t.Fatalf("armed row should render confirm status inline:\n%s", out)
	}
}

func TestMcpRemoveEnterRequiresConfirmationAndNavigationCancels(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemove.open = true
	a.mcpRemove.options = []gact.McpServer{
		{ID: "srv_one", Name: "one", Transport: "stdio"},
		{ID: "srv_two", Name: "two", Transport: "http"},
	}

	model, cmd := a.mcpRemove.handleKey(keyMsg("enter"))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("first Enter should schedule confirmation hint expiry")
	}
	if a.mcpRemove.saving || a.mcpRemove.confirmID != "srv_one" {
		t.Fatalf("first Enter should arm srv_one, saving=%v confirm=%q", a.mcpRemove.saving, a.mcpRemove.confirmID)
	}

	model, cmd = a.mcpRemove.handleKey(keyMsg("down"))
	a = model.(*App)
	if cmd != nil {
		t.Fatalf("down should only move selection and cancel confirmation, got %v", cmd)
	}
	if a.mcpRemove.sel != 1 || a.mcpRemove.confirmID != "" {
		t.Fatalf("down should select row 1 and clear confirmation, sel=%d confirm=%q", a.mcpRemove.sel, a.mcpRemove.confirmID)
	}

	model, cmd = a.mcpRemove.handleKey(keyMsg("enter"))
	a = model.(*App)
	if cmd == nil || a.mcpRemove.saving || a.mcpRemove.confirmID != "srv_two" {
		t.Fatalf("first Enter on row 1 should arm confirmation, saving=%v confirm=%q cmd=%v", a.mcpRemove.saving, a.mcpRemove.confirmID, cmd)
	}
	model, cmd = a.mcpRemove.handleKey(keyMsg("enter"))
	a = model.(*App)
	if cmd == nil || !a.mcpRemove.saving || a.mcpRemove.confirmID != "" {
		t.Fatalf("second Enter should dispatch removal, saving=%v confirm=%q cmd=%v", a.mcpRemove.saving, a.mcpRemove.confirmID, cmd)
	}
}

func TestMcpRemoveFailureKeepsModalOpenWithOperatorError(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemove.open = true
	a.mcpRemove.saving = true
	a.mcpRemove.options = []gact.McpServer{
		{ID: "mcp_docs", Name: "docs-mcp", Transport: "http"},
	}

	err := &client.Error{Status: 409, Code: "mcp_remove_failed", Message: "remove failed: connection is still referenced by a workspace profile"}
	model, cmd := a.Update(mcpUninstallDoneMsg{serverID: "mcp_docs", err: err})
	a = model.(*App)

	if cmd == nil {
		t.Fatal("remove failure should schedule hint expiry")
	}
	if !a.mcpRemove.open || a.mcpRemove.saving {
		t.Fatalf("remove failure should keep modal open and clear saving, open=%v saving=%v", a.mcpRemove.open, a.mcpRemove.saving)
	}
	if !strings.Contains(a.transientHint, "MCP remove failed: remove failed: connection is still referenced by a workspace profile") {
		t.Fatalf("transient hint = %q", a.transientHint)
	}
	if strings.Contains(a.transientHint, "gact:") || strings.Contains(a.transientHint, "mcp_remove_failed") {
		t.Fatalf("remove failure leaked raw client/backend wrapper: %q", a.transientHint)
	}
}

func TestMcpRemoveUsesBoundedScrollWindowAndVisibleHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemove.open = true
	a.mcpRemove.sel = 10
	for i := 0; i < 16; i++ {
		a.mcpRemove.options = append(a.mcpRemove.options, gact.McpServer{
			ID:        "srv_" + itoa2(i),
			Name:      "server " + itoa2(i),
			Transport: "stdio",
		})
	}

	out := stripANSI(a.mcpRemove.view())
	if !strings.Contains(out, "server 10") {
		t.Fatalf("selected MCP server should remain visible in bounded window:\n%s", out)
	}
	if strings.Contains(out, "server 00") {
		t.Fatalf("bounded MCP remove window should not render every server:\n%s", out)
	}
	if strings.Contains(out, "↑ 4") || strings.Contains(out, "↓ 4") {
		t.Fatalf("bounded MCP remove window should not render textual overflow count rows:\n%s", out)
	}
	if !strings.Contains(out, "┃") {
		t.Fatalf("bounded MCP remove window should show shared side scroll rail:\n%s", out)
	}

	_ = a.View()
	if _, ok := findHitTargetForTest(a, "mcp-remove:item:10"); !ok {
		t.Fatal("missing semantic target for selected row inside scrolled MCP remove window")
	}
	if _, ok := findHitTargetForTest(a, "mcp-remove:item:0"); ok {
		t.Fatal("offscreen MCP remove row should not register a stale hit target")
	}
}
