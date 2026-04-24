// Command gact-clio-adapter is a single-binary GACT v0.1 adapter
// that drives iowarp/clio-agent's FastAPI server. Mirrors the
// gact-claudecode-adapter binary for claude-code.
//
// Not implemented yet — tracked by the CLIO-BBBBBBBBBB phase in
// /PLAN.md of the parent gact-tui repo.
package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "gact-clio-adapter: not implemented yet")
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "This binary will eventually:")
	fmt.Fprintln(os.Stderr, "  1. Spawn `clio-agent-api` as a supervised subprocess.")
	fmt.Fprintln(os.Stderr, "  2. Serve the GACT v0.1 contract on --listen.")
	fmt.Fprintln(os.Stderr, "  3. Translate REST + SSE between the two.")
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "See:")
	fmt.Fprintln(os.Stderr, "  https://github.com/iowarp/clio-agent/tree/develop/docs/tui")
	fmt.Fprintln(os.Stderr, "  https://github.com/iowarp/clio-agent/issues/1")
	os.Exit(2)
}
