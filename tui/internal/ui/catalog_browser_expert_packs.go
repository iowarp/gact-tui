package ui

// catalog_browser_expert_packs.go handles expert-pack activate/manage messages and their backend commands.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

type expertPackActivatedMsg struct {
	packID string
	state  gact.SessionExpertPackState
	err    error
}

type expertPackManagedMsg struct {
	packID string
	action string
	result map[string]any
	err    error
}

func loadExpertPackDetailCmd(c *client.Client, scope client.RuntimeScope, packID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		detail, err := c.GetExpertPack(ctx, packID, scope)
		if err != nil {
			return catalogBrowserLoadedMsg{kind: catalogKindExpertPackDetail, errText: err.Error(), expertPackID: packID}
		}
		items := expertPackDetailItems(detail)
		return catalogBrowserLoadedMsg{kind: catalogKindExpertPackDetail, items: items, expertPackID: packID}
	}
}

func (c *catalogComponent) handleExpertPackActivated(m expertPackActivatedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if m.err != nil {
		a.setHint("expert pack activation failed: " + m.err.Error())
		return a, scheduleHintExpire(a.transientHint)
	}
	a.setHint("activated expert pack " + m.packID)
	var cmds []tea.Cmd
	cmds = append(cmds, scheduleHintExpire(a.transientHint))
	if m.state.Session != nil {
		for i, s := range a.session.sessions {
			if s.ID == m.state.Session.ID {
				a.session.sessions[i] = *m.state.Session
				break
			}
		}
	}
	if c.open && c.current != nil && c.current.kind == catalogKindExpertPackDetail {
		cmds = append(cmds, loadExpertPackDetailCmd(a.c, a.session.runtimeScope(), m.packID))
	}
	return a, tea.Batch(cmds...)
}

func (c *catalogComponent) handleExpertPackManaged(m expertPackManagedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	if m.err != nil {
		if m.action == "install" && a.expertPackInstall.open {
			a.expertPackInstall.saving = false
			a.expertPackInstall.err = operatorFailureHint("expert pack", m.action, m.err)
			return a, nil
		}
		a.setHint(operatorFailureHint("expert pack", m.action, m.err))
		return a, scheduleHintExpire(a.transientHint)
	}
	if m.action == "install" && a.expertPackInstall.open {
		a.expertPackInstall.close()
	}
	label := expertPackManagedLabel(m)
	a.setHint("expert pack " + operatorActionVerb(m.action) + ": " + label)
	var cmd tea.Cmd
	if c.open && c.current != nil {
		switch c.current.kind {
		case catalogKindExpertPacks:
			cmd = loadCatalogBrowserCmd(a.c, catalogKindExpertPacks, a.session.runtimeScope())
		case catalogKindExpertPackDetail:
			cmd = loadExpertPackDetailCmd(a.c, a.session.runtimeScope(), m.packID)
		}
	}
	return a, tea.Batch(scheduleHintExpire(a.transientHint), cmd)
}

func expertPackManagedLabel(m expertPackManagedMsg) string {
	if label := strings.TrimSpace(m.packID); label != "" {
		return label
	}
	for _, key := range []string{"installed", "updated", "deleted", "pack"} {
		row, _ := m.result[key].(map[string]any)
		if label := valuefmt.FirstNonEmpty(
			valuefmt.StringValue(row["id"]),
			valuefmt.StringValue(row["pack_id"]),
			valuefmt.StringValue(row["source"]),
			valuefmt.StringValue(row["path"]),
			valuefmt.StringValue(row["url"]),
		); label != "" {
			return label
		}
	}
	return valuefmt.FirstNonEmpty(
		valuefmt.StringValue(m.result["id"]),
		valuefmt.StringValue(m.result["pack_id"]),
		valuefmt.StringValue(m.result["source"]),
		valuefmt.StringValue(m.result["path"]),
		valuefmt.StringValue(m.result["url"]),
		"source",
	)
}

func activateExpertPackCmd(c *client.Client, sessionID, packID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		state, err := c.SetSessionExpertPack(ctx, sessionID, gact.SetSessionExpertPackRequest{PackID: packID})
		return expertPackActivatedMsg{packID: packID, state: state, err: err}
	}
}

func updateExpertPackCmd(c *client.Client, scope client.RuntimeScope, packID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		result, err := c.UpdateExpertPack(ctx, packID, scope)
		return expertPackManagedMsg{packID: packID, action: "update", result: result, err: err}
	}
}

func deleteExpertPackCmd(c *client.Client, scope client.RuntimeScope, packID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		err := c.DeleteExpertPack(ctx, packID, scope)
		return expertPackManagedMsg{packID: packID, action: "delete", err: err}
	}
}
