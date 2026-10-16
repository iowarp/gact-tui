import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useRepository } from '@/hooks/use-repository';
import type { ClioModelOption } from '@/lib/model-options';
import { providerDisplayName } from '@/lib/provider-presentation';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ModelPickerCatalog } from './model-picker-catalog';
import { RefreshButton } from './refresh-button';

interface ClioModelPickerProps {
  catalogStatus?: 'error' | 'loading' | 'ready';
  model?: string;
  onChange: (choice: ClioModelOption) => void;
  onRetryCatalog?: (providerId?: string) => void;
  options: readonly ClioModelOption[];
  provider?: string;
  title?: string;
  trigger: ReactNode;
}

/** Paint the dialog before preparing a large provider catalog. */
export function ClioModelPicker({
  catalogStatus = 'ready',
  model,
  onChange,
  onRetryCatalog,
  options,
  provider,
  title = 'Choose a model',
  trigger,
}: ClioModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [facetsOpen, setFacetsOpen] = useState(false);
  const closingForSettings = useRef(false);
  const catalogContent = useRef<HTMLDivElement>(null);
  const [activeProvider, setActiveProvider] = useState(provider);
  const showColumns = useMediaQuery('(min-width: 768px)');
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  // Keep the shared query warm without building model trees while closed.
  const configuration = useQuery({
    queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });
  const presetsData = configuration.data?.presets;
  const presets = useMemo(() => presetsData ?? [], [presetsData]);
  const catalogOptions =
    catalogStatus !== 'error' && (catalogStatus === 'ready' || options.length || presets.length)
      ? options
      : undefined;
  const loading = catalogStatus === 'loading';
  useEffect(() => {
    if (!open || catalogStatus !== 'ready') return;
    const frame = requestAnimationFrame(() => {
      const input = catalogContent.current?.querySelector<HTMLInputElement>(
        '[data-slot="cascader-input"]',
      );
      if (document.activeElement instanceof HTMLInputElement && document.activeElement !== input)
        return;
      input?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, catalogStatus, options]);
  const loadingLabel = provider
    ? `Loading ${providerDisplayName(
        presets.find((preset) => preset.id === provider),
        provider,
      )} models\u2026`
    : 'Loading available models\u2026';

  const handleOpenChange = useCallback(
    (nextOpen: boolean): void => {
      setFacetsOpen(false);
      setOpen(nextOpen);
      if (nextOpen) {
        closingForSettings.current = false;
        setActiveProvider(provider);
      }
    },
    [provider],
  );
  const close = useCallback(() => handleOpenChange(false), [handleOpenChange]);
  const openSettings = useCallback(() => {
    closingForSettings.current = true;
    close();
  }, [close]);

  return (
    <ModelSelector onOpenChange={handleOpenChange} open={open}>
      <ModelSelectorTrigger asChild>{trigger}</ModelSelectorTrigger>
      <ModelSelectorContent
        className="h-[min(38rem,calc(100dvh-2rem))] w-[min(56rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden sm:h-[min(42rem,calc(100dvh-3rem))] sm:max-w-[56rem]"
        commandProps={{ className: 'min-h-0 p-0', shouldFilter: false }}
        onCloseAutoFocus={(event) => {
          // Settings owns focus after navigation; ordinary dismissal returns to the trigger.
          if (closingForSettings.current) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (!facetsOpen) return;
          event.preventDefault();
          setFacetsOpen(false);
        }}
        title={title}
      >
        {open && catalogStatus === 'error' ? (
          <ModelCatalogError onRetry={() => onRetryCatalog?.(activeProvider)} />
        ) : open && loading && !catalogOptions ? (
          <ModelCatalogSkeleton columns={showColumns} label={loadingLabel} />
        ) : null}
        {open && catalogOptions ? (
          <div ref={catalogContent} className="contents">
            <ModelPickerCatalog
              model={model}
              onChange={onChange}
              onClose={close}
              onOpenSettings={openSettings}
              onProviderChange={setActiveProvider}
              options={catalogOptions}
              loading={loading}
              presets={presets}
              provider={provider}
              showColumns={showColumns}
              facetsOpen={facetsOpen}
              setFacetsOpen={setFacetsOpen}
            />
          </div>
        ) : null}
      </ModelSelectorContent>
    </ModelSelector>
  );
}

function ModelCatalogSkeleton({ columns, label }: { columns: boolean; label: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading available models"
      className="flex size-full min-h-0 flex-col"
      role="status"
    >
      <div className="shrink-0 border-b p-2">
        <p className="px-1 pb-2 pe-8 text-sm text-muted-foreground">{label}</p>
        <Skeleton className="h-9 w-full" />
      </div>
      <div className={cn('grid min-h-0 flex-1', columns && 'grid-cols-2 divide-x')}>
        <div className="flex min-h-0 flex-col gap-2 p-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="flex h-11 items-center gap-2" key={index}>
              <Skeleton className="size-8 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="size-4 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
        {columns ? (
          <div className="flex min-h-0 flex-col gap-3 p-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="flex h-11 flex-col gap-1.5" key={index}>
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <span className="sr-only">Discovering providers and models from the connected service.</span>
    </div>
  );
}

function ModelCatalogError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex size-full items-start p-4">
      <Alert variant="destructive">
        <AlertTitle>Models could not be loaded</AlertTitle>
        <AlertDescription>
          <span>Check the provider connection or configuration, then try discovery again.</span>
          {onRetry ? (
            <RefreshButton
              label="Retry"
              className="mt-3"
              onRefresh={onRetry}
              size="sm"
              type="button"
              variant="outline"
            />
          ) : null}
        </AlertDescription>
      </Alert>
    </div>
  );
}
