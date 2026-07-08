# Testing Bubbletea models — distilled notes

Two APIs; both use `github.com/charmbracelet/x/exp/golden` for snapshot comparison.

## Option A: teatest v2 (recommended, higher-level)
Import: `github.com/charmbracelet/x/exp/teatest/v2`.
Source: `/home/jcernuda/tui/research/charmbracelet-x/exp/teatest/v2/teatest.go`.

```go
import (
    "io"
    "testing"
    "time"

    tea "charm.land/bubbletea/v2"
    "github.com/charmbracelet/x/exp/teatest/v2"
)

func TestApp(t *testing.T) {
    tm := teatest.NewTestModel(t, NewModel(),
        teatest.WithInitialTermSize(80, 24),
    )
    t.Cleanup(func() { _ = tm.Quit() })

    tm.Type("hello")
    tm.Send(tea.KeyPressMsg{Code: tea.KeyEnter})

    // Wait for expected substring in output before asserting.
    teatest.WaitFor(t, tm.Output(),
        func(b []byte) bool { return bytes.Contains(b, []byte("hello")) },
        teatest.WithDuration(time.Second),
        teatest.WithCheckInterval(50*time.Millisecond),
    )

    out, _ := io.ReadAll(tm.FinalOutput(t, teatest.WithFinalTimeout(time.Second)))
    teatest.RequireEqualOutput(t, out)
}
```

API surface:
- `NewTestModel(t, model, ...TestOption)` → `*TestModel`
- `TestModel.Type(s)`, `.Send(msg)`, `.Quit()`, `.Output() io.Reader`, `.FinalOutput(t, ...)`
- `WaitFor(t, reader, predicate, ...)` — poll until predicate true
- `RequireEqualOutput(t, bytes)` — golden compare

## Option B: raw Program (what bubbletea itself uses, screen_test.go:61-158)
Lower-level but bulletproof and deterministic:

```go
var out, in bytes.Buffer
p := tea.NewProgram(NewModel(),
    tea.WithWindowSize(80, 24),
    tea.WithColorProfile(colorprofile.ANSI256),
    tea.WithEnvironment([]string{"TERM=xterm-256color"}),
    tea.WithInput(&in),
    tea.WithOutput(&out),
)
go p.Send(tea.Sequence(
    /* your scripted msgs */,
    tea.Quit,
))
if _, err := p.Run(); err != nil { t.Fatal(err) }
golden.RequireEqual(t, out.Bytes())
```

## Golden files
- Path: `testdata/<TestName>/<subtest>.golden` (auto-derived from t.Name()).
- Format: raw bytes. ANSI preserved (escape-normalized during comparison).
- **Update with**: `go test ./... -update` (or env var depending on golden version).
- Commit goldens to git. Review diffs on update like code.

## Determinism checklist
Always set these for reproducible goldens:
1. `WithWindowSize(w, h)` — fixed dimensions
2. `WithColorProfile(colorprofile.ANSI256)` — matches what CI sees
3. `WithEnvironment([]string{"TERM=xterm-256color"})` — overrides $TERM
4. `WithInput(&bytes.Buffer{})` — no stdin surprises
5. `WithOutput(&buf)` — captured, no real terminal

Without these, goldens will pass locally and fail on CI (or vice versa).

## What these tests catch
- State transitions in Update (via final model assertions).
- Rendered layout at fixed size (via golden on buf).

## What they DON'T catch
- Color accuracy (ANSI code is right, but does terminal render it?).
- Font spacing, border char rendering, CJK width drift.
- Timing / race / goroutine correctness.

**For those, use the VHS loop (`tui-screenshot` skill).**
