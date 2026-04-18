package server

import (
	"sync"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// contextFileSet is the in-memory store of session-scoped context-file lists.
// Lives on Server (not in store/) because it's a thin emulator-only feature
// that doesn't need durable typing or shared invariants.
func newContextFileSet() *contextFileSet {
	return &contextFileSet{files: make(map[string][]gact.ContextFile)}
}

func (c *contextFileSet) get(sessionID string) []gact.ContextFile {
	cm.RLock()
	defer cm.RUnlock()
	out := make([]gact.ContextFile, len(c.files[sessionID]))
	copy(out, c.files[sessionID])
	return out
}

func (c *contextFileSet) add(sessionID string, cf gact.ContextFile) {
	cm.Lock()
	defer cm.Unlock()
	for _, existing := range c.files[sessionID] {
		if existing.Path == cf.Path {
			return // dedupe
		}
	}
	c.files[sessionID] = append(c.files[sessionID], cf)
}

func (c *contextFileSet) remove(sessionID, path string) bool {
	cm.Lock()
	defer cm.Unlock()
	files := c.files[sessionID]
	for i, f := range files {
		if f.Path == path {
			c.files[sessionID] = append(files[:i], files[i+1:]...)
			return true
		}
	}
	return false
}

func (c *contextFileSet) update(sessionID, path, mode string) (gact.ContextFile, bool) {
	cm.Lock()
	defer cm.Unlock()
	files := c.files[sessionID]
	for i, f := range files {
		if f.Path == path {
			if mode != "" {
				files[i].Mode = mode
			}
			return files[i], true
		}
	}
	return gact.ContextFile{}, false
}

// cm is a single shared mutex for the contextFileSet because it's tiny and
// rarely contended.
var cm sync.RWMutex
