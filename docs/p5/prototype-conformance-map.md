# Prototype Conformance Map

Source: 9 element-level conformance JSON files in `docs/p5/conformance/` (`panels`,
`settings`, `icons-and-buttons`, `transcript-parts`, `composer-pill`, `fresh-session`,
`observability`, `menus-grammar`, `rail-and-topbar`). Every count below is a literal
tally of the `status` field across all 185 items in those 9 files — not an estimate.
Statuses: `match` / `deviates` / `missing` / `not-wired` / `unbacked`.

**Headline: 185 items measured, 49 match (26.5% implemented-and-aligned), 136 non-match.**

---

## 1. Coverage scoreboard

Sorted worst-aligned first.

| Surface | Total | Match | Deviates | Missing | Not-wired | Unbacked | % aligned |
|---|---:|---:|---:|---:|---:|---:|---:|
| fresh-session | 23 | 3 | 1 | 18 | 1 | 0 | 13.0% |
| icons-and-buttons | 15 | 2 | 4 | 5 | 4 | 0 | 13.3% |
| menus-grammar | 15 | 2 | 6 | 3 | 3 | 1 | 13.3% |
| composer-pill | 16 | 3 | 8 | 2 | 2 | 1 | 18.8% |
| transcript-parts | 20 | 4 | 8 | 5 | 3 | 0 | 20.0% |
| panels | 13 | 3 | 2 | 5 | 3 | 0 | 23.1% |
| observability | 18 | 5 | 6 | 6 | 1 | 0 | 27.8% |
| settings | 47 | 18 | 4 | 23 | 0 | 2 | 38.3% |
| rail-and-topbar | 18 | 9 | 5 | 2 | 2 | 0 | 50.0% |
| **TOTAL** | **185** | **49** | **44** | **69** | **19** | **4** | **26.5%** |

Reading the shape: `settings`' relatively high % is inflated by nav-list coverage (16/19
prototype pages are *listed*) while its *content* coverage is near-zero — 29 of its 47
items are non-match, almost entirely "backed but not built" detail panes. `fresh-session`
and `icons-and-buttons`/`menus-grammar` are the true floor: the idle/pre-session state and
the popover/menu grammar are the least-built parts of the app. `rail-and-topbar` is the
best-covered surface (workspace/session menus, footer cells, topbar wiring largely match)
but still only half-aligned.

---

## 2. Per-surface non-match tables

One row per item where `status != match`. Ordered worst-surface-first, matching the
scoreboard. `evidence` cites file:line where the JSON gives it; long prose is compressed
without dropping the underlying claim.

### 2.1 fresh-session — 20 non-match of 23

| Element | Prototype truth | Status | Evidence | Backend surface | Fix hint |
|---|---|---|---|---|---|
| Topbar title placeholder | h1 reads literal `"untitled session"` | missing | `SessionView.tsx:710` resolves to `''` with no active session; `Topbar.tsx:51-56` renders it blank verbatim | unbacked — client-owned placeholder, not a wire field | pass `"untitled session"` when `!activeId` |
| Topbar breadcrumb placeholder | `"/"` + `"no blueprint"` button, clickable even empty | missing | `SessionView.tsx:711` omits `breadcrumb` entirely when unset; `Topbar.tsx:57-70` renders nothing | unbacked — UI-owned fallback text | always pass a breadcrumb value, default `"no blueprint"` |
| Composer vertical position, idle | flex spacer pair centers composer ~46% down viewport before first turn | deviates | `composer.css:9-21` `margin:auto auto 0` pins it to the floor unconditionally (comment confirms intent); no idle-vs-active layout branch | unbacked (pure layout) | add top+bottom flex:1 spacers for the idle state |
| Composer animate-to-floor transition | bottom spacer's `flex-grow` animates 1→0 over 460ms on first turn | missing | no transition exists anywhere — impossible given the frame is already floor-pinned | unbacked (client animation, trigger = messages 0→1) | lands for free once the spacer pair above exists |
| Fresh-session headline | `✻ Ready on /scratch/j4471` (glyph + h1) | missing | `SessionView.tsx:730-732` — explicit comment: idle state renders nothing "on purpose" | `GET /v1/workspaces` already fetched into state, unused here | render headline from the already-loaded workspaces list |
| Composer placement/context pill, fresh state | pillbox shows even pre-session: green dot + `ares:/scratch/j4471` + `ctx 0%` | missing | `Composer.tsx:141` `hasPill` is false with no active session, so the whole pillbox is omitted | unbacked pre-session for the host label; ctx 0% needs no call | show a default placement pill before a session exists |
| SUGGESTED section label | `✧ suggested` teal diamond, uppercase mono, clio-rise entrance | missing | zero matches for "suggest" anywhere in `apps/web/src` | unbacked — static prototype content, no backend generator even in the prototype's own design | add a static `SuggestedPrompts` component |
| SUGGESTED row 1 ("Profile a dataset") | button, click inserts title text into composer | missing | not rendered | unbacked (static content) | wire onClick to `setText` |
| SUGGESTED row 2 ("Run a benchmark sweep") | same pattern | missing | not rendered | unbacked (static content) | same as row 1 |
| SUGGESTED row 3 ("Find what is filling scratch") | same pattern | missing | not rendered | unbacked (static content) | same as row 1 |
| Rail "+" new-session button — click semantics | opens the "+ new" config modal, does not create immediately | not-wired | `Rail.tsx:292-300` → `startNewSession()` → `createAndSelectSession()` (`SessionView.tsx:481-508`) calls `client.createSession({})` blind — no title/blueprint/pack/workspace step | `POST /v1/sessions` reachable, invoked with zero collected input | insert the new-session/workspace modal before the create call |
| "+new" dialog — container/header/close | 680px modal, scrim, `+ new` header, close-X | missing | no modal shown for this flow; kit's `Modal.tsx` exists but isn't composed into session/workspace creation | unbacked (chrome only) | build on kit's existing `Modal` |
| "+new" dialog — session\|workspace tab toggle | pill toggle switching which POST fires | missing | no dialog exists | unbacked (chrome only) | implement with the dialog container |
| "+new" dialog, session tab — name field | text input, placeholder `"untitled session"` | missing | no dialog exists | `POST /v1/sessions` accepts `title` — ready | implement with the dialog |
| "+new" dialog, session tab — AGENT BLUEPRINT select | labeled select, static option list in proto | missing | no dialog exists; nothing lists ALL blueprints for create-time picking today | `GET /v1/agent-blueprints` live-verified reachable; binding needs a follow-up call (no blueprint field on `POST /v1/sessions`) | populate from `client.agentBlueprints()`, bind after create |
| "+new" dialog, session tab — EXPERT PACK select | labeled select | missing | no dialog exists | `GET /v1/expert-packs` reachable, currently empty on this backend (`{"expert_packs":[]}`) | populate from `client.expertPacks()`, degrade to disabled/'none' when empty |
| "+new" dialog, session tab — WORKSPACE select | labeled select, options = real workspace roots | missing | no dialog exists; `SessionView.tsx` already loads `workspaces` state, unused here | `GET /v1/workspaces` reachable | reuse the existing `workspaces` state |
| "+new" dialog, session tab — CREATE SESSION button | orange, right-aligned footer button | missing | no dialog exists; today's equivalent is the blind POST from the rail "+" | `POST /v1/sessions`, optionally + blueprint/pack binding | implement with the dialog; disable while in flight |
| "+new" dialog, workspace tab — name+path+browse+CREATE WORKSPACE | name/path inputs, OS-picker "browse…" button, orange CREATE WORKSPACE | missing | no workspace-creation UI exists anywhere (`createWorkspace` has zero call sites) | `POST /v1/workspaces` reachable via `workspace_client.ts:63`; "browse…" has no web equivalent (Tauri-only) | implement session+workspace tabs together; gate browse behind desktop build |
| Composer mode row — "ask" toggle, fresh state | ask/execute pair always visible pre-session | missing | `Composer.tsx:316-346` gates the "ask" button on `approvalMode` which is `null` until a real session loads — only "execute" renders | `session.approval_mode` genuinely doesn't exist pre-session; local `mode` state (defaults `'ask'`) already tracks it internally | render the pair unconditionally from local `mode` state; keep only the full menu gated |

