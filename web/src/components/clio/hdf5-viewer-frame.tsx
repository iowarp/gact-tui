import {
  HDF5_VIEWER_PROTOCOL,
  HOST_SOURCE,
  isViewerMessage,
  type Hdf5Mode,
  type HostMessage,
  type ViewerMessage,
} from '@clio/hdf5-viewer/protocol';
import {
  ChartLineIcon,
  ImageIcon,
  PanelLeftIcon,
  TableIcon,
  TagsIcon,
  type LucideIcon,
} from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useThemeKey } from '@/theme/runtime';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { HDF5_LOCATOR_SEPARATOR } from './composer-hdf5-references';
import { useFileViewerContentsRegistry } from './file-viewer-action-context';
import { useFileViewerFacts } from './file-viewer-facts';
import { entityFacts, valuesAsTsv, type ViewerEntity } from './hdf5-viewer-facts';
import { currentViewerLocation, HDF5_VIEWER_PATH } from './hdf5-viewer-location';
import { NamedTooltip } from './primitives/icon-button';
import { useFrameModes } from './primitives/frame-modes';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';

/** The h5web viewer page, built from packages/hdf5-viewer and served by the web app. */
export const HDF5_VIEWER_URL = `/${HDF5_VIEWER_PATH}`;

/** Most files whose last selection is remembered. */
const REMEMBERED_FILES = 50;

/**
 * The last object selected in each open file, so that when the canvas
 * remounts the viewer (maximize, resize, moving tabs) it reopens there
 * instead of at the file root. `requested` is the `locator` prop in effect
 * when it was selected: a caller asking for a different object wins.
 */
const lastSelection = new Map<string, { requested?: string; selected: string }>();

function startLocator(key: string, requested: string | undefined): string | undefined {
  const last = lastSelection.get(key);
  return last && last.requested === requested ? last.selected : requested;
}

function rememberSelection(key: string, requested: string | undefined, selected: string) {
  lastSelection.delete(key);
  lastSelection.set(key, { requested, selected });
  if (lastSelection.size > REMEMBERED_FILES) {
    const oldest = lastSelection.keys().next().value;
    if (oldest !== undefined) lastSelection.delete(oldest);
  }
}

/**
 * HDF5 file viewer: h5web in an iframe, because h5web needs React 18.
 *
 * The iframe has no network access of its own. It sends each h5grove request
 * here, and this component answers it through the repository's transport, so
 * the same authenticated path serves the browser and the desktop app. The
 * file is fixed by `path`; the iframe cannot name another one.
 *
 * In the packaged desktop app the page comes from its own origin, whose CSP
 * allows what h5web needs and the app's does not (see hdf5-viewer-location).
 * Messages go to, and are only accepted from, that exact origin.
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
  // The viewer takes light or dark; a named theme (e.g. Notebook) maps to its variant.
  const theme = useThemeKey().endsWith(':dark') ? 'dark' : 'light';
  const viewer = useMemo(() => currentViewerLocation(), []);
  const fileKey = `${workspaceId}\u0000${path}`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const initRef = useRef<InitState>({
    path,
    locator: startLocator(fileKey, locator),
    revision,
    theme,
  });
  const selectionRef = useRef({ fileKey, locator });
  const [entity, setEntity] = useState<ViewerEntity>();
  const [view, setView] = useState<ViewerView>();
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const origin = viewer.origin;
    const inFlight = new Map<number, AbortController>();
    // Read the frame's window on every use: moving the iframe in the page
    // (the canvas does, on maximize and restore) reloads it as a new window
    // without remounting this component.
    const post = (message: HostMessage, transfer: Transferable[] = []) =>
      iframeRef.current?.contentWindow?.postMessage(message, origin, transfer);

    const onMessage = (event: MessageEvent<unknown>) => {
      const target = iframeRef.current?.contentWindow;
      if (!target || event.source !== target || event.origin !== origin) return;
      if (!isViewerMessage(event.data)) return;
      const message = event.data;
      switch (message.type) {
        case 'ready':
          // A fresh viewer document: requests from an earlier one would
          // reuse its message ids, so drop them.
          for (const controller of inFlight.values()) controller.abort();
          inFlight.clear();
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
          rememberSelection(
            selectionRef.current.fileKey,
            selectionRef.current.locator,
            message.locator,
          );
          onSelectRef.current?.(message.locator);
          return;
        case 'entity':
          setEntity({
            locator: message.locator,
            kind: message.kind,
            shape: message.shape,
            dtype: message.dtype,
          });
          return;
        case 'modes':
          setView({ modes: message.modes, mode: message.mode, explorer: message.explorer });
          return;
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      for (const controller of inFlight.values()) controller.abort();
    };
  }, [repository, workspaceId, viewer.origin]);

  useEffect(() => {
    selectionRef.current = { fileKey, locator };
    initRef.current = { path, locator: startLocator(fileKey, locator), revision, theme };
    const target = iframeRef.current?.contentWindow;
    if (!target || !readyRef.current) return;
    target.postMessage(initMessage(initRef.current), viewer.origin);
  }, [fileKey, path, locator, revision, theme, viewer.origin]);

  const show = useCallback(
    (request: { mode?: Hdf5Mode; explorer?: boolean }) => {
      const message: HostMessage = { source: HOST_SOURCE, type: 'show', ...request };
      iframeRef.current?.contentWindow?.postMessage(message, viewer.origin);
      setView((current) => current && { ...current, ...request });
    },
    [viewer.origin],
  );

  useFileViewerFacts(entityFacts(entity));
  const registerContents = useFileViewerContentsRegistry();
  const contentsId = useId();
  const readContents = useCallback(async () => {
    if (!entity) return path;
    const reference = `${path}${HDF5_LOCATOR_SEPARATOR}${entity.locator}`;
    if (!copiesValues(entity)) return reference;
    try {
      const bytes = await repository.readWorkspaceHdf5(workspaceId, 'data', {
        file: path,
        path: entity.locator,
        format: 'json',
      });
      return valuesAsTsv(JSON.parse(new TextDecoder().decode(bytes))) ?? reference;
    } catch {
      return reference;
    }
  }, [entity, path, repository, workspaceId]);
  useEffect(() => {
    registerContents?.(contentsId, readContents);
    return () => registerContents?.(contentsId);
  }, [registerContents, contentsId, readContents]);

  return (
    <>
      {view ? <Hdf5Modes view={view} onShow={show} /> : null}
      {/* No sandbox: the page is first-party, and h5web's exports need
          downloads. Isolation comes from the separate origin on desktop. */}
      <iframe
        className="block size-full min-h-[32rem] border-0 bg-background"
        data-hdf5-viewer={path}
        ref={iframeRef}
        src={viewer.src}
        title={`HDF5 viewer: ${path}`}
      />
    </>
  );
}

