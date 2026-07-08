package ui

// conversation_empty_states.go renders the no-session and empty-session conversation bodies.

import "charm.land/lipgloss/v2"

func (c *conversationComponent) renderNoSessionBody(t Theme) string {
	// Big, friendly empty state. Same pattern as a real onboarding.
	callout := lipgloss.NewStyle().
		Bold(true).Foreground(t.Primary).Padding(0, 2).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Render(c.app.localizer.t(msgConversationFirstPrompt, map[string]string{
			"key": lipgloss.NewStyle().Foreground(t.Bg).Background(t.Primary).Padding(0, 1).Render("Ctrl+N"),
		}))
	// KKKKK1: surface the per-session lifecycle keys here. The user
	// reported they didn't know rename/delete/archive existed — the help
	// overlay had them but the empty-state crib did not.
	hints := lipgloss.JoinVertical(lipgloss.Left,
		t.HintLabel.Render(c.app.localizer.t(msgConversationSidebarIntro, nil)),
		"  "+t.HintKey.Render("n")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationNew, nil))+
			"   "+t.HintKey.Render("e")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationRename, nil))+
			"   "+t.HintKey.Render("x")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationDelete, nil)),
		"  "+t.HintKey.Render("A")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationArchive, nil))+
			"   "+t.HintKey.Render("h")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationArchived, nil))+
			"   "+t.HintKey.Render("d")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationDetached, nil))+
			"   "+t.HintKey.Render("b")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationBusy, nil))+
			"   "+t.HintKey.Render("/")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationFilter, nil)),
		"  "+t.HintKey.Render("o")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationAttachFile, nil))+
			"   "+t.HintKey.Render("↑/↓")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationPick, nil)),
		"",
		t.HintLabel.Render(c.app.localizer.t(msgConversationOtherThings, nil)),
		"  "+t.HintKey.Render("Ctrl+S")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationPickModelAgent, nil)),
		"  "+t.HintKey.Render("/")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationCommandPalette, nil)+"  ·  ")+
			t.HintKey.Render("?")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationHelp, nil)),
		"  "+t.HintKey.Render("Ctrl+Z")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationDetachPrefix, nil)+" ")+
			t.HintKey.Render("gact attach <sid>")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationReattaches, nil)),
	)
	// When the user has detached sessions on this backend,
	// surface that on the empty-state callout so the resume path is
	// discoverable on a fresh TUI start.
	var resumeHint string
	if n := len(c.app.previouslyDetached); n > 0 {
		resumeHint = lipgloss.NewStyle().
			Bold(true).Foreground(t.Secondary).
			Render(c.app.localizer.tf(msgConversationDetachedSessions, map[string]any{"count": n})+" ") +
			t.HintKey.Render("gact attach") +
			t.HintLabel.Render(" "+c.app.localizer.t(msgConversationResumeMostRecent, nil))
	}
	if resumeHint != "" {
		return lipgloss.JoinVertical(lipgloss.Left, callout, "", resumeHint, "", hints)
	}
	return lipgloss.JoinVertical(lipgloss.Left, callout, "", hints)
}

func (c *conversationComponent) renderEmptySessionBody(t Theme) string {
	return lipgloss.JoinVertical(lipgloss.Left,
		t.HintLabel.Render(c.app.localizer.t(msgConversationNoMessages, nil)),
		"",
		"  "+t.HintKey.Render("@")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationAttachWorkspace, nil)+"  ·  ")+
			t.HintKey.Render("Ctrl+G")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationCompose, nil)),
		"  "+t.HintKey.Render("Ctrl+S")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationSettings, nil)+"  ·  ")+
			t.HintKey.Render("/theme")+t.HintLabel.Render(" "+c.app.localizer.t(msgConversationPickPalette, nil)),
	)
}
