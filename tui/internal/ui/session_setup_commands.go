package ui

// session_setup_commands.go loads session-setup options and creates sessions with selected semantics.

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func loadSessionSetupOptionsCmd(c *client.Client, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		blueprints, bpErr := c.ListAgentBlueprints(ctx, scope)
		packs, packErr := c.ListExpertPacks(ctx, scope)
		if bpErr != nil && packErr != nil {
			return sessionSetupLoadedMsg{err: fmt.Errorf("blueprints: %v; expert packs: %v", bpErr, packErr)}
		}
		if bpErr != nil {
			return sessionSetupLoadedMsg{packs: packs, err: fmt.Errorf("blueprints: %v", bpErr)}
		}
		if packErr != nil {
			return sessionSetupLoadedMsg{blueprints: blueprints, err: fmt.Errorf("expert packs: %v", packErr)}
		}
		return sessionSetupLoadedMsg{blueprints: blueprints, packs: packs}
	}
}

func createSessionWithSemanticsCmd(c *client.Client, wsID string, sel sessionSetupSelection) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		s, err := c.CreateSession(ctx, client.CreateSessionRequest{
			WorkspaceID: wsID,
			Title:       "new session " + time.Now().UTC().Format("15:04:05"),
			Agent:       &gact.AgentRef{ID: "default"},
		})
		if err != nil {
			return errMsg{err: err, stage: "create-session"}
		}
		var bindErrs []string
		if sel.BlueprintID != "" {
			state, err := c.SetSessionAgentBlueprint(ctx, s.ID, gact.SetSessionAgentBlueprintRequest{
				BlueprintID: sel.BlueprintID,
			})
			if err != nil {
				bindErrs = append(bindErrs, "blueprint: "+err.Error())
			} else {
				mergeAgentBlueprintStateIntoSession(&s, state)
			}
		}
		if sel.PackID != "" {
			state, err := c.SetSessionExpertPack(ctx, s.ID, gact.SetSessionExpertPackRequest{
				PackID: sel.PackID,
			})
			if err != nil {
				bindErrs = append(bindErrs, "expert pack: "+err.Error())
			} else {
				mergeExpertPackStateIntoSession(&s, state)
			}
		}
		return sessionCreatedMsg{session: s, semanticWarning: strings.Join(bindErrs, "; ")}
	}
}

func mergeAgentBlueprintStateIntoSession(s *gact.Session, state gact.SessionAgentBlueprintState) {
	if state.Session != nil {
		*s = *state.Session
		return
	}
	if s.Metadata == nil {
		s.Metadata = map[string]any{}
	}
	if state.ActiveAgentBlueprintID != "" {
		s.Metadata["active_agent_blueprint_id"] = state.ActiveAgentBlueprintID
		s.Metadata["agent_blueprint_id"] = state.ActiveAgentBlueprintID
	}
	if state.ActiveAgentBlueprintPath != "" {
		s.Metadata["active_agent_blueprint_path"] = state.ActiveAgentBlueprintPath
	}
	if state.WorkspaceID != "" {
		s.Metadata["active_agent_blueprint_workspace_id"] = state.WorkspaceID
	}
	if state.ActiveAgentBlueprintID != "" {
		s.Metadata["active_agent_blueprint_scope"] = "session"
	}
}

func mergeExpertPackStateIntoSession(s *gact.Session, state gact.SessionExpertPackState) {
	if state.Session != nil {
		*s = *state.Session
		return
	}
	if s.Metadata == nil {
		s.Metadata = map[string]any{}
	}
	if state.ActiveExpertPackID != "" {
		s.Metadata["active_expert_pack_id"] = state.ActiveExpertPackID
		s.Metadata["expert_pack_id"] = state.ActiveExpertPackID
	}
	if state.ActiveExpertPackPath != "" {
		s.Metadata["active_expert_pack_path"] = state.ActiveExpertPackPath
	}
}
