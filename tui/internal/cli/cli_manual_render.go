package cli

import "strings"

// manualText renders the `gact man` plain-text manual. The framing sections
// (NAME/SYNOPSIS/DESCRIPTION/CONFIGURATION/MANUAL INTEGRATION/SEE ALSO) are
// static; the TOP COMMANDS and COMMON SESSION COMMANDS bodies are generated
// from the single command table so they can never drift from `gact --help` or
// from what Dispatch accepts.
func manualText() string {
	var b strings.Builder
	b.WriteString(manTextHead)
	b.WriteString("TOP COMMANDS\n")
	b.WriteString("  gact\n      Start the interactive TUI against the configured backend.\n\n")
	writeManTextSection(&b, groupTop)
	b.WriteString("COMMON SESSION COMMANDS\n")
	writeManTextSection(&b, groupCommon)
	b.WriteString(manTextTail)
	return b.String()
}

// writeManTextSection renders every command in group g that carries a ManBody,
// as an indented plain-text block.
func writeManTextSection(b *strings.Builder, g commandGroup) {
	for i := range commandTable {
		c := &commandTable[i]
		if c.Group != g || c.ManBody == "" {
			continue
		}
		head := "gact " + c.Name
		if c.Argspec != "" {
			head += " " + c.Argspec
		}
		b.WriteString("  " + head + "\n")
		for _, line := range strings.Split(c.ManBody, "\n") {
			if line == "" {
				b.WriteByte('\n')
			} else {
				b.WriteString("      " + line + "\n")
			}
		}
		b.WriteByte('\n')
	}
}

// manualRoff renders the `gact man --format roff` manpage source, also used by
// `gact man --install` to write gact.1. Framing is static; the command bodies
// come from the same command table as the text form.
func manualRoff() string {
	var b strings.Builder
	b.WriteString(manRoffHead)
	b.WriteString(".SH TOP COMMANDS\n")
	b.WriteString(".TP\n.B gact\nStart the interactive TUI against the configured backend.\n")
	writeManRoffSection(&b, groupTop)
	b.WriteString(".SH COMMON SESSION COMMANDS\n")
	writeManRoffSection(&b, groupCommon)
	b.WriteString(manRoffTail)
	return b.String()
}

// writeManRoffSection renders every command in group g that carries a ManBody
// as a roff .TP entry (prose lines are left-trimmed so roff reflows them).
func writeManRoffSection(b *strings.Builder, g commandGroup) {
	for i := range commandTable {
		c := &commandTable[i]
		if c.Group != g || c.ManBody == "" {
			continue
		}
		head := "gact " + c.Name
		if c.Argspec != "" {
			head += " " + c.Argspec
		}
		b.WriteString(".TP\n.B " + head + "\n")
		for j, line := range strings.Split(c.ManBody, "\n") {
			trimmed := strings.TrimLeft(line, " ")
			// An originally-indented continuation (e.g. a command inside a flow)
			// gets a .br so roff keeps it on its own line instead of reflowing it
			// into the surrounding prose.
			if j > 0 && line != trimmed {
				b.WriteString(".br\n")
			}
			b.WriteString(trimmed + "\n")
		}
	}
}

const manTextHead = `GACT(1)

NAME
  gact - GACT terminal client and local agent launcher

SYNOPSIS
  gact
  gact deploy <kind> <name> [--port N] [--cwd DIR] [--bin PATH]
  gact connect <name>
  gact agent list
  gact agent stop <name>
  gact agent rm <name>
  gact ask <sid> <q|->
  gact man [--format text|roff] [--install]

DESCRIPTION
  gact is a terminal client for GACT-compatible agent backends. It can
  run the interactive TUI, deploy local adapters, connect
  to a registered adapter, manage sessions, inspect logs, and call
  backend contract surfaces from scripts.

`

const manTextTail = `CONFIGURATION
  Backend resolution order:
      built-in default < config file < GACT_BACKEND < --backend

  Theme resolution order:
      built-in default < config file < GACT_THEME < --theme

  The sample config can be printed with:
      gact emit-config

MANUAL INTEGRATION
  gact man
      Print this manual on every supported platform.

  gact man --format roff
      Print the Unix manpage source.

  gact man --install
      On Linux/macOS, install gact.1 under the user's man directory so
      man gact can resolve it. On Windows PowerShell, install an
      explicit profile shim because man is an alias for Get-Help, not a
      real manpage reader.

SEE ALSO
  gact --help
  gact diag
  gact capabilities
`

const manRoffHead = `.TH GACT 1 "May 2026" "gact 0.2" "User Commands"
.SH NAME
gact \- GACT terminal client and local agent launcher
.SH SYNOPSIS
.B gact
.br
.B gact deploy
.I kind name
.RI [ --port " N" ]
.RI [ --cwd " DIR" ]
.RI [ --bin " PATH" ]
.br
.B gact connect
.I name
.br
.B gact agent list
.br
.B gact agent stop
.I name
.br
.B gact agent rm
.I name
.br
.B gact ask
.I sid q|-
.br
.B gact man
.RI [ --format " text|roff]"
.RI [ --install ]
.SH DESCRIPTION
.B gact
is a terminal client for GACT-compatible agent backends. It can run the
interactive TUI, deploy local adapters, connect to a registered
adapter, manage sessions, inspect logs, and call backend contract surfaces from
scripts.
`

const manRoffTail = `.SH CONFIGURATION
Backend resolution order:
.RS
built-in default < config file < GACT_BACKEND < --backend
.RE
.PP
Theme resolution order:
.RS
built-in default < config file < GACT_THEME < --theme
.RE
.PP
The sample config can be printed with:
.RS
.EX
gact emit-config
.EE
.RE
.SH MANUAL INTEGRATION
.TP
.B gact man
Print this manual on every supported platform.
.TP
.B gact man --format roff
Print the Unix manpage source.
.TP
.B gact man --install
On Linux/macOS, install
.B gact.1
under the user's man directory so
.B man gact
can resolve it. On Windows PowerShell, install an explicit profile shim because
.B man
is an alias for
.B Get-Help,
not a real manpage reader.
.SH SEE ALSO
.BR gact (1),
.BR gact\ --help ,
.BR gact\ diag ,
.BR gact\ capabilities
`