### 2.2 icons-and-buttons — 13 non-match of 15

| Element | Prototype truth | Status | Evidence | Backend surface | Fix hint |
|---|---|---|---|---|---|
| Send-while-busy message queue | send button label changes to "Queue for the next step boundary"; queued rows get reorder/edit/remove + "deliver now" | missing | `Composer.tsx:138,372-380` — send is simply `disabled` while busy; zero queue state anywhere | unbacked — no queued-message endpoint confirmed | add queue state; keep Send enabled while busy (enqueue) |
| Rail search icon | opens full search overlay with live-filtered result rows | not-wired | `Rail.tsx:283-291` renders the correct glyph but `disabled={!onOpenSearch}`, and no caller ever supplies a handler | unbacked, but a client-side filter over the already-loaded list would suffice — no endpoint needed | build the search overlay, wire `onOpenSearch` |
| "New session" (+) button | opens a config modal (mode toggle, path field, Browse, CREATE) | not-wired | `Rail.tsx:292-300` → `startNewSession` → `createAndSelectSession` creates immediately, no modal/path/choice | `POST /v1/sessions` real, invoked with zero configuration | insert the modal between click and create (dup of fresh-session finding) |
| Artifact/record detail panel — Copy button | 24×24 button, two-overlapping-squares icon | missing | `DetailSlot.tsx:21-58` header has no Copy control; `Icon.tsx`'s `IconName` union has no `copy` member at all | unbacked (clipboard write is client-only) | add a `copy` glyph + ToolbarButton |
| Artifact/record detail panel — Download button/menu | button opening download/open-folder/copy-link menu | missing | `DetailSlot.tsx` has no Download control or menu; no `download` `IconName` member | unbacked | add the menu, backed by the artifact's existing content reference |
| Window chrome — maximize/expand button | shared 12×12 4-corner-arrows SVG on Settings/Observability | deviates | `Layer.tsx:141-150` hardcodes Unicode `⛶` instead of an SVG; path absent from `Icon.tsx` entirely | unbacked (client layout state) | add an `expand` IconName, swap the glyph |
| Window chrome — pop-out button (Observability) | live, clickable box-with-arrow SVG | not-wired | `Layer.tsx:151-160` hardcodes `↗`, permanently `disabled`, title "opens in a window on desktop only"; glyph doesn't match proto's SVG either | unbacked — would need a Tauri window API (desktop-only), not a clio-agent route | implement via Tauri on desktop, or drop the inert stub rather than ship the wrong glyph on web |
| Detail-panel Close button | 11×11 SVG X, titled "Close" (no "(Esc)") | deviates | `DetailSlot.tsx:29-35` renders a literal `×` span instead of the app's own already-correct `Icon name="x"` used elsewhere (e.g. `Rail.tsx:254`) | unbacked | call `<Icon name="x" size={11}/>` |
| Observability window Close button | real SVG X (not the plain-text ✕ Settings uses) | deviates | `Layer.tsx:162-169` always renders literal `✕` regardless of context — correct for Settings, wrong for the windowControls Observability instance | unbacked | Layer needs a per-instance close-glyph choice |
| Settings sub-pages (13 pages, 40+ buttons) | full per-page control sets (provider sign-in, agent detach, etc.) | missing | `Settings.tsx:36-69` — every id but appearance/about falls to the generic placeholder | backend-backed per `pages.ts:44-78`, zero UI built | build each page from the prototype (see §2.9) |
| Settings pages: Relays / Plugins / Data & backups | real nav items + pages | missing | `pages.ts:48-96` marks all three `backing:'unbacked'` and filters them out of nav entirely (disclosed via the About page gap text) | Relays: genuinely no route. Plugins/Data&backups: `wire/plugins.ts` and `wire/settings-export.ts` are real, working, simply unwired — the `'unbacked'` label on those two is stale | land missing clio-agent routes for Relays; build UI against the two already-working client modules |
| Panel collapse/expand toggle icon | ≥2 distinct treatments (rail: bare line; detail-panel: off-center rounded-rect divider) | deviates | `Icon.tsx:292-297` defines ONE generic 'panel' glyph reused at `Rail.tsx:275` and `Topbar.tsx:44` | unbacked | transcribe the prototype's distinct collapse paths as separate IconName members |
| Composer acceptance-mode button ("ask" pill) | opens the ask/auto-edits/bypass/ai-review menu without side effects | not-wired | `Composer.tsx:326-330` — onClick unconditionally calls `setMode('ask')` before opening the menu, silently flipping an `execute`-mode user back to `ask` | unbacked (client composer state) | decouple: toggle the menu without mutating `mode` |

### 2.3 menus-grammar — 13 non-match of 15

