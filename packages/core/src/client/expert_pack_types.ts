import type { AgentBlueprintsOptions } from './agent_blueprint_types.js';
import type { ExpertPackSummary, ValidationResult } from './catalog_types.js';

export interface ValidateExpertPackInput {
  path: string;
  scope?: string;
}

export type ExpertPacksOptions = AgentBlueprintsOptions;

export interface ExpertPacksResult {
  packs: ExpertPackSummary[];
}

export interface InstallExpertPackInput {
  source?: string;
  url?: string;
  path?: string;
  scope?: 'workspace' | 'global' | 'session' | string;
  workspace_id?: string;
  ref?: string;
  pinned_commit?: string;
}

export type InstallExpertPackResult = Record<string, unknown>;

export interface ExpertPackMutationOptions {
  scope?: string;
  workspace_id?: string;
}

export type UpdateExpertPackResult = Record<string, unknown>;

export interface SessionExpertPackResult {
  pack_id?: string | null;
  active_expert_pack_id?: string;
  active_expert_pack_path?: string;
  workspace_id?: string;
  [k: string]: unknown;
}

export interface SetSessionExpertPackInput {
  pack_id: string | null;
}

export type ExpertPackValidationResult = ValidationResult;
