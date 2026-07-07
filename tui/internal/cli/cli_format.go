package cli

import (
	"fmt"
	"os"
	"time"
)

// ansi* are the single-byte-sequence color codes used by lightweight
// CLI commands. We stay dependency-free here (no lipgloss) so the CLI
// binary stays small; these 4 strings cover the narrow palette we need.
const (
	ansiReset = "\x1b[0m"
	ansiGreen = "\x1b[32m"
	ansiRed   = "\x1b[31m"
	ansiDim   = "\x1b[2m"
)

// colorize wraps s in an ANSI sequence when stdout is a terminal
// (detected via file-mode check), otherwise returns the raw string so
// piped output isn't cluttered with escape codes.
func colorize(s, code string) string {
	fi, err := os.Stdout.Stat()
	if err != nil || (fi.Mode()&os.ModeCharDevice) == 0 {
		return s
	}
	return code + s + ansiReset
}

// humanizeAge renders a duration as a short human string ("3m", "2h",
// "5d") for compact CLI age columns. Negative durations clamp to "0s"
// so clock skew does not print confusing rows.
func humanizeAge(d time.Duration) string {
	if d < 0 {
		return "0s"
	}
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

// truncMid trims s to width by replacing the middle with `...`, keeping
// both prefix and suffix so generated ids stay recognisable.
func truncMid(s string, width int) string {
	if len(s) <= width {
		return s
	}
	if width <= 1 {
		return "…"
	}
	half := (width - 1) / 2
	return s[:half] + "…" + s[len(s)-half:]
}
