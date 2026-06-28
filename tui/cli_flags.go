package main

import "strings"

// reorderFlagsFirst moves recognized flags (and their values) ahead of
// positional args so users can write `gact export SID -o file` instead of
// being forced to put all flags before the positional.
//
// known maps recognized flag tokens (e.g. "-o", "--backend") to true.
// We assume every recognized flag takes one value unless it's of the
// form -flag=value.
func reorderFlagsFirst(args []string, known map[string]bool) []string {
	flags := make([]string, 0, len(args))
	positional := make([]string, 0, len(args))
	i := 0
	for i < len(args) {
		a := args[i]
		// Lone "-" is a positional convention (stdin sentinel) -
		// keep it out of the flags bucket. Without this, runSend's
		// `gact send SID -` interprets the `-` as an unknown flag.
		if a == "-" {
			positional = append(positional, a)
			i++
			continue
		}
		if strings.HasPrefix(a, "-") {
			// Token already includes its value? (e.g. -o=foo)
			if strings.Contains(a, "=") {
				flags = append(flags, a)
				i++
				continue
			}
			// Recognized flag - consume next arg as value.
			if known[a] && i+1 < len(args) {
				flags = append(flags, a, args[i+1])
				i += 2
				continue
			}
			// Bool/unknown flag - pass through alone.
			flags = append(flags, a)
			i++
			continue
		}
		positional = append(positional, a)
		i++
	}
	return append(flags, positional...)
}
