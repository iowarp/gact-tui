import { normalizeAgentBlueprints, normalizeValidationResult } from './catalog.js';
import type { HttpTransport } from './transport.js';
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
} from './agent_blueprint_types.js';

export * from './agent_blueprint_types.js';

type AgentBlueprintTransport = Pick<HttpTransport, 'get' | 'post' | 'del'>;

export async function validateAgentBlueprintDefinition(
  client: AgentBlueprintTransport,
  body: ValidateAgentBlueprintInput,
): Promise<AgentBlueprintValidationResult> {
  const raw = await client.post<Record<string, unknown>>('/v1/agent-blueprints/validate', body);
  return normalizeValidationResult(raw);
}

export function installAgentBlueprintDefinition(
  client: AgentBlueprintTransport,
  body: InstallAgentBlueprintInput,
): Promise<InstallAgentBlueprintResult> {
  return client.post('/v1/agent-blueprints/install', body);
}

export function removeAgentBlueprint(
  client: AgentBlueprintTransport,
  blueprintId: string,
  opts?: UninstallAgentBlueprintOptions,
): Promise<void> {
  const params = new URLSearchParams();
  if (opts?.scope) params.set('scope', opts.scope);
  if (opts?.workspace_id) params.set('workspace_id', opts.workspace_id);
  const qs = params.toString();
  return client.del(`/v1/agent-blueprints/${encodeURIComponent(blueprintId)}${qs ? `?${qs}` : ''}`);
}

export function enableAgentBlueprintMcp(
  client: AgentBlueprintTransport,
  blueprintId: string,
  descriptorId: string,
): Promise<unknown> {
  return client.post(
    `/v1/agent-blueprints/${encodeURIComponent(blueprintId)}/mcp/${encodeURIComponent(descriptorId)}/enable`,
    {},
  );
}

export async function fetchAgentBlueprints(
  client: AgentBlueprintTransport,
  options: AgentBlueprintsOptions = {},
): Promise<AgentBlueprintsResult> {
  const qs = new URLSearchParams();
  if (options.workspace_id) qs.set('workspace_id', options.workspace_id);
  if (options.session_id) qs.set('session_id', options.session_id);
  const raw = await client.get<Record<string, unknown>>(
    `/v1/agent-blueprints${qs.size ? `?${qs}` : ''}`,
  );
  return { blueprints: normalizeAgentBlueprints(raw) };
}

export function fetchBlueprintSources(
  client: AgentBlueprintTransport,
): Promise<BlueprintSourcesResult> {
  return client.get<BlueprintSourcesResult>('/v1/agent-blueprints/sources');
}

export function registerBlueprintSource(
  client: AgentBlueprintTransport,
  body: AddBlueprintSourceInput,
): Promise<BlueprintSourceResult> {
  return client.post<BlueprintSourceResult>('/v1/agent-blueprints/sources', body);
}

export function refreshAgentBlueprintSource(
  client: AgentBlueprintTransport,
  sourceId: string,
): Promise<BlueprintSourceResult> {
  return client.post<BlueprintSourceResult>(
    `/v1/agent-blueprints/sources/${encodeURIComponent(sourceId)}/refresh`,
    {},
  );
}

export function removeBlueprintSource(
  client: AgentBlueprintTransport,
  sourceId: string,
): Promise<void> {
  return client.del(`/v1/agent-blueprints/sources/${encodeURIComponent(sourceId)}`);
}

export function fetchSessionBlueprint(
  client: AgentBlueprintTransport,
  sessionId: string,
): Promise<SessionBlueprintResult> {
  return client.get(`/v1/sessions/${encodeURIComponent(sessionId)}/agent-blueprint`);
}

export function setSessionBlueprintBinding(
  client: AgentBlueprintTransport,
  sessionId: string,
  body: SetSessionBlueprintInput,
): Promise<unknown> {
  return client.post(`/v1/sessions/${encodeURIComponent(sessionId)}/agent-blueprint`, body);
}
