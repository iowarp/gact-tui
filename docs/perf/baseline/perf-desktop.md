# UI performance report

Generated 2026-11-08T09:41:13.725Z at commit `ee6ab01c` on win32, 12 logical CPUs, 32 GB, Chromium 151.0.7922.34. Viewport 1440×900, 1 repetition(s), 8s idle windows. Machine-readable data: `perf-report.json`.

## Budgets

| Budget                                                   | Actual | Budget      | Verdict      |
| -------------------------------------------------------- | ------ | ----------- | ------------ |
| menu ready p95                                           | —      | 100 ms      | not measured |
| picker ready p95                                         | —      | 100 ms      | not measured |
| dialog ready p95                                         | —      | 100 ms      | not measured |
| toggle ready p95                                         | —      | 100 ms      | not measured |
| keypress ready p95                                       | —      | 50 ms       | not measured |
| tab ready p95                                            | —      | 150 ms      | not measured |
| tree ready p95                                           | —      | 100 ms      | not measured |
| navigation ready p95                                     | —      | 300 ms      | not measured |
| scroll ready p95                                         | —      | 300 ms      | not measured |
| file ready p95                                           | —      | 500 ms      | not measured |
| conversation-switch ready p95                            | —      | 300 ms      | not measured |
| interaction event duration p95 (all)                     | —      | 100 ms      | not measured |
| longest task during an interaction                       | 0 ms   | 200 ms      | within       |
| unexpected layout shift per interaction (max)            | 0      | 0.05        | within       |
| layout shift during a cold load (max)                    | 0      | 0.1         | within       |
| cold load: conversation painted                          | —      | 1500 ms     | not measured |
| huge conversation (5000 msgs): tail first paint (in-app) | —      | 300 ms      | not measured |
| huge conversation: cold load to tail painted             | —      | 1500 ms     | not measured |
| huge conversation: older page on scroll p95              | —      | 300 ms      | not measured |
| huge conversation: unbounded transcript reads            | —      | 0 reads     | not measured |
| web JS heap idle (after GC)                              | —      | 150 MB      | not measured |
| web JS heap with huge conversation scrolled              | —      | 300 MB      | not measured |
| web JS heap with 2000 conversations                      | —      | 150 MB      | not measured |
| web JS heap after opening 20 MB files                    | —      | 300 MB      | not measured |
| DOM nodes with huge conversation scrolled                | —      | 30000 nodes | not measured |
| heap growth over 20s idle                                | —      | 5 MB        | not measured |
| renderer CPU while idle on a running conversation        | —      | 5 % core    | not measured |
| web renderer RSS idle                                    | —      | 400 MB      | not measured |
| desktop total RSS idle (host + WebView2)                 | 561 MB | 600 MB      | within       |
| desktop total RSS with huge conversation                 | 627 MB | 900 MB      | within       |
| backend RSS idle (live)                                  | —      | 500 MB      | not measured |

## Interaction latency by category (web)

readyMs: input event to the first frame with the expected UI visible. eventMs: Event Timing duration (input delay + handlers + next paint).

| Category | n   | ready p50 | ready p95 | ready max | event p95 | long tasks (ms) | CLS |
| -------- | --- | --------- | --------- | --------- | --------- | --------------- | --- |

## Slowest interactions

