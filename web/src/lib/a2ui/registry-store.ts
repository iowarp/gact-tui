import { A2uiCatalogRegistry, A2UI_CLIENT_DATA_MODEL_VERSION } from '@clio/core/v3';
import type { A2uiCatalogRow } from '@clio/core/v3';
import type { Catalog, MessageProcessor } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { useSyncExternalStore } from 'react';
import { KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';
import { wrapKernelComponentWithPresets } from './kernel-presets';

const KERNEL = { components: KERNEL_COMPONENTS, functions: KERNEL_FUNCTIONS };

export interface A2uiRegistrySnapshot {
  registry: A2uiCatalogRegistry<ReactComponentImplementation>;
  catalogs: Catalog<ReactComponentImplementation>[];
  isLoading: boolean;
}

interface SessionEntry {
  registry: A2uiCatalogRegistry<ReactComponentImplementation>;
  snapshot: A2uiRegistrySnapshot;
  listeners: Set<() => void>;
  processors: Map<string, MessageProcessor<ReactComponentImplementation>>;
}

/**
 * Session-lifetime state (owner decision, adversarial S6 review — BLOCKING):
 * one entry per session id, created on first use and disposed only when the
 * session's OWNER (`useA2uiSessionRegistry`, called once from
 * `use-workspace-data.ts`, the session's own data hook) unmounts. A surface
 * mounting or unmounting (`ClioA2UISurface`/`DeferredA2UISurface`) never
 * touches this map — it only reads the current snapshot
 * (`useA2uiRegistrySnapshot`) and registers/unregisters its own processor.
 */
const sessions = new Map<string, SessionEntry>();

function entryFor(sessionId: string): SessionEntry {
  let entry = sessions.get(sessionId);
  if (!entry) {
    const registry = new A2uiCatalogRegistry<ReactComponentImplementation>(
      KERNEL,
      wrapKernelComponentWithPresets,
    );
    entry = {
      registry,
      snapshot: { registry, catalogs: [], isLoading: true },
      listeners: new Set(),
      processors: new Map(),
    };
    sessions.set(sessionId, entry);
  }
  return entry;
}

function notify(entry: SessionEntry): void {
  for (const listener of entry.listeners) listener();
}

/** OWNER only: resolves `rows` into the session's shared registry and notifies consumers. */
export function loadA2uiSessionCatalogs(
  sessionId: string,
  rows: A2uiCatalogRow[] | undefined,
  isLoading: boolean,
): void {
  const entry = entryFor(sessionId);
  entry.registry.load(rows ?? []);
  entry.snapshot = { registry: entry.registry, catalogs: entry.registry.catalogs(), isLoading };
  notify(entry);
}

/** OWNER only: called when the session closes (`useA2uiSessionRegistry` unmounts). */
export function disposeA2uiSessionRegistry(sessionId: string): void {
  sessions.delete(sessionId);
}

/** Non-hook accessor for code that runs outside React (the metadata provider callback). */
export function registrySnapshotSync(sessionId: string): A2uiRegistrySnapshot {
  return entryFor(sessionId).snapshot;
}

/** CONSUMER: read-only snapshot subscription — no fetch, no provider registration. */
export function useA2uiRegistrySnapshot(sessionId: string): A2uiRegistrySnapshot {
  return useSyncExternalStore(
    (onStoreChange) => {
      const entry = entryFor(sessionId);
      entry.listeners.add(onStoreChange);
      return () => entry.listeners.delete(onStoreChange);
    },
    () => entryFor(sessionId).snapshot,
  );
}

/** A surface's processor registers itself so the session-level data-model collector can see it. */
export function registerA2uiSurfaceProcessor(
  sessionId: string,
  surfaceId: string,
  processor: MessageProcessor<ReactComponentImplementation>,
): void {
  entryFor(sessionId).processors.set(surfaceId, processor);
}

export function unregisterA2uiSurfaceProcessor(sessionId: string, surfaceId: string): void {
  sessions.get(sessionId)?.processors.delete(surfaceId);
}

/**
 * `a2uiClientDataModel`'s `surfaces` map (S6 item 3): every registered
 * processor's `getClientDataModel()` for a `sendDataModel` surface, merged.
 * Queried fresh on every call — never cached — so it always reflects
 * whichever surfaces are live right now.
 */
export function collectA2uiClientDataModelSurfaces(sessionId: string): Record<string, unknown> {
  const entry = sessions.get(sessionId);
  if (!entry) return {};
  const surfaces: Record<string, unknown> = {};
  for (const processor of entry.processors.values()) {
    const model = processor.getClientDataModel(A2UI_CLIENT_DATA_MODEL_VERSION);
    if (model) Object.assign(surfaces, model.surfaces);
  }
  return surfaces;
}
