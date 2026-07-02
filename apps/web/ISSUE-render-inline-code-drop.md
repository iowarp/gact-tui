# ISSUE (web/display): inline-code (backtick) spans dropped in render → broken/missing data

**Area:** `apps/web` markdown render (client). NOT clio — the backend text is clean (proven).
**Severity:** high (demo-visible: file paths and tool names silently vanish from thoughts).
**Status:** backend-clean is log-proven; the client mechanism (smd streaming) is hypothesis.

## Symptom
Backtick-wrapped inline code inside a thought — Windows paths and tool names — is **dropped
from the render, and the spaces around it are eaten**, producing broken text:

- Backend (correct): ``…time-series CSV. The workflow state authorizes this file at `acquisition.local_path` = `D:\Libraries\Documents\projects\ndp-demo-workspace\MTA1.CI.LY_.30.csv`, confirming…``
- Rendered (broken):   `…time-series CSV. CI.LY_.30.csv, confirming…`
- Backend (correct): ``I will call `pandas_profile_csv` with this exact path``
- Rendered (broken):   `I will callpandas_profile_csvwith this exact path`

The whole backtick span (`` `acquisition.local_path` ``, the `` `D:\…MTA1.` `` path prefix,
`` `pandas_profile_csv` ``) disappears; only the tail after the last backtick survives.

## Grounded evidence (from the audit logs — NOT a hypothesis)
- Run: `sess_4803a5fb6926` (`TAIL2`), agent `gnss_timeseries_analysis`, `next_thought`
  part `part_ca652f28c948`. Audit: `scratchpad/capture-final/audit.jsonl`.
- `bridge.contract_field` (post-cut) **==** `sse.normalized_emit` (emit), 767 chars, with the
  backtick spans + surrounding spaces **fully intact**. The backend did not drop anything.
- So the drop happens **in the client render**, downstream of the SSE.

## Hypothesis for the client mechanism (NOT yet proven)
`streaming-markdown` (`smd`) is fed the thought in deltas as it streams. A backtick inline-code
span split across delta boundaries (e.g. `` `D:\Lib `` in one write, `…csv` `` in the next) is
mis-parsed — the incremental parser drops the unterminated code span and the adjacent spaces.
The **settled** re-parse (whole text at once) renders it correctly, which is why the duplicate
clean copy (see `ISSUE-render-thought-duplication.md`) keeps the path. Backslashes in the path
may compound it. NOT yet confirmed by feeding this exact 767-char string through the smd path.

## To reproduce / to confirm (work still owed)
1. Feed the exact backend 767-char `next_thought` through the web markdown path **whole** vs
   **chunked at the backtick boundaries**; confirm chunked drops the spans, whole does not.
2. Check `sanitizeEmphasis.ts` (code-span split regex `` `[^`\n]*` ``) is not also implicated
   for backtick spans containing backslashes.
3. Collect multiple cases (different paths/tool names, different chunk splits) to bound it.

## Likely fix location
`apps/web/src/components/Markdown.tsx` (smd `parser_write` feed — buffer until an inline-code
span is terminated before writing, or feed on safe boundaries), and/or
`apps/web/src/components/sanitizeEmphasis.ts` / `InlineMarkdownCodeBlock.tsx`.

## Definition of done
The exact 767-char thought renders with `` `acquisition.local_path` = `D:\…csv` `` and
`` `pandas_profile_csv` `` intact under BOTH whole and chunked feeds; regression test feeds a
backtick span split mid-token and asserts the span + surrounding spaces survive.
