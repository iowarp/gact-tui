import { toast } from 'sonner';
import { createRepository, type ConnectionSettings } from '@/lib/connection';
import {
  WEB_MCP_COMMAND,
  WEB_MCP_ENV,
  WEB_SEARCH_DEFAULT_LOCAL_URL,
  webSearchMcpArgs,
} from '@/lib/web-search-service';
import {
  completeInstallerWebSearch,
  readInstallerOptions,
  type InstallerOptions,
} from '@/tauri/installer-options';

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

/**
 * Resolve the installer's recorded provider selection, if any. `provider_ids`
 * (schema 4+) is authoritative; the pre-v4 `provider_families` field is
 * expanded only when it is genuinely present in the file. When NEITHER is
 * present, this returns `undefined` ("no installer preference") rather than
 * synthesizing a default such as "openai": the caller must leave provider
 * visibility untouched in that case (no silent fallback).
 *
 * The logged reason distinguishes two different "nothing to apply" causes:
 * `installer_provider_selection_empty` when `provider_ids` is present but an
 * explicit empty string (a genuinely unattended `/S` install that skipped
 * the wizard, or a pre-fix installer run whose Leave validation once let an
 * empty wizard selection through), versus `installer_options_absent` when
 * there is no recorded value at all (missing/unreadable file, or a schema
 * migrated from a version that never recorded providers). The web layer has
 * no other diagnostics channel for this path, hence `console.info`.
 */
function resolveInstallerProviderSelection(options: InstallerOptions): string | undefined {
  if (options.provider_ids) return options.provider_ids;
  if (options.provider_families) return expandLegacyProviderFamilies(options.provider_families);
  const reason =
    options.provider_ids === ''
      ? 'installer_provider_selection_empty'
      : 'installer_options_absent';
  console.info(
    '[installer] no installer provider preference recorded — leaving provider visibility untouched',
    { reason },
  );
  return undefined;
}

