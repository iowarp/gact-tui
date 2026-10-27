//go:build !windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"syscall"
	"time"
)

var desktopParentExited = make(chan struct{})

// desktopParentPoll is how often the launcher checks that the desktop is alive.
const desktopParentPoll = time.Second

// backendStopGrace is how long a backend gets to shut down by itself (releasing
// clio-core) after the desktop is gone, before it is killed.
const backendStopGrace = 30 * time.Second

func installLauncherKillJob() error { return nil }

// monitorDesktopParent closes desktopParentExited when the desktop process is
// gone: quit, crashed, or killed with a signal it cannot handle (SIGKILL). The
// launcher runs in its own process group, so nothing else would stop the
// backend then.
func monitorDesktopParent() error {
	rawPID := os.Getenv(envDesktopParentPID)
	if rawPID == "" {
		return nil
	}
	pid, err := strconv.Atoi(rawPID)
	if err != nil || pid <= 1 {
		return fmt.Errorf("invalid %s value %q", envDesktopParentPID, rawPID)
	}
	go func() {
		for {
			time.Sleep(desktopParentPoll)
			if !processAlive(pid) || os.Getppid() != pid {
				close(desktopParentExited)
				return
			}
		}
	}()
	return nil
}

func processAlive(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}

// stopAfterDesktopExit asks the backend to shut down the way a quit does
// (SIGTERM: it drains, releases clio-core and exits), kills it if it has not
// exited within backendStopGrace, then runs the same crash cleanup as any
// other backend exit.
func stopAfterDesktopExit(cmd *exec.Cmd, waitDone <-chan error, rt *resolvedRuntime) int {
	if cmd.Process != nil {
		_ = cmd.Process.Signal(syscall.SIGTERM)
	}
	select {
	case <-waitDone:
		fmt.Fprintln(os.Stdout, "sidecar-progress: backend stopped after the desktop exited")
	case <-time.After(backendStopGrace):
		fmt.Fprintln(os.Stdout, "sidecar-progress: backend did not stop; killing it")
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		<-waitDone
	}
	cleanupRuntimeAfterCrash(rt)
	return exitExecFailed
}

func configureChild(_ *exec.Cmd) {}

func configureCrashCleanup(cmd *exec.Cmd) { configureChild(cmd) }

func crashCleanupArgv(rt *resolvedRuntime) []string {
	return append(append([]string{}, rt.Argv...), "--cleanup-runtime-after-crash")
}
