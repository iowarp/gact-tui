package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestMcpRemoveMouseWheelMovesSelection(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemove.open = true
	for i := 0; i < 4; i++ {
		a.mcpRemove.options = append(a.mcpRemove.options, gact.McpServer{
			ID:        "srv_" + itoa2(i),
			Name:      "server " + itoa2(i),
			Transport: "stdio",
		})
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "mcp-remove:list:wheel")
	if !ok {
		t.Fatal("missing semantic MCP remove list wheel target")
	}
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)
	if a.mcpRemove.sel != 1 {
		t.Fatalf("wheel down should move MCP remove selection, got %d", a.mcpRemove.sel)
	}
	_ = a.View()
	target, ok = findHitTargetForTest(a, "mcp-remove:list:wheel")
	if !ok {
		t.Fatal("missing semantic MCP remove list wheel target after redraw")
	}
	model, _ = a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseWheelUp,
	}))
	a = model.(*App)
	if a.mcpRemove.sel != 0 {
		t.Fatalf("wheel up should move MCP remove selection, got %d", a.mcpRemove.sel)
	}
}

func TestMcpRemoveMouseWheelOutsideListDoesNotMoveSelection(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemove.open = true
	for i := 0; i < 4; i++ {
		a.mcpRemove.options = append(a.mcpRemove.options, gact.McpServer{
			ID:        "srv_" + itoa2(i),
			Name:      "server " + itoa2(i),
			Transport: "stdio",
		})
	}

	_ = a.View()
	view := a.mcpRemove.view()
	rect := overlayMouseRect(view, a.width, a.height)
	model, _ := a.Update(tea.MouseWheelMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2,
		Button: tea.MouseWheelDown,
	}))
	a = model.(*App)

	if a.mcpRemove.sel != 0 {
		t.Fatalf("wheel outside list should not move MCP remove selection, got %d", a.mcpRemove.sel)
	}
}

func TestMcpRemoveNonRowClickDoesNotChooseByCoordinates(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemove.open = true
	a.mcpRemove.sel = 0
	a.mcpRemove.options = []gact.McpServer{{ID: "srv_one", Name: "one", Transport: "stdio"}}

	_ = a.View()
	rect := overlayMouseRect(a.mcpRemove.view(), a.width, a.height)
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      rect.x + rect.w - 2,
		Y:      rect.y + 2 + 1,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("non-row click inside MCP remove modal should not dispatch")
	}
	if !a.mcpRemove.open {
		t.Fatal("non-row click inside MCP remove modal should keep modal open")
	}
	if a.mcpRemove.saving {
		t.Fatal("non-row click should not enter removing state")
	}
}

func TestMcpRemoveCancelButtonUsesSharedCloseState(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemove.open = true
	a.mcpRemove.sel = 1
	a.mcpRemove.saving = true
	a.mcpRemove.confirmID = "srv_two"
	a.mcpRemove.options = []gact.McpServer{
		{ID: "srv_one", Name: "one", Transport: "stdio"},
		{ID: "srv_two", Name: "two", Transport: "http"},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:mcp-remove:cancel")
	if !ok {
		t.Fatal("missing semantic MCP remove cancel button target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("cancel click should not dispatch a command")
	}
	if a.mcpRemove.open || a.mcpRemove.options != nil || a.mcpRemove.sel != 0 || a.mcpRemove.saving || a.mcpRemove.confirmID != "" {
		t.Fatalf("cancel should clear remove modal state, open=%v options=%v sel=%d saving=%v confirm=%q", a.mcpRemove.open, a.mcpRemove.options, a.mcpRemove.sel, a.mcpRemove.saving, a.mcpRemove.confirmID)
	}
}

func TestMcpRemoveButtonsAlignWithSharedHeader(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpRemove.open = true
	a.mcpRemove.options = []gact.McpServer{{ID: "srv_one", Name: "one", Transport: "stdio"}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:mcp-remove:cancel")
	if !ok {
		t.Fatal("missing semantic MCP remove cancel button target")
	}
	rect := overlayMouseRect(a.mcpRemove.view(), a.width, a.height)
	if wantY := rect.y + 2; target.rect.y != wantY {
		t.Fatalf("MCP remove cancel button y = %d, want shared frame header row %d", target.rect.y, wantY)
	}
}
