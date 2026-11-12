package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
)

// envDesktopVersion carries the desktop's own app version (for example
// "0.9.6", "0.9.6+1" or "0.9.6-2+1"). The Tauri supervisor sets it
// (supervisor_spawn_command.rs DESKTOP_VERSION_ENV; the two names must agree).
const envDesktopVersion = "GACT_DESKTOP_VERSION"

// maxLauncherScan bounds how much of a console-script launcher is read while
// looking for its interpreter. Script launchers are tens of kilobytes; a
// larger file is not one and is never read in full.
const maxLauncherScan = 4 << 20

var (
	windowsInterpreter = regexp.MustCompile(`(?i)[a-z]:\\[^\x00-\x1f"<>|*?]*?\\pythonw?\.exe`)
	shebangInterpreter = regexp.MustCompile(`^#!\s*(/\S*python[0-9.]*)`)
)

// stalePathAgent explains why the clio-agent-gact at bin must not be used,
// or returns "" when it may be. It reads the installed clio-agent version
// from package metadata instead of running the binary, whose import alone
// takes seconds.
//
// Without a desktop version to compare against (a launcher run outside the
// desktop, or an older desktop) every PATH candidate is accepted, as before.
// Any release of the desktop's own X.Y.Z or newer is current; a binary whose
// version cannot be read is not trusted over a managed install.
func stalePathAgent(bin string) string {
	desktop := os.Getenv(envDesktopVersion)
	floor := releaseNumbers(desktop)
	if floor == nil {
		return ""
	}
	installed := installedAgentVersion(bin)
	if installed == "" {
		return "its clio-agent version could not be read"
	}
	if compareRelease(releaseNumbers(installed), floor) < 0 {
		return fmt.Sprintf("clio-agent %s is older than this desktop (%s)", installed, desktop)
	}
	return ""
}

// releaseNumbers returns the leading dotted release numbers of a version:
// "0.9.6-2+1" and "0.9.6b2.post1" give [0 9 6], "0.9.5.1" gives [0 9 5 1].
// It returns nil when the version does not start with a number.
func releaseNumbers(version string) []int {
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	var numbers []int
	for _, part := range strings.Split(version, ".") {
		end := 0
		for end < len(part) && part[end] >= '0' && part[end] <= '9' {
			end++
		}
		if end == 0 {
			break
		}
		n, err := strconv.Atoi(part[:end])
		if err != nil {
			break
		}
		numbers = append(numbers, n)
		if end < len(part) {
			break
		}
	}
	return numbers
}

// compareRelease orders two release-number lists; missing numbers count as 0.
func compareRelease(a, b []int) int {
	for i := 0; i < len(a) || i < len(b); i++ {
		var x, y int
		if i < len(a) {
			x = a[i]
		}
		if i < len(b) {
			y = b[i]
		}
		if x != y {
			if x < y {
				return -1
			}
			return 1
		}
	}
	return 0
}

// installedAgentVersion finds the clio-agent distribution behind a
// console-script launcher and returns its version, or "" when none is found.
// It looks in the environment the launcher sits in (venv Scripts/ or bin/)
// and in the environment of the interpreter the launcher names: a Windows
// launcher (uv or pip) embeds the interpreter's absolute path, a POSIX one
// names it in its shebang.
func installedAgentVersion(bin string) string {
	if resolved, err := filepath.EvalSymlinks(bin); err == nil {
		bin = resolved
	}
	roots := []string{filepath.Dir(filepath.Dir(bin))}
	if python := launcherInterpreter(bin); python != "" {
		dir := filepath.Dir(python)
		roots = append(roots, filepath.Dir(dir), dir)
	}
	for _, root := range roots {
		if version := distInfoVersion(root); version != "" {
			return version
		}
	}
	return ""
}

func launcherInterpreter(bin string) string {
	file, err := os.Open(bin)
	if err != nil {
		return ""
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxLauncherScan))
	if err != nil {
		return ""
	}
	if match := shebangInterpreter.FindSubmatch(data); match != nil {
		return string(match[1])
	}
	if runtime.GOOS == "windows" {
		if matches := windowsInterpreter.FindAll(data, -1); len(matches) > 0 {
			return string(matches[len(matches)-1])
		}
	}
	return ""
}

// distInfoVersion reads the clio-agent version from the dist-info directory
// name in an environment's site-packages.
func distInfoVersion(root string) string {
	for _, pattern := range []string{
		filepath.Join(root, "Lib", "site-packages", "clio_agent-*.dist-info"),
		filepath.Join(root, "python", "Lib", "site-packages", "clio_agent-*.dist-info"),
		filepath.Join(root, "lib", "python*", "site-packages", "clio_agent-*.dist-info"),
	} {
		matches, _ := filepath.Glob(pattern)
		for _, match := range matches {
			name := strings.TrimSuffix(filepath.Base(match), ".dist-info")
			if version := strings.TrimPrefix(name, "clio_agent-"); version != "" {
				return version
			}
		}
	}
	return ""
}
