# TUI Mouse Interaction Audit

Date: 2026-05-25
Branch inspected: `codex/semantic-menu-interactions`
Scope: audit plus implementation tracking for the semantic interaction migration.

## 2026-05-26 Implementation Notes

- The connecting screen now registers a full-screen semantic retry target and
  advertises click-to-retry through localized copy, so intro, connecting, and
  connection-error states all have mouse entry/recovery semantics.
- Pending transcript file diffs now expose render-derived semantic `apply` and
  `reject` hit targets from the visible action row. Clicks focus the exact diff
  block and dispatch path-scoped backend apply/reject requests instead of
  relying on whole-session keyboard shortcuts.
- Conversation footer actions now expose semantic mouse targets for details,
  bottom, selected-message copy, full-conversation copy, retry, and delete.
  Clicks route through the same body-key handlers as Enter/Ctrl+E, G, y/Y, R,
  and d, so footer mouse behavior stays aligned with keyboard semantics.
- Sidebar footer actions now expose semantic mouse targets for open, rename,
  delete, child visibility, archive/unarchive, copy session id, add context,
  and filter. Clicks route through the same sidebar key handler used by
  keyboard actions, including two-step delete confirmation.
- Detail views now expose a shared semantic copy action in the modal header and
  through `y`, so raw tool evidence, catalog details, context details, memory
  reports, and agent detail text can be copied without selecting terminal
  borders, sidebars, or footer chrome.
- Conversation body copy now prefers the selected semantic block before falling
  back to selected-message text. Clicking a visible tool call/result/diff/text
  block and then the footer `y copy` action copies that block's payload instead
  of depending on terminal-frame selection.
- Compressed paste placeholders in the main input now register semantic
  hit targets. Clicking a visible `[pasted content #N: M lines]` placeholder
  expands that exact paste in place through the same expansion path used by
  `Ctrl+P`.
- MCP install example rows now register semantic hit targets and prefill the
  installer input, clearing stale validation errors and placing the cursor at
  the end of the selected example.
- Overlay outside-click behavior now uses a shared `mouseOverlay` policy table for common close-on-outside modals, with explicit exceptions for quit confirmation and invalid nil-state overlays. This removes the old spread of near-identical coordinate handlers.
- Quit confirmation now uses the same shared outside-click close policy as the
  other modal shells; its choices remain semantic header buttons and
  non-button interior clicks no longer route through a bespoke coordinate
  handler.
- Settings > TUI rows now register full rendered-row hit targets and separate semantic value/left/right controls for every editable row, not just the collapse-threshold row.
- LM provider setup now registers mouse focus targets for provider/model filter headers, API key, API base, refresh, advanced controls, provider/model rows, provider/model side rails, auth, save, and close.
- LM provider setup's save action now uses the shared modal button renderer,
  disabled-button policy, centered action-row geometry, and `button:*` hit
  namespace instead of a separate bordered body control.
- LM provider/model list boxes now reuse the shared side-scroll rail renderer
  used by scrollable modals, so provider setup no longer carries a separate
  thumb/track drawing path for list overflow.
- LM provider/model list rows and hit targets now come from one shared
  windowed-index list renderer, and rail targets are layered after row targets
  so rail clicks are not intercepted by the list body.
- The old hit-only indexed-list helper has been removed; indexed modal lists
  now have a single renderer that returns rows, hits, and window metadata
  together.
- Short tabbed/scrollable modal bodies now pad to a stable body budget so Help, Doctor, Metrics, Settings, and the command palette do not resize dramatically when changing tabs or filtering to fewer rows.
- Palette command rows now avoid showing the command name again as the description; they prefer useful descriptions, then non-duplicate titles, then source fallback.
- Scrollable modals now use a shared side rail/thumb instead of footer/title line-range text, and the catalog browser reuses that affordance instead of adding textual `above` / `more` rows.
- Shared selectable-list modals now register semantic side-rail click targets,
  so palettes, catalog, file picker, workspace switcher, and MCP removal can
  jump through long lists with one primitive.
- Settings > Agent now uses the shared side-scroll rail affordance for
  overflowing agent catalogs instead of textual up/down count rows, and rail
  clicks jump the selected agent without opening detail.
- Slash-command backend failures now surface the real command error as an
  inline transient hint instead of replacing the whole TUI with the fatal
  connection-error screen.
- Rename, add-context, and MCP-install now share a single-line text-entry modal primitive for editor prompt rendering, cursor styling, status rows, footer text, and header button geometry.
- Text-entry modals can now register semantic status-row hit targets through
  the shared primitive; context-add mode chips no longer hardcode modal body
  offsets outside the text-entry renderer.
- Workspace switching now uses a shared selectable-list modal primitive for body rendering, list hit registration, wheel regions, and side-scroll affordance.
- Modal header/action buttons now consistently render as clickable chips again, quit confirmation uses the shared modal width, Settings > TUI first-line hit targets span the whole row, and LM provider setup labels the right-side panel as Configuration instead of Selected.
- MCP remove now uses the shared selectable-list modal primitive and side-scroll affordance instead of local textual overflow count rows.
- File attach picker now uses the shared selectable-list modal primitive while preserving the filter row and stable body height; long file lists get the same side-scroll affordance and stale offscreen hit protection.
- Slash-command and message-search palettes now use the shared selectable-list modal primitive, side-scroll affordance, and semantic row/wheel targets instead of local textual `showing x-y of n` overflow rows.
- Catalog browsers now use the shared selectable-list modal primitive for body rendering, row/wheel hit targets, and surface wheel blocking while preserving catalog-specific footer actions.
- Overlay placement now uses a fixed shared top row and single shared modal width policy, so short and tall modals keep the same top corners instead of vertically re-centering or switching to a separate wide chrome.
- Shared text-entry modals now register semantic cursor-position hit targets from the rendered editor row. Rename, add-context, and MCP-install clicks can place the cursor without each modal inventing coordinate math; MCP install now uses the same rune-indexed line editor as rename/context-add.
- The visible footer `Ctrl+C quit` hint now registers a semantic target that opens the shared quit-confirmation modal instead of remaining keyboard-only.
- Main input and expanded compose textareas now register semantic cursor-position targets, so mouse clicks place the editor cursor without delegating to opaque coordinate patches.
- Expanded compose routes mouse wheel events into textarea cursor movement, so
  long pasted drafts can be navigated by mouse through a render-time textarea
  wheel region instead of an overlay-specific rectangle hook.
- Sidebar context rows now derive their row height from the rendered context
  file shape. The selected context file gets a compact metadata line for
  language/session/timestamp when available, and the semantic hit target spans
  both rendered lines so click geometry stays aligned with the richer row.
