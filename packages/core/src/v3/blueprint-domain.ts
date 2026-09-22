import type { WireValue } from './domain.js';

/** Canonical identity retained by a session even when its blueprint is not catalog-installed. */
export interface AgentBlueprintReference {
  id: string;
  display_name: string;
  version?: string;
  scope?: string;
  enabled?: boolean;
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
