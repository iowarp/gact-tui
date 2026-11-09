import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { GitBranchIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OverlayContainer } from '@/components/ui/overlay-container';
import { formatBytes } from '@/lib/format';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { FrameCommentsUnavailable } from './comments/frame-comments';
import { FrameCommentsSlot } from './comments/frame-comments-slot';
import { FileModeTrigger, FoldedFileModes, MODE_SEGMENT_CLASS } from './file-mode-controls';
import {
  FileViewerModeSlotContext,
  isSourceMode,
  type FileViewerModeSlot,
  type RendererModes,
} from './file-viewer-modes';
import { FileViewerActions } from './file-viewer-actions';
import {
  FileViewerActionRegistry,
  FileViewerContentsRegistry,
  type FileViewerAction,
  type FileViewerContentsReader,
} from './file-viewer-action-context';
import { FileSourceOptions, FileViewerInformationHost } from './file-viewer-context';
import { FileViewerFactsRegistry } from './file-viewer-facts';
import { fileViewerReference } from './file-viewer-location';
import { fileViewerIdentity, type FileViewerSource } from './file-viewer-source';
import { useAddToMessage, useFileViewerCrumbs } from './file-viewer-take-hooks';
import { FileTypeIcon } from './file-type-icon';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { ViewerToolbarHost } from './viewer-toolbar-context';

export interface FileViewerTab {
  value: string;
  label: string;
  title?: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  content: ReactNode;
  /** Secondary inspection views live in the shared More menu. */
  secondary?: boolean;
  /** Catalog id of the key that selects it. */
  shortcut?: string;
}

/** The frame's own view of a file's recorded history. */
export const LINEAGE_VIEW = 'lineage';
/** Folded-menu values of the renderer's modes, apart from the frame's views. */
const RENDERER_MODE = 'renderer:';

/** Keeps one entry per registering renderer, unchanged when the contents are the same. */
function useRegistry<T>(same: (left: T, right: T) => boolean) {
  const [entries, setEntries] = useState<ReadonlyMap<string, T>>(new Map());
  const register = useCallback(
    (id: string, value?: T) =>
      setEntries((current) => {
        const previous = current.get(id);
        if (previous === value) return current;
        if (previous !== undefined && value !== undefined && same(previous, value)) return current;
        const next = new Map(current);
        if (value === undefined) next.delete(id);
        else next.set(id, value);
        return next;
      }),
    [same],
  );
  return [entries, register] as const;
}

const sameFacts = (left: readonly string[], right: readonly string[]) =>
  left.join('\u0000') === right.join('\u0000');
const sameReader = (left: FileViewerContentsReader, right: FileViewerContentsReader) =>
  left === right;
const sameActions = (left: readonly FileViewerAction[], right: readonly FileViewerAction[]) =>
  left === right;
const sameModes = (left: RendererModes, right: RendererModes) => left === right;

/** Where the comments go and whether anything claimed the place. */
function useCommentsSlot() {
  const [host, setHost] = useState<HTMLSpanElement | null>(null);
  const [claims, setClaims] = useState(0);
  const claim = useCallback(() => {
    setClaims((count) => count + 1);
    return () => setClaims((count) => count - 1);
  }, []);
  const slot = useMemo(() => ({ host, claim }), [host, claim]);
  return { slot, setHost, claimed: claims > 0 };
}

/**
 * One frame bar and action vocabulary on every file: Where (crumbs), What
 * (size and the renderer's facts), Format (modes and renderer controls), Talk
 * (@ and Comments) and Take (Copy ▾, Open ▾, …). Renderers only contribute
 * their content, controls, facts and contents.
 */