- Doctor health integrations and capability scorecard rows now register
  render-window-aware semantic hit targets. Clicking a visible row opens the
  shared detail overlay with the underlying subsystem/capability evidence.
- Metrics provider-cost and route-latency rows now register render-window-aware
  semantic hit targets and open shared detail overlays with exact cost/share or
  p50/p95/max/count evidence.
- Permission banner actions now register semantic hit targets for allow, deny, session allow, and workspace allow.
- The intro splash now has a full-screen semantic continue target, and the connection error screen uses the shared modal/button shell for retry and quit actions.
- Transcript detail affordance rows such as `raw detail · Ctrl+E` now register semantic hit targets that open the detail modal directly; whole-block clicks still select first and open on a second click.
- Sidebar footer counts now register a semantic hit target and toggle active/archived sessions through the same path as the `h` key.
- Sidebar filtering now has semantic mouse entry points: the visible footer `f filter` hint starts filter editing, the filter-mode footer exposes clickable apply/cancel targets, and an existing filter row can be clicked to re-enter editing while preserving Esc restore semantics.
- Slash-command and message-search palette filter rows now have cursor-aware
  editing and render-time cursor hit targets, so clicks place the insertion
  point instead of leaving the filter as append-only text.
- Header chips now register render-time semantic targets: backend opens metrics, workspace opens the workspace switcher, session focuses the selected sidebar row, model/routing open model settings, agent opens agent settings, and status opens Doctor when integration health is supported.
- Footer focus and visible `Tab pane` hints now register semantic targets that cycle focus through the same helper used by keyboard Tab.
- Footer status chips now register semantic targets: the reconnect badge dispatches the existing manual reconnect path, and the ARC memory hit-rate chip opens the memory inspector.
- Long transcript scroll now has deterministic emulator-backed visual coverage:
  `semantic_long_transcript_scroll.tape` drives a generated multi-section
  assistant response and captures bottom, scrolled-up, `G`, and `PageDown`
  screenshots to prove keyboard bottom reattachment against settled content.
- Context drill-down visual coverage no longer depends on a live CLIO session:
  `run_context_drilldown.sh` seeds an emulator session with read/edit/pin
  context files, then `semantic_context_detail.tape` and
  `semantic_context_actions.tape` verify readable context rows, detail
  metadata, and action-menu access from deterministic screenshots.
- Sidebar/session visual coverage now uses deterministic emulator runners:
  `run_seeded_sidebar.sh` drives session actions, sidebar filtering, and quit
  confirmation with seeded sessions, while `run_workspace_switch.sh` drives a
  multi-workspace switcher screenshot without live backend/session state.
- Settings, header, palette, text-entry, compose, file-picker, MCP install,
  and conversation-action semantic tapes now run against the seeded emulator
  session instead of a live CLIO benchmark session, so the core menu and
  transcript-interaction screenshot set is reproducible from a clean checkout.
- Visual-loop runner scripts now keep the shell as the parent process and clean
  up both the TUI and seeded emulator children on exit, preventing stale
  emulator processes from serving old backend capabilities to later VHS runs.
- Provider setup, startup intro, and menu smoke visual loops now run against
  deterministic local emulator runners. The emulator exposes `/v1/providers/lm`
  GET/PUT backed by the static provider/model catalog, so provider configuration
  screenshots exercise the real TUI provider flow without relying on live CLIO
  state.
- The shared modal list primitive now supports inline metadata, and the tool
  catalog uses it for source, permission, and input summaries. Short tool rows
  no longer spend a second visual row on metadata, so the catalog is denser
  while retaining the same shared row hit registration and scroll behavior.
- The command palette also uses shared inline list metadata for short command
  descriptions and current-state chips. Command rows now fit one per line,
  preserving semantic row hit targets while showing more commands in the same
  stable modal frame.
- The MCP removal picker now uses the same inline metadata row shape for
  transport and server ID, so removable servers remain one row each while
  preserving shared selectable-list hit targets, wheel behavior, and rail
  scrolling.
- Row-local session, context, and conversation action menus now render through
  the same dense inline metadata row shape as the migrated palettes/catalogs,
  keeping keyboard shortcuts and action descriptions on one selectable row with
  matching mouse hit targets.
- Settings Theme and Language tabs now use the same dense inline metadata row
  shape for descriptions/locales, reducing tab-to-tab height churn while
  preserving semantic row selection, preview, and mouse hit targets.
- Settings TUI editable preference rows now keep the dense control list to
  label/value content and render the selected row's explanation as a
  full-width detail band. The semantic row target expands with the selected
  detail area while left/right arrow hit targets remain anchored to the
  rendered control row.
- Settings TUI stepper rows now use a reusable render-and-hit geometry helper
  instead of scanning styled row text per option, so later-row left/right mouse
  controls share the same click semantics as the first row.
- The top header now exposes a visible quit/exit action that opens the shared
  quit confirmation modal, matching the footer Ctrl+C semantic target for
  mouse-first users.
- Tool detail annotations now render as a typed Safety hints section instead
  of raw JSON, keeping MCP/built-in tool metadata readable while preserving
  copyable full detail text.
- Help > Commands now renders through the shared dense modal list row shape and
  registers semantic row targets. Clicking a command stages that slash command
  in the input instead of executing it, giving mouse users a safe command entry
  path from Help.
- Tool catalog footer hints now advertise the same `Enter details` behavior
  that keyboard and semantic row clicks already use, so the dense shared list
  no longer hides its primary drill-down affordance behind an undocumented key.
- Doctor health/capability footer hints now advertise clickable row details
  when actionable rows are visible, matching the existing shared detail-pane
  mouse targets without implying keyboard row-selection support that the modal
  does not yet provide.
- Backend Metrics footer hints now advertise clickable row details when cost
  or latency rows have semantic detail targets, matching the same shared
  detail-pane mouse affordance used by Doctor.
- Scrollable informational modals now share `scrollableModalRowDetailFooter`
  for row-detail affordance hints, so Doctor and Metrics no longer duplicate
  string-specific footer logic when their render-time row targets are present.
- Text-entry and picker-style modal footers now use shared `modalKeyHint`
  formatting, so rename, add-context, MCP install/remove, file picker, and
  workspace switch stop handcrafting spacing and separators independently.
- Settings > TUI stepper controls now register the full rendered control halves
  as left/right hit areas instead of tiny glyph-only targets, with regression
  coverage proving later rows respond to both directions through the shared
  stepper geometry.
- Scrollable modal command/list rows can now register through shared
  `registerWindowedModalListHits`, which clips row targets to the active body
  scroll window. Help > Commands uses this instead of owning local visible-row
  intersection math.
