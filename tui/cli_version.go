package main

import (
	"fmt"
	"io"
	"os"
	"runtime"
	"runtime/debug"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/version"
)

var (
	// binaryVersion/contractVersion are sourced from internal/version so the
	// version string has a single source of truth. binaryVersion resolves the
	// git-describe tag injected via -ldflags by the Makefile (e.g.
	// v0.3.0-2098-g31c252e7), falling back to embedded VCS info for a plain
	// `go build`. The buildRevision/buildTime/buildDirty -ldflags below still
	// drive the detailed `revision:` line.
	binaryVersion   = version.Resolve()
	contractVersion = version.Contract
)

var (
	buildRevision string
	buildTime     string
	buildDirty    string
)

// runVersion prints binary + contract version and (when available)
// the VCS revision and build time from Go's embedded build info.
// Lets users confirm which commit they're running when filing bugs.
// Falls back to the manual binaryVersion when ReadBuildInfo is empty
// (e.g. tests without a module context).
func runVersion() {
	writeVersionReport(os.Stdout, false)
}

func writeVersionReport(w io.Writer, includePlatform bool) {
	fmt.Fprintf(w, "gact %s (contract %s)\n", binaryVersion, contractVersion)
	rev, when, dirty := readVCSInfo()
	if rev != "" {
		suffix := ""
		if dirty {
			suffix = " (dirty)"
		}
		fmt.Fprintf(w, "  revision: %s%s\n", rev, suffix)
	}
	if when != "" {
		fmt.Fprintf(w, "  built:    %s\n", when)
	}
	if info, ok := debug.ReadBuildInfo(); ok {
		fmt.Fprintf(w, "  go:       %s\n", info.GoVersion)
	}
	if includePlatform {
		fmt.Fprintf(w, "  platform: %s/%s\n", runtime.GOOS, runtime.GOARCH)
	}
}

// readVCSInfo extracts (short revision, build time, dirty?) from an
// explicit release/dev-build override when present, otherwise from
// runtime/debug.ReadBuildInfo. Used by both `gact version` and
// `gact diag` so the output stays consistent across both surfaces.
func readVCSInfo() (rev, when string, dirty bool) {
	if strings.TrimSpace(buildRevision) != "" {
		rev = strings.TrimSpace(buildRevision)
		if len(rev) > 12 {
			rev = rev[:12]
		}
		return rev, strings.TrimSpace(buildTime), strings.EqualFold(strings.TrimSpace(buildDirty), "true")
	}
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "", "", false
	}
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			rev = s.Value
			if len(rev) > 12 {
				rev = rev[:12]
			}
		case "vcs.time":
			when = s.Value
		case "vcs.modified":
			dirty = s.Value == "true"
		}
	}
	return rev, when, dirty
}
