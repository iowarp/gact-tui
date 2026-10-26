# Conversation loading and retention

The transcript and composer load first. Pending questions and permission requests remain
immediate. After the transcript paints, optional reads for the current session share a
two-request queue: artifacts, context, work, evidence and workspace files. Opening a panel
uses the same query and any read already in flight. Work history warms only its first
25 direct tasks; further pages load explicitly. The family-wide execution graph loads when
the Gantt view is opened. Session summaries support navigation without loading every
conversation body.

Flow responses include task timestamps, avoiding a full task-detail request for every
node. Older servers retain the legacy fallback. Offscreen flow cards pause reads and
layout work; feedback reads start near the viewport. Graph status and selection updates
reuse layout geometry until the graph structure or sizing changes.
Dense diagrams retain their natural font size in a bounded, pannable viewport rather
than shrinking labels to fit the whole graph inside the conversation column.

Recently visited session bodies are disposable UI data. Defaults retain the current
session and up to two inactive sessions for five minutes after departure, with an
approximate 32 MiB budget for inactive query data. Explicitly open child conversations
stay pinned. Eviction removes unused queries, their normalized session entities and
the reload transcript tail, preserving navigation metadata, pending interactions and
cross-references still used by another conversation. The budget estimates query data;
it is not a bound on total browser heap or active conversation size.
Large optional provenance graphs are discarded first when they exhaust the inactive
budget, so the small log and work cache can remain warm. Query metadata marks these
supplementary values; they are refetched when the view needs them.

Build-time Vite configuration overrides are:

| Variable                        | Default    | Meaning                                     |
| ------------------------------- | ---------- | ------------------------------------------- |
| `VITE_SESSION_CACHE_IDLE_MS`    | `300000`   | Inactive retention interval in milliseconds |
| `VITE_SESSION_CACHE_MAX_RECENT` | `2`        | Maximum inactive recent sessions            |
| `VITE_SESSION_CACHE_MAX_BYTES`  | `33554432` | Approximate inactive query-data byte budget |

These control retention, not freshness. REST reconciliation, query invalidation and live
events remain authoritative; keeping a session warm does not make its data fresh for five
minutes. No server corpus index or full conversation collection is cached by this policy.
