# TUI Mouse Interaction Audit

Date: 2026-05-25
Branch inspected: `codex/semantic-menu-interactions`
Scope: audit plus implementation tracking for the semantic interaction migration.

## 2026-05-26 Implementation Notes

- Overlay outside-click behavior now uses a shared `mouseOverlay` policy table for common close-on-outside modals, with explicit exceptions for quit confirmation and invalid nil-state overlays. This removes the old spread of near-identical coordinate handlers.
- Settings > TUI rows now register full rendered-row hit targets and separate semantic value/left/right controls for every editable row, not just the collapse-threshold row.
- LM provider setup now registers mouse focus targets for provider/model filter headers, API key, API base, refresh, advanced controls, provider/model rows, auth, save, and close.
- Short tabbed/scrollable modal bodies now pad to a stable body budget so Help, Doctor, Metrics, Settings, and the command palette do not resize dramatically when changing tabs or filtering to fewer rows.
- Palette command rows now avoid showing the command name again as the description; they prefer useful descriptions, then non-duplicate titles, then source fallback.
- Scrollable modals now use a shared side rail/thumb instead of footer/title line-range text, and the catalog browser reuses that affordance instead of adding textual `above` / `more` rows.
- Rename, add-context, and MCP-install now share a single-line text-entry modal primitive for editor prompt rendering, cursor styling, status rows, footer text, and header button geometry.
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
- Permission banner actions now register semantic hit targets for allow, deny, session allow, and workspace allow.
- The intro splash now has a full-screen semantic continue target, and the connection error screen uses the shared modal/button shell for retry and quit actions.
- Transcript detail affordance rows such as `raw detail · Ctrl+E` now register semantic hit targets that open the detail modal directly; whole-block clicks still select first and open on a second click.
- Sidebar footer counts now register a semantic hit target and toggle active/archived sessions through the same path as the `h` key.
- Sidebar filtering now has semantic mouse entry points: the visible footer `f filter` hint starts filter editing, the filter-mode footer exposes clickable apply/cancel targets, and an existing filter row can be clicked to re-enter editing while preserving Esc restore semantics.
- Header chips now register render-time semantic targets: backend opens metrics, workspace opens the workspace switcher, session focuses the selected sidebar row, model/routing open model settings, agent opens agent settings, and status opens Doctor when integration health is supported.
- Footer focus and visible `Tab pane` hints now register semantic targets that cycle focus through the same helper used by keyboard Tab.

Verified in this pass with focused interaction tests, the full Go suite, rebuilt `tui/gact`, and VHS screenshots under `visual_loop/screenshots/` for settings, provider setup, text-entry, palette, and catalog/menu surfaces.

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
copy/text-selection semantics, a few specialized transcript actions, sidebar
filter editing, and richer global/status affordances.

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

Remaining gaps:

- No right-click/context-menu behavior for session actions such as rename,
  archive, delete, copy session id, add context.

### Conversation Body

Mouse support exists:

- Click visible addressable parts to select them.
- Click the selected part again to open detail.
- Click visible detail affordance rows such as `raw detail · Ctrl+E` to open detail directly.
- Wheel scrolls the transcript through render-time body-region routing.

Missing:

- Click file diff accept/reject affordances.
- Click retry/delete/copy actions.
- Select text or copy block via mouse.

### Input

Mouse support exists:

- Click focuses input.
- Click visible text positions to place the cursor.
- Click the mouse-mode `/` chip to open the command palette.

Missing:

- Text selection.
- Click send if a send affordance is added later.
- Click compressed paste placeholder to expand/review.
- Click `@` file references or attached-context chips if surfaced.

### Header/Footer

Mouse support exists:

- Top-right header help/settings actions are semantic targets.
- Visible footer settings, command, help, and quit hints are semantic targets.
- Click the footer focus label or visible `Tab pane` hint to cycle focus.
- Click header backend/workspace/session/model/agent/routing/status chips to drill into the matching existing modal or focus target.

Missing:

- Click reconnect/error/status affordances.

### Permission Banner

Mouse support exists:

- Click Allow, Deny, Allow session, Allow workspace.

Keyboard support exists through `a/d/s/w`.

### Intro, Connecting, And Error Screens

Keyboard behavior:

- Intro dismisses on keypress.
- Connecting generally waits.
- Error screen supports quit/retry keys.

Mouse gaps:

- Connecting has no click affordance; it generally waits.

## Overlays And Popups

### Slash Command Palette

Keyboard behavior:

- `Esc`/`Ctrl+C` close.
- Up/down select.
- Enter executes command or search result.
- Typing filters.

Mouse support exists:

- Click command/search result rows to select and execute.
- Wheel scrolls long result lists.
- Click outside/close uses the shared overlay policy.

Remaining gaps:

- Click filter field/cursor positioning is not applicable today but would matter
  if the filter becomes an editable field with cursor.

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
- Click close through the shared modal shell.

Remaining gaps:

- Drag/click scrollbar if one is later rendered.
- Select/copy text or click raw paths/artifacts.

### Metrics Modal

Keyboard behavior:

- Esc/Ctrl+T close.
- `r` refresh.

Mouse support exists:

- Click close.
- Click refresh.
- Wheel scrolls if metrics overflow.

Remaining gaps:

- Click provider/route rows if detail drill-down is added.

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

Remaining gaps:

- Click individual integration/capability rows for detail if later added.

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
- Backspace/delete edit.
- Left/right/Home/End move cursor.
- Printable text edits.