- Settings > TUI and provider setup Model configuration steppers now share the
  same rendered-control hit splitting for left/right adjustments. Provider
  advanced controls use the full `◀ value ▶` halves instead of fragile
  glyph-only cells.
- Provider setup provider/model row targets now use shared indexed modal-list
  windowing through `windowedIndexModalList`, so both columns derive visible
  row hit targets from the same cursor-centered range and modal-list geometry.
- Provider setup provider/model side rails now use shared
  `registerModalIndexedListRailHits`, mapping rail rows to the same rendered
  index lists used by row hits instead of duplicating position-to-index
  selection code in each column.
- MCP install example rows now register through shared modal-list row hits
  instead of modal cell hits, so example clicks use the same full-row target
  model as picker/catalog rows while preserving the compact text-entry modal.
- Context-add read/edit/pin mode chips now render through shared inline modal
  options, so active chip styling and click geometry come from one primitive
  instead of per-view column math.
- Modal tab bars now render labels and return their click hit geometry from the
  same helper. Settings, Help, Doctor, and other tabbed modals no longer
  maintain a separate tab-width calculation for mouse registration.
- Modal action/header buttons now render labels and return click hit geometry
  from the same helper, keeping close/back/save/detach chip targets aligned
  with their visible padding and shared spacing.
- Settings TUI and provider setup stepper rows now share a modal stepper hit
  primitive for full-row select plus left/right control halves, so both menus
  keep the same click semantics for adjustable values.
- Provider setup now uses the shared modal inner-width helper for its intro
  copy while preserving the compact grid/footer width required by its bordered
  two-column layout, avoiding avoidable one-word wraps without breaking
  short-terminal row geometry.
- Standard modal bodies and list regions now reuse `modalInnerWidth` across
  Settings, Doctor, detail views, quit confirmation, workspace switch, action
  menus, file picker, and MCP install/remove, reducing local `w - 4` layout
  policy drift.
- Inset selectable-list regions now reuse `modalInsetListWidth` across action
  menus, file picker, MCP remove, command/search palettes, and catalog
  browsers, and workspace switch, so row rendering, row hit targets, and scroll
  rails share the same frame padding policy instead of each modal carrying local
  `w - 8` math.
- Expanded compose textarea rendering and mouse-wheel regions now use
  `modalTextAreaWidth`, derived from the shared modal inner width, so editor
  layout and render-time hit registration stay tied to one modal chrome policy.
- Scrollable modal bodies now share `modalScrollableBodyWidth` and
  `modalScrollableContentWidth` for body rendering, wheel targets, row detail
  hits, and rail hits, keeping Help, Doctor, Metrics, detail views, and
  selectable-list rails on the same body/rail geometry policy.
- Provider setup nested boxes now share `lmConfigBoxBodyWidth` and
  `lmConfigBoxContentWidth` for provider/model lists, provider details, model
  details, auth-message wrapping, and internal scroll rails, reducing local
  box-specific width drift inside the most complex configuration modal.
- Provider setup advanced rows now render row text and stepper mouse hits from
  one shared row/hit pass, registered through offset-aware modal cell hits so
  every advanced option inherits the same wide left/right click targets.
- Provider setup Configuration rows now render editable provider-detail rows
  and API key/auth/API base hit targets from one shared pass, so clipped rows
  no longer keep stale mouse targets below the visible box.
- Connection-error and file-picker error surfaces now size visible error text
  through the shared inset-list width policy, and file-picker backend failures
  cap the entire rendered error row instead of truncating only the raw error
  suffix after a fixed prefix.
- Shared modal/detail wrapping now preserves leading indentation on wrapped
  rows, so long structured fields in memory, context, catalog, and raw-evidence
  detail views keep their label/body shape instead of collapsing into
  left-aligned text after the first visual line.
- Sidebar session rendering now uses the shared variable-height visible-range
  helper instead of a fixed two-rows-per-session approximation, keeping parent
  rows, child/nanoagent rows, collapsed-child summaries, and session hit
  targets on one viewport geometry model.
- MCP install example rows now render examples and semantic row hits from one
  shared modal-list pass, then register through `registerModalListRegion`
  instead of maintaining a separate hit-only loop.
- Settings list tabs now reuse the shared modal-list hit offset helper when
  merging tab-local row hits into the padded Settings body, removing a
  settings-only row-offset loop while preserving shared body wheel behavior.
- Shared selectable-list modals now route row hits through
  `registerModalListRegion` even when a list has no wheel target, removing the
  last row-hit-only branch inside the shared list modal renderer.
- Mouse-wheel dispatch now mirrors click dispatch: while any overlay is open,
  wheel events first check overlay-scoped semantic targets and are then
  swallowed by the overlay policy before the base conversation/sidebar regions
  can see them. This prevents uncovered areas behind modals from scrolling the
  transcript.
- Windowed modal command/list row hits now clip rows and hit ranges into a
  visible `modalListRender`, then register through `registerModalListRegion`.
  Help > Commands no longer reaches around the shared list-region primitive
  when its scroll window hides rows above or below the viewport.
- Provider setup body content width now uses the named shared modal body
  content-width policy instead of carrying its own `w - 6` calculation, keeping
  provider rendering and modal hit/scroll geometry tied to the same frame
  padding rule.
- Help > Commands list rows now use the shared scrollable-modal body width for
  both rendering and row hit targets instead of the wider raw modal inner
  width, so command clicks stay aligned with the visible scrollable body.
- Provider setup provider/model list rails now share a named box rail-column
  helper instead of duplicating the side-rail column calculation in each list
  section.
- Provider setup provider-details and advanced-control cell hits now register
  through a shared box-relative cell-hit helper, so box-local row/column hits
  use one `top+2` content offset policy.
- Provider setup provider/model list row hits now use the same box content-top
  helper as provider-details and advanced cell hits, keeping every provider box
  target on one box-relative content-offset rule.
- Provider setup provider/model side-rail hit targets now also use the shared
  box content-top helper, so rows, cells, and rails all share one box-local
  content origin.

Verified in this pass with focused interaction tests, the full Go suite, rebuilt `tui/gact`, and VHS screenshots under `visual_loop/screenshots/` for settings, provider setup, text-entry, palette, catalog/menu surfaces, memory, deterministic long-transcript scrolling, deterministic context drill-down, deterministic sidebar/session workflows, and deterministic seeded-menu workflows.

## Executive Summary

Mouse support is currently centralized in `App.handleMouseWheel` and
`App.handleMouseClick` in `tui/internal/ui/app.go`.

Current mouse support:

