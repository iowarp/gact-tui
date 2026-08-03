/**
 * Misc ChatScreen utilities: pinned-command persistence, provider->model
 * option mapping, and the platform modifier-key label.
 */
import type { FileDiff, Message, ProviderDef, SlashCommandDef } from '@clio/core';
import { formatCostUsd } from '../formatters.js';
import { humanNum } from '../presentationUtils.js';
import type { ModelOption, ModelProviderOption, ProviderAvailability } from '../components/ComposerTypes.js';
import type { RailRoute } from '../components/LeftRail.js';
import { DEFAULT_COMMANDS, type SlashCommand } from '../components/SlashPalette.js';
import type { TranscriptDensity } from '../components/Transcript.js';
import type { SettingsSection } from './SettingsShell.js';
export { messageToText, sessionToMarkdown } from './chatSessionMarkdown.js';

export interface ProviderModelCatalogEntry {
  id: string;
  name?: string;
  description?: string;
}

export interface ProviderModelCatalog {
  models: ProviderModelCatalogEntry[];
  source?: string;
  error?: string;
}

export type ProviderModelCatalogs = Record<string, ProviderModelCatalog>;

export const DEFAULT_COMMAND_IDS = new Set(DEFAULT_COMMANDS.map((c) => c.id));

export function loadPinnedSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    /* ignore */
  }
  return new Set();
}

export function providersToModels(
  ps: ProviderDef[],
  catalogs: ProviderModelCatalogs = {},
): ModelOption[] {
  return providersToModelProviders(ps, catalogs).flatMap((provider) => provider.models);
}

export function providersToModelProviders(
  ps: ProviderDef[],
  catalogs: ProviderModelCatalogs = {},
): ModelProviderOption[] {
  return ps.map((p) => {
    const catalog = catalogs[p.id];
    const status = providerAvailability(p, catalog);
    const candidates = collectModelIds(p, catalog);
    const label = p.name || p.id;
    const disabled = status !== 'ok';
    return {
      id: p.id,
      label,
      shortLabel: compactProviderLabel(label),
      status,
      statusLabel: status,
      disabled,
      detail: providerStatusDetail(p, status),
      models: candidates.map((m) => ({
        id: `${p.id}:${m}`,
        providerId: p.id,
        modelId: m,
        providerLabel: label,
        description: modelDescription(m, catalog?.models ?? [], p.default_model),
        disabled,
      })),
    };
  }).sort(compareProviders);
}

function collectModelIds(
  p: ProviderDef,
  catalog: ProviderModelCatalog | undefined,
): string[] {
  const ms = new Set<string>();
  if (catalog?.error || catalog?.source === 'unavailable') return [];
  if (catalog && catalog.models.length > 0) {
    for (const model of catalog.models) if (model.id) ms.add(model.id);
    if (p.default_model) ms.add(p.default_model);
    return Array.from(ms);
  }
  if (p.default_model) ms.add(p.default_model);
  const meta = p.metadata ?? {};
  for (const key of ['models', 'available_models']) {
    const v = (meta as Record<string, unknown>)[key];
    if (Array.isArray(v)) {
      for (const m of v) if (typeof m === 'string') ms.add(m);
    }
  }
  return Array.from(ms);
}

function modelDescription(
  modelId: string,
  catalog: ProviderModelCatalogEntry[],
  defaultModel: string | undefined,
): string | undefined {
  const description = catalog.find((model) => model.id === modelId)?.description;
  if (description) return description;
  return modelId === defaultModel ? 'provider default' : undefined;
}

export function compactProviderLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim() || label;
}

function providerAvailability(
  p: ProviderDef,
  catalog: ProviderModelCatalog | undefined,
): ProviderAvailability {
  const metadata = p.metadata ?? {};
  const metadataStatus = String((metadata as Record<string, unknown>)['status'] ?? '').toLowerCase();
  if (/(offline|error|failed|unavailable)/.test(metadataStatus)) return 'offline';
  if (catalog?.error || catalog?.source === 'unavailable') return 'offline';
  if (p.is_authenticated === false && providerNeedsSetup(p)) return 'setup';
  if (collectModelIds(p, catalog).length === 0) return 'setup';
  return 'ok';
}

