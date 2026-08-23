import type {
  AgentBlueprintSummary,
  ExpertPackSummary,
  ValidationResult,
} from './catalog_types.js';

export * from './catalog_types.js';

export function normalizeValidationResult(raw: Record<string, unknown>): ValidationResult {
  return {
    ok: raw['enabled'] === true,
    errors: (raw['validation_errors'] as string[] | undefined) ?? [],
    raw,
  };
}

export function normalizeAgentBlueprints(raw: Record<string, unknown>): AgentBlueprintSummary[] {
  const list =
    (raw['blueprints'] as unknown[]) ??
    (raw['agent_blueprints'] as unknown[]) ??
    [];
  return list.map((b) => {
    const o = b as Record<string, unknown>;
    return {
      id: String(o['id'] ?? ''),
      ...(o['name'] || o['title']
        ? { name: String(o['name'] ?? o['title']) }
        : {}),
      ...(o['description'] ? { description: String(o['description']) } : {}),
      ...(o['kind'] ? { kind: String(o['kind']) } : {}),
      ...(o['scope'] ? { scope: String(o['scope']) } : {}),
      ...(o['version'] ? { version: String(o['version']) } : {}),
      ...(o['metadata'] ? { metadata: o['metadata'] as Record<string, unknown> } : {}),
    };
  });
}

export function normalizeExpertPacks(raw: Record<string, unknown>): ExpertPackSummary[] {
  const list =
    (raw['packs'] as unknown[]) ??
    (raw['expert_packs'] as unknown[]) ??
    [];
  return list.map((p) => {
    const o = p as Record<string, unknown>;
    return {
      id: String(o['id'] ?? ''),
      ...(o['name'] || o['title']
        ? { name: String(o['name'] ?? o['title']) }
        : {}),
      ...(o['description'] ? { description: String(o['description']) } : {}),
      ...(o['kind'] ? { kind: String(o['kind']) } : {}),
      ...(o['scope'] ? { scope: String(o['scope']) } : {}),
      ...(o['runtime_scope'] ? { runtime_scope: String(o['runtime_scope']) } : {}),
      ...(o['metadata'] ? { metadata: o['metadata'] as Record<string, unknown> } : {}),
    };
  });
}

export function mergeBlueprintBackedPacks(
  packs: ExpertPackSummary[],
  blueprints: AgentBlueprintSummary[],
): ExpertPackSummary[] {
  const merged = packs.slice();
  const seen = new Set(merged.map((p) => p.id));
  for (const bp of blueprints) {
    if (bp.kind !== 'pack' || seen.has(bp.id)) continue;
    merged.push({
      id: bp.id,
      ...(bp.name ? { name: bp.name } : {}),
      ...(bp.description ? { description: bp.description } : {}),
      kind: 'pack',
      ...(bp.scope ? { scope: bp.scope } : {}),
      ...(bp.metadata ? { metadata: bp.metadata } : {}),
    });
    seen.add(bp.id);
  }
  return merged;
}