Mouse support exists:

- Click inside text field to place cursor.
- Click save/cancel.
- Click outside to cancel through the shared overlay policy.

Remaining gaps:

- Select text.
- Click mode affordance if mode selection becomes interactive.

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

Remaining gaps:

- Select text.
- Click example lines to prefill or copy if that is desired.

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

3. Lists now have consistent hit-testing and wheel behavior for palette,
   settings, catalog, file picker, workspace rows, MCP remove rows, and LM
   provider/model lists.

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
   action so users can copy transcript content without UI chrome.

9. Some wrapped content wastes horizontal space. Long catalog/tool/config rows
   sometimes break after only a few words while the modal still has room. Modal
   body rendering should prefer semantic wrapping with the actual inner width,
   avoid repeated command-name descriptions, and use available space for
   meaningful metadata. Tool catalogs in particular should not repeat the
   command name as a description; the list view should stay dense and reserve
   detail text for metadata that helps users choose or diagnose the tool.

10. Header/footer global affordances now include clickable settings, help,
    command, quit, backend, workspace, session, model, agent, routing, and
    status entry points. Remaining reconnect/error affordances still need richer
    drill-down behavior.

11. TUI options/configuration controls now have mouse parity for row selection,
    left/right adjustments, apply/save/cancel, and backward navigation. Continue
    verifying rendered hit targets with screenshots when new options are added.

12. Copy semantics should be scoped, not terminal-frame dependent. Add a task
    for transcript/detail copy blocks: selected message, selected tool result,
    selected raw detail, and input textarea paste should work without copying
    sidebar borders, divider glyphs, and footer text.

13. Text-entry paste/copy parity is still unresolved. Mouse mode should not
    make paste into the regular input or expanded compose textarea worse, and
    users need a way to copy conversation/detail content without selecting the
    sidebar, borders, and footer. Treat this as a product task, not a terminal
    accident.

## Suggested Implementation Order For Later

1. Add an overlay-first mouse dispatcher that mirrors `handleKey` precedence.
   It should route to `handleXMouse` for the topmost open modal.

2. Normalize modal geometry: helpers for centered modal origin, inner width,
   title/header rows, list row ranges, footer/hint rows.

3. Implement list-row click/scroll for the high-use picker/list modals:
   palette, catalog browser, file picker, workspace switcher, settings tabs.

4. Implement button/chip clicks: quit confirmation, settings tabs, LM config
   save/auth, MCP install/remove, close/cancel affordances.

5. Implement detail-view wheel scrolling before adding richer text selection.

6. Decide whether mouse text editing is in scope. If yes, start with textarea
   surfaces (`input`, `compose`) and then add minimal cursor hit-testing for
   custom single-line editors.

7. Add a copy-mode/copy-block design for conversation content so copying raw
   evidence, assistant text, tool summaries, and detail panes does not require
   selecting the entire terminal frame.

8. Add top-chrome settings/help targets after the footer targets have proven
   stable, so mouse users have a predictable global entry point even when the
   footer is visually crowded.

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

- Rich mouse cursor placement inside custom single-line editors
  (`rename`, `context-add`, `mcp-install`) and textareas (`input`, `compose`).
- LM config list row hit-testing for provider/model rows and save/auth buttons.
- Richer LM config hit-testing for provider/model row clicks and save/auth
  buttons. The current pass at least prevents leaks and supports outside
  dismissal.

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
- Sidebar session rows now register render-time semantic targets, including
  one-line expanded child/nanoagent rows. Session selection and selected-parent
  child collapse/expand both route through one shared action instead of
  duplicating coordinate-derived behavior.
- The mouse-mode input `/` chip now registers a render-time `input:command`
  target, and footer, keyboard, semantic mouse, and compatibility click paths
  all open the command palette through the same helper.
- Sidebar section headers now share `activateSidebarSection`; the sessions
  header registers a render-time `sidebar:sessions:header` target and the
  context header, keyboard toggle, and coordinate fallback use the same action.
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

### 2026-05-26 user-observed follow-up queue

- Modal close/back controls still need visual audit across every overlay.
  Header actions should be right-aligned and stable; centered body actions
  should be reserved for true confirmation choices. Any remaining mixed
  close/back placement is a bug, not a per-modal design decision.
- Wrapped modal/list text should use the available modal width. Avoid rows that
  break after only a few words while there is unused horizontal space, and avoid
  double-indented continuation lines in catalog, settings, help, and provider
  rows.
- Tool catalog rows should stay dense. Do not spend list-view space repeating
  the command name as its own description; use row space for source, server,
  visibility, owner/agent, permission, tags, schema, or error/capability state.
- Settings/TUI option controls need a visual-loop pass for mouse parity:
  left/right chips, row selection, save/close/back controls, and hit targets
  must match the rendered text at normal and narrow sizes.
- Header settings/help affordances exist in the current branch, but need a VHS
  capture at realistic widths to prove they remain visible and clickable rather
  than disappearing behind crowded session/model/provider chips.
- Copy/paste is an explicit product task. Mouse mode should allow paste into
  the normal input and expanded compose textarea without regressing terminal
  paste. Conversation/detail copy should offer scoped copy actions for selected
  message, selected tool/result, visible block, raw detail, and full transcript,
  so users do not have to select sidebar borders, divider glyphs, and footer
  hints from the terminal frame.