type ViewerView = Omit<Extract<ViewerMessage, { type: 'modes' }>, 'source' | 'type'>;

const MODES: Record<Hdf5Mode, { label: string; icon: LucideIcon }> = {
  table: { label: 'Table', icon: TableIcon },
  plot: { label: 'Plot', icon: ChartLineIcon },
  image: { label: 'Image', icon: ImageIcon },
  attributes: { label: 'Attributes', icon: TagsIcon },
};

// FileModeControls' segmented look; these modes live in the viewer page, not in shell tabs.
// They leave the bar for the … menu with the file's own modes.
const MODES_CLASS =
  'inline-flex h-7 shrink-0 gap-px rounded-[7px] border border-input bg-transparent p-[2px] [[data-fold-modes-menu]:has([data-frame-modes-menu])_&]:hidden';
const MODE_CLASS =
  'inline-flex h-[22px] w-[26px] items-center justify-center rounded-[5px] text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-menu-highlight aria-pressed:text-foreground [&_svg]:size-3.5';

/**
 * The open object's modes as the frame's segmented Format icons, and the
 * object tree's toggle. Choosing Attributes again returns to the display.
 */
function Hdf5Modes({
  view,
  onShow,
}: {
  view: ViewerView;
  onShow: (request: { mode?: Hdf5Mode; explorer?: boolean }) => void;
}) {
  const display = view.modes.find((mode) => mode !== 'attributes');
  const group = useRef<HTMLDivElement>(null);
  const modes = useMemo(
    () => view.modes.map((mode) => ({ value: mode, ...MODES[mode] })),
    [view.modes],
  );
  // Narrowest, the modes are a checked list in the frame's … menu (workbench-lineage step 6).
  useFrameModes(
    group,
    view.modes.length
      ? {
          label: 'Show as',
          modes,
          value: view.mode ?? '',
          onChange: (mode) => onShow({ mode: mode as Hdf5Mode }),
        }
      : null,
  );
  return (
    <ViewerToolbarContent>
      <TooltipProvider delayDuration={200}>
        {view.modes.length ? (
          <div
            aria-label="Show as"
            className={MODES_CLASS}
            data-slot="viewer-modes"
            ref={group}
            role="group"
          >
            {view.modes.map((mode) => {
              const { label, icon: Icon } = MODES[mode];
              const pressed = view.mode === mode;
              return (
                <NamedTooltip key={mode} label={label}>
                  <button
                    aria-label={label}
                    aria-pressed={pressed}
                    className={MODE_CLASS}
                    type="button"
                    onClick={() => {
                      if (!pressed) onShow({ mode });
                      else if (mode === 'attributes' && display) onShow({ mode: display });
                    }}
                  >
                    <Icon aria-hidden="true" />
                  </button>
                </NamedTooltip>
              );
            })}
          </div>
        ) : null}
        <ToolbarAction
          aria-pressed={view.explorer}
          label="Explorer"
          onClick={() => onShow({ explorer: !view.explorer })}
        >
          <PanelLeftIcon aria-hidden="true" />
        </ToolbarAction>
      </TooltipProvider>
    </ViewerToolbarContent>
  );
}

/** Most values Copy reads to give them as a table; larger datasets copy their reference. */
const MAX_COPIED_VALUES = 250_000;

function copiesValues(entity: ViewerEntity): boolean {
  if (entity.kind !== 'dataset' || !entity.shape || entity.shape.length > 2) return false;
  if (entity.dtype === 'compound' || entity.dtype === 'string') return false;
  return entity.shape.reduce((count, dim) => count * dim, 1) <= MAX_COPIED_VALUES;
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
