import type { BlueprintSource } from '../wire/types.js';
import type { AgentBlueprintSummary, ValidationResult } from './catalog_types.js';

export interface ValidateAgentBlueprintInput {
  path: string;
  scope?: string;
  workspace_id?: string;
  session_id?: string;
}

export interface InstallAgentBlueprintInput {
  source?: string;
  path?: string;
  url?: string;
  ref?: string;
  scope?: string;
  workspace_id?: string;
}

export interface InstallAgentBlueprintResult {
  id?: string;
  [k: string]: unknown;
}

export interface UninstallAgentBlueprintOptions {
  scope?: 'global' | 'workspace';
  workspace_id?: string;
}

export interface AgentBlueprintsOptions {
  workspace_id?: string;
  session_id?: string;
}

export interface AgentBlueprintsResult {
  blueprints: AgentBlueprintSummary[];
}

export interface BlueprintSourcesResult {
  sources: BlueprintSource[];
}

export interface AddBlueprintSourceInput {
  source: string;
  ref?: string;
  name?: string;
  pinned_commit?: string;
  refresh?: boolean;
}

export interface BlueprintSourceResult {
  source: BlueprintSource;
}

export interface SessionBlueprintResult {
  blueprint_id?: string | null;
  active_agent_blueprint_id?: string;
  active_agent_blueprint_path?: string;
  workspace_id?: string;
  agent_overlay?: Record<string, unknown>;
  activation?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface SetSessionBlueprintInput {
  blueprint_id: string | null;
}

export type AgentBlueprintValidationResult = ValidationResult;
