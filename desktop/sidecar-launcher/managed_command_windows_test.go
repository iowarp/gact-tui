//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func managedFixture(role string, ready string) *exec.Cmd {
	command := exec.Command(os.Args[0], "-test.run=^TestManagedCommandProcess$", "--", role, ready)
	configureChild(command)
	return command
}

func TestManagedCommandProcess(t *testing.T) {
	if len(os.Args) < 4 || os.Args[len(os.Args)-3] != "--" {
		return
	}
	role, ready := os.Args[len(os.Args)-2], os.Args[len(os.Args)-1]
	switch role {
	case "desktop":
		command := managedFixture("manager", ready)
		command.Env = append(os.Environ(), envDesktopParentPID+"="+strconv.Itoa(os.Getpid()))
		if err := command.Start(); err != nil {
			os.Exit(91)
		}
	case "manager":
		command := managedFixture("worker", ready)
		os.Exit(runManagedCommand(command.Args))
	case "worker":
		leaf := managedFixture("leaf", ready)
		if err := leaf.Start(); err != nil {
			os.Exit(92)
		}
		if err := os.WriteFile(ready, []byte(fmt.Sprintf("%d,%d", os.Getpid(), leaf.Process.Pid)), 0600); err != nil {
			os.Exit(93)
		}
	case "exit":
		os.Unsetenv(envDesktopParentPID)
		os.Exit(runManagedCommand([]string{"cmd.exe", "/c", "exit", "7"}))
	}
	// Every failed test witness also retires itself after a bound.
	time.Sleep(30 * time.Second)
}

func TestManagedCommandPreservesExitCode(t *testing.T) {
	err := managedFixture("exit", "unused").Run()
	status, ok := err.(*exec.ExitError)
	if !ok || status.ExitCode() != 7 {
		t.Fatalf("managed command exit: %v", err)
	}
}

func TestManagedCommandRetiresWorkerTreeAfterDesktopExit(t *testing.T) {
	ready := filepath.Join(t.TempDir(), "worker.pid")
	desktop := managedFixture("desktop", ready)
	if err := desktop.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = desktop.Process.Kill(); _ = desktop.Wait() })
	deadline := time.Now().Add(10 * time.Second)
	var pids []int
	for time.Now().Before(deadline) {
		if raw, err := os.ReadFile(ready); err == nil {
			parts := strings.Split(string(raw), ",")
			if len(parts) == 2 {
				worker, first := strconv.Atoi(parts[0])
				leaf, second := strconv.Atoi(parts[1])
				if first == nil && second == nil {
					pids = []int{worker, leaf}
					break
				}
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	if len(pids) != 2 {
		t.Fatal("managed installer descendants did not start")
	}
	var handles []windows.Handle
	for _, pid := range pids {
		handle, err := windows.OpenProcess(windows.SYNCHRONIZE|windows.PROCESS_TERMINATE, false, uint32(pid))
		if err != nil {
			t.Fatal(err)
		}
		handles = append(handles, handle)
		t.Cleanup(func() {
			_ = windows.TerminateProcess(handle, 1)
			_, _ = windows.WaitForSingleObject(handle, 5000)
			_ = windows.CloseHandle(handle)
		})
	}
	if err := desktop.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	for _, handle := range handles {
		state, err := windows.WaitForSingleObject(handle, 5000)
		if err != nil || state != windows.WAIT_OBJECT_0 {
			t.Fatalf("installer descendant survived desktop: state=%d error=%v", state, err)
		}
	}
}
