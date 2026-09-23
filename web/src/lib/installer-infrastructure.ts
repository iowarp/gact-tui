import { toast } from 'sonner';
import { createRepository, type ConnectionSettings } from '@/lib/connection';
import {
  WEB_MCP_COMMAND,
  WEB_MCP_ENV,
  WEB_SEARCH_DEFAULT_LOCAL_URL,
  webSearchMcpArgs,
} from '@/lib/web-search-service';
import { completeInstallerWebSearch, readInstallerOptions } from '@/tauri/installer-options';

const WEB_SEARCH_CONNECT_ATTEMPTS = 6;
const WEB_SEARCH_CONNECT_RETRY_MS = 2_000;

async function waitForInfrastructureOperation(
  repository: ReturnType<typeof createRepository>,
  operationId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const operation = await repository.infrastructureOperation(operationId);
    if (operation.state === 'succeeded') return;
    if (operation.state === 'failed' || operation.state === 'cancelled') {
      throw new Error(operation.error || operation.progress || 'CLIO Search installation failed.');
    }
    await wait(500);
  }
  throw new Error('CLIO Search installation is still running.');
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/** Finish the lightweight agent registration for infrastructure deployed by NSIS. */
export async function finishInstallerInfrastructure(settings: ConnectionSettings): Promise<void> {
  const options = await readInstallerOptions();
  const selectedProviders =
    options.provider_ids ?? expandLegacyProviderFamilies(options.provider_families || 'openai');
  applyInstallerProviderVisibility(selectedProviders);
  const repository = createRepository(settings);
  if (selectedProviders.split(',').some((providerId) => providerId.trim() === 'claude_code')) {
    try {
      await repository.installProviderSupport('claude_code');
    } catch (error) {
      toast.warning('Claude Code still needs setup', {
        id: 'installer-claude-code-needs-attention',
        description:
          error instanceof Error
            ? error.message
            : 'Open Models to install Claude Code on the connected agent.',
      });
    }
  }
  if (options.web_search === 'not_requested' || options.web_search === 'configured') return;
  const catalog = await repository.managedServiceCatalog('local');
  const service = catalog.services.find((candidate) => candidate.id === 'web_search');
  const variant = service?.variants.find((candidate) => candidate.compatible);
  if (!service || !variant) {
    toast.warning('CLIO Search still needs setup', {
      id: 'installer-web-search-needs-attention',
      description: service?.variants[0]?.reason || 'Open Infrastructure to inspect this computer.',
    });
    return;
  }
  if (service.state !== 'running') {
    const operation = await repository.runManagedServiceAction('web_search', {
      target_id: 'local',
      action: service.state === 'stopped' ? 'start' : 'install',
      variant_id: variant.id,
      configuration: {},
    });
    await waitForInfrastructureOperation(repository, operation.id);
  }
  let result = await repository.configureMcpServer('web', {
    name: 'CLIO Web Search',
    transport: 'stdio',
    command: WEB_MCP_COMMAND,
    args: webSearchMcpArgs(WEB_SEARCH_DEFAULT_LOCAL_URL),
    env: WEB_MCP_ENV,
    always_load: true,
  });
  // Docker can report the container as started before its HTTP endpoint is
  // accepting requests.  The installer deliberately leaves the durable state
  // as `deployed` until this succeeds, so use that window for a bounded,
  // idempotent retry instead of making the user race startup with a manual
  // Connect click.
  for (
    let attempt = 1;
    result.status !== 'ready' && attempt < WEB_SEARCH_CONNECT_ATTEMPTS;
    attempt += 1
  ) {
    await wait(WEB_SEARCH_CONNECT_RETRY_MS);
    result = await repository.configureMcpServer('web', {
      name: 'CLIO Web Search',
      transport: 'stdio',
      command: WEB_MCP_COMMAND,
      args: webSearchMcpArgs(WEB_SEARCH_DEFAULT_LOCAL_URL),
      env: WEB_MCP_ENV,
      always_load: true,
    });
  }
  if (result.status !== 'ready') {
    toast.warning('CLIO Search was installed but is not ready', {
      id: 'installer-web-search-not-ready',
      description: result.error ?? 'Open Infrastructure to inspect the service.',
    });
    return;
  }
  await completeInstallerWebSearch();
  toast.success('CLIO Search is ready', {
    id: 'installer-web-search-ready',
    description: 'Web search and document reading are available to your agents.',
  });
}

