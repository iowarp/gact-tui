package cli

import (
	"fmt"
	"os"
)

// runCompletion writes a shell-completion script to stdout. Supports
// bash, zsh, and fish — each emits a static list of subcommands +
// the most common flags. We don't try to enumerate every flag of
// every subcommand because (a) the list grows organically and (b)
// users tab-complete the subcommand name + filename half the time
// anyway.
func runCompletion(args []string) int {
	if len(args) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact completion bash|zsh|fish")
		return 2
	}
	switch args[0] {
	case "bash":
		fmt.Print(bashCompletionScript)
	case "zsh":
		fmt.Print(zshCompletionScript)
	case "fish":
		fmt.Print(fishCompletionScript)
	default:
		fmt.Fprintf(os.Stderr, "gact completion: unknown shell %q (want bash|zsh|fish)\n", args[0])
		return 2
	}
	return 0
}

const bashCompletionScript = `# gact bash completion. Source manually or copy to /etc/bash_completion.d/gact.
_gact() {
    local cur prev cmds
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    cmds="agent agents archive ask attach bench cancel capabilities caps catalog completion conformance context dashboard delete detached diag diff dump-bundle emit-config env export files follow fork grep hooks import info list log mcp metrics models new perms ping plugins quick rename replay repo-map resume rewind run search send stream summarize tail tasks tell theme tool tools unarchive undo version voice wait watch workspaces"

    if [ $COMP_CWORD -eq 1 ]; then
        COMPREPLY=( $(compgen -W "$cmds" -- "$cur") )
        return 0
    fi
    case "$prev" in
        --backend|--workspace|--theme|--voice-cmd|--out|-o|--timeout|--interval|--limit|--title|--format)
            return 0 ;;
        completion)
            COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") ) ;;
    esac
    return 0
}
complete -F _gact gact
`

const zshCompletionScript = `#compdef gact
_gact() {
    local -a cmds
    cmds=(agent agents archive ask attach bench cancel capabilities caps catalog completion conformance context dashboard delete detached diag diff dump-bundle emit-config env export files follow fork grep hooks import info list log mcp metrics models new perms ping plugins quick rename replay repo-map resume rewind run search send stream summarize tail tasks tell theme tool tools unarchive undo version voice wait watch workspaces)
    if (( CURRENT == 2 )); then
        _describe 'subcommand' cmds
        return
    fi
    case "$words[2]" in
        completion) _values 'shell' bash zsh fish ;;
    esac
}
compdef _gact gact
`

const fishCompletionScript = `# gact fish completion
complete -c gact -n "__fish_use_subcommand" -a "agent agents archive ask attach bench cancel capabilities caps catalog completion conformance context dashboard delete detached diag diff dump-bundle emit-config env export files follow fork grep hooks import info list log mcp metrics models new perms ping plugins quick rename replay repo-map resume rewind run search send stream summarize tail tasks tell theme tool tools unarchive undo version voice wait watch workspaces"
complete -c gact -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"
`
