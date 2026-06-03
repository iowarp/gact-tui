# Live Observability Capture clio_semantic_live_events

- backend: `http://127.0.0.1:17910`
- session: `sess_08df68d22bd4`
- verdict: `PASS`
- completed: `True`
- strict_benchmark_hierarchy: `True`
- runtime_provenance_agreement: `True`
- min_live_lead_s: `0.25`
- jsonl: `visual_loop/screenshots/live_observability_clio_semantic_live_events.jsonl`

## Counts

- route/delegate observations: 8
- child expert active observations: 5
- tool started observations: 3
- tool completed observations: 3
- parent resumed observations: 3

## Required Order

- required: `route_or_delegate, child_expert_active, tool_started, tool_completed, parent_resumed`
- missing: `none`

## Runtime Provenance Agreement

- missing_or_mismatched: `none`
- matched: `trace_id: trace_msg_user_93554ec96cab, agent/expert: data, ndp_catalog, observed tools: NdpSearchDatasets, delegation rows: data->ndp_catalog, parent resume: data->ndp_catalog`

## Matched Sequence

-   0.122s · route_or_delegate · semantic.event · main
-   0.123s · child_expert_active · semantic.event · data -> ndp_catalog · delegate.started
-   0.123s · tool_started · semantic.event · NdpSearchDatasets
-   4.132s · tool_completed · semantic.event · NdpSearchDatasets
-   4.132s · parent_resumed · semantic.event · data -> ndp_catalog · delegate.completed

## Temporal Assertion Report

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

## Raw Timeline

-  -0.497s · server.connected
-   0.003s · session.status_changed · status=running
-   0.003s · message.created · stop_reason=
-   0.122s · semantic.event · event_type=turn.started · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · status=running
-   0.122s · context.frame.created · status=assembled
-   0.122s · semantic.event · event_type=hook.invocation.started · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · status=running
-   0.122s · semantic.event · event_type=hook.invocation.completed · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · status=completed
-   0.122s · semantic.event · event_type=agent.invocation.started · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · parent_id=main · status=running
-   0.123s · semantic.event · event_type=llm.request.started · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · parent_id=main · status=running
-   0.123s · semantic.event · event_type=llm.request.started · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · parent_id=main · status=running
-   0.123s · semantic.event · event_type=delegation.started · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · agent_id=ndp_catalog · parent_id=data · stage=delegate.started · status=running
-   0.123s · semantic.event · event_type=tool.call.started · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · tool=NdpSearchDatasets · status=running
-   0.123s · tool.call.started · tool=NdpSearchDatasets · call_id=call_7c0a787fa837
-   0.123s · message.created · stop_reason=
-   0.123s · message.part.added · part_type=tool_call · selected_agent= · execution_path= · tool_name=NdpSearchDatasets · call_id=call_7c0a787fa837
-   4.132s · semantic.event · event_type=tool.call.completed · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · tool=NdpSearchDatasets · status=completed
-   4.132s · tool.call.completed · tool=NdpSearchDatasets · call_id=call_7c0a787fa837
-   4.132s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=NdpSearchDatasets · call_id=call_7c0a787fa837
-   4.132s · semantic.event · event_type=delegation.completed · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · agent_id=ndp_catalog · parent_id=data · stage=delegate.completed · status=completed
-   4.132s · semantic.event · event_type=delegation.parent_resumed · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · agent_id=ndp_catalog · parent_id=data · stage=parent.resumed · status=completed
-   4.626s · semantic.event · event_type=llm.response.completed · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · parent_id=main · status=completed
-   4.626s · semantic.event · event_type=agent.invocation.completed · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · parent_id=main · status=completed
-   4.626s · context.frame.completed · status=completed
-   4.626s · message.part.added · part_type=routing_decision · selected_agent=data · execution_path= · tool_name= · call_id=
-   4.626s · message.part.added · part_type=expert_handoff · selected_agent= · execution_path= · agent_id=ndp_catalog · parent_id=data · stage=delegate.started · tool_name= · call_id= · status=running
-   4.626s · message.part.added · part_type=expert_handoff · selected_agent= · execution_path= · agent_id=ndp_catalog · parent_id=data · stage=delegate.completed · tool_name= · call_id= · status=completed
-   4.626s · message.part.added · part_type=expert_handoff · selected_agent= · execution_path= · agent_id=ndp_catalog · parent_id=data · stage=parent.resumed · tool_name= · call_id= · status=completed
-   4.626s · message.part.added · part_type=text · selected_agent= · execution_path= · tool_name= · call_id=
-   4.626s · message.part.completed
-   4.626s · semantic.event · event_type=turn.completed · trace_id=trace_msg_user_93554ec96cab · turn_id=msg_user_93554ec96cab · parent_id=data · status=completed
-   4.626s · message.completed · stop_reason=end_turn
