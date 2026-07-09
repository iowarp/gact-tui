package cli

import (
	"fmt"
	"os"
)

// printUsage writes the `gact --help` text. The content is generated from the
// single command table (see commands.go / renderUsage) so it can never drift
// from what Dispatch actually accepts.
func printUsage() { fmt.Print(renderUsage()) }

// runDiag writes a structured diagnostic report to stdout: binary
// version, contract version, Go runtime, resolved config path + its
// fields, resolved theme, and whether a custom theme file was found.
// Non-interactive; exits zero after printing. Useful for bug reports.
// runDiag delegates to writeDiagToVerbose(os.Stdout) so there's exactly
// one place that knows the report shape. The verbose variant adds the
// "custom theme" + "config load error" rows that the dump-bundle variant
// historically omitted.
func runDiag() { writeDiagToVerbose(os.Stdout) }
