# Full Conversation Copy Performance Evidence

Captured: 2026-06-12

## Scope

This report preserves benchmark evidence for the #156 full-transcript copy
responsiveness slice. The change caches the role-prefixed full conversation copy
text on the `App`, keyed by copy-relevant message and part content so repeated
`Y` copies do not re-summarize every semantic event in a large transcript.

## Command

```bash
cd tui
go test ./internal/ui \
  -run '^$' \
  -bench 'BenchmarkFullConversationCopy(Cached)?LargeSemanticTranscript|BenchmarkSelectedBlockCopyLargeSemanticTranscript' \
  -benchmem -count=5
```

## Result Summary

```text
BenchmarkFullConversationCopyLargeSemanticTranscript:
  9.23-10.98 ms/op, ~4.28 MiB/op, 33867 allocs/op

BenchmarkFullConversationCopyCachedLargeSemanticTranscript:
  2.34-2.87 ms/op, ~160 KiB/op, 5400 allocs/op

BenchmarkSelectedBlockCopyLargeSemanticTranscript:
  7.10-9.06 us/op, ~2072 B/op, 32 allocs/op
```

## Correctness Guard

`TestFullConversationCopyCacheInvalidatesOnMessageContentChange` proves that
streamed message content changes invalidate the cached full-conversation copy
text before it reaches the clipboard path.

## Remaining Work

This improves the deterministic large-transcript copy hot path but does not
close #156 by itself. The broader issue still needs active live CLIO profiling
and real-terminal copy/selection evidence under provider-backed streaming load.
