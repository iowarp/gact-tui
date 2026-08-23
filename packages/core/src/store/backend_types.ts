import type { Capabilities } from '../wire/types.js';

export type BackendKind = 'local-sidecar' | 'http' | 'ssh-tunnel';

export interface BackendEntry {
  id: string;
  /** Human-readable label shown in the picker chip. */
  label: string;
  url: string;
  bearerToken: string;
  kind: BackendKind;
  /**
   * Last observed /v1/capabilities payload, if any. Used for capability
   * gating in the UI; refreshed each time the user selects the backend.
   */
  capabilities?: Capabilities;
  /** Last error message from a failed health probe. */
  lastError?: string;
  /** SSH-specific config — only populated when kind === 'ssh-tunnel'. */
  ssh?: {
    host: string;
    user: string;
    keyPath: string;
    /** Local tunneled port (kept here so the same tunnel can be reopened). */
    localPort?: number;
  };
}

export interface BackendRegistryState {
  /** Stable ordering — first entry is the auto-selected default. */
  backends: BackendEntry[];
  /** Currently selected backend id, or null when none has been chosen. */
  currentId: string | null;
}

export interface Persistence {
  load(): Promise<BackendRegistryState>;
  save(state: BackendRegistryState): Promise<void>;
}

export const EMPTY_REGISTRY: BackendRegistryState = {
  backends: [],
  currentId: null,
};
