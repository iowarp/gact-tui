package server

import (
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// latencyTracker keeps per-route reservoirs of recent request durations
// so the metrics endpoint can report p50/p95 without paying the memory
// cost of an HDR histogram. Each route gets a ring buffer of up to
// `cap` samples — when full, the oldest sample is overwritten.
//
// Sample size is a tradeoff: too small and percentiles jitter wildly
// under load; too large and we hold onto stale data through quiet
// periods. cap=1024 covers ~17 minutes at 1 rps and percentiles are
// stable in our integration tests; tweak via NewLatencyTracker if a
// caller needs different behaviour.
type latencyTracker struct {
	cap     int
	mu      sync.RWMutex
	samples map[string]*ringBuffer
}

type ringBuffer struct {
	data  []time.Duration
	idx   int  // next write position
	full  bool // wrapped around at least once
	count int  // total samples ever recorded (so the report can show throughput too)
}

func newLatencyTracker(cap int) *latencyTracker {
	if cap <= 0 {
		cap = 1024
	}
	return &latencyTracker{cap: cap, samples: map[string]*ringBuffer{}}
}

// Record adds a duration sample for the named route pattern. Empty or
// long-running route patterns (currently only SSE event streams) are
// ignored: their durations measure connection lifetime, not request
// latency, and would dominate the percentiles meaninglessly.
func (l *latencyTracker) Record(pattern string, d time.Duration) {
	if pattern == "" || isLongRunning(pattern) {
		return
	}
	l.mu.Lock()
	rb, ok := l.samples[pattern]
	if !ok {
		rb = &ringBuffer{data: make([]time.Duration, l.cap)}
		l.samples[pattern] = rb
	}
	rb.data[rb.idx] = d
	rb.idx = (rb.idx + 1) % l.cap
	if rb.idx == 0 {
		rb.full = true
	}
	rb.count++
	l.mu.Unlock()
}

// Snapshot returns a copy of the current per-route stats. Safe to call
// concurrently with Record.
type latencyStat struct {
	Count int     `json:"count"`
	P50Ms float64 `json:"p50_ms"`
	P95Ms float64 `json:"p95_ms"`
	MaxMs float64 `json:"max_ms"`
}

func (l *latencyTracker) Snapshot() map[string]latencyStat {
	l.mu.RLock()
	defer l.mu.RUnlock()
	out := make(map[string]latencyStat, len(l.samples))
	for pat, rb := range l.samples {
		var end int
		if rb.full {
			end = l.cap
		} else {
			end = rb.idx
		}
		if end == 0 {
			continue
		}
		buf := make([]time.Duration, end)
		copy(buf, rb.data[:end])
		sort.Slice(buf, func(i, j int) bool { return buf[i] < buf[j] })
		out[pat] = latencyStat{
			Count: rb.count,
			P50Ms: msFloat(percentile(buf, 0.50)),
			P95Ms: msFloat(percentile(buf, 0.95)),
			MaxMs: msFloat(buf[len(buf)-1]),
		}
	}
	return out
}

// percentile returns the q-th percentile from a sorted slice using the
// nearest-rank method. Caller guarantees len(sorted) > 0.
func percentile(sorted []time.Duration, q float64) time.Duration {
	if len(sorted) == 1 {
		return sorted[0]
	}
	idx := int(float64(len(sorted)-1) * q)
	return sorted[idx]
}

func msFloat(d time.Duration) float64 {
	return float64(d.Microseconds()) / 1000.0
}

// isLongRunning excludes SSE/streaming endpoints from the latency
// reservoir. Their durations are connection lifetimes, not RPC
// latencies, so including them would push p95 to "however long the
// client stayed connected" — useless for capacity planning.
func isLongRunning(pattern string) bool {
	return strings.Contains(pattern, "/events")
}

// timingMiddleware wraps a handler to record its duration in the
// tracker keyed by the matched mux pattern. Reads r.Pattern AFTER the
// handler returns — net/http sets it during routing, which has already
// happened by the time we run.
func timingMiddleware(tracker *latencyTracker, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		tracker.Record(r.Pattern, time.Since(start))
	})
}
