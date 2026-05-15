package scenario

import (
	"context"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// runDiffScript demonstrates the file_diff part flow:
//
//	parent assistant turn proposes a code change as a file_diff part with
//	before/after content. The TUI renders the diff inline and lets the
//	user apply or reject via /v1/sessions/{id}/diffs/{apply,reject}.
//
// Triggered by "diff" / "edit" / "patch" in the user's message.
//
// RRRRR1: cycle through diffVariants per session via NextCallIndex
// so repeated "propose an edit" turns produce different proposed
// changes (Go logging swap, Python try/except, JS async refactor).
// Pairs with FFFFF1's cursor-aware Ctrl+E so users can address each
// pending diff individually.
func runDiffScript(ctx context.Context, e *Engine, sessionID string, userMsg *gact.Message) {
	idx := e.NextCallIndex(sessionID, "diff")
	v := diffVariants[idx%len(diffVariants)]

	e.publishStatus(sessionID, gact.StatusRunning)

	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}

	// Brief intro text.
	intro, _ := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	if err := e.streamText(ctx, sessionID, asst.ID, intro.ID, v.intro, "text"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, intro.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	before, after := v.before, v.after
	_, err = e.addPart(sessionID, asst.ID,
		gact.NewFileDiffPart(v.path, &before, &after, v.lang))
	if err != nil {
		return
	}
	e.completeMessage(sessionID, asst.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

// diffVariants is the cycling cast of file_diff proposals. Each
// variant points at a different file/language so the rendered diff
// also exercises the syntax-hint path through different lexers.
var diffVariants = []struct {
	intro  string
	path   string
	lang   string
	before string
	after  string
}{
	{
		intro:  "Here's the change. Press **a** to apply or **r** to reject from the conversation pane.",
		path:   "main.go",
		lang:   "go",
		before: "package main\n\nfunc main() {\n\tprintln(\"hello\")\n}\n",
		after:  "package main\n\nimport \"log\"\n\nfunc main() {\n\tlog.Println(\"hello, world\")\n}\n",
	},
	{
		intro:  "Wrap the network call in a try/except so a transient DNS blip doesn't kill the worker. **a**=apply, **r**=reject.",
		path:   "worker/fetch.py",
		lang:   "python",
		before: "import requests\n\n\ndef fetch_user(uid: str) -> dict:\n    r = requests.get(f\"https://api.example.com/users/{uid}\", timeout=5)\n    return r.json()\n",
		after:  "import logging\nimport requests\n\nlog = logging.getLogger(__name__)\n\n\ndef fetch_user(uid: str) -> dict:\n    try:\n        r = requests.get(f\"https://api.example.com/users/{uid}\", timeout=5)\n        r.raise_for_status()\n        return r.json()\n    except requests.RequestException as exc:\n        log.warning(\"fetch_user(%s) failed: %s\", uid, exc)\n        return {}\n",
	},
	{
		intro:  "Swap the callback chain for async/await — same semantics, an order of magnitude less indentation. **a**=apply, **r**=reject.",
		path:   "src/loader.js",
		lang:   "javascript",
		before: "function loadUser(id, cb) {\n  db.get('users', id, function (err, row) {\n    if (err) return cb(err);\n    cache.set(id, row, function (err2) {\n      if (err2) return cb(err2);\n      cb(null, row);\n    });\n  });\n}\n",
		after:  "async function loadUser(id) {\n  const row = await db.get('users', id);\n  await cache.set(id, row);\n  return row;\n}\n",
	},
}
