import type {
  AddBlueprintSourceInput,
  AgentBlueprintsOptions,
  AgentBlueprintsResult,
  AgentBlueprintValidationResult,
  BlueprintSourceResult,
  BlueprintSourcesResult,
  InstallAgentBlueprintInput,
  InstallAgentBlueprintResult,
  SessionBlueprintResult,
  SetSessionBlueprintInput,
  UninstallAgentBlueprintOptions,
  ValidateAgentBlueprintInput,
} from './agent_blueprints.js';
import {
  enableAgentBlueprintMcp,
  fetchAgentBlueprints,
  fetchBlueprintSources,
  fetchSessionBlueprint,
  installAgentBlueprintDefinition,
  refreshAgentBlueprintSource,
  registerBlueprintSource,
  removeAgentBlueprint,
  removeBlueprintSource,
  setSessionBlueprintBinding,
  validateAgentBlueprintDefinition,
} from './agent_blueprints.js';
import { AgentCatalogClient } from './agent_catalog_client.js';

export class AgentBlueprintClient extends AgentCatalogClient {
  /** POST /v1/agent-blueprints/validate - validate a blueprint on the clio host. */
  async validateAgentBlueprint(
    body: ValidateAgentBlueprintInput,
  ): Promise<AgentBlueprintValidationResult> {
    return validateAgentBlueprintDefinition(this, body);
  }

  /** POST /v1/agent-blueprints/install - install from a path or git source. */
  installAgentBlueprint(body: InstallAgentBlueprintInput): Promise<InstallAgentBlueprintResult> {
    return installAgentBlueprintDefinition(this, body);
  }

  /** DELETE /v1/agent-blueprints/{bp} - uninstall a blueprint. */
  uninstallAgentBlueprint(
    blueprintId: string,
    opts?: UninstallAgentBlueprintOptions,
  ): Promise<void> {
    return removeAgentBlueprint(this, blueprintId, opts);
  }

  /** POST /v1/agent-blueprints/{bp}/mcp/{descriptor_id}/enable. */
  enableBlueprintMcp(blueprintId: string, descriptorId: string): Promise<unknown> {
    return enableAgentBlueprintMcp(this, blueprintId, descriptorId);
  }

  /** GET /v1/agent-blueprints - list registered agent blueprints. */
  async agentBlueprints(options: AgentBlueprintsOptions = {}): Promise<AgentBlueprintsResult> {
    return fetchAgentBlueprints(this, options);
  }

  /** GET /v1/agent-blueprints/sources - list registered blueprint sources. */
  async blueprintSources(): Promise<BlueprintSourcesResult> {
    return fetchBlueprintSources(this);
  }

  /** POST /v1/agent-blueprints/sources - register a source. */
  async addBlueprintSource(body: AddBlueprintSourceInput): Promise<BlueprintSourceResult> {
    return registerBlueprintSource(this, body);
  }

  /** POST /v1/agent-blueprints/sources/{id}/refresh - re-scan one source. */
  async refreshBlueprintSource(sourceId: string): Promise<BlueprintSourceResult> {
    return refreshAgentBlueprintSource(this, sourceId);
  }

  /** DELETE /v1/agent-blueprints/sources/{id} - unregister a source. */
  deleteBlueprintSource(sourceId: string): Promise<void> {
    return removeBlueprintSource(this, sourceId);
  }

  /** GET /v1/sessions/{id}/agent-blueprint - currently-bound blueprint. */
  getSessionBlueprint(sessionId: string): Promise<SessionBlueprintResult> {
    return fetchSessionBlueprint(this, sessionId);
  }

  /** POST /v1/sessions/{id}/agent-blueprint - bind a blueprint to the session. */
  setSessionBlueprint(sessionId: string, body: SetSessionBlueprintInput): Promise<unknown> {
    return setSessionBlueprintBinding(this, sessionId, body);
  }
}