- Wheel up/down scrolls the conversation, but only when no blocking overlay is open.
- Click in the sidebar selects sessions, toggles sidebar sections, and toggles child/nanoagent expansion on the selected parent.
- Click context file rows to open structured context detail.
- Click visible conversation parts to select them; clicking the selected part again opens detail.
- Click header/footer help/settings/command affordances when visible.
- Click in the input pane changes focus to input; the mouse-mode `/` chip opens the command palette.
- Click inside the main input and expanded compose textareas places the cursor.

Most historical keyboard-only popups have been migrated to the overlay-first
mouse dispatcher and shared modal primitives. Remaining gaps are now narrower:
true range/text selection and continued visual polish for wrapping/button
alignment as new surfaces are added.

## Base UI Surfaces

### Sidebar

Mouse support exists:

- Click session rows to select/open that session.
- Click selected parent with children to expand/collapse nanoagents.
- Click `SESSIONS` or `CONTEXT` headers to collapse/expand.
- Click the visible footer `f filter` hint to start filtering sessions.
- Click an existing filter row to re-enter filter editing.
- Click filter-mode footer apply/cancel targets to commit or restore the filter.
- Click the active/archived footer counts to toggle active vs archived sessions.
- Click visible sidebar footer actions for open, rename, delete, child
  visibility, archive/unarchive, copy session id, add context, and filter.
- Right-click a rendered session row to open the shared session action menu.
- Press `m` from sidebar focus to open the same action menu by keyboard.
- Click session action rows for open, rename, add context, child visibility,
  copy id, archive/unarchive, and two-step delete.
- Right-click a rendered context file row to open the shared context action
  menu.
- Press `m` on a selected context row to open the same action menu by keyboard.
- Click context action rows for detail, copy path, copy structured metadata,
  add another file, and backend-confirmed remove.

### Conversation Body

Mouse support exists:

- Click visible addressable parts to select them.
- Click the selected part again to open detail.
- Click visible detail affordance rows such as `raw detail · Ctrl+E` to open detail directly.
- Click pending file-diff `apply` / `reject` affordances to apply or reject that path.
- Click visible footer conversation actions for details, bottom, copy, copy all, retry, and delete.
- Click a visible conversation block and then footer `y copy` to copy that
  semantic block's payload.
- Right-click a visible conversation block to open the shared conversation
  action menu.
- Press `m` on a selected conversation block to open the same action menu by
  keyboard.
- Click conversation action rows for detail, copy block, copy full transcript,
  retry user messages, apply/reject diff blocks, and delete message.
- Wheel scrolls the transcript through render-time body-region routing.

Missing:

- Select text ranges via mouse.

### Input

Mouse support exists:

- Click focuses input.
- Click visible text positions to place the cursor.
- Click the mouse-mode `/` chip to open the command palette.
- Click a compressed paste placeholder to expand/review that paste inline.

Missing:

- Text selection.
- Click send if a send affordance is added later.
- Click `@` file references or attached-context chips if surfaced.

### Header/Footer

Mouse support exists:

- Top-right header help/settings actions are semantic targets.
- Visible footer settings, command, help, and quit hints are semantic targets.
- Click the footer focus label or visible `Tab pane` hint to cycle focus.
- Click footer reconnect and ARC memory status chips to refresh the backend stream or inspect memory/context.
- Click header backend/workspace/session/model/agent/routing/status chips to drill into the matching existing modal or focus target.

Missing:

- Click any remaining error/status affordances that are not represented by the shared error modal buttons, header chips, or footer status chips.

### Permission Banner

Mouse support exists:

- Click Allow, Deny, Allow session, Allow workspace.

Keyboard support exists through `a/d/s/w`.

### Intro, Connecting, And Error Screens

Keyboard behavior:

- Intro dismisses on keypress.
- Connecting generally waits.
- Error screen supports quit/retry keys.

Mouse support exists:

- Click the intro screen to continue into connecting.
- Click the connecting screen to retry the backend connection.
- Click connection-error retry/quit actions through the shared error modal buttons.

## Overlays And Popups

### Slash Command Palette

Keyboard behavior:

- `Esc`/`Ctrl+C` close.
- Up/down select.
- Enter executes command or search result.
- Typing filters.

Mouse support exists:

- Click command/search result rows to select and execute.
- Click the filter/query row to place the cursor.
- Wheel scrolls long result lists.
- Click outside/close uses the shared overlay policy.

### Help Overlay

Keyboard behavior:

- `?`, `Esc`, `Ctrl+C` close.
- Left/right/Tab switch tabs.

Mouse support exists:

- Click tabs.
- Click close/outside through the shared modal shell.
- Wheel scrolls when a tab exceeds the visible body.

### Settings Modal

Keyboard behavior:

- `Tab`/`Shift+Tab` switch tabs.
- Up/down select rows in Agent, Theme, TUI, Language tabs.
- Left/right adjust TUI preferences.
- Enter opens provider config, applies theme/language, opens agent detail, or closes.

Mouse support exists:

- Click tabs: Model, Agent, Theme, TUI, Language.
- Click rows to select or open/apply row actions.
- Click TUI preference left/right controls or toggle rows.
- Click theme/language/agent rows.
- Wheel scrolls long agent lists.
- Click the Agent tab side rail to jump through long agent catalogs.
- Click close/cancel through the shared modal shell.

### LM Provider/Model Config Modal

Keyboard behavior:

- Esc closes.
- Ctrl+R refreshes.
- Tab/Shift+Tab move sections.
- Up/down navigate provider/model/advanced fields.
- Left/right adjust numeric advanced fields.
- Enter advances, saves, or starts auth.
- Text input filters providers/models and fills API fields.

Mouse support now exists for:

- Click provider row.
- Click model row.
- Click OAuth/auth row when the provider exposes one.
- Click save and close.
- Wheel scroll provider/model lists and the advanced section.
- Click visible advanced-row `◀`/`▶` controls for temperature, max tokens,
  context length, and thinking budget.

Mouse support exists for:

- Click provider/model filter headers to focus filtering.
- Click API base/API key fields to focus editing.
- Click refresh/auth/save/close actions.

Remaining gaps:

- Text selection inside editable fields.

### Catalog Browser

Includes `/mcp`, `/tools`, `/skills`, `/agents`, MCP detail, agent detail, and
tool/resource detail entry points.

Keyboard behavior:

- Esc/Ctrl+C close or go back from detail.
- Backspace goes back from detail.
- Up/down select.
- Enter drills in or opens detail.
- Space toggles tool disabled state.
- `i` install MCP.
- `d` remove MCP.

Mouse support exists:

- Click rows to select and drill in/open detail.
- Click Back/Close.
- Click disabled toggle for tool rows.
- Wheel scrolls catalog rows.
- Click install/remove actions.
- Detail views use shared modal header actions.

### Detail View

Keyboard behavior:

- Esc/Ctrl+C/Ctrl+E close.
- Up/down scroll.
- PgUp/PgDn page.
- g/G jump top/bottom.

Mouse support exists:

- Wheel scrolls detail content.
- Click the side scroll rail to jump within long detail content.
- Click close through the shared modal shell.
- Click copy to copy the full detail payload without terminal chrome.

Remaining gaps:

- Drag scrollbar thumb if drag semantics are later added.
- Select text ranges or click raw paths/artifacts.

### Metrics Modal

Keyboard behavior:

- Esc/Ctrl+T close.
- `r` refresh.

Mouse support exists:

- Click close.
- Click refresh.
- Wheel scrolls if metrics overflow.
- Click provider-cost and route-latency rows to open shared detail.

### Doctor Modal

Keyboard behavior:

- Esc/Ctrl+C/q close.
- r refresh.
- Tab/right/left switch tabs.

Mouse support exists:

- Click Health/Capabilities tabs.
- Click refresh.
- Click close.
- Wheel scrolls if subsystem/capability rows overflow.
- Click individual integration/capability rows to open shared detail.

### Workspace Switcher

Keyboard behavior:

- Esc/Ctrl+C cancel.
- Up/down select.
- Enter switch.

Mouse support exists:

- Click workspace row to select/switch.
- Wheel scrolls when the workspace list exceeds modal height.
- Click cancel/close through the shared modal shell.

### Rename Session Modal

Keyboard behavior:

- Esc/Ctrl+C cancel.
- Enter save.
- Backspace/delete edit.
- Left/right/Home/End move cursor.
- Printable text edits.

Mouse support exists:

- Click inside the text field to place cursor.
- Click save/cancel.
- Click outside to cancel through the shared overlay policy.

Remaining gaps:

- Select text.

### Add Context Modal

Keyboard behavior mirrors rename:

- Esc/Ctrl+C cancel.
- Enter save.
- Tab cycles context mode.
- Backspace/delete edit.
- Left/right/Home/End move cursor.
- Printable text edits.

Mouse support exists:

- Click inside text field to place cursor.
- Click read/edit/pin mode chips.
- Click save/cancel.
- Click outside to cancel through the shared overlay policy.

Remaining gaps:

- Select text.

### Compose Modal

Keyboard behavior:

- Ctrl+S/Ctrl+Enter commit.
- Esc cancel.
- Other keys go to inner textarea.
- Paste is routed to the compose textarea.

Mouse support exists:

- Click textarea to place cursor.
- Wheel scrolls textarea content.
- Click commit/cancel.
- Click outside to cancel through the shared overlay policy.

Remaining gaps:

- Select text.

### File Picker

Keyboard behavior:

- Esc/Ctrl+C close.
- Up/down select.
- Enter insert selected file.
- Backspace edits filter.
- Printable text edits filter.

Mouse support exists:

- Click file row to select/insert.
- Wheel scrolls result list.
- Click filter field.
- Click close/cancel through the shared modal shell.

### MCP Install Modal

Keyboard behavior:

- Esc cancel.
- Enter install.
- Backspace edits.
- Printable text edits input.
- While saving, all keys are ignored.

Mouse support exists:

- Click input field to focus/place cursor.
- Click install/cancel.
- Click example rows to prefill the installer input.

Remaining gaps:

- Select text.

### MCP Remove Modal

Keyboard behavior:

- Esc cancel.
- Up/down select.
- Enter remove.
- While saving, all keys are ignored.

Mouse support exists:

- Click server row to select/remove.
- Wheel scrolls list.
- Click cancel/close through the shared modal shell.

### Quit Confirmation Modal

Keyboard behavior:

- Esc dismisses.
- Left/right select option.
- y/n/d immediately apply close/no/detach.
- Enter applies selected option.
- Ctrl+C applies selected option.

Mouse support exists:

- Click `close`, `no`, or `detach` chips.
- Click outside/close to dismiss through the shared modal shell.

## Cross-Cutting Problems

1. Overlay-level mouse dispatch is now in place through semantic hit targets and
   shared overlay policies. Remaining work should extend the semantic primitives
   instead of adding one-off coordinate handlers.

2. Modal/list geometry is now retained for the migrated shared primitives:
   selectable lists, scrollable bodies, header buttons, and single-line text
   entry. Remaining bespoke surfaces should move onto those primitives before
   adding new mouse behavior.

3. Lists now have consistent hit-testing, wheel behavior, and shared rail-click
   jump behavior for palette, catalog, file picker, workspace rows, MCP remove
   rows, Settings Agent rows, and LM provider/model columns.

4. Text-entry modals now share a single-line editor policy for rename,
   context-add, MCP install, and provider configuration fields. Remaining work is
   text selection, not basic cursor placement.

5. Scrollable surfaces now have target-aware wheel routing for conversation,
   detail, catalog, settings, LM provider/model lists, file picker, and modal
   bodies that can overflow.

6. Modal controls now use the shared header/action model for close, back,
   cancel, apply, refresh, install, remove, and detach. Continue auditing visual
   polish for chip spacing and centering, but the semantics are no longer
   keyboard-only.

8. Copy/paste and terminal selection need an explicit design. With mouse mode
   enabled, paste into the input/compose textarea and copy from the conversation
   should remain ergonomic. With mouse mode disabled, terminal copy works but
   captures borders/sidebar/footer text; add a future copy-mode or copy-block
   action so users can copy transcript content without UI chrome. Detail views
   now provide scoped full-payload copy, and selected transcript blocks copy
   through the footer action; transcript body range selection remains.

9. Some wrapped content wastes horizontal space. Long catalog/tool/config rows
   sometimes break after only a few words while the modal still has room. Modal
   body rendering should prefer semantic wrapping with the actual inner width,
   avoid repeated command-name descriptions, and use available space for
   meaningful metadata. Tool catalogs in particular should not repeat the
   command name as a description; the list view should stay dense and reserve
   detail text for metadata that helps users choose or diagnose the tool.

10. Header/footer global affordances now include clickable settings, help,
    command, quit, backend, workspace, session, model, agent, routing, and
    status entry points. Footer reconnect and ARC memory chips are clickable;
    any remaining error/status affordances should route through the same
    render-time target model.

11. TUI options/configuration controls now have mouse parity for row selection,
    left/right adjustments, apply/save/cancel, and backward navigation. Continue
    verifying rendered hit targets with screenshots when new options are added.

12. Copy semantics should be scoped, not terminal-frame dependent. Detail
    views now copy their full payload directly, selected transcript blocks copy
    through the conversation footer, and `/copy` uses the shared assistant-text
    clipboard adapter instead of a separate platform-shell path. Remaining copy
    work is transcript range selection and textarea selection, without copying
    sidebar borders, divider glyphs, and footer text.

