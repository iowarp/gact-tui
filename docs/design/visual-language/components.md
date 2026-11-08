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

| Element                                                                                    | Mockup reference                                                                                                  | Component                                                                                                                                                                                                                                                              | Status                                                                                         |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Color, hover, menu highlight and key tokens                                                | Every page's `:root` (Notebook dark)                                                                              | `web/src/theme/themes.css`, `theme/contract.ts`, `index.css` (`bg-hover`, `bg-menu-highlight`, `text-faint`, `bg-key`, `border-key-border`)                                                                                                                            | Shared. Every theme block defines the new tokens; light values are derived from the same hues. |
| Spacing, radius and type scale                                                             | Every page: 28 px controls, 32 px menu rows, 7 px radius, 12.5 to 13 px text                                      | `ui/button.tsx` sizes; primitives use the same scale                                                                                                                                                                                                                   | Restyled                                                                                       |
| 28 px button with an inside focus ring                                                     | conversation-states: dialog frame; full-picture: top bar                                                          | `web/src/components/ui/button.tsx` (default `h-7`, `icon` `size-7`, keyboard-only inset ring)                                                                                                                                                                          | Restyled                                                                                       |
| Icon with its name on hover                                                                | README rule "icons first, names on hover"; workbench-frame-bar                                                    | `primitives/icon-button.tsx`: `IconButton`, `NamedTooltip` (name plus key)                                                                                                                                                                                             | Shared, partly migrated. `ToolbarAction` (`clio/viewer-toolbar.tsx`) now renders `IconButton`. |
| Key chip `K()` with Windows and Mac forms                                                  | workbench-keyboard: key chips, Mac table, held-key badges                                                         | `primitives/key-chip.tsx`: `KeyCap`, `ShortcutKeys` (`caps`, `text`, `inline`), `HeldKeyBadge`                                                                                                                                                                         | Shared                                                                                         |
| Shortcut catalog, platform detection, registry                                             | workbench-keyboard: every table; Mac exceptions                                                                   | `lib/shortcuts/catalog.ts`, `keys.ts`, `registry.ts`, `hooks.ts` (`useShortcut`, `useKeyPlatform`, `useShortcutPresentation`, `defineShortcuts`)                                                                                                                       | Shared, partly migrated                                                                        |
| Shortcut sheet (`Ctrl /`)                                                                  | workbench-keyboard: "The sheet"                                                                                   | `primitives/shortcut-sheet.tsx`: `ShortcutSheet`, `ShortcutSheetLauncher` (mounted in `providers/app-providers.tsx`)                                                                                                                                                   | Shared                                                                                         |
| Menu row: icon, label, then fixed columns for tag, value, check, key, › and ⓘ              | conversation-states: menus; full-picture: CLIO menu; workbench-keyboard: menus that show keys                     | `primitives/menu-row.tsx`: `MenuRow` inside `DropdownMenuItem`, `ContextMenuItem` or `CommandItem`                                                                                                                                                                     | Shared, partly migrated                                                                        |
| Menu panel and item styling                                                                | conversation-states: menus                                                                                        | `ui/dropdown-menu.tsx`, `ui/context-menu.tsx`, `ui/command.tsx` (32 px rows, `menu-highlight`, quiet key column)                                                                                                                                                       | Restyled                                                                                       |
| Split button (verb plus variants ▾)                                                        | workbench-frame-bar: Copy ▾ and Open ▾                                                                            | `primitives/split-button.tsx`: `SplitButton` (`Alt ↓` opens the chevron)                                                                                                                                                                                               | Shared                                                                                         |
| Segmented control                                                                          | workbench-lineage: Render, Source and Lineage; settings: choices                                                  | `primitives/segmented-control.tsx`: `SegmentedControl` (built on `ui/toggle-group`)                                                                                                                                                                                    | Shared                                                                                         |
| Status mark and aligned status column                                                      | runs-attention: run states; full-picture: left bar                                                                | `primitives/status-indicator.tsx`: `StatusIndicator` (`visible` or 16 px `column`; a different shape per state plus a word)                                                                                                                                            | Shared                                                                                         |
| Fixed-width tag and value column                                                           | settings: On, Off and Needs you; runs-attention                                                                   | `primitives/tag.tsx`: `Tag` (58 × 18 px), `MetaValue` (44, 52 or 64 px mono)                                                                                                                                                                                           | Shared                                                                                         |
| One line with an ellipsis                                                                  | README rule "nothing wraps to two lines"                                                                          | `primitives/truncate.tsx`: `TruncatedText`, `MiddleTruncate` (keeps a path's file name); `lib/middle-truncate.ts`                                                                                                                                                      | Shared                                                                                         |
| List row with fixed trailing columns                                                       | full-picture: conversation list; workbench-right-pocket: strip lists; runs-attention                              | `primitives/list-row.tsx`: `ListRow` (28 px; status, icon, title, description, 58 px badge, 44 px meta, hover actions hidden by visibility, 26 px ⓘ; takes `ref` and `style` for virtualizers; `columns` adds fixed-width cells between the description and the badge) | Shared, partly migrated. Runs (`clio/run-list-row.tsx`) and the notifications bell use it.     |
| Label and value details on one grid                                                        | connect-infrastructure: host and service details; runs-attention: run details                                     | `primitives/key-value-grid.tsx`: `KeyValueGrid` (label column, one-line value with ellipsis, optional mono value and action slot)                                                                                                                                      | Shared. The run details popover uses it.                                                       |
| Menu footer key hints                                                                      | full-picture: CLIO menu; runs-attention: notifications popover                                                    | `primitives/menu-key-hints.tsx`: `MenuKeyHints` (catalog ids rendered in the platform's form, one line)                                                                                                                                                                | Shared. CLIO menu and the notifications bell use it.                                           |
| Page section tabs (icon, open tab adds its name)                                           | connect-infrastructure: the six Infrastructure tabs                                                               | `primitives/nav-tabs.tsx`: `NavTabs` (links; closed tabs name on hover; pair with previous and next tab keys)                                                                                                                                                          | Shared. Infrastructure uses it.                                                                |
| Frame bar, breadcrumbs and tab                                                             | workbench-frame-bar; workbench-tabs                                                                               | `primitives/frame-bar.tsx`: `FrameBar` (34 px container query), `FrameCrumbs`, `FrameDivider`, `FrameTab` (30 px)                                                                                                                                                      | Shared, partly migrated                                                                        |
| Popover                                                                                    | conversation-states; pickers-search                                                                               | `ui/popover.tsx`, `ui/dropdown-menu.tsx` (restyled panels; content mounts only while open)                                                                                                                                                                             | Restyled                                                                                       |
| Dialog frame (icon, title, one line of prose, Cancel and the verb with `Esc` and `Ctrl ↵`) | conversation-states: dialog frame and narrow behaviour                                                            | `primitives/dialog-frame.tsx`: `DialogFrame` (bottom sheet below 600 px; focus starts on Cancel)                                                                                                                                                                       | Shared, partly migrated                                                                        |
| Window shell (Settings)                                                                    | settings: "Settings is a window"                                                                                  | `primitives/dialog-frame.tsx`: `WindowShell` (980 × 720 px; × and `Esc` close it; no back arrow; full screen below 600 px)                                                                                                                                             | Shared. The Settings route still renders as a page; see below.                                 |
| Empty, loading, error, unavailable, too large, no preview and changed elsewhere            | conversation-states: states; workbench-lineage: the four file states; workbench-frame-bar: the five shared states | `primitives/state-view.tsx`: `StateView` (`row`, `panel` or `page`; error is an alert, loading is a polite status)                                                                                                                                                     | Shared, partly migrated                                                                        |
| Toasts                                                                                     | conversation-states: toasts                                                                                       | `sonner` through `ui/sonner.tsx`                                                                                                                                                                                                                                       | Unchanged; restyling is surface work                                                           |

## Consolidated in this pass

- **Tokens.** `hover`, `menu-highlight`, `faint`, `key` and `key-border` are
  defined in every theme (dark Notebook and its light counterpart), so surfaces
  stop mixing `bg-muted/50`, `bg-accent` and `bg-secondary` for the same hover.
- **Buttons.** One 28 px default size and a keyboard-only inset focus ring, so a
  ring is never clipped by its container. A disabled primary button drops to
  the muted fill so it never reads as the active action. Select triggers share
  the 28 px height so a button and a select in one row align; text inputs stay
  32 px.
- **Menus.** Dropdown, context and command menus share one row height,
  highlight and key column. `MenuRow` supplies the fixed trailing columns.
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
- **Settings to `WindowShell`:** `routes/settings-page.tsx` and
  `clio/settings-frame.tsx` render a routed page. Moving them into `WindowShell`
  changes routing and the browser Back behaviour, which is an open question in
  the README.
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
  `clio/session-summary-row.tsx`,
  `clio/workspace-navigation-session-row.tsx`, `clio/artifact-rail-row.tsx`.
  `ListRow` keeps its action column with `visibility`.
- **Frame bar:** `clio/file-viewer-shell.tsx` and the workbench tab strip should
  render `FrameBar`, `FrameCrumbs` and `FrameTab`.
- **Remaining key handlers to register in the catalog:** workbench tab keys,
  `clio/selection-actions.tsx`, `ui/sidebar.tsx` (`Ctrl B`; the catalog's
  `left-pocket`), `hooks/use-desktop-zoom.ts` (`Ctrl =`, `Ctrl -`, `Ctrl 0`; the
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
- Give trailing columns fixed widths and hide hover actions with
  `visibility`, so nothing moves on hover.
- Keep every line to one line. Use `truncate`, `TruncatedText` or
  `MiddleTruncate`, and put the full text in `title`.
- Mount menus, popovers, dialogs and the shortcut sheet only while open.
- Wrap row components in `memo`, and let them take `ref` and `style` so a
  virtualizer can position them.
- Register shortcuts by catalog id instead of adding a `keydown` listener. The
  registry skips repeats, IME composition and events that another handler
  already handled. It also ignores text fields unless the key allows them.
