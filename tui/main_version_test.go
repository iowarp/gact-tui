package main

import (
	"os/exec"
	"strings"
	"testing"
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
	oldRevision, oldTime, oldDirty := buildRevision, buildTime, buildDirty
	t.Cleanup(func() {
		buildRevision, buildTime, buildDirty = oldRevision, oldTime, oldDirty
	})

	buildRevision = "1234567890abcdef"
	buildTime = "2026-06-11T10:13:32Z"
	buildDirty = "false"

	rev, when, dirty := readVCSInfo()
	if rev != "1234567890ab" || when != buildTime || dirty {
		t.Fatalf("readVCSInfo override = rev %q when %q dirty %v", rev, when, dirty)
	}

	buildDirty = "true"
	_, _, dirty = readVCSInfo()
	if !dirty {
		t.Fatal("readVCSInfo should respect explicit dirty override")
	}
}
