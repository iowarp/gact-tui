import { vocab } from '@/lib/brand-vocabulary';

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
  spawn_agent_task: define('Delegate', 'assignment', 'name'),
  spawn_agents_parallel: define('Delegate', 'assignment'),
  run_flow: define('Run flow', 'task', 'flow'),
  run_workflow: define('Run workflow', 'task', 'workflow'),
  query_tasks: search('Search tasks'),
  observe_tasks: define('Check', 'task', 'tasks'),
  wait_tasks: define('Wait for', 'wait', 'tasks'),
  get_task_result: define('Read result of', 'task', 'handle'),
  send_agent_message: define('Send message to', 'task', 'target'),
  cancel_tasks: define('Cancel', 'task', 'tasks'),
  pause_agent: define('Pause', 'ack', 'handle'),
  resume_agent: define('Resume', 'ack', 'handle'),
  restart_agent: define('Restart', 'task', 'handle'),
  ask_user: { ...define('Ask you'), presentedAction: true },
  make_plugin: define('Create plugin', 'value', 'name'),
  cron_create: { ...define('Schedule'), instruction: 'prompt' },
  cron_list: define('List schedules'),
  cron_delete: define('Cancel schedule', 'ack', 'schedule_id'),
  set_goal: { ...define('Start goal'), instruction: 'condition' },
  goal_status: define('Check goal'),
  wait_for: define('Continue after', 'ack', 'tasks'),
  set_loop: { ...define('Monitor'), instruction: 'prompt' },
  loop_wakeup: define('Next check', 'ack'),
  fs_list_directory: define('List', 'declared', 'path'),
  fs_search_text: search('Search', 'path'),
  fs_read_file: define('Read file', 'declared', 'path'),
  fs_write_file: { ...define('Write file', 'declared', 'path'), instruction: 'content' },
  fs_edit_file: define('Edit file', 'declared', 'path'),
  shell_bash: define('Run command', 'declared', 'command'),
  // The script's name (its label, first comment or first statement) is the declared subject.
  run_code: define('Run script'),
  ssh_execute: define('Run on', 'declared', 'ssh_profile'),
  view_image: define('View', 'declared', 'path'),
  view_pdf: define('View', 'declared', 'path'),
  prepare_document: define('Render', 'declared', 'path'),
  prepare_execution_runtime: define('Inspect execution environment'),
  prepare_document_runtime: define('Prepare document tools'),
  workspace_resource_list: define('List uploads'),
  workspace_resource_inspect: define('Inspect', 'declared', 'resource_id'),
  workspace_resource_wait: define('Wait for conversion'),
  workspace_resource_read: define('Read', 'declared', 'resource_id'),
  workspace_resource_search: search('Search', 'resource_id'),
  workspace_resource_structure: define('Inspect', 'declared', 'resource_id'),
  connected_data_status: define('Check connections'),
  connected_data_connect: define('Connect', 'declared', 'label'),
  connected_data_index: define('Refresh index of', 'declared', 'source_id'),
  connected_data_download: define('Download from', 'declared', 'source_id'),
  connected_data_open: define('Open', 'declared', 'path'),
  connected_data_write: { ...define('Save', 'declared', 'path'), instruction: 'content' },
  connected_data_ndp_organizations: search('Find publishers'),
  connected_data_search_ndp: search('Search datasets'),
  connected_data_ndp_endpoint_connect: define('Connect', 'declared', 'name'),
  connected_data_ndp_endpoint_operations: search('Find actions'),
  connected_data_ndp_endpoint_request: define('Request', 'declared', 'operation_id'),
  connected_data_ndp_upload_artifact: define('Upload', 'declared', 'artifact_id'),
  create_memory: define('Remember', 'memory', 'subject'),
  update_memory: define('Correct', 'memory'),
  forget_memory: define('Forget', 'memory', 'name'),
  memory_search: search('Search memories'),
  memory_read: define('Read', 'memory', 'name'),
  propose_memory_change: define('Propose memory change', 'memory', 'target'),
  clio_search: search(`Search ${vocab.agent}`),
  clio_search_read: define('Read', 'declared', 'path'),
  session_search: search('Search conversations'),
  session_read_summary: define('Read conversation summary'),
  session_read_context_frame: define('Read retained context'),
  recall_context: search('Recall'),
  create_a2ui_surface: define('Create widget', 'declared', 'surface_id'),
  update_a2ui_components: define('Update layout of', 'declared', 'surface_id'),
  update_a2ui_data_model: define('Update', 'declared', 'surface_id'),
  inspect_a2ui_surface: define('Inspect', 'declared', 'surface_id'),
  capture_a2ui_surface: define('Inspect rendered widget', 'declared', 'surface_id'),
  delete_a2ui_surface: define('Remove widget', 'ack', 'surface_id'),
  publish_dashboard_report: define('Save dashboard', 'declared', 'report_id'),
  create_artifact: define('Keep', 'declared', 'name'),
  raise_alert_card: { ...define('Notify parent about', 'declared', 'title'), instruction: 'body' },
  list_models: define('Find models', 'value'),
  refresh_provider_models: define('Refresh model catalogs'),
  usage: define('Read usage', 'value', 'account'),
  get_weather_forecast: define('Weather for', 'declared', 'location'),
  plan_exit: define('Review plan'),
  write_todos: define('Update checklist'),
  load_skill: { ...define('Load skill'), presentedAction: true },
  web_search: search('Search web'),
  web_fetch: define('Read', 'declared', 'target', 'url'),
};
