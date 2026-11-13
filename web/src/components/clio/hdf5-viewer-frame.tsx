import {
  HDF5_PALETTE_KEYS,
  HDF5_VIEWER_PROTOCOL,
  HOST_SOURCE,
  isViewerMessage,
  type Hdf5Mode,
  type Hdf5Palette,
  type Hdf5ViewMemory,
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
import { readThemeColor, useThemeKey } from '@/theme/runtime';
import type { ColorToken } from '@/theme/contract';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { HDF5_LOCATOR_SEPARATOR } from './composer-hdf5-references';
import { useFileViewerContentsRegistry } from './file-viewer-action-context';
import { useFileViewerFacts } from './file-viewer-facts';
import { entityFacts, valuesAsTsv, type ViewerEntity } from './hdf5-viewer-facts';
import { currentViewerLocation } from './hdf5-viewer-location';
import { NamedTooltip } from './primitives/icon-button';
import { useFrameModes } from './primitives/frame-modes';
import { ResourceLoading } from './resource-states';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { ph, t } from '@lingui/core/macro';

/** Most files whose last selection is remembered. */
const REMEMBERED_FILES = 50;

/**
 * The last object selected in each open file, and the reader's view of it
 * (mode, tree, axes and slices), so that when the canvas remounts the viewer
 * (maximize, resize, moving tabs) it reopens there instead of at the file
 * root. `requested` is the `locator` prop in effect when it was selected: a
 * caller asking for a different object wins.
 */
const lastSelection = new Map<
  string,
  { requested?: string; selected: string; view?: Hdf5ViewMemory }
>();

function startOf(
  key: string,
  requested: string | undefined,
): { locator?: string; view?: Hdf5ViewMemory } {
  const last = lastSelection.get(key);
  if (!last || last.requested !== requested) return { locator: requested };
  return {
    locator: last.selected,
    view: last.view?.locator === last.selected ? last.view : undefined,
  };
}

function remember(
  key: string,
  requested: string | undefined,
  selected: string,
  view?: Hdf5ViewMemory,
) {
  const kept = lastSelection.get(key);
  lastSelection.delete(key);
  lastSelection.set(key, {
    requested,
    selected,
    view: view ?? (kept?.view?.locator === selected ? kept.view : undefined),
  });
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
  const themeName = useThemeKey();
  const theme = themeName.endsWith(':dark') ? 'dark' : 'light';
  // themeName is the dependency: the palette is read from the theme it names.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = useMemo(() => hostPalette(), [themeName]);
  const viewer = useMemo(() => currentViewerLocation(), []);
  const fileKey = `${workspaceId}\u0000${path}`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const initRef = useRef<InitState>({
    path,
    ...startOf(fileKey, locator),
    revision,
    theme,
    palette,
  });
  const selectionRef = useRef({ fileKey, locator });
  const [entity, setEntity] = useState<ViewerEntity>();
  const [view, setView] = useState<ViewerView>();
  // The viewer page boots blank; the frame's Loading state covers it until the
  // viewer first draws (or a read fails).
  const [settled, setSettled] = useState<string>();
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const origin = viewer.origin;
    const inFlight = new Map<number, AbortController>();
    let fallback: number | undefined;
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
          setSettled(undefined);
          // Never cover the page for good, e.g. if h5web shows its own error.
          window.clearTimeout(fallback);
          fallback = window.setTimeout(() => setSettled(selectionRef.current.fileKey), 8000);
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
              setSettled(selectionRef.current.fileKey);
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
          remember(selectionRef.current.fileKey, selectionRef.current.locator, message.locator);
          onSelectRef.current?.(message.locator);
          return;
        case 'view':
          remember(
            selectionRef.current.fileKey,
            selectionRef.current.locator,
            message.view.locator,
            message.view,
          );
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
          // h5web offers modes once its main area is drawn.
          if (message.modes.length) setSettled(selectionRef.current.fileKey);
          setView({ modes: message.modes, mode: message.mode, explorer: message.explorer });
          return;
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(fallback);
      for (const controller of inFlight.values()) controller.abort();
    };
  }, [repository, workspaceId, viewer.origin]);

  useEffect(() => {
    selectionRef.current = { fileKey, locator };
    initRef.current = { path, ...startOf(fileKey, locator), revision, theme, palette };
    const target = iframeRef.current?.contentWindow;
    if (!target || !readyRef.current) return;
    target.postMessage(initMessage(initRef.current), viewer.origin);
  }, [fileKey, path, locator, revision, theme, palette, viewer.origin]);

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
      <div className="relative size-full">
        <iframe
          className="block size-full min-h-[32rem] border-0 bg-background"
          data-hdf5-viewer={path}
          ref={iframeRef}
          src={viewer.src}
          title={t`HDF5 viewer: ${path}`}
        />
        {settled === fileKey ? null : (
          <ResourceLoading
            className="absolute inset-0 bg-background"
            label={t`Loading ${ph({ name: path.split('/').at(-1) ?? path })}`}
          />
        )}
      </div>
    </>
  );
}

type ViewerView = Omit<Extract<ViewerMessage, { type: 'modes' }>, 'source' | 'type'>;

const MODES: Record<Hdf5Mode, { label: string; icon: LucideIcon }> = {
  table: { label: t`Table`, icon: TableIcon },
  plot: { label: t`Plot`, icon: ChartLineIcon },
  image: { label: t`Image`, icon: ImageIcon },
  attributes: { label: t`Attributes`, icon: TagsIcon },
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
          label: t`Show as`,
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
            aria-label={t`Show as`}
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
          label={t`Explorer`}
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

type InitState = {
  path: string;
  locator?: string;
  view?: Hdf5ViewMemory;
  revision: number;
  theme?: 'light' | 'dark';
  palette?: Hdf5Palette;
};

const PALETTE_TOKENS: Record<keyof Hdf5Palette, ColorToken> = {
  background: 'background',
  foreground: 'foreground',
  muted: 'muted-foreground',
  border: 'border',
  hover: 'hover',
  selected: 'menu-highlight',
  accent: 'primary',
};

/** The active theme's colors for the viewer, or none if one is not a solid `#rrggbb`. */
function hostPalette(): Hdf5Palette | undefined {
  const palette = {} as Hdf5Palette;
  for (const key of HDF5_PALETTE_KEYS) {
    const color = readThemeColor(PALETTE_TOKENS[key]);
    if (!/^#[0-9a-f]{6}$/iu.test(color)) return undefined;
    palette[key] = color;
  }
  return palette;
}

function initMessage(init: InitState): HostMessage {
  return {
    source: HOST_SOURCE,
    type: 'init',
    protocol: HDF5_VIEWER_PROTOCOL,
    filepath: init.path,
    locator: init.locator,
    view: init.view,
    revision: init.revision,
    theme: init.theme,
    palette: init.palette,
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
