# Settings shared parts

Section bodies (Models, Tools, Memory, …) are built only from these parts.
Spec: `docs/design/visual-language/settings.html`; letters below match its
part labels. Extend a part in place when a section needs more; never fork it.
Paths are under `web/src/`.

## Window and navigation (owned by S3)

| Part            | Path                                                                                | Notes                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings window | `routes/settings-window.tsx` `SettingsWindow`                                       | Mounts over the workspace through `WindowShell`; closes with × / Esc or browser Back. It is one history entry: sections replace it, and closing goes back past it. Sections load lazily. |
| Section switch  | `routes/settings-page.tsx` `SettingsSection({ section, sessionId?, workspaceId? })` | Maps a section id to its body. Add or rename a body here only.                                                                                                                           |
| Nav entries     | `lib/application-destinations.ts`                                                   | `{ id, label, group: 'App' \| 'Workspace' \| 'Agent', icon, keywords }`. Keywords feed Ctrl K and the Settings filter.                                                                   |
| Route helpers   | `lib/settings-window-route.ts`                                                      | `isSettingsRoute`, `matchingSettingsSections`, `arrivedFromSearch`.                                                                                                                      |
| Scope           | `lib/settings-scope-context.ts` `SettingsScopeContext`                              | `{ group, line }`, the scope line shown under the page title.                                                                                                                            |
| Anchor          | `data-settings-anchor="<id>"`                                                       | Put it on a sub-block that has its own nav id or search hit. The window scrolls to it and highlights it.                                                                                 |

## Page parts

**`SettingsSectionHeading`** `components/clio/settings-section-heading.tsx`
`{ title, description?, info?, eyebrow?, level?: 1 | 2, actions? }`. Every
page renders exactly one `level={1}` heading, the page h1.

**`SettingsRow`** (B) `components/clio/settings-row.tsx`
`{ title, description?, info?, note?, error?, children, htmlFor?, inlineControl?, wideControl?, fullWidth?, dirty? }`.
The label column sits on the left and the control on the right. Use `inlineControl` for a
switch. Use `wideControl` for a control that can outgrow the 52% column, such as a
segmented choice with many options: it sits beside the label while both fit and drops
under it, left-aligned, when they don't, so it never covers the label. Following the spec (`.xrw{width:60%}`), a row takes 60% of a wide content column,
with no rem cap, and its control column is 52% of the row. Wrappers that stand in for rows
(group labels with a control, a save bar under rows) use the same `SETTINGS_COLUMN` class
from `lib/settings-fold.ts`. It applies 60% from a 36rem container, so the 41rem content
column of an unfolded window at 1024 px is already 60%, and full width once the window
folds below 1024 px. Item lists, tables and list-detail panes fill the column. A
`DetailPane` body is its own container, so rows inside size to the pane, not to the list.
`fullWidth` keeps the whole width for a
wide control (a path or a long select). `dirty` marks a value that is still waiting in the save bar. The description sits
behind the ⓘ beside the title, together with provenance and effect. Rows turn two-column
from a 20rem container, like the spec's 322 px rows in a 360 px dialog, and stack below it. Text and
number inputs placed in the control get the spec field (`.xf`) automatically: 30 px,
12.5 px, 6 px radius; number inputs are right-aligned mono. Don't restyle them per section.

**`SettingsGroupLabel`** (same file)
`{ children, info?, onAdd?, addLabel?, actions?, className? }`. A small group caption
above a block of rows. `info` is an ? right after the label. The first label sits 16 px
under the page heading, as the spec's `.xgl` does. Keep the page wrapper in block flow so
the heading's and label's margins collapse; inside a flex or grid wrapper (such as
`ListDetailLayout`) give the first label `mt-2` instead. `onAdd` renders a + icon button at the right. Use
`SplitButton` (`primitives/split-button.tsx`) for the page-level Add with
alternatives, which has a right-aligned arrow.

**`SettingsChoice`** (same file)
`{ id, label, value, onChange, options: { value, label, description?, icon? }[] }`.
A choice that applies at once, so it never reaches the save bar. In a row narrower than
28rem, options with an icon show only the icon, with the name on hover and as the
accessible name (Appearance → Theme at 390 px).

