export interface PromptDefinition {
  id: string;
  title: string;
  description?: string;
  default_profile?: string;
  profiles: Record<string, PromptProfileDefinition>;
  scope: string;
  source_path?: string;
  enabled: boolean;
  validation_errors: string[];
  metadata: Record<string, unknown>;
}

export interface PromptProfileDefinition {
  name: string;
  text: string;
  scope: string;
  source_path?: string;
  provider?: string;
  model?: string;
  checksum?: string;
  metadata: Record<string, unknown>;
}

export interface ResolvedPromptDefinition {
  id: string;
  profile: string;
  text: string;
  title: string;
  description?: string;
  scope: string;
  source_path?: string;
  provider?: string;
  model?: string;
  checksum?: string;
  fallback_profile?: string;
  validation_errors: string[];
  metadata: Record<string, unknown>;
}

export interface CommandDefinition {
  id: string;
  title: string;
  description?: string;
  source: string;
  status: string;
  enabled: boolean;
  disabled_reason?: string;
  aliases: string[];
  agent_id?: string;
  user_invocable?: boolean;
  agent_invocable?: boolean;
  argument_hint?: string;
  arguments: unknown[];
  metadata: Record<string, unknown>;
}
