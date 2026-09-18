//go:build windows

package main

import (
	"os/exec"
	"testing"
)

func TestConfigureChildHidesBackendWindow(t *testing.T) {
	cmd := exec.Command("cmd.exe", "/c", "exit", "0")
	configureChild(cmd)

	if cmd.SysProcAttr == nil {
		t.Fatal("configureChild must set Windows process attributes")
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Fatal("managed backend child must be hidden")
	}
	if cmd.SysProcAttr.CreationFlags&createNoWindow == 0 {
		t.Fatalf("creation flags %#x omit CREATE_NO_WINDOW", cmd.SysProcAttr.CreationFlags)
	}
}