13. Text-entry paste/copy parity is still unresolved. Mouse mode should not
    make paste into the regular input or expanded compose textarea worse, and
    compressed paste placeholders in the main input can now be expanded by
    click. Remaining text-entry work is true range selection and any future
    compose-specific paste review affordance. Treat this as a product task, not
    a terminal accident.

## Implementation Sequence Status

1. Done: add an overlay-first mouse dispatcher that mirrors `handleKey` precedence.
   It should route to `handleXMouse` for the topmost open modal.

2. Done: normalize modal geometry: helpers for centered modal origin, inner width,
   title/header rows, list row ranges, footer/hint rows.

3. Done: implement list-row click/scroll for the high-use picker/list modals:
   palette, catalog browser, file picker, workspace switcher, settings tabs.

4. Done: implement button/chip clicks: quit confirmation, settings tabs, LM config
   save/auth, MCP install/remove, close/cancel affordances.

5. Done: implement detail-view wheel scrolling before adding richer text selection.

6. Done: add cursor hit-testing for textarea surfaces (`input`, `compose`) and
   custom single-line text-entry modals (`rename`, `context-add`, `mcp-install`).

7. Done: conversation and detail copy actions now cover selected assistant text,
   selected semantic transcript blocks, raw detail payloads, and full
   transcript copy without requiring terminal-frame selection. Remaining work is
   true range selection, not scoped block copy.

8. Done: add top-chrome settings/help targets after the footer targets have proven
   stable, so mouse users have a predictable global entry point even when the
   footer is visually crowded.

## Visual Verification Coverage

Current VHS/screenshots proving the shared interaction/menu work:

- Header global actions: `semantic_header_actions.tape` with
  `semantic_header_actions_base.png`, `semantic_header_actions_help.png`, and
  `semantic_header_actions_settings.png`.
- Settings/TUI controls and list tabs: `semantic_settings_lists.tape` with
  `semantic_settings_agent.png`, `semantic_settings_theme.png`,
  `semantic_settings_tui.png`, and `semantic_settings_language.png`;
  `semantic_settings_agent_compact.tape` covers the visible Agent side rail in
  a constrained viewport.
- Help, Doctor, Metrics, and tool catalogs: `semantic_menu_smoke.tape` with
  `semantic_menu_help_commands.png`, `semantic_menu_doctor_health.png`,
  `semantic_menu_doctor_capabilities.png`, `semantic_menu_metrics.png`,
  `semantic_menu_tools_catalog.png`, and `semantic_menu_tool_detail.png`.
- Provider setup: `semantic_provider_setup.tape` with
  `semantic_provider_setup.png` and `semantic_provider_setup_provider_changed.png`.
- Catalog/file/workspace/MCP/selectable-list surfaces:
  `semantic_file_picker.tape`, `semantic_workspace_switch.tape`,
  `semantic_mcp_install.tape`, `semantic_mcp_remove.tape`, and
  `semantic_palette.tape`.
- Transcript/detail/context workflows: `semantic_context_detail.tape`
  (refreshed after compact detail-pane sizing),
  `semantic_context_actions.tape`, `semantic_diff_actions.tape`,
  `semantic_conversation_actions.tape`,
  `semantic_conversation_footer_actions.tape`,
  `semantic_conversation_block_copy.tape`, and `semantic_detail_copy.tape`.
- Memory/context inspector: `semantic_memory_inspector.tape` with
  `semantic_memory_palette.png` and `semantic_memory_inspector.png`, using the
  local emulator's `/v1/memory/stats` endpoint instead of live CLIO state.
- Sidebar/filter/footer/session actions: `semantic_sidebar_filter.tape`,
  `semantic_sidebar_footer_actions.tape`, and
  `semantic_session_actions.tape`.
- Permission and startup states: `semantic_permission_banner.tape`,
  `semantic_startup_intro.tape`, `semantic_startup_connecting.tape`, and
  `semantic_startup_error.tape`.

## Implementation Record

### `codex/mouse-hardening` pass 1

Implemented a shared overlay-first mouse dispatch layer in
`tui/internal/ui/mouse.go`. Mouse wheel and click events now use the same
topmost-first ordering as `viewMain`, so open overlays do not leak events into
the sidebar/body/input beneath them.

Covered handlers:

- Detail view: wheel scrolls detail content; outside click closes the modal.
- Workspace switcher: wheel changes selected workspace; click row switches.
- Quit confirmation: click option chips; outside click chooses `no`.
- Palette: wheel changes selection; click command/search row activates it;
  outside click closes.
- Help: click tabs; outside click closes.
- File picker: wheel changes selected file; click row inserts the file ref.
- Catalog browser: wheel changes selected row; click item/description rows
  activates the same drill-down/details path as Enter.
- MCP remove: click server row removes it; outside click cancels.
- MCP install, rename, context-add, compose: outside click cancels; inside
  clicks are swallowed so base panes are not targeted accidentally.
- Settings: click tabs, click selectable rows, wheel selected rows.
- Metrics, doctor, LM config: outside click closes; doctor tabs are clickable.
- Input pane: when mouse mode is enabled, a compact `/` chip is rendered next
  to the prompt and clicking it opens the normal command palette.

Added regression tests in `tui/internal/ui/mouse_scroll_test.go` for:

- Overlay clicks not leaking into base sidebar focus/toggles.
- Detail wheel routing not changing conversation scroll state.
- Catalog hit-testing accounting for description rows.
- File picker row click inserting the clicked path.

Remaining follow-up candidates:

- Text selection inside custom single-line editors and textareas.
- Scoped copy/paste semantics for transcript, detail, and input/compose surfaces.
- Specialized transcript actions such as accept/reject, retry, delete, and copy.

### `codex/semantic-menu-interactions` follow-up

Additional work continued from the same architectural direction:

- Settings TUI option rows now register semantic targets for visible `left` and
  `right` controls, so mouse clicks adjust the same values as keyboard arrows.
- Text-entry style modals, MCP install/remove, and quit confirmation use shared
  header actions for close/back/apply-style controls instead of mixing centered
  body chips with header buttons.
- Footer settings/help/command affordances register semantic hit targets when
  they are visible. Header settings/help affordances now render as stable
  top-right action cells with semantic hit targets from the same action list.
- Tool catalog list rows were made denser by removing repeated command-name
  descriptions from the list view; richer information remains in detail views.
- Conversation wheel handling now routes through the rendered conversation body
  region. Wheel events outside the transcript no longer move the transcript,
  while wheel events over long transcript content scroll by visual lines and can
  return to the true bottom.
