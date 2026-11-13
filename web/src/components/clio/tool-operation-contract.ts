import { vocab } from '@/lib/brand-vocabulary';
import { t } from '@lingui/core/macro';

const { agent } = vocab;

/** Semantic input declarations for the supported tools; layout belongs to shared readers. */
export type OperationFamily =
  | 'task'
  | 'wait'
  | 'assignment'
  | 'search'
  | 'memory'
  | 'value'
  | 'declared'
  | 'ack';
export interface OperationDefinition {
  action: string;
  family: OperationFamily;
  subjects?: readonly string[];
  query?: string;
  instruction?: string;
  presentedAction?: boolean;
  /** The action without its subject, when `action` leads into one ("Read result of"). */
  standalone?: string;
}

const define = (
  action: string,
  family: OperationFamily = 'declared',
  ...subjects: string[]
): OperationDefinition => ({ action, family, subjects });
const search = (action: string, ...subjects: string[]): OperationDefinition => ({
  ...define(action, 'search', ...subjects),
  query: 'query',
});

/** One declaration per canonical operation, including plugin-loaded tools. No callable aliases. */
export const TOOL_OPERATIONS: Readonly<Record<string, OperationDefinition>> = {
  spawn_agent_task: define(
    t({ message: 'Delegate', context: 'verb: tool action' }),
    'assignment',
    'name',
  ),
  spawn_agents_parallel: define(
    t({ message: 'Delegate', context: 'verb: tool action' }),
    'assignment',
  ),
  run_flow: define(t`Run flow`, 'task', 'flow'),
  run_workflow: define(t`Run workflow`, 'task', 'workflow'),
  query_tasks: search(t`Search tasks`),
  observe_tasks: define(t({ message: 'Check', context: 'verb: tool action' }), 'task', 'tasks'),
  wait_tasks: define(t`Wait for`, 'wait', 'tasks'),
  get_task_result: { ...define(t`Read result of`, 'task', 'handle'), standalone: t`Read result` },
  send_agent_message: {
    ...define(t`Send message to`, 'task', 'target'),
    standalone: t`Send message`,
  },
  cancel_tasks: define(t({ message: 'Cancel', context: 'verb: tool action' }), 'task', 'tasks'),
  pause_agent: define(t({ message: 'Pause', context: 'verb: tool action' }), 'ack', 'handle'),
  resume_agent: define(t({ message: 'Resume', context: 'verb: tool action' }), 'ack', 'handle'),
  restart_agent: define(t({ message: 'Restart', context: 'verb: tool action' }), 'task', 'handle'),
  ask_user: { ...define(t`Ask you`), presentedAction: true },
  make_plugin: define(t`Create plugin`, 'value', 'name'),
  cron_create: {
    ...define(t({ message: 'Schedule', context: 'verb: tool action' })),
    instruction: 'prompt',
  },
  cron_list: define(t`List schedules`),
  cron_delete: define(t`Cancel schedule`, 'ack', 'schedule_id'),
  set_goal: { ...define(t`Start goal`), instruction: 'condition' },
  goal_status: define(t`Check goal`),
  wait_for: define(t`Continue after`, 'ack', 'tasks'),
  set_loop: {
    ...define(t({ message: 'Monitor', context: 'verb: tool action' })),
    instruction: 'prompt',
  },
  loop_wakeup: define(t`Next check`, 'ack'),
  fs_list_directory: define(
    t({ message: 'List', context: 'verb: tool action' }),
    'declared',
    'path',
  ),
  fs_search_text: search(t({ message: 'Search', context: 'verb: tool action' }), 'path'),
  fs_read_file: define(t`Read file`, 'declared', 'path'),
  fs_write_file: { ...define(t`Write file`, 'declared', 'path'), instruction: 'content' },
  fs_edit_file: define(t`Edit file`, 'declared', 'path'),
  shell_bash: define(t`Run command`, 'declared', 'command'),
  // The script's name (its label, first comment or first statement) is the declared subject.
  run_code: define(t`Run script`),
  ssh_execute: {
    ...define(t`Run on`, 'declared', 'ssh_profile'),
    standalone: t({ message: 'Run', context: 'verb: tool action' }),
  },
  view_image: define(t`View image`, 'declared', 'path'),
  view_pdf: define(t`View PDF`, 'declared', 'path'),
  prepare_document: define(
    t({ message: 'Render', context: 'verb: tool action' }),
    'declared',
    'path',
  ),
  prepare_execution_runtime: define(t`Inspect execution environment`),
  prepare_document_runtime: define(t`Prepare document tools`),
  workspace_resource_list: define(t`List uploads`),
  workspace_resource_inspect: define(
    t({ message: 'Inspect', context: 'verb: tool action' }),
    'declared',
    'resource_id',
  ),
  workspace_resource_wait: define(t`Wait for conversion`),
  workspace_resource_read: define(
    t({ message: 'Read', context: 'verb: tool action' }),
    'declared',
    'resource_id',
  ),
  workspace_resource_search: search(
    t({ message: 'Search', context: 'verb: tool action' }),
    'resource_id',
  ),
  workspace_resource_structure: define(
    t({ message: 'Inspect', context: 'verb: tool action' }),
    'declared',
    'resource_id',
  ),
  connected_data_status: define(t`Check connections`),
  connected_data_connect: define(
    t({ message: 'Connect', context: 'verb: tool action' }),
    'declared',
    'label',
  ),
  connected_data_index: {
    ...define(t`Refresh index of`, 'declared', 'source_id'),
    standalone: t`Refresh index`,
  },
  connected_data_download: define(t`Download from`, 'declared', 'source_id'),
  connected_data_open: define(
    t({ message: 'Open', context: 'verb: tool action' }),
    'declared',
    'path',
  ),
  connected_data_write: {
    ...define(t({ message: 'Save', context: 'verb: tool action' }), 'declared', 'path'),
    instruction: 'content',
  },
  connected_data_ndp_organizations: search(t`Find publishers`),
  connected_data_search_ndp: search(t`Search datasets`),
  connected_data_ndp_endpoint_connect: define(
    t({ message: 'Connect', context: 'verb: tool action' }),
    'declared',
    'name',
  ),
  connected_data_ndp_endpoint_operations: search(t`Find actions`),
  connected_data_ndp_endpoint_request: define(
    t({ message: 'Request', context: 'verb: tool action' }),
    'declared',
    'operation_id',
  ),
  connected_data_ndp_upload_artifact: define(
    t({ message: 'Upload', context: 'verb: tool action' }),
    'declared',
    'artifact_id',
  ),
  create_memory: define(
    t({ message: 'Remember', context: 'verb: tool action' }),
    'memory',
    'subject',
  ),
  update_memory: define(t({ message: 'Correct', context: 'verb: tool action' }), 'memory'),
  forget_memory: define(t({ message: 'Forget', context: 'verb: tool action' }), 'memory', 'name'),
  memory_search: search(t`Search memories`),
  memory_read: define(t({ message: 'Read', context: 'verb: tool action' }), 'memory', 'name'),
  propose_memory_change: define(t`Propose memory change`, 'memory', 'target'),
  clio_search: search(t`Search ${agent}`),
  clio_search_read: define(
    t({ message: 'Read', context: 'verb: tool action' }),
    'declared',
    'path',
  ),
  session_search: search(t`Search conversations`),
  session_read_summary: define(t`Read conversation summary`),
  session_read_context_frame: define(t`Read retained context`),
  recall_context: search(t({ message: 'Recall', context: 'verb: tool action' })),
  create_a2ui_surface: define(t`Create widget`, 'declared', 'surface_id'),
  update_a2ui_components: {
    ...define(t`Update layout of`, 'declared', 'surface_id'),
    standalone: t`Update layout`,
  },
  update_a2ui_data_model: define(
    t({ message: 'Update', context: 'verb: tool action' }),
    'declared',
    'surface_id',
  ),
  inspect_a2ui_surface: define(
    t({ message: 'Inspect', context: 'verb: tool action' }),
    'declared',
    'surface_id',
  ),
  capture_a2ui_surface: define(t`Inspect rendered widget`, 'declared', 'surface_id'),
  delete_a2ui_surface: define(t`Remove widget`, 'ack', 'surface_id'),
  publish_dashboard_report: define(t`Save dashboard`, 'declared', 'report_id'),
  create_artifact: define(t({ message: 'Keep', context: 'verb: tool action' }), 'declared', 'name'),
  raise_alert_card: { ...define(t`Notify parent about`, 'declared', 'title'), instruction: 'body' },
  list_models: define(t`Find models`, 'value'),
  refresh_provider_models: define(t`Refresh model catalogs`),
  usage: define(t`Read usage`, 'value', 'account'),
  get_weather_forecast: {
    ...define(t`Weather for`, 'declared', 'location'),
    standalone: t`Weather`,
  },
  plan_exit: define(t`Review plan`),
  write_todos: define(t`Update checklist`),
  load_skill: { ...define(t`Load skill`), presentedAction: true },
  web_search: search(t`Search web`),
  web_fetch: define(
    t({ message: 'Read', context: 'verb: tool action' }),
    'declared',
    'target',
    'url',
  ),
};
