# TUI Mouse Interaction Audit

Date: 2026-05-25
Branch inspected: `codex/visual-loop-sidebar-ux`
Scope: audit only. No mouse-support fixes are included here.

## Executive Summary

Mouse support is currently centralized in `App.handleMouseWheel` and
`App.handleMouseClick` in `tui/internal/ui/app.go`.

Current mouse support:

- Wheel up/down scrolls the conversation, but only when no blocking overlay is open.
- Click in the sidebar selects sessions, toggles sidebar sections, and toggles child/nanoagent expansion on the selected parent.
- Click in the conversation pane only changes focus to body.
- Click in the input pane only changes focus to input.

Most TUI windows and popups are keyboard-only. Several are explicitly blocked by
the global mouse handlers, so clicks and wheel events are ignored while those
windows are open.

The main blocking gates are:

- `handleMouseWheel`: returns immediately when help, palette, settings, metrics,
  workspace switcher, rename, context-add, detail, quit-confirm, doctor, or LM
  config is open.
- `handleMouseClick`: same blocking list.

Additional overlays are not in that blocking list (`compose`, `filePicker`,
`catalogBrowser`, `mcpInstall`, `mcpRemove`), but there is no overlay-specific
mouse dispatch for them. Clicks can therefore fall through to base-pane focus
behavior instead of interacting with the visible modal.

## Base UI Surfaces

### Sidebar

Mouse support exists:

- Click session rows to select/open that session.
- Click selected parent with children to expand/collapse nanoagents.
- Click `SESSIONS` or `CONTEXT` headers to collapse/expand.

Remaining gaps:

- No click support for sidebar filter editing.
- No click support for context file rows.
- No click support for sidebar footer/status counts.
- No right-click/context-menu behavior for session actions such as rename,
  archive, delete, copy session id, add context.

### Conversation Body

Mouse support is minimal:

- Click only focuses the body.
- Wheel scrolls the conversation only when no blocked overlay is open.

Missing:

- Click a message/block/part to select it.
- Double-click or click affordance to open raw detail.
- Click tool/result/detail hint such as `raw detail · Ctrl+E`.
- Click file diff accept/reject affordances.
- Click retry/delete/copy actions.
- Select text or copy block via mouse.
- Scroll wheel should probably apply only when pointer is over the conversation
  pane, not globally whenever messages exist.

### Input

Mouse support is minimal:

- Click only focuses input.

Missing:

- Cursor placement by click.
- Text selection.
- Click send if a send affordance is added later.
- Click compressed paste placeholder to expand/review.
- Click `@` file references or attached-context chips if surfaced.

### Header/Footer

No mouse support found.

Missing:

- Click focus labels or panes in footer.
- Click global shortcuts such as settings, command palette, help, quit.
- Click backend/workspace/session/status chips in header.
- Click reconnect/error/status affordances.

### Permission Banner

Keyboard support exists through `a/d/s/w`.

Missing:

- Click Allow, Deny, Allow session, Allow workspace.
- Mouse-visible hit zones for pending permission actions.

### Intro, Connecting, And Error Screens

Keyboard behavior:

- Intro dismisses on keypress.
- Connecting generally waits.
- Error screen supports quit/retry keys.

Mouse gaps:

- Click to dismiss intro.
- Click retry on error.
- Click quit/close on error.
- No mouse-specific handling was found for these stages.

## Overlays And Popups

### Slash Command Palette

Keyboard behavior:

- `Esc`/`Ctrl+C` close.
- Up/down select.
- Enter executes command or search result.
- Typing filters.

Mouse gaps:

- Click command/search result to select and execute.
- Hover or click row to move selection.
- Wheel scroll result list.
- Click outside to close.
- Click filter field/cursor positioning is not applicable today but would matter
  if the filter becomes an editable field with cursor.

Risk note: `paletteOpen` blocks global click/wheel handlers, so currently mouse
events are discarded while the palette is open.

### Help Overlay

Keyboard behavior:

- `?`, `Esc`, `Ctrl+C` close.
- Left/right/Tab switch tabs.

Mouse gaps:

- Click tabs.
- Click outside or close affordance.
- Wheel scroll if future tabs exceed visible height.

