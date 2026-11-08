# UI performance report

Generated 2026-11-08T15:06:55.091Z at commit `73352920` on win32, 12 logical CPUs, 32 GB, Chromium 151.0.7922.34. Viewport 1440×900, 1 repetition(s), 8s idle windows. Machine-readable data: `perf-report.json`.

## Budgets

| Budget | Actual | Budget | Verdict |
| --- | --- | --- | --- |
| menu ready p95 | — | 100 ms | not measured |
| picker ready p95 | — | 100 ms | not measured |
| dialog ready p95 | — | 100 ms | not measured |
| toggle ready p95 | — | 100 ms | not measured |
| keypress ready p95 | — | 50 ms | not measured |
| tab ready p95 | — | 150 ms | not measured |
| tree ready p95 | — | 100 ms | not measured |
| navigation ready p95 | — | 300 ms | not measured |
| scroll ready p95 | — | 300 ms | not measured |
| file ready p95 | — | 500 ms | not measured |
| conversation-switch ready p95 | — | 300 ms | not measured |
| interaction event duration p95 (all) | — | 100 ms | not measured |
| longest task during an interaction | 0 ms | 200 ms | within |
| unexpected layout shift per interaction (max) | 0  | 0.05  | within |
| layout shift during a cold load (max) | 0  | 0.1  | within |
| cold load: conversation painted | — | 1500 ms | not measured |
| huge conversation (5000 msgs): tail first paint (in-app) | — | 300 ms | not measured |
| huge conversation: cold load to tail painted | — | 1500 ms | not measured |
| huge conversation: older page on scroll p95 | — | 300 ms | not measured |
| huge conversation: unbounded transcript reads | — | 0 reads | not measured |
| web JS heap idle (after GC) | — | 150 MB | not measured |
| web JS heap with huge conversation scrolled | — | 300 MB | not measured |
| web JS heap with 2000 conversations | — | 150 MB | not measured |
| web JS heap after opening 20 MB files | — | 300 MB | not measured |
| DOM nodes with huge conversation scrolled | — | 30000 nodes | not measured |
| heap growth over 8s idle | — | 5 MB | not measured |
| renderer CPU while idle on a running conversation | — | 5 % core | not measured |
| web renderer RSS idle | — | 400 MB | not measured |
| desktop total RSS idle (host + WebView2) | 559 MB | 600 MB | within |
| desktop total RSS with huge conversation | 623 MB | 900 MB | within |
| backend RSS idle (live) | — | 500 MB | not measured |

## Interaction latency by category (web)

readyMs: input event to the first frame with the expected UI visible. eventMs: Event Timing duration (input delay + handlers + next paint).

| Category | n | ready p50 | ready p95 | ready max | event p95 | long tasks (ms) | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Slowest interactions

| Scenario | Interaction | Category | ready ms | event ms | settle ms | long tasks ms | worst frame script | opened |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desktop | customize agent (canvas tab) | tab | 167.8 | 224 | 359.3 | 162 | — | `tab "" ~ "Agent"` |
| desktop | model picker | picker | 155.2 | 192 | 297.7 | 149 | — | `listbox "OpenAI Codex"` |
| desktop | search work (button) | picker | 131.7 | 168 | 186.6 | 124 | — | `listbox "Suggestions"` |
| desktop | conversation actions menu | menu | 111.5 | 128 | 111.5 | 107 | — | `menu ""` |
| desktop | workspace actions menu | menu | 102.5 | 120 | 111.5 | 96 | — | `menu ""` |
| desktop | create or import menu | menu | 99.7 | 128 | 148 | 96 | — | `menu ""` |
| desktop | confirmation policy | menu | 98.2 | 112 | 277.5 | 94 | — | `menu "Ask first"` |
| desktop | execution mode | menu | 95 | 112 | 276.9 | 91 | — | `menu "Execute"` |
| desktop | service status menu | menu | 94.9 | 120 | 278.8 | 91 | — | `menu "WorkspaceLocalAgent"` |
| desktop | search work (Ctrl+K) | picker | 84.7 | 112 | 97.1 | 0 | 85 ms DOMWindow.onkeydown | `listbox "Suggestions"` |
| desktop | mention menu (@) | menu | 73 | 80 | 150 | 67 | 70 ms DIV#root.oninput | `listbox "Suggestions"` |
| desktop | session row actions menu | menu | 70.6 | 88 | 251.3 | 63 | — | `menu ""` |
| desktop | reasoning effort | menu | 69.6 | 88 | 257.7 | 63 | — | `menu "medium"` |
| desktop | attention inbox | menu | 56.2 | 72 | 234.9 | 52 | — | `dialog ""` |
| desktop | keypress 1 | keypress | 54.1 | 72 | 59.6 | 0 | — | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop | expand sidebar | toggle | 45.9 | 72 | 331.7 | 0 | — | `1 × [data-side="left"][data-state="expanded"]` |
| desktop | keypress 20 | keypress | 44 | 56 | 44 | 0 | — | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop | keypress 19 | keypress | 43.3 | 56 | 46.4 | 0 | — | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop | keypress 16 | keypress | 42.2 | 56 | 303.6 | 0 | — | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop | collapse sidebar | toggle | 42 | 72 | 65.7 | 0 | — | `1 × [data-side="left"][data-state="collapsed"]` |
| desktop | keypress 10 | keypress | 40.3 | 56 | 40.3 | 0 | — | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop | keypress 5 | keypress | 39.7 | 48 | 317.4 | 0 | — | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop | slash commands (/) | menu | 39.7 | 56 | 42.8 | 0 | — | `listbox "Suggestions"` |
| desktop | keypress 36 | keypress | 39.6 | 56 | 39.6 | 0 | — | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| desktop | keypress 24 | keypress | 39.5 | 56 | 39.5 | 0 | — | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |

## Not measured

| Scenario | Interaction | Why |
| --- | --- | --- |
| desktop | open questions | control not found |
| desktop | version status | control not found |
| desktop | usage summary | control not found |
| desktop | open workspace canvas | expected UI never appeared |
| desktop | open canvas tab: File explorer | canvas tab menu button not clickable |
| desktop | maximize canvas | control not found |
| desktop | desktop scroll up page 1 | expected UI never appeared |

## Cold loads

| Scenario | URL | FCP | LCP | marks (ms from navigation) | long tasks | heap MB (GC) | DOM nodes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| desktop | `/workspaces/ws_flat_ndp/sessions/sess_flat_ndp` | 684 | 684 | shell 660, composer 996, conversation 1265 | 8 / 847 ms | 29.4 | 1853 |
| desktop | `/workspaces/ws_flat_ndp/sessions/sess_perf_huge` | 1076 | 1776 | shell 1044, composer 1726, tail 1726 | 11 / 1747 ms | 31.5 | 3280 |

## Process resources

| When | Group | processes | RSS MB | private MB |
| --- | --- | --- | --- | --- |
| desktop startup | desktop | 7 | 517 | 461 |
| desktop idle | desktop | 7 | 559 | 345 |
| desktop after journeys | desktop | 7 | 617 | 393 |
| desktop huge conversation | desktop | 7 | 623 | 391 |

