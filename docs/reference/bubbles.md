# Bubbles v2 — component catalog

Module: `charm.land/bubbles/v2`.
Source: `/home/jcernuda/tui/research/bubbles/`.

## One-liner table
| Component | Purpose | When to use |
|---|---|---|
| `textinput` | Single-line input w/ cursor, masking, suggestions | Commands, search, passwords |
| `textarea` | Multi-line editor w/ wrap, scroll, paste | Chat input, code snippets |
| `viewport` | Scrollable read-only container w/ search highlights | Logs, chat history, docs |
| `list` | Paginated, filterable, selectable items | Menus, session picker, file list |
| `table` | Multi-column grid | Structured data display |
| `spinner` | Animated loader | "thinking…" states |
| `progress` | Animated % bar | Determinate progress |
| `paginator` | Page-state only (numbers/dots) | Custom paginated views |
| `help` | Render key bindings short/full | Help footer / overlay |
| `key` | Declarative key bindings | Every interactive component |
| `filepicker` | Browse & select path | Open/save dialogs |
| `cursor` | Virtual cursor (internal to inputs) | Custom input only |

Each has its own `Init/Update/View` — embed as struct field, forward msgs, include in parent View.

## Focus & forwarding pattern
```go
type Model struct { ta textarea.Model }
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
    var cmd tea.Cmd
    m.ta, cmd = m.ta.Update(msg)
    return m, cmd
}
```
Multi-component: track `focus` enum, route only to focused sub-model.

## Key gotchas
- **Spinner requires `Tick`** — return `m.spinner.Tick` from Init or start event, else it freezes.
- **List needs Items implementing `FilterValue() string`** and an `ItemDelegate` (use `NewDefaultItemDelegate()`).
- **Viewport `SoftWrap` re-wraps every View call** — cheap for small content, slow for huge.
- **Textarea `\r\n` normalized to `\n`** — don't expect CRLF to survive.
- **TextInput virtual cursor** is default; use `SetVirtualCursor(false)` if you manage cursor via `tea.Cursor` (better for multi-input layouts).
- **Help is stateless** — `h.Update(msg)` is a no-op; just call `h.View(keymap)` each render.

## Chat TUI recipe
```
┌─────────────────────────────────────────────┐
│ Status bar                                  │
├────────────────┬────────────────────────────┤
│ Sessions       │ Message history            │
│ (list)         │ (viewport)                 │
│                ├────────────────────────────┤
│                │ Input (textarea)           │
│                ├────────────────────────────┤
│                │ Help (help.View)           │
└────────────────┴────────────────────────────┘
```

Mappings:
- **sidebar** → `list.Model` with session items, fuzzy filter enabled.
- **history** → `viewport.Model`. Append strings; `vp.GotoBottom()` after append. Do NOT use List for messages (List is for selection).
- **input** → `textarea.Model`. `input.Reset()` after send. Handle `ctrl+enter` (or custom) as send key.
- **status** → plain string or `progress.Model` when busy.
- **help** → `help.Model`, toggle `ShowAll` on `?`.
- **keys** → struct of `key.Binding`s; use `key.Matches(msg, m.keys.Send)`.

On `WindowSizeMsg`: split width 25/rest, hand sizes to subcomponents.