Risk note: `helpOpen` blocks global click/wheel handlers.

### Settings Modal

Keyboard behavior:

- `Tab`/`Shift+Tab` switch tabs.
- Up/down select rows in Agent, Theme, TUI, Language tabs.
- Left/right adjust TUI preferences.
- Enter opens provider config, applies theme/language, opens agent detail, or closes.

Mouse gaps:

- Click tabs: Model, Agent, Theme, TUI, Language.
- Click rows to select.
- Double-click or click row action to apply/open.
- Click TUI preference left/right controls or toggle rows.
- Click theme/language/agent rows.
- Wheel scroll long agent lists.
- Click close/cancel.

Risk note: `settingsOpen` blocks global click/wheel handlers.

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

Mouse gaps:

- Click provider/model filter/input fields.
- Click API base/API key fields.
- Text cursor placement and selection inside editable fields.

Risk note: `lmConfigOpen` blocks global click/wheel handlers.

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

Mouse gaps:

- Click row to select.
- Double-click or click row action to drill in/open detail.
- Click Back/Close.
- Click disabled toggle for tool rows.
- Wheel scroll catalog rows.
- Click install/remove actions.
- Breadcrumb/back behavior for detail views.

Risk note: `catalogBrowserOpen` is not in the global mouse-block list, but there
is still no catalog mouse handler. Clicks can fall through to base panes instead
of the visible modal.

### Detail View

Keyboard behavior:

- Esc/Ctrl+C/Ctrl+E close.
- Up/down scroll.
- PgUp/PgDn page.
- g/G jump top/bottom.

Mouse gaps:

- Wheel scroll detail content.
- Click close.
- Drag/click scrollbar if one is later rendered.
- Select/copy text or click raw paths/artifacts.

Risk note: `detailViewOpen` blocks global click/wheel handlers, so wheel does
not scroll the detail view today.

### Metrics Modal

Keyboard behavior:

- Esc/Ctrl+T close.
- `r` refresh.

Mouse gaps:

- Click close.
- Click refresh.
- Wheel scroll if metrics overflow.
- Click provider/route rows if detail drill-down is added.

Risk note: `metricsOpen` blocks global click/wheel handlers.

### Doctor Modal

Keyboard behavior:

- Esc/Ctrl+C/q close.
- r refresh.
- Tab/right/left switch tabs.

Mouse gaps:

- Click Health/Capabilities tabs.
- Click refresh.
- Click close.
- Wheel scroll if subsystem/capability rows overflow.
- Click individual integration/capability rows for detail if later added.

Risk note: `doctorOpen` blocks global click/wheel handlers.

### Workspace Switcher

Keyboard behavior:

- Esc/Ctrl+C cancel.
- Up/down select.
- Enter switch.

Mouse gaps:

- Click workspace row to select/switch.
- Wheel scroll if workspace list exceeds modal height.
- Click current workspace or cancel/close.

Risk note: `workspaceSwitchOpen` blocks global click/wheel handlers.

### Rename Session Modal

Keyboard behavior:

- Esc/Ctrl+C cancel.
- Enter save.
- Backspace/delete edit.
- Left/right/Home/End move cursor.
- Printable text edits.

Mouse gaps:

- Click inside the text field to place cursor.
- Select text.
- Click save/cancel.
- Click outside to cancel.

Risk note: `renameOpen` blocks global click/wheel handlers.

### Add Context Modal

Keyboard behavior mirrors rename:

- Esc/Ctrl+C cancel.
- Enter save.
- Backspace/delete edit.
- Left/right/Home/End move cursor.
- Printable text edits.

Mouse gaps:

- Click inside text field to place cursor.
- Select text.
- Click save/cancel.
- Click mode affordance if mode selection becomes interactive.
- Click outside to cancel.

Risk note: `contextAddOpen` blocks global click/wheel handlers.

### Compose Modal

Keyboard behavior:

- Ctrl+S/Ctrl+Enter commit.
- Esc cancel.
- Other keys go to inner textarea.
- Paste is routed to the compose textarea.

Mouse gaps:

- Click textarea to place cursor.
- Select text.
- Wheel scroll textarea content.
- Click commit/cancel.
- Click outside to cancel.

