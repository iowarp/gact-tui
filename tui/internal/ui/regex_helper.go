package ui

// regex_helper.go wraps regexp compilation for shared use.

import "regexp"

// mustCompileImpl is a tiny indirection so we can swap regex implementations
// in tests if needed. Returns the canonical *regexp.Regexp.
func mustCompileImpl(p string) *regexp.Regexp { return regexp.MustCompile(p) }
