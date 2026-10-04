import type { WireValue } from './domain.js';

/** Canonical identity retained by a session even when its blueprint is not catalog-installed. */
export interface AgentBlueprintReference {
  id: string;
  display_name: string;
  version?: string;
  scope?: string;
  enabled?: boolean;
  materialized?: boolean;
  registry_id?: string;
  blueprint_id?: string;
}

/** Typed outcome of comparing an installed marketplace source against its remote ref. */
export type AgentBlueprintSourceUpdateReason = WireValue<
  | 'up_to_date'
  | 'update_available'
  | 'source_not_found'
  | 'installed_commit_unknown'
  | 'git_unavailable'
  | 'ls_remote_failed'
  | 'ref_not_found'
  | 'timeout'
  | 'path_source_not_git'
>;

/** One row of `GET /v1/agent-blueprints/sources/updates` (or the single-source variant). */
export interface AgentBlueprintSourceUpdate {
  source_id: string;
  source: string;
  ref?: string;
  installed_commit?: string;
  remote_commit?: string;
  update_available: boolean | null;
  reason: AgentBlueprintSourceUpdateReason;
  detail?: string;
}

export interface AgentBlueprintSourceUpdates {
  sources: AgentBlueprintSourceUpdate[];
  checked_at?: string;
}

export interface AgentBlueprintSource {
  id: string;
  name: string;
  source: string;
  ref?: string;
  commit?: string;
  pinned_commit?: string;
  working_checkout?: string;
  is_default?: boolean;
  reload_required?: boolean;
  source_kind?: string;
  status: string;
  error?: string;
  added_at?: string;
  updated_at?: string;
  install_scope?: string;
  workspace_id?: string;
  installed_blueprints?: Array<{ id: string; identity?: string; version?: string; scope?: string }>;
  skipped_blueprints?: Array<{ id: string; reason: string }>;
  available_blueprints: Array<{
    id: string;
    title: string;
    version?: string;
    kind: WireValue<'blueprint' | 'pack'>;
    enabled: boolean;
    validation_errors: string[];
  }>;
}
