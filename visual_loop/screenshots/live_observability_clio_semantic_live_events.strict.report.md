# Live Observability Temporal Assertion

- input: `visual_loop/screenshots/live_observability_clio_semantic_live_events.jsonl`
- verdict: `PASS`
- completion_t: `4.626`
- required_order: `route_or_delegate, child_expert_active, tool_started, tool_completed, parent_resumed`
- min_live_lead_s: `0.25`

## Matched Sequence

-   0.122s · route_or_delegate · semantic.event · main
-   0.123s · child_expert_active · semantic.event · data -> ndp_catalog · delegate.started
-   0.123s · tool_started · semantic.event · NdpSearchDatasets
-   4.132s · tool_completed · semantic.event · NdpSearchDatasets
-   4.132s · parent_resumed · semantic.event · data -> ndp_catalog · delegate.completed

## Runtime Provenance Agreement

- verdict: `PASS`
- matched:
  - trace_id: trace_msg_user_93554ec96cab
  - agent/expert: data, ndp_catalog
  - observed tools: NdpSearchDatasets
  - delegation rows: data->ndp_catalog
  - parent resume: data->ndp_catalog

## Classified Timeline

-   0.122s · route_or_delegate · semantic.event · main
-   0.122s · child_expert_active · semantic.event · main
-   0.123s · route_or_delegate · semantic.event · data -> ndp_catalog · delegate.started
-   0.123s · child_expert_active · semantic.event · data -> ndp_catalog · delegate.started
-   0.123s · tool_started · semantic.event · NdpSearchDatasets
-   0.123s · tool_started · tool.call.started · NdpSearchDatasets
-   0.123s · tool_started · message.part.added · NdpSearchDatasets
-   4.132s · tool_completed · semantic.event · NdpSearchDatasets
-   4.132s · tool_completed · tool.call.completed · NdpSearchDatasets
-   4.132s · tool_completed · message.part.added · NdpSearchDatasets
-   4.132s · route_or_delegate · semantic.event · data -> ndp_catalog · delegate.completed
-   4.132s · parent_resumed · semantic.event · data -> ndp_catalog · delegate.completed
-   4.132s · route_or_delegate · semantic.event · data -> ndp_catalog · parent.resumed
-   4.132s · parent_resumed · semantic.event · data -> ndp_catalog · parent.resumed
-   4.626s · route_or_delegate · message.part.added · data
-   4.626s · route_or_delegate · message.part.added · data -> ndp_catalog · delegate.started
-   4.626s · child_expert_active · message.part.added · data -> ndp_catalog · delegate.started
-   4.626s · route_or_delegate · message.part.added · data -> ndp_catalog · delegate.completed
-   4.626s · child_expert_active · message.part.added · data -> ndp_catalog · delegate.completed
-   4.626s · route_or_delegate · message.part.added · data -> ndp_catalog · parent.resumed
-   4.626s · child_expert_active · message.part.added · data -> ndp_catalog · parent.resumed
-   4.626s · parent_resumed · message.part.added · data -> ndp_catalog · parent.resumed
-   4.626s · completion · semantic.event · data
-   4.626s · completion · message.completed
