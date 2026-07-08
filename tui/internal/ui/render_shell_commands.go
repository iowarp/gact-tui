package ui

// render_shell_commands.go summarizes shell-command intent and extracts redirect/path tokens.

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strings"
)

func summarizeShellCommandIntent(command string) string {
	command = strings.TrimSpace(command)
	if command == "" {
		return ""
	}
	lower := strings.ToLower(command)
	if dest := shellRedirectDestination(command); dest != "" {
		switch {
		case strings.Contains(lower, "cut "), strings.Contains(lower, "awk "), strings.Contains(lower, "sed "):
			return "prepare " + valuefmt.ShortenPathForInline(dest)
		default:
			return "write " + valuefmt.ShortenPathForInline(dest)
		}
	}
	fields := strings.Fields(command)
	if len(fields) == 0 {
		return "workspace command"
	}
	switch fields[0] {
	case "date":
		return "check date/time"
	case "pwd":
		return "check current folder"
	case "head", "tail", "cat":
		if path := lastShellPathToken(fields); path != "" {
			return "preview " + valuefmt.ShortenPathForInline(path)
		}
	case "python", "python3":
		return "run Python analysis"
	case "Rscript":
		return "run R analysis"
	case "mkdir":
		return "create workspace folder"
	case "rm":
		return "remove workspace path"
	}
	return "workspace command"
}

func shellRedirectDestination(command string) string {
	idx := strings.LastIndex(command, ">")
	if idx < 0 || idx+1 >= len(command) {
		return ""
	}
	rest := strings.TrimSpace(command[idx+1:])
	rest = strings.TrimLeft(rest, "> ")
	fields := strings.Fields(rest)
	if len(fields) == 0 {
		return ""
	}
	return strings.Trim(fields[0], `"'`)
}

func lastShellPathToken(fields []string) string {
	for i := len(fields) - 1; i >= 0; i-- {
		token := strings.Trim(fields[i], `"'`)
		if strings.Contains(token, "/") || strings.Contains(token, ".") {
			return token
		}
	}
	return ""
}
