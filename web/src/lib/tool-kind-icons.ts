import {
  BotIcon,
  BrainIcon,
  ClipboardListIcon,
  ArrowDownToLineIcon,
  DatabaseIcon,
  FileCodeIcon,
  FileIcon,
  FilePenLineIcon,
  FolderIcon,
  GlobeIcon,
  HourglassIcon,
  ImageIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  MessageSquareIcon,
  NotebookPenIcon,
  PlugIcon,
  SearchIcon,
  ShapesIcon,
  SparklesIcon,
  SquareTerminalIcon,
  WorkflowIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import { EditIcon, GoalIcon, ScheduleIcon } from './icon-vocabulary';

/**
 * What a tool does at a glance, one icon per kind: run, read, edit, search,
 * fetch, delegate. The transcript's activity rows and the tool catalog share
 * this table so a tool looks the same wherever it is listed.
 */
export const TOOL_KIND_ICONS: ReadonlyArray<readonly [RegExp, LucideIcon]> = [
  [
    /^(spawn_agent|spawn_agents|subagent|send_agent_message|pause_agent|resume_agent|restart_agent)/u,
    BotIcon,
  ],
  [/^run_code$/u, FileCodeIcon],
  [/^(shell_|run_command|ssh_execute)/u, SquareTerminalIcon],
  [/^(run_flow|run_workflow)/u, WorkflowIcon],
  [/^(fs_edit|edit_)/u, EditIcon],
  [/^(fs_write|write_file|connected_data_write)/u, FilePenLineIcon],
  [/^(fs_read|read_|clio_search_read|workspace_resource_read)/u, FileIcon],
  [/^(fs_list|workspace_resource_list)/u, FolderIcon],
  [/^(view_image|view_pdf|capture_a2ui)/u, ImageIcon],
  [/(_search|^search_|^query_|^recall_context|_organizations$|_operations$)/u, SearchIcon],
  [/^(connected_data_download|connected_data_ndp_upload|web_fetch)/u, ArrowDownToLineIcon],
  [/^web_/u, GlobeIcon],
  [/^connected_data_/u, DatabaseIcon],
  [/(memory|^session_read)/u, BrainIcon],
  [/(a2ui|dashboard)/u, LayoutDashboardIcon],
  [/artifact/u, ShapesIcon],
  [/^(wait_|wait_for|loop_wakeup|workspace_resource_wait)/u, HourglassIcon],
  [/^(cron_|set_loop)/u, ScheduleIcon],
  [/goal/u, GoalIcon],
  [/(plan|todo)/u, ListTodoIcon],
  [/(task)/u, ClipboardListIcon],
  [/^ask_user/u, MessageSquareIcon],
  [/skill/u, SparklesIcon],
  [/^(log_entry|query_log|export_measurements)$/u, NotebookPenIcon],
];

/** The kind icon for a tool name; a connected server's tool is a plug, anything else a wrench. */
export function toolKindIcon(name: string, options?: { connected?: boolean }): LucideIcon {
  if (options?.connected) return PlugIcon;
  return TOOL_KIND_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? WrenchIcon;
}
