package main

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
		name  string
		drive func(t *testing.T, tm *teatest.TestModel)
	}{
		{
			name:  "initial_render",
			drive: func(t *testing.T, tm *teatest.TestModel) {},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			tm := teatest.NewTestModel(t, model{},
				teatest.WithInitialTermSize(80, 24),
			)
			t.Cleanup(func() { _ = tm.Quit() })

			c.drive(t, tm)

			teatest.WaitFor(t, tm.Output(),
				func(b []byte) bool { return bytes.Contains(b, []byte("Loop Closure Test")) },
				teatest.WithDuration(2*time.Second),
				teatest.WithCheckInterval(50*time.Millisecond),
			)

			tm.Send(tea.KeyPressMsg{Code: 'q', Text: "q"})

			out, err := io.ReadAll(tm.FinalOutput(t, teatest.WithFinalTimeout(2*time.Second)))
			if err != nil {
				t.Fatal(err)
			}
			teatest.RequireEqualOutput(t, out)
		})
	}
}