**`ItemRow` / `ItemList`** (D) `components/clio/primitives/item-row.tsx`
`ItemRow { icon?, title, meta?, status?, actions?, actionsVisible?, foldActions?, slot?, confirm?, statusWidth?, actionsWidth?, slotWidth?, selected?, size?: 'default' | 'sm' | 'line' }`
plus div attributes. Use it for providers, servers, plugins, agents, schedules and rules. The
status, actions and slot columns have fixed widths that every row in an `ItemList`
`{ children, label?, className? }` shares. Status is a `StatusIndicator` (its mark plus
a word), never a bare dot. Settings lists keep the default widths (status 158, actions 104,
slot 84 px) so the status word sits at the same x on every page; don't pass per-section
widths. A column whose prop is `undefined` collapses, so pass `null` to keep an empty one
aligned. Below 42rem of list width the status column narrows to at most 9.875rem, the spec's 158 px. Hover
actions keep their own column after the status, as in the spec, so they never cover the
name or meta. Below 36rem that column would squeeze the name under about 150 px, so the
actions float over the end of the name instead, left of the status. Below 24rem (a phone) a
two-line row stacks like a setting row: the status, or the `confirm` cell, drops under
the name. Hover actions never show on a touch screen, so a row whose last action is a ⋯
menu holding every action passes `foldActions`: on a phone the other actions fold into
that ⋯, which stays visible in its own column next to the name, as the spec's narrow rows
do; on a touch screen with room for the actions column they stay visible there. Sections don't set their
own max width. `confirm` is an inline confirmation ("Remove this rule?",
Keep, Remove) that replaces status, actions and slot with one cell across them.

The shared one-line row (X5) is `size="line"`: 30 px, a 15 px icon, the name at 12.5 px
and the meta in faint 11.5 px on the same line, shrinking first. Pickers, menus,
Infrastructure and dense Settings lists use it instead of cards, accordions or two-line
rows. `default` (46 px, meta under the name) is for lists whose meta needs room, and
`sm` (34 px) for nested lists.

**`SaveBar`** (H) `components/clio/primitives/save-bar.tsx`
`{ count, onSave, onDiscard, saving?, invalid?, error?, className? }`. One bar per page,
for typed values only. It binds Ctrl S / ⌘S.

