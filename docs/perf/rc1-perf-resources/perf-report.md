# UI performance report

Generated 2026-11-08T13:22:05.353Z at commit `41bab094` on win32, 12 logical CPUs, 32 GB, Chromium 151.0.7922.34. Viewport 1440×900, 3 repetition(s), 20s idle windows. Machine-readable data: `perf-report.json`.

## Budgets

| Budget | Actual | Budget | Verdict |
| --- | --- | --- | --- |
| menu ready p95 | 288.3 ms | 100 ms | **over** |
| picker ready p95 | 186 ms | 100 ms | **over** |
| dialog ready p95 | 99.3 ms | 100 ms | within |
| toggle ready p95 | 48.8 ms | 100 ms | within |
| keypress ready p95 | 37.4 ms | 50 ms | within |
| tab ready p95 | 158.6 ms | 150 ms | **over** |
| tree ready p95 | 38 ms | 100 ms | within |
| navigation ready p95 | 63.2 ms | 300 ms | within |
| scroll ready p95 | 341 ms | 300 ms | **over** |
| file ready p95 | 402.8 ms | 500 ms | within |
| conversation-switch ready p95 | 432.9 ms | 300 ms | **over** |
| interaction event duration p95 (all) | 160 ms | 100 ms | **over** |
| longest task during an interaction | 286 ms | 200 ms | **over** |
| unexpected layout shift per interaction (max) | 0  | 0.05  | within |
| layout shift during a cold load (max) | 0.1  | 0.1  | within |
| cold load: conversation painted | 1130 ms | 1500 ms | within |
| huge conversation (5000 msgs): tail first paint (in-app) | 432.9 ms | 300 ms | **over** |
| huge conversation: cold load to tail painted | 1140 ms | 1500 ms | within |
| huge conversation: older page on scroll p95 | 341 ms | 300 ms | **over** |
| huge conversation: unbounded transcript reads | 0 reads | 0 reads | within |
| web JS heap idle (after GC) | 29.9 MB | 150 MB | within |
| web JS heap with huge conversation scrolled | 36.6 MB | 300 MB | within |
| web JS heap with 2000 conversations | 33.4 MB | 150 MB | within |
| web JS heap after opening 20 MB files | 36.4 MB | 300 MB | within |
| DOM nodes with a 20 MB file open (max) | 5804 nodes | 30000 nodes | within |
| web renderer RSS with a 20 MB file open (max) | 232 MB | 800 MB | within |
| DOM nodes with huge conversation scrolled | 3353 nodes | 30000 nodes | within |
| heap growth over 20s idle | 0.1 MB | 5 MB | within |
| renderer CPU while idle on a running conversation | 4 % core | 5 % core | within |
| web renderer RSS idle | 174 MB | 400 MB | within |
| desktop total RSS idle (host + WebView2) | — | 600 MB | not measured |
| desktop total RSS with huge conversation | — | 900 MB | not measured |
| backend RSS idle (live) | — | 500 MB | not measured |

## Interaction latency by category (web)

readyMs: input event to the first frame with the expected UI visible. eventMs: Event Timing duration (input delay + handlers + next paint).

| Category | n | ready p50 | ready p95 | ready max | event p95 | long tasks (ms) | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| picker | 14 | 121.3 | 186 | 186 | 224 | 1379 | 0 |
| menu | 44 | 108.6 | 288.3 | 293.6 | 168 | 3366 | 0 |
| toggle | 22 | 18.2 | 48.8 | 75.9 | 80 | 72 | 0 |
| tab | 17 | 46 | 158.6 | 158.6 | 208 | 917 | 0 |
| dialog | 4 | 63.5 | 99.3 | 99.3 | 128 | 230 | 0 |
| keypress | 157 | 29 | 37.4 | 40.9 | 56 | 0 | 0 |
| scroll | 19 | 216.9 | 341 | 341 | 56 | 3771 | 0 |
| tree | 3 | 31 | 38 | 38 | 24 | 59 | 0 |
| file | 4 | 39 | 402.8 | 402.8 | 64 | 0 | 0 |
| navigation | 31 | 32.6 | 63.2 | 262.7 | 32 | 218 | 0 |
| conversation-switch | 3 | 342.8 | 432.9 | 432.9 | 48 | 1295 | 0 |

