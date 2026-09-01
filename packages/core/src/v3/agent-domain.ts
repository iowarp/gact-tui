/** Complete server-owned definition for a routable agent. */
export interface AgentDefinition {
  id: string;
  title: string;
  description: string;
  source: string;
  enabled: boolean;
  validation_errors: string[];
  parent_id: string;
  system_prompt: string;
  prompt_id: string;
  prompt_profile: string;
  default_provider: string;
  default_model: string;
  api_base: string;
  credential_ref: string;
  transport: string;
  parameters: Record<string, unknown>;
  module: Record<string, unknown>;
  signature: Record<string, unknown>;
  structured_outputs: Record<string, unknown>;
  fanout: Record<string, unknown>;
  tools: string[];
  skills: string[];
  commands: string[];
  capability_refs: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  tier: number;
  specialization: string;
  keywords: string[];
}
