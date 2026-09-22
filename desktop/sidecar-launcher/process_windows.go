//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const createNoWindow = 0x08000000
const createBreakawayFromJob = 0x01000000

const launcherJobLimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |
	windows.JOB_OBJECT_LIMIT_BREAKAWAY_OK

// launcherJob stays open for the launcher's entire lifetime. Windows closes
// it even when the launcher is terminated rather than allowed to unwind; the
// KILL_ON_JOB_CLOSE limit then reaps the backend and every non-breakaway
// descendant. BREAKAWAY_OK is deliberate: clio-core is a shared daemon and
// its spawn path explicitly requests breakaway so it may outlive this one
// desktop instance.
var launcherJob windows.Handle
var desktopParentExited = make(chan struct{})

func installLauncherKillJob() error {
	if launcherJob != 0 {
		return nil
	}

	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return fmt.Errorf("create Windows Job Object: %w", err)
	}
	info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	info.BasicLimitInformation.LimitFlags = launcherJobLimitFlags
	if _, err = windows.SetInformationJobObject(
		job,
		windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&info)),
		uint32(unsafe.Sizeof(info)),
	); err != nil {
		windows.CloseHandle(job)
		return fmt.Errorf("configure Windows Job Object: %w", err)
	}
	current, err := windows.GetCurrentProcess()
	if err != nil {
		windows.CloseHandle(job)
		return fmt.Errorf("open current Windows process: %w", err)
	}
	if err = windows.AssignProcessToJobObject(job, current); err != nil {
		windows.CloseHandle(job)
		return fmt.Errorf("assign launcher to Windows Job Object: %w", err)
	}

	launcherJob = job
	return nil
}

func monitorDesktopParent() error {
	rawPID := os.Getenv(envDesktopParentPID)
	if rawPID == "" {
		return nil
	}
	pid, err := strconv.ParseUint(rawPID, 10, 32)
	if err != nil || pid == 0 {
		return fmt.Errorf("invalid %s value %q", envDesktopParentPID, rawPID)
	}
	parent, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		return fmt.Errorf("open desktop process %d: %w", pid, err)
	}
	go func() {
		_, _ = windows.WaitForSingleObject(parent, windows.INFINITE)
		_ = windows.CloseHandle(parent)
		// Let runChild perform registry-gated clio-core cleanup before the
		// launcher exits and closes its KILL_ON_JOB_CLOSE Job Object. Calling
		// os.Exit here bypassed that cleanup and leaked the breakaway shared
		// daemon whenever the desktop was killed or hot-restarted.
		close(desktopParentExited)
	}()
	return nil
}

func configureChild(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: createNoWindow,
		HideWindow:    true,
	}
}

func configureCrashCleanup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: createNoWindow | createBreakawayFromJob,
		HideWindow:    true,
	}
}

func crashCleanupArgv(rt *resolvedRuntime) []string {
	if len(rt.Argv) == 1 && strings.EqualFold(filepath.Base(rt.Argv[0]), "clio-agent-gact.exe") {
		python := filepath.Join(filepath.Dir(rt.Argv[0]), "python.exe")
		if info, err := os.Stat(python); err == nil && !info.IsDir() {
			return []string{
				python,
				"-m",
				"clio_agent.gact",
				"--cleanup-runtime-after-crash",
			}
		}
	}
	return append(append([]string{}, rt.Argv...), "--cleanup-runtime-after-crash")
}
