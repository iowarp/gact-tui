# Conversation Render Cache Key Performance Evidence

Captured: 2026-06-12

## Scope

This report preserves benchmark/profile evidence for the #156 conversation
render-cache key performance slice. The change keeps the same visible rendering
behavior but replaces the expensive string/FNV render-cache key path with a
lower-allocation `maphash` key and direct visible-metadata hashing.

The important behavior is unchanged: cache keys still track visible message and
part content, while raw debug payloads such as `raw_event` and `raw_result`
remain excluded from the render fingerprint.

## Commands

```bash
cd tui
go test ./internal/ui \
  -run '^$' \
  -bench 'Benchmark(RenderLargeSemanticTranscript|ViewLargeSemanticTranscript)' \
  -benchmem -count=5

go test ./internal/ui \
  -run '^$' \
  -bench 'BenchmarkRenderLargeSemanticTranscript$' \
  -cpuprofile /tmp/gact-render-large-after.cpu \
  -memprofile /tmp/gact-render-large-after.mem \
  -benchmem -count=1
```

## Result Summary

Before this slice, the same large semantic transcript fixture measured:

```text
BenchmarkRenderLargeSemanticTranscript:
  15.00-15.90 ms/op, ~6.00 MiB/op, ~115474 allocs/op

BenchmarkViewLargeSemanticTranscript:
  15.51-16.08 ms/op, ~6.32 MiB/op, ~118722 allocs/op
```

After this slice:

```text
BenchmarkRenderLargeSemanticTranscript:
  11.14-12.42 ms/op, ~4.73 MiB/op, ~39144 allocs/op

BenchmarkViewLargeSemanticTranscript:
  12.92-14.50 ms/op, ~5.04 MiB/op, ~42394 allocs/op
```

## Correctness Guard

`TestConversationRenderFingerprintTracksVisibleMetadataOnly` proves that raw
debug payloads do not churn the render cache, while visible metadata changes do.
Existing render-cache tests continue to prove changed text, appended parts, and
streamed part deltas invalidate cached rows without global cache resets.

## Remaining Work

This reduces deterministic large-transcript render/key overhead but does not
close #156 by itself. The broader issue still requires active live CLIO
profiling, real-terminal copy/selection evidence under load, and the strict
active-stream proof tracked by #160.
