# Shared components

This page maps each recurring element in the mockups to the one shared component
that renders it in `web/src`, and records what still needs migrating. The
[component gallery](../../../web/tests/review/component-gallery.tsx) renders every
component listed here in every state, in dark and light themes, at 390 px and
1280 px, with Windows or Mac keys. Its spec,
[`component-gallery.spec.ts`](../../../web/e2e/component-gallery.spec.ts), is in
the component Playwright run (`pnpm exec playwright test -c
playwright.components.config.ts component-gallery`, from `web/`). Query
parameters: `?theme=dark|light`, `?platform=windows|mac` and
`?view=menu|dialog|confirm|window|shortcuts`.

Primitives live in `web/src/components/clio/primitives/`. Keyboard code lives in
`web/src/lib/shortcuts/`. A surface should compose these components instead of
restyling a vendored `ui/` component or adding its own copy.

Status values:

- **Shared**: the shared component exists and call sites use it.
- **Shared, partly migrated**: the component exists; some call sites still use
  their own markup (listed under [Left for surface work](#left-for-surface-work)).
- **Restyled**: a vendored `ui/` component was restyled in place to match the
  mockups, so every existing caller changed with it.

## Map

| Element                                                                                    | Mockup reference                                                                                                  | Component                                                                                                                                                                                                                                                                                                                                                                                                                                 | Status                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color, hover, menu highlight and key tokens                                                | Every page's `:root` (Notebook dark)                                                                              | `web/src/theme/themes.css`, `theme/contract.ts`, `index.css` (`bg-hover`, `bg-menu-highlight`, `text-faint`, `bg-key`, `border-key-border`)                                                                                                                                                                                                                                                                                               | Shared. Every theme block defines the new tokens; light values are derived from the same hues.                                                                                |
| Spacing, radius and type scale                                                             | Every page: 28 px controls, 32 px menu rows, 7 px radius, 12.5 to 13 px text                                      | `ui/button.tsx` sizes; primitives use the same scale                                                                                                                                                                                                                                                                                                                                                                                      | Restyled                                                                                                                                                                      |
| 28 px button with an inside focus ring                                                     | conversation-states: dialog frame; full-picture: top bar                                                          | `web/src/components/ui/button.tsx` (default `h-7`, `icon` `size-7`, keyboard-only inset ring)                                                                                                                                                                                                                                                                                                                                             | Restyled                                                                                                                                                                      |
| Icon with its name on hover                                                                | README rule "icons first, names on hover"; workbench-frame-bar                                                    | `primitives/icon-button.tsx`: `IconButton`, `NamedTooltip` (name plus key)                                                                                                                                                                                                                                                                                                                                                                | Shared, partly migrated. `ToolbarAction` (`clio/viewer-toolbar.tsx`) now renders `IconButton`.                                                                                |
| Key chip `K()` with Windows and Mac forms                                                  | workbench-keyboard: key chips, Mac table, held-key badges                                                         | `primitives/key-chip.tsx`: `KeyCap` (`size` `md` or `sm` for dense footers), `ShortcutKeys` (`caps`, `text`, `inline`; `capSize`), `HeldKeyBadge`                                                                                                                                                                                                                                                                                         | Shared                                                                                                                                                                        |
| Shortcut catalog, platform detection, registry                                             | workbench-keyboard: every table; Mac exceptions                                                                   | `lib/shortcuts/catalog.ts`, `keys.ts`, `registry.ts`, `hooks.ts` (`useShortcut`, `useKeyPlatform`, `useShortcutPresentation`, `defineShortcuts`)                                                                                                                                                                                                                                                                                          | Shared, partly migrated                                                                                                                                                       |
| Shortcut sheet (`Ctrl /`)                                                                  | workbench-keyboard: "The sheet"                                                                                   | `primitives/shortcut-sheet.tsx`: `ShortcutSheet`, `ShortcutSheetLauncher` (mounted in `providers/app-providers.tsx`)                                                                                                                                                                                                                                                                                                                      | Shared                                                                                                                                                                        |
| Menu row: icon, label, then fixed columns for tag, value, check, key, › and ⓘ              | conversation-states: menus; full-picture: CLIO menu; workbench-keyboard: menus that show keys                     | `primitives/menu-row.tsx`: `MenuRow` inside `DropdownMenuItem`, `ContextMenuItem` or `CommandItem`                                                                                                                                                                                                                                                                                                                                        | Shared, partly migrated                                                                                                                                                       |
| Menu panel and item styling                                                                | conversation-states: menus                                                                                        | `ui/dropdown-menu.tsx`, `ui/context-menu.tsx`, `ui/command.tsx` (32 px rows, `menu-highlight`, quiet key column)                                                                                                                                                                                                                                                                                                                          | Restyled                                                                                                                                                                      |
| Split button (verb plus variants ▾)                                                        | workbench-frame-bar: Copy ▾ and Open ▾                                                                            | `primitives/split-button.tsx`: `SplitButton` (`Alt ↓` opens the chevron)                                                                                                                                                                                                                                                                                                                                                                  | Shared                                                                                                                                                                        |
| Segmented control                                                                          | workbench-lineage: Render, Source and Lineage; settings: choices                                                  | `primitives/segmented-control.tsx`: `SegmentedControl` (built on `ui/toggle-group`; `iconOnly` chips are named by their label, and an option's `count` shows beside the icon and joins the name, as in "Active, 4")                                                                                                                                                                                                                       | Shared                                                                                                                                                                        |
| Status mark and aligned status column                                                      | runs-attention: run states; full-picture: left bar                                                                | `primitives/status-indicator.tsx`: `StatusIndicator` (`visible` or 16 px `column`; a different shape per state plus a word)                                                                                                                                                                                                                                                                                                               | Shared                                                                                                                                                                        |
| Fixed-width tag and value column                                                           | settings: On, Off and Needs you; runs-attention                                                                   | `primitives/tag.tsx`: `Tag` (58 × 18 px), `MetaValue` (44, 52 or 64 px mono)                                                                                                                                                                                                                                                                                                                                                              | Shared                                                                                                                                                                        |
| One line with an ellipsis                                                                  | README rule "nothing wraps to two lines"                                                                          | `primitives/truncate.tsx`: `TruncatedText`, `MiddleTruncate` (keeps a path's file name); `lib/middle-truncate.ts`                                                                                                                                                                                                                                                                                                                         | Shared                                                                                                                                                                        |
| List row with fixed trailing columns                                                       | full-picture: conversation list; workbench-right-pocket: strip lists; runs-attention                              | `primitives/list-row.tsx`: `ListRow` (28 px; status, icon, title, description, 58 px badge, 44 px meta, hover actions hidden by visibility, 26 px ⓘ; takes `ref` and `style` for virtualizers; `columns` adds fixed-width cells between the description and the badge)                                                                                                                                                                    | Shared, partly migrated. Runs (`clio/run-list-row.tsx`, 32 px; the selected run opens in `clio/run-tab.tsx` as the shell's right-hand tab) and the notifications bell use it. |
| Label and value details on one grid                                                        | connect-infrastructure: host and service details; runs-attention: run details; workbench-right-pocket: Agent      | `primitives/key-value-grid.tsx`: `KeyValueGrid` (label column, one-line value with ellipsis, optional mono value and action slot; `actionColumn` keeps the action column when no row has an action, so stacked grids align); `variant="rows"` is the settings-sheet form (118 px label, separator per row) and `KeyValueRowButton` makes a whole row open a choice (chevron down) or a view (chevron right), teal with words when changed | Shared. The run details popover and the Agent tab use it.                                                                                                                     |
| Dense data grid (gutter, sticky header, continuous scroll)                                 | workbench-frame-bar: the soil_sites.csv table and the Table cell of nine formats                                  | `primitives/dense-grid.tsx`: `DenseGrid` (28 px rows and header, 11 px headers, 12 px mono cells, sticky header and row-number gutter, columns 64-320 px from a sample, virtualized above 150 rows, sort with `aria-sort`, one selected cell, `readDenseGridText` copies every row as TSV)                                                                                                                                                | Shared. File tables (CSV, TSV and JSON records) use it through `clio/file-data-grid.tsx`. A2UI tables still use `ClioDataTable`.                                              |
| Menu footer key hints                                                                      | full-picture: CLIO menu; runs-attention: notifications popover                                                    | `primitives/menu-key-hints.tsx`: `MenuKeyHints` (catalog ids rendered as small key caps in the platform's form, one line)                                                                                                                                                                                                                                                                                                                 | Shared. CLIO menu and the notifications bell use it.                                                                                                                          |
| Page section tabs (icon, open tab adds its name)                                           | connect-infrastructure: the six Infrastructure tabs                                                               | `primitives/nav-tabs.tsx`: `NavTabs` (links; closed tabs name on hover; pair with previous and next tab keys)                                                                                                                                                                                                                                                                                                                             | Shared. Infrastructure uses it.                                                                                                                                               |
| Frame bar, breadcrumbs and tab                                                             | workbench-frame-bar; workbench-tabs                                                                               | `primitives/frame-bar.tsx`: `FrameBar` (34 px container query), `FrameCrumbs`, `FrameDivider`, `FrameTab` (40 px, underline)                                                                                                                                                                                                                                                                                                              | Shared, partly migrated                                                                                                                                                       |
| Popover                                                                                    | conversation-states; pickers-search                                                                               | `ui/popover.tsx`, `ui/dropdown-menu.tsx` (restyled panels; content mounts only while open)                                                                                                                                                                                                                                                                                                                                                | Restyled                                                                                                                                                                      |
| Dialog frame (icon, title, one line of prose, Cancel and the verb with `Esc` and `Ctrl ↵`) | conversation-states: dialog frame and narrow behaviour                                                            | `primitives/dialog-frame.tsx`: `DialogFrame` (bottom sheet below 600 px; focus starts on Cancel; `growDown` opens centred, then keeps the top edge while the body grows; `alert` makes a removal an alertdialog)                                                                                                                                                                                                                          | Shared, partly migrated                                                                                                                                                       |
| Window shell (Settings)                                                                    | settings: "Settings is a window"                                                                                  | `primitives/dialog-frame.tsx`: `WindowShell` (980 × 720 px; × and `Esc` close it; no back arrow; section list folds to a rail of scope icons at 768–1023 px and into a title-row menu below 768 px; full screen below 600 px)                                                                                                                                                                                                             | Shared. `routes/settings-window.tsx` mounts it with the route; only the section content loads lazily.                                                                         |
| Detail pane beside a list                                                                  | settings: kit E, the plugin explorer as a pane 42% wide                                                           | `primitives/detail-pane.tsx`: `DetailPane` (dialog title row, optional tabs; `Esc` inside closes only the pane), `ListDetailLayout` (42% beside the list; replaces it under 40rem)                                                                                                                                                                                                                                                        | Shared. Section bodies migrate to it (see `docs/design/settings-parts.md`).                                                                                                   |
| Empty, loading, error, unavailable, too large, no preview and changed elsewhere            | conversation-states: states; workbench-lineage: the four file states; workbench-frame-bar: the five shared states | `primitives/state-view.tsx`: `StateView` (`row`, `panel` or `page`; error is an alert, loading is a polite status)                                                                                                                                                                                                                                                                                                                        | Shared, partly migrated                                                                                                                                                       |
| Toasts                                                                                     | conversation-states: toasts                                                                                       | `sonner` through `ui/sonner.tsx`                                                                                                                                                                                                                                                                                                                                                                                                          | Unchanged; restyling is surface work                                                                                                                                          |
| Step list (done, current, to do, failed; progress bar and log line)                        | conversation-states: Update and restart, Local startup                                                            | `primitives/step-list.tsx`: `StepList` (an ordered list; `aria-current="step"`; state is also a word)                                                                                                                                                                                                                                                                                                                                     | Shared; used by the update page                                                                                                                                               |
| Ring spinner (work in progress beside its words)                                           | conversation-states: Local startup (`.spin`)                                                                      | `primitives/ring-spinner.tsx`: `RingSpinner` (12 px teal arc on its `--spin-track` token; decorative; still with reduced motion)                                                                                                                                                                                                                                                                                                          |
| Security acknowledgement strip (sandbox off at start)                                      | settings: ?Blocked by the sandbox? strip (`.zsbx`, warning edge, verb on the right)                               | `sandbox-inactive-banner.tsx`: `SandboxInactiveStrip` (warning, reason and next step on one line each; Details and ?Continue without protection?)                                                                                                                                                                                                                                                                                         | Shared                                                                                                                                                                        |

## Consolidated in this pass

- **Tokens.** `hover`, `menu-highlight`, `faint`, `key` and `key-border` are
  defined in every theme (dark Notebook and its light counterpart), so surfaces
  stop mixing `bg-muted/50`, `bg-accent` and `bg-secondary` for the same hover.
- **Buttons.** One 28 px default size and a keyboard-only inset focus ring, so a
  ring is never clipped by its container. A disabled primary button drops to
  the muted fill so it never reads as the active action. Select triggers share
  the 28 px height so a button and a select in one row align; text inputs stay
  32 px. A secondary action inside a row or an alert uses `size="compact"`, the
  spec's `.btn.sm` (24 px, 9 px padding, 11.5 px text).
- **Menus.** Dropdown, context and command menus share one row height,
  highlight and key column. `MenuRow` supplies the fixed trailing columns.
  Its `detail` prop adds a muted second line under the label (an agent's host
  in the CLIO menu), and `status` adds a fixed 72 px `StatusIndicator` column.
- **Icon buttons.** `ToolbarAction` renders `IconButton`, so every viewer
  toolbar button shows its name and key on hover.
- **Keys.** The catalog is the single source for chords and their Mac forms.
  `Ctrl K` (command menu), `Ctrl Shift B` (workbench), `Alt Space`, `Ctrl N`,
  `Ctrl ,` and `F11` (desktop title bar) dispatch through the registry. The
  title bar menu, navigation header, settings navigation and connection page
  render key labels with `ShortcutKeys`, so a Mac shows `⌘K` rather than
  `Ctrl K`.
- **Shortcut sheet.** `Ctrl /` (`⌘/`) opens a searchable sheet of the keys
  active on the current screen, with a Windows and Mac toggle.

## Workbench (S2)

- **Changed token.** `--changed` (`text-changed`) is the teal for a file the
  conversation changed: a diff tab, a changed workspace-file tab and changed
  rows in the Files tree. It always comes with words (", changed in this
  conversation" on the tab), never alone.
- **`FrameTab`** takes `pinned` (icon only, first, no close), `changed`,
  `compact` (an inactive tab shrinks to its icon, the name on hover) and
  `renderTrigger`, so a host whose tabs come from Radix `Tabs` keeps its
  `TabsTrigger` and drag handle. A tab fills the 40 px row; the active one is
  foreground with a 2 px primary underline and no fill. The close mark is
  `data-slot="frame-tab-close"`, rendered only on the active tab (its space
  is kept on every tab), out of the accessibility tree; `Delete`, middle click
  and the tab menu close any tab.
- **Strip positions.** `IconButton`'s `shortcutPosition` and
  `useShortcutPresentation(id, position)` name the n-th entry of a positional
  chord (`strip-position`), and `HeldKeyBadge` shows it while `Ctrl` or `⌘` is
  held.
- **Menu accelerators.** `MenuRow`'s `accelerator` shows a one-letter key in
  the key column; `menuAcceleratorKeyDown` on the menu content picks the item
  whose `data-accelerator` matches.
- **Right pocket.** `clio/workbench-strip.tsx` is the vertical toolbar
  "Workbench lists": Files, Sources, Artifacts, Activity, Agent, then Science
  log, Terminal and Browser pages. It is a launcher (iowarp/gact-tui#839): Files
  shows `clio/workbench-list-column.tsx` as the one column beside the tabs, and
  every other list opens, or focuses, its own `list:<view>` tab
  (`listTab` in `clio/workbench-tab-storage.ts`); the lit icon again returns to
  the tab shown before. The lists use `ListRow` rows with fixed tag and size
  columns and `StateView` for empty, loading and error. The Files column is
  resizable from its hairline edge (drag, arrow keys, Home/End; double-click
  resets), remembered only after a resize (`clio.workbench-list-share.v1`).
  Sizes in the 44 px column use
  `formatCompactBytes` (`54 KB`; the exact size is in the row's hover name).
  `clio/workbench-tab-row.tsx` is
  one `FrameTab` row that measures itself: full names, then icon-only inactive
  tabs, then an "All N tabs" menu. One context menu offers Pin, Show in Files,
  Copy path, Close, Close others, Close to the right, Move left and Move right.
  The pocket's width is a remembered share of the window
  (`clio.workbench-share.v1`). Below 440 px the Files column overlays the tabs
  and steps aside after a pick. An empty narrow pocket shows the column.
- **Quiet focus.** `primitives/quiet-focus.ts` `focusQuietly(element)` hands
  focus back to a control (after Escape restores a maximized frame) without
  popping its hover name; `NamedTooltip` ignores that focus.

## Left for surface work

These call sites still use their own markup. Migrate them to the components
above while redesigning the surface; the change is not mechanical.

- **Menus to `MenuRow`:** `clio/session-export-menu.tsx`,
  `clio/session-management-menu.tsx`, `clio/session-behavior-menu.tsx`,
  `clio/agent-switch-menu.tsx`, `clio/context-compaction-controls.tsx`,
  `clio/message-history-actions.tsx`.
- **Dialogs to `DialogFrame`:** `clio/share-session-dialog.tsx`,
  `clio/archived-sessions-dialog.tsx`, `clio/whats-new-dialog.tsx`, tool detail
  dialogs and the remaining confirm dialogs (`ai-elements/confirmation.tsx`).
- **States to `StateView`:** `clio/conversation-welcome.tsx`,
  `clio/local-startup-progress.tsx`, `clio/update-restart-overlay.tsx`,
  `clio/loading-feedback.tsx`, `clio/route-error-boundary.tsx`,
  `clio/resource-states.tsx` (`ResourceUnavailable`) and `ui/empty.tsx` callers.
- **Activity rows to `ListRow` and `StatusIndicator`:**
  `clio/tool-invocation.tsx`, `clio/tool-compact-row.tsx`,
  `clio/activity-row.tsx`, `clio/nested-tool-calls.tsx`,
  `clio/subagent-card.tsx`, `clio/tool-terminal-result.tsx`,
  `clio/transcript-reasoning.tsx`.
- **Rows whose trailing actions shift on hover:**
  `clio/session-summary-row.tsx` and `clio/artifact-rail-row.tsx`.
  `ListRow` keeps its action column with `visibility`. The workbench Artifacts
  list already uses `ListRow`. The left-bar workspace and conversation rows
  already use it, with `actionsOverlay` so the hover actions cover the trailing
  time instead of reserving a second column.
- **Frame bar:** `clio/file-viewer-shell.tsx` renders `FrameBar` with
  `FrameCrumbs`, more than one reading mode as `FileModeControls` (a segmented
  group of named icons inside Radix `Tabs`), and `FrameTalkTake` for the
  actions. As it narrows, the bar folds one step at a time (`FRAME_FOLDS`,
  workbench-lineage "When it gets narrow"). At the last step the modes move
  into the … menu as a checked list: `FileModeControls` registers them with
  `useFrameModes` (`primitives/frame-modes.ts`) and the menu reads them with
  `foldedFrameModes`. A bar without that menu keeps the folded mode icon. The
  workbench tab row renders `FrameTab`.
- **Remaining key handlers to register in the catalog:**
  `clio/selection-actions.tsx`, `hooks/use-desktop-zoom.ts` (`Ctrl =`, `Ctrl -`, `Ctrl 0`; the
  catalog has `zoom-in`, `zoom-out` and `zoom-reset`), the `Downloads (Ctrl+J)`
  title in `clio/downloads-button.tsx`, `clio/global-search-results.tsx`, and
  Mermaid zoom and pan. Register the key with `useShortcut(id, handler)` and show
  it with `ShortcutKeys` or the `shortcut` prop of `IconButton` and `MenuRow`.
- **Toasts:** restyle `ui/sonner.tsx` to the conversation-states toast.

## Rules for new components

- Use one component per concept. Before adding a component, check this page
  and `docs/design/frontend-component-reuse.md`.
- Use theme tokens only. `scripts/check_theme_colors.mjs` rejects color literals
  and palette classes outside `web/src/theme/`.
- Never show status with color alone. `StatusIndicator` pairs each state with
  a shape and a word, and `column` display keeps the word for assistive
  technology.
- `StatusIndicator` is the one status word (cross-surface X4): a mark that
  carries the color and a 12px muted word, in every state. Use it for
  Ready, Connected, Running, Completed, Failed and the like in lists, menus,
  panels and dialogs. Don't draw state words as pills, badges, colored text or
  other sizes, and don't override its size or color. Settings, transcript and
  activity surfaces adopt it rather than local badges.
- Give trailing columns fixed widths and hide hover actions with
  `visibility`, so nothing moves on hover.
- Keep every line to one line. Use `truncate`, `TruncatedText` or
  `MiddleTruncate`, and put the full text in `title`.
- Mount menus, popovers, dialogs and the shortcut sheet only while open.
- Portal overlays into `useOverlayContainer()` (`ui/overlay-container.ts`), never
  `document.body`: inserting a body child restyles every element under the app
  root. The app shell holds `<body>` at Radix's modal values (scroll lock and
  `pointer-events: none`), so opening a modal layer changes nothing on `<body>`.
  A modal menu, select or popover therefore renders `ModalShield` below its
  content to block the page; dialogs and sheets use their overlays. Build new
  overlays on the `ui/` wrappers so they inherit both.
- Wrap row components in `memo`, and let them take `ref` and `style` so a
  virtualizer can position them.
- Register shortcuts by catalog id instead of adding a `keydown` listener. The
  registry skips repeats, IME composition and events that another handler
  already handled. It also ignores text fields unless the key allows them.
