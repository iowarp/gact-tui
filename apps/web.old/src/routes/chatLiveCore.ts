/**
 * Core live-driven chat state contract: bundles the live transcript/session
 * handles consumed by the ChatLayout live controller.
 */
import { brand } from '@brand';
import type { BackendHandle } from '../App.js';
import type { TranscriptDensity } from '../components/Transcript.js';
import { useToast } from '../components/Toast.js';
import { createLiveSessions } from '../live.js';
import { createPersistedSignal, createPersistedString } from '../persisted.js';
import { createChatRenameFlash } from './chatLiveRuntimeState.js';
import { createChatToasts, type FailToast } from './chatToasts.js';

/**
 * The foundational primitives every chat sub-factory shares: the live session
 * resource + client, the persisted active-session id and transcript density,
 * the toast surface (raw push + the {@link FailToast} error helper) and the
 * rename-flash highlight. Building these once and threading the result through
 * the concern-specific sub-factories keeps their wiring free of duplicated
 * `live.client` / `toast.push` plumbing.
 */
export interface ChatLiveCore {
  backendUrl: string;
  brandName: string;
  live: ReturnType<typeof createLiveSessions>;
  activeId: ReturnType<typeof createPersistedString>[0];
  setActiveId: ReturnType<typeof createPersistedString>[1];
  density: ReturnType<typeof createPersistedSignal<TranscriptDensity>>[0];
  setDensity: ReturnType<typeof createPersistedSignal<TranscriptDensity>>[1];
  toastPush: ReturnType<typeof useToast>['push'];
  failToast: FailToast;
  renameFlash: ReturnType<typeof createChatRenameFlash>;
}

/**
 * Assemble the {@link ChatLiveCore} for a backend handle. Pure composition of
 * the primitive factories — no behaviour beyond what they already provide.
 */
export function createChatLiveCore(backend: BackendHandle): ChatLiveCore {
  const live = createLiveSessions({
    url: backend.url,
    bearerToken: backend.bearerToken,
  });

  const [activeId, setActiveId] = createPersistedString(
    `clio.active-session.${backend.url}`,
    '',
  );
  const [density, setDensity] = createPersistedSignal<TranscriptDensity>(
    'clio.density.v1',
    'normal',
    {
      parse: (s) => (s === 'verbose' || s === 'summary' ? (s as TranscriptDensity) : 'normal'),
      stringify: (v) => v,
    },
  );

  const toast = useToast();
  const { failToast } = createChatToasts(toast.push);
  const renameFlash = createChatRenameFlash();

  return {
    backendUrl: backend.url,
    brandName: brand.name,
    live,
    activeId,
    setActiveId,
    density,
    setDensity,
    toastPush: toast.push,
    failToast,
    renameFlash,
  };
}
