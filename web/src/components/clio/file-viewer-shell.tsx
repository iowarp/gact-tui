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
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OverlayContainer } from '@/components/ui/overlay-container';
import { formatBytes } from '@/lib/format';
import { FrameCommentsUnavailable } from './comments/frame-comments';
import { FrameCommentsSlot } from './comments/frame-comments-slot';
import { FileModeControls } from './file-mode-controls';
import { FileViewerActions } from './file-viewer-actions';
import {
  FileViewerActionRegistry,
  FileViewerContentsRegistry,
  type FileViewerAction,
  type FileViewerContentsReader,
} from './file-viewer-action-context';
import { FileSourceOptions, FileViewerInformationHost } from './file-viewer-context';
import {
  FileViewerFactsRegistry,
  FileViewerTitleRegistry,
  type FileViewerTitle,
} from './file-viewer-facts';
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
  /** Catalog id of the key that switches to this view (see `FileMode`). */
  shortcut?: string;
  content: ReactNode;
  /** Secondary inspection views live in the shared More menu. */
  secondary?: boolean;
}

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
}: {
  source: FileViewerSource;
  tabs: readonly FileViewerTab[];
  label?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  hasDocumentActions?: boolean;
  /** An enclosing file card already presents the icon and filename. */
  showIdentity?: boolean;
}) {
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const [wrap, setWrap] = useState(false);
  const sourceOptions = useMemo(() => ({ wrap, setWrap }), [wrap]);
  const [internalValue, setInternalValue] = useState('preview');
  const requested = value ?? internalValue;
  const selectValue = (next: string) => {
    setInternalValue(next);
    onValueChange?.(next);
  };
  const primaryTabs = tabs.filter((tab) => !tab.secondary);
  const selectedValue = tabs.some((tab) => tab.value === requested)
    ? requested
    : (primaryTabs[0]?.value ?? requested);
  const modes = primaryTabs.length > 1;
  const identity = fileViewerIdentity(source);
  // The selection menu quotes a passage with its file: the workspace path, else the name.
  const selectionPath =
    source.kind === 'workspace'
      ? source.path
      : (source.kind === 'artifact' && source.verifiedWorkspacePath) || identity.name;
  const [informationHost, setInformationHost] = useState<HTMLDivElement | null>(null);
  const [formatActions, registerActions] = useRegistry(sameActions);
  const [facts, registerFacts] = useRegistry(sameFacts);
  const [readers, registerReader] = useRegistry(sameReader);
  const {
    slot: commentsSlot,
    setHost: setCommentsHost,
    claimed: commentsClaimed,
  } = useCommentsSlot();
  const pathCrumbs = useFileViewerCrumbs(source);
  const [titled, setTitled] = useState<FileViewerTitle>();
  const crumbs = useMemo(
    () =>
      !titled
        ? pathCrumbs
        : pathCrumbs.length > 1
          ? [...pathCrumbs.slice(0, -1), { label: titled.title }]
          : [{ label: titled.collection }, { label: titled.title }],
    [pathCrumbs, titled],
  );
  const [fullscreenHost, setFullscreenHost] = useState<HTMLElement>();
  const fullscreen = Boolean(fullscreenHost);
  const hostRef = useRef<HTMLDivElement>(null);
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
  const rendererFacts = [...facts.values()].flat();
  const what = [
    ...rendererFacts,
    ...(identity.size === undefined ? [] : [formatBytes(identity.size)]),
  ];
  const contents = [...readers.values()].at(-1);
  return (
    <ViewerToolbarHost.Provider value={toolbarHost}>
      <FileSourceOptions.Provider value={sourceOptions}>
        <FileViewerInformationHost.Provider value={informationHost}>
          <OverlayContainer.Provider value={fullscreenHost}>
            <FileViewerActionRegistry.Provider value={registerActions}>
              <FileViewerFactsRegistry.Provider value={registerFacts}>
                <FileViewerTitleRegistry.Provider value={setTitled}>
                  <FileViewerContentsRegistry.Provider value={registerReader}>
                    <FrameCommentsSlot.Provider value={commentsSlot}>
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
                                    {/* A viewer that names itself (a dashboard) is not read as a file type. */}
                                    {titled ? null : (
                                      <FileTypeIcon
                                        name={identity.name}
                                        mediaType={identity.mediaType}
                                        className="size-4 shrink-0"
                                      />
                                    )}
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
                                  data-frame-position={
                                    index === 0 && rendererFacts.length > 0 ? '' : undefined
                                  }
                                >
                                  {fact}
                                </span>
                              ))}
                              format={
                                <>
                                  {modes ? (
                                    <FileModeControls
                                      modes={primaryTabs}
                                      value={selectedValue}
                                      onChange={selectValue}
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
                                    ...tabs
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
                            {!showIdentity && tabs.length === 1 ? (
                              <div
                                className="min-h-0 flex-1 overflow-hidden"
                                data-selection-surface="file"
                                data-file-path={selectionPath}
                                data-file-name={identity.name}
                                data-workspace-id={source.workspaceId}
                              >
                                {tabs[0]?.content}
                              </div>
                            ) : (
                              tabs.map((tab) => (
                                <TabsContent
                                  key={tab.value}
                                  className="m-0 min-h-0 overflow-hidden"
                                  value={tab.value}
                                  data-selection-surface="file"
                                  data-file-path={selectionPath}
                                  data-file-name={identity.name}
                                  data-workspace-id={source.workspaceId}
                                  {...(tab.secondary || !modes
                                    ? { 'aria-label': tab.label, 'aria-labelledby': undefined }
                                    : {})}
                                >
                                  {tab.content}
                                </TabsContent>
                              ))
                            )}
                          </Tabs>
                        </TooltipProvider>
                      </div>
                    </FrameCommentsSlot.Provider>
                  </FileViewerContentsRegistry.Provider>
                </FileViewerTitleRegistry.Provider>
              </FileViewerFactsRegistry.Provider>
            </FileViewerActionRegistry.Provider>
          </OverlayContainer.Provider>
        </FileViewerInformationHost.Provider>
      </FileSourceOptions.Provider>
    </ViewerToolbarHost.Provider>
  );
}
