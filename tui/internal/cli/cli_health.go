package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runPing hits /v1/health and exits 0 on 200, non-zero otherwise.
// Shell-script-friendly: `gact ping && echo ok` works as expected.
func runPing(args []string) int {
	fs := flag.NewFlagSet("ping", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	quiet := fs.Bool("q", false, "suppress stdout output; only exit code")
	jsonOut := fs.Bool("json", false, "emit a single-line JSON object (overrides -q)")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	h, err := c.Health(ctx)
	if err != nil {
		if *jsonOut {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"ok":      false,
				"backend": finalBackend,
				"error":   err.Error(),
			})
		} else if !*quiet {
			fmt.Fprintf(os.Stderr, "gact ping: %v\n", err)
		}
		return 1
	}
	if !h.Healthy {
		if *jsonOut {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"ok":       false,
				"backend":  finalBackend,
				"uptime_s": h.UptimeS,
				"error":    "backend reports unhealthy",
			})
		} else if !*quiet {
			fmt.Fprintf(os.Stderr, "gact ping: backend reports unhealthy\n")
		}
		return 1
	}
	if *jsonOut {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
			"ok":       true,
			"backend":  finalBackend,
			"uptime_s": h.UptimeS,
		})
	} else if !*quiet {
		fmt.Printf("ok: %s (uptime %ds)\n", finalBackend, h.UptimeS)
	}
	return 0
}
