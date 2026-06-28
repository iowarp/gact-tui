// Package version is the single source of build/version info for the gact CLI
// (`gact version` / `gact diag`) and the TUI splash screen.
//
// The semantic version comes from git tags at build time: the Makefile injects
//
//	git describe --tags --match 'v[0-9]*' --always --dirty
//
// into Release via -ldflags -X. A plain `go build` (no Makefile) leaves Release
// empty, and Resolve() falls back to Go's embedded VCS info
// (runtime/debug.ReadBuildInfo, populated automatically when building inside the
// repo) so you still get the commit hash and the dirty flag.
package version

import (
	"runtime/debug"
	"strings"
)

// Release is set at build time from `git describe` via -ldflags. Do not read it
// directly — use Resolve()/Dirty().
var Release string

// Contract is the GACT protocol version this build speaks.
const Contract = "0.2"

// fallbackVersion is shown when neither a git-describe (Release) nor a module
// install version is available (e.g. a bare `go build` without the Makefile).
// It is the latest tag reachable from this branch's history.
const fallbackVersion = "v0.3.0"

// Resolve returns the human-readable version string, best source first:
//  1. Release — git describe ("v0.3.0-2098-g31c252e7[-dirty]"), injected by the Makefile.
//  2. the module version from ReadBuildInfo (set by `go install <module>@vX.Y.Z`).
//  3. fallbackVersion + the short VCS commit (+ "-dirty") from ReadBuildInfo.
func Resolve() string {
	if r := strings.TrimSpace(Release); r != "" {
		return r
	}
	if info, ok := debug.ReadBuildInfo(); ok && isReleaseVersion(info.Main.Version) {
		return info.Main.Version
	}
	short, dirty := vcs()
	out := fallbackVersion
	if short != "" {
		out += "-g" + short
	}
	if dirty {
		out += "-dirty"
	}
	return out
}

// Dirty reports whether the binary was built from a working tree with
// uncommitted changes — i.e. it is NOT exactly a committed revision. This is the
// "am I running exactly what's committed?" signal.
func Dirty() bool {
	if strings.HasSuffix(strings.TrimSpace(Release), "-dirty") {
		return true
	}
	_, dirty := vcs()
	return dirty
}

func isReleaseVersion(v string) bool { return v != "" && v != "(devel)" }

// vcs returns the short commit hash and dirty flag from Go's embedded build
// info. Empty hash when build info is unavailable (e.g. some test contexts).
func vcs() (short string, dirty bool) {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "", false
	}
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			short = s.Value
			if len(short) > 7 {
				short = short[:7]
			}
		case "vcs.modified":
			dirty = s.Value == "true"
		}
	}
	return short, dirty
}
