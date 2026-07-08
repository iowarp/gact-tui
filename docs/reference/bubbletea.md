# Bubbletea v2 — distilled notes

Module: `charm.land/bubbletea/v2` (NOT `github.com/charmbracelet/bubbletea`).
Source: `/home/jcernuda/tui/research/bubbletea/`.

## Model interface (tea.go:52)
```go
type Model interface {
    Init() Cmd
    Update(Msg) (Model, Cmd)
    View() View   // v2: View, not string
}
```

Msg is an alias for `ultraviolet.Event`. Cmd is `func() Msg`.

## View struct (tea.go:82-190)
Important fields:
- `Content string` — the rendered ANSI string (required)
- `Cursor *Cursor` — cursor position/shape/blink (use `tea.NewCursor(x,y)`)
- `AltScreen bool` — enter alt screen buffer
- `MouseMode MouseMode` — enable mouse (None / CellMotion / AllMotion)
- `ReportFocus bool` — request FocusMsg/BlurMsg
- `KeyboardEnhancements KeyboardEnhancements` — Kitty protocol (key release, repeat)

## Program options worth knowing (options.go)
- `WithInput(io.Reader)` / `WithOutput(io.Writer)` — REQUIRED for unit tests
- `WithWindowSize(w, h)` — deterministic size
- `WithColorProfile(colorprofile.ANSI256)` — deterministic colors
- `WithEnvironment([]string{"TERM=xterm-256color"})` — deterministic env
- `WithContext(ctx)` — external cancellation
- `WithFilter(func(Model, Msg) Msg)` — pre-process or drop msgs (return nil drops)
- `WithFPS(n)` — clamp render rate (default 60, max 120)
- `WithoutRenderer()` — non-TUI mode (daemon/headless)

## Injecting messages from outside
`p.Send(msg)` is safe from goroutines (tea.go:1183). Canonical streaming pattern
(examples/realtime/main.go:24-51):

```go
func waitForActivity(sub <-chan T) tea.Cmd {
    return func() tea.Msg { return responseMsg(<-sub) }
}
// In Update for responseMsg: re-enqueue waitForActivity(m.sub) to keep loop alive.
```

## Cmd idioms (commands.go)
- `tea.Batch(cmds...)` — run concurrently, unordered (line 15)
- `tea.Sequence(cmds...)` — run in order, wait between (line 25)
- `tea.Tick(d, fn)` — fire once after d; re-enqueue in Update to loop (line 154)
- `tea.Every(d, fn)` — fire once aligned to clock (next whole d); re-enqueue to loop (line 102)

**Never block in Update.** Always push I/O into a returned Cmd.
**Tick/Every fire ONCE.** If you forget to re-enqueue they stop.

## Keys (key.go:191-222)
```go
case tea.KeyPressMsg:
    switch msg.String() {           // easy path: "enter", "ctrl+c", "a"
    case "q", "ctrl+c": return m, tea.Quit
    }
    // or by Code:
    k := msg.Key()
    if k.Code == tea.KeyEnter { ... }
```
Also: `PasteMsg{Content}`, `PasteStartMsg`, `PasteEndMsg`, `FocusMsg`, `BlurMsg`,
`MouseClickMsg`, `MouseWheelMsg`, `MouseMotionMsg`.

## Composition (parent routes to children)
Idiomatic pattern (examples/composable-views/main.go:62-122):
- Parent holds children as struct fields.
- Parent Update switches on msg type.
- Parent routes KeyPressMsg only to the *focused* child (tracked via enum).
- Parent routes child-specific msgs (e.g. `spinner.TickMsg`) directly to that child.
- Parent splits `WindowSizeMsg` and calls `child.SetSize(w,h)` or re-sends a smaller
  WindowSizeMsg before forwarding.

## Pitfalls
1. Forgetting to handle `WindowSizeMsg` → layout frozen at 0x0.
2. Blocking in Update → whole UI freezes. Always return a Cmd.
3. Calling every child's Update on every msg → wasted work. Filter by type.
4. `tea.Tick/Every` not re-enqueued → animation stops silently.
5. Mutating model state from inside a Cmd → race. Cmds must return a Msg; mutate only in Update.
6. Nil-returning Cmd is no-op (commands.go:40); fine but don't rely on it for control flow.
