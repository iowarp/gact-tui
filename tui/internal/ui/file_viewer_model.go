package ui

// file_viewer_model.go manages the file-viewer root/workspace sync, reload, and refresh ticking.

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

const fileViewerRefreshInterval = 2 * time.Second

type fileViewerRefreshTickMsg struct{}

func fileViewerRefreshCmd() tea.Cmd {
	return scheduleTick(fileViewerRefreshInterval, func() tea.Msg {
		return fileViewerRefreshTickMsg{}
	})
}

func (c *fileViewerComponent) handleRefreshTick(m fileViewerRefreshTickMsg) (tea.Model, tea.Cmd) {
	if c.app.stage != StageReady {
		c.fileTreeRefresh = false
		return c.app, nil
	}
	c.refreshFromWorkspace()
	return c.app, fileViewerRefreshCmd()
}

func (c *fileViewerComponent) initFromCwd() {
	cwd, err := os.Getwd()
	if err != nil {
		c.fileViewerRoot = "."
		c.fileTreeRootMode = "cwd"
		c.fileTreeErr = err.Error()
		c.fileTreeExpanded = map[string]bool{}
		return
	}
	c.setRoot(cwd)
	c.fileTreeRootMode = "cwd"
}

func (c *fileViewerComponent) setRoot(root string) {
	root = strings.TrimSpace(root)
	if root == "" {
		root = "."
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		abs = root
	}
	if c.fileViewerRoot == abs && len(c.fileTreeEntries) > 0 {
		return
	}
	c.fileViewerRoot = abs
	c.fileTreeExpanded = map[string]bool{}
	c.fileTreeSel = 0
	c.reload()
}

func (c *fileViewerComponent) syncRootToWorkspace() {
	root := strings.TrimSpace(c.workspaceRootPath())
	if root == "" {
		if c.fileViewerRoot == "" {
			c.initFromCwd()
		}
		c.fileTreeRootMode = "cwd"
		return
	}
	c.setRoot(root)
	c.fileTreeRootMode = "workspace"
}

func (c *fileViewerComponent) workspaceRootPath() string {
	for _, ws := range c.app.session.workspaces {
		if ws.ID == c.app.session.wsID {
			return workspaceFileRootPath(ws)
		}
	}
	return ""
}

func workspaceFileRootPath(ws gact.Workspace) string {
	root := strings.TrimSpace(ws.RootPath)
	name := strings.TrimSpace(ws.Name)
	if workspaceNamePathShouldOverrideRoot(name, root) {
		return name
	}
	return root
}

func workspaceNamePathShouldOverrideRoot(name, root string) bool {
	if name == "" || !filepath.IsAbs(name) {
		return false
	}
	name = filepath.Clean(name)
	root = filepath.Clean(strings.TrimSpace(root))
	if root != "" && root == name {
		return false
	}
	if info, err := os.Stat(name); err != nil || !info.IsDir() {
		return false
	}
	if root == "." || root == "" {
		return true
	}
	tmp := filepath.Clean(os.TempDir())
	if root == tmp || !strings.HasPrefix(root, tmp+string(filepath.Separator)) {
		return false
	}
	return strings.HasPrefix(filepath.Base(root), "grind-")
}

func (c *fileViewerComponent) reload() {
	selectedPath := c.selectedPath()
	entries, err := scanFileTreeExpanded(c.fileViewerRoot, "", 0, c.fileTreeExpanded)
	c.fileTreeEntries = entries
	c.fileTreeErr = ""
	c.fileTreeUpdated = time.Now()
	if err != nil {
		c.fileTreeErr = err.Error()
	}
	c.restoreSelection(selectedPath)
	c.clampSelection()
}

func (c *fileViewerComponent) refreshFromWorkspace() {
	root := strings.TrimSpace(c.workspaceRootPath())
	if root == "" {
		if c.fileTreeRootMode == "workspace" && c.fileViewerRoot != "" {
			c.reload()
		}
		return
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		abs = root
	}
	if c.fileViewerRoot != abs {
		c.setRoot(root)
		c.fileTreeRootMode = "workspace"
		return
	}
	c.reload()
	c.fileTreeRootMode = "workspace"
}

func (c *fileViewerComponent) activateSelection() {
	if strings.TrimSpace(c.fileTreeErr) != "" {
		c.openRootDetail()
		return
	}
	visible := c.visibleEntries()
	if len(visible) == 0 {
		return
	}
	c.fileTreeSel = clampSelection(c.fileTreeSel, len(visible))
	entry := visible[c.fileTreeSel]
	if entry.Dir {
		if !c.fileTreeExpanded[entry.Path] {
			c.loadChildren(entry)
		}
		c.fileTreeExpanded[entry.Path] = !c.fileTreeExpanded[entry.Path]
		return
	}
	c.openDetail(entry)
}
