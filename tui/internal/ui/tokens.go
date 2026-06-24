package ui

import "fmt"

// humanTokens formats a token count for the footer: raw digits below
// 1000, "1.2K" in the thousands, "1.2M" in the millions. Keeps the
// right-hand side of the footer compact when conversations grow.
//
// Two examples of the shape:
//
//	humanTokens(942)     => "942"
//	humanTokens(1500)    => "1.5K"
//	humanTokens(15000)   => "15K"
//	humanTokens(150000)  => "150K"
//	humanTokens(1500000) => "1.5M"
//
// Fractional trimming rule: below 10 of a unit we keep one decimal
// place (so 1.5K is distinct from 2K); above that we drop the decimal
// entirely because it's noise at that magnitude. Same convention
// Kubernetes uses for resource quotas.
func humanTokens(n int) string {
	switch {
	case n >= 1_000_000:
		if n >= 10_000_000 {
			return fmt.Sprintf("%dM", n/1_000_000)
		}
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	case n >= 1_000:
		if n >= 10_000 {
			return fmt.Sprintf("%dK", n/1_000)
		}
		return fmt.Sprintf("%.1fK", float64(n)/1_000)
	default:
		return fmt.Sprintf("%d", n)
	}
}
