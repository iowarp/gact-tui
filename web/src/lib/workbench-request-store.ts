import { useSyncExternalStore } from 'react';
import type { ClioWorkbenchOpenRequest } from '@/components/clio/workbench-open-request';

export interface WorkbenchRequest {
  endpoint?: string;
  key: string;
  request: ClioWorkbenchOpenRequest;
  /** The route the request was made on; a page that stays mounted ignores it elsewhere. */
  route?: string;
}

/**
 * A canvas open request that only its readers subscribe to. Revealing a tab
 * then re-renders the shell and the workbench, not the whole page around them.
 */
export interface WorkbenchRequestSource {
  subscribe: (listener: () => void) => () => void;
  get: () => WorkbenchRequest | undefined;
}

export interface WorkbenchRequestStore extends WorkbenchRequestSource {
  set: (request: WorkbenchRequest) => void;
  /** Drops a request made on another route, so returning there does not replay it. */
  clearUnless: (route: string) => void;
}

export function createWorkbenchRequestStore(): WorkbenchRequestStore {
  let current: WorkbenchRequest | undefined;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (request) => {
      current = request;
      for (const listener of listeners) listener();
    },
    clearUnless: (route) => {
      if (!current || current.route === undefined || current.route === route) return;
      current = undefined;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const NO_REQUESTS: WorkbenchRequestSource = { subscribe: () => () => {}, get: () => undefined };

export function useWorkbenchRequest(source?: WorkbenchRequestSource): WorkbenchRequest | undefined {
  const { subscribe, get } = source ?? NO_REQUESTS;
  return useSyncExternalStore(subscribe, get, get);
}
