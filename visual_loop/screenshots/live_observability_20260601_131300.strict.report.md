# Live Observability Temporal Assertion

- input: `visual_loop/screenshots/live_observability_20260601_131300.jsonl`
- verdict: `FAIL`
- completion_t: `62.569`
- required_order: `route_or_delegate, child_expert_active, tool_started, tool_completed, parent_resumed`
- min_live_lead_s: `0.25`

## Matched Sequence

-   3.337s · route_or_delegate · message.part.added · orchestrator -> data · data
-   3.337s · child_expert_active · message.part.added · data -> ndp_catalog · tool.started
-   3.337s · tool_started · tool.call.started · ndp_list_organizations
-   8.649s · tool_completed · tool.call.completed · ndp_list_organizations

## Missing Before Completion

- parent_resumed

## Classified Timeline

-   3.337s · route_or_delegate · message.part.added · orchestrator -> data · data
-   3.337s · route_or_delegate · message.part.added · data -> ndp_catalog · tool.started
-   3.337s · child_expert_active · message.part.added · data -> ndp_catalog · tool.started
-   3.337s · tool_started · tool.call.started · ndp_list_organizations
-   3.337s · tool_started · message.part.added · ndp_list_organizations
-   8.649s · tool_completed · tool.call.completed · ndp_list_organizations
-   8.649s · tool_completed · message.part.added · ndp_list_organizations
-   8.649s · tool_started · tool.call.started · ndp_search_datasets
-   8.649s · tool_started · message.part.added · ndp_search_datasets
-  12.055s · tool_completed · tool.call.completed · ndp_search_datasets
-  12.056s · tool_completed · message.part.added · ndp_search_datasets
-  12.056s · tool_started · tool.call.started · ndp_search_datasets
-  12.056s · tool_started · message.part.added · ndp_search_datasets
-  13.761s · tool_completed · tool.call.completed · ndp_search_datasets
-  13.761s · tool_completed · message.part.added · ndp_search_datasets
-  17.575s · tool_started · tool.call.started · ndp_stage_resource
-  17.575s · tool_started · message.part.added · ndp_stage_resource
-  17.976s · tool_completed · tool.call.completed · ndp_stage_resource
-  17.976s · tool_completed · message.part.added · ndp_stage_resource
-  23.690s · tool_started · tool.call.started · ndp_get_dataset_details
-  23.690s · tool_started · message.part.added · ndp_get_dataset_details
-  24.091s · tool_completed · tool.call.completed · ndp_get_dataset_details
-  24.091s · tool_completed · message.part.added · ndp_get_dataset_details
-  30.105s · tool_started · tool.call.started · ndp_search_datasets
-  30.105s · tool_started · message.part.added · ndp_search_datasets
-  50.652s · tool_completed · tool.call.completed · ndp_search_datasets
-  50.652s · tool_completed · message.part.added · ndp_search_datasets
-  54.661s · tool_started · tool.call.started · ndp_search_datasets
-  54.661s · tool_started · message.part.added · ndp_search_datasets
-  57.768s · tool_completed · tool.call.completed · ndp_search_datasets
-  57.768s · tool_completed · message.part.added · ndp_search_datasets
-  62.568s · tool_completed · message.part.added · ndp_list_organizations
-  62.568s · tool_completed · message.part.added · ndp_search_datasets
-  62.568s · tool_completed · message.part.added · ndp_search_datasets
-  62.568s · tool_completed · message.part.added · ndp_stage_resource
-  62.568s · tool_completed · message.part.added · ndp_get_dataset_details
-  62.568s · tool_completed · message.part.added · ndp_search_datasets
-  62.568s · tool_completed · message.part.added · ndp_search_datasets
-  62.569s · completion · message.completed
