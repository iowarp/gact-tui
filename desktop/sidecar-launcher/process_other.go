//go:build !windows

package main

import "os/exec"

var desktopParentExited = make(chan struct{})

func installLauncherKillJob() error { return nil }

func monitorDesktopParent() error { return nil }

func configureChild(_ *exec.Cmd) {}

func configureCrashCleanup(cmd *exec.Cmd) { configureChild(cmd) }

func crashCleanupArgv(rt *resolvedRuntime) []string {
	return append(append([]string{}, rt.Argv...), "--cleanup-runtime-after-crash")
}