- Help, metrics, and doctor now share a reusable scrollable modal-frame helper
  for body windowing, range hints, modal shell rendering, and body wheel target
  registration. This keeps text-heavy informational views from each owning
  separate scroll/body geometry.
- Shared modal-frame header buttons are passive by default; selected/highlighted
  header actions are now explicit opt-in. This keeps ordinary close/back
  controls visually consistent and right-aligned while preserving the highlighted
  quit-confirmation choice.
- The command palette now surfaces `/memory` capability status inline (`ARC
  context` when supported, `unsupported` when the backend lacks memory), so
  memory/context inspection does not look like a generic runnable command with a
  hidden failure mode.
- Top-right global actions now render as explicit `help` and `settings` labels
  rather than symbolic-only cells, while keeping the same semantic mouse hit
  targets.
- Tool catalog summaries now drop descriptions that only repeat the command
  name, leaving row space for source, server, tags, and visibility metadata.
- The shared scrollable modal-frame helper now owns hit-target layering for
  body wheel regions, tabs, and header buttons. Help, metrics, and doctor no
  longer suppress and manually re-register their controls just to keep them
  clickable above the scroll surface.
- Selectable modal lists now share `registerModalListRegion`, which registers
  row clicks and list wheel targets together from the rendered list geometry.
  Palette, catalog, file picker, workspace switcher, and MCP removal use this
  primitive instead of each hand-wiring row and wheel rectangles.
- Settings row and arrow controls now reuse shared modal hit primitives
  (`modalListHit` and `modalCellHit`) instead of private settings-only hit
  structs, keeping list rows and inline left/right controls aligned through the
  same render-relative registration model.
- Provider setup hit registration now uses the shared list/cell primitives for
  provider rows, model rows, OAuth/auth action, advanced left/right controls,
  and save action. The multi-column provider layout remains custom, but its
  mouse geometry no longer bypasses the shared hit-target model.
- Detail/raw-evidence modals now render through the shared scrollable modal
  frame, so range hints, body wheel regions, and close/back button layering use
  the same primitive as help, doctor, and metrics.
- Layered modal surfaces now have a shared frame helper that registers the
  click-absorbing surface before re-registering header tabs/buttons above it.
  The command palette and message-search palette use this instead of manually
  suppressing and re-adding close button hit targets.
- Settings now registers body wheel handling and selectable rows through the
  shared modal list-region primitive, so theme/language/agent/TUI rows and
  body scrolling share one render-derived geometry path.
- Provider setup section wheel regions now use `registerModalWheelRegion`, so
  provider, model, and advanced multi-column scrolling no longer calls the
  low-level modal content wheel API directly.
- Provider setup provider/model/advanced wheel targets now register through a
  shared box wheel-region helper, keeping wheel zones tied to the same box
  height policy as rows, cells, and rails.
- Shared modal action buttons now use a wider global inter-button gap, so
  paired header/action chips get consistent breathing room across provider,
  quit, settings, help, doctor, and detail-family modals from one primitive.
- Sidebar session rows now register render-time semantic targets, including
  one-line expanded child/nanoagent rows. Session selection and selected-parent
  child collapse/expand both route through one shared action instead of
  duplicating coordinate-derived behavior.
- The mouse-mode input `/` chip now registers a render-time `input:command`
  target, and footer, keyboard, semantic mouse, and compatibility click paths
  all open the command palette through the same helper.
- Sidebar section headers now share `activateSidebarSection`; the sessions
  header registers a render-time `sidebar:sessions:header` target and the
  context header and keyboard toggle use the same action.
- Memory inspector details now open as standalone palette details instead of
  being dropped by the catalog-only detail guard. The inspector surfaces ARC
  cache stats, current session pressure, transcript evidence counts, tool
  call/result/error counts, and retained compaction-summary evidence.
- Modal list description wrapping now avoids double-indenting continuation
  rows, keeping catalog/settings/provider descriptions within the rendered
  modal width instead of producing short awkward line breaks.
- Tool catalog rows now use a compact operational summary built from existing
  backend metadata (`owner`, `permission_default`, input schema field names,
  and tags). Command-name echo descriptions and long agent-story prose stay
  out of the list view; full descriptions/schema remain available in detail.
- Standard and wide modal widths now share one sizing policy. Provider setup
  and expanded compose use the shared wide-modal width instead of separate
  viewport formulas, while settings/catalog/detail/memory keep the standard
  width.
- Row-local session, context, and conversation action menus now share
  `action_menu.go` for selection movement, close/key semantics, rendered list
  rows, wheel targets, close button registration, and semantic row hit ids.
  Each surface only defines domain-specific actions and context labels.
- Base sidebar, conversation, and input panes now register broad semantic focus
  surfaces during render, so `handleMouseClick` no longer contains coordinate
  fallback logic for sidebar rows, section headers, body focus, or the input `/`
  chip. Overlay clicks are constrained to overlay-registered targets before
  base-pane targets can react underneath.
- Shared scrollable modal frames now register semantic side-rail click targets,
  so detail, help, doctor, and metrics panes can jump within long content
  through the same scrollbar primitive instead of adding per-view handlers.
- Shared selectable-list modal frames now register semantic side-rail click
  targets, so long palettes, catalogs, file pickers, workspace lists, and MCP
  removal lists can jump selection through the same rendered scroll affordance.
- LM provider/model setup boxes now render side rails instead of textual
  `more` rows and register semantic rail targets through the shared modal
  index-rail primitive, jumping provider/model selection through the filtered
  list without per-column rail math.
- Doctor and metrics detail rows now share `registerScrollableModalRowHits`,
  which clips row actions to the visible scroll window and registers them
  relative to the shared modal frame instead of each view owning row
  intersection math.
- MCP install example rows now use shared modal cell hit registration, so
  text-entry examples, settings controls, and provider setup cells all route
  through the same render-relative primitive instead of one-off modal
  coordinate calls.
- Main input cursor placement now uses the shared screen textarea cursor
  primitive, matching the modal textarea cursor model used by expanded compose
  instead of hand-registering per-cell input hits in the base mouse layer.
- Main input cursor placement now routes through the matching screen
  textarea-region helper, keeping base-input and modal-compose text areas on
  parallel primitives for future selection/copy work.
- Expanded compose now registers cursor placement and wheel movement through a
  shared modal textarea-region primitive, giving future modal text selection or
  scoped copy work one target model instead of compose-specific hit wiring.
- Expanded compose now has scoped copy through a shared header action, copying
  only the draft text instead of relying on terminal-frame selection that
  includes borders, sidebars, and footer chrome.
- Compressed paste placeholder clicks now use a shared screen text-span hit
  primitive, keeping inline input targets on reusable text geometry instead of
  embedding span rectangle math in the mouse layer.
