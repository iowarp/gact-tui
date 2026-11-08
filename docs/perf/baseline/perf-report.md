# UI performance report

Generated 2026-11-08T09:29:31.249Z at commit `ee6ab01c` on win32, 12 logical CPUs, 32 GB, Chromium 151.0.7922.34. Viewport 1440×900, 3 repetition(s), 20s idle windows. Machine-readable data: `perf-report.json`.

## Budgets

| Budget                                                   | Actual       | Budget      | Verdict      |
| -------------------------------------------------------- | ------------ | ----------- | ------------ |
| menu ready p95                                           | 303.3 ms     | 100 ms      | **over**     |
| picker ready p95                                         | 242.1 ms     | 100 ms      | **over**     |
| dialog ready p95                                         | 149.7 ms     | 100 ms      | **over**     |
| toggle ready p95                                         | 70.4 ms      | 100 ms      | within       |
| keypress ready p95                                       | 28.6 ms      | 50 ms       | within       |
| tab ready p95                                            | 142.7 ms     | 150 ms      | within       |
| tree ready p95                                           | 39.9 ms      | 100 ms      | within       |
| navigation ready p95                                     | 356.6 ms     | 300 ms      | **over**     |
| scroll ready p95                                         | 293.6 ms     | 300 ms      | within       |
| file ready p95                                           | 2960.9 ms    | 500 ms      | **over**     |
| conversation-switch ready p95                            | 435.2 ms     | 300 ms      | **over**     |
| interaction event duration p95 (all)                     | 192 ms       | 100 ms      | **over**     |
| longest task during an interaction                       | 269 ms       | 200 ms      | **over**     |
| unexpected layout shift per interaction (max)            | 0            | 0.05        | within       |
| layout shift during a cold load (max)                    | 0.6          | 0.1         | **over**     |
| cold load: conversation painted                          | 942 ms       | 1500 ms     | within       |
| huge conversation (5000 msgs): tail first paint (in-app) | 435.2 ms     | 300 ms      | **over**     |
| huge conversation: cold load to tail painted             | 806 ms       | 1500 ms     | within       |
| huge conversation: older page on scroll p95              | 293.6 ms     | 300 ms      | within       |
| huge conversation: unbounded transcript reads            | 0 reads      | 0 reads     | within       |
| web JS heap idle (after GC)                              | 29.9 MB      | 150 MB      | within       |
| web JS heap with huge conversation scrolled              | 36.5 MB      | 300 MB      | within       |
| web JS heap with 2000 conversations                      | 33.2 MB      | 150 MB      | within       |
| web JS heap after opening 20 MB files                    | 454.3 MB     | 300 MB      | **over**     |
| DOM nodes with a 20 MB file open (max)                   | 960655 nodes | 30000 nodes | **over**     |
| web renderer RSS with a 20 MB file open (max)            | 10232 MB     | 800 MB      | **over**     |
| DOM nodes with huge conversation scrolled                | 3314 nodes   | 30000 nodes | within       |
| heap growth over 20s idle                                | 0.4 MB       | 5 MB        | within       |
| renderer CPU while idle on a running conversation        | 5.1 % core   | 5 % core    | **over**     |
| web renderer RSS idle                                    | 186 MB       | 400 MB      | within       |
| desktop total RSS idle (host + WebView2)                 | —            | 600 MB      | not measured |
| desktop total RSS with huge conversation                 | —            | 900 MB      | not measured |
| backend RSS idle (live)                                  | —            | 500 MB      | not measured |

## Interaction latency by category (web)

readyMs: input event to the first frame with the expected UI visible. eventMs: Event Timing duration (input delay + handlers + next paint).

| Category            | n   | ready p50 | ready p95 | ready max | event p95 | long tasks (ms) | CLS |
| ------------------- | --- | --------- | --------- | --------- | --------- | --------------- | --- |
| picker              | 14  | 169.1     | 242.1     | 242.1     | 288       | 2184            | 0   |
| menu                | 44  | 155.9     | 303.3     | 308.5     | 200       | 5043            | 0   |
| toggle              | 22  | 27.5      | 70.4      | 75.2      | 96        | 142             | 0   |
| tab                 | 17  | 40.9      | 142.7     | 142.7     | 176       | 971             | 0   |
| dialog              | 4   | 61.5      | 149.7     | 149.7     | 168       | 310             | 0   |
| keypress            | 157 | 21.9      | 28.6      | 42        | 48        | 66              | 0   |
| scroll              | 19  | 224.9     | 293.6     | 293.6     | 48        | 3164            | 0   |
| tree                | 3   | 32.4      | 39.9      | 39.9      | 16        | 89              | 0   |
| file                | 4   | 24.9      | 2960.9    | 2960.9    | 40        | 145             | 0   |
| navigation          | 31  | 33.3      | 356.6     | 358.5     | 32        | 139             | 0   |
| conversation-switch | 3   | 320.9     | 435.2     | 435.2     | 32        | 1247            | 0   |

