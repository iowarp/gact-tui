package cli

import (
	"flag"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// cmdCtx bundles the per-subcommand plumbing that nearly every gact CLI
// command repeats verbatim: a flag.FlagSet carrying the standard
// --backend flag, the resolved backend URL, a ready *client.Client, and
// (when requested via withTimeout) a standard --timeout duration.
//
// newCmdCtx owns FlagSet creation, standard flag registration, and —
// crucially — derivation of the reorderFlagsFirst "known" set directly
// from the FlagSet (see deriveKnownFlags). That derivation is what keeps
// the flag-reordering table from drifting away from the flags a command
// actually registers, which was the source of the ~60 hand-maintained
// `known` maps this type replaces. newCmdCtx also owns backend
// resolution (resolveCLIBackend) and client construction (client.New) so
// no subcommand repeats that precedence logic.
type cmdCtx struct {
	// fs is the command's flag set. Command-specific flags are
	// registered on it via withFlags before parsing.
	fs *flag.FlagSet
	// backend is the resolved backend URL (defaults < config < env <
	// --backend), populated by newCmdCtx after parsing.
	backend string
	// client is a client.Client pointed at backend, ready to use.
	client *client.Client
	// timeout is the parsed --timeout value when withTimeout was
	// supplied; otherwise the zero value.
	timeout time.Duration

	backendFlag *string
	postParse   []func(*cmdCtx)
}

// cmdOpt customizes a cmdCtx while newCmdCtx is assembling it, before
// its flags are parsed.
type cmdOpt func(*cmdCtx)

// withFlags registers command-specific flags on the context's FlagSet.
// The register callback runs before parsing, so any flag pointers it
// captures are populated by newCmdCtx's Parse call and can be read by
// the caller once newCmdCtx returns.
func withFlags(register func(fs *flag.FlagSet)) cmdOpt {
	return func(c *cmdCtx) { register(c.fs) }
}

// withTimeout registers the standard --timeout duration flag with the
// given default and usage string, exposing the parsed value as
// c.timeout. Usage text is a parameter because the existing commands
// word it slightly differently ("abandon wait after this long" vs
// "abandon after this long"), and those strings are user-visible in the
// FlagSet's usage output.
func withTimeout(def time.Duration, usage string) cmdOpt {
	return func(c *cmdCtx) {
		p := c.fs.Duration("timeout", def, usage)
		c.postParse = append(c.postParse, func(cc *cmdCtx) { cc.timeout = *p })
	}
}

// newCmdCtx builds the command context for subcommand name from args.
// It creates the FlagSet, registers --backend, applies opts (which may
// register more flags), derives the reorder "known" set from every
// registered flag, reorders flags ahead of positionals, and parses.
// On a parse error it returns (nil, nil, 2) — flag.ContinueOnError has
// already printed the error and usage to the FlagSet's output, matching
// the previous per-command `return 2`. On success it resolves the
// backend, constructs the client, runs any post-parse hooks, and
// returns the context, the positional arguments, and 0.
func newCmdCtx(name string, args []string, opts ...cmdOpt) (*cmdCtx, []string, int) {
	c := &cmdCtx{fs: flag.NewFlagSet(name, flag.ContinueOnError)}
	c.backendFlag = c.fs.String("backend", defaultBackend, "GACT backend URL")
	for _, opt := range opts {
		opt(c)
	}
	if err := c.fs.Parse(reorderFlagsFirst(args, deriveKnownFlags(c.fs))); err != nil {
		return nil, nil, 2
	}
	c.backend = resolveCLIBackend(*c.backendFlag)
	c.client = client.New(c.backend)
	for _, hook := range c.postParse {
		hook(c)
	}
	return c, c.fs.Args(), 0
}

// deriveKnownFlags builds the reorderFlagsFirst "known" set from every
// value-taking flag registered on fs. Each flag name yields both its
// single-dash and double-dash spellings (Go's flag package accepts
// either), so a command that registers -o also reorders --o. Deriving
// this from the FlagSet is the whole point of cmdCtx: the table can
// never disagree with the flags that are actually defined.
//
// Boolean flags are deliberately excluded: reorderFlagsFirst's contract
// is that every known flag consumes the following token as its value,
// which would drag the next positional into the flags region after a
// bare bool like --all (e.g. `export SID --all -o dir` would pair -o
// with SID). Excluded, bools hit reorderFlagsFirst's pass-through-alone
// branch — exactly how the hand-maintained known maps this helper
// replaced treated them. Bool detection uses the flag package's own
// IsBoolFlag protocol, which stdlib bool flags implement.
func deriveKnownFlags(fs *flag.FlagSet) map[string]bool {
	known := map[string]bool{}
	fs.VisitAll(func(f *flag.Flag) {
		if b, ok := f.Value.(interface{ IsBoolFlag() bool }); ok && b.IsBoolFlag() {
			return
		}
		known["-"+f.Name] = true
		known["--"+f.Name] = true
	})
	return known
}