function providerNeedsSetup(p: ProviderDef): boolean {
  return (p.auth_methods?.length ?? 0) > 0 || (p.env_keys?.length ?? 0) > 0;
}

function providerStatusDetail(p: ProviderDef, status: ProviderAvailability): string | undefined {
  if (status === 'ok') return undefined;
  if (status === 'offline') return 'Provider is unavailable or failed its last model check.';
  if (p.env_keys?.length) return `Missing configuration: ${p.env_keys.join(', ')}`;
  if (p.auth_methods?.length) return `Authentication required: ${p.auth_methods.join(', ')}`;
  return 'No selectable models advertised by this provider.';
}

const PROVIDER_ORDER = [
  'claude_code',
  'codex',
  'anthropic',
  'openai',
  'openrouter',
  'lm_studio',
  'ollama',
  'argonne_sophia',
  'argonne_metis',
  'argonne_local_vllm',
] as const;

function compareProviders(a: ModelProviderOption, b: ModelProviderOption): number {
  const order = providerRank(a.id) - providerRank(b.id);
  if (order !== 0) return order;
  const status = statusRank(a.status) - statusRank(b.status);
  if (status !== 0) return status;
  return a.label.localeCompare(b.label);
}

function statusRank(status: ProviderAvailability): number {
  if (status === 'ok') return 0;
  if (status === 'setup') return 1;
  return 2;
}

function providerRank(id: string): number {
  const index = PROVIDER_ORDER.indexOf(id as (typeof PROVIDER_ORDER)[number]);
  return index === -1 ? PROVIDER_ORDER.length : index;
}

export function platformMod(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl';
}

export function cycleDensity(cur: TranscriptDensity, set: (d: TranscriptDensity) => void) {
  if (cur === 'verbose') set('normal');
  else if (cur === 'normal') set('summary');
  else set('verbose');
}

export function firstFileDiff(messages: Message[]): FileDiff | null {
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === 'file_diff') return p;
    }
  }
  return null;
}

export function humanTokens(
  tokens: { input?: number; output?: number; total?: number } | undefined,
): string {
  if (!tokens) return '0 tok';
  const t = tokens.total ?? (tokens.input ?? 0) + (tokens.output ?? 0);
  return `${humanNum(t)} tok`;
}

export function completionToastBody(c: {
  tokens?: { input?: number; output?: number; total?: number };
  cost_usd?: number;
}): string | undefined {
  const tokenTotal =
    c.tokens?.total ?? (c.tokens ? (c.tokens.input ?? 0) + (c.tokens.output ?? 0) : 0);
  const bits: string[] = [];
  if (tokenTotal > 0) bits.push(humanTokens({ total: tokenTotal }));
  if ((c.cost_usd ?? 0) > 0) bits.push(`$${formatCostUsd(c.cost_usd ?? 0)}`);
  return bits.length ? bits.join(' · ') : undefined;
}

export function hostFromUrl(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

export function routeSettingsSection(route: RailRoute): SettingsSection | null {
  switch (route) {
    case 'workspaces':
      return 'workspaces';
    case 'agents':
      return 'agents';
    case 'tools':
      return 'tools';
    case 'prompts':
      return 'prompts';
    case 'mcp':
      return 'mcp';
    case 'memory':
      return 'memory';
    case 'metrics':
      return 'metrics';
    case 'doctor':
      return 'doctor';
    case 'settings':
      return 'backends';
    case 'plugins':
      return 'plugins';
    case 'sessions':
    default:
      return null;
  }
}

/**
 * Merge SPEC §/v1/commands output with our local default palette so the
 * keyboard-driven nav always has the meta commands (/settings, /clear,
 * /help) even when the backend doesn't ship them. Backend-supplied
 * commands win on id collision.
 */
export function mergedSlashCommands(backend: SlashCommandDef[] | undefined): SlashCommand[] {
  const map = new Map<string, SlashCommand>();
  for (const d of DEFAULT_COMMANDS) map.set(d.id, d);
  for (const c of backend ?? []) {
    map.set(c.id, {
      id: c.id,
      trigger: c.id,
      description: c.description ?? c.title ?? '',
      category: c.source ?? 'backend',
    });
  }
  return Array.from(map.values());
}
