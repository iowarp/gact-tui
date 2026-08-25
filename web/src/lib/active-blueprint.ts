import type { AgentBlueprint, AgentBlueprintReference, Session } from '@clio/core/v3';

/** Preserve an authoritative session activation when it is absent from the installed catalog. */
export function resolveActiveBlueprint(
  session: Session | undefined,
  blueprints: readonly AgentBlueprint[] | undefined,
): AgentBlueprintReference | undefined {
  const installed = blueprints?.find((blueprint) => blueprint.id === session?.active_blueprint_id);
  if (installed) return installed;
  if (!session?.active_blueprint_id || !session.active_blueprint_name) return undefined;
  return {
    id: session.active_blueprint_id,
    display_name: session.active_blueprint_name,
    version: session.active_blueprint_version,
    scope: session.active_blueprint_scope,
  };
}
