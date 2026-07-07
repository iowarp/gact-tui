package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"
)

// runMetrics fetches /v1/metrics and prints a human-readable summary
// to stdout (uptime, session counts, message totals, token totals,
// total cost). With --format=json, prints the raw response so
// monitoring scrapers can parse it.
func runMetrics(args []string) int {
	var format *string
	cc, _, code := newCmdCtx("metrics", args, withFlags(func(fs *flag.FlagSet) {
		format = fs.String("format", "text", "output format: text | json")
	}))
	if cc == nil {
		return code
	}

	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	m, err := c.Metrics(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact metrics: %v\n", err)
		return 1
	}

	switch *format {
	case "json":
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(m); err != nil {
			fmt.Fprintf(os.Stderr, "gact metrics: encode: %v\n", err)
			return 1
		}
	case "text", "":
		fmt.Printf("uptime:   %ds\n", m.UptimeS)
		fmt.Printf("sessions: %d total, %d active\n", m.Sessions.Total, m.Sessions.Active)
		if len(m.Sessions.ByStatus) > 0 {
			fmt.Print("  by status:")
			for k, v := range m.Sessions.ByStatus {
				fmt.Printf(" %s=%d", k, v)
			}
			fmt.Println()
		}
		fmt.Printf("messages: %d total\n", m.Messages.Total)
		if len(m.Messages.ByRole) > 0 {
			fmt.Print("  by role:")
			for k, v := range m.Messages.ByRole {
				fmt.Printf(" %s=%d", k, v)
			}
			fmt.Println()
		}
		fmt.Printf("tokens:   %d in / %d out (cache: %d read / %d write)\n",
			m.Tokens.InputTotal, m.Tokens.OutputTotal,
			m.Tokens.CacheReadTotal, m.Tokens.CacheWriteTotal)
		fmt.Printf("cost:     $%.4f total\n", m.Cost.TotalUSD)
		if len(m.Cost.ByProvider) > 0 {
			for prov, c := range m.Cost.ByProvider {
				fmt.Printf("  %s: $%.4f\n", prov, c)
			}
		}
	default:
		fmt.Fprintf(os.Stderr, "gact metrics: unknown format %q (want text|json)\n", *format)
		return 2
	}
	return 0
}
