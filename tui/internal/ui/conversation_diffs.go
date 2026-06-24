package ui

// conversation_diffs.go handles pending-diff apply/reject commands, their messages, and handlers.

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type diffsAppliedMsg struct {
	paths       []string
	writeErrors map[string]string
}

type diffsRejectedMsg struct {
	paths []string
}

// hasPendingDiffs returns true if any file_diff part in the loaded messages
// is not yet applied. Used to gate the a/r body keys.
func (c *conversationComponent) hasPendingDiffs() bool {
	for _, m := range c.messages {
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeFileDiff && !p.Applied {
				return true
			}
		}
	}
	return false
}

func applyDiffsCmd(c *client.Client, sessionID string, paths ...string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		applied, writeErrors, err := c.ApplyDiffs(ctx, sessionID, paths)
		if err != nil {
			return errMsg{err: err, stage: "apply-diffs"}
		}
		return diffsAppliedMsg{paths: applied, writeErrors: writeErrors}
	}
}

func rejectDiffsCmd(c *client.Client, sessionID string, paths ...string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		rejected, err := c.RejectDiffs(ctx, sessionID, paths)
		if err != nil {
			return errMsg{err: err, stage: "reject-diffs"}
		}
		return diffsRejectedMsg{paths: rejected}
	}
}

func (c *conversationComponent) handleDiffsApplied(m diffsAppliedMsg) (tea.Model, tea.Cmd) {
	// Mark matching parts as applied locally. Server is source of truth
	// but optimistic update keeps the UI snappy.
	applied := make(map[string]bool, len(m.paths))
	for _, p := range m.paths {
		applied[p] = true
	}
	for i := range c.messages {
		for j := range c.messages[i].Parts {
			p := &c.messages[i].Parts[j]
			if p.Type == gact.PartTypeFileDiff && applied[p.Path] {
				p.Applied = true
			}
		}
	}
	c.invalidateRenderCache()
	// Surface write_errors as a transient hint. Was previously dropped
	// silently: the backend may record a write_error, such as a workspace
	// scope refusal, even though the request itself succeeds.
	if len(m.writeErrors) > 0 {
		parts := make([]string, 0, len(m.writeErrors))
		for path, err := range m.writeErrors {
			parts = append(parts, fmt.Sprintf("%s: %s", path, err))
		}
		c.app.setHint("⚠ apply failed — " + strings.Join(parts, " · "))
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	if len(m.paths) > 0 {
		c.app.setHint(fmt.Sprintf("applied %d file%s", len(m.paths), plural(len(m.paths))))
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	return c.app, nil
}

func (c *conversationComponent) handleDiffsRejected(m diffsRejectedMsg) (tea.Model, tea.Cmd) {
	rejected := make(map[string]bool, len(m.paths))
	for _, p := range m.paths {
		rejected[p] = true
	}
	for i := range c.messages {
		for j := range c.messages[i].Parts {
			p := &c.messages[i].Parts[j]
			if p.Type == gact.PartTypeFileDiff && rejected[p.Path] {
				if p.Metadata == nil {
					p.Metadata = map[string]any{}
				}
				p.Metadata["rejected"] = true
			}
		}
	}
	c.invalidateRenderCache()
	return c.app, nil
}
