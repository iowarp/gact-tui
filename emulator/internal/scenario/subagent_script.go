package scenario

import (
	"context"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// runSubagentScript demonstrates the multi-agent flow:
//  1. Parent assistant message: thinking + intro text + subagent_call part
//  2. subagent.started event with the new subsession_id
//  3. Subsession created (parent_session_id = sessionID); subagent posts
//     its own user-style internal messages and produces a result.
//  4. subagent.completed event; parent gets a subagent_result part.
//  5. Parent assistant follow-up wrapping things up; finish.
//
// The subagent's messages live on the subsession, accessible via
// /v1/sessions/{subsession_id}/messages — TUIs render them as a nested
// thread under the parent's subagent_call part.
func runSubagentScript(ctx context.Context, e *Engine, sessionID string, userMsg *gact.Message) {
	e.publishStatus(sessionID, gact.StatusRunning)

	// Parent assistant: thinking + intro text + subagent_call.
	parent, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}

	thinking, _ := e.addPart(sessionID, parent.ID, gact.NewThinkingPart(""))
	if err := e.streamText(ctx, sessionID, parent.ID, thinking.ID,
		"This benefits from a focused sub-agent — I'll spawn one to handle the analysis in parallel.\n",
		"thinking"); err != nil {
		return
	}
	e.completePart(sessionID, parent.ID, thinking.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	intro, _ := e.addPart(sessionID, parent.ID, gact.NewTextPart(""))
	introText := "I'll delegate the deep-dive to a **code_reviewer** sub-agent, then synthesize."
	if err := e.streamText(ctx, sessionID, parent.ID, intro.ID, introText, "text"); err != nil {
		return
	}
	e.completePart(sessionID, parent.ID, intro.ID)

	// Spawn the subsession.
	parentSess, err := e.store.GetSession(sessionID)
	if err != nil {
		return
	}
	sub, err := e.store.CreateSession(gact.Session{
		WorkspaceID:        parentSess.WorkspaceID,
		ParentSessionID:    sessionID,
		SpawnedByMessageID: parent.ID,
		Title:              "code_reviewer",
		Agent:              gact.AgentRef{ID: "code_reviewer"},
	})
	if err != nil {
		return
	}

	// subagent_call part on the parent message references the new subsession.
	subCallPart, _ := e.addPart(sessionID, parent.ID, gact.Part{
		Type:         gact.PartTypeSubagentCall,
		SubsessionID: sub.ID,
		AgentID:      "code_reviewer",
		Prompt:       "Review the changes and call out anything that looks risky.",
	})

	e.bus.Publish(events.Event{
		Type:        "subagent.started",
		WorkspaceID: parentSess.WorkspaceID,
		SessionID:   sessionID,
		Payload: map[string]any{
			"subsession_id":    sub.ID,
			"parent_session_id": sessionID,
			"agent_id":         "code_reviewer",
			"part_id":          subCallPart.ID,
		},
	})

	// --- Subagent's own conversation -------------------------------------
	// User-style synthetic prompt (visible in subsession).
	subUser, _ := e.store.AppendMessage(gact.Message{
		SessionID: sub.ID,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart("Review the changes and call out anything risky.")},
	})
	e.bus.Publish(events.Event{
		Type:      "message.created",
		SessionID: sub.ID,
		Payload:   subUser,
	})

	subAsst, _ := e.store.AppendMessage(gact.Message{
		SessionID: sub.ID,
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{},
	})
	e.bus.Publish(events.Event{
		Type:      "message.created",
		SessionID: sub.ID,
		Payload:   subAsst,
	})
	subText, _ := e.addPart(sub.ID, subAsst.ID, gact.NewTextPart(""))
	subBody := "Reviewed. Two concerns:\n\n- `main()` ignores errors from the listener\n- the temp dir cleanup races on shutdown\n\nNon-blocking; recommend follow-up tickets."
	if err := e.streamText(ctx, sub.ID, subAsst.ID, subText.ID, subBody, "text"); err != nil {
		return
	}
	e.completePart(sub.ID, subAsst.ID, subText.ID)
	e.completeMessage(sub.ID, subAsst.ID, gact.StopReasonEndTurn)

	// subagent_result on parent + subagent.completed event.
	_, _ = e.addPart(sessionID, parent.ID, gact.Part{
		Type:           gact.PartTypeSubagentResult,
		SubsessionID:   sub.ID,
		Summary:        "Two non-blocking concerns: error handling in main() + cleanup race.",
		FinalMessageID: subAsst.ID,
	})
	e.bus.Publish(events.Event{
		Type:        "subagent.completed",
		WorkspaceID: parentSess.WorkspaceID,
		SessionID:   sessionID,
		Payload: map[string]any{
			"subsession_id":   sub.ID,
			"summary":         "Two non-blocking concerns: error handling in main() + cleanup race.",
			"final_message_id": subAsst.ID,
		},
	})

	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	// Parent's final follow-up.
	final, _ := e.createAssistantMessage(sessionID)
	finalP, _ := e.addPart(sessionID, final.ID, gact.NewTextPart(""))
	finalText := "Review came back clean overall — two issues filed as follow-ups, nothing blocking. Want me to draft fixes for either?"
	if err := e.streamText(ctx, sessionID, final.ID, finalP.ID, finalText, "text"); err != nil {
		return
	}
	e.completePart(sessionID, final.ID, finalP.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}
