import {
  HDF5_VIEWER_PROTOCOL,
  HOST_SOURCE,
  isViewerMessage,
  type HostMessage,
} from '@clio/hdf5-viewer/protocol';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { useRepository } from '@/hooks/use-repository';

/** The h5web viewer page, built from packages/hdf5-viewer and served by the web app. */
export const HDF5_VIEWER_URL = '/hdf5-viewer/index.html';

/**
 * HDF5 file viewer: h5web in an iframe, because h5web needs React 18.
 *
 * The iframe has no network access of its own. It sends each h5grove request
 * here, and this component answers it through the repository's transport, so
 * the same authenticated path serves the browser and the desktop app. The
 * file is fixed by `path`; the iframe cannot name another one.
 */
export function Hdf5ViewerFrame({
  workspaceId,
  path,
  locator,
  revision = 0,
  onSelect,
}: {
  workspaceId: string;
  path: string;
  /** Object to open first, for example `/entry/data`. */
  locator?: string;
  /** Change to make the viewer drop cached reads, e.g. after the file is rewritten. */
  revision?: number;
  onSelect?: (locator: string) => void;
}) {
  const repository = useRepository();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? 'dark' : resolvedTheme === 'light' ? 'light' : undefined;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const initRef = useRef<InitState>({ path, locator, revision, theme });
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return undefined;
    const origin = window.location.origin;
    const inFlight = new Map<number, AbortController>();
    const post = (message: HostMessage, transfer: Transferable[] = []) =>
      target.postMessage(message, origin, transfer);

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== target || event.origin !== origin) return;
      if (!isViewerMessage(event.data)) return;
      const message = event.data;
      switch (message.type) {
        case 'ready':
          readyRef.current = true;
          post(initMessage(initRef.current));
          return;
        case 'fetch': {
          const controller = new AbortController();
          inFlight.set(message.id, controller);
          const params = { ...message.params, file: initRef.current.path };
          repository
            .readWorkspaceHdf5(workspaceId, message.endpoint, params, controller.signal)
            .then((bytes) => {
              const body = ownBuffer(bytes);
              post({ source: HOST_SOURCE, type: 'response', id: message.id, ok: true, body }, [
                body,
              ]);
            })
            .catch((error: unknown) => {
              if (controller.signal.aborted) return;
              post({
                source: HOST_SOURCE,
                type: 'response',
                id: message.id,
                ok: false,
                status: statusOf(error),
                message: error instanceof Error ? error.message : String(error),
              });
            })
            .finally(() => inFlight.delete(message.id));
          return;
        }
        case 'abort':
          inFlight.get(message.id)?.abort();
          inFlight.delete(message.id);
          return;
        case 'select':
          onSelectRef.current?.(message.locator);
          return;
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      for (const controller of inFlight.values()) controller.abort();
    };
  }, [repository, workspaceId]);

  useEffect(() => {
    initRef.current = { path, locator, revision, theme };
    const target = iframeRef.current?.contentWindow;
    if (!target || !readyRef.current) return;
    target.postMessage(initMessage(initRef.current), window.location.origin);
  }, [path, locator, revision, theme]);

  return (
    // No sandbox: the page is first-party and same-origin, so sandbox flags
    // would not isolate it, and h5web's exports need downloads.
    <iframe
      className="block size-full min-h-[32rem] border-0 bg-background"
      data-hdf5-viewer={path}
      ref={iframeRef}
      src={HDF5_VIEWER_URL}
      title={`HDF5 viewer: ${path}`}
    />
  );
}

type InitState = { path: string; locator?: string; revision: number; theme?: 'light' | 'dark' };

function initMessage(init: InitState): HostMessage {
  return {
    source: HOST_SOURCE,
    type: 'init',
    protocol: HDF5_VIEWER_PROTOCOL,
    filepath: init.path,
    locator: init.locator,
    revision: init.revision,
    theme: init.theme,
  };
}

/** A standalone ArrayBuffer holding exactly `bytes`, safe to transfer. */
function ownBuffer(bytes: Uint8Array): ArrayBuffer {
  const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  return (whole ? bytes.buffer : bytes.slice().buffer) as ArrayBuffer;
}

function statusOf(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const { status } = error as { status?: unknown };
    if (typeof status === 'number') return status;
  }
  return 0;
}
