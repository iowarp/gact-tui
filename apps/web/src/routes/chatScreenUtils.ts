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

export function providersToModels(ps: ProviderDef[]): ModelOption[] {
  return providersToModelProviders(ps).flatMap((provider) => provider.models);
}

export function providersToModelProviders(ps: ProviderDef[]): ModelProviderOption[] {
  return ps.map((p) => {
    const status = providerAvailability(p);
    const candidates = collectModelIds(p);
    const label = p.name || p.id;
    const disabled = status !== 'ok';
    return {
      id: p.id,
      label,
      status,
      statusLabel: status,
      disabled,
      detail: providerStatusDetail(p, status),
      models: candidates.map((m) => ({
        id: `${p.id}:${m}`,
        providerId: p.id,
        modelId: m,
        providerLabel: label,
        description: m === p.default_model ? 'provider default' : undefined,
        disabled,
      })),
    };
  });
}

function collectModelIds(p: ProviderDef): string[] {
  const ms = new Set<string>();
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

function providerAvailability(p: ProviderDef): ProviderAvailability {
  const metadata = p.metadata ?? {};
  const metadataStatus = String((metadata as Record<string, unknown>)['status'] ?? '').toLowerCase();
  if (/(offline|error|failed|unavailable)/.test(metadataStatus)) return 'offline';
  if (p.is_authenticated === false && providerNeedsSetup(p)) return 'setup';
  if (collectModelIds(p).length === 0) return 'setup';
  return 'ok';
}

function providerNeedsSetup(p: ProviderDef): boolean {
  return (p.auth_methods?.length ?? 0) > 0 || (p.env_keys?.length ?? 0) > 0;
}

function providerStatusDetail(p: ProviderDef, status: ProviderAvailability): string | undefined {
  if (status === 'ok') return undefined;
  if (status === 'offline') return 'Provider is unavailable or failed its last status check.';
  if (p.env_keys?.length) return `Missing configuration: ${p.env_keys.join(', ')}`;
  if (p.auth_methods?.length) return `Authentication required: ${p.auth_methods.join(', ')}`;
  return 'No selectable models advertised by this provider.';
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
