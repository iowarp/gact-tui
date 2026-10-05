import type { AgentBlueprint, AgentBlueprintReference, Session } from '@clio/core/v3';

/** Preserve an authoritative session activation when it is absent from the installed catalog. */
export function resolveActiveBlueprint(
  session: Session | undefined,
  blueprints: readonly AgentBlueprint[] | undefined,
): AgentBlueprintReference | undefined {
  const matching = blueprints?.filter((blueprint) =>
    [blueprint.id, blueprint.blueprint_id].includes(session?.active_blueprint_id),
  );
  const installed = matching?.length === 1 ? matching[0] : undefined;
  if (installed) return installed;
  if (!session?.active_blueprint_id || !session.active_blueprint_name) return undefined;
  return {
    id: session.active_blueprint_id,
    display_name: session.active_blueprint_name,
    version: session.active_blueprint_version,
    scope: session.active_blueprint_scope,
  };
}
