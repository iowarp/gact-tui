# Transcript entries review

Grouped conversation activity now retains the recorded sequence:

1. Text entry: recorded thinking is collapsed; the public update stays visible.
2. Tool entry: the iteration's calls are collapsed together, with a short action
   label such as "Read files" or "Edited files, ran commands".
3. Each call opens its original arguments, result and diagnostics inline.
4. The next text entry follows at its recorded position.

Questions, plan approval and active embedded apps stay actionable outside a
collapsed group. Intermediate answers, artifacts and compaction records retain
their canonical positions. Reader disclosure choices survive streaming and
completion. The shared full activity view retains the same text semantics.

Numeric outcomes appear only in the completion footer: **8 (4 failed) tool calls**.
Counts use distinct recorded invocation IDs and semantic failure states. Denied,
cancelled and partial calls retain their own outcomes in the expanded details.
The footer and model-switch checkpoint use spacing and subtle border dividers
instead of middle-dot separators.

These are actual Chromium captures of the production transcript components,
including the app's real motion and appearance providers and actual Inter font.
The turn and tool replies are explicitly **simulated fixtures**. They prove
rendering and interaction, not fresh provider inference or native Desktop
acceptance. No account, client, auth, model/default or user-data writes occur.

- `entries-collapsed-desktop-fixture.png`: visible updates alternate with action
  disclosures; thinking and calls begin collapsed, with eight calls and four
  failures in the footer plus a provider/model checkpoint.
- `tool-expanded-desktop-fixture.png`: the first call expands inline; the long
  result scrolls within a bounded region.
- `thinking-expanded-desktop-fixture.png`: manually expanded thinking remains
  open after a simulated live update and turn completion.
- `entries-collapsed-mobile-fixture.png`: the same sequence at 390px.
- `tool-expanded-mobile-fixture.png`: keyboard expansion, arguments and results
  remain inside the phone viewport.

Reproduce from the repository with:

```sh
pnpm --dir web exec vite --config tests/review/transcript-vite.config.ts
```

Then, from `web`, run `node tests/review/transcript-entries-check.mjs`. The browser
closes in `finally`. Review JSON and PNGs go to `web/test-results/transcript-entries`
or `CLIO_REVIEW_OUTPUT`. The review checks independent disclosure, live choice
retention, complete inline request/result, bounded overflow, keyboard collapse,
actual font loading and desktop/phone containment. It makes no force clicks or
test-timeout overrides.
