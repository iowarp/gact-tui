# Ultraviolet layout — distilled notes

Module: `github.com/charmbracelet/ultraviolet/layout`.
Source: `/home/jcernuda/tui/research/ultraviolet/layout/`.

## Why this exists
Lipgloss can size a single block. It cannot solve "split a 120×30 terminal into
header + (sidebar | main) + footer with constraints and flex distribution."
Ultraviolet's `layout` package is a Cassowary-style constraint solver that does.

**Use when**: 3+ panes, responsive breakpoints, or dynamic flex. Crush uses it
(see `/home/jcernuda/tui/research/crush/internal/ui/model/ui.go:2468-2700`).
**Skip when**: static 2-pane or simple status bar — plain lipgloss is enough.

## Core types (layout/layout.go)
- `Direction`: `DirectionVertical` | `DirectionHorizontal`
- `Constraint` (sealed interface):
  - `Len(n)` — exactly n cells (fixed)
  - `Min(n)` — at least n
  - `Max(n)` — at most n
  - `Percent(n)` — n% of total
  - `Ratio{numer, denom}` — proportional (e.g. 2:3)
  - `Fill(weight)` — greedy; consumes remaining space, weighted if multiple
- `Splitted`: result of a split; call `.Assign(&r1, &r2, ...)` to unpack into `image.Rectangle`s.
- `Flex` (layout/flex.go): distribution strategy — `FlexStart`, `FlexEnd`, `FlexCenter`,
  `FlexSpaceEvenly`, `FlexSpaceAround`, `FlexSpaceBetween`, `FlexLegacy` (default).

Priority order (Cassowary): `Min > Max > Len > Percent > Ratio > Fill`.
When constraints conflict, lower-priority ones relax first.

## Canonical pattern
```go
import (
    "image"
    uvlayout "github.com/charmbracelet/ultraviolet/layout"
)

area := image.Rect(0, 0, w, h)   // terminal size

var header, body, footer image.Rectangle
uvlayout.Vertical(
    uvlayout.Len(3),              // header exactly 3 rows
    uvlayout.Fill(1),             // body: take the rest
    uvlayout.Len(1),              // footer 1 row
).Split(area).Assign(&header, &body, &footer)

var sidebar, main image.Rectangle
uvlayout.Horizontal(
    uvlayout.Len(30),
    uvlayout.Fill(1),
).Split(body).Assign(&sidebar, &main)
```

Each rectangle gives `.Min.X/.Min.Y/.Dx()/.Dy()`.

## How it composes with lipgloss
Ultraviolet gives you *where*. Lipgloss renders *what*. Workflow:
1. Compute rectangles with `layout.X(...).Split(area).Assign(...)`.
2. For each pane: render lipgloss content, measure with `lipgloss.Width/Height`,
   pad/truncate to the rect's `Dx()`/`Dy()`.
3. Position the final strings in the terminal (bubbletea renders them).

Rendering itself is still lipgloss; ultraviolet never touches strings.

## Crush example (ui.go:2545)
```go
layout.Horizontal(
    layout.Len(appRect.Dx()-sidebarWidth),
    layout.Fill(1),
).Split(appRect).Assign(&mainRect, &sideRect)

layout.Vertical(
    layout.Len(mainRect.Dy()-editorHeight),
    layout.Fill(1),
).Split(mainRect).Assign(&mainRect, &editorRect)
```

## When to use what
| Scenario | Tool |
|---|---|
| Single styled block / status line | lipgloss |
| Static 2-pane | lipgloss + `JoinHorizontal` |
| 3+ panes, responsive, or flex distribution | lipgloss + ultraviolet layout |
| z-index overlays / modals | lipgloss Layer / Compositor (both on UV under the hood) |
