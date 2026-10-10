import type { ReactNode, RefObject } from 'react';
import { useCallback, useId, useRef, useState } from 'react';
import { PanelRightOpenIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConnectedSourcePicker } from './connected-source-picker';
import { ClioEvidenceView } from './observability-evidence';
import { SessionWorkSummary } from './session-work';
import { SessionConnectedSources, SessionWorkShowcase } from './session-showcase-inventory';
import { ClioContextMeter } from './context-meter';
import { useShowcasePlacement } from './use-showcase-placement';
import { cycleEvidenceLayout, type EvidenceLayout } from './evidence-layout';
import { restoreEvidenceFocus } from './evidence-focus';
import { SessionEvidenceColumn } from './session-evidence-column';
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
            restoreEvidenceFocus(event, buttonRef.current, outsideRef.current);
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
          collisionPadding={docked ? 0 : 8}
          data-showcase-mode={docked ? 'docked' : 'temporary'}
          style={
            docked && gutter
              ? { width: gutter.width, height: gutter.height }
              : {
                  maxHeight:
                    flyoutHeight === undefined
                      ? undefined
                      : `min(${flyoutHeight}px, var(--radix-popover-content-available-height))`,
                }
          }
          aria-label="Activity and evidence"
          className={cn(
            'w-[min(30rem,calc(100vw-2rem))] overflow-hidden gap-0 p-0',
            docked
              ? 'bg-transparent shadow-none ring-0'
              : 'max-h-[min(32rem,var(--radix-popover-content-available-height))]',
          )}
        >
          <SessionEvidenceColumn
            docked={docked}
            actions={
              <>
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
              </>
            }
            workActions={
              openWork ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Open Work view"
                        variant="ghost"
                        size="icon-sm"
                        onClick={openWork}
                      >
                        <PanelRightOpenIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open Work view</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null
            }
            data={
              layout !== 'bottom' ? (
                <>
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
                </>
              ) : undefined
            }
            work={
              layout !== 'top' ? (
                <>
                  {evidence.sessionId && openWork ? (
                    <SessionWorkSummary sessionId={evidence.sessionId} onOpen={openWork} />
                  ) : null}
                  <ClioEvidenceView {...evidence} {...summaryActions} compact section="work" />
                  {evidence.sessionId ? (
                    <SessionWorkShowcase sessionId={evidence.sessionId} onOpenWork={openWork} />
                  ) : null}
                </>
              ) : undefined
            }
          />
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
