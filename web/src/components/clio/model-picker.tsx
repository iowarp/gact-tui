import { useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import type { ClioModelOption } from '@/lib/model-options';
import { providerDisplayName } from '@/lib/provider-presentation';
import { queryKeys } from '@/lib/query-keys';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { modelPickerCatalog } from './model-picker-catalog-loader';
import { LARGE_MODEL_CATALOG } from './use-progressive-model-catalog';
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
  /**
   * `composer` opens above the composer box the trigger sits in, as wide as
   * that box; `trigger` opens under the trigger at the picker's own width.
   */
  placement?: 'composer' | 'trigger';
}

/** The composer box around a trigger: the picker's anchor and width. */
function composerAnchor(trigger: HTMLElement | null): HTMLElement | null {
  return trigger?.closest<HTMLElement>('[data-slot="input-group"]') ?? trigger;
}

interface ComposerFrame {
  width: number;
  /** From the trigger's start edge to the composer's. */
  alignOffset: number;
  /** From the trigger's top edge to 6px above the composer. */
  sideOffset: number;
}

/** The picker anchors to its trigger and is shifted to cover the composer box. */
function measureComposer(trigger: HTMLElement | null): ComposerFrame | null {
  const box = composerAnchor(trigger);
  if (!trigger || !box) return null;
  const outer = box.getBoundingClientRect();
  const own = trigger.getBoundingClientRect();
  if (!outer.width) return null;
  return {
    width: outer.width,
    alignOffset: outer.left - own.left,
    sideOffset: own.top - outer.top + 6,
  };
}

const TWO_COLUMN_MIN_WIDTH = 560;

/**
 * Radix rewrites its position variables while it measures the open picker, and
 * every catalog row would inherit each rewrite as a style recalculation. The
 * catalog reads none of them, so they stop at its root.
 */
const POSITION_VARIABLES_STOP = Object.fromEntries(
  [
    'popper-anchor-height',
    'popper-anchor-width',
    'popper-available-height',
    'popper-available-width',
    'popper-transform-origin',
    'popover-content-available-height',
    'popover-content-available-width',
    'popover-content-transform-origin',
    'popover-trigger-height',
    'popover-trigger-width',
  ].map((name) => [`--radix-${name}`, 'initial']),
) as CSSProperties;

/** Paint the picker before preparing a large provider catalog. */
export function ClioModelPicker({
  catalogStatus = 'ready',
  model,
  onChange,
  onRetryCatalog,
  options,
  provider,
  title = 'Choose a model',
  trigger,
  placement = 'trigger',
}: ClioModelPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The composer box, measured at open: the picker spans it and sits just above it.
  const [composerFrame, setComposerFrame] = useState<ComposerFrame | null>(null);
  // Decided at open: a large catalog mounts only after the dialog and its
  // skeleton have painted, so the click answers at once.
  const [shellPainted, setShellPainted] = useState(true);
  const [Catalog, setCatalog] = useState(() => modelPickerCatalog.loaded());
  const [facetsOpen, setFacetsOpen] = useState(false);
  const closingForSettings = useRef(false);
  const catalogContent = useRef<HTMLDivElement>(null);
  const [activeProvider, setActiveProvider] = useState(provider);
  // Two columns need a wide window and room for both lists: a narrow composer gets one column.
  const wideViewport = useMediaQuery('(min-width: 768px)');
  const [roomy, setRoomy] = useState(true);
  const showColumns = wideViewport && roomy;
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
    if (!open || shellPainted) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShellPainted(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [open, shellPainted]);
  useEffect(() => {
    if (!open || !shellPainted || !Catalog || catalogStatus !== 'ready') return;
    const frame = requestAnimationFrame(() => {
      const input = catalogContent.current?.querySelector<HTMLInputElement>(
        '[data-slot="cascader-input"]',
      );
      if (document.activeElement instanceof HTMLInputElement && document.activeElement !== input)
        return;
      input?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, shellPainted, Catalog, catalogStatus, options]);
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
        const loaded = modelPickerCatalog.loaded();
        if (loaded) setCatalog(() => loaded);
        else
          void modelPickerCatalog.load().then(
            (component) => setCatalog(() => component),
            () => undefined,
          );
        closingForSettings.current = false;
        setActiveProvider(provider);
        const frame = placement === 'composer' ? measureComposer(triggerRef.current) : null;
        setComposerFrame(frame);
        const width = frame ? frame.width : Math.min(640, window.innerWidth - 16);
        // An unmeasured anchor (no layout yet) keeps the viewport's choice.
        setRoomy(width === 0 || width >= TWO_COLUMN_MIN_WIDTH);
        setShellPainted(options.length < LARGE_MODEL_CATALOG);
      }
    },
    [provider, options.length, placement],
  );
  const close = useCallback(() => handleOpenChange(false), [handleOpenChange]);
  const openSettings = useCallback(() => {
    closingForSettings.current = true;
    close();
  }, [close]);

  return (
    <Popover modal onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild ref={triggerRef}>
        {trigger}
      </PopoverTrigger>
      {/* The spec's dim behind the anchored picker; below the picker (110), above a window (100). */}
      {open
        ? createPortal(
            <div
              aria-hidden="true"
              className="fixed inset-0 z-[105] bg-scrim/80 motion-safe:animate-in motion-safe:fade-in-0"
              data-slot="model-picker-backdrop"
            />,
            document.body,
          )
        : null}
      <PopoverContent
        aria-label={title}
        align="start"
        alignOffset={composerFrame?.alignOffset ?? 0}
        avoidCollisions
        className={cn(
          // Its own data-slot skips the global popover layer, so restate it above the backdrop.
          'z-[110] flex flex-col gap-0 overflow-hidden rounded-[10px] p-0 text-[12.5px] shadow-lg',
          placement === 'composer'
            ? 'max-h-[min(27.5rem,calc(var(--radix-popover-content-available-height)-0.5rem))] max-w-[calc(100vw-1rem)]'
            : 'max-h-[min(27.5rem,calc(var(--radix-popover-content-available-height)-0.5rem))] w-[min(40rem,calc(100vw-1rem))]',
        )}
        collisionPadding={8}
        data-slot="model-picker"
        onCloseAutoFocus={(event) => {
          // Settings owns focus after navigation; ordinary dismissal returns to the trigger.
          if (closingForSettings.current) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (!facetsOpen) return;
          event.preventDefault();
          setFacetsOpen(false);
        }}
        onOpenAutoFocus={(event) => event.preventDefault()}
        side={placement === 'composer' ? 'top' : 'bottom'}
        sideOffset={composerFrame?.sideOffset ?? 6}
        style={composerFrame ? { width: composerFrame.width } : undefined}
      >
        {open && catalogStatus === 'error' ? (
          <ModelCatalogError onRetry={() => onRetryCatalog?.(activeProvider)} />
        ) : open &&
          ((loading && !catalogOptions) || (catalogOptions && (!shellPainted || !Catalog))) ? (
          <ModelCatalogSkeleton columns={showColumns} label={loadingLabel} />
        ) : null}
        {open && catalogOptions && shellPainted && Catalog ? (
          <div
            ref={catalogContent}
            className="flex min-h-0 flex-1 flex-col"
            style={POSITION_VARIABLES_STOP}
          >
            <Catalog
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
      </PopoverContent>
    </Popover>
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
