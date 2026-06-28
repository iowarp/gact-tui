import type { AgentDef } from '../wire/types.js';

export interface ExtractAgentInput {
  session_id: string;
  name?: string;
  description?: string;
}

export type ExtractAgentResult = Record<string, unknown>;

export type AgentDetail = AgentDef & {
  [k: string]: unknown;
};

export type PutAgentInput = Omit<AgentDef, 'id'> & { id?: string };

export type CreateAgentInput = Omit<AgentDef, 'id'>;

export interface AgentsResult {
  agents: AgentDef[];
}
