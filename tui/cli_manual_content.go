package main

const gactManualText = `GACT(1)

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
  run the interactive TUI, deploy local adapters such as CLIO, connect
  to a registered adapter, manage sessions, inspect logs, and call
  backend contract surfaces from scripts.

TOP COMMANDS
  gact
      Start the interactive TUI against the configured backend.

  gact deploy <kind> <name>
      Spawn an adapter in the background and register it locally.
      For CLIO, the common flow is:
          gact deploy clio myclio
          gact connect myclio

  gact connect <name>
      Launch the TUI pointed at a deployed agent.

  gact agent list
      Show deployed agents, including host, port, pid, and liveness.

  gact agent stop <name>
      Stop a deployed adapter process.

  gact agent rm <name>
      Remove the local registry entry. Stops the process first if it is
      still running.

COMMON SESSION COMMANDS
  gact new [--title T]
      Create a session and print its id.

  gact ask <sid> <q|->
      Send a question, wait for completion, and print the assistant
      reply.

  gact send <sid> <text|->
      Post a user message to a session.

  gact run <sid> <text|->
      Send and wait in one command.

  gact log <sid>
      Dump conversation messages. Use --format json for NDJSON,
      --role to filter roles, and --grep to filter text.

  gact list
      List recent sessions.

CONFIGURATION
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

const gactManualRoff = `.TH GACT 1 "May 2026" "gact 0.2" "User Commands"
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
interactive TUI, deploy local adapters such as CLIO, connect to a registered
adapter, manage sessions, inspect logs, and call backend contract surfaces from
scripts.
.SH TOP COMMANDS
.TP
.B gact
Start the interactive TUI against the configured backend.
.TP
.B gact deploy <kind> <name>
Spawn an adapter in the background and register it locally. For CLIO, the
common flow is:
.RS
.EX
gact deploy clio myclio
gact connect myclio
.EE
.RE
.TP
.B gact connect <name>
Launch the TUI pointed at a deployed agent.
.TP
.B gact agent list
Show deployed agents, including host, port, pid, and liveness.
.TP
.B gact agent stop <name>
Stop a deployed adapter process.
.TP
.B gact agent rm <name>
Remove the local registry entry. Stops the process first if it is still running.
.SH COMMON SESSION COMMANDS
.TP
.B gact new [--title T]
Create a session and print its id.
.TP
.B gact ask <sid> <q|->
Send a question, wait for completion, and print the assistant reply.
.TP
.B gact send <sid> <text|->
Post a user message to a session.
.TP
.B gact run <sid> <text|->
Send and wait in one command.
.TP
.B gact log <sid>
Dump conversation messages. Use
.B --format json
for NDJSON,
.B --role
to filter roles, and
.B --grep
to filter text.
.TP
.B gact list
List recent sessions.
.SH CONFIGURATION
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
