/**
 * `a2uiClientCapabilities` / `a2uiClientDataModel` — the official transport
 * metadata objects (`docs/gact/a2ui-binding.md`, S3), attached once here so
 * every repository door (message submit, retry, `/a2ui/actions`) sends the
 * exact same shape regardless of transport (browser fetch or Tauri IPC): the
 * transport never sees or builds this metadata, it only carries whatever the
 * repository layer merges in — "identical by construction."
 */

/** `a2uiClientCapabilities`, verbatim per the A2UI protocol's capability generation. */
export interface A2uiClientCapabilitiesMetadata {
  'v0.9': { supportedCatalogIds: string[] };
}

/** `a2uiClientDataModel`, sent only to the server that created the surface(s). */
export interface A2uiClientDataModelMetadata {
  version: string;
  surfaces: Record<string, unknown>;
}

export interface A2uiClientMetadataSnapshot {
  a2uiClientCapabilities?: A2uiClientCapabilitiesMetadata;
  a2uiClientDataModel?: A2uiClientDataModelMetadata;
}

/** Builds the exact `a2uiClientCapabilities` envelope from a resolved id list. */
export function buildA2uiClientCapabilities(
  supportedCatalogIds: readonly string[],
): A2uiClientCapabilitiesMetadata {
  return { 'v0.9': { supportedCatalogIds: [...supportedCatalogIds] } };
}

export type A2uiClientMetadataProvider = (sessionId: string) => A2uiClientMetadataSnapshot;

let provider: A2uiClientMetadataProvider | undefined;

/**
 * Registers the (one) function the repository layer calls to source the
 * current client metadata for a session. Set once, by the catalog-registry
 * hook that owns the live resolution (`web/src/lib/a2ui/processor-store.ts`);
 * cleared by passing `undefined`.
 */
export function setA2uiClientMetadataProvider(next: A2uiClientMetadataProvider | undefined): void {
  provider = next;
}

/** The current snapshot for a session, or `{}` when nothing has registered yet. */
export function currentA2uiClientMetadata(sessionId: string): A2uiClientMetadataSnapshot {
  return provider ? provider(sessionId) : {};
}

export interface MergeA2uiClientMetadataOptions {
  /** Include `a2uiClientDataModel` when the provider has one for this session. */
  includeDataModel?: boolean;
}

/**
 * Merges the live `a2uiClientCapabilities` (always) and `a2uiClientDataModel`
 * (only when requested and present) into an existing metadata object, without
 * mutating it. Caller-supplied keys always win — this never overwrites
 * metadata the caller explicitly set.
 */
export function mergeA2uiClientMetadata(
  sessionId: string,
  base: Record<string, unknown> | undefined,
  options: MergeA2uiClientMetadataOptions = {},
): Record<string, unknown> | undefined {
  const snapshot = currentA2uiClientMetadata(sessionId);
  const additions: Record<string, unknown> = {};
  if (snapshot.a2uiClientCapabilities) {
    additions.a2uiClientCapabilities = snapshot.a2uiClientCapabilities;
  }
  if (options.includeDataModel && snapshot.a2uiClientDataModel) {
    additions.a2uiClientDataModel = snapshot.a2uiClientDataModel;
  }
  if (Object.keys(additions).length === 0) return base;
  return { ...additions, ...(base ?? {}) };
}

/** URL schemes the renderer allows for a resolved (post-binding) A2UI URL value. */
export const A2UI_ALLOWED_URL_SCHEMES = ['https:', 'artifact:', 'resource:'] as const;

export type A2uiUrlCheck = { ok: true } | { ok: false; reason: string };

/**
 * Enforces the same URL scheme allowlist the server checks on literals
 * (owner decision 11, `docs/design/a2ui-compat-campaign-2026-09.md`) on a
 * RESOLVED value at render time — the one place a data-bound or
 * `functionCall`-resolved URL is visible at all.
 */
export function checkA2uiUrlScheme(value: string): A2uiUrlCheck {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: `"${value}" is not a valid URL.` };
  }
  if (!(A2UI_ALLOWED_URL_SCHEMES as readonly string[]).includes(parsed.protocol)) {
    return {
      ok: false,
      reason: `"${parsed.protocol}" is not an allowed URL scheme (allowed: ${A2UI_ALLOWED_URL_SCHEMES.join(', ')}).`,
    };
  }
  return { ok: true };
}
