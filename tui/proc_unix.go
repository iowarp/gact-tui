//go:build !windows

package main

import "syscall"

// detachedSysProcAttr returns the SysProcAttr needed to spawn a
// child in a new process group so the parent (gact) exiting with
// Ctrl+C doesn't drag the adapter down too. (OOOOOOOOO1)
func detachedSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setsid: true}
}
