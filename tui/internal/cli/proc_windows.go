//go:build windows

package cli

import (
	"os"
	"syscall"
)

// detachedSysProcAttr on Windows — CREATE_NEW_PROCESS_GROUP detaches
// the child from our console group so Ctrl+C doesn't cascade.
func detachedSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{CreationFlags: 0x00000200} // CREATE_NEW_PROCESS_GROUP
}

func stopAgentProcess(proc *os.Process) error {
	return proc.Kill()
}