/** Finish the lightweight agent registration for infrastructure deployed by NSIS. */
export async function finishInstallerInfrastructure(settings: ConnectionSettings): Promise<void> {
  const options = await readInstallerOptions();
  const selectedProviders = resolveInstallerProviderSelection(options);
  const appliedThisRevision = applyInstallerProviderVisibility(
    selectedProviders,
    options.installed_at,
  );
  const repository = createRepository(settings);
  // installProviderSupport used to run on every managed-backend connect;
  // gate it on the same apply-once stamp as provider visibility so it also
  // only runs once per install.
  if (
    appliedThisRevision &&
    selectedProviders?.split(',').some((providerId) => providerId.trim() === 'claude_code')
  ) {
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

const HIDDEN_PROVIDERS_STORAGE_KEY = 'clio.hidden-providers.v1';
export const PROVIDER_VISIBILITY_CHANGED_EVENT = 'clio:provider-visibility-changed';
// The installer-options "revision" (NSIS's installed_at timestamp) that
// visibility was last applied for. Comparing against THIS — not against
// whatever the currently-selected provider ids happen to be — is what makes
// application apply-once: a later Settings/picker change is never reverted
// by a subsequent connect, only by a genuinely new install stamping a new
// revision. (Previously the applied marker was the normalized provider-id
// set itself, so a user un-hiding a provider in Settings drifted the stored
// hidden list away from what re-deriving it from the SAME installer
// selection produced, and the next connect silently reverted the change.)
const INSTALLER_REVISION_STORAGE_KEY = 'clio.installer-applied-revision.v1';
// Installer files written before `installed_at` existed (or a genuinely
// unattended install that never got a real timestamp) have no revision to
// compare against. Treat every such file as one stable revision so
// visibility is still applied exactly once for them, instead of reapplying
// — and clobbering later Settings/picker changes — on every connect.
const UNSTAMPED_INSTALLER_REVISION = 'legacy';
// The pre-fix marker: it recorded the normalized provider-id set visibility
// was last (re)applied for, and got rewritten on every connect. Its only
// remaining job is a one-time migration (see migrateAwayFromLegacyFallbackMarker):
// a stored value of exactly "codex,openai" is the fingerprint of the deleted
// silent default, not evidence of a real choice, so a hidden list produced
// under it must not be preserved forever now that "no preference" returns
// early instead of re-deriving visibility from that same default.
const LEGACY_INSTALLER_PROVIDER_MARKER = 'clio.installer-provider-ids.v3';
const LEGACY_FALLBACK_PROVIDER_IDS = 'codex,openai';
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

function normalizeProviderIdList(ids: string): string {
  return [...new Set(ids.split(',').map((providerId) => providerId.trim()).filter(Boolean))]
    .sort()
    .join(',');
}

/**
 * One-time cleanup for accounts whose hidden list was produced by the
 * deleted "codex,openai" silent fallback (the web client, which never had an
 * installer at all, or a desktop connect with a missing installer file).
 * Those accounts would otherwise keep that hidden list forever, since "no
 * installer preference" now returns early instead of re-deriving visibility
 * from that same default every connect. A marker value that normalizes to
 * anything else is a genuine recorded choice (or already migrated/absent)
 * and is left alone.
 */
function migrateAwayFromLegacyFallbackMarker(): void {
  const marker = window.localStorage.getItem(LEGACY_INSTALLER_PROVIDER_MARKER);
  if (marker === null || normalizeProviderIdList(marker) !== LEGACY_FALLBACK_PROVIDER_IDS) return;
  window.localStorage.removeItem(LEGACY_INSTALLER_PROVIDER_MARKER);
  window.localStorage.setItem(HIDDEN_PROVIDERS_STORAGE_KEY, JSON.stringify([]));
  window.dispatchEvent(new Event(PROVIDER_VISIBILITY_CHANGED_EVENT));
}

/**
 * Apply the installer's individual provider choices, exactly once per
 * install. `selectedProviders` undefined or empty means "no installer
 * preference was recorded" (missing/unreadable file, or a fully unattended
 * install) — visibility is left completely untouched (aside from the
 * one-time legacy-marker migration above), so every provider stays visible.
 * `revision` should be the installer-options `installed_at` stamp; once
 * visibility has been applied for a given revision, this is a no-op until a
 * new install stamps a different one, so Settings/picker changes made
 * afterward persist across restarts.
 *
 * Returns whether this call actually applied a (new) selection, so callers
 * can gate other apply-once work (e.g. `installProviderSupport`) on the same
 * stamp instead of re-running it on every connect.
 */
export function applyInstallerProviderVisibility(
  selectedProviders: string | undefined,
  revision: string = UNSTAMPED_INSTALLER_REVISION,
): boolean {
  if (typeof window === 'undefined') return false;
  if (!selectedProviders) {
    migrateAwayFromLegacyFallbackMarker();
    return false;
  }
  const effectiveRevision = revision || UNSTAMPED_INSTALLER_REVISION;
  if (window.localStorage.getItem(INSTALLER_REVISION_STORAGE_KEY) === effectiveRevision) {
    return false;
  }
  const visible = new Set(
    selectedProviders
      .split(',')
      .map((providerId) => providerId.trim())
      .filter((providerId) => KNOWN_PROVIDER_IDS.has(providerId)),
  );
  const hidden = [...KNOWN_PROVIDER_IDS].filter((providerId) => !visible.has(providerId)).sort();
  window.localStorage.setItem(HIDDEN_PROVIDERS_STORAGE_KEY, JSON.stringify(hidden));
  window.localStorage.setItem(INSTALLER_REVISION_STORAGE_KEY, effectiveRevision);
  // A fresh, real installer selection supersedes the old marker outright —
  // it is no longer relevant once a revision-stamped selection has applied.
  window.localStorage.removeItem(LEGACY_INSTALLER_PROVIDER_MARKER);
  // The model picker is mounted before this asynchronous installer hand-off
  // finishes. The browser's `storage` event does not fire in the document that
  // performed the write, so notify already-mounted pickers explicitly.
  window.dispatchEvent(new Event(PROVIDER_VISIBILITY_CHANGED_EVENT));
  return true;
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