## Slowest interactions

| Scenario | Interaction | Category | ready ms | event ms | settle ms | long tasks ms | worst frame script | opened |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| huge-conversation | switch to huge conversation (tail first paint) | conversation-switch | 432.9 | 16 | 1113.4 | 612 | 275 ms TimerHandler:setTimeout | `div ""` |
| large-files | open file large-table.csv | file | 402.8 | 56 | 402.8 | 0 | — | `section "Workspace file preview" ~ "large-table.csv" + section "Workspace file preview" ~ "P001"` |
| huge-conversation | switch back to huge conversation | conversation-switch | 342.8 | 48 | 783.8 | 422 | 310 ms MessagePort.onmessage | `div ""` |
| huge-conversation | scroll up page 3 | scroll | 341 | 40 | 376.8 | 265 | 275 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004880` |
| huge-conversation | scroll up page 1 | scroll | 334.5 | 56 | 436.2 | 305 | 262 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004960` |
| huge-conversation | scroll up page 4 | scroll | 321.1 | 40 | 342.9 | 272 | 286 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004840` |
| huge-conversation | scroll up page 5 | scroll | 320.4 | 48 | 350.4 | 243 | 255 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004800` |
| huge-conversation | scroll up page 9 | scroll | 302.5 | 48 | 325.5 | 231 | 242 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004640` |
| interactions | usage summary | menu | 293.6 | 16 | 296.4 | 0 | — | `div ""` |
| interactions | usage summary | menu | 291.6 | 16 | 291.6 | 0 | — | `div ""` |
| interactions | usage summary | menu | 288.3 | 16 | 288.3 | 0 | — | `div ""` |
| huge-conversation | scroll up page 12 | scroll | 285.6 | 40 | 305.9 | 239 | 252 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004520` |
| huge-conversation | scroll up page 8 | scroll | 272.4 | 48 | 296.8 | 221 | 238 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004680` |
| interactions | back to workspace (from infrastructure) | navigation | 262.7 | 32 | 380.4 | 218 | 165 ms MessagePort.onmessage | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"` |
| huge-conversation | scroll up page 2 | scroll | 242.9 | 32 | 263.8 | 205 | 220 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004920` |
| huge-conversation | scroll up page 6 | scroll | 231.6 | 32 | 246.5 | 195 | 208 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004760` |
| huge-conversation | scroll up page 10 | scroll | 216.9 | 32 | 310.8 | 184 | 198 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004600` |
| huge-conversation | scroll up page 11 | scroll | 216.1 | 32 | 239 | 165 | 172 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004560` |
| huge-conversation | scroll up page 14 | scroll | 210.6 | 32 | 227 | 176 | 193 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004440` |
| huge-conversation | scroll up page 15 | scroll | 205.4 | 40 | 225.7 | 171 | 188 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004400` |
| huge-conversation | scroll up page 13 | scroll | 202.9 | 32 | 223.7 | 165 | 181 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004480` |
| interactions | load earlier (button) page 1 | scroll | 195.8 | 56 | 196.7 | 139 | 157 ms TimerHandler:setTimeout | `fetched sess_flat_ndp/messages?limit=40&before=msg_history_0921` |
| many-sessions | search work (button) | picker | 186 | 224 | 493 | 178 | — | `listbox "Suggestions"` |
| interactions | load earlier (button) page 3 | scroll | 169.9 | 48 | 170.6 | 138 | 147 ms TimerHandler:setTimeout | `fetched sess_flat_ndp/messages?limit=40&before=msg_history_0841` |
| interactions | load earlier (button) page 2 | scroll | 165.6 | 48 | 166.2 | 128 | 142 ms TimerHandler:setTimeout | `fetched sess_flat_ndp/messages?limit=40&before=msg_history_0881` |

## Not measured

| Scenario | Interaction | Why |
| --- | --- | --- |
| interactions | mention menu (@) | expected UI never appeared |
| interactions | mention menu (@) | expected UI never appeared |
| interactions | transcript outline | control not found |

## Cold loads

| Scenario | URL | FCP | LCP | marks (ms from navigation) | long tasks | heap MB (GC) | DOM nodes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| interactions | `/workspaces/ws_flat_ndp/sessions/sess_flat_ndp` | 664 | 664 | shell 648, composer 862, conversation 1130 | 7 / 888 ms | 29.8 | 1928 |
| huge-conversation | `/workspaces/ws_flat_ndp/sessions/sess_flat_ndp` | 628 | 1208 | shell 614, composer 793, conversation 1170 | 8 / 984 ms | 30.1 | 1941 |
| huge-conversation | `/workspaces/ws_flat_ndp/sessions/sess_perf_huge` | 648 | 1164 | shell 626, composer 833, tail 1140 | 9 / 1096 ms | 32 | 3353 |
| many-sessions | `/workspaces/ws_flat_ndp/sessions/sess_flat_ndp` | 744 | 1408 | shell 725, composer 956, conversation 1375 | 8 / 1043 ms | 31.1 | 2166 |
| large-files | `/workspaces/ws_flat_ndp/sessions/sess_flat_ndp` | 536 | 536 | shell 514, composer 732, conversation 948 | 5 / 678 ms | 29.8 | 1928 |

## Huge conversation (5000 messages)

| Checkpoint | JS heap MB | DOM nodes |
| --- | --- | --- |
| tail rendered | 34.9 | 3394 |
| after scrolling up | 36.6 | 3353 |
| after away and back | 37.5 | 3394 |

| Phase | API requests | KB | unbounded transcript reads | messages in unbounded reads |
| --- | --- | --- | --- | --- |
| switch | 27 | 186 | 0 | 0 |
| scroll | 57 | 824 | 0 | 0 |
| return | 53 | 77 | 0 | 0 |
| cold | 46 | 194 | 0 | 0 |

## Many conversations (2000 across 51 workspaces)

Sidebar rendered 8 conversation links; heap 33.4 MB, 2275 DOM nodes; load fetched 43 API requests (166 KB).

## Large files (5000-entry tree, 20 MB CSV and log)

Heap 29.8 MB before, 36.4 MB after opening the files (5671 DOM nodes); 26 API requests, 1068 KB.

| File | content ready ms | heap MB (settled, GC) | DOM nodes (settled) | renderer RSS MB |
| --- | --- | --- | --- | --- |
| sample-00000.csv | 39 | 33.9 | 5142 | 227 |
| large-table.csv | 402.8 | 36.8 | 5804 | 232 |
| large-log.txt | 88.3 | 36.5 | 5671 | 226 |

## Process resources

| When | Group | processes | RSS MB | private MB |
| --- | --- | --- | --- | --- |
| web idle | browser | 4 | 326 | 166 |
| web idle | renderers | 1 | 174 | 103 |
| web idle | fixture backend | 2 | 64 | 24 |
| web after journeys | browser | 4 | 403 | 211 |
| web after journeys | renderers | 1 | 240 | 150 |
| web after journeys | fixture backend | 2 | 65 | 24 |
| web huge conversation scrolled | browser | 4 | 410 | 216 |
| web huge conversation scrolled | renderers | 1 | 244 | 153 |
| web huge conversation scrolled | fixture backend | 2 | 65 | 25 |
| web 2000 conversations | browser | 4 | 364 | 175 |
| web 2000 conversations | renderers | 1 | 199 | 109 |
| web 2000 conversations | fixture backend | 2 | 65 | 24 |
| web large files | browser | 4 | 384 | 201 |
| web large files | renderers | 1 | 225 | 137 |
| web large files | fixture backend | 2 | 65 | 25 |

Idle CPU over 20s on the running fixture conversation (% of one core): browser 4.6%, renderers 4%, fixture backend 0.2%.

## Requests during cold load (interactions scenario)

| Route | count | KB |
| --- | --- | --- |
| `/v1/sessions/{session}/a2ui/catalogs` | 1 | 126 |
| `/v1/sessions/{session}/messages` | 1 | 11 |
| `/v1/provider-catalog` | 1 | 3 |
| `/v1/capabilities` | 4 | 2 |
| `/v1/workspaces/{workspace}/resources` | 1 | 1 |
| `/v1/sessions/{session}/artifacts` | 1 | 1 |
| `/v1/sessions` | 3 | 1 |
| `/v1/sessions/{session}/pending-steers` | 1 | 1 |

