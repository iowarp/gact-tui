# Live Observability Capture 20260601_131300

- backend: `http://127.0.0.1:17800`
- session: `sess_d9e9ae16b4dc`
- verdict: `PASS`
- completed: `True`
- jsonl: `visual_loop/screenshots/live_observability_20260601_131300.jsonl`

## Counts

- routing_decision parts: 1
- expert_handoff parts: 1
- tool_call/tool_result parts: 21
- tool.call lifecycle events: 14
- live observability events before completion: 37

## Timeline

-  -0.498s · server.connected
-   0.009s · session.status_changed · status=running
-   0.009s · message.created · stop_reason=
-   0.010s · context.frame.created · status=assembled
-   3.337s · message.created · stop_reason=
-   3.337s · message.part.added · part_type=routing_decision · selected_agent=data · execution_path=orchestrator -> data · tool_name=
-   3.337s · message.part.added · part_type=expert_handoff · selected_agent= · execution_path= · agent_id=ndp_catalog · parent_id=data · stage=tool.started · tool_name= · status=running
-   3.337s · tool.call.started · tool=ndp_list_organizations
-   3.337s · message.part.added · part_type=tool_call · selected_agent= · execution_path= · tool_name=ndp_list_organizations
-   8.649s · tool.call.completed · tool=ndp_list_organizations
-   8.649s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_list_organizations
-   8.649s · tool.call.started · tool=ndp_search_datasets
-   8.649s · message.part.added · part_type=tool_call · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  12.055s · tool.call.completed · tool=ndp_search_datasets
-  12.056s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  12.056s · tool.call.started · tool=ndp_search_datasets
-  12.056s · message.part.added · part_type=tool_call · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  13.761s · tool.call.completed · tool=ndp_search_datasets
-  13.761s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  14.503s · server.heartbeat
-  17.575s · tool.call.started · tool=ndp_stage_resource
-  17.575s · message.part.added · part_type=tool_call · selected_agent= · execution_path= · tool_name=ndp_stage_resource
-  17.976s · tool.call.completed · tool=ndp_stage_resource
-  17.976s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_stage_resource
-  23.690s · tool.call.started · tool=ndp_get_dataset_details
-  23.690s · message.part.added · part_type=tool_call · selected_agent= · execution_path= · tool_name=ndp_get_dataset_details
-  24.091s · tool.call.completed · tool=ndp_get_dataset_details
-  24.091s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_get_dataset_details
-  29.503s · server.heartbeat
-  30.105s · tool.call.started · tool=ndp_search_datasets
-  30.105s · message.part.added · part_type=tool_call · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  44.504s · server.heartbeat
-  50.652s · tool.call.completed · tool=ndp_search_datasets
-  50.652s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  54.661s · tool.call.started · tool=ndp_search_datasets
-  54.661s · message.part.added · part_type=tool_call · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  57.768s · tool.call.completed · tool=ndp_search_datasets
-  57.768s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  59.505s · server.heartbeat
-  62.568s · context.frame.completed · status=error
-  62.568s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_list_organizations
-  62.568s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  62.568s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  62.568s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_stage_resource
-  62.568s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_get_dataset_details
-  62.568s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  62.568s · message.part.added · part_type=tool_result · selected_agent= · execution_path= · tool_name=ndp_search_datasets
-  62.568s · message.part.added · part_type=text · selected_agent= · execution_path= · tool_name=
-  62.568s · message.part.completed
-  62.569s · message.completed · stop_reason=error