export function FileViewerShell({
  source,
  tabs,
  label = 'File views',
  value,
  onValueChange,
  hasDocumentActions = false,
  showIdentity = true,
  lineage,
}: {
  source: FileViewerSource;
  tabs: readonly FileViewerTab[];
  label?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  hasDocumentActions?: boolean;
  /** An enclosing file card already presents the icon and filename. */
  showIdentity?: boolean;
  /** The file's recorded history: the frame adds Lineage beside the renderer's modes. */
  lineage?: ReactNode;
}) {
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const [wrap, setWrap] = useState(false);
  const sourceOptions = useMemo(() => ({ wrap, setWrap }), [wrap]);
  const [internalValue, setInternalValue] = useState('preview');
  const requested = value ?? internalValue;
  const selectValue = useCallback(
    (next: string) => {
      setInternalValue(next);
      onValueChange?.(next);
    },
    [onValueChange],
  );
  const allTabs: readonly FileViewerTab[] = lineage
    ? [
        ...tabs,
        {
          value: LINEAGE_VIEW,
          label: 'Lineage',
          icon: GitBranchIcon,
          shortcut: 'lineage',
          content: lineage,
        },
      ]
    : tabs;
  const primaryTabs = allTabs.filter((tab) => !tab.secondary);
  const selectedValue = allTabs.some((tab) => tab.value === requested)
    ? requested
    : (primaryTabs[0]?.value ?? requested);
  const hostTab = primaryTabs[0];
  const identity = fileViewerIdentity(source);
  // The selection menu quotes a passage with its file: the workspace path, else the name.
  const selectionPath =
    source.kind === 'workspace'
      ? source.path
      : (source.kind === 'artifact' && source.verifiedWorkspacePath) || identity.name;
  const selectionSurface = {
    'data-selection-surface': 'file',
    'data-file-path': selectionPath,
    'data-file-name': identity.name,
    'data-workspace-id': source.workspaceId,
  };
  const [informationHost, setInformationHost] = useState<HTMLDivElement | null>(null);
  const [formatActions, registerActions] = useRegistry(sameActions);
  const [facts, registerFacts] = useRegistry(sameFacts);
  const [lineageFacts, registerLineageFacts] = useRegistry(sameFacts);
  const [readers, registerReader] = useRegistry(sameReader);
  const [rendererEntries, registerModes] = useRegistry(sameModes);
  const [modeHost, setModeHost] = useState<HTMLSpanElement | null>(null);
  const renderer = [...rendererEntries.values()].at(-1);
  const frameActive = selectedValue !== hostTab?.value;
  const hostValue = hostTab?.value;
  const showRenderer = () => {
    if (hostValue !== undefined) selectValue(hostValue);
  };
  const modeSlot: FileViewerModeSlot = {
    host: modeHost,
    register: registerModes,
    frameActive,
    showRenderer,
  };
  // The renderer's own modes stand in for the frame's first view.
  const frameModes = primaryTabs.filter((tab) => !(renderer && tab === hostTab));
  const segmentCount = (renderer?.modes.length ?? 0) + frameModes.length;
  const foldedModes = [
    ...(renderer?.modes ?? []).map((mode) => ({ ...mode, value: `${RENDERER_MODE}${mode.value}` })),
    ...frameModes,
  ];
  const foldedValue =
    renderer && !frameActive ? `${RENDERER_MODE}${renderer.value}` : selectedValue;
  const chooseFolded = (next: string) => {
    if (renderer && next.startsWith(RENDERER_MODE)) {
      renderer.onChange(next.slice(RENDERER_MODE.length));
      showRenderer();
    } else selectValue(next);
  };
  const sourceMode = renderer?.modes.find(isSourceMode);
  const hostRef = useRef<HTMLDivElement>(null);
  useShortcut(
    'render-source',
    () => {
      if (!renderer || !sourceMode) return;
      if (frameActive || renderer.value !== sourceMode.value) {
        renderer.onChange(sourceMode.value);
        showRenderer();
        return;
      }
      const rendered = renderer.modes.find((mode) => !isSourceMode(mode));
      if (rendered) renderer.onChange(rendered.value);
    },
    { enabled: Boolean(sourceMode), region: hostRef },
  );
  useShortcut(
    'lineage',
    () => {
      if (selectedValue === LINEAGE_VIEW) showRenderer();
      else selectValue(LINEAGE_VIEW);
    },
    { enabled: Boolean(lineage), region: hostRef },
  );
  const {
    slot: commentsSlot,
    setHost: setCommentsHost,
    claimed: commentsClaimed,
  } = useCommentsSlot();
  const crumbs = useFileViewerCrumbs(source);
  const [fullscreenHost, setFullscreenHost] = useState<HTMLElement>();
  const fullscreen = Boolean(fullscreenHost);
  const addToMessage = useAddToMessage(fileViewerReference(source), source.workspaceId, hostRef);
  useEffect(() => {
    const update = () =>
      setFullscreenHost(
        document.fullscreenElement === hostRef.current ? (hostRef.current ?? undefined) : undefined,
      );
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (fullscreen) await document.exitFullscreen();
      else await hostRef.current?.requestFullscreen();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open fullscreen.');
    }
  };
  const rendererFacts =
    selectedValue === LINEAGE_VIEW ? [...lineageFacts.values()].flat() : [...facts.values()].flat();
  // Each mode states its own fact, as the frame spec does: Render what the renderer
  // draws (rows, pages), Source the bytes, Lineage the version and its graph.
  const size = identity.size === undefined ? [] : [formatBytes(identity.size)];
  const showingSource = frameActive
    ? isSourceMode({ value: selectedValue })
    : sourceMode !== undefined && renderer?.value === sourceMode.value;
  const positioned = selectedValue === LINEAGE_VIEW || (!showingSource && rendererFacts.length > 0);
  // A view with no mode segment (one representation) states its facts and its size.
  const what = !positioned ? size : segmentCount < 2 ? [...rendererFacts, ...size] : rendererFacts;
  const contents = [...readers.values()].at(-1);
  return (
    <ViewerToolbarHost.Provider value={toolbarHost}>
      <FileSourceOptions.Provider value={sourceOptions}>
        <FileViewerInformationHost.Provider value={informationHost}>
          <OverlayContainer.Provider value={fullscreenHost}>
            <FileViewerActionRegistry.Provider value={registerActions}>
              <FileViewerFactsRegistry.Provider value={registerFacts}>
                <FileViewerContentsRegistry.Provider value={registerReader}>
                  <FrameCommentsSlot.Provider value={commentsSlot}>
                    <FileViewerModeSlotContext.Provider value={modeSlot}>
                      <div
                        ref={hostRef}
                        data-slot="file-viewer"
                        className="@container/viewer flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
                      >
                        <TooltipProvider delayDuration={200}>
                          <Tabs
                            className="h-full min-h-0 min-w-0 gap-0 overflow-hidden"
                            value={selectedValue}
                            onValueChange={selectValue}
                          >
                            <FrameBar
                              label="File"
                              className="bg-background"
                              where={
                                showIdentity ? (
                                  <span
                                    className="flex min-w-0 items-center gap-1.5"
                                    data-slot="viewer-identity"
                                  >
                                    <FileTypeIcon
                                      name={identity.name}
                                      mediaType={identity.mediaType}
                                      className="size-4 shrink-0"
                                    />
                                    <FrameCrumbs parts={crumbs} />
                                  </span>
                                ) : (
                                  <span className="flex-1" />
                                )
                              }
                              what={what.map((fact, index) => (
                                <span
                                  key={`${index}:${fact}`}
                                  className="tabular-nums"
                                  // The renderer's first fact says where you are; it outlasts the rest.
                                  data-frame-position={index === 0 && positioned ? '' : undefined}
                                >
                                  {fact}
                                </span>
                              ))}
                              format={
                                <>
                                  <div
                                    data-slot="viewer-modes"
                                    hidden={segmentCount < 2}
                                    className={cn(
                                      MODE_SEGMENT_CLASS,
                                      'group-data-[fold-modes]/frame:hidden',
                                      segmentCount < 2 && 'hidden',
                                    )}
                                  >
                                    <span
                                      ref={setModeHost}
                                      className="contents"
                                      data-slot="renderer-mode-host"
                                    />
                                    {frameModes.length ? (
                                      <TabsList
                                        aria-label={label}
                                        className="inline-flex h-auto gap-px rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto"
                                      >
                                        {frameModes.map((tab) => (
                                          <FileModeTrigger key={tab.value} mode={tab} />
                                        ))}
                                      </TabsList>
                                    ) : null}
                                  </div>
                                  {segmentCount > 1 ? (
                                    <FoldedFileModes
                                      modes={foldedModes}
                                      value={foldedValue}
                                      onChange={chooseFolded}
                                      label={label}
                                    />
                                  ) : null}
                                  <div
                                    className="flex shrink-0 items-center gap-0.5 empty:hidden"
                                    data-slot="frame-format-host"
                                    ref={setToolbarHost}
                                  />
                                </>
                              }
                              actions={
                                <FileViewerActions
                                  source={source}
                                  hasDocumentActions={hasDocumentActions}
                                  contents={contents}
                                  addToMessage={addToMessage}
                                  comments={
                                    <>
                                      <span
                                        ref={setCommentsHost}
                                        className="contents"
                                        data-slot="frame-comments"
                                      />
                                      {commentsClaimed ? null : (
                                        <FrameCommentsUnavailable reason="Not available for this format" />
                                      )}
                                    </>
                                  }
                                  formatActions={[
                                    ...allTabs
                                      .filter((tab) => tab.secondary)
                                      .map(
                                        (tab): FileViewerAction => ({
                                          kind: 'view',
                                          label: tab.label,
                                          description: tab.title,
                                          icon: tab.icon,
                                          selected: selectedValue === tab.value,
                                          onSelect: () => selectValue(tab.value),
                                        }),
                                      ),
                                    ...[...formatActions.values()].flat(),
                                  ]}
                                  fullscreen={fullscreen}
                                  onFullscreen={() => void toggleFullscreen()}
                                  onInformationHost={setInformationHost}
                                />
                              }
                            />
                            {!showIdentity && allTabs.length === 1 ? (
                              <div className="min-h-0 flex-1 overflow-hidden" {...selectionSurface}>
                                {tabs[0]?.content}
                              </div>
                            ) : (
                              allTabs.map((tab) => {
                                const isHost = tab === hostTab;
                                const isLineage = tab.value === LINEAGE_VIEW;
                                const named =
                                  tab.secondary ||
                                  segmentCount < 2 ||
                                  (isHost && renderer !== undefined);
                                const content = isLineage ? (
                                  <FileViewerFactsRegistry.Provider value={registerLineageFacts}>
                                    {tab.content}
                                  </FileViewerFactsRegistry.Provider>
                                ) : (
                                  tab.content
                                );
                                return (
                                  <TabsContent
                                    key={tab.value}
                                    className="m-0 min-h-0 overflow-hidden data-[state=inactive]:hidden"
                                    value={tab.value}
                                    {...(isLineage ? {} : selectionSurface)}
                                    // The renderer stays mounted so its modes and place survive Lineage.
                                    {...(isHost ? { forceMount: true as const } : {})}
                                    {...(named
                                      ? {
                                          'aria-label': tab.label,
                                          'aria-labelledby': undefined,
                                        }
                                      : {})}
                                  >
                                    {content}
                                  </TabsContent>
                                );
                              })
                            )}
                          </Tabs>
                        </TooltipProvider>
                      </div>
                    </FileViewerModeSlotContext.Provider>
                  </FrameCommentsSlot.Provider>
                </FileViewerContentsRegistry.Provider>
              </FileViewerFactsRegistry.Provider>
            </FileViewerActionRegistry.Provider>
          </OverlayContainer.Provider>
        </FileViewerInformationHost.Provider>
      </FileSourceOptions.Provider>
    </ViewerToolbarHost.Provider>
  );
}
