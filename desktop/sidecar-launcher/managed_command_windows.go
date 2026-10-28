//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
)

// managedCommandMode gives package checks the existing launcher's own process
// job and parent monitor. The GUI never joins that job: updates/restarts and the
// backend launcher's separate shared-Core cleanup keep their existing lifetime.
func managedCommandMode(argv []string) (int, bool) {
	if len(argv) < 2 || argv[1] != "--managed-package-command" {
		return 0, false
	}
	return runManagedCommand(argv[2:]), true
}

func runManagedCommand(argv []string) int {
	if len(argv) == 0 {
		fmt.Fprintln(os.Stderr, "sidecar-launcher: managed package command is missing")
		return exitUsage
	}
	if err := installLauncherKillJob(); err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: own package worker: %v\n", err)
		return exitExecFailed
	}
	if err := monitorDesktopParent(); err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: monitor package worker parent: %v\n", err)
		return exitExecFailed
	}
	command := exec.Command(argv[0], argv[1:]...)
	command.Stdout, command.Stderr = os.Stdout, os.Stderr
	configureChild(command)
	if err := command.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: start package worker: %v\n", err)
		return exitExecFailed
	}
	done := make(chan error, 1)
	go func() { done <- command.Wait() }()
	select {
	case <-desktopParentExited:
		// main exits and closes the job, retiring the installer and descendants.
		return exitExecFailed
	case err := <-done:
		if err == nil {
			return exitOK
		}
		var status *exec.ExitError
		if errors.As(err, &status) {
			return status.ExitCode()
		}
		fmt.Fprintf(os.Stderr, "sidecar-launcher: wait for package worker: %v\n", err)
		return exitExecFailed
	}
}
