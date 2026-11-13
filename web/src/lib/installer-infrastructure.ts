import { toast } from 'sonner';
import { createRepository, type ConnectionSettings } from '@/lib/connection';
import { readInstallerOptions, type InstallerOptions } from '@/tauri/installer-options';
import { t } from '@lingui/core/macro';

/**
 * Resolve the installer's recorded provider selection, if any. `provider_ids`
 * (schema 5+) is authoritative for the complete provider inventory; older
 * inventories keep newly offered providers available. The pre-v4 `provider_families` field is
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
  if (options.provider_ids)
    return includePreviouslyUnofferedProviders(options, options.provider_ids);
  if (options.provider_families) {
    return includePreviouslyUnofferedProviders(
      options,
      expandLegacyProviderFamilies(options.provider_families),
    );
  }
  const reason =
    options.provider_ids === '' ? 'installer_provider_selection_empty' : 'installer_options_absent';
  console.info(
    '[installer] no installer provider preference recorded — leaving provider visibility untouched',
    { reason },
  );
  return undefined;
}

/** Finish the lightweight agent registration for infrastructure deployed by NSIS. */
export async function finishInstallerInfrastructure(settings: ConnectionSettings): Promise<void> {
  const options = await readInstallerOptions();
  migratePreviouslyUnofferedProviders(options);
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
      toast.warning(t`Claude Code still needs setup`, {
        id: 'installer-claude-code-needs-attention',
        description:
          error instanceof Error
            ? error.message
            : t`Open Models to install Claude Code on the connected agent.`,
      });
    }
  }
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
  argonne: ['argonne_sophia', 'argonne_metis', 'argonne_minerva', 'argonne_tara'],
  local: ['lm_studio', 'ollama', 'llama_cpp', 'vllm'],
  other: ['azure_openai', 'bedrock', 'nvidia_nim', 'openrouter', 'amsc_mag'],
};
const KNOWN_PROVIDER_IDS = new Set(Object.values(LEGACY_PROVIDER_FAMILIES).flat());

function includePreviouslyUnofferedProviders(options: InstallerOptions, selection: string): string {
  if (options.schema >= 5) return selection;
  const visible = new Set(
    selection
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
  // Older wizards offered neither MAG nor these two ALCF servers. Their
  // absence cannot represent a deliberate choice to hide those new options.
  visible.add('amsc_mag');
  if (visible.has('argonne_sophia') || visible.has('argonne_metis')) {
    visible.add('argonne_minerva');
    visible.add('argonne_tara');
  }
  return [...visible].join(',');
}

function migratePreviouslyUnofferedProviders(options: InstallerOptions): void {
  if (typeof window === 'undefined' || options.schema >= 5) return;
  const selection =
    options.provider_ids ||
    (options.provider_families ? expandLegacyProviderFamilies(options.provider_families) : '');
  if (!selection) return;
  const revision = options.installed_at || UNSTAMPED_INSTALLER_REVISION;
  const inventoryKey = 'clio.installer-provider-inventory.v1';
  if (window.localStorage.getItem(inventoryKey) === revision) return;
  if (window.localStorage.getItem(INSTALLER_REVISION_STORAGE_KEY) === revision) {
    const selected = new Set(
      selection
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id !== 'argonne_minerva' && id !== 'argonne_tara'),
    );
    const generatedHidden = [...KNOWN_PROVIDER_IDS]
      .filter((id) => id !== 'amsc_mag' && !selected.has(id))
      .sort();
    let hidden: unknown;
    try {
      hidden = JSON.parse(window.localStorage.getItem(HIDDEN_PROVIDERS_STORAGE_KEY) || 'null');
    } catch {
      // Unreadable or manually changed preferences are never replaced.
      console.warn('[installer] provider visibility preference is unreadable; preserving it');
      window.localStorage.setItem(inventoryKey, revision);
      return;
    }
    if (
      Array.isArray(hidden) &&
      hidden.every((id) => typeof id === 'string') &&
      JSON.stringify([...hidden].sort()) === JSON.stringify(generatedHidden)
    ) {
      const visible = new Set(includePreviouslyUnofferedProviders(options, selection).split(','));
      const migrated = hidden.filter((id) => !visible.has(id));
      if (migrated.length !== hidden.length) {
        window.localStorage.setItem(HIDDEN_PROVIDERS_STORAGE_KEY, JSON.stringify(migrated));
        window.dispatchEvent(new Event(PROVIDER_VISIBILITY_CHANGED_EVENT));
      }
    }
  }
  // Run once even when user changes made the old generated state ambiguous.
  window.localStorage.setItem(inventoryKey, revision);
}

function expandLegacyProviderFamilies(families: string): string {
  return families
    .split(',')
    .map((family) => family.trim())
    .flatMap((family) => LEGACY_PROVIDER_FAMILIES[family] ?? [])
    .join(',');
}

function normalizeProviderIdList(ids: string): string {
  return [
    ...new Set(
      ids
        .split(',')
        .map((providerId) => providerId.trim())
        .filter(Boolean),
    ),
  ]
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
