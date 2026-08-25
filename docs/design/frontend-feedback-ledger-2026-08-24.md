# Frontend feedback ledger, 2026-08-24

This ledger is the authoritative review queue for the current CLIO workspace slice. Items are systemic design requirements, not isolated screenshot fixes. Live browser acceptance is required for every affected interaction.

## Header and shell

- Keep every session action menu item on one line; size the menu for its content.
- The session subtitle is the active blueprint display name, not the workspace name. It opens that blueprint as a durable canvas tab.
- Align every collapsed navigation-rail control to one centerline with a uniform hit area.
- Canvas tabs start at the left edge and vertically center their icon, label, and close control.
- Use a modern rounded canvas-tab treatment. Observability is a normal closable and reopenable tab.
- A selected canvas tab is one visual surface; do not nest a second active border inside the rounded tab.
- Remove repeated or permanently unavailable status-strip fields. Add a compact version control with real UI, desktop, agent, and infrastructure versions plus capability-gated update actions.

## Canvas ownership

- File explorer, artifact browser, and blueprint browser are separate canvas tab types. Do not nest them in one generic Workspace tab.
- A file explorer lists files and opens properly rendered file tabs.
- An artifact click opens that artifact directly. The canvas add menu may open an artifact browser.
- A blueprint-name click opens that blueprint directly. The canvas add menu may open a blueprint browser.
- Normal child click opens the child in the center. Shift-click opens or focuses a durable child canvas tab.
- Child canvas headers do not repeat the assignment already present as the first user message.

## Artifacts and provenance

- Conversation artifacts use the sourced AI Elements Artifact composition. The artifact surface itself is the open target; remove the unexplained URI-copy action and explicit Open button.
- Preserve causally distinct artifacts from every producing child or run, even when filenames match. Disambiguate by producer or region. Version grouping belongs in the artifact browser, not causal transcript erasure.
- Remove repeated artifact identity headers in the canvas.
- Image artifacts preserve their aspect ratio and provide fit, zoom, pan, reset, and fullscreen controls instead of cropping with `object-cover`.
- Preview, Versions, and Lineage are proper peer tabs. Keep provenance concise.
- Lineage renders the relationship graph described in `docs/design/provenance-graph-2026-08.md`, using the retained professional graph stack rather than a linear timeline substitute.
- Preserve every causal lineage node and edge. Repetition is navigated spatially; it is never hidden by semantic folding.
- Data-table pagination must update rows. Wide tables must support horizontal navigation.

## Conversation and agent activity

- Compact activity uses CLIO's authoritative per-iteration summary. Do not synthesize it from the first sentence of the next thought.
- Keep each compact summary expandable into its full thinking, next thought, tool, child, UI, and artifact details.
- Do not put a tool icon on the activity summary line; keep the tool icon with the tool invocation.
- In Full mode, align the Chain-view control with the first Thinking row instead of reserving a blank row.
- Reduce the gap between a user prompt and the following assistant identity line.
- Thinking and tools begin collapsed unless actively streaming.
- Simplify child-agent cards: fewer icons, borders, labels, and nested surfaces while preserving state, assignment, result, duration, and the central-versus-canvas interaction.

## Background activity and observability

- The composer activity control represents all durable asynchronous work, including child agents, relay work, MCP v2 tasks, applications, and background processes.
- Show one count, one state, and one open/focus action for Observability. Remove duplicate child counts and duplicate observability buttons.
- Preserve the current Evidence direction.
- Replace the current Work and Activity downgrade with the previous timeline-versus-Gantt observability semantics, adapted to the unified canvas.

## Composer behavior

- Task style is an icon-only bottom-bar selector with a labeled menu: Execute with a play icon, Plan with a map icon, and Deep research with a globe icon.
- Confirmations is a separate icon-only bottom-bar selector. Each menu choice has an icon, concise label, and plain-language explanation.
- Remove Specialist use from the quick surface. Blueprint and domain routing should not require internal terminology.
- Remove File changes from the quick surface unless it becomes a clear user decision. Patch and replacement mechanics belong in advanced policy settings.

## Acceptance discipline

- Exercise visible, hover, focus, keyboard, responsive, open, close, switch, sort, paginate, scroll, and failure behavior in the live browser.
- Automated checks are supporting evidence only. They do not substitute for visual and interaction review.
- Commit and push implementation checkpoints to the coordinated branches.

## Deferred NDP architecture exploration

- After the UI ledger is complete, evaluate a single root EarthScope agent that uses procedural skills directly, spawns no child agents, and may call A2UI for tables, plots, maps, workflows, and artifacts.
- Preserve `earthscope-flat` and the current NDP Demo workspace as the comparison baseline.
- Create a separate workspace and sessions for the single-agent experiment. Do not mix its state or artifacts into the demo workspace.
