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
//
// SSSSS1: cycle through subagentVariants per session via NextCallIndex
// — closes the variant-cycle work so all five rich scenario families
// (default, big tool, long, multi tool, diff, subagent) produce
// per-turn variety. Different agent identities (code_reviewer,
// security_auditor, perf_profiler) make repeated "spawn a subagent"
// turns feel like distinct delegations.
func runSubagentScript(ctx context.Context, e *Engine, sessionID string, userMsg *gact.Message) {
	idx := e.NextCallIndex(sessionID, "subagent")
	v := subagentVariants[idx%len(subagentVariants)]

	e.publishStatus(sessionID, gact.StatusRunning)

	// Parent assistant: thinking + intro text + subagent_call.
	parent, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}

	thinking, _ := e.addPart(sessionID, parent.ID, gact.NewThinkingPart(""))
	if err := e.streamText(ctx, sessionID, parent.ID, thinking.ID,
		v.thinking, "thinking"); err != nil {
		return
	}
	e.completePart(sessionID, parent.ID, thinking.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	intro, _ := e.addPart(sessionID, parent.ID, gact.NewTextPart(""))
	if err := e.streamText(ctx, sessionID, parent.ID, intro.ID, v.intro, "text"); err != nil {
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
		Title:              v.agentID,
		Agent:              gact.AgentRef{ID: v.agentID},
	})
	if err != nil {
		return
	}

	// subagent_call part on the parent message references the new subsession.
	subCallPart, _ := e.addPart(sessionID, parent.ID, gact.Part{
		Type:         gact.PartTypeSubagentCall,
		SubsessionID: sub.ID,
		AgentID:      v.agentID,
		Prompt:       v.prompt,
	})

	e.bus.Publish(events.Event{
		Type:        "subagent.started",
		WorkspaceID: parentSess.WorkspaceID,
		SessionID:   sessionID,
		Payload: map[string]any{
			"subsession_id":     sub.ID,
			"parent_session_id": sessionID,
			"agent_id":          v.agentID,
			"part_id":           subCallPart.ID,
		},
	})

	// --- Subagent's own conversation -------------------------------------
	// User-style synthetic prompt (visible in subsession).
	subUser, _ := e.store.AppendMessage(gact.Message{
		SessionID: sub.ID,
		Role:      gact.RoleUser,
		Parts:     []gact.Part{gact.NewTextPart(v.prompt)},
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
	if err := e.streamText(ctx, sub.ID, subAsst.ID, subText.ID, v.subBody, "text"); err != nil {
		return
	}
	e.completePart(sub.ID, subAsst.ID, subText.ID)
	e.completeMessage(sub.ID, subAsst.ID, gact.StopReasonEndTurn)

	// subagent_result on parent + subagent.completed event.
	_, _ = e.addPart(sessionID, parent.ID, gact.Part{
		Type:           gact.PartTypeSubagentResult,
		SubsessionID:   sub.ID,
		Summary:        v.summary,
		FinalMessageID: subAsst.ID,
	})
	e.bus.Publish(events.Event{
		Type:        "subagent.completed",
		WorkspaceID: parentSess.WorkspaceID,
		SessionID:   sessionID,
		Payload: map[string]any{
			"subsession_id":    sub.ID,
			"summary":          v.summary,
			"final_message_id": subAsst.ID,
		},
	})

	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	// Parent's final follow-up.
	final, _ := e.createAssistantMessage(sessionID)
	finalP, _ := e.addPart(sessionID, final.ID, gact.NewTextPart(""))
	if err := e.streamText(ctx, sessionID, final.ID, finalP.ID, v.followup, "text"); err != nil {
		return
	}
	e.completePart(sessionID, final.ID, finalP.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

// subagentVariants is the rotating cast of subagent delegations
// runSubagentScript picks from. Three different agent identities
// (code_reviewer / security_auditor / perf_profiler) so repeated
// 'spawn a subagent' turns feel like distinct delegations rather
// than the same review fired with different ids.
var subagentVariants = []struct {
	thinking string
	intro    string
	agentID  string
	prompt   string
	subBody  string
	summary  string
	followup string
}{
	{
		thinking: "This benefits from a focused sub-agent — I'll spawn one to handle the analysis in parallel.\n",
		intro:    "I'll delegate the deep-dive to a **code_reviewer** sub-agent, then synthesize.",
		agentID:  "code_reviewer",
		prompt:   "Review the changes and call out anything that looks risky.",
		subBody:  "Reviewed. Two concerns:\n\n- `main()` ignores errors from the listener\n- the temp dir cleanup races on shutdown\n\nNon-blocking; recommend follow-up tickets.",
		summary:  "Two non-blocking concerns: error handling in main() + cleanup race.",
		followup: "Review came back clean overall — two issues filed as follow-ups, nothing blocking. Want me to draft fixes for either?",
	},
	{
		thinking: "Security review is its own discipline; I'll spawn the auditor agent rather than improvise.\n",
		intro:    "Routing this through the **security_auditor** sub-agent — they have the threat-model context.",
		agentID:  "security_auditor",
		prompt:   "Audit the new auth middleware for token-handling gotchas. Flag anything OWASP-tier.",
		subBody:  "Audited the middleware. Three findings:\n\n- **HIGH**: JWT signing key read from env at request time — race window if the secret rotates mid-request.\n- **MEDIUM**: refresh-token cookie missing `SameSite=Strict`.\n- **LOW**: error responses leak the raw exception class in the body.\n\nThe HIGH is a 1-line fix (load the key once at startup). MEDIUM + LOW are config tweaks.",
		summary:  "1 HIGH (signing key race), 1 MEDIUM (cookie SameSite), 1 LOW (error leak).",
		followup: "Audit landed: one HIGH worth fixing now (load the JWT key at startup, not per-request) plus two smaller config tweaks. Want me to open the HIGH as a hotfix PR?",
	},
	{
		thinking: "Profiling is best done with a focused tool-using agent; I'll spawn the perf_profiler.\n",
		intro:    "Spawning **perf_profiler** to walk the hot paths and bring back a numbers-first summary.",
		agentID:  "perf_profiler",
		prompt:   "Profile the request handler under a 200rps load. Top 3 hot spots, attribution.",
		subBody:  "Profiled at 200rps for 60s. Top 3 by self-time:\n\n1. `json.Unmarshal` in middleware/auth.go (38% of CPU). Re-parses the JWT body on every request — cache the parsed claims.\n2. `regexp.MustCompile` in handler/route.go (17%). Compiled inline per request — hoist to package init.\n3. `sql.QueryContext` in db/users.go (11%). Single connection per request, no pooling — set `db.SetMaxOpenConns`.\n\np50 latency drops from 28ms → ~9ms if all three land.",
		summary:  "Top 3 hot spots: per-request JWT reparse (38%), regex compile (17%), no DB pool (11%).",
		followup: "Profiler came back with three high-leverage wins. The JWT reparse is the easiest — happy to draft that change first if you want?",
	},
}
