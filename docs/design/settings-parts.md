# Settings shared parts

Section bodies (Models, Tools, Memory, …) are built only from these parts.
Spec: `docs/design/visual-language/settings.html`; letters below match its
part labels. Extend a part in place when a section needs more; never fork it.
Paths are under `web/src/`.

## Window and navigation (owned by S3)

| Part            | Path                                                                                | Notes                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Settings window | `routes/settings-window.tsx` `SettingsWindow`                                       | Mounts over the workspace through `WindowShell`; closes with × / Esc. Sections load lazily.                            |
| Section switch  | `routes/settings-page.tsx` `SettingsSection({ section, sessionId?, workspaceId? })` | Maps a section id to its body. Add or rename a body here only.                                                         |
| Nav entries     | `lib/application-destinations.ts`                                                   | `{ id, label, group: 'App' \| 'Workspace' \| 'Agent', icon, keywords }`. Keywords feed Ctrl K and the Settings filter. |
| Route helpers   | `lib/settings-window-route.ts`                                                      | `isSettingsRoute`, `matchingSettingsSections`, `arrivedFromSearch`.                                                    |
| Scope           | `lib/settings-scope-context.ts` `SettingsScopeContext`                              | `{ group, line }`, the scope line shown under the page title.                                                          |
| Anchor          | `data-settings-anchor="<id>"`                                                       | Put it on a sub-block that has its own nav id or search hit. The window scrolls to it and highlights it.               |

## Page parts

**`SettingsSectionHeading`** `components/clio/settings-section-heading.tsx`
`{ title, description?, info?, eyebrow?, level?: 1 | 2, actions? }`. Every
page renders exactly one `level={1}` heading, the page h1.

**`SettingsRow`** (B) `components/clio/settings-row.tsx`
`{ title, description?, info?, note?, error?, children, htmlFor?, inlineControl?, fullWidth?, dirty? }`.
The label column sits on the left and the control on the right. Use `inlineControl` for a
switch. Following the spec (`.xrw{width:60%}`), a row takes 60% of a wide content column,
with no rem cap, and its control column is 52% of the row. Wrappers that stand in for rows
(group labels with a control, a save bar under rows) use the same `@3xl:w-[60%]`.
Item lists, tables and list-detail panes fill the column. `fullWidth` keeps the whole width for a
wide control (a path or a long select). `dirty` marks a value that is still waiting in the save bar. The description sits
behind the ⓘ beside the title, together with provenance and effect. Rows turn two-column
from a 28rem container (20rem inside a `DialogFrame` body) and stack below it. Text and
number inputs placed in the control get the spec field (`.xf`) automatically: 30 px,
12.5 px, 6 px radius; number inputs are right-aligned mono. Don't restyle them per section.

**`SettingsGroupLabel`** (same file)
`{ children, info?, onAdd?, addLabel?, actions?, className? }`. A small group caption
above a block of rows. `info` is an ? right after the label. `onAdd` renders a + icon button at the right. Use
`SplitButton` (`primitives/split-button.tsx`) for the page-level Add with
alternatives, which has a right-aligned arrow.

**`SettingsChoice`** (same file)
`{ id, label, value, onChange, options: { value, label, description?, icon? }[] }`.
A choice that applies at once, so it never reaches the save bar.

**`ItemRow` / `ItemList`** (D) `components/clio/primitives/item-row.tsx`
`ItemRow { icon?, title, meta?, status?, actions?, actionsVisible?, slot?, confirm?, statusWidth?, actionsWidth?, slotWidth?, selected?, size?: 'default' | 'sm' | 'line' }`
plus div attributes. Use it for providers, servers, plugins, agents, schedules and rules. The
status, actions and slot columns have fixed widths that every row in an `ItemList`
`{ children, label?, className? }` shares. Status is a `StatusIndicator` (its mark plus
a word), never a bare dot. Below 36rem of list width the status column narrows to at most 9.875rem, the spec's 158 px (still one width for every row) and hover actions float over the row. `ItemList` caps the list at 760 px (the spec pane width), so
sections don't set their own max width. `confirm` is an inline confirmation ("Remove this rule?",
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
`{ open, onOpenChange, icon?, title, description?, children?, confirm?: { label, onConfirm, tone?: 'default' | 'destructive', disabled?, keyboard? }, cancelLabel?, secondary?, help?, className? }`.
Use it for add, edit and confirm dialogs. `destructive` is only for deleting. Mark the first field
`data-initial-focus`. The title row is 48 px with `help` behind an ⓘ before the ×; put `SettingsRow`s in the body.
The footer carries the key hints on the left (Esc and the cancel label, Ctrl ↵ and the
confirm label) and plain Cancel and confirm buttons on the right. The body is marked
`data-slot="dialog-frame-body"`; parts that need a dialog-specific layout use the
`in-data-[slot=dialog-frame-body]:` variant rather than a new prop.

**`WindowShell`** (same file)
`{ open, onOpenChange, title, navigation?, rail?, toolbar?, search?, children, icon?, contentRef?, contentLabel?, className? }`.
The full window frame. Only the Settings window uses it today. The window
narrows in the spec's order: from 1024 px `navigation` shows; at 768–1023 px
`rail` replaces it; below 768 px both hide and a `toolbar` picker takes over.
Without a `rail`, `navigation` shows from 768 px.

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

Other primitives (status indicator, tags, split button, key chips) are in `components/clio/primitives/` and
`docs/design/visual-language/components.md`.

## Rules for section bodies

- Light and dark. Nothing wraps; long names truncate and show the full value on hover.
- Fixed, aligned columns. Icons have hover names. Shortcuts come from the registry
  (`lib/shortcuts/`).
- Keep every feature develop has. Rearrange it into these parts.
- Mock data for screenshots and e2e goes in `web/e2e/fixture-data.mjs` and
  `fixture-server.mjs`.
