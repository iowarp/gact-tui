//go:build !windows

package cli

import (
	"os"
	"syscall"
)

// detachedSysProcAttr returns the SysProcAttr needed to spawn a
// child in a new process group so the parent (gact) exiting with
// Ctrl+C doesn't drag the adapter down too. (OOOOOOOOO1)
func detachedSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setsid: true}
}

func stopAgentProcess(proc *os.Process) error {
	return proc.Signal(syscall.SIGTERM)
}