## Slowest interactions

| Scenario          | Interaction                                    | Category            | ready ms | event ms | settle ms | long tasks ms | worst frame script             | opened                                                                                                                      |
| ----------------- | ---------------------------------------------- | ------------------- | -------- | -------- | --------- | ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| large-files       | open file large-log.txt                        | file                | 2960.9   | 32       | 2960.9    | 0             | —                              | `section "Workspace file preview" ~ "large-log.txt" + section "Workspace file preview" ~ "INFO worker-0 processed chunk 0"` |
| large-files       | open file large-table.csv                      | file                | 2807.8   | 32       | 3086      | 145           | 147 ms MessagePort.onmessage   | `section "Workspace file preview" ~ "large-table.csv" + section "Workspace file preview" ~ "P001"`                          |
| huge-conversation | switch to huge conversation (tail first paint) | conversation-switch | 435.2    | 16       | 914.7     | 548           | 245 ms TimerHandler:setTimeout | `div ""`                                                                                                                    |
| interactions      | open settings                                  | navigation          | 358.5    | 32       | 363.6     | 0             | —                              | `h1 "" ~ "General"`                                                                                                         |
| interactions      | open infrastructure                            | navigation          | 356.6    | 32       | 356.6     | 0             | —                              | `h1 "" ~ "Overview"`                                                                                                        |
| interactions      | open runs                                      | navigation          | 346.4    | 16       | 353.2     | 0             | —                              | `h1 "" ~ "Runs"`                                                                                                            |
| huge-conversation | switch back to huge conversation               | conversation-switch | 320.9    | 32       | 765.6     | 410           | 283 ms MessagePort.onmessage   | `div ""`                                                                                                                    |
| interactions      | usage summary                                  | menu                | 308.5    | 16       | 308.5     | 0             | —                              | `div ""`                                                                                                                    |
| interactions      | usage summary                                  | menu                | 306.3    | 16       | 306.3     | 0             | —                              | `div ""`                                                                                                                    |
| interactions      | usage summary                                  | menu                | 303.3    | 16       | 398       | 0             | —                              | `div ""`                                                                                                                    |
| huge-conversation | scroll up page 1                               | scroll              | 293.6    | 40       | 388.2     | 268           | 224 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004960`                                                           |
| huge-conversation | scroll up page 3                               | scroll              | 282.9    | 32       | 304.6     | 223           | 230 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004880`                                                           |
| huge-conversation | scroll up page 2                               | scroll              | 253.5    | 24       | 270.9     | 200           | 206 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004920`                                                           |
| huge-conversation | scroll up page 8                               | scroll              | 249.6    | 32       | 270.1     | 205           | 211 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004680`                                                           |
| huge-conversation | scroll up page 9                               | scroll              | 243.9    | 32       | 263.8     | 179           | 186 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004640`                                                           |
| interactions      | search work (button)                           | picker              | 242.1    | 288      | 504.8     | 236           | 56 ms TimerHandler:setTimeout  | `listbox "Suggestions"`                                                                                                     |
| huge-conversation | scroll up page 7                               | scroll              | 233.8    | 32       | 252.1     | 183           | 193 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004720`                                                           |
| huge-conversation | scroll up page 5                               | scroll              | 232.1    | 32       | 247.2     | 175           | 182 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004800`                                                           |
| huge-conversation | scroll up page 4                               | scroll              | 227.5    | 24       | 249.6     | 180           | 185 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004840`                                                           |
| huge-conversation | scroll up page 15                              | scroll              | 225.9    | 32       | 240.5     | 171           | 177 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004400`                                                           |
| huge-conversation | scroll up page 6                               | scroll              | 224.9    | 24       | 242       | 182           | 188 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004760`                                                           |
| interactions      | back to workspace (from infrastructure)        | navigation          | 219.4    | 40       | 285.6     | 139           | 155 ms MessagePort.onmessage   | `combobox "Ask Agent Workspace to investigate, build, explain, or act…"`                                                    |
| huge-conversation | scroll up page 11                              | scroll              | 219.2    | 24       | 233.6     | 162           | 169 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004560`                                                           |
| huge-conversation | scroll up page 13                              | scroll              | 218.2    | 32       | 239.2     | 172           | 177 ms TimerHandler:setTimeout | `fetched sess_perf_huge/messages?limit=40&before=msg_perf_004480`                                                           |
| interactions      | workspace actions menu                         | menu                | 213.3    | 232      | 308.7     | 209           | —                              | `menu ""`                                                                                                                   |

## Not measured

| Scenario     | Interaction        | Why                        |
| ------------ | ------------------ | -------------------------- |
| interactions | mention menu (@)   | expected UI never appeared |
| interactions | mention menu (@)   | expected UI never appeared |
| interactions | transcript outline | control not found          |

## Cold loads

| Scenario          | URL                                               | FCP | LCP | marks (ms from navigation)                | long tasks | heap MB (GC) | DOM nodes |
| ----------------- | ------------------------------------------------- | --- | --- | ----------------------------------------- | ---------- | ------------ | --------- |
| interactions      | `/workspaces/ws_flat_ndp/sessions/sess_flat_ndp`  | 496 | 496 | shell 482, composer 699, conversation 942 | 8 / 773 ms | 29.5         | 1871      |
| huge-conversation | `/workspaces/ws_flat_ndp/sessions/sess_flat_ndp`  | 444 | 868 | shell 428, composer 651, conversation 833 | 6 / 694 ms | 29.4         | 1884      |
| huge-conversation | `/workspaces/ws_flat_ndp/sessions/sess_perf_huge` | 452 | 844 | shell 438, composer 622, tail 806         | 6 / 704 ms | 31.9         | 3314      |
| many-sessions     | `/workspaces/ws_flat_ndp/sessions/sess_flat_ndp`  | 448 | 448 | shell 434, composer 656, conversation 805 | 6 / 671 ms | 30.4         | 2109      |
| large-files       | `/workspaces/ws_flat_ndp/sessions/sess_flat_ndp`  | 500 | 896 | shell 487, composer 707, conversation 851 | 6 / 664 ms | 29.4         | 1871      |

## Huge conversation (5000 messages)

| Checkpoint          | JS heap MB | DOM nodes |
| ------------------- | ---------- | --------- |
| tail rendered       | 34.9       | 3355      |
| after scrolling up  | 36.5       | 3314      |
| after away and back | 37.5       | 3355      |

| Phase  | API requests | KB  | unbounded transcript reads | messages in unbounded reads |
| ------ | ------------ | --- | -------------------------- | --------------------------- |
| switch | 36           | 188 | 0                          | 0                           |
| scroll | 68           | 828 | 0                          | 0                           |
| return | 62           | 80  | 0                          | 0                           |
| cold   | 59           | 198 | 0                          | 0                           |

## Many conversations (2000 across 51 workspaces)

Sidebar rendered 8 conversation links; heap 33.2 MB, 2218 DOM nodes; load fetched 52 API requests (169 KB).

## Large files (5000-entry tree, 20 MB CSV and log)

Heap 29.4 MB before, 454.3 MB after opening the files (960649 DOM nodes); 98 API requests, 41111 KB.

| File             | content ready ms | heap MB (settled, GC) | DOM nodes (settled) | renderer RSS MB |
| ---------------- | ---------------- | --------------------- | ------------------- | --------------- |
| sample-00000.csv | 24.9             | 34                    | 5083                | 244             |
| large-table.csv  | 2807.8           | 36.1                  | 5426                | 263             |
| large-log.txt    | 2960.9           | 454.3                 | 960655              | 10232           |

## Process resources

| When                           | Group           | processes | RSS MB | private MB |
| ------------------------------ | --------------- | --------- | ------ | ---------- |
| web idle                       | browser         | 4         | 338    | 177        |
| web idle                       | renderers       | 1         | 186    | 113        |
| web idle                       | fixture backend | 2         | 56     | 24         |
| web after journeys             | browser         | 4         | 472    | 275        |
| web after journeys             | renderers       | 1         | 304    | 211        |
| web after journeys             | fixture backend | 2         | 56     | 25         |
| web huge conversation scrolled | browser         | 4         | 423    | 234        |
| web huge conversation scrolled | renderers       | 1         | 261    | 171        |
| web huge conversation scrolled | fixture backend | 2         | 56     | 25         |
| web 2000 conversations         | browser         | 4         | 373    | 179        |
| web 2000 conversations         | renderers       | 1         | 207    | 114        |
| web 2000 conversations         | fixture backend | 2         | 56     | 24         |
| web large files                | browser         | 4         | 10398  | 10286      |
| web large files                | renderers       | 1         | 10238  | 10220      |
| web large files                | fixture backend | 2         | 58     | 26         |

Idle CPU over 20s on the running fixture conversation (% of one core): browser 6.6%, renderers 5.1%, fixture backend 0.9%.

## Requests during cold load (interactions scenario)

| Route                                   | count | KB  |
| --------------------------------------- | ----- | --- |
| `/v1/sessions/{session}/a2ui/catalogs`  | 1     | 126 |
| `/v1/sessions/{session}/messages`       | 1     | 11  |
| `/v1/provider-catalog`                  | 1     | 3   |
| `/v1/capabilities`                      | 4     | 2   |
| `/v1/sessions/{session}/pending-steers` | 3     | 2   |
| `/v1/questions`                         | 3     | 1   |
| `/v1/sessions`                          | 5     | 1   |
| `/v1/permissions`                       | 3     | 1   |
