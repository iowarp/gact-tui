//go:build !windows

package main

import "os/exec"

func configureChild(_ *exec.Cmd) {}
