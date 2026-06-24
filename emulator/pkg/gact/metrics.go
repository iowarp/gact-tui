package gact

// Metrics is the body of GET /v1/metrics (SPEC §6.16).
type Metrics struct {
	UptimeS   int                           `json:"uptime_s"`
	Sessions  MetricsSessions               `json:"sessions"`
	Messages  MetricsMessages               `json:"messages"`
	Tokens    MetricsTokens                 `json:"tokens"`
	Cost      MetricsCost                   `json:"cost"`
	Latencies map[string]MetricsLatencyStat `json:"latencies,omitempty"`
}

// MetricsLatencyStat is one row of per-route timing — keyed by mux
// pattern (e.g. "GET /v1/sessions/{id}"). count is total samples ever
// observed; the percentiles come from a recent-1024-sample reservoir.
type MetricsLatencyStat struct {
	Count int     `json:"count"`
	P50Ms float64 `json:"p50_ms"`
	P95Ms float64 `json:"p95_ms"`
	MaxMs float64 `json:"max_ms"`
}

type MetricsSessions struct {
	Total    int            `json:"total"`
	Active   int            `json:"active"`
	ByStatus map[string]int `json:"by_status"`
}

type MetricsMessages struct {
	Total  int            `json:"total"`
	ByRole map[string]int `json:"by_role"`
}

type MetricsTokens struct {
	InputTotal      int `json:"input_total"`
	OutputTotal     int `json:"output_total"`
	CacheReadTotal  int `json:"cache_read_total"`
	CacheWriteTotal int `json:"cache_write_total"`
}

type MetricsCost struct {
	TotalUSD   float64            `json:"total_usd"`
	ByProvider map[string]float64 `json:"by_provider"`
}
