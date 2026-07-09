# Lipgloss v2 — distilled notes

Module: `charm.land/lipgloss/v2`.
Source: `/home/jcernuda/tui/research/lipgloss/`.

## Mental model
Declarative styling. `Style` is an **immutable builder** — every setter returns a copy.
Does styling + single-block layout. Does NOT solve multi-pane constraint layout (use ultraviolet for that).

Pipeline: `Style (chain) → Render(string) → ANSI-encoded string`.

## Essential style properties
```go
s := lipgloss.NewStyle().
    Foreground(lipgloss.Color("#7D56F4")).
    Background(lipgloss.Color("235")).
    Bold(true).
    Italic(true).
    Padding(1, 2).        // top/bot=1, l/r=2
    Margin(0, 1).
    Width(40).            // pad/truncate to 40 cells
    MaxWidth(80).
    Align(lipgloss.Center).
    Border(lipgloss.RoundedBorder()).
    BorderForeground(lipgloss.Color("#7D56F4"))

out := s.Render("hello")
```

Nesting model: `Margin [ Border [ Padding [ Content ] ] ]`.
- Padding: inside bg color.
- Margin: outside everything.
- Border: between.

## Colors
Three color spaces, auto-downsampled to terminal capability:
- ANSI 16: `"1"`–`"15"` (or `lipgloss.Red`, `lipgloss.BrightBlue` constants)
- ANSI 256: `"16"`–`"255"` (e.g. `lipgloss.Color("86")`)
- Truecolor: `"#RRGGBB"` (e.g. `lipgloss.Color("#7D56F4")`)

Adaptive (dark/light bg):
```go
dark := lipgloss.HasDarkBackground(os.Stdin, os.Stdout)
ld := lipgloss.LightDark(dark)
subtle := ld(lipgloss.Color("#D9DCCF"), lipgloss.Color("#383838"))  // light, dark
```
In Bubbletea, listen for `tea.BackgroundColorMsg` to update this flag dynamically.

## Borders (borders.go:70+)
Built-in: `NormalBorder()`, `RoundedBorder()`, `DoubleBorder()`, `ThickBorder()`,
`HiddenBorder()`, `BlockBorder()`.
Per-side: `.BorderTop(false)`, `.BorderLeft(false)`, etc. after `.Border(style, true)`.
Custom: construct a `lipgloss.Border{Top, Bottom, Left, Right, TopLeft, TopRight, BottomLeft, BottomRight, ...}` struct.

## Joining / placing
```go
// Multiple lines stacked vertically, each centered horizontally relative to widest
lipgloss.JoinVertical(lipgloss.Center, top, middle, bottom)

// Side-by-side, each aligned to top vertically
lipgloss.JoinHorizontal(lipgloss.Top, left, right)

// Position in a box
lipgloss.Place(w, h, lipgloss.Center, lipgloss.Center, content)
```
Position constants: `Top`, `Bottom`, `Left`, `Right`, `Center`, or any float 0.0–1.0.

## Width/Height measurement (size.go)
```go
w := lipgloss.Width(s)   // max cell width of any line (strips ANSI, handles CJK/emoji)
h := lipgloss.Height(s)  // count(\n) + 1
```
**Never use `len()` or `len([]rune())`** on ANSI/styled strings — wrong answer.

## Gotchas
1. Tabs are converted to spaces (default width 4). Set via `TabWidth(n)` or disable with `-1`.
2. Nesting styled strings inside outer styles: ANSI codes nest; usually works, but compose the final style before Render when possible.
3. `Inline(true)` strips `\n`. `Width(n)` + `Inline(false)` wraps.
4. Padding is part of width. `Width(40).Padding(0,2)` yields 40 total, 36 for content.
5. Render is pure — rendering the same Style twice is cheap; cache if hot path.
