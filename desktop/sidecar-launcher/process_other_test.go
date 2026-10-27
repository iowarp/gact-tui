//go:build !windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// A backend that exits on SIGTERM is stopped gracefully when the desktop is gone,
// and the crash cleanup still runs after it.
func TestStopAfterDesktopExitStopsTheBackendGracefully(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "terminated")
	cleaned := filepath.Join(t.TempDir(), "cleaned")
	cmd := exec.Command("sh", "-c", "trap 'touch "+marker+"; exit 0' TERM; while :; do sleep 0.1; done")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	waitDone := make(chan error, 1)
	go func() { waitDone <- cmd.Wait() }()
	time.Sleep(200 * time.Millisecond) // let the shell install its trap

	rt := &resolvedRuntime{Argv: []string{"sh", "-c", "touch " + cleaned, "cleanup"}}
	started := time.Now()
	stopAfterDesktopExit(cmd, waitDone, rt)

	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("backend was not asked to stop with SIGTERM: %v", err)
	}
	if elapsed := time.Since(started); elapsed > 10*time.Second {
		t.Fatalf("a backend that stops by itself was waited on for %s", elapsed)
	}
	if _, err := os.Stat(cleaned); err != nil {
		t.Fatalf("crash cleanup did not run after the backend stopped: %v", err)
	}
}

func TestProcessAliveSeesAnExitedProcess(t *testing.T) {
	cmd := exec.Command("true")
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	if processAlive(cmd.Process.Pid) {
		t.Fatalf("pid %d reported alive after it exited and was reaped", cmd.Process.Pid)
	}
	if !processAlive(os.Getpid()) {
		t.Fatal("this process reported not alive")
	}
}