**`DialogFrame`** (F) `components/clio/primitives/dialog-frame.tsx`
`{ open, onOpenChange, icon?, title, description?, children?, confirm?: { label, onConfirm, tone?: 'default' | 'destructive', disabled?, keyboard?, key?: 'Enter' }, cancelLabel?: string | null, secondary?, help?, footerStart?, className? }`.
Use it for add, edit and confirm dialogs. `destructive` is only for deleting. Mark the first field
`data-initial-focus`. The title row is 48 px with `help` behind an ⓘ before the ×; put `SettingsRow`s in the body.
The description sits under the title text (aligned with it when there is an icon) at 12.5 px and
wraps; it is never cut. The footer follows conversation-states `.xd .ftr`, which settings.html
`.xdf` now matches: padding 10/12/10/18 above a rule, buttons on the right at the spec's `.xb`
28 px (the confirm's face fills the full height; Cancel is a quiet bordered button).
The key chips sit inside the buttons as 18 px `.xk` caps: `Cancel Esc` on the safe button
and `Allow folder Ctrl ↵` (⌘↩ on a Mac) on the confirm button. There is no hint strip on
the left. The chips are hidden from screen readers, so a button's name stays its label.
The overlay is the theme's `--scrim`; Notebook dark uses the spec's `rgba(10,9,8,.62)`.
The frame is 44% of the viewport (`clamp(360px,44vw,600px)`, the spec's 600 px cap) and a
full-width bottom sheet below 600 px. Narrowing drops the chips first (spec: dialogs "drop the
key hints before anything else"): the footer is a container and the chips hide once it is
under 28.5rem, the spec frame's ~460 px, which at 44% is a window under about 1036 px, before
the window's 1024 px fold. They stay hidden in the sheet. A section that needs a wider dialog passes its own `w-[clamp(...)]`; one whose
floor is 460 px or more keeps its chips until the sheet. With `keyboard: false` or a disabled
confirm, the confirm button has no chip. Acknowledgement dialogs such as What's new pass
`cancelLabel={null}` (no Cancel; focus starts on the confirm), `confirm.key: 'Enter'` (plain ↵
confirms, and the button's chip shows ↵) and `footerStart` (a quiet link on the left). The
body is marked
`data-slot="dialog-frame-body"`; parts that need a dialog-specific layout use the
`in-data-[slot=dialog-frame-body]:` variant rather than a new prop.

**`KeyValueGrid`** `components/clio/primitives/key-value-grid.tsx`
`{ items: { label, icon?, value, mono?, title?, action? }[], variant?: 'compact' | 'facts' | 'rows', actionColumn?, className? }`.
`facts` is the form for dialog and ask-card facts: a fixed 110 px label column (the spec's
`grid-template-columns:110px minmax(0,1fr)`), 24 px rows and left-aligned values. Below a
420 px container the labels give way to their icons. `rows` is the settings-sheet form, with a 118 px label.
Settings dialogs that state what an action means (the spec's "plain value rows", such as
Folders' Allow writing to a folder) use `SettingsRow`s, not `facts`: a foreground label and
a right-aligned 12.5 px value that keeps one line while it fits and wraps only when the
dialog is too narrow for it.

**`WindowShell`** (same file)
`{ open, onOpenChange, title, navigation?, rail?, picker?, toolbar?, search?, children, icon?, contentRef?, contentLabel?, className? }`.
The full window frame. Only the Settings window uses it today. The window
folds in the spec's order ("notes and ⓘ tooltips hide, rows stack, the nav folds
to a rail, the rail becomes a picker"). The spec gives proportions, not widths, so
the viewport thresholds are ours:

| Viewport  | Fold                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 1024 px | `navigation`, notes and ⓘ, two-column rows                                                                                                    |
| < 1024 px | notes and ⓘ hide, rows stack (`NARROW_HIDDEN` in `lib/settings-fold.ts`)                                                                      |
| < 880 px  | `rail` replaces `navigation`                                                                                                                  |
| < 600 px  | the window fills the screen, the rail hides and `picker` takes the title's place (the title stays for screen readers); search becomes an icon |

Below 600 px a `DialogFrame` is a bottom sheet, so `NARROW_HIDDEN` hides notes and ⓘ in
its body as well; above that, dialogs keep them (they portal outside the window content).
Below 600 px a one-line `StateView size="row"` in a settings body takes `ROW_STATE_WRAP`
(same file) so its sentence wraps instead of ellipsizing, and a list wrapper in a section
body uses `grid-cols-1` (not a bare `grid`) so wide item rows never widen the column
past the window.

Without a `rail`, `navigation` shows from 600 px. `toolbar` holds other title-row
controls before the ×.

**`SettingsSectionPicker`** `components/clio/settings-navigation.tsx`
The `picker` for Settings: a bordered chip with the current section's icon, name and
a chevron (the spec's `.mpk`). It opens the one searchable Picker (Popover, Command,
`PickerFooter`) with Search everywhere first, Show every section while a search
filters the list, then the sections grouped by scope with their counts and a check on
the current one.

**`SettingsNavRail`** `components/clio/settings-nav-rail.tsx`
Takes the same props as `SettingsNavigation`. It is one named icon per scope
(App, workspace, agent) with the waiting-change count. Hover, click, Enter or
→ opens that scope's sections beside the rail.

**Picker field** `components/clio/model-select-field.tsx`

- `SettingsSelectField`: a button-styled select with `icon?`, `value?` and `placeholder?`, plus button props.
- `ModelSelectField { title, options, providerId?, modelId?, option?, placeholder, catalogStatus, onRetryCatalog, onChange, label?, id?, providerName?, disabled? }`
  opens the shared model picker. Use it for every model choice in Settings.

**`DetailPane` / `ListDetailLayout`** (E) `components/clio/primitives/detail-pane.tsx`

- `DetailPane { title, onClose, children, icon?, actions?, tabs?, className? }`.
  It has the dialog's title row (icon, name, icon actions, ×). `tabs` is a
  `SegmentedControl` under the title row. The pane takes focus when it opens, returns
  focus to the opener when it closes, and Esc inside it closes only the pane, not the
  Settings window.
- `ListDetailLayout { list, detail?, className? }` places the open pane at 42% of the
  width beside the list. Under 40rem of container width the pane replaces the list
  until it closes. Open it with Enter or an Explore action on an `ItemRow`; never use
  a sheet or dialog over the list. Use it for the plugin explorer, provider details,
  MCP service details, agent preview and memory documents.
- To keep Esc from closing the window, mark any other nested scope with
  `data-escape-scope` and handle Esc there.

`SegmentedControl` (`primitives/segmented-control.tsx`) follows the spec `.xsg`: a 28 px
muted track without a border, 24 px items at 12 px, and the selected item raised. Use it
for in-page modes and pane tabs. A choice between a few setting values uses `SettingsChoice`.

**`StepList`** `components/clio/primitives/step-list.tsx`
`{ steps: { id, label, state: 'done' | 'current' | 'todo' | 'failed', meta?, progress?, log? }[], label, logPlacement?: 'step' | 'end' }`.
The steps of a long operation in 28 px rows: a check, a 12 px teal ring on its track (the spec's
`.spin`; it stays still with reduced motion), an open circle or an alert, the
state also as a screen-reader word, and `meta` (a time, a percentage) right-aligned in mono.
`progress` draws a 3 px bar under its step. `log` is the latest output line, under its step by
default; `logPlacement="end"` puts it after the whole list instead, as the local startup does.
Used by the update page and the local startup (`LocalStartupSteps`).

Other primitives (status indicator, tags, split button, key chips) are in `components/clio/primitives/` and
`docs/design/visual-language/components.md`.

## Rules for section bodies

- Light and dark. Nothing wraps; long names truncate and show the full value on hover.
- Fixed, aligned columns. Icons have hover names. Shortcuts come from the registry
  (`lib/shortcuts/`).
- Keep every feature develop has. Rearrange it into these parts.
- Mock data for screenshots and e2e goes in `web/e2e/fixture-data.mjs` and
  `fixture-server.mjs`.
