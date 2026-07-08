# Cross-cutting TUI pitfalls

## Bubbletea
1. **Forgot WindowSizeMsg** → layout stays at 0×0. Capture in Update, cache w/h.
2. **Blocking I/O in Update** → UI freeze. Always wrap in a `tea.Cmd`.
3. **Routing every msg to every child** → wasted work. Filter by type and focus.
4. **Tick/Every fires once** → must re-enqueue in Update or animation stops silently.
5. **Mutating model state inside a Cmd** → data race. Cmds must *return* a Msg; mutation happens in Update.
6. **`WithoutCatchPanics` in production** → panic leaves terminal in raw mode.

## Lipgloss
7. **`len(styledString)` lies.** Use `lipgloss.Width(s)` / `Height(s)` — ANSI- and width-aware.
8. **Padding counts toward Width.** `Width(40).Padding(0,2)` gives 36 content cells.
9. **Tabs silently become spaces** (width 4 by default).
10. **Style is immutable.** `s.Bold(true)` returns a new Style; the old one is unchanged.

## Ultraviolet
11. **`Fill` with no sibling constraint** can starve other panes. Always pair with `Len/Min/Max` or weight Fill properly.
12. **Rectangles are `image.Rectangle`**; `.Dx()`/`.Dy()` give size, `.Min`/`.Max` give corners — don't confuse with `.Width`/`.Height` (those don't exist here).

## Bubbles
13. **Spinner needs `Tick`** to animate. Return it from Init or on "start work".
14. **List needs `FilterValue()` on Items** AND an `ItemDelegate` — forgetting either yields a blank list.
15. **Viewport `SoftWrap=true`** reflows every View — fine for small content, bad for megabyte logs.
16. **TextArea normalizes `\r\n` → `\n`** — paste from Windows clipboards is fine but don't expect CRLF round-trip.
17. **Help.Update is a no-op** — just call `h.View(keymap)` every render.

## VHS
18. **`Wait /regex/` matches only the last line.** Use `Wait+Screen /regex/` for anywhere-on-screen (this one cost us ~2 iterations in the loop-closure test).
19. **`Wait` default timeout is 15s.** On slow machines (or under load) a real render may exceed; bump with `Wait@30s /regex/`.
20. **Output file is required** — tapes that produce only `Screenshot` still need `Output x.gif`.

## Testing / golden
21. **Goldens differ across $TERM values.** Always pin `WithEnvironment` and `WithColorProfile`.
22. **Multi-color terminals render the same ANSI differently.** Pin `colorprofile.ANSI256` or `TrueColor` in tests and be explicit about which.
23. **Concurrent goroutines in your app can shift golden timing.** Use `WaitFor` (teatest) to synchronize on a predicate before snapshotting, never on sleep.
