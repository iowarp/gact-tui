import { z } from 'zod';
import type { CommandDefinition, PromptDefinition, ResolvedPromptDefinition } from './domain.js';
import { McpRepository } from './mcp-repository.js';
import { commandListSchema, promptListSchema } from './repository-decoders.js';
import { promptDefinitionSchema, resolvedPromptDefinitionSchema } from './schemas.js';

interface PromptContext {
  sessionId?: string;
  workspaceId?: string;
}

export interface SavePromptInput extends PromptContext {
  scope: 'global' | 'workspace' | 'session';
  profile: string;
  text: string;
  title?: string;
  description?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

function contextQuery(context: PromptContext = {}): string {
  const query = new URLSearchParams();
  if (context.sessionId) query.set('session_id', context.sessionId);
  if (context.workspaceId) query.set('workspace_id', context.workspaceId);
  return query.size ? `?${query.toString()}` : '';
}

/** Prompt-family inspection, rendering, validation, and scoped override routes. */
export class PromptRepository extends McpRepository {
  public async prompts(
    signal?: AbortSignal,
    context: PromptContext = {},
  ): Promise<PromptDefinition[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/prompts${contextQuery(context)}`,
      decode: (value) => promptListSchema.parse(value),
      signal,
    });
    return result.prompts as PromptDefinition[];
  }

  public prompt(
    promptId: string,
    input: PromptContext & { profile?: string } = {},
    signal?: AbortSignal,
  ): Promise<ResolvedPromptDefinition> {
    const query = new URLSearchParams();
    if (input.profile) query.set('profile', input.profile);
    if (input.sessionId) query.set('session_id', input.sessionId);
    if (input.workspaceId) query.set('workspace_id', input.workspaceId);
    return this.transport.request({
      method: 'GET',
      path: `/v1/prompts/${encodeURIComponent(promptId)}${query.size ? `?${query.toString()}` : ''}`,
      decode: (value) =>
        z.object({ prompt: resolvedPromptDefinitionSchema }).parse(value)
          .prompt as ResolvedPromptDefinition,
      signal,
    });
  }

  public renderPrompt(
    promptId: string,
    input: PromptContext & { profile?: string; context?: Record<string, unknown> } = {},
    signal?: AbortSignal,
  ): Promise<ResolvedPromptDefinition> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/prompts/${encodeURIComponent(promptId)}/render`,
      body: {
        profile: input.profile,
        session_id: input.sessionId,
        workspace_id: input.workspaceId,
        context: input.context,
      },
      decode: (value) =>
        z.object({ prompt: resolvedPromptDefinitionSchema }).parse(value)
          .prompt as ResolvedPromptDefinition,
      signal,
    });
  }

  public validatePrompt(
    promptId: string,
    input: PromptContext & { profile?: string; text?: string } = {},
    signal?: AbortSignal,
  ): Promise<{ enabled: boolean; validation_errors: string[]; prompt: PromptDefinition }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/prompts/${encodeURIComponent(promptId)}/validate`,
      body: {
        profile: input.profile,
        text: input.text,
        session_id: input.sessionId,
        workspace_id: input.workspaceId,
      },
      decode: (value) =>
        z
          .object({
            enabled: z.boolean(),
            validation_errors: z.array(z.string()).default([]),
            prompt: promptDefinitionSchema,
          })
          .parse(value) as {
          enabled: boolean;
          validation_errors: string[];
          prompt: PromptDefinition;
        },
      signal,
    });
  }

  public savePrompt(
    promptId: string,
    input: SavePromptInput,
    signal?: AbortSignal,
  ): Promise<PromptDefinition> {
    return this.transport.request({
      method: 'PUT',
      path: `/v1/prompts/${encodeURIComponent(promptId)}`,
      body: {
        scope: input.scope,
        profile: input.profile,
        text: input.text,
        title: input.title,
        description: input.description,
        provider: input.provider,
        model: input.model,
        metadata: input.metadata,
        session_id: input.sessionId,
        workspace_id: input.workspaceId,
      },
      decode: (value) =>
        z.object({ prompt: promptDefinitionSchema }).parse(value).prompt as PromptDefinition,
      signal,
    });
  }

  public reloadPrompts(
    context: PromptContext = {},
    signal?: AbortSignal,
  ): Promise<{ prompt_ids: string[]; prompt_count: number }> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/prompts/reload',
      body: { session_id: context.sessionId, workspace_id: context.workspaceId },
      decode: (value) =>
        z
          .object({
            reload: z.object({
              prompt_ids: z.array(z.string()).default([]),
              prompt_count: z.number().int().nonnegative(),
            }),
          })
          .parse(value).reload,
      signal,
    });
  }

  public async commands(
    signal?: AbortSignal,
    context: PromptContext = {},
  ): Promise<CommandDefinition[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/commands${contextQuery(context)}`,
      decode: (value) => commandListSchema.parse(value),
      signal,
    });
    return result.commands as CommandDefinition[];
  }

  public dispatchCommand(
    sessionId: string,
    commandId: string,
    input = '',
    signal?: AbortSignal,
  ): Promise<{ command: string; session_id: string; result?: unknown }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/commands/${encodeURIComponent(commandId.replace(/^\//, ''))}`,
      body: { input, caller: { type: 'user' } },
      decode: (value) =>
        z
          .object({
            command: z.string(),
            session_id: z.string(),
            result: z.unknown(),
          })
          .parse(value),
      signal,
    });
  }
}