| Scenario | Interaction                  | Category | ready ms | event ms | settle ms | long tasks ms | worst frame script         | opened                                                                   |
| -------- | ---------------------------- | -------- | -------- | -------- | --------- | ------------- | -------------------------- | ------------------------------------------------------------------------ |
| desktop  | model picker                 | picker   | 144.2    | 160      | 482.7     | 141           | —                          | `listbox "OpenAI Codex"`                                                 |
| desktop  | customize agent (canvas tab) | tab      | 136.7    | 176      | 330.2     | 134           | —                          | `tab "" ~ "Agent"`                                                       |
| desktop  | search work (button)         | picker   | 123.3    | 160      | 177.3     | 118           | —                          | `listbox "Suggestions"`                                                  |
| desktop  | search work (Ctrl+K)         | picker   | 106.4    | 120      | 118.6     | 104           | 107 ms DOMWindow.onkeydown | `listbox "Suggestions"`                                                  |
| desktop  | workspace actions menu       | menu     | 106.3    | 128      | 346.4     | 101           | —                          | `menu ""`                                                                |
| desktop  | confirmation policy          | menu     | 104.1    | 112      | 337       | 101           | —                          | `menu "Ask first"`                                                       |
| desktop  | conversation actions menu    | menu     | 100.8    | 112      | 127.1     | 97            | —                          | `menu ""`                                                                |
| desktop  | execution mode               | menu     | 96.5     | 112      | 337.3     | 93            | —                          | `menu "Execute"`                                                         |
| desktop  | create or import menu        | menu     | 93.1     | 112      | 93.1      | 91            | —                          | `menu ""`                                                                |
| desktop  | service status menu          | menu     | 89.2     | 96       | 89.2      | 87            | —                          | `menu "WorkspaceLocalAgent"`                                             |
| desktop  | reasoning effort             | menu     | 72.4     | 80       | 318.3     | 69            | —                          | `menu "medium"`                                                          |
| desktop  | session row actions menu     | menu     | 70.6     | 80       | 217.8     | 65            | —                          | `menu ""`                                                                |
| desktop  | attention inbox              | menu     | 51.8     | 64       | 336.1     | 0             | —                          | `dialog ""`                                                              |
| desktop  | mention menu (@)             | menu     | 49.5     | 64       | 95.7      | 0             | —                          | `listbox "Suggestions"`                                                  |
| desktop  | expand sidebar               | toggle   | 45.9     | 64       | 52.5      | 0             | —                          | `1 × [data-side="left"][data-state="expanded"]`                          |
| desktop  | collapse sidebar             | toggle   | 41.7     | 64       | 115.1     | 0             | —                          | `1 × [data-side="left"][data-state="collapsed"]`                         |
| desktop  | keypress 2                   | keypress | 39.4     | 56       | 152.5     | 0             | —                          | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop  | keypress 41                  | keypress | 34.3     | 48       | 104.1     | 0             | —                          | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop  | canvas tab menu              | menu     | 30.4     | 48       | 132.1     | 0             | —                          | `menu ""`                                                                |
| desktop  | keypress 27                  | keypress | 29.2     | 32       | 217.1     | 0             | —                          | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop  | keypress 5                   | keypress | 28.5     | 32       | 152.2     | 0             | —                          | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop  | keypress 1                   | keypress | 27.9     | 32       | 41.2      | 0             | —                          | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop  | keypress 20                  | keypress | 26.6     | 48       | 26.6      | 0             | —                          | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop  | keypress 26                  | keypress | 25.1     | 40       | 244.3     | 0             | —                          | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop  | keypress 8                   | keypress | 24.5     | 32       | 89.9      | 0             | —                          | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |

## Not measured

| Scenario | Interaction                    | Why                                  |
| -------- | ------------------------------ | ------------------------------------ |
| desktop  | open questions                 | control not found                    |
| desktop  | version status                 | control not found                    |
| desktop  | usage summary                  | control not found                    |
| desktop  | open workspace canvas          | expected UI never appeared           |
| desktop  | open canvas tab: File explorer | canvas tab menu button not clickable |
| desktop  | maximize canvas                | control not found                    |
| desktop  | desktop scroll up page 1       | expected UI never appeared           |

## Cold loads

| Scenario | URL                                               | FCP | LCP  | marks (ms from navigation)                | long tasks | heap MB (GC) | DOM nodes |
| -------- | ------------------------------------------------- | --- | ---- | ----------------------------------------- | ---------- | ------------ | --------- |
| desktop  | `/workspaces/ws_flat_ndp/sessions/sess_flat_ndp`  | 368 | 688  | shell 356, composer 474, conversation 655 | 5 / 347 ms | 29.1         | 1796      |
| desktop  | `/workspaces/ws_flat_ndp/sessions/sess_perf_huge` | 600 | 1068 | shell 580, composer 993, tail 993         | 6 / 734 ms | 31.6         | 3241      |

## Process resources

| When                      | Group   | processes | RSS MB | private MB |
| ------------------------- | ------- | --------- | ------ | ---------- |
| desktop startup           | desktop | 7         | 523    | 460        |
| desktop idle              | desktop | 7         | 561    | 359        |
| desktop after journeys    | desktop | 7         | 623    | 411        |
| desktop huge conversation | desktop | 7         | 627    | 400        |
