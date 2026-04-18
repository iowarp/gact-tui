---
name: tui-screenshot
description: Build a Bubbletea TUI binary, drive it through a VHS tape, produce a PNG screenshot, and read it back. Use this to close the visual feedback loop and verify layout/colors/alignment of a TUI.
---

# tui-screenshot

Produce a viewable PNG of a Bubbletea TUI at a specific state. Use when you've
changed TUI code and need to verify the *rendered* output — not just the Model
state — before trusting it.

## When to invoke
- After editing Bubbletea View / layout / lipgloss styling.
- When a user reports "this looks wrong" — screenshot it first, don't guess.
- Before declaring a TUI task complete.

## Inputs required
- `$APP_DIR`: absolute path to a Go module containing a Bubbletea main package (e.g. `/home/jcernuda/tui/loop-test`).
- `$SCRIPT`: one-line description of what to do in the app (e.g. `press Tab then type "hello"`). For simplest case: just run and screenshot the initial screen.
- `$WAIT_FOR` (optional): a string that should appear on screen before taking the screenshot. If omitted, use a fixed sleep.

If any are missing from context, ask the user for them.

## Steps

1. **Build the binary.**
   ```
   cd $APP_DIR && go build -o hello .
   ```
   If the build fails, fix compile errors before continuing. Do not proceed with a stale binary.

2. **Write/overwrite `$APP_DIR/hello.tape`** with:
   ```
   Output hello.gif

   Set Shell "bash"
   Set FontSize 18
   Set Width 900
   Set Height 500

   Hide
   Type "./hello"
   Enter
   Show

   Sleep 500ms
   # → insert Type/Enter/Key commands for $SCRIPT here
   Wait+Screen /<$WAIT_FOR or a known-visible string>/
   Screenshot screenshot.png
   Sleep 300ms
   Type "q"
   ```

   **CRITICAL**: use `Wait+Screen /regex/`, NOT `Wait /regex/`. The latter only
   matches the last line; on a bordered TUI the last line is `╰─╯` and the wait
   will time out. This has burned us before.

3. **Run VHS.**
   ```
   cd $APP_DIR && vhs hello.tape
   ```
   Expect `Creating hello.gif...` at the end. If you see `timeout waiting for
   "Line X" to match Y` → the `Wait+Screen` regex didn't match. Open `hello.gif`
   or lower `Wait` timeout and re-examine.

4. **Read the screenshot.**
   ```
   Read $APP_DIR/screenshot.png
   ```
   Claude Code will display the PNG inline. Now you can actually *see* the TUI
   and verify colors, alignment, border corners, padding, text rendering.

## Verification checklist (what to look for in the PNG)
- Border corners align (╭ ╮ ╰ ╯ in same columns on opposite sides).
- Colors render as intended (not just "some color").
- Dividers span the full content width, not short.
- Padding is consistent on all four sides.
- No double-width character truncation or overflow.
- Cursor (if visible) is in the expected cell.

## Cleanup
Leave `hello.gif` and `screenshot.png` in the app dir — they're useful as the
most recent visual state for comparison on the next iteration.
