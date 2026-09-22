import { toast } from 'sonner';
import { createRepository, type ConnectionSettings } from '@/lib/connection';
import { vocab } from '@/lib/brand-vocabulary';
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

// Families can expose several choices in the picker, but only providers that
// need no secret or per-host fields are safe to activate automatically.  The
// order is intentional: it follows the installer's default family order and
// prefers subscription-backed providers over API-key billing.
const INSTALLER_DEFAULT_PROVIDERS: Record<string, readonly string[]> = {
  openai: ['codex'],
  anthropic: ['claude_code'],
  argonne: ['argonne_metis', 'argonne_sophia'],
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function selectedProviderDefaults(selectedFamilies: string): string[] {
  return selectedFamilies
    .split(',')
    .map((family) => family.trim())
    .flatMap((family) => INSTALLER_DEFAULT_PROVIDERS[family] ?? []);
}

async function activateInstallerProvider(
  repository: ReturnType<typeof createRepository>,
  selectedFamilies: string,
): Promise<void> {
  const configuration = await repository.languageModelConfiguration();
  if (configuration.configured) return;

  const preferredIds = selectedProviderDefaults(selectedFamilies);
  const preset = preferredIds
    .map((providerId) =>
      configuration.presets.find(
        (candidate) => candidate.id === providerId || candidate.provider_id === providerId,
      ),
    )
    .find(
      (candidate) =>
        candidate?.is_authenticated &&
        !candidate.requires_api_key &&
        Boolean(candidate.suggested_model) &&
        !candidate.configuration_fields?.some((field) => field.required),
    );
  if (!preset) {
    if (preferredIds.length > 0) {
      toast.warning('Your selected model provider needs sign-in', {
        id: 'installer-provider-needs-attention',
        description: `Open Settings › Models to finish connecting it. ${vocab.agent} will guide you there.`,
      });
    }
    return;
  }

  let result = await repository.updateLanguageModelConfiguration({
    api_base: preset.api_base ?? '',
    model: preset.suggested_model ?? '',
    provider: preset.provider,
    provider_id: preset.provider_id ?? preset.id,
    provider_options: {},
  });
  if (result.state === 'configuring') {
    result = await repository.waitLanguageModelConfiguration();
  }
  if (!result.configured || result.state === 'error') {
    toast.warning(`${vocab.agent} could not start the selected model provider`, {
      id: 'installer-provider-start-failed',
      description: result.status_message || result.error || 'Open Settings › Models to retry.',
    });
  }
}

/** Finish the lightweight agent registration for infrastructure deployed by NSIS. */
export async function finishInstallerInfrastructure(settings: ConnectionSettings): Promise<void> {
  const options = await readInstallerOptions();
  const selectedFamilies = options.provider_families || 'openai';
  applyInstallerProviderVisibility(selectedFamilies);
  const repository = createRepository(settings);
  await activateInstallerProvider(repository, selectedFamilies);
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
const PROVIDER_VISIBILITY_MARKER = 'clio.installer-provider-families.v2';
const HIDDEN_PROVIDERS_STORAGE_KEY = 'clio.hidden-providers.v1';
export const PROVIDER_VISIBILITY_CHANGED_EVENT = 'clio:provider-visibility-changed';
const PROVIDER_FAMILIES: Record<string, readonly string[]> = {
  openai: ['codex', 'openai'],
  anthropic: ['anthropic', 'claude_code'],
  google: ['gemini', 'vertex_ai'],
  argonne: ['argonne_sophia', 'argonne_metis'],
  local: ['lm_studio', 'ollama', 'llama_cpp', 'vllm'],
  other: ['azure_openai', 'bedrock', 'nvidia_nim', 'openrouter'],
};

/** Apply the installer's provider choices once for this exact selection. */
export function applyInstallerProviderVisibility(selectedFamilies = 'openai'): void {
  if (typeof window === 'undefined') return;
  const normalized = selectedFamilies
    .split(',')
    .map((family) => family.trim())
    .filter((family) => family in PROVIDER_FAMILIES)
    .sort()
    .join(',');
  const visible = new Set(
    normalized.split(',').flatMap((family) => PROVIDER_FAMILIES[family] ?? []),
  );
  const hidden = Object.values(PROVIDER_FAMILIES)
    .flat()
    .filter((providerId) => !visible.has(providerId))
    .sort();
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
