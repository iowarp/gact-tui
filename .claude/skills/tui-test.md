---
name: tui-test
description: Scaffold or run a deterministic golden-file unit test for a Bubbletea v2 model using teatest v2. Use when adding test coverage for a TUI component, or when a user reports a state-transition bug in a Bubbletea app.
---

# tui-test

Scaffolds or runs a golden-file test for a Bubbletea model using
`github.com/charmbracelet/x/exp/teatest/v2`. Tests assert on state transitions
and rendered ANSI output at a fixed window size — fast, deterministic, CI-safe.

## When to invoke
- Adding test coverage for a Bubbletea Model.
- A user reports "when I press X then Y, state goes wrong."
- Before a refactor, to lock current behavior.

**Don't use this for:** visual regression (use `tui-screenshot` instead),
integration with real backends (use VHS + fake server), or concurrency bugs
(teatest is deterministic; races won't reproduce).

## Inputs required
- `$MODEL_FILE`: path to the Go file defining the Model (must be in the app's Go module).
- `$SCENARIOS`: list of named input sequences to test (e.g. "initial render", "after ctrl+n", "type hello then enter"). Ask the user for these if missing.

## Template

Create `${MODEL_FILE%%.go}_test.go` with this structure (adapt package name to match `$MODEL_FILE`'s package):

```go
package yourpkg

import (
	"bytes"
	"io"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/exp/teatest/v2"
)

func TestModelGolden(t *testing.T) {
	cases := []struct {
		name string
		drive func(t *testing.T, tm *teatest.TestModel)
	}{
		{
			name: "initial_render",
			drive: func(t *testing.T, tm *teatest.TestModel) {
				// no-op: snapshot the first frame
			},
		},
		{
			name: "after_input",
			drive: func(t *testing.T, tm *teatest.TestModel) {
				tm.Type("hello")
				tm.Send(tea.KeyPressMsg{Code: tea.KeyEnter, Text: "\r"})
				teatest.WaitFor(t, tm.Output(),
					func(b []byte) bool { return bytes.Contains(b, []byte("hello")) },
					teatest.WithDuration(time.Second),
					teatest.WithCheckInterval(50*time.Millisecond),
				)
			},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			tm := teatest.NewTestModel(t, NewModel(),
				teatest.WithInitialTermSize(80, 24),
			)
			t.Cleanup(func() { _ = tm.Quit() })

			c.drive(t, tm)

			out, err := io.ReadAll(tm.FinalOutput(t, teatest.WithFinalTimeout(time.Second)))
			if err != nil {
				t.Fatal(err)
			}
			teatest.RequireEqualOutput(t, out)
		})
	}
}
```

## Running

1. First run creates goldens:
   ```
   cd $(dirname $MODEL_FILE) && go test -run TestModelGolden -update ./...
   ```
   Inspect `testdata/TestModelGolden/<scenario>.golden` files. Commit them.

2. Subsequent runs compare:
   ```
   go test -run TestModelGolden ./...
   ```

3. Intentional output change → re-run with `-update`, review the diff, commit.

## Determinism checklist
teatest sets reasonable defaults, but for tight control use `WithProgramOptions`:

```go
tm := teatest.NewTestModel(t, NewModel(),
    teatest.WithInitialTermSize(80, 24),
    teatest.WithProgramOptions(
        tea.WithColorProfile(colorprofile.ANSI256),
        tea.WithEnvironment([]string{"TERM=xterm-256color"}),
    ),
)
```

Without these, goldens may differ between laptop and CI.

## Gotchas
- Use `teatest.WaitFor` on expected output strings before calling `FinalOutput`.
  Never `time.Sleep` — it's flaky.
- `FinalOutput` blocks until the program exits. If your model doesn't Quit on
  its own, send `tea.Quit` in your driver.
- Goldens are raw bytes including ANSI — if you change a color slightly, every
  golden using that style breaks. Isolate styling changes to dedicated PRs.
- Tests in the same package as the model can access unexported fields for more
  granular assertions when golden-on-output isn't enough.
