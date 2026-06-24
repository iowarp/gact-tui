/**
 * Type definitions for Catalog Browser.
 */
import type { IconName } from './Icon.js';

export type CatalogKind = 'agent' | 'tool' | 'mcp' | 'prompt' | 'workspace';

export interface CatalogHit {
  kind: CatalogKind;
  id: string;
  label: string;
  detail?: string;
}

export interface IndexedCatalogHit {
  hit: CatalogHit;
  index: number;
}

export interface CatalogHitGroup {
  kind: CatalogKind;
  hits: IndexedCatalogHit[];
}

export interface CatalogSourceResults {
  agentsResult: PromiseSettledResult<{
    agents: Array<{ id: string; title?: string; description?: string }>;
  }>;
  commandsResult: PromiseSettledResult<{
    commands: Array<{ id: string; title?: string; description?: string }>;
  }>;
  mcpResult: PromiseSettledResult<{
    servers: Array<{
      id: string;
      name: string;
      transport: string;
      tools_count: number;
      status: string;
    }>;
  }>;
  promptsResult: PromiseSettledResult<{
    prompts: Array<{ id: string; title?: string; description?: string }>;
  }>;
  workspacesResult: PromiseSettledResult<{
    workspaces: Array<{ id: string; name: string; root_path: string }>;
  }>;
}

export const KIND_LABEL: Record<CatalogKind, string> = {
  agent: 'Agents',
  tool: 'Commands',
  mcp: 'MCP servers',
  prompt: 'Prompts',
  workspace: 'Workspaces',
};

export const KIND_ICON: Record<CatalogKind, IconName> = {
  agent: 'agents',
  tool: 'tool',
  mcp: 'mcp',
  prompt: 'sparkle',
  workspace: 'workspaces',
};

export const CATALOG_KINDS: CatalogKind[] = ['agent', 'tool', 'mcp', 'prompt', 'workspace'];
