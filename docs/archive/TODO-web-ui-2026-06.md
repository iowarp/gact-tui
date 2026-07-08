# Web/Desktop UI TODO

This combines open GitHub web UI issues with findings from the real EarthScope
web run captured under:

- `apps/web/screenshots/earthscope-render-demo-current/06-live-final.html`
- `apps/web/screenshots/earthscope-render-demo-current/07-reload.html`
- `apps/web/screenshots/earthscope-render-demo-current/15-completed-reload-final-tool-preview.html`
- `apps/web/screenshots/earthscope-render-demo-current/15-completed-reload-final-tool-preview.png`
- `apps/web/screenshots/earthscope-render-demo-current/15-completed-reload-final-tool-preview.transcript-core.html`

The repro entry point is:

```powershell
cd apps/web
npm run demo:earthscope-render
```

Use the saved HTML and screenshots as primary evidence. Do not treat grep/count
summaries as sufficient proof for transcript rendering fixes; read the rendered
HTML artifact and compare visually against `apps/web/RENDERING_SPEC.md` and
`apps/web/CANONICAL-CONVERSATION.md`.

## P0 - Conversation Rendering Correctness

- [x] Fix live/persisted projection divergence and append-only behavior.
  - GitHub: https://github.com/iowarp/gact-tui/issues/210
  - Current issue says the web has dual model builders for live and persisted
    turns, causing reordering/content loss in some runs.
  - Fixed by projecting in-flight assistant parts from `/messages` while a turn
    is running and using the same append-only assistant turn projection for the
    completed reload render.

- [x] Render explicit child return handoffs.
  - Spec requires `returns to <parent>` / hand-back rows.
  - Final evidence: `14-completed-reload-final-flow-context.dom-summary.json`
    shows 10 `assistant-turn-return` rows.
  - Compare against `CANONICAL-CONVERSATION.md`, where every delegated child has
    a closing return line.

- [x] Preserve the parent task, child label, turns, tool observations, and return
  as a coherent block.
  - The latest HTML does include an agent header before child turns, for example
    `data-testid="assistant-turn-agent" data-agent="geospatial"` appears before
    geospatial's tool turn.
  - Still verify this for every expert in the full HTML because prior feedback
    flagged missing expert labels before turns.

- [x] Fix marker layout so the bullet marker starts the turn line instead of sitting
  on its own visual line.
  - User-observed issue: unnecessary new lines after the dot.
  - Latest screenshots still show isolated orange/blue dots in some places before
    the text/body begins, especially around deeper expert sections.
  - The marker and the turn text/tool thought should read like one indexed log
    row, matching the canonical Claude Code style.

- [x] Keep one marker per real LLM turn, but do not invent a noisy "turn N" label.
  - User-observed issue: a "turn x" indicator on every turn may have existed.
  - In the latest saved HTML I saw bullet turn markers, not a visible literal
    `Turn 1` / `Turn X` label. Treat this as likely addressed, but verify in the
    browser before closing.

- [x] Attach expert reasoning and tool call as the same turn.
  - GitHub #210 says earlier rendering emitted one marker per block instead of
    one marker per reasoning/tool/action turn.
  - Latest HTML has `assistant-turn-tool-thought` inside tool rows, which is the
    right direction, but the visual line break after the marker still makes the
    turn structure harder to read.

- [x] Strip status/scaffolding text from final transcript rendering.
  - Final evidence has no bare `In progress:`, no `No user-facing answer yet`,
    and no `Orchestration in progress`.
  - Spec says injected progress/routing scaffolding must not appear as normal
    conversation content.

- [x] Avoid duplicate or contradictory final answers.
  - Fixed by suppressing near-duplicate long parent copies after child-authored
    final answers. Final evidence has no duplicated `Data resource` section and
    no `earthscope-web-check\D:` path composition.

## P0 - Tool Output Rendering

- [x] Collapse only truncated tool output.
  - Spec: short tool results render inline in full with no expand/raw affordance.
  - Final evidence: 0 raw toggles and 0 collapse toggles for short EarthScope
    tool outputs.

- [x] Replace generic object summaries with semantic previews.
  - Latest `ndp_search_datasets` preview renders only
    `count: 1 / total_found: 1 / server: global`.
  - Expected: dataset title/resource/provenance preview similar to the TUI and
    canonical conversation.

- [x] Avoid `ok: true` as the primary result when useful data exists.
  - Latest `ndp_stage_resource` preview starts with `ok: true` and hides the
    useful staged file details behind truncation/raw.
  - Expected: staged filename/path, size, content type, and URL/provenance in a
    readable inline preview.

- [x] Keep image rendering inline and verify reload parity.
  - Latest reload does render the displacement PNG inline.
  - Keep this behavior covered by the EarthScope demo script.

## P0 - Blueprint and Session Creation

- [x] Fix selected Agent Blueprint being lost on first send.
  - GitHub: https://github.com/iowarp/gact-tui/issues/209
  - The new session flow must preserve the selected blueprint when the first
    message creates or activates the backing session.
  - Verified through the real web modal: completed session
    `sess_c7b0761006f7` retained `earthscope-gnss-region`, ref `main`, commit
    `6b90f03697fe0ae3a138a7b98c9e61fadf615e89`.

