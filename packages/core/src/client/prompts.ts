import type { PromptDef, PromptSource } from '../wire/types.js';
import type { HttpTransport } from './transport.js';

type PromptTransport = Pick<HttpTransport, 'get' | 'post' | 'put'>;

export interface PromptScope {
  session_id?: string;
  workspace_id?: string;
}

export interface PromptsResult {
  prompts: PromptDef[];
  sources: PromptSource[];
}

export interface GetPromptOptions extends PromptScope {
  profile?: string;
}

export interface GetPromptResult {
  prompt: {
    id: string;
    profile: string;
    text: string;
    title?: string;
    description?: string;
    scope?: string;
    source_path?: string;
    provider?: string;
    model?: string;
    checksum?: string;
  };
}

export interface SavePromptInput extends PromptScope {
  text: string;
  scope?: 'global' | 'workspace' | 'session' | string;
}

export interface SavePromptResult {
  prompt: PromptDef;
}

export interface RenderPromptInput extends PromptScope {
  profile?: string;
  context?: Record<string, string>;
}

export interface RenderPromptResult {
  prompt: Record<string, unknown>;
}

export interface ValidatePromptInput extends PromptScope {
  text?: string;
  profile?: string;
}

export interface ValidatePromptResult {
  enabled: boolean;
  validation_errors: string[];
  prompt: Record<string, unknown>;
}

export function fetchPrompts(
  client: PromptTransport,
  scope: PromptScope = {},
): Promise<PromptsResult> {
  const qs = new URLSearchParams();
  if (scope.session_id) qs.set('session_id', scope.session_id);
  if (scope.workspace_id) qs.set('workspace_id', scope.workspace_id);
  const suffix = qs.toString() ? `?${qs}` : '';
  return client.get<PromptsResult>(`/v1/prompts${suffix}`);
}

export function fetchPrompt(
  client: PromptTransport,
  promptId: string,
  options: GetPromptOptions = {},
): Promise<GetPromptResult> {
  const qs = new URLSearchParams();
  if (options.profile) qs.set('profile', options.profile);
  if (options.session_id) qs.set('session_id', options.session_id);
  if (options.workspace_id) qs.set('workspace_id', options.workspace_id);
  const suffix = qs.toString() ? `?${qs}` : '';
  return client.get(`/v1/prompts/${encodeURIComponent(promptId)}${suffix}`);
}

export function reloadPromptSources(client: PromptTransport): Promise<unknown> {
  return client.post<unknown>('/v1/prompts/reload', {});
}

export function updatePrompt(
  client: PromptTransport,
  promptId: string,
  body: SavePromptInput,
): Promise<SavePromptResult> {
  return client.put<SavePromptResult>(
    `/v1/prompts/${encodeURIComponent(promptId)}`,
    body,
  );
}

export function renderPromptTemplate(
  client: PromptTransport,
  promptId: string,
  body: RenderPromptInput = {},
): Promise<RenderPromptResult> {
  return client.post(
    `/v1/prompts/${encodeURIComponent(promptId)}/render`,
    body,
  );
}

export function validatePromptTemplate(
  client: PromptTransport,
  promptId: string,
  body: ValidatePromptInput = {},
): Promise<ValidatePromptResult> {
  return client.post(
    `/v1/prompts/${encodeURIComponent(promptId)}/validate`,
    body,
  );
}
