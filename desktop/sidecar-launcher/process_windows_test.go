//go:build windows

package main

import (
	"os/exec"
	"testing"

	"golang.org/x/sys/windows"
)

func TestConfigureChildHidesBackendWindow(t *testing.T) {
	cmd := exec.Command("cmd.exe", "/c", "exit", "0")
	configureChild(cmd)

	if cmd.SysProcAttr == nil {
		t.Fatal("configureChild must set Windows process attributes")
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Fatal("managed backend child must be hidden")
	}
	if cmd.SysProcAttr.CreationFlags&createNoWindow == 0 {
		t.Fatalf("creation flags %#x omit CREATE_NO_WINDOW", cmd.SysProcAttr.CreationFlags)
	}
}

func TestConfigureCrashCleanupEscapesBackendJob(t *testing.T) {
	cmd := exec.Command("cmd.exe", "/c", "exit", "0")
	configureCrashCleanup(cmd)

	if cmd.SysProcAttr == nil {
		t.Fatal("configureCrashCleanup must set Windows process attributes")
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Fatal("crash cleanup helper must be hidden")
	}
	want := uint32(createNoWindow | createBreakawayFromJob)
	if cmd.SysProcAttr.CreationFlags&want != want {
		t.Fatalf("creation flags %#x omit %#x", cmd.SysProcAttr.CreationFlags, want)
	}
}

func TestLauncherJobUsesKillOnCloseAndAllowsSharedDaemonBreakaway(t *testing.T) {
	const want = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |
		windows.JOB_OBJECT_LIMIT_BREAKAWAY_OK
	if launcherJobLimitFlags != want {
		t.Fatalf("launcher job flags %#x, want %#x", launcherJobLimitFlags, want)
	}
}