// Version the derived marker independently from the installer schema. The
// stored hidden-provider list is also verified below: a marker alone is not
// sufficient evidence because an older preview may have written the marker
// while an already-mounted picker retained the previous list.
const PROVIDER_VISIBILITY_MARKER = 'clio.installer-provider-ids.v3';
const HIDDEN_PROVIDERS_STORAGE_KEY = 'clio.hidden-providers.v1';
export const PROVIDER_VISIBILITY_CHANGED_EVENT = 'clio:provider-visibility-changed';
const LEGACY_PROVIDER_FAMILIES: Record<string, readonly string[]> = {
  openai: ['codex', 'openai'],
  anthropic: ['anthropic', 'claude_code'],
  google: ['gemini', 'vertex_ai'],
  argonne: ['argonne_sophia', 'argonne_metis'],
  local: ['lm_studio', 'ollama', 'llama_cpp', 'vllm'],
  other: ['azure_openai', 'bedrock', 'nvidia_nim', 'openrouter'],
};
const KNOWN_PROVIDER_IDS = new Set(Object.values(LEGACY_PROVIDER_FAMILIES).flat());

function expandLegacyProviderFamilies(families: string): string {
  return families
    .split(',')
    .map((family) => family.trim())
    .flatMap((family) => LEGACY_PROVIDER_FAMILIES[family] ?? [])
    .join(',');
}

/** Apply the installer's individual provider choices once for this exact selection. */
export function applyInstallerProviderVisibility(selectedProviders = 'codex,openai'): void {
  if (typeof window === 'undefined') return;
  const visible = new Set(
    selectedProviders
      .split(',')
      .map((providerId) => providerId.trim())
      .filter((providerId) => KNOWN_PROVIDER_IDS.has(providerId)),
  );
  const normalized = [...visible].sort().join(',');
  const hidden = [...KNOWN_PROVIDER_IDS].filter((providerId) => !visible.has(providerId)).sort();
  let storedHidden: string[] = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HIDDEN_PROVIDERS_STORAGE_KEY) ?? '[]');
    storedHidden = Array.isArray(parsed)
      ? parsed.filter((providerId): providerId is string => typeof providerId === 'string').sort()
      : [];
  } catch {
    // Replace invalid persisted state with the installer's authoritative list.
  }
  if (
    window.localStorage.getItem(PROVIDER_VISIBILITY_MARKER) === normalized &&
    JSON.stringify(storedHidden) === JSON.stringify(hidden)
  ) {
    return;
  }
  window.localStorage.setItem(HIDDEN_PROVIDERS_STORAGE_KEY, JSON.stringify(hidden));
  window.localStorage.setItem(PROVIDER_VISIBILITY_MARKER, normalized);
  // The model picker is mounted before this asynchronous installer hand-off
  // finishes. The browser's `storage` event does not fire in the document that
  // performed the write, so notify already-mounted pickers explicitly.
  window.dispatchEvent(new Event(PROVIDER_VISIBILITY_CHANGED_EVENT));
}

/**
 * Whether the desktop installer's Infrastructure page recorded a request to
 * set up a local model runtime (llama.cpp). No runtime is installed by the
 * NSIS installer itself — this only tells the Services view whether to show
 * its "finish setup" prompt for managing one.
 */
export async function installerRequestedLlamaCpp(): Promise<boolean> {
  const options = await readInstallerOptions();
  return options.llama_cpp === 'requested';
}
