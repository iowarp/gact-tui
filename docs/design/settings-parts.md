# Settings shared parts

Section bodies (Models, Tools, Memory, …) are built only from these parts.
Spec: `docs/design/visual-language/settings.html`; letters below match its
part labels. Extend a part in place when a section needs more; never fork it.
Paths are under `web/src/`.

## Window and navigation (owned by S3)

| Part | Path | Notes |
| --- | --- | --- |
| Settings window | `routes/settings-window.tsx` `SettingsWindow` | Mounts over the workspace through `WindowShell`; closes with × / Esc. Sections load lazily. |
| Section switch | `routes/settings-page.tsx` `SettingsSection({ section, sessionId?, workspaceId? })` | Maps a section id to its body. Add or rename a body here only. |
| Nav entries | `lib/application-destinations.ts` | `{ id, label, group: 'App' \| 'Workspace' \| 'Agent', icon, keywords }`. Keywords feed Ctrl K and the Settings filter. |
| Route helpers | `lib/settings-window-route.ts` | `isSettingsRoute`, `matchingSettingsSections`, `arrivedFromSearch`. |
| Scope | `lib/settings-scope-context.ts` `SettingsScopeContext` | `{ group, line }`, the scope line shown under the page title. |
| Anchor | `data-settings-anchor="<id>"` | Put it on a sub-block that has its own nav id or search hit. The window scrolls to it and highlights it. |

## Page parts

**`SettingsSectionHeading`** `components/clio/settings-section-heading.tsx`
`{ title, description?, info?, eyebrow?, level?: 1 | 2, actions? }`. Every
page renders exactly one `level={1}` heading, the page h1.

**`SettingsRow`** (B) `components/clio/settings-row.tsx`
`{ title, description?, info?, note?, error?, children, htmlFor?, inlineControl?, dirty? }`.
The label column sits on the left and the control on the right. Use `inlineControl` for a
switch. `dirty` marks a value that is still waiting in the save bar.

**`SettingsGroupLabel`** (same file)
`{ children, onAdd?, addLabel?, actions?, className? }`. A small group caption
above a block of rows. `onAdd` renders a + icon button at the right. Use
`SplitButton` (`primitives/split-button.tsx`) for the page-level Add with
alternatives, which has a right-aligned arrow.

**`SettingsChoice`** (same file)
`{ id, label, value, onChange, options: { value, label, description?, icon? }[] }`.
A choice that applies at once, so it never reaches the save bar.

**`ItemRow` / `ItemList`** (D) `components/clio/primitives/item-row.tsx`
`ItemRow { icon?, title, meta?, status?, actions?, actionsVisible?, slot?, statusWidth?, actionsWidth?, slotWidth?, selected?, size?: 'default' | 'sm' }`
plus div attributes. Use it for providers, servers, plugins, agents, schedules and rules. The
status, actions and slot columns have fixed widths that every row in an `ItemList`
`{ children, label?, className? }` shares. Status is a `StatusIndicator` (its mark plus
a word), never a bare dot.

**`SaveBar`** (H) `components/clio/primitives/save-bar.tsx`
`{ count, onSave, onDiscard, saving?, invalid?, error?, className? }`. One bar per page,
for typed values only. It binds Ctrl S / ⌘S.

**`DialogFrame`** (F) `components/clio/primitives/dialog-frame.tsx`
`{ open, onOpenChange, icon?, title, description?, children?, confirm?: { label, onConfirm, tone?: 'default' | 'destructive', disabled?, keyboard? }, cancelLabel?, secondary?, className? }`.
Use it for add, edit and confirm dialogs. `destructive` is only for deleting. Mark the first field
`data-initial-focus`.

**`WindowShell`** (same file)
`{ open, onOpenChange, title, navigation?, toolbar?, search?, children, icon?, contentRef?, contentLabel?, className? }`.
The full window frame. Only the Settings window uses it today.

**Picker field** `components/clio/model-select-field.tsx`
- `SettingsSelectField`: a button-styled select with `icon?`, `value?` and `placeholder?`, plus button props.
- `ModelSelectField { title, options, providerId?, modelId?, option?, placeholder, catalogStatus, onRetryCatalog, onChange, label?, id?, providerName?, disabled? }`
  opens the shared model picker. Use it for every model choice in Settings.

**Detail pane** (E): not built yet. It will land in
`components/clio/primitives/` and be listed here. Until then, use the existing
`settings-provider-details-sheet.tsx`.

Other primitives (status indicator, tags, split button, segmented control, key
chips) are in `components/clio/primitives/` and
`docs/design/visual-language/components.md`.

## Rules for section bodies

- Light and dark. Nothing wraps; long names truncate and show the full value on hover.
- Fixed, aligned columns. Icons have hover names. Shortcuts come from the registry
  (`lib/shortcuts/`).
- Keep every feature develop has. Rearrange it into these parts.
- Mock data for screenshots and e2e goes in `web/e2e/fixture-data.mjs` and
  `fixture-server.mjs`.
