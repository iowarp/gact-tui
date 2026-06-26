package ui

import (
	"errors"
	"strconv"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestContextRowsUseSemanticHitTargets(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{{
		ID:           "sess_1",
		WorkspaceID:  "ws_default",
		Title:        "demo",
		Agent:        gact.AgentRef{ID: "analysis"},
		Status:       gact.StatusIdle,
		UpdatedAt:    time.Date(2026, 5, 25, 12, 0, 0, 0, time.UTC),
		MessageCount: 7,
	}}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{{
		Path:         "docs/ARC_MEMORY_LAYER.md",
		Mode:         "read",
		Size:         2048,
		Language:     "markdown",
		AddedAt:      "2026-05-25T10:00:00Z",
		LastModified: "2026-05-24T18:30:00Z",
	}}

	_ = a.View()
	sidebar := ansi.Strip(a.sidebar.render(42, 24))
	if !strings.Contains(sidebar, "read") || !strings.Contains(sidebar, "2.0 KiB") {
		t.Fatalf("context row should expose readable mode and size:\n%s", sidebar)
	}
	for _, want := range []string{"markdown", "demo", "May 24"} {
		if !strings.Contains(sidebar, want) {
			t.Fatalf("selected context row should expose %q in its metadata line:\n%s", want, sidebar)
		}
	}
	if strings.Contains(sidebar, " R ") {
		t.Fatalf("context row should not use cryptic single-letter mode badges:\n%s", sidebar)
	}
	target, ok := findHitTargetForTest(a, "sidebar:context:file:docs/ARC_MEMORY_LAYER.md")
	if !ok {
		t.Fatal("missing context file hit target")
	}
	if target.rect.h != 2 {
		t.Fatalf("selected context file hit target height = %d, want 2", target.rect.h)
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y + 1,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("context row click should open detail")
	}
	for _, want := range []string{
		"File",
		"path: docs/ARC_MEMORY_LAYER.md",
		"mode: read",
		"status: workspace file attached to selected session as read",
		"source: workspace context file",
		"session use: referenced by selected GACT session context as read",
		"size: 2.0 KiB",
		"language: markdown",
		"added: 2026-05-25T10:00:00Z",
		"last modified: 2026-05-24T18:30:00Z",
		"Session",
		"id: sess_1",
		"workspace: ws_default",
		"status: idle",
		"agent: analysis",
		"latest activity: 2026-05-25T12:00:00Z",
		"messages: 7",
		"Actions",
		"Enter / click: open this context detail and load a content preview when GACT exposes it",
	} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("context detail missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}
}

func TestContextRowsDistinguishUploadedAttachments(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{{
		ID:          "sess_1",
		WorkspaceID: "ws_default",
		Title:       "demo",
		Status:      gact.StatusIdle,
	}}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{{
		Path:     ".clio/attachments/sess_1/report.txt",
		Mode:     "read",
		Size:     32,
		Language: "text",
		Uploaded: true,
	}}

	_ = a.View()
	sidebar := ansi.Strip(a.sidebar.render(54, 24))
	for _, want := range []string{"source: attachment", "demo"} {
		if !strings.Contains(sidebar, want) {
			t.Fatalf("uploaded context row should expose %q:\n%s", want, sidebar)
		}
	}
	target, ok := findHitTargetForTest(a, "sidebar:context:file:.clio/attachments/sess_1/report.txt")
	if !ok {
		t.Fatal("missing uploaded context file hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	for _, want := range []string{
		"status: GACT uploaded attachment attached to selected session as read",
		"source: uploaded attachment (created through attachments_upload, not workspace browsing)",
		"session use: copied into selected GACT session context as read",
	} {
		if !strings.Contains(a.detail.ref.fullText, want) {
			t.Fatalf("uploaded context detail missing %q:\n%s", want, a.detail.ref.fullText)
		}
	}
}

func TestContextFileRemovedUpdatesVisibleContextRows(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo"}}
	a.session.selected = 0
	a.session.contextFileSel = 1
	a.session.contextFiles = []gact.ContextFile{
		{Path: "docs/first.md", Mode: "read"},
		{Path: "docs/second.md", Mode: "read"},
	}
	a.detail.visible = true
	a.detail.ref = &bulkyPartRef{messageID: "context", partID: "docs/second.md", fullText: "stale"}

	model, cmd := a.Update(contextFileRemovedMsg{sessionID: "sess_1", path: "docs/second.md"})
	a = model.(*App)
	if cmd != nil {
		t.Fatal("context removal state update should not dispatch a command")
	}
	if len(a.session.contextFiles) != 1 || a.session.contextFiles[0].Path != "docs/first.md" {
		t.Fatalf("context files not updated: %#v", a.session.contextFiles)
	}
	if a.session.contextFileSel != 0 {
		t.Fatalf("contextFileSel = %d, want 0", a.session.contextFileSel)
	}
	if a.detail.visible || a.detail.ref != nil {
		t.Fatal("removing the detailed file should close stale detail view")
	}
	if !strings.Contains(a.transientHint, "removed docs/second.md") {
		t.Fatalf("hint = %q", a.transientHint)
	}
}

func TestContextFileRemoveFailureKeepsVisibleContextRows(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo"}}
	a.session.selected = 0
	a.session.contextFileSel = 0
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}

	model, cmd := a.Update(contextFileRemovedMsg{
		sessionID: "sess_1",
		path:      "docs/readme.md",
		err:       errors.New("no such file in context"),
	})
	a = model.(*App)
	if cmd != nil {
		t.Fatal("context removal failure should not dispatch a command")
	}
	if len(a.session.contextFiles) != 1 || a.session.contextFiles[0].Path != "docs/readme.md" {
		t.Fatalf("failed removal should keep context file visible: %#v", a.session.contextFiles)
	}
	if a.session.contextFileSel != 0 {
		t.Fatalf("contextFileSel = %d, want 0", a.session.contextFileSel)
	}
	if !strings.Contains(a.transientHint, "remove failed: no such file in context") {
		t.Fatalf("hint = %q", a.transientHint)
	}
}

func TestContextHeaderUsesSemanticHitTarget(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo"}}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/readme.md", Mode: "read"}}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "sidebar:context:header")
	if !ok {
		t.Fatal("missing context header hit target")
	}
	model, _ := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if !a.sidebar.contextCollapsed {
		t.Fatal("context header click should collapse context section")
	}
	if a.sidebar.sectionFocus != sidebarSectionContext || !a.sidebar.sectionCursor {
		t.Fatalf("context focus not set: focus=%v cursor=%v", a.sidebar.sectionFocus, a.sidebar.sectionCursor)
	}
}

