package cli

import (
	"os/exec"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/tui/internal/version"
)

func TestCLI_VersionReportsBuildMetadata(t *testing.T) {
	bin := buildGact(t)
	headCmd := exec.Command("git", "rev-parse", "--short=12", "HEAD")
	headOut, err := headCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git rev-parse: %v\n%s", err, headOut)
	}
	head := strings.TrimSpace(string(headOut))

	stdout, stderr, code := runGact(t, bin, nil, "version")
	if code != 0 {
		t.Fatalf("version: exit %d, stderr=%q", code, stderr)
	}
	for _, want := range []string{
		"gact " + binaryVersion,
		"(contract " + contractVersion + ")",
		"revision: " + head,
		"go:",
	} {
		if !strings.Contains(stdout, want) {
			t.Fatalf("version output missing %q:\n%s", want, stdout)
		}
	}
}

func TestReadVCSInfoUsesBuildMetadataOverride(t *testing.T) {
	oldRevision, oldTime, oldDirty := version.BuildRevision, version.BuildTime, version.BuildDirty
	t.Cleanup(func() {
		version.BuildRevision, version.BuildTime, version.BuildDirty = oldRevision, oldTime, oldDirty
	})

	version.BuildRevision = "1234567890abcdef"
	version.BuildTime = "2026-06-11T10:13:32Z"
	version.BuildDirty = "false"

	rev, when, dirty := readVCSInfo()
	if rev != "1234567890ab" || when != version.BuildTime || dirty {
		t.Fatalf("readVCSInfo override = rev %q when %q dirty %v", rev, when, dirty)
	}

	version.BuildDirty = "true"
	_, _, dirty = readVCSInfo()
	if !dirty {
		t.Fatal("readVCSInfo should respect explicit dirty override")
	}
}
