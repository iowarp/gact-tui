/**
 * View-model / pure logic for Blueprint Sources Panel: state shaping and helpers, no DOM. Key export `buildAddBlueprintSourceInput`.
 */
import type { AddBlueprintSourceInput, AgentBlueprintsResult, BlueprintSource } from '@clio/core';

type AgentBlueprintSummary = AgentBlueprintsResult['blueprints'][number];

export interface BlueprintInstallProvenance {
  source: string;
  sourceKind?: string;
  ref?: string;
  commit?: string;
  pinnedCommit?: string;
  scope?: string;
}

export interface BlueprintSourceGroup {
  id: string;
  name: string;
  sourceText: string;
  ref?: string;
  commit?: string;
  status?: string;
  statusMessage?: string;
  source?: BlueprintSource;
  blueprints: AgentBlueprintSummary[];
}

export function buildAddBlueprintSourceInput(
  sourceText: string,
  refText: string,
  nameText: string,
): AddBlueprintSourceInput | null {
  const source = sourceText.trim();
  if (!source) return null;
  const body: AddBlueprintSourceInput = { source };
  const ref = refText.trim();
  const name = nameText.trim();
  if (ref) body.ref = ref;
  if (name) body.name = name;
  return body;
}

export function blueprintSourceName(source: BlueprintSource): string {
  return source.name || source.source;
}

export function blueprintSourceStatus(source: BlueprintSource): string {
  return source.status || 'unknown';
}

export function blueprintSourceDotClass(status?: string): string {
  if (status === 'ok' || status === 'ready' || status === 'installed') {
    return 'bps__dot bps__dot--ok';
  }
  if (status === 'error') return 'bps__dot bps__dot--error';
  return 'bps__dot bps__dot--unknown';
}

export function blueprintInstallProvenance(
  blueprint: AgentBlueprintSummary,
): BlueprintInstallProvenance | null {
  const install = blueprint.metadata?.['install'];
  if (!install || typeof install !== 'object') return null;
  const record = install as Record<string, unknown>;
  const source = stringValue(record['source']);
  if (!source) return null;
  return {
    source,
    ...(stringValue(record['source_kind']) ? { sourceKind: stringValue(record['source_kind']) } : {}),
    ...(stringValue(record['ref']) ? { ref: stringValue(record['ref']) } : {}),
    ...(stringValue(record['commit']) ? { commit: stringValue(record['commit']) } : {}),
    ...(stringValue(record['pinned_commit'])
      ? { pinnedCommit: stringValue(record['pinned_commit']) }
      : {}),
    ...(stringValue(record['scope']) ? { scope: stringValue(record['scope']) } : {}),
  };
}

export function blueprintProvenanceSummary(blueprint: AgentBlueprintSummary): string {
  const provenance = blueprintInstallProvenance(blueprint);
  if (!provenance) return blueprint.scope ?? '';
  const bits = [
    provenance.sourceKind,
    provenance.ref ? `ref ${provenance.ref}` : '',
    provenance.commit ? `commit ${shortCommit(provenance.commit)}` : '',
  ].filter(Boolean);
  return bits.join(' · ');
}

export function blueprintSourceGroups(
  sources: BlueprintSource[],
  blueprints: AgentBlueprintSummary[],
): BlueprintSourceGroup[] {
  const groups: BlueprintSourceGroup[] = sources.map((source) => ({
    id: source.id,
    name: blueprintSourceName(source),
    sourceText: source.source,
    ...(source.ref ? { ref: source.ref } : {}),
    ...(source.pinned_commit ? { commit: source.pinned_commit } : {}),
    status: blueprintSourceStatus(source),
    ...(source.status_message ? { statusMessage: source.status_message } : {}),
    source,
    blueprints: [],
  }));
  const bySource = new Map(groups.map((group) => [sourceKey(group.sourceText, group.ref), group]));

  for (const blueprint of blueprints) {
    const provenance = blueprintInstallProvenance(blueprint);
    if (!provenance) continue;
    const key = sourceKey(provenance.source, provenance.ref);
    let group = bySource.get(key) ?? bySource.get(sourceKey(provenance.source, undefined));
    if (!group) {
      group = {
        id: `installed:${sourceSlug(provenance.source)}:${provenance.ref || 'default'}`,
        name: sourceNameFromPath(provenance.source),
        sourceText: provenance.source,
        ...(provenance.ref ? { ref: provenance.ref } : {}),
        ...(provenance.commit ? { commit: provenance.commit } : {}),
        status: 'installed',
        blueprints: [],
      };
      groups.push(group);
      bySource.set(key, group);
    }
    group.blueprints.push(blueprint);
  }

  return groups;
}

export function shortCommit(commit?: string): string {
  const value = commit?.trim() ?? '';
  return value.length > 12 ? value.slice(0, 12) : value;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sourceKey(source: string, ref?: string): string {
  return `${source.trim()}@${(ref ?? '').trim()}`;
}

function sourceNameFromPath(source: string): string {
  const normalized = source.replace(/\\/g, '/').replace(/\/+$/, '');
  const last = normalized.split('/').filter(Boolean).pop();
  return last || source;
}

function sourceSlug(source: string): string {
  return source
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'source';
}
