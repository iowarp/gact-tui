package ui

// workspace_create_git.go derives git-clone name/root fields for the workspace create modal.

import (
	"os"
	"path/filepath"
	"strings"
)

func (w *workspaceModal) maybeDeriveGitFields(previousName, previousRoot string) {
	if w.create.mode != "git" {
		return
	}
	repo := gitRepoFolderName(w.create.gitURL)
	if repo == "" {
		return
	}
	base := w.defaultGitCloneBase()
	if base == "" {
		base = "."
	}
	root := filepath.Join(base, repo)
	currentRoot := strings.TrimSpace(w.create.root)
	defaultRoot := strings.TrimSpace(w.defaultCreateRoot())
	previousRoot = strings.TrimSpace(previousRoot)
	if currentRoot == "" || currentRoot == defaultRoot || (previousRoot != "" && currentRoot == previousRoot) {
		w.create.root = root
		w.create.rootCur = len([]rune(root))
	}
	currentName := strings.TrimSpace(w.create.name)
	previousName = strings.TrimSpace(previousName)
	if currentName == "" || (previousName != "" && currentName == previousName) {
		w.create.name = repo
		w.create.nameCur = len([]rune(repo))
	}
}

func (w *workspaceModal) currentDerivedGitFields() (string, string) {
	repo := gitRepoFolderName(w.create.gitURL)
	if repo == "" {
		return "", ""
	}
	base := w.defaultGitCloneBase()
	if base == "" {
		base = "."
	}
	return repo, filepath.Join(base, repo)
}

func (w *workspaceModal) defaultGitCloneBase() string {
	if root := strings.TrimSpace(w.app.fileViewer.workspaceRootPath()); root != "" {
		if parent := filepath.Dir(root); parent != "." && parent != root {
			return parent
		}
	}
	if wd, err := os.Getwd(); err == nil && wd != "" {
		return wd
	}
	return ""
}

func gitRepoFolderName(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	rawURL = strings.TrimSuffix(rawURL, "/")
	rawURL = strings.TrimSuffix(rawURL, ".git")
	if rawURL == "" {
		return ""
	}
	parts := strings.FieldsFunc(rawURL, func(r rune) bool {
		return r == '/' || r == ':'
	})
	if len(parts) == 0 {
		return ""
	}
	return strings.TrimSpace(parts[len(parts)-1])
}