- Footer plain/action hit targets now use the same shared screen text-span
  primitive as input paste placeholders, removing duplicate one-line text
  rectangle construction from the footer layer.
- Top-right header action hit targets now use the shared screen text-span
  primitive, so the visible `help`/`settings` cells and footer/input inline
  targets share one text geometry path.
- Header status/workspace/session/model/agent/routing chip targets now use the
  same shared screen text-span primitive as header actions and footer hints,
  removing another top-chrome raw rectangle path.
- Sidebar section headers, session rows, filter rows, context rows, and counts
  now share sidebar content hit helpers, centralizing row-to-screen geometry
  and preserving existing primary/right-click semantic actions.
- Conversation parts, detail hints, diff actions, and body wheel targets now
  share conversation content hit helpers, centralizing transcript pane geometry
  while preserving existing selection, detail, action-menu, and scroll behavior.
- Permission banner action targets now share a banner-specific action geometry
  helper, preserving the visible allow/deny/session/workspace cells while
  removing inline coordinate math from the action registration loop.
- The main input slash-command chip now uses the shared screen text-span
  primitive, and the input focus surface has a pure geometry helper covered by
  regression tests instead of keeping all base-input coordinate math inline.
- Startup connecting retry and intro continue clicks now use a shared
  full-screen surface hit primitive with viewport-geometry coverage, instead
  of each startup view registering its own raw screen rectangle.
- Sidebar, conversation, and input focus surfaces now share a focus-surface
  registration primitive with tested pane geometry, so base-pane focus clicks
  no longer each own separate focus/action registration closures.
- Permission banner action cells now use clipped screen text-span hit
  registration, tying allow/deny/session/workspace clicks to the rendered
  labels while preserving clipping at the pane content edge.
- Settings Agent rows now pre-trim generated `Common tools:` tails from the
  one-line list summary and clip secondary text before styling, keeping noisy
  extracted-agent metadata in the detail region instead of wrapping awkwardly
  inside the list row.
- Added a deterministic emulator-backed memory inspector VHS path so the ARC
  memory/context drill-down is covered by semantic screenshots, not only live
  ALCF captures and unit tests.

### 2026-05-26 user-observed follow-up queue

- Continue visual polish for modal close/back controls as new overlays are
  added. Current shared header controls are verified by the semantic screenshots
  above; regressions should be treated as bugs in the shared modal primitives.
- Continue watching wrapped modal/list text. Existing catalog/settings/provider
  rows use shared wrapping and dense metadata summaries, but new rows should not
  reintroduce repeated command-name descriptions or double-indented continuation
  lines.
- Tool catalog rows should stay dense. Do not spend list-view space repeating
  the command name as its own description; use row space for source, server,
  visibility, owner/agent, permission, tags, schema, or error/capability state.
- True text/range selection remains a product-level design task. Existing
  scoped copy actions now cover selected transcript blocks, full transcript,
  detail payloads, and main-input paste expansion without requiring terminal
  frame selection.
- Compose and detail copy now share a scoped clipboard helper that preserves
  exact payload text, rejects empty content, and surfaces clipboard failures
  through the visible hint path instead of each modal hand-rolling those
  semantics.
- Sidebar session ID, selected transcript block, full transcript, `/copy`,
  context path, and context metadata copy flows now use the same exact-text
  helper as compose/detail while preserving their domain-specific success and
  empty-state hints.
- Help modal tabs now all render their key/description rows through the shared
  modal list primitive; the Commands tab keeps its clickable command-staging
  rows, while the other tabs share the same dense row layout without custom
  key-list rendering.
- Shared text-entry modals now register named overlay surface wheel blockers,
  giving rename, context-add, and MCP-install the same semantic chrome wheel
  target model as scrollable/list modals while keeping editor cursor hits and
  button actions unchanged.
- Expanded compose now also registers a named modal surface wheel blocker
  before its textarea wheel target, so chrome wheel events are captured through
  the shared overlay-surface model while the editor body still receives
  textarea-specific wheel movement.
- Settings > TUI stepper rows now have a regression that clicks the actual
  rendered left/right arrow glyphs for every editable row, not just the
  abstract target rectangle, so future geometry drift between visible controls
  and semantic mouse hit targets is caught directly.
- The overlay dispatcher no longer exposes unused per-overlay click/wheel
  callback hooks. Overlay-specific interactions now have to register semantic
  hit targets during render, with the shared overlay table only handling
  validation and outside-click close policy.
- Shared text-entry modals now own clickable intro-list rows as well as editor
  cursor hits, status cell hits, header buttons, and surface wheel blockers.
  MCP install examples moved onto that primitive instead of registering their
  list hits after the modal was rendered.
- A production modal-family regression now verifies settings, help, doctor,
  metrics, provider setup, catalogs, detail, quit, palette, workspace, MCP,
  rename, context-add, and compose overlays share the same top-left origin and
  width. Provider setup's body budget was tightened so it no longer grows tall
  enough to shift upward at the shared desktop viewport.
- The connection-error screen now exposes its shared modal body separately from
  the full-screen overlay composition, so startup/backend errors are covered by
  the same production modal origin/width regression while still surfacing the
  real error text and retry/quit actions.
- Connection-error retry/quit buttons now have explicit regression coverage
  that their clickable hit targets sit on the shared modal header action row,
  matching the visual placement used by the other modal close/back controls.
- Shared modal lists now support column-local hit geometry for dense one-line
  lists. Help > Commands uses that shared primitive to render command entries
  in two columns at normal modal widths, using more of the modal body while
  preserving click-to-stage semantics for each visible command cell.
- Catalog browsers now use a compact shared body height when the visible
  catalog fits without scrolling, while overflowing catalogs keep the full
  scroll body and side-rail affordance. This preserves the shared top-left
  origin and width policy without leaving short tool catalogs half empty.
- Doctor and Metrics now share a compact scrollable-body sizing helper for
  short snapshots. Their top-left origin and modal width remain stable, while
  dense/overflowing capability or metrics bodies still use the bounded scroll
  window and side-rail affordance.
- Detail/evidence panes now use the same compact scrollable-body sizing policy.
  Short diff, memory, context, and raw-evidence payloads keep the shared modal
  origin and width without a half-empty tall body, while long payloads still
  retain bounded scrolling, copy, and side-rail behavior.
- The representative current-build visual refresh on 2026-05-27 reran provider
  setup, menu smoke, context detail, and long-transcript scroll tapes, then
  rebuilt and installed `58926d51c01a`. The long-transcript tape now waits for
  the session to settle to `idle` before taking bottom/scroll-up/`G`/PageDown
  screenshots, so the reattachment evidence is no longer captured mid-stream.