| Element | Prototype truth | Status | Evidence | Backend surface | Fix hint |
|---|---|---|---|---|---|
| Permissions/approval popover — eyebrow + option grammar | eyebrow "permissions", 4 iconed rows w/ description + teal check | deviates | `Composer.tsx:153-178` — content divergence (4 real backend values vs proto's placeholder set) is a **deliberate, documented** grounding call, not a bug | `PATCH /v1/sessions/{id}` `approval_mode` Literal (`gact/types.py:446`) | reconcile 'ai-review' copy with backend semantics if not already user-facing elsewhere |
| Permissions/mode-menu active-item check color (kit-wide) | teal check (`var(--t-cy)`) | deviates | `contextmenu.css:112-118` uses `var(--t-ac)` (orange) instead | unbacked (CSS) | one-line fix, but kit-wide — mis-colors every menu using `checked` |
| Permissions popover — deployed preview freshness | n/a (build check) | not-wired | live DOM dump of the deployed bundle shows bare 4-button text list, no icon/desc/eyebrow/check — contradicts current source | n/a | rebuild the preview before visual sign-off; source is correct |
| "MODE" popover (execute/plan) | real dropdown, eyebrow "mode", 2 rows w/ descriptions, teal check | missing | `Composer.tsx:15` `ComposerMode` has no `'plan'` member; the "execute" button (`:348-357`) unconditionally calls `setMode('execute')`, no popover at all | **NOT actually unbacked** — `PATCH /v1/sessions/{id}` `mode` Literal `['plan','edit','architect']` (`gact/types.py:440,461,476`) is backed by a full `plan_mode.py` lifecycle module | build the popover; also reconcile vocabulary — proto says execute/plan, backend Literal is plan/edit/architect, no `execute` value exists server-side |
| Provider/model picker popover | 480px two-column (providers ↔ models), per-provider status, per-model gear/sampling editor, thinking-effort row | deviates | `Select.tsx` is a generic single-column listbox (`Composer.tsx:361-370`) — PATCH plumbing works, but none of the two-pane grammar exists | `PATCH /v1/sessions/{id}` `model={provider_id, model_id, variant}` — wired | build a `ProviderModelPicker` if in scope; otherwise an accepted, scoped simplification |
| kit ContextMenu — separator/divider primitive | hairline `<div>` between safe actions and the destructive one | missing | `ContextMenu.tsx:5-15` `MenuItemDef` has no separator field; no divider CSS rule anywhere | unbacked (pure UI grammar) | add a `{id, type:'separator'}` item kind — covers both session and workspace menus |
| Workspace context menu — "pin workspace" label + check | label flips pin↔unpin like the session menu; no check-icon column on this menu | deviates | `Rail.tsx:221-229` — label is hardcoded `'pin workspace'` (never flips); instead sets `checked: menuGroup?.pinned`, adding a check column the ground truth doesn't have | UI-owned (no PATCH for pin observed) | flip the label like sessions already do (`Rail.tsx:206`); drop `checked` |
| Workspace context menu — separator before "remove workspace" | same hairline as session menu | missing | `Rail.tsx:221-259` — no separator entry (same kit gap) | unbacked | same kit fix as above |
| "remove workspace" — confirmation step | opens a confirm modal before the DELETE fires | deviates | `SessionView.tsx:542-559` `handleWorkspaceAction` calls `client.deleteWorkspace(workspaceId)` directly inside the menu's onSelect — no confirm dialog | `DELETE /v1/workspaces/{id}` fires unconditionally | **highest-severity item in this surface** — add a confirmation modal before the destructive call |
| Session row context menu — deployed preview freshness | n/a (build check) | not-wired | deployed preview shows a stale 6-item menu (Rename/Fork/Export/Share/Pin/Delete) that doesn't exist in current source (current `SESSION_ACTIONS` = pin/rename/delete, 3 items, matches proto) | n/a | rebuild the preview; treat source as authoritative |
| Rail footer "agents N" cell | navigates to Settings > Agents (not a popover) | not-wired | `Rail.tsx:467-483` opens a connection-swap `ContextMenu` instead of calling `onOpenSettings` | `connections` is deliberately UI-owned per code comment (distinct from `/v1/agents`) | this is the "opens the wrong semantics" case — retitle to reflect the real action, or add a path to Settings alongside |
| Rail footer "relay" cell | live green dot, "Relays — opens settings" | unbacked | `Rail.tsx:486-494` is permanently `disabled`, title cites clio-agent#1179 | unbacked, **already tracked as clio-agent#1179** | restore once #1179 lands a reachability endpoint |
| Data-integrity note: capture fixtures mislabeled | n/a | deviates | `proto-composer-menus.json` is labeled askMenu/modelMenu but its entries are actually the unrelated @-mention picker's contents | n/a | not an app defect — flagging so this fixture isn't trusted as ask/model-menu ground truth in a future pass |

### 2.4 composer-pill — 13 non-match of 16

| Element | Prototype truth | Status | Evidence | Backend surface | Fix hint |
|---|---|---|---|---|---|
| Placement/workspace chip ("ares:/scratch/j4471") | `<button>`, click opens the Files layer | not-wired | `Composer.tsx:230-245` passes no onClick, `Chip.tsx:37-43` renders `<span>` not `<button>` when onClick is absent; confirmed live (tag === SPAN) | Files layer exists elsewhere in the app; this chip has no handler at all | add onClick matching the topbar's existing handler |
| Pill separators | ctx-side separator is UNCONDITIONAL; async-side gates on data | deviates | `Composer.tsx:246-256` — second separator requires `hasAsync && hasContext`, so it silently vanishes whenever async=0, the common single-session case | unbacked (client conditional logic) | make the ctx-side separator unconditional on `hasContext` alone |
| Async chip ("async N") | button opening an "async agents" runs popover w/ recently-finished badge | missing | `Composer.tsx:249-253` renders an inert `<span>`; the destination popover doesn't exist anywhere in the app | underlying agent-run data already exists (used by the Observability runs tab) — this is a missing UI component, not a missing backend | build the popover as its own component |
| Context chip ("ctx N%") | plain text, no icon, no dot; click opens Observability context tab | deviates | `Composer.tsx:257-265` renders a permanent invented 5×5 amber dot with no proto counterpart, and is an inert `<span>` (no onClick) | context-state fetch + Observability context tab both exist, neither wired to this chip | remove the invented dot; wire onClick |
| Composer frame border-radius | 3rd state (`0 0 14px 14px`) fires when a queued-tray/focused-child is showing | deviates | `composer.css:109-127` implements only 2 of 3 states; `Composer.tsx:273` sets a `data-queued` attribute with no matching CSS selector — dead attribute | n/a | add `[data-queued='true']` rule once the queued tray exists |
| Queued-messages tray / steering panel | docks above the frame: "N messages queued", interrupt-and-deliver, per-row reorder/edit/remove | missing | only the dead `data-queued` attribute exists; no tray/panel component anywhere | unbacked — no client state or endpoint evidence found for message queuing | scope as its own composer sub-component once queue/steer semantics are decided |
| Textarea autogrow | continuous grow-as-you-type via onInput, up to 180px | deviates | `Composer.tsx:285-299` has onChange/onKeyDown only, no onInput/autoGrow — height only changes via the invented Shift+Tab shortcut | n/a | add an onInput handler mirroring the prototype's autoGrow |
| Slash `/` and `@` command menus | visible uppercase eyebrow header; icon+name+description rows | deviates | `Popover.tsx:48-59` — `label` only becomes `aria-label` (screen-reader only, no visible eyebrow); `Picker.tsx:49` icon slot is a blank color swatch, never filled with the real per-item glyph | commands/files data both real | render a visible eyebrow; populate the icon slot with real glyphs |
| Attach button | 26×26 "+", opens an attach popover (upload/session-artifact/path-on-ares) | unbacked | `Composer.tsx:305-314` — geometry matches exactly; rendered `disabled` and red-tinted via `data-unbacked="true"` with an explicit code comment | genuinely unbacked — clio-agent serves no upload endpoint | **none required** — correct, deliberate no-silent-fallback treatment; revisit if an upload endpoint ships |
| Checkmark color on selected menu items | cyan (`var(--t-cy)`) | deviates | `contextmenu.css:112-118` uses `var(--t-ac)` (orange) — same kit-wide bug as menus-grammar §2.3 | n/a | change `.kit-contextmenu__check` to `var(--t-cy)` |
| Mode control ("execute") and its menu | popover w/ execute/plan rows, submitted with every turn | not-wired | `Composer.tsx:348-357` is a plain toggle, no popover, no 'plan'; worse — `SessionView.tsx:807` destructures only `{text}` from submit, **dropping the captured mode entirely** so the control has zero effect on any request | this file's own claim of "unbacked" is **contradicted** by menus-grammar's finding — a real `plan_mode.py` backend exists (see §2.3) | wire a real popover and thread the value into `sendMessage`, or remove the control — a decorative toggle that silently drops its value is exactly the no-silent-fallback violation the cleanup program targets |
| Model selector and its menu | 480px two-pane provider/model picker w/ gear/sampling/thinking-effort | deviates | `Select.tsx`/`Composer.tsx:145-152,361-370` — single flat listbox, no two-column layout, no per-provider status, no gear, no thinking-effort row | `PATCH /v1/sessions/{id}` model — wired; width/trigger geometry match exactly | data plumbing is sound; gap is purely informational architecture (see §2.3 for detail) |
| Shift+Tab expand | **not present in the prototype at all** — proto's only height mechanism is autogrow | deviates | `Composer.tsx:212-218` implements a Shift+Tab binding with zero grounding in the prototype (exhaustive search of the 8.5MB prototype for "Tab" returns zero matches) | n/a | reassess whether this invented shortcut is still needed once real autogrow ships |

### 2.5 transcript-parts — 16 non-match of 20

| Element | Prototype truth | Status | Evidence | Backend surface | Fix hint |
|---|---|---|---|---|---|
| Assistant narration gutter marker | mono '●' bullet, `var(--t-ac)` | deviates | `registry.tsx:103-106` renders a 4px full-height accent bar instead | `message.part.text` | swap the bar for the '●' bullet, or document the redesign explicitly |
| 'thinking' disclosure — expanded body | `border-left:2px` guide rail, 14px prose | deviates | `registry.tsx:44-67` — guide rail lost (now just padding), font 13.5px not 14px. (Token count is honestly dropped per #1177 — that part is fine.) | `message.part.thinking` | restore border-left rail + 14px font |
| Tool invocation row — fold/collapse | ONE collapsible row per tool call, closed by default | not-wired | `registry.tsx:116-142` — `tool_call`/`tool_result` render as two SEPARATE, permanently-expanded cards, no chevron, no toggle | `message.part.tool_call` + `tool_result` (two wire parts) | merge into one collapsible card keyed by call id |
| Tool call vs tool result gutter icon | same wrench glyph for both | deviates | `registry.tsx:120-122,131-132` — call uses 'wrench', result uses a different borrowed gear glyph ('tool') | n/a (styling) | use 'wrench' for both |
| Tool-result error text | full stderr/traceback in its own well box, nothing truncated mid-token | deviates | `registry.tsx:77-89` + `presentationUtils.ts:115-124` `shortScalar` truncates at 120 chars — live-observed cutting a real MCPError mid-object | `message.part.tool_result.content` | render error text in full, own well box, not through the summary truncator |
| expert_handoff Call card (delegate.started/completed) | same Call() grammar as subagent_call: title + expandable params + question, then a child-summary card | deviates | `registry.tsx:144-166` skips the Call() title AND question entirely; renders only a bare compact card, no host/duration extracted | `message.part.expert_handoff` | route through the same `HandoffPart` grammar as subagent_call/result |
| Child/run "running" status dot color | in-progress = accent orange always; green reserved for success | deviates | `statusdot.css:22-26` — 'running' uses `var(--t-ok)` green, not orange; `HandoffPart`'s own dot correctly uses orange — two code paths disagree with each other | `message.part.expert_handoff.stage` | fix `StatusDot`'s running color |
| Failed delegation — status dot | red + ✗, never identical to success | not-wired | `registry.tsx:156` hardcodes status to `'running'`\|`'idle'`, never `'error'`; live-observed a narration-confirmed `delegate.failed` child still rendering the plain gray idle dot | terminal status is present in narration text but not threaded into the renderer | thread the delegate's terminal status into `StatusDot`'s status prop (already supports 'error') |
| Child-card click → focused agent transcript | interactive card (role=button), opens a full focused-transcript pane; shift-click peeks in side panel | not-wired | `HandoffPart.tsx:44-65` — `cursor:pointer` styling with **no onClick at all** | unbacked — no per-child focused-transcript view or route exists anywhere | needs both an onClick AND the destination pane itself |
| Artifact chips inline (durable-artifacts-this-turn grid) | grid of 28px teal-icon-tile cards per artifact | missing | `registry.tsx:192-198` — `resource_link` renders as a bare `<a>`; no card component under `kit/` at all | the artifact-minting wire shape is not rendered here even though the #966 `ArtifactRecord` model already backs the separate `DetailSlot` pane | build the 28px-icon-tile card + per-turn "artifacts (N)" grid |
| HITL "ask" card (checkbox + Answer/Decline) | amber-bordered card, per-option notes, free-text scope row | missing | `registry.tsx:98-100` — explicit comment: P3 kinds are deliberately absent, backend doesn't emit them yet | unbacked — documented intentional gap | (none — see §5) |
| HITL "permission required" card | amber-bordered card, Allow once/Allow session/Deny | missing | `registry.tsx:98-100` — same documented gap | unbacked — documented intentional gap | (none — see §5) |
| a2ui/mcp-ui live widget card (e.g. ParaView) | bordered live-render card w/ frame-scrub + pin | missing | `registry.tsx:209-221` — current renderer honestly names the app + states the real widget lands with #324 | tracked, explicit placeholder (gact-tui#324) | correct no-silent-fallback behavior already; not yet the real widget |
| Streaming text cursor | pulsing `▍` appended to the live-generating line | missing | `clio-pulse` keyframe exists but is applied ONLY to `.part-childcard__dot`; no cursor rule anywhere | unbacked — no part-level "still streaming" flag rendered | add a pulsing cursor to the currently-streaming text node |
| "Waiting for N background agents" marker | `✳` with `clio-pulse` animation | deviates | `transcript.css:74-76` — color/text match, but `.transcript__activity-mark` has no animation rule — static instead of pulsing | `message.part.transcript_activity` | add the animation rule |
| background_exit/agent_message pill shape | compact inline pill, 2px/9px padding, 6px radius | deviates | `parts.css:287-300` `.part-runhandle` is a bigger, boxier chip (7px/10px padding, 7px radius, flex-wrap) | `message.part.background_exit` / `agent_message` (P2.14) | narrow padding/radius to match, unless intentionally redesigned for the newer async-injection grammar |

### 2.6 panels — 10 non-match of 13

| Element | Prototype truth | Status | Evidence | Backend surface | Fix hint |
|---|---|---|---|---|---|
| 'files' topbar button — click target | opens the Files Layer modal immediately | not-wired | `Topbar.tsx:75-80` → `SessionView.tsx:722` sets `panel='files'`; nothing renders for it (only settings/obs/blueprint handled). Live: role=dialog count 0 | `GET /v1/workspaces/{id}/files` + `/files/read` wired in `workspace_client.ts:31-102`, zero consuming call sites | build a Files Layer driven by those client methods |
| Files Layer content — tree + preview + attach | modal: resizable tree column, file preview pane, ATTACH TO MESSAGE + SAVE | missing | no component exists anywhere (`find … -iname '*files*'` finds only the topbar button) | same as above, unconsumed | (none listed) |
| 'console' topbar button — presence gate and click | only control gated on `isDesktop`; click toggles the console dock | deviates | gate is correct (`useIsDesktop.ts`); click sets `panel='console'`, unhandled | unbacked — no shell/PTY/console-execution endpoint anywhere in `apps/core/src/client` | see console dock finding |
| Console dock — bottom REPL | resizable bottom dock, tab bar, live shell REPL | missing | no dock/shell component anywhere under `apps/web/src` | unbacked | needs both a UI dock and a shell-execution route |
| 'artifacts N' topbar button — click target | opens the same Observability layer, preset to artifacts | not-wired | `Topbar.tsx:91-101` → `panel='artifacts'`, unhandled; live role=dialog count 0 | same data Observability already fetches | thread an `initialTab` prop |
| 'artifacts' pill accent color | always cyan, hardcoded (not conditional) | deviates | `toolbarbutton.css:1-27` — gray by default, cyan only on `aria-pressed` | unbacked (styling) | permanent accent variant |
| 'ctx N%' topbar button — click target | opens Observability preset to context | not-wired | `Topbar.tsx:102-112` → `panel='context'`, unhandled; live role=dialog count 0 | context tab is built, reachable only via the eye icon | same fix as artifacts |
| Observability 'context' tab content | progress bar + 3 stat tiles + "LIVE NOW · 3" box | deviates | `Observability.tsx:203-220` — only a 2-row KvGrid | `fetchSessionContextState` supplies used%/tokens/limit only; latency/tokens/cost/live-jobs have no fetch at all | extend `ObservabilityData/context` once a source is identified |
| Detail slot (right pane) — reachability | opens beside the transcript on artifact/answer/agent click, 480px | missing | `AppShell.tsx` defines the slot correctly, but `SessionView.tsx` never passes `detail`; only the dev-only `ShellPreview.tsx:171` fixture does; zero open-detail callback in the transcript | `fetchSessionArtifacts` has the data, no trigger consumes it | add an artifact-chip affordance that sets a selected-record state |
| Detail slot chrome | kind badge, breadcrumb, copy/download menu, maximize, collapse, ARTIFACT/PROVENANCE/RECREATE tabs, CSV preview | missing | `DetailSlot.tsx:21-58` — only an eyebrow + plain Close; tabs mislabeled; overview is a bare KvGrid | n/a (chrome + content gap) | add chrome once reachable; add tabular preview for dataset artifacts |

### 2.7 observability — 13 non-match of 18

See the full table under §2.1's numbering above — restated here per the source file's own name for cross-reference:

| Element | Status | One-line gap |
|---|---|---|
| Pop-out (↗) header icon button | deviates | disabled, desktop-only stub — see icons-and-buttons §2.2 |
| Bottom-right drag-to-resize grip | missing | no resize handle/logic; window size is fixed |
| Legend glyph row | deviates | flat text glyphs, no wrench SVG, wrong ✗ codepoint |
| Timeline log row glyph/marker per kind | deviates | same flat glyphs; no 'user' kind; no running-pulse animation |
| Timeline's opening row for the user's turn | missing | `toHistoryTimelineRow` has no text/user branch — the first user turn never appears |
| Row click-to-navigate (log/gantt/runs/tools/artifacts) | missing | zero onClick handlers anywhere in `Timeline()`/`Gantt()` |
| Runs tab grouping/icons/links | deviates | flat ungrouped list, no RUNNING/COMPLETED split, no transcript link |
| Tools tab information model | deviates | static per-server tool catalog instead of a chronological call log |
| Tools tab row names | not-wired | `tool.name` on a `string[]` response — every row renders blank |
| Artifacts tab row click-to-open | missing | rows are plain spans, no onClick |
| Context tab progress bar | deviates | plain KvGrid instead of the bar + combined label |
| Context tab 3-column KPI grid | missing | `ObsContext` type has no latency/tokens/cost fields at all |
| Context tab "LIVE NOW" panel | missing | no cross-session active-runs feed exists |

(Full prototype-truth/evidence text for each row is in §2.1.)

### 2.8 rail-and-topbar — 9 non-match of 18

| Element | Prototype truth | Status | Evidence | Backend surface | Fix hint |
|---|---|---|---|---|---|
| Search-sessions icon button | opens a search modal, live-filtered rows | missing | `Rail.tsx:283-291` `disabled={!onOpenSearch}`; no `SearchModal` component exists anywhere | client-side filter over the already-loaded list would suffice — no endpoint needed | build the modal, wire `onOpenSearch` |
| New (+) session button | opens the config modal (session/workspace tabs, blueprint/pack/workspace) | not-wired | `Rail.tsx:292-300` calls `newSession?.()` directly → immediate `createSession` with no title/blueprint/pack/workspace; hover is neutral, not the proto's cyan | `POST /v1/sessions` called blind; `POST /v1/workspaces` exists (`workspace_client.ts:59-65`) with zero client call sites | build the modal (dup of fresh-session §2.1) |
| Workspace menu item "open in files" | opens the workspace's tree in the Files layer | not-wired | `Rail.tsx:230-236` item is `disabled: !openWorkspaceFiles`; `SessionView.tsx` never passes the handler | `GET /v1/workspaces/{id}/files` exists | pass an `onOpenWorkspaceFiles` handler scoped to the chosen workspace |
| Rail footer "agents N" cell | navigates to Settings (not a popover) | deviates | `Rail.tsx:467-483` opens a connection-swap ContextMenu instead; count itself is correctly live | count is client-owned (connection pool), not `/v1/agents` | retitle to reflect the real action, or add a Settings path |
| Rail footer "relay" cell | green dot + click → Settings | deviates | `Rail.tsx:486-494` permanently `disabled`, label "relay unknown", cites clio-agent#1179 | unbacked, already tracked as #1179 | restore once #1179 lands |
| Topbar 'files' toggle hover | cyan text + cyan-tinted background on hover | deviates | `toolbarbutton.css:18-21` gives a neutral hover — systemic across files/console/artifacts/ctx/obs | unbacked (styling) | add a cyan hover variant to `ToolbarButton` |
| Topbar 'artifacts N' toggle | entire control (icon+label+count) permanently cyan | deviates | `topbar.css:85-88` only colors the numeral cyan; label/icon stay muted until pressed | session-derived count | give the whole button a permanent cyan variant |
| Topbar 'ctx N%' toggle | entire control stays muted grey always | deviates | same shared `.shell-topbar__count` rule wrongly makes the ctx percentage cyan too — **the accent assignment is backwards versus artifacts** | pill-sourced context percent | scope the cyan rule to artifacts only |
| Hierarchy ribbon | data-driven breadcrumb of the focused agent hierarchy, clickable hops, orange pulse on the live hop | missing | `SessionView.tsx:712` hardcodes `ribbon={[{id:'main',label:'main'}]}`; live-verified against a session with an active `Call(geospatial)` child — ribbon still shows only 'main' | data already reachable via the same session/turn calls the transcript uses — pure client wiring gap | populate `ribbon` from the child-agent navigation stack |

### 2.9 settings — 29 non-match of 47

| Element | Prototype truth | Status | Evidence | Backend surface | Fix hint |
|---|---|---|---|---|---|
| Settings overlay header chrome | gear icon + "Settings" (bold, capitalized) + X close | deviates | `SessionView.tsx:839-844` — no `headerIcon`; `layer.css:81-88` has no text-transform, renders lowercase "settings" | unbacked (chrome) | pass `title="Settings"` + `headerIcon` at both Layer call sites |
| Nav section group headers (CONNECTION/AGENTS/TELEMETRY/APP) | 4 uppercase, non-interactive section labels grouping the 19 pages | missing | `Settings.tsx:24-30` flattens the `group` field entirely; `MasterDetail.tsx` has no group concept at all | unbacked (nav structure) | `pages.ts` already carries the correct `group` per page — just render a header row on group change |
| Nav item: Relays | visible under AGENTS | missing | `pages.ts:48-54` `backing:'unbacked'`, filtered from nav | genuinely unbacked — no relay registry route exists | see §5 |
| Nav item: Plugins | visible under APP | missing | `pages.ts:81-87` claims `backing:'unbacked'`, but `wire/plugins.ts` implements a full working PluginDef registry never imported by any settings page | **client backing exists** — the `'unbacked'` classification is stale | build a PluginsPage against `wire/plugins.ts`, or fix the stale label |
| Nav item: Data & backups | visible under APP, between Appearance and About | missing | `pages.ts:89-95` claims `backing:'unbacked'`, but `wire/settings-export.ts` is a complete, working export/import module, unused | **client backing exists** — stale label | build a page against `wire/settings-export.ts` |
| Backends detail pane | title/subtitle + 2 backend rows (ares/local) + "+ Add remote backend" | missing | `Settings.tsx:54-68` — generic placeholder for every id but appearance/about | the connection registry (`App.tsx:47-178`) already exists and backs a DIFFERENT UI (Rail footer popover) — just never surfaced here | tracked as gact-tui#338 |
| Session defaults detail pane | AGENT BLUEPRINT + EXPERT PACK dropdowns | missing | generic placeholder | client, no dedicated route; sources from catalogs already fetched elsewhere | build the page |
| Providers detail pane | provider list + config rows + auth status | missing | generic placeholder | `GET /v1/providers`, `GET/PUT /v1/providers/lm` | build the page |
| Models detail pane | main/router-lm default-model rows | missing | generic placeholder | `ProviderSettingsClient.providerModels()`/`lmConfig()` | build the page |
| Agents detail pane | connected-agent rows + detach/disconnect | missing | generic placeholder | `GET /v1/agents` | build the page |
| Relays detail pane | relay-host rows + latency + remove/add | unbacked | not reachable — page hidden from nav | genuinely unbacked | see §5 |
| Commands detail pane | 9 slash-command rows w/ description | missing | generic placeholder | `GET /v1/commands` | build the page |
| Prompts detail pane | saved-prompt list / empty state | missing | generic placeholder | `GET /v1/prompts` | build the page |
| Agent blueprints detail pane | installed-blueprint rows w/ metadata + "Open editor" | missing | generic placeholder | `GET /v1/agent-blueprints` | build the page |
| Expert packs detail pane | pack list / empty state | missing | generic placeholder | `GET /v1/expert-packs` | build the page |
| MCP servers detail pane | server rows w/ status + tool count | missing | generic placeholder | `GET /v1/mcp/servers` | build the page |
| Hooks detail pane | hook list / empty state | missing | generic placeholder | `GET /v1/hooks` | build the page |
| Policies detail pane | default approval mode segmented control + allow-rules list | missing | generic placeholder | `GET/PUT /v1/policies` | build the page |
| Memory detail pane | memory-store list / empty state | missing | generic placeholder | `GET /v1/memory/stats` | build the page |
| Metrics detail pane | context/tool-calls/child-tasks/artifacts stat rows | missing | generic placeholder | `GET /v1/metrics` | build the page |
| Doctor detail pane | 5-row connectivity/environment checklist | missing | generic placeholder | `GET /v1/health` + `/v1/capabilities`, `/v1/lsp/clients` | build the page |
| Plugins detail pane | plugin list / empty state | unbacked | not reachable — hidden from nav | client backing exists (`wire/plugins.ts`), stale label — see §5 | see §5 |
| Appearance — Theme preset | label "THEME PRESET", order Dark/Dim/Light | deviates | `AppearancePage.tsx:30-40` — label reads "Theme", order is dim/dark/light | client (localStorage, `theme.ts:13`) | reorder + relabel |
| Appearance — Text size | 4 discrete S/M/L/XL buttons | deviates | `AppearancePage.tsx:50-62` — continuous 0.85–1.4 range slider labeled "Type scale" | client (localStorage) | replace with 4 discrete Tabs |
| Appearance — Diff preview | 3/5/8-line selector | missing | not present in `AppearancePage.tsx` (file is 65 lines total) | client (localStorage, presumably) | add the control |
| Appearance — UI widgets | Auto / Always expand selector | missing | not present | client (localStorage, presumably) | add the control |
| Appearance — Transcript density | Verbose/Normal/Summary selector | missing | not present | client (localStorage, presumably) | add the control |
| Appearance — Locale | "English (US) (en-US)" row | missing | not present | client (localStorage, presumably) | add the row |
| About detail pane | "About Clio Web" + subtitle + 4 KV rows (app/contract/backend/auth) + 2 links | deviates | `AboutPage.tsx:16-39` — title "About" (no subtitle), only product/version KvGrid; missing contract/backend/auth rows and both links; adds an extra "not available in this build" gaps list the prototype doesn't show | client (`build-info.ts`) + connected-backend identity (contract/backend/auth have no source wired) | fill the missing KV rows + links; the extra gaps list is a separate, deliberate design choice worth a product call |

---

## 3. Prioritized gap list — demo-core first, then the rest

Ranked within each bucket, most demo-damaging first. Every non-match item from §2 is
represented here or in its bucket; items sharing one root cause are merged into a single
ranked line with a pointer back to §2.

### 3.1 Observability (13 non-match / 18 — 27.8% aligned)

1. **P0 — Tools tab is structurally wrong AND broken.** Renders a static per-MCP-server catalog instead of the chronological tool-call log the prototype specifies, and even that wrong view shows every tool name as blank (string/object type mismatch against `GET /v1/mcp/servers`). Two stacked defects on one of 5 tabs.
2. **P0 — No row in the panel is clickable.** Timeline, gantt, runs, and artifacts rows all lack onClick — the prototype's entire "click a row to jump to that message / open that agent / open that artifact" cross-navigation model has zero equivalent.
3. **P1 — Runs tab has no grouping, status icons, or transcript links.** Flat list, missing RUNNING/COMPLETED sections and the per-run "open transcript" affordance.
4. **P1 — Context tab is missing 2 of its 3 content blocks.** No progress bar, no relay-latency/thinking-tokens/cost KPI tiles, no "LIVE NOW" cross-session panel — only used%/tokens survive as flat text. The KPI fields may not even exist on `/context/state` yet (needs a wire-shape check, flagged against #1176/#7's related 422).
5. **P1 — The user's own turn never appears as a timeline row**, so the log opens mid-story on a child task instead of the question that started it.
6. **P2 — Marker/legend glyphs are flat text instead of the prototype's SVG icon set** (wrench-in-circle, running pulse, user icon) — cosmetic but visible in every capture.
7. **P2 — No resize grip on the window; pop-out button is a disabled stub** (needs a desktop Tauri API, not a clio-agent gap).

### 3.2 Artifacts (cross-cutting: panels detail slot/button, icons copy/download, transcript chips)

1. **P0 — The Detail Slot (artifact/answer/agent inspector) is unreachable from the live app.** The component exists (`DetailSlot.tsx`) and the slot exists (`AppShell`'s `detail` prop), but `SessionView` never wires them together and no transcript element opens it. This is the prototype's primary artifact-inspection surface and it currently cannot be opened at all.
2. **P0 — No inline artifact chips in the transcript.** The prototype's per-turn "artifacts (N)" grid of 28px icon-tile cards doesn't exist; the closest thing (`resource_link`) renders as a bare cyan link with no icon, size, or row-count meta.
3. **P1 — Even in its unreachable form, the Detail Slot is missing most of its chrome:** kind badge, breadcrumb, copy button, download menu, maximize, collapse-to-rail, and the ARTIFACT/PROVENANCE/RECREATE sub-tab row (currently mislabeled 'overview'). No CSV/table preview of dataset contents.
4. **P1 — Copy and Download glyphs don't exist in the icon set at all** — not just unwired, the SVG paths were never transcribed.
5. **P1 — Topbar "artifacts N" pill opens nothing** (not-wired to the Observability layer's artifacts tab, which is otherwise built and reachable only via the eye icon).
6. **P2 — Artifacts tab rows in Observability aren't clickable** (see §3.1) and its accent color is inverted vs the ctx pill (§3.5/§2.8).

### 3.3 Composer & pill (composer-pill.json + the composer-relevant menus-grammar items)

1. **P0 — The mode control ("execute") silently drops its captured value.** `SessionView.tsx:807` destructures only `{text}` from the composer's submit — whatever mode the user picked never reaches the backend. Compounded by there being no popover/menu at all (no 'plan' option), even though a complete `plan_mode.py` backend module already exists server-side. This is a decorative control that lies about having an effect — a direct no-silent-fallback violation.
2. **P0 — None of the 3 pill chips (placement, async, context) are clickable.** All render as inert `<span>`s though the prototype makes each a real button opening a layer/popover. The async chip's destination popover doesn't exist anywhere in the app.
3. **P1 — Queued-messages tray / steering panel is entirely absent** — a whole feature slice (reorder/edit/remove/deliver-now for messages sent while the agent is busy), with only a dead `data-queued` attribute as a trace of intent.
4. **P1 — Model selector is a flat single-column list** standing in for the prototype's two-pane provider+model picker with per-model sampling settings and a thinking-effort row. Data plumbing (PATCH) is sound; only the information architecture is missing.
5. **P1 — Textarea doesn't autogrow** — the prototype's only height mechanism (continuous type-to-grow) is absent, replaced by an invented Shift+Tab shortcut with zero grounding in the prototype.
6. **P2 — Checkmark color wrong kit-wide** (orange instead of teal) — affects every menu using the `checked` pattern, including this composer's own approval menu.
7. **P2 — Slash/@ menus render with no visible eyebrow header and blank icon swatches** instead of real per-item glyphs.
8. **P2 — Context chip has an invented amber dot** with no prototype counterpart; ctx-side pill separator silently disappears whenever async count is 0.
9. Attach button is the one correctly-handled case here: unbacked (no upload endpoint) and honestly disclosed — no fix needed, see §5.

### 3.4 Fresh session (20 non-match / 23 — 13.0% aligned, worst demo-core surface)

1. **P0 — The idle/pre-session state renders almost nothing the prototype specifies.** No headline ("Ready on {workspace}"), no SUGGESTED prompts (3 rows, all missing), no placement/context pill, no title/breadcrumb placeholder text. `SessionView.tsx:730-732` explicitly comments that this is "on purpose" — a design decision that now diverges hard from the ground truth.
2. **P0 — The rail "+" button skips the prototype's entire new-session configuration modal and POSTs a blank session immediately** — no title, no blueprint, no expert pack, no workspace choice. Every piece of backend needed for the real modal already exists and is reachable (`GET /v1/agent-blueprints`, `GET /v1/expert-packs`, `GET /v1/workspaces`, `POST /v1/sessions`, `POST /v1/workspaces`) — this is purely a missing 680px modal (11 sub-elements, all `missing` in §2.1).
3. **P1 — Composer sits pinned to the floor even with zero messages**, instead of the prototype's centered-then-animates-to-floor idle layout — cosmetic but load-bearing for the "empty session" feel the prototype is built around.
4. **P1 — The "ask" approval toggle is invisible pre-session** even though the local `mode` state that would drive it already defaults correctly — a one-line gating bug, not a missing feature.

### 3.5 Everything else

**Rail & topbar (9 non-match / 18 — 50% aligned, the best-covered surface)**
1. P1 — Hierarchy ribbon hardcoded to `['main']` forever, even mid-session with an active child call visible in the transcript — the ribbon's own data source (session/turn calls) is already fetched elsewhere in the same file.
2. P1 — Search is permanently disabled (`onOpenSearch` has zero callers); "open in files" workspace-menu item is permanently disabled the same way.
3. P2 — Cyan-accent assignment is backwards: `artifacts N` should be always-cyan and isn't; `ctx N%` should always be muted and isn't. Topbar hover states are systemically non-cyan across all 5 toolbar controls.
4. P2 — Rail footer "agents N" opens a connection-swap menu instead of navigating to Settings as titled; "relay" cell is correctly disclosed as unbacked (clio-agent#1179).

**Menus & grammar (13 non-match / 15 — 13.3% aligned)**
1. P0 — "remove workspace" fires its DELETE immediately with no confirmation modal, where the ground truth explicitly gates it — a single misclick permanently unregisters a workspace with no undo.
2. P0 — The MODE popover (execute/plan) doesn't exist despite a complete backend behind it (duplicate of §3.3.1).
3. P1 — kit ContextMenu has no separator primitive at all, so both session and workspace menus lose their visual break before the destructive item.
4. P2 — Checkmark color wrong kit-wide (duplicate of §3.3.6); "pin workspace" label never flips to "unpin"; deployed preview bundle is stale for both the permissions menu and the session context menu (build-verification findings, not source defects).

**Icons & buttons (13 non-match / 15 — 13.3% aligned)**
1. P0 — Send-while-busy message queue is entirely missing (duplicate root cause of §3.3.3).
2. P1 — Detail-panel Copy/Download controls and icons don't exist at all (duplicate of §3.2.4).
3. P1 — 13 of 19 Settings sub-pages are "backed but not built" placeholders (see Settings below).
4. P2 — Window-chrome maximize/pop-out/close glyphs are inconsistent hardcoded Unicode instead of the prototype's real SVGs, and disagree with each other across Settings vs Observability instances.

**Transcript parts, non-artifact (13 of 16 non-match not already covered in §3.2)**
1. P0 — Tool call and tool result never fold into one collapsible row; both render fully expanded permanently, and long tool errors are silently truncated at 120 chars mid-token.
2. P1 — Failed-delegation status dot renders identically to a successful one (no red/✗ signal reaches the renderer despite the backend narrating the failure); the "running" status dot uses success-green instead of the prototype's in-progress orange.
3. P1 — Child-result cards show `cursor:pointer` but have no click handler and no destination — the "open the focused agent transcript" interaction is both not-wired and structurally missing (no such pane exists anywhere in the app).
4. P2 — expert_handoff Call cards skip the Call() title/question entirely, taking a visually thinner shortcut than subagent_call/result; streaming cursor, thinking-disclosure guide rail, and background_exit pill sizing are all minor visual deviations.

**Panels — files & console (5 non-match not already covered in §3.2)**
1. P0 — The Files Layer (tree + preview + attach-to-message) doesn't exist anywhere in the app despite the backend already exposing `GET /v1/workspaces/{id}/files` and `/files/read` for exactly this purpose; the topbar 'files' button is not-wired to anything.
2. P1 — The console dock (bottom REPL) has no implementation and no backend surface at all (no shell/PTY execution endpoint exists on clio-agent) — this is the one true full-stack gap in this surface.

**Settings (29 non-match / 47 — 38.3% aligned, but content coverage is near-zero)**
1. P0 — 13 of 16 backend-backed nav pages (everything except Appearance/About) render only a generic "backed but not built" placeholder — Backends, Session defaults, Providers, Models, Agents, Commands, Prompts, Agent blueprints, Expert packs, MCP servers, Hooks, Policies, Memory, Metrics, Doctor all have zero real UI despite every one of them being backed by a real, already-integrated client method.
2. P1 — Nav section grouping (CONNECTION/AGENTS/TELEMETRY/APP) is flattened to one undifferentiated list.
3. P1 — Relays/Plugins/Data & backups are hidden from the nav entirely; 2 of those 3 (Plugins, Data & backups) are mislabeled `unbacked` when a real, working, simply-unwired client module already exists for each (`wire/plugins.ts`, `wire/settings-export.ts`).
4. P2 — Appearance page: wrong control shape for Theme preset (order+label) and Text size (slider vs 4 discrete buttons); 4 whole rows (Diff preview, UI widgets, Transcript density, Locale) missing outright. About page missing its subtitle and 3 of 4 KV rows plus both links.

---

## 4. Buttons that open wrong or no semantics

All 19 `not-wired` items across every surface, in one place. Several are the same
underlying defect cited independently by more than one audit pass — noted where that
happens.

| Surface | Element | What the prototype does | What the app does |
|---|---|---|---|
| panels | 'files' topbar button | opens the Files Layer modal | sets internal `panel='files'` state (pressed border only); nothing renders — role=dialog stays 0 |
| panels | 'artifacts N' topbar button | opens Observability preset to the artifacts tab | sets `panel='artifacts'`; nothing renders |
| panels | 'ctx N%' topbar button | opens Observability preset to the context tab | sets `panel='context'`; nothing renders |
| icons-and-buttons | Rail search icon | opens the search overlay | permanently `disabled` — `onOpenSearch` has zero callers |
| icons-and-buttons / fresh-session / rail-and-topbar | "New session" (+) button *(same defect, 3 separate audit passes)* | opens the "+ new" config modal | `newSession?.()` → `createAndSelectSession()` POSTs a blank session immediately, no title/blueprint/pack/workspace collected |
| icons-and-buttons | Observability pop-out button | opens a real window (live/clickable in the prototype) | hardcoded `↗` glyph, permanently `disabled`, wrong platform (desktop-only, this is the web build) |
| icons-and-buttons | Composer acceptance-mode ("ask") button | opens the permissions menu without side effects | click unconditionally calls `setMode('ask')` first — silently flips an `execute`-mode user's send-mode as a side effect of opening the menu |
| transcript-parts | Tool invocation row | click toggles a collapsed/expanded well box | `tool_call`/`tool_result` render permanently expanded, no chevron, no toggle at all |
| transcript-parts | Failed-delegation status dot | renders red/✗, distinct from success | hardcoded to `'running'`\|`'idle'` — a narration-confirmed `delegate.failed` child still shows the plain gray idle dot |
| transcript-parts | Child-result card | click opens the focused agent transcript; shift-click peeks it | `cursor:pointer` styling with **no onClick at all**, and the destination pane doesn't exist anywhere in the app |
| composer-pill | Placement/workspace chip | click opens the Files layer | renders as an inert `<span>` — `Chip` never receives an onClick |
| composer-pill / menus-grammar | Mode control ("execute") | opens an execute/plan popover, value submitted with every turn | plain toggle, no popover, no 'plan' option; **the captured value is dropped by the submit handler** — has zero effect on any request the backend receives |
| fresh-session / rail-and-topbar | Rail "+" new-session click semantics *(see New session row above — restated per its own surface file)* | opens the config modal | immediate blind `POST /v1/sessions` |
| observability | Tools tab rows | show the real tool name | `tool.name` read off a `string[]` API response — every row renders blank |
| menus-grammar | Permissions popover (deployed preview) | icon+description+eyebrow+check grammar | deployed bundle shows a bare 4-button text list — **stale build, not a source defect**; source (`Composer.tsx`) and its passing unit test are correct |
| menus-grammar | Session context menu (deployed preview) | 3-item pin/rename/delete grammar | deployed bundle shows a stale 6-item Rename/Fork/Export/Share/Pin/Delete menu that doesn't exist in current source — **stale build, not a source defect** |
| menus-grammar / rail-and-topbar | Rail footer "agents N" cell *(same defect, 2 audit passes)* | navigates to Settings > Agents | opens a connection-swap popover instead — a different kind of surface than the one the title promises |
| rail-and-topbar | Workspace menu item "open in files" | opens the workspace's file tree in the Files layer | menu entry renders but is permanently `disabled: !openWorkspaceFiles` — no handler ever supplied |

**Net new distinct defects (deduplicated across repeat citations): 15.** The "New session (+)"
button and "Rail footer agents N cell" are each counted once in this table's row set but
were independently caught by 2–3 of the 9 audit passes — a signal of how central those two
controls are to the surfaces that reference them.

---

## 5. Unbacked — prototype semantics with no backend surface

### 5.1 Items whose own status is `unbacked` (N=4, direct from the JSON)

| Item | Surface | Backend surface (verbatim) | Genuinely a clio-agent gap? |
|---|---|---|---|
| Relays detail pane | settings | "unbacked per `pages.ts:48-54`" — no relay registry route on clio-agent | **Yes.** No route exists to list/add/edit relay hosts. Candidate new clio-agent issue: relay registry endpoint. |
| Plugins detail pane | settings | "client (Tauri exec_plugin) — wired module exists but unused" | **No.** `wire/plugins.ts` already implements a full, working PluginDef registry client-side; this is a gact-tui UI-wiring gap, not a missing clio-agent capability. The `unbacked` status here is a stale label (see §2.9's Plugins row). |
| Attach ("+") button in the composer | composer-pill | "unbacked (no upload endpoint in clio-agent, per the code's own comment)" | **Yes, but already correctly handled.** No upload endpoint exists; the UI honestly discloses this (`data-unbacked="true"`, disabled, red-tinted) rather than hiding or faking it. Low-priority future issue: add an upload endpoint; no urgent action needed. |
| Rail footer "relay" cell | menus-grammar | "unbacked, tracked as clio-agent#1179" | **Yes, and already tracked.** No new issue needed — restore the UI once #1179 ships a reachability endpoint. |

**Net new clio-agent issues from this list: 1** (relay registry). The other 3 are either a
stale gact-tui-side label, an already-correctly-disclosed gap, or an already-filed issue.

### 5.2 Additional genuine no-backend-capability gaps found inside items of other statuses

These carry a non-`unbacked` top-level status (usually `missing`) but their own
`backend_surface` text states or implies no clio-agent route exists for the underlying
capability. Listed separately because they don't roll into the §1 scoreboard's `unbacked`
column (that column is a literal status-field tally), but they are exactly the kind of
finding this section exists to surface.

| Capability | Surfaces citing it | Evidence | Recommended action |
|---|---|---|---|
| Console/shell execution (PTY) | panels ×2 | "no shell/PTY/console-execution endpoint found... grepped 'shell'/'pty'/'/console'" | New clio-agent issue: a session-scoped shell-execution route, before the console dock UI is worth building. |
| Send-while-busy message queue (reorder/edit/remove/deliver-now) | icons-and-buttons, composer-pill | "no queued-message endpoint confirmed this pass" (hedged — worth a second pass before filing) | Confirm no such endpoint exists, then file; or find it if this pass missed it. |
| HITL "ask" (checkbox question) part kind | transcript-parts | "unbacked (documented intentional gap)" — backend does not emit this wire kind yet | Already a known, documented gap (P3 kinds) — no new issue needed, just tracked. |
| HITL "permission required" (approve/deny) part kind | transcript-parts | same — documented intentional gap | Same — already tracked. |
| Cross-session "LIVE NOW" active-runs feed | observability | "would need a cross-session 'what else is running right now' feed, distinct from `GET /v1/sessions/{id}/context/state`" | New clio-agent issue: a running-status filter on `GET /v1/sessions`, or a dedicated active-runs endpoint. |
| Context-tab telemetry (relay latency / thinking-token count / cost) | observability | "unknown whether the backend response even carries these figures — needs a wire-shape check" (flagged against #1176/#7's related 422) | Not confirmed unbacked — verify `/context/state`'s actual payload before filing anything. |
| Streaming "still generating" flag per part | transcript-parts | "no part-level 'still streaming' flag is rendered" | Verify whether SSE already signals this at a different layer before assuming a backend gap. |

### 5.3 Claims of `unbacked` that are contradicted by a deeper pass — do not file these as clio-agent issues

- **Mode control (execute/plan)** — composer-pill.json calls this "unbacked," but menus-grammar.json's
  deeper dig found a complete server-side feature: `PATCH /v1/sessions/{id}` body.mode
  `Literal['plan','edit','architect']`, backed by a full `gact/plan_mode.py` lifecycle
  module (plan-file path computation, per-turn reminder injection, playbook transition to
  execution). This is a gact-tui UI + vocabulary-reconciliation gap (proto says
  execute/plan, backend says plan/edit/architect, no `execute` value exists server-side),
  not a missing backend.
- **Data & backups detail pane** — settings.json's `pages.ts` labels this `unbacked`, but
  `wire/settings-export.ts` is a complete, working localStorage export/import module with
  zero call sites. Same pattern as Plugins above — a stale gact-tui-side classification.
- **Rail search icon** — "unbacked" per icons-and-buttons.json's terse read, but its own
  fix_hint and rail-and-topbar.json both note a client-side filter over the
  already-loaded session/workspace list would suffice — no clio-agent endpoint is needed
  at all.

---

## Return summary

- **Total items measured:** 185 (across 9 surfaces)
- **Overall alignment:** 49/185 match = **26.5%**
- **Non-match breakdown:** 44 deviates, 69 missing, 19 not-wired, 4 unbacked (sums to 136, i.e. 185 − 49)
- **Scoreboard (worst → best):** fresh-session 13.0% · icons-and-buttons 13.3% ·
  menus-grammar 13.3% · composer-pill 18.8% · transcript-parts 20.0% · panels 23.1% ·
  observability 27.8% · settings 38.3% · rail-and-topbar 50.0%
