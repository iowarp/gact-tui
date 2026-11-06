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

/** What a command row runs: a core handler, a command file, a skill or an MCP prompt. */
export type CommandKind = 'builtin' | 'command' | 'skill' | 'mcp_prompt' | 'unknown';

/**
 * One row of a session's command table. `id` is the name to type: the bare name,
 * or the qualified one when the bare name is ambiguous. `disabled_reason` is a
 * typed code (`command_shadowed`, `command_name_reserved`, ...) and
 * `disabled_detail` its sentence.
 */
export interface CommandDefinition {
  id: string;
  kind: CommandKind;
  name: string;
  qualified_id: string;
  title: string;
  description?: string;
  source: string;
  plugin: string;
  /** The subfolder a command file sits in, or the MCP server of a prompt. */
  label: string;
  status: string;
  enabled: boolean;
  disabled_reason?: string;
  disabled_detail?: string;
  shadowed_by?: string;
  ambiguous?: boolean;
  unsupported_fields: string[];
  aliases: string[];
  /** The subagent a command file summons. */
  agent?: string;
  argument_hint?: string;
  arguments: unknown[];
  metadata: Record<string, unknown>;
}

/** What a person can `@`-summon in a conversation. */
export interface SummonTargets {
  subagents: { id: string; plugin: string; description: string }[];
  servers: {
    name: string;
    plugin: string;
    description: string;
    deferred: boolean;
    tools: number | null;
  }[];
}
