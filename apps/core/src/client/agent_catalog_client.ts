import type { AgentDef } from '../wire/types.js';
import type {
  AgentDetail,
  AgentsResult,
  CreateAgentInput,
  ExtractAgentInput,
  ExtractAgentResult,
  PutAgentInput,
} from './agent_types.js';
import {
  extractAgentDefinition,
  fetchAgent,
  fetchAgents,
  registerAgent,
  removeAgent,
  replaceAgent,
} from './agents.js';
import { McpClient } from './mcp_client.js';

export class AgentCatalogClient extends McpClient {
  /** POST /v1/agents/extract - distill a new agent definition from a
   * session's behavior. Gated by `capabilities.skills_extraction`. */
  extractAgent(body: ExtractAgentInput): Promise<ExtractAgentResult> {
    return extractAgentDefinition(this, body);
  }

  /** DELETE /v1/agents/{id} - remove a registered agent. */
  deleteAgent(agentId: string): Promise<void> {
    return removeAgent(this, agentId);
  }

  /** GET /v1/agents/{id} - single-agent detail. */
  getAgent(agentId: string): Promise<AgentDetail> {
    return fetchAgent(this, agentId);
  }

  /** PUT /v1/agents/{id} - replace an existing agent definition. */
  putAgent(agentId: string, def: PutAgentInput): Promise<AgentDef> {
    return replaceAgent(this, agentId, def);
  }

  /** POST /v1/agents - register a new agent definition. */
  createAgent(def: CreateAgentInput): Promise<AgentDef> {
    return registerAgent(this, def);
  }

  agents(): Promise<AgentsResult> {
    return fetchAgents(this);
  }
}
