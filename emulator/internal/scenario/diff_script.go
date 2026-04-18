package scenario

import (
	"context"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// runDiffScript demonstrates the file_diff part flow:
//   parent assistant turn proposes a code change as a file_diff part with
//   before/after content. The TUI renders the diff inline and lets the
//   user apply or reject via /v1/sessions/{id}/diffs/{apply,reject}.
//
// Triggered by "diff" / "edit" / "patch" in the user's message.
func runDiffScript(ctx context.Context, e *Engine, sessionID string, userMsg *gact.Message) {
	e.publishStatus(sessionID, gact.StatusRunning)

	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}

	// Brief intro text.
	intro, _ := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	if err := e.streamText(ctx, sessionID, asst.ID, intro.ID,
		"Here's the change. Press **a** to apply or **r** to reject from the conversation pane.",
		"text"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, intro.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	before := "package main\n\nfunc main() {\n\tprintln(\"hello\")\n}\n"
	after := "package main\n\nimport \"log\"\n\nfunc main() {\n\tlog.Println(\"hello, world\")\n}\n"
	_, err = e.addPart(sessionID, asst.ID, gact.NewFileDiffPart("main.go", &before, &after, "go"))
	if err != nil {
		return
	}
	e.completeMessage(sessionID, asst.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}