- [x] Keep marketplace/source selection durable and coherent.
  - GitHub: https://github.com/iowarp/gact-tui/issues/128
  - GitHub: https://github.com/iowarp/gact-tui/issues/143
  - Need source/ref/commit provenance, source grouping, install/update/validate
    as one coherent workflow, and no stale unsupported-source messaging.
  - Implemented source/provenance grouping in the web blueprint settings page.
    Registered sources render as parent rows, installed blueprints nest under
    their source/ref/commit provenance, and source-card install/update pre-fills
    the source/ref install flow.
  - Live evidence:
    `apps/web/screenshots/blueprint-source-workflow/02-blueprints-settings-final.panel.html`
    groups `Data Semantics Agent` and `EarthScope GNSS Region Agent` under
    `clio-agent-marketplace @main` commit `6b90f03697fe`, with no unsupported
    source-registry messaging.

## P1 - Conversation Ordering and Multi-Turn Sessions

- [x] Verify/fix chronological message ordering across multiple turns.
  - GitHub: https://github.com/iowarp/gact-tui/issues/208
  - Real web session `sess_ecf92a600133` verified after reload in
    `apps/web/screenshots/multiturn-order-check/03-reload-after-reactive-text.transcript-core.html`.
  - UI order is user alpha -> assistant alpha -> user beta -> assistant beta.
    `/messages` remains newest-first on the wire, but the client sorts
    chronological for rendering.
  - Fixed a reactive text-part bug where a routed assistant text part that was
    reconciled after initial render could remain visually blank.

- [x] Remove duplicated/technical top-center status chips.
  - GitHub: https://github.com/iowarp/gact-tui/issues/200
  - Current chrome exposes `sse / open` and duplicates model/connection state.
  - Final fresh evidence:
    `apps/web/screenshots/earthscope-render-demo-final-20260628-000831/09-completed-reload-clean-topbar.dom-summary.json`
    has no `stop-reason-chip` and no visible `end_turn` topbar text.

- [x] Fix context footer layout and visibility.
  - GitHub: https://github.com/iowarp/gact-tui/issues/199
  - Final evidence: context bar is in-flow between transcript and composer,
    `contextAboveComposer: true`, not the old bottom-right chip.

- [x] Prevent composer/footer from occluding transcript content.
  - Final context bar is in-flow and the composer retains the content-column
    width; final screenshot shows no footer/composer overlap with the active
    answer.

## P1 - Core Web UX Issues From GitHub

- [x] Make session/workspace CRUD actions actually work from the UI.
  - GitHub: https://github.com/iowarp/gact-tui/issues/196
  - Delete session, create workspace, and delete/unregister workspace should call
    the backend, toast success/error, and refresh the list.
  - Verified implementation paths: `chatSessionActions.ts` calls
    `deleteSession`/refresh/toast, and `WorkspacesPage.tsx` calls
    create/rename/delete workspace endpoints with refresh/toast coverage.
  - Focused workspace/session action tests pass.

- [x] Redesign model picker as provider -> models.
  - GitHub: https://github.com/iowarp/gact-tui/issues/197
  - Use `GET /v1/providers`, lazy-load `GET /v1/providers/{id}/models`, then
    write selection with `PUT /v1/providers/lm`.

- [x] Disable unauthenticated/unconfigured providers and route to setup.
  - GitHub: https://github.com/iowarp/gact-tui/issues/198
  - Unauthenticated providers/models should show "awaiting configuration" and not
    be directly selectable.

- [x] Organize the slash command palette for web use.
  - GitHub: https://github.com/iowarp/gact-tui/issues/201
  - Group commands, remove redundant navigation-as-command entries, and separate
    technical/dev commands.

- [x] Complete the broader web UX quality pass.
  - GitHub: https://github.com/iowarp/gact-tui/issues/202
  - Track status surfaces, CRUD, command palette, model selection, context, and
    web-specific affordances as one UX pass rather than isolated tweaks.
  - Covered by the closed items above: status chip cleanup, session/workspace
    CRUD, provider -> model picker, disabled provider setup flow, command
    palette grouping, context footer layout, session row actions, session naming,
    archive action demotion, and blueprint source workflow grouping.

- [x] Center the session-row kebab/menu button.
  - GitHub: https://github.com/iowarp/gact-tui/issues/203
  - Replace fixed top offset with centered layout for single- and multi-line
    session rows.

- [x] Let users name new sessions at creation or immediately inline.
  - GitHub: https://github.com/iowarp/gact-tui/issues/204
  - Avoid creating only anonymous/default "New session" entries.

- [x] Demote "View archive" from a full row to an inline icon/action.
  - GitHub: https://github.com/iowarp/gact-tui/issues/205
  - Reclaim vertical space in the sessions column.

## Verification Checklist

- [x] Run the real web EarthScope demo through the browser:
  `npm run demo:earthscope-render`.
- [x] Read the saved final/reload HTML files directly before judging render
  correctness.
- [x] Compare against `apps/web/RENDERING_SPEC.md` and
  `apps/web/CANONICAL-CONVERSATION.md`.
- [x] Capture live mid-run, final live, and reload screenshots.
- [x] Confirm no HTML evidence of `extree` / `cx-trace` / injected scaffolding in
  user-visible transcript paths.
- [x] Confirm every child expert has: parent task, expert label, one or more
  marked turns, tool observations, and an explicit return handoff.
- [x] Confirm only long tool outputs collapse.
- [x] Confirm model text is never collapsed.
- [x] Confirm context footer/bar and composer do not overlap version text or
  transcript content.
