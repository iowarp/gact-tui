/**
 * View-model / pure logic for Catalog Browser: state shaping and helpers, no DOM. Key export `catalogHitsFromSettledResults`.
 */
import type { Client } from '@clio/core';

import { CATALOG_KINDS } from './CatalogBrowserTypes.js';
import type {
  CatalogHit,
  CatalogHitGroup,
  CatalogKind,
  CatalogSourceResults,
  IndexedCatalogHit,
} from './CatalogBrowserTypes.js';

export {
  CATALOG_KINDS,
  KIND_ICON,
  KIND_LABEL,
  type CatalogHit,
  type CatalogHitGroup,
  type CatalogKind,
  type CatalogSourceResults,
  type IndexedCatalogHit,
} from './CatalogBrowserTypes.js';

export function catalogHitsFromSettledResults(results: CatalogSourceResults): CatalogHit[] {
  const hits: CatalogHit[] = [];
  if (results.agentsResult.status === 'fulfilled') {
    for (const agent of results.agentsResult.value.agents) {
      hits.push({
        kind: 'agent',
        id: agent.id,
        label: agent.title ?? agent.id,
        ...(agent.description ? { detail: agent.description } : {}),
      });
    }
  }
  if (results.commandsResult.status === 'fulfilled') {
    for (const command of results.commandsResult.value.commands) {
      hits.push({
        kind: 'tool',
        id: command.id,
        label: command.title ?? command.id,
        ...(command.description ? { detail: command.description } : {}),
      });
    }
  }
  if (results.mcpResult.status === 'fulfilled') {
    for (const server of results.mcpResult.value.servers) {
      hits.push({
        kind: 'mcp',
        id: server.id,
        label: server.name,
        detail: `${server.transport} · ${server.tools_count} tools · ${server.status}`,
      });
    }
  }
  if (results.promptsResult.status === 'fulfilled') {
    for (const prompt of results.promptsResult.value.prompts) {
      hits.push({
        kind: 'prompt',
        id: prompt.id,
        label: prompt.title ?? prompt.id,
        ...(prompt.description ? { detail: prompt.description } : {}),
      });
    }
  }
  if (results.workspacesResult.status === 'fulfilled') {
    for (const workspace of results.workspacesResult.value.workspaces) {
      hits.push({
        kind: 'workspace',
        id: workspace.id,
        label: workspace.name,
        detail: workspace.root_path,
      });
    }
  }
  return hits;
}

export async function loadCatalogHits(client: Client): Promise<CatalogHit[]> {
  const [agentsResult, commandsResult, mcpResult, promptsResult, workspacesResult] =
    await Promise.allSettled([
      client.agents(),
      client.commands(),
      client.mcpServers(),
      client.prompts(),
      client.workspaces(),
    ]);

  return catalogHitsFromSettledResults({
    agentsResult,
    commandsResult,
    mcpResult,
    promptsResult,
    workspacesResult,
  });
}

export function filterCatalogHits(hits: readonly CatalogHit[], query: string): CatalogHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...hits];
  return hits.filter(
    (hit) =>
      hit.id.toLowerCase().includes(q) ||
      hit.label.toLowerCase().includes(q) ||
      (hit.detail ?? '').toLowerCase().includes(q),
  );
}

export function groupCatalogHits(hits: readonly CatalogHit[]): Array<[CatalogKind, CatalogHit[]]> {
  const out = new Map<CatalogKind, CatalogHit[]>();
  for (const hit of hits) {
    const current = out.get(hit.kind) ?? [];
    current.push(hit);
    out.set(hit.kind, current);
  }
  return Array.from(out.entries());
}

export function groupCatalogHitsWithIndexes(hits: readonly CatalogHit[]): CatalogHitGroup[] {
  const out = new Map<CatalogKind, IndexedCatalogHit[]>();
  hits.forEach((hit, index) => {
    const current = out.get(hit.kind) ?? [];
    current.push({ hit, index });
    out.set(hit.kind, current);
  });
  return Array.from(out.entries()).map(([kind, indexedHits]) => ({
    kind,
    hits: indexedHits,
  }));
}

export function catalogCategoryCounts(
  hits: readonly CatalogHit[],
): Array<{ kind: CatalogKind; count: number }> {
  return CATALOG_KINDS.map((kind) => ({
    kind,
    count: hits.filter((hit) => hit.kind === kind).length,
  }));
}
