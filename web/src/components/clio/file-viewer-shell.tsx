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
import { OverlayContainer } from '@/components/ui/overlay-container';
import { FileViewerActions } from './file-viewer-actions';
import { FileViewerActionRegistry, type FileViewerAction } from './file-viewer-action-context';
import { FileSourceOptions, FileViewerInformationHost } from './file-viewer-context';
import { fileViewerIdentity, type FileViewerSource } from './file-viewer-source';
import { FileTypeIcon } from './file-type-icon';
import { cn } from '@/lib/utils';
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
                    className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b px-2"
                    data-slot="viewer-toolbar"
                  >
                    {showIdentity || primaryTabs.length > 1 ? (
                      <TabsList
                        aria-label={label}
                        className="h-full min-w-0 flex-1 justify-start gap-0 bg-transparent p-0 group-data-horizontal/tabs:h-full"
                        variant="line"
                      >
                        {primaryTabs.map(
                          ({ value: tabValue, label: tabLabel, title, icon: Icon }) => (
                            <TabsTrigger
                              key={tabValue}
                              className={cn(
                                'h-full rounded-none text-xs text-foreground dark:text-foreground after:bg-primary group-data-horizontal/tabs:after:bottom-0',
                                tabValue === 'preview' && showIdentity
                                  ? 'min-w-7 max-w-64 flex-initial justify-start gap-2 px-1'
                                  : 'w-8 flex-none px-0',
                              )}
                              value={tabValue}
                              title={
                                tabValue === 'preview' && showIdentity
                                  ? identity.name
                                  : title || tabLabel
                              }
                              aria-label={tabLabel}
                            >
                              {tabValue === 'preview' && showIdentity ? (
                                <>
                                  <FileTypeIcon
                                    name={identity.name}
                                    mediaType={identity.mediaType}
                                    badge
                                    className="size-6 shrink-0"
                                  />
                                  <span className="truncate">{identity.name}</span>
                                </>
                              ) : (
                                <Icon aria-hidden="true" className="size-3.5" />
                              )}
                            </TabsTrigger>
                          ),
                        )}
                      </TabsList>
                    ) : null}
                    <div
                      className="ml-auto flex shrink-0 items-center gap-0.5"
                      ref={setToolbarHost}
                    />
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
