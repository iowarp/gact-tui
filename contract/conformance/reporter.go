// Reporter abstracts the *testing.T methods the conformance check
// functions use, so the suite can run from either `go test` or a
// command-line tool. (SSS1)
//
// The interface is deliberately minimal: Helper, Run (recursive),
// Errorf (non-fatal), Fatal/Fatalf (fail-now). It mirrors testing.T
// behaviour: Fatal aborts the current Run via panic and is caught by
// the parent Run's recover, so subsequent sections still execute.
package conformance

import (
	"fmt"
	"strings"
	"testing"
)

// Reporter is the test-runner interface used by the conformance
// suite. *testing.T satisfies it via testTReporter; CLIReporter
// implements it for command-line use.
type Reporter interface {
	Helper()
	Run(name string, fn func(Reporter))
	Errorf(format string, args ...any)
	Fatal(args ...any)
	Fatalf(format string, args ...any)
}

// fatalSentinel is the panic value used by CLIReporter.Fatal/Fatalf
// to unwind to the enclosing Run. testing.T uses runtime.Goexit for
// the same effect inside its harness; in plain code, panic+recover
// is the equivalent.
type fatalSentinel struct{}

// FromTest wraps a *testing.T as a Reporter. Use this when calling
// the conformance suite from a normal Go test.
func FromTest(t *testing.T) Reporter {
	return &testTReporter{t: t}
}

type testTReporter struct{ t *testing.T }

func (r *testTReporter) Helper()                              { r.t.Helper() }
func (r *testTReporter) Errorf(format string, args ...any)    { r.t.Errorf(format, args...) }
func (r *testTReporter) Fatal(args ...any)                    { r.t.Fatal(args...) }
func (r *testTReporter) Fatalf(format string, args ...any)    { r.t.Fatalf(format, args...) }
func (r *testTReporter) Run(name string, fn func(Reporter)) {
	r.t.Run(name, func(child *testing.T) {
		fn(&testTReporter{t: child})
	})
}

// CLIReporter accumulates pass/fail results into a tree and writes
// progress to its Out writer (or os.Stderr if nil). After Run() the
// caller can inspect Failed / FailedSections to decide an exit code.
type CLIReporter struct {
	Name     string
	Out      func(string) // line writer; defaults to fmt.Println
	Failed   bool
	Children []*CLIReporter

	// internal: the writer the root inherits to all children unless
	// overridden. Set by NewCLIReporter.
	parent *CLIReporter
}

// NewCLIReporter constructs a root reporter with the given line
// writer. Pass nil for stdout via fmt.Println.
func NewCLIReporter(out func(string)) *CLIReporter {
	if out == nil {
		out = func(s string) { fmt.Println(s) }
	}
	return &CLIReporter{Out: out}
}

func (r *CLIReporter) writer() func(string) {
	if r.Out != nil {
		return r.Out
	}
	if r.parent != nil {
		return r.parent.writer()
	}
	return func(s string) { fmt.Println(s) }
}

func (r *CLIReporter) Helper() {} // no-op for CLI

func (r *CLIReporter) Errorf(format string, args ...any) {
	r.Failed = true
	r.writer()(fmt.Sprintf("    ✗ "+format, args...))
	r.markParentsFailed()
}

func (r *CLIReporter) Fatal(args ...any) {
	r.Failed = true
	r.writer()(fmt.Sprintf("    ✗ %s", fmt.Sprint(args...)))
	r.markParentsFailed()
	panic(fatalSentinel{})
}

func (r *CLIReporter) Fatalf(format string, args ...any) {
	r.Failed = true
	r.writer()(fmt.Sprintf("    ✗ "+format, args...))
	r.markParentsFailed()
	panic(fatalSentinel{})
}

func (r *CLIReporter) Run(name string, fn func(Reporter)) {
	child := &CLIReporter{Name: name, parent: r}
	r.Children = append(r.Children, child)
	w := r.writer()
	indent := strings.Repeat("  ", child.depth())
	w(fmt.Sprintf("%s▶ %s", indent, name))
	defer func() {
		if rec := recover(); rec != nil {
			if _, ok := rec.(fatalSentinel); !ok {
				panic(rec) // not our sentinel — re-raise
			}
		}
		mark := "✓"
		if child.Failed {
			mark = "✗"
		}
		w(fmt.Sprintf("%s%s %s", indent, mark, name))
	}()
	fn(child)
}

func (r *CLIReporter) markParentsFailed() {
	for p := r.parent; p != nil; p = p.parent {
		p.Failed = true
	}
}

func (r *CLIReporter) depth() int {
	d := 0
	for p := r.parent; p != nil; p = p.parent {
		d++
	}
	return d
}

// FailedSections returns the names of every leaf section that failed,
// joined by " > " for nested paths. Empty when everything passed.
func (r *CLIReporter) FailedSections() []string {
	var out []string
	r.collectFailed("", &out)
	return out
}

func (r *CLIReporter) collectFailed(prefix string, out *[]string) {
	for _, c := range r.Children {
		path := c.Name
		if prefix != "" {
			path = prefix + " > " + c.Name
		}
		// Only record leaves so a failed Run doesn't double-count its
		// failed subsection.
		if c.Failed && len(c.Children) == 0 {
			*out = append(*out, path)
		}
		c.collectFailed(path, out)
	}
}
