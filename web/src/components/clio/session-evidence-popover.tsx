import type { ReactNode, RefObject } from 'react';
import { useCallback, useId, useRef, useState } from 'react';
import { PanelRightOpenIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConnectedSourcePicker } from './connected-source-picker';
import { ClioEvidenceView } from './observability-evidence';
import { SessionWorkSummary } from './session-work';
import { SessionConnectedSources, SessionWorkShowcase } from './session-showcase-inventory';
import { ClioContextMeter } from './context-meter';
import { useShowcasePlacement } from './use-showcase-placement';
import { cycleEvidenceLayout, type EvidenceLayout } from './evidence-layout';
import type { ClioObservabilityDockProps } from './observability-dock-shell';

/** A compact launcher that stays docked while the transcript has room beside it. */
export function SessionEvidencePopover({
  evidence,
  children,
}: {
  evidence: ClioObservabilityDockProps;
  children: (control: {
    layout: EvidenceLayout;
    buttonRef: RefObject<HTMLButtonElement | null>;
    panelId: string;
    cycle: (direction: 1 | -1) => void;
  }) => ReactNode;
}) {
  const [layout, setLayout] = useState<EvidenceLayout>('none');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const outsideRef = useRef(false);
  const [mode, setMode] = useState<'docked' | 'temporary'>('temporary');
  const [selectedSource, setSelectedSource] = useState<{ workspaceId: string; id: string }>();
  const onGutterLost = useCallback(() => {
    if (mode === 'docked') setLayout('none');
  }, [mode]);
  const { gutter, flyoutHeight, dockAnchor, flyoutAnchor, measureNow } = useShowcasePlacement(
    buttonRef,
    evidence.surfaceRef,
    onGutterLost,
  );
  const docked = mode === 'docked' && Boolean(gutter);
  const open = layout !== 'none' && (mode !== 'docked' || Boolean(gutter));
  const panelId = useId();
  // Opening while the transcript hydrates must not lock a roomy viewport into overlay mode.
  if (layout !== 'none' && gutter && mode === 'temporary') setMode('docked');
  const setOpen = (open: boolean) => {
    if (!open) setLayout('none');
  };
  const dismissTemporary = () => {
    if (!docked) setOpen(false);
  };
  const cycle = (direction: 1 | -1) => {
    if (layout === 'none') setMode(measureNow() ? 'docked' : 'temporary');
    setLayout((current) => cycleEvidenceLayout(current, direction));
  };
  const openWork = evidence.onOpenWork
    ? () => {
        dismissTemporary();
        evidence.onOpenWork?.();
      }
    : undefined;
  const summaryActions = {
    provenanceProvider: evidence.provenanceProviders?.find(
      (provider) => provider.name === evidence.provenanceProvider,
    ),
    onOpenWork: openWork,
    onOpenActivity: evidence.onOpenCanvas
      ? () => {
          dismissTemporary();
          evidence.onOpenCanvas?.('activity');
        }
      : undefined,
    onOpenArtifact: evidence.onOpenArtifact
      ? (artifact: Parameters<NonNullable<typeof evidence.onOpenArtifact>>[0]) => {
          dismissTemporary();
          evidence.onOpenArtifact?.(artifact);
        }
      : undefined,
    onOpenFile: evidence.onOpenFile
      ? (path: string) => {
          dismissTemporary();
          evidence.onOpenFile?.(path);
        }
      : undefined,
    onOpenResource: evidence.onOpenResource
      ? (resource: Parameters<NonNullable<typeof evidence.onOpenResource>>[0]) => {
          dismissTemporary();
          evidence.onOpenResource?.(resource);
        }
      : undefined,
    onOpenDiff: evidence.onOpenDiff
      ? (diff: Parameters<NonNullable<typeof evidence.onOpenDiff>>[0]) => {
          dismissTemporary();
          evidence.onOpenDiff?.(diff);
        }
      : undefined,
    onOpenSubagent: evidence.onOpenSubagent
      ? (...args: Parameters<NonNullable<typeof evidence.onOpenSubagent>>) => {
          dismissTemporary();
          evidence.onOpenSubagent?.(...args);
        }
      : undefined,
  };
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        {children({ layout, buttonRef, panelId, cycle })}
        <PopoverAnchor virtualRef={docked ? dockAnchor : flyoutAnchor} />
        <PopoverContent
          id={panelId}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!outsideRef.current) buttonRef.current?.focus();
            outsideRef.current = false;
          }}
          onInteractOutside={(event) => {
            if (
              docked ||
              (event.detail.originalEvent.target instanceof Node &&
                buttonRef.current?.contains(event.detail.originalEvent.target))
            )
              event.preventDefault();
            else outsideRef.current = true;
          }}
          align={docked ? 'start' : 'end'}
          side="bottom"
          sideOffset={docked ? 0 : 8}
          avoidCollisions={!docked}
          data-showcase-mode={docked ? 'docked' : 'temporary'}
          style={
            docked && gutter
              ? { width: gutter.width, height: gutter.height }
              : { height: flyoutHeight }
          }
          aria-label="Activity and evidence"
          className="w-[min(30rem,calc(100vw-2rem))] h-[min(32rem,var(--radix-popover-content-available-height))] overflow-hidden gap-0 p-0"
        >
          <div
            data-slot="session-summary-header"
            className="flex shrink-0 items-center gap-1 border-b px-3 py-2"
          >
            <h2 className="flex-1 text-sm font-medium">Session</h2>
            {evidence.onOpenCanvas ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Open full details"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        dismissTemporary();
                        evidence.onOpenCanvas?.();
                      }}
                    >
                      <PanelRightOpenIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open full details</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            <Button
              aria-label="Hide activity and evidence"
              title="Hide activity and evidence"
              variant="ghost"
              size="icon-sm"
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
            </Button>
          </div>
          <div className="@container flex min-h-0 flex-1 flex-col">
            <div
              className={`clio-scrollbar grid min-h-0 flex-1 content-start overflow-y-auto ${layout === 'both' ? '@min-[400px]:grid-cols-2 @min-[400px]:grid-rows-[minmax(0,1fr)] @min-[400px]:overflow-hidden' : ''}`}
            >
              {layout !== 'bottom' ? (
                <div
                  className="clio-scrollbar min-h-0 min-w-0 px-3 py-2 @min-[400px]:overflow-y-auto"
                  data-showcase-section="top"
                >
                  {evidence.onOpenCanvas ? (
                    <button
                      type="button"
                      aria-label="Open Context tab"
                      className="mb-2 block w-full rounded-sm text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        dismissTemporary();
                        evidence.onOpenCanvas?.('context');
                      }}
                    >
                      <ClioContextMeter
                        used={evidence.context?.used_tokens}
                        limit={evidence.context?.limit_tokens}
                      />
                    </button>
                  ) : (
                    <ClioContextMeter
                      used={evidence.context?.used_tokens}
                      limit={evidence.context?.limit_tokens}
                      className="mb-2"
                    />
                  )}
                  {evidence.workspaceId ? (
                    <SessionConnectedSources
                      workspaceId={evidence.workspaceId}
                      onOpenSource={(source) => {
                        dismissTemporary();
                        setSelectedSource({ workspaceId: evidence.workspaceId!, id: source.id });
                      }}
                    />
                  ) : null}
                  <ClioEvidenceView {...evidence} {...summaryActions} compact section="data" />
                </div>
              ) : null}
              {layout !== 'top' ? (
                <div
                  className={`clio-scrollbar min-h-0 min-w-0 px-3 py-2 @min-[400px]:overflow-y-auto ${layout === 'both' ? 'border-t @min-[400px]:border-t-0 @min-[400px]:border-l' : ''}`}
                  data-showcase-section="bottom"
                >
                  {openWork ? (
                    <Button
                      variant="ghost"
                      className="h-7 w-full justify-start px-1 text-xs"
                      aria-label="Open Work view"
                      onClick={openWork}
                    >
                      Work
                    </Button>
                  ) : (
                    <h2 className="py-1 text-xs font-medium">Work</h2>
                  )}
                  {evidence.sessionId && openWork ? (
                    <SessionWorkSummary sessionId={evidence.sessionId} onOpen={openWork} />
                  ) : null}
                  <ClioEvidenceView {...evidence} {...summaryActions} compact section="work" />
                  {evidence.sessionId ? (
                    <SessionWorkShowcase sessionId={evidence.sessionId} onOpenWork={openWork} />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {evidence.workspaceId ? (
        <ConnectedSourcePicker
          workspaceId={evidence.workspaceId}
          manageOnly
          initialSourceId={selectedSource?.id}
          open={selectedSource?.workspaceId === evidence.workspaceId}
          onOpenChange={(open) => {
            if (!open) setSelectedSource(undefined);
          }}
        />
      ) : null}
    </>
  );
}