Risk note: `composeOpen` is not in the global mouse-block list. There is no
compose mouse handler, so clicks may fall through to base focus changes.

### File Picker

Keyboard behavior:

- Esc/Ctrl+C close.
- Up/down select.
- Enter insert selected file.
- Backspace edits filter.
- Printable text edits filter.

Mouse gaps:

- Click file row to select/insert.
- Wheel scroll result list.
- Click filter field.
- Click close/cancel.

Risk note: `filePickerOpen` is not in the global mouse-block list. There is no
file-picker mouse handler, so clicks may fall through to base panes.

### MCP Install Modal

Keyboard behavior:

- Esc cancel.
- Enter install.
- Backspace edits.
- Printable text edits input.
- While saving, all keys are ignored.

Mouse gaps:

- Click input field to focus/place cursor.
- Select text.
- Click install/cancel.
- Click example lines to prefill or copy if that is desired.

Risk note: `mcpInstallOpen` is not in the global mouse-block list. There is no
MCP-install mouse handler, so clicks may fall through to base panes.

### MCP Remove Modal

Keyboard behavior:

- Esc cancel.
- Up/down select.
- Enter remove.
- While saving, all keys are ignored.

Mouse gaps:

- Click server row to select/remove.
- Wheel scroll list.
- Click cancel/close.

Risk note: `mcpRemoveOpen` is not in the global mouse-block list. There is no
MCP-remove mouse handler, so clicks may fall through to base panes.

### Quit Confirmation Modal

Keyboard behavior:

- Esc dismisses.
- Left/right select option.
- y/n/d immediately apply close/no/detach.
- Enter applies selected option.
- Ctrl+C applies selected option.

Mouse gaps:

- Click `close`, `no`, or `detach` chips.
- Click outside/close to dismiss.

Risk note: `quitConfirmOpen` blocks global click/wheel handlers.

## Cross-Cutting Problems

1. There is no overlay-level mouse dispatch. Mouse handling is global and
   base-layout oriented, while key handling has a layered modal dispatch.

2. The blocked overlay list is incomplete. Some overlays block mouse explicitly;
   others let clicks fall through to the base UI:
   - Explicitly blocked: help, palette, settings, metrics, workspace switcher,
     rename, context-add, detail, quit-confirm, doctor, LM config.
   - Not explicitly blocked but no mouse support: compose, file picker, catalog
     browser, MCP install, MCP remove.

3. Rendered modal geometry is not retained. Most views compute rows locally and
   return a styled string. Mouse support will need hit-test helpers that share
   row/column math with renderers, or a small layout registry generated during
   render.

4. Lists need consistent hit-testing and wheel behavior. Repeated list patterns:
   palette rows, settings rows, catalog rows, file picker rows, workspace rows,
   MCP remove rows, LM provider/model lists.

5. Text-entry modals need a policy. Rename/context-add/MCP install use custom
   single-line editors, while input/compose use `textarea.Model`. Mouse cursor
   placement may be easy for textarea only if the component exposes mouse
   handling; custom editors need their own hit tests.

6. Scrollable surfaces need target-aware wheel routing:
   - Conversation body.
   - Detail view.
   - Catalog browser.
   - Settings lists.
   - LM provider/model lists.
   - File picker.
   - Potentially metrics/doctor/help if content grows.

7. Modal controls are visually inconsistent. Some close/back actions are
   rendered as centered action-row chips while others are right-aligned header
   buttons. Back, close, cancel, apply, refresh, install, remove, and detach
   should use one visual/action model unless a modal has a strong reason to
   differ. Current direction: header actions should be stable and right aligned
   for mouse targets; centered chips should be reserved for rare primary
   decisions that truly belong in the body.

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

10. Header/footer global affordances are still keyboard-only. Mouse mode should
    expose clickable settings/help entry points in the top/right chrome or a
    similarly stable global location.

11. TUI options/configuration controls need parity between keyboard and mouse.
    Left/right adjustments, row selection, apply/save/cancel, and backward
    navigation should all be addressable through visible mouse targets. Click
    regions must match the rendered row positions; earlier language clicks were
    observed selecting rows above the visible label.

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
