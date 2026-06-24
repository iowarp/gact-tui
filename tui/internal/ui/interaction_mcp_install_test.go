package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func TestMcpInstallButtonsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpInstall.open = true
	a.mcpInstall.input.SetValue("bad")

	out := ansi.Strip(a.mcpInstall.view())
	for _, want := range []string{"Add a trusted third-party MCP connection to the current workspace.", "Format:"} {
		if !strings.Contains(out, want) {
			t.Fatalf("MCP install modal missing operator copy %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "this backend") {
		t.Fatalf("MCP install modal leaked backend wording:\n%s", out)
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:mcp-install:install")
	if !ok {
		t.Fatal("missing semantic MCP install button target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("invalid install click should not dispatch command")
	}
	if a.mcpInstall.err == "" {
		t.Fatal("invalid install click should surface parse error")
	}
}

func TestMcpInstallButtonsAlignWithSharedHeader(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpInstall.open = true
	a.mcpInstall.input.SetValue("bad")

	_ = a.View()
	target, ok := findHitTargetForTest(a, "button:mcp-install:install")
	if !ok {
		t.Fatal("missing semantic MCP install button target")
	}
	rect := overlayMouseRect(a.mcpInstall.view(), a.width, a.height)
	if wantY := rect.y + 2; target.rect.y != wantY {
		t.Fatalf("MCP install button y = %d, want shared frame header row %d", target.rect.y, wantY)
	}
}

func TestMcpInstallEditorClickPlacesCursor(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpInstall.open = true
	a.mcpInstall.input.SetValue("files stdio mcp-files /tmp")
	a.mcpInstall.input.SetCursor(len([]rune(a.mcpInstall.input.Value())))

	_ = a.View()
	target, ok := findHitTargetForTest(a, "text-entry:mcp-install:cursor:5")
	if !ok {
		t.Fatal("missing MCP install editor cursor target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("cursor click should not dispatch a command")
	}
	if a.mcpInstall.input.Cursor() != 5 {
		t.Fatalf("MCP install cursor = %d, want 5", a.mcpInstall.input.Cursor())
	}
	if !a.mcpInstall.open {
		t.Fatal("cursor click should keep MCP install open")
	}
}

func TestMcpInstallExamplesUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpInstall.open = true
	a.mcpInstall.input.SetValue("bad")
	a.mcpInstall.input.SetCursor(len(a.mcpInstall.input.Value()))
	a.mcpInstall.err = "usage"

	_ = a.View()
	target, ok := findHitTargetForTest(a, "mcp-install:example:http")
	if !ok {
		t.Fatal("missing semantic MCP install http example target")
	}
	if target.rect.h != 1 {
		t.Fatalf("example target height = %d, want one list row", target.rect.h)
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x + target.rect.w - 1,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("example click should not dispatch a command")
	}
	want := "weather http https://mcp.example.com"
	if a.mcpInstall.input.Value() != want {
		t.Fatalf("example input = %q, want %q", a.mcpInstall.input.Value(), want)
	}
	if a.mcpInstall.input.Cursor() != len([]rune(want)) {
		t.Fatalf("cursor = %d, want end %d", a.mcpInstall.input.Cursor(), len([]rune(want)))
	}
	if a.mcpInstall.err != "" {
		t.Fatalf("example click should clear stale error, got %q", a.mcpInstall.err)
	}
}

func TestMcpInstallExampleRowsAndHitsShareOrdering(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	list := a.mcpInstall.renderExampleList()
	if len(list.rows) != 2 {
		t.Fatalf("example rows = %d, want 2", len(list.rows))
	}
	if len(list.hits) != len(list.rows) {
		t.Fatalf("example hits = %d, want %d", len(list.hits), len(list.rows))
	}
	for i, hit := range list.hits {
		if hit.row != i || hit.height != 1 {
			t.Fatalf("hit %d geometry = row %d height %d, want row %d height 1", i, hit.row, hit.height, i)
		}
	}
	if list.hits[1].id != "mcp-install:example:http" || !strings.Contains(list.rows[1], "weather http") {
		t.Fatalf("second example row/hit mismatch: row=%q hit=%q", list.rows[1], list.hits[1].id)
	}
}

func TestMcpInstallLineEditorSupportsMiddleInsert(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.mcpInstall.open = true
	a.mcpInstall.input.SetValue("ab")
	a.mcpInstall.input.SetCursor(1)

	_, cmd := a.mcpInstall.handleKey(tea.KeyPressMsg{Text: "Z"})
	if cmd != nil {
		t.Fatal("typing should not dispatch a command")
	}
	if a.mcpInstall.input.Value() != "aZb" || a.mcpInstall.input.Cursor() != 2 {
		t.Fatalf("middle insert input=%q cursor=%d, want aZb cursor 2", a.mcpInstall.input.Value(), a.mcpInstall.input.Cursor())
	}
	_, _ = a.mcpInstall.handleKey(keyMsg("left"))
	_, _ = a.mcpInstall.handleKey(keyMsg("backspace"))
	if a.mcpInstall.input.Value() != "Zb" || a.mcpInstall.input.Cursor() != 0 {
		t.Fatalf("middle backspace input=%q cursor=%d, want Zb cursor 0", a.mcpInstall.input.Value(), a.mcpInstall.input.Cursor())
	}
}

func TestMcpInstallOutsideClickUsesSharedCloseState(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.mcpInstall.open = true
	a.mcpInstall.input.SetValue("bad")
	a.mcpInstall.err = "parse failed"
	a.mcpInstall.saving = true

	_ = a.View()
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      0,
		Y:      0,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd != nil {
		t.Fatal("outside click should not dispatch a command")
	}
	if a.mcpInstall.open || a.mcpInstall.input.Value() != "" || a.mcpInstall.err != "" || a.mcpInstall.saving {
		t.Fatalf("outside click should clear install modal state, open=%v input=%q err=%q saving=%v", a.mcpInstall.open, a.mcpInstall.input.Value(), a.mcpInstall.err, a.mcpInstall.saving)
	}
}
