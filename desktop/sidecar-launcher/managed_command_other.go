//go:build !windows

package main

func managedCommandMode(_ []string) (int, bool) { return 0, false }