func TestContextRowsHaveKeyboardParity(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionContext
	a.sidebar.sectionCursor = true
	a.session.sessions = []gact.Session{{
		ID:    "sess_1",
		Title: "demo",
		Agent: gact.AgentRef{ID: "analysis"},
	}}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{
		{Path: "docs/first.md", Mode: "read"},
		{Path: "docs/second.md", Mode: "edit", Size: 4096},
	}

	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.sidebar.sectionCursor || a.sidebar.sectionFocus != sidebarSectionContext {
		t.Fatalf("down from context header should focus file rows, cursor=%v section=%v", a.sidebar.sectionCursor, a.sidebar.sectionFocus)
	}
	if a.session.contextFileSel != 0 {
		t.Fatalf("contextFileSel = %d, want first row", a.session.contextFileSel)
	}

	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.session.contextFileSel != 1 {
		t.Fatalf("second down contextFileSel = %d, want second row", a.session.contextFileSel)
	}

	a.sidebar.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if !a.detail.visible || a.detail.ref == nil {
		t.Fatal("enter on selected context file should open detail")
	}
	if !strings.Contains(a.detail.ref.fullText, "path: docs/second.md") || !strings.Contains(a.detail.ref.fullText, "size: 4.0 KiB") {
		t.Fatalf("detail should describe selected context file:\n%s", a.detail.ref.fullText)
	}
}

func TestContextRowSelectionRendersSingleSidebarCursor(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionContext
	a.sidebar.sectionCursor = false
	a.session.contextFileSel = 0
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{{Path: "docs/first.md", Mode: "read"}}

	out := ansi.Strip(a.sidebar.render(42, 18))
	if strings.Contains(out, "▌○ demo") {
		t.Fatalf("session row should not show active cursor while context row is selected:\n%s", out)
	}
	if !strings.Contains(out, "▌docs/first.md read") {
		t.Fatalf("selected context row should show active cursor:\n%s", out)
	}
}

func TestContextSectionRemainsVisibleWhenSessionsOverflow(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 120
	a.height = 36
	a.stage = StageReady
	a.focus = FocusSidebar
	a.sidebar.sectionFocus = sidebarSectionContext
	a.sidebar.sectionCursor = false
	a.session.sessions = []gact.Session{{ID: "sess_0", Title: "current", Status: gact.StatusIdle}}
	for i := 1; i < 24; i++ {
		a.session.sessions = append(a.session.sessions, gact.Session{
			ID:              "sess_child_" + strconv.Itoa(i),
			Title:           "analysis_validator subagent",
			Status:          gact.StatusIdle,
			ParentSessionID: "sess_0",
		})
	}
	a.session.selected = 0
	a.session.contextFiles = []gact.ContextFile{{Path: "visual_loop/README.md", Mode: "read"}}

	out := ansi.Strip(a.sidebar.render(42, 24))
	if !strings.Contains(out, "CONTEXT") || !strings.Contains(out, "▌visual_loop/README.md read") {
		t.Fatalf("context section should remain visible below overflowing sessions:\n%s", out)
	}
}
