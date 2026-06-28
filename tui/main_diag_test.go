package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testBoolPtr(value bool) *bool {
	return &value
}

func TestDiagClipboardProbeReportsNativeAndTerminalHints(t *testing.T) {
	t.Setenv("TERM", "xterm-256color")
	t.Setenv("TERM_PROGRAM", "UnitTerm")
	t.Setenv("COLORTERM", "truecolor")

	var out bytes.Buffer
	diagWriteClipboardProbe(&out)
	got := out.String()
	for _, want := range []string{
		"clipboard_native:",
		"clipboard_missing:",
		"clipboard_osc52:",
		"terminal_selection:",
		"wl-copy",
		"xclip",
		"xsel",
		"clip.exe",
		"powershell.exe",
		"TERM=xterm-256color",
		"TERM_PROGRAM=UnitTerm",
		"COLORTERM=truecolor",
		"/mouse",
		"terminal text selection",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("diag clipboard probe missing %q:\n%s", want, got)
		}
	}
}

func TestDiagMouseCaptureProbeReportsSelectionState(t *testing.T) {
	for _, tc := range []struct {
		name         string
		mouseEnabled *bool
		want         []string
	}{
		{
			name: "default",
			want: []string{
				"mouse_capture: enabled (default)",
				"terminal selection needs /mouse off or config mouse_enabled=false",
			},
		},
		{
			name:         "configured enabled",
			mouseEnabled: testBoolPtr(true),
			want: []string{
				"mouse_capture: enabled (config)",
				"terminal selection needs /mouse off or config mouse_enabled=false",
			},
		},
		{
			name:         "configured disabled",
			mouseEnabled: testBoolPtr(false),
			want: []string{
				"mouse_capture: disabled (config)",
				"native terminal selection available; TUI mouse clicks disabled",
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			diagWriteMouseCaptureProbe(&out, tc.mouseEnabled)
			got := out.String()
			for _, want := range tc.want {
				if !strings.Contains(got, want) {
					t.Fatalf("mouse capture probe missing %q:\n%s", want, got)
				}
			}
		})
	}
}

func TestDiagInstallProbeReportsMatchingAgentBinary(t *testing.T) {
	exe, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable: %v", err)
	}
	t.Setenv("GACT_INSTALL_PATH", exe)

	var out bytes.Buffer
	diagWriteInstallProbe(&out)
	got := out.String()
	for _, want := range []string{
		"binary_path:",
		"agent_gact: " + exe,
		"agent_gact_status: matches running binary",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("install probe missing %q:\n%s", want, got)
		}
	}
}

func TestDiagInstallProbeReportsStaleAgentBinary(t *testing.T) {
	stale := filepath.Join(t.TempDir(), "gact")
	if err := os.WriteFile(stale, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write stale binary: %v", err)
	}
	t.Setenv("GACT_INSTALL_PATH", stale)

	var out bytes.Buffer
	diagWriteInstallProbe(&out)
	got := out.String()
	for _, want := range []string{
		"agent_gact: " + stale,
		"agent_gact_status: stale (does not match running binary)",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("install probe missing %q:\n%s", want, got)
		}
	}
}
