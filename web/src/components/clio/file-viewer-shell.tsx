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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OverlayContainer } from '@/components/ui/overlay-container';
import { FileViewerActions } from './file-viewer-actions';
import { FileViewerActionRegistry, type FileViewerAction } from './file-viewer-action-context';
import { FileSourceOptions, FileViewerInformationHost } from './file-viewer-context';
import { fileViewerIdentity, type FileViewerSource } from './file-viewer-source';
import { FileTypeIcon } from './file-type-icon';
import { cn } from '@/lib/utils';
import { FrameDivider } from './primitives/frame-bar';
import { NamedTooltip } from './primitives/icon-button';
import { ViewerToolbarHost } from './viewer-toolbar-context';

export interface FileViewerTab {
  value: string;
  label: string;
  title?: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  content: ReactNode;
  /** Secondary inspection views live in the shared More menu. */
  secondary?: boolean;
}

/** One layout and action vocabulary; file renderers only contribute their content and controls. */
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
  const selectedValue = value ?? internalValue;
  const selectValue = (next: string) => {
    setInternalValue(next);
    onValueChange?.(next);
  };
  const primaryTabs = tabs.filter((tab) => !tab.secondary);
  // More than one reading mode: the name is the crumb and the modes are a
  // segmented group of named icons. One mode: the name itself is the tab.
  const modes = primaryTabs.length > 1;
  const identity = fileViewerIdentity(source);
  const [informationHost, setInformationHost] = useState<HTMLDivElement | null>(null);
  const [formatActions, setFormatActions] = useState<
    ReadonlyMap<string, readonly FileViewerAction[]>
  >(new Map());
  const registerActions = useCallback((id: string, actions?: readonly FileViewerAction[]) => {
    setFormatActions((current) => {
      if (current.get(id) === actions) return current;
      const next = new Map(current);
      if (actions) next.set(id, actions);
      else next.delete(id);
      return next;
    });
  }, []);
  const [fullscreenHost, setFullscreenHost] = useState<HTMLElement>();
  const fullscreen = Boolean(fullscreenHost);
  const hostRef = useRef<HTMLDivElement>(null);
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
  return (
    <ViewerToolbarHost.Provider value={toolbarHost}>
      <FileSourceOptions.Provider value={sourceOptions}>
        <FileViewerInformationHost.Provider value={informationHost}>
          <OverlayContainer.Provider value={fullscreenHost}>
            <FileViewerActionRegistry.Provider value={registerActions}>
              <div
                ref={hostRef}
                data-slot="file-viewer"
                className="@container/viewer flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
              >
                <Tabs
                  className="h-full min-h-0 min-w-0 gap-0 overflow-hidden"
                  value={selectedValue}
                  onValueChange={selectValue}
                >
                  <div
                    className="flex h-[34px] shrink-0 items-center gap-2 overflow-x-auto overflow-y-hidden border-b px-2 whitespace-nowrap @max-[360px]/viewer:gap-1.5"
                    data-slot="viewer-toolbar"
                  >
                    {modes ? (
                      showIdentity ? (
                        <span
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] font-medium"
                          title={identity.name}
                        >
                          <FileTypeIcon
                            name={identity.name}
                            mediaType={identity.mediaType}
                            className="size-4 shrink-0 @max-[360px]/viewer:hidden"
                          />
                          <span className="truncate">{identity.name}</span>
                        </span>
                      ) : (
                        <span className="flex-1" />
                      )
                    ) : null}
                    {modes || showIdentity ? (
                      <TooltipProvider delayDuration={200}>
                        <TabsList
                          aria-label={label}
                          className={cn(
                            'min-w-0 justify-start bg-transparent p-0',
                            modes
                              ? 'h-7 flex-none gap-px rounded-[7px] border border-input p-[2px] group-data-horizontal/tabs:h-7'
                              : 'h-full flex-1 gap-0 group-data-horizontal/tabs:h-full',
                          )}
                          data-slot={modes ? 'viewer-modes' : undefined}
                        >
                          {primaryTabs.map(
                            ({ value: tabValue, label: tabLabel, title, icon: Icon }) =>
                              modes ? (
                                <NamedTooltip key={tabValue} label={title || tabLabel}>
                                  {/* The tooltip trigger sets its own data-state; keep it off the tab. */}
                                  <span className="inline-flex">
                                    <TabsTrigger
                                      className="h-[22px] w-[26px] flex-none rounded-[5px] border-0 px-0 text-muted-foreground shadow-none hover:bg-hover hover:text-foreground data-[state=active]:bg-menu-highlight data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-menu-highlight"
                                      value={tabValue}
                                      aria-label={tabLabel}
                                    >
                                      <Icon aria-hidden="true" className="size-3.5" />
                                    </TabsTrigger>
                                  </span>
                                </NamedTooltip>
                              ) : (
                                <TabsTrigger
                                  key={tabValue}
                                  className="h-full min-w-7 max-w-64 flex-initial justify-start gap-1.5 rounded-none border-0 px-0 text-[12.5px] font-medium text-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:text-foreground dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent"
                                  value={tabValue}
                                  title={identity.name}
                                  aria-label={tabLabel}
                                >
                                  <FileTypeIcon
                                    name={identity.name}
                                    mediaType={identity.mediaType}
                                    className="size-4 shrink-0"
                                  />
                                  <span className="truncate">{identity.name}</span>
                                </TabsTrigger>
                              ),
                          )}
                        </TabsList>
                      </TooltipProvider>
                    ) : null}
                    <div
                      className={cn(
                        'flex shrink-0 items-center gap-0.5 empty:hidden',
                        modes ? undefined : 'ml-auto',
                      )}
                      ref={setToolbarHost}
                    />
                    <FrameDivider />
                    <div className="flex shrink-0 items-center gap-0.5">
                      <FileViewerActions
                        source={source}
                        hasDocumentActions={hasDocumentActions}
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
                    </div>
                  </div>
                  {!showIdentity && tabs.length === 1 ? (
                    <div className="min-h-0 flex-1 overflow-hidden">{tabs[0]?.content}</div>
                  ) : (
                    tabs.map((tab) => (
                      <TabsContent
                        key={tab.value}
                        className="m-0 min-h-0 overflow-hidden"
                        value={tab.value}
                        {...(tab.secondary
                          ? { 'aria-label': tab.label, 'aria-labelledby': undefined }
                          : {})}
                      >
                        {tab.content}
                      </TabsContent>
                    ))
                  )}
                </Tabs>
              </div>
            </FileViewerActionRegistry.Provider>
          </OverlayContainer.Provider>
        </FileViewerInformationHost.Provider>
      </FileSourceOptions.Provider>
    </ViewerToolbarHost.Provider>
  );
}
