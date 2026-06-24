/**
 * Loads and shapes a session's binding/provenance data for the inspector.
 * Exports {@link loadSessionBindings} and {@link packagedProvenance}.
 */
import type { Client } from '@clio/core';
import type { SessionBindings } from '../components/InspectorBindings.js';

type BindingClient = Pick<
  Client,
  'getSessionBlueprint' | 'getSessionExpertPack' | 'agentBlueprints' | 'expertPacks'
>;

type BlueprintBindingResult = Awaited<ReturnType<BindingClient['getSessionBlueprint']>>;

export async function loadSessionBindings(
  client: BindingClient,
  sessionId: string,
): Promise<SessionBindings | null> {
  try {
    const [bp, pack, bpList, packList] = await Promise.allSettled([
      client.getSessionBlueprint(sessionId),
      client.getSessionExpertPack(sessionId),
      client.agentBlueprints(),
      client.expertPacks(),
    ]);
    const blueprint_id =
      bp.status === 'fulfilled'
        ? (bp.value.blueprint_id ?? (bp.value.active_agent_blueprint_id || null))
        : null;
    const pack_id =
      pack.status === 'fulfilled'
        ? (pack.value.pack_id ?? (pack.value.active_expert_pack_id || null))
        : null;
    const provenance =
      bp.status === 'fulfilled'
        ? {
            ...(bp.value.workspace_id ? { workspace_id: bp.value.workspace_id } : {}),
            ...(bp.value.active_agent_blueprint_path
              ? { blueprint_path: bp.value.active_agent_blueprint_path }
              : {}),
            ...(bp.value.agent_overlay && Object.keys(bp.value.agent_overlay).length > 0
              ? { overlay: bp.value.agent_overlay }
              : {}),
            ...(bp.value.activation && Object.keys(bp.value.activation).length > 0
              ? { activation: bp.value.activation }
              : {}),
            ...packagedProvenance(bp.value),
          }
        : {};
    const availableBlueprints =
      bpList.status === 'fulfilled'
        ? bpList.value.blueprints.map((blueprint) => ({
            id: blueprint.id,
            label: blueprint.name ?? blueprint.id,
            ...(blueprint.description ? { description: blueprint.description } : {}),
          }))
        : [];
    const availablePacks =
      packList.status === 'fulfilled'
        ? packList.value.packs.map((packOption) => ({
            id: packOption.id,
            label: packOption.name ?? packOption.id,
            ...(packOption.description ? { description: packOption.description } : {}),
          }))
        : [];
    return {
      blueprint_id,
      pack_id,
      availableBlueprints,
      availablePacks,
      ...provenance,
    };
  } catch {
    return null;
  }
}

export function packagedProvenance(value: BlueprintBindingResult): {
  packaged?: SessionBindings['packaged'];
} {
  const blueprint = value.agent_blueprint as Record<string, unknown> | undefined;
  if (!blueprint || typeof blueprint !== 'object') return {};
  const meta = (blueprint['metadata'] as Record<string, unknown> | undefined) ?? {};
  const install = meta['install'] as Record<string, unknown> | undefined;
  const bootstrap = meta['bootstrap'] as Record<string, unknown> | undefined;
  const errs = blueprint['validation_errors'];
  return {
    packaged: {
      ...(typeof blueprint['id'] === 'string' ? { id: blueprint['id'] as string } : {}),
      ...(typeof blueprint['title'] === 'string' ? { title: blueprint['title'] as string } : {}),
      ...(typeof blueprint['version'] === 'string' && blueprint['version']
        ? { version: blueprint['version'] as string }
        : {}),
      ...(typeof blueprint['scope'] === 'string' && blueprint['scope']
        ? { scope: blueprint['scope'] as string }
        : {}),
      ...(typeof blueprint['enabled'] === 'boolean'
        ? { enabled: blueprint['enabled'] as boolean }
        : {}),
      ...(Array.isArray(errs) && errs.length > 0 ? { validation_errors: errs as string[] } : {}),
      ...(install && Object.keys(install).length > 0 ? { install } : {}),
      ...(bootstrap && Object.keys(bootstrap).length > 0 ? { bootstrap } : {}),
    },
  };
}
