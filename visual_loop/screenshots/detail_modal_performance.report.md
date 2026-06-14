# Detail Modal Performance Evidence

Captured: 2026-06-12

## Scope

This report preserves benchmark evidence for the #156 deep-detail/modal
performance slice. The change caches wrapped detail-modal content for the active
detail view, invalidating when the content or modal width changes and clearing
when the detail view closes.

## Command

```bash
go test ./internal/ui \
  -run 'TestDetail(WrappedContentCache|ShortPayload|ViewCopy|ViewMouseDrag|View_PgDn|View_Scroll)' \
  -bench 'Benchmark(DetailModalLargeMarkdown|RenderLargeSemanticTranscript|ViewLargeSemanticTranscript|FullConversationCopyLargeSemanticTranscript|SelectedBlockCopyLargeSemanticTranscript)' \
  -benchmem -count=3
```

## Result Summary

```text
BenchmarkDetailModalLargeMarkdownInitialRender:
  9.08-9.41 ms/op, ~850-853 KiB/op, 10435 allocs/op

BenchmarkDetailModalLargeMarkdownCachedScroll:
  2.65-2.71 ms/op, ~308-310 KiB/op, 4111 allocs/op

BenchmarkSelectedBlockCopyLargeSemanticTranscript:
  7.21-7.70 us/op, ~2072 B/op, 32 allocs/op

BenchmarkRenderLargeSemanticTranscript:
  13.46-13.92 ms/op, ~6.00 MiB/op, ~115k allocs/op

BenchmarkViewLargeSemanticTranscript:
  15.67-15.86 ms/op, ~6.31 MiB/op, ~118k allocs/op

BenchmarkFullConversationCopyLargeSemanticTranscript:
  9.40-9.80 ms/op, ~4.28 MiB/op, 33867 allocs/op
```

## Visual Proof

The maintained detail-modal tape was regenerated and inspected:

- `visual_loop/tapes/semantic_detail_copy.tape`
- `visual_loop/screenshots/semantic_detail_copy.png`
- `visual_loop/screenshots/semantic_detail_copy.gif`

## Remaining Work

This is not enough to close #156. The issue still requires real live CLIO
profiling evidence for active streams, copy/selection under a large real
transcript, Markdown/detail/modal behavior under realistic streaming load, and
narrow/full-size terminal latency evidence.
