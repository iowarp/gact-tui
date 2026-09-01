package opencode

import (
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestSessionToGact_BasicFields(t *testing.T) {
	oc := OcSession{
		ID:          "ses_abc123",
		Slug:        "fix-the-thing",
		ProjectID:   "prj_xyz",
		WorkspaceID: "ws_real",
		Directory:   "/home/me/project",
		Title:       "Fix the thing",
		Time:        OcTimes{Created: 1_700_000_000_000, Updated: 1_700_000_500_000},
	}
	g := SessionToGact(oc)

	if g.ID != "ses_abc123" {
		t.Errorf("ID = %q", g.ID)
	}
	if g.WorkspaceID != "ws_real" {
		t.Errorf("WorkspaceID = %q", g.WorkspaceID)
	}
	if g.Title != "Fix the thing" {
		t.Errorf("Title = %q", g.Title)
	}
	if g.Status != gact.StatusIdle {
		t.Errorf("Status default = %q, want idle", g.Status)
	}
	wantCreated := time.UnixMilli(1_700_000_000_000).UTC()
	if !g.CreatedAt.Equal(wantCreated) {
		t.Errorf("CreatedAt = %v, want %v", g.CreatedAt, wantCreated)
	}
	if g.Metadata["x_opencode_slug"] != "fix-the-thing" {
		t.Errorf("metadata slug missing: %+v", g.Metadata)
	}
	if g.Metadata["x_opencode_project_id"] != "prj_xyz" {
		t.Errorf("metadata project_id missing")
	}
	if g.Metadata["x_opencode_directory"] != "/home/me/project" {
		t.Errorf("metadata directory missing")
	}
}

func TestSessionToGact_DefaultsWorkspace(t *testing.T) {
	oc := OcSession{ID: "ses_x", Title: "no ws"}
	g := SessionToGact(oc)
	if g.WorkspaceID != "ws_default" {
		t.Errorf("WorkspaceID = %q, want ws_default", g.WorkspaceID)
	}
}

func TestSessionToGact_OmitsEmptyMetadata(t *testing.T) {
	oc := OcSession{ID: "ses_x", Title: "minimal"}
	g := SessionToGact(oc)
	if g.Metadata != nil {
		t.Errorf("expected nil metadata, got %+v", g.Metadata)
	}
}

func TestSessionToGact_ParentRelationship(t *testing.T) {
	oc := OcSession{ID: "ses_child", ParentID: "ses_parent"}
	g := SessionToGact(oc)
	if g.ParentSessionID != "ses_parent" {
		t.Errorf("ParentSessionID = %q", g.ParentSessionID)
	}
}

func TestSessionsToGact_PreservesOrder(t *testing.T) {
	ocs := []OcSession{
		{ID: "a", Title: "A"},
		{ID: "b", Title: "B"},
		{ID: "c", Title: "C"},
	}
	gs := SessionsToGact(ocs)
	if len(gs) != 3 {
		t.Fatalf("count = %d", len(gs))
	}
	for i, want := range []string{"a", "b", "c"} {
		if gs[i].ID != want {
			t.Errorf("[%d] ID = %q, want %q", i, gs[i].ID, want)
		}
	}
}

func TestWorkspaceFromProject(t *testing.T) {
	p := OcProjectInfo{ID: "prj_abc", Name: "myapp", Worktree: "/repos/myapp"}
	w := WorkspaceFromProject(p)
	if w.ID != "ws_prj_abc" {
		t.Errorf("ID = %q", w.ID)
	}
	if w.Name != "myapp" {
		t.Errorf("Name = %q", w.Name)
	}
	if w.RootPath != "/repos/myapp" {
		t.Errorf("RootPath = %q", w.RootPath)
	}
	if w.Metadata["x_opencode_project_id"] != "prj_abc" {
		t.Errorf("metadata missing")
	}
}

func TestWorkspaceFromProject_DefaultsName(t *testing.T) {
	p := OcProjectInfo{ID: "prj_x", Worktree: "/path/to/lastdir"}
	w := WorkspaceFromProject(p)
	if w.Name != "lastdir" {
		t.Errorf("Name = %q (expected basename)", w.Name)
	}
}

func TestSanitizeID(t *testing.T) {
	cases := map[string]string{
		"abc123":     "abc123",
		"a_b-c":      "a_b-c",
		"with/slash": "withslash",
		"emoji🎉":     "emoji",
	}
	for in, want := range cases {
		if got := sanitizeID(in); got != want {
			t.Errorf("sanitizeID(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestMsToTimeZero(t *testing.T) {
	if !msToTime(0).IsZero() {
		t.Errorf("ms=0 should yield zero time")
	}
	if msToTime(-1).IsZero() == false {
		t.Errorf("negative ms should yield zero time")
	}
}
