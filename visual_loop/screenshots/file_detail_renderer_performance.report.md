# File Detail Renderer Performance

This report preserves benchmark evidence for the local file-detail renderer
slice of #156. The change keeps operator-facing previews useful for structured
files while preserving raw evidence in a separate mode and avoiding inline dumps
for oversized or binary files.

## What Changed

- Markdown files open with `Rendered` and `Raw` modes.
- JSON opens with `Pretty` and `Raw` modes.
- JSONL/NDJSON opens with a bounded record preview plus `Raw`.
- CSV/TSV opens as a compact table preview plus `Raw`.
- Binary, known external-only, and oversized files open to an info state instead
  of dumping unreadable bytes into the TUI.
- File details expose an `open` action for local OS viewers when inline preview
  is not appropriate.

## Benchmark Command

```sh
go test -p 1 ./tui/internal/ui -run '^$' \
  -bench 'BenchmarkLocalFile(Markdown|CSV|Large)Detail' \
  -benchmem -count=5
```

## Results

| Benchmark | Result |
| --- | --- |
| Markdown rendered/raw detail, 200-row table | 23.84-26.23 ms/op, ~4.03-4.04 MiB/op, ~173k allocs/op |
| CSV table/raw detail, 500 rows | 273-305 us/op, ~153 KiB/op, ~1.18k allocs/op |
| Oversized file guard | 3.06-3.81 us/op, 1266 B/op, 23 allocs/op |

## Visual Proof

The maintained file-viewer tape was refreshed and inspected:

- `visual_loop/tapes/semantic_file_viewer_module.tape`
- `visual_loop/screenshots/semantic_file_viewer_module_detail.png`
- `visual_loop/screenshots/semantic_file_viewer_module_raw.png`
- `visual_loop/screenshots/semantic_file_viewer_module_upload.png`

The rendered screenshot shows the Markdown table as a readable table. The raw
screenshot proves the exact Markdown evidence remains reachable.
