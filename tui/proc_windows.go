//go:build windows

package main

import "syscall"

// detachedSysProcAttr on Windows — CREATE_NEW_PROCESS_GROUP detaches
// the child from our console group so Ctrl+C doesn't cascade.
// (OOOOOOOOO1)
func detachedSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{CreationFlags: 0x00000200} // CREATE_NEW_PROCESS_GROUP
}
