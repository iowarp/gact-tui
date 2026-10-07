import type { ReactNode, RefObject } from 'react';
import { useCallback, useId, useRef, useState } from 'react';
import { PanelRightOpenIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { ClioEvidenceView } from './observability-evidence';
import { SessionWorkSummary } from './session-work';
import { SessionConnectedSources, SessionWorkShowcase } from './session-showcase-inventory';
import { ClioContextMeter } from './context-meter';
import { useShowcasePlacement } from './use-showcase-placement';
import { cycleEvidenceLayout, type EvidenceLayout } from './evidence-layout';
import type { ClioObservabilityDockProps } from './observability-dock-shell';

/** A dismissible session inventory anchored to the toolbar and measured free space. */
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
  const setOpen = (open: boolean) => {
    if (!open) setLayout('none');
  };
  const cycle = (direction: 1 | -1) => {
    if (layout === 'none') setMode(measureNow() ? 'docked' : 'temporary');
    setLayout((current) => cycleEvidenceLayout(current, direction));
  };
  return (
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
            event.detail.originalEvent.target instanceof Node &&
            buttonRef.current?.contains(event.detail.originalEvent.target)
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
        className="w-[min(24rem,calc(100vw-2rem))] h-[min(32rem,var(--radix-popover-content-available-height))] overflow-hidden gap-0 p-0"
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <h2 className="flex-1 text-sm font-medium">Session</h2>
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
        <div className="flex min-h-0 flex-1 flex-col">
          {layout !== 'bottom' ? (
            <div
              className="clio-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2"
              data-showcase-section="top"
            >
              <ClioContextMeter
                used={evidence.context?.used_tokens}
                limit={evidence.context?.limit_tokens}
                className="mb-2"
              />
              {evidence.workspaceId ? (
                <SessionConnectedSources workspaceId={evidence.workspaceId} />
              ) : null}
              <ClioEvidenceView
                {...evidence}
                compact
                section="data"
                provenanceProvider={evidence.provenanceProviders?.find(
                  (provider) => provider.name === evidence.provenanceProvider,
                )}
                onOpenArtifact={
                  evidence.onOpenArtifact
                    ? (artifact) => {
                        setOpen(false);
                        evidence.onOpenArtifact?.(artifact);
                      }
                    : undefined
                }
                onOpenFile={
                  evidence.onOpenFile
                    ? (path) => {
                        setOpen(false);
                        evidence.onOpenFile?.(path);
                      }
                    : undefined
                }
                onOpenResource={
                  evidence.onOpenResource
                    ? (resource) => {
                        setOpen(false);
                        evidence.onOpenResource?.(resource);
                      }
                    : undefined
                }
                onOpenDiff={
                  evidence.onOpenDiff
                    ? (diff) => {
                        setOpen(false);
                        evidence.onOpenDiff?.(diff);
                      }
                    : undefined
                }
              />
            </div>
          ) : null}
          {layout !== 'top' ? (
            <div
              className="clio-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2"
              data-showcase-section="bottom"
            >
              {layout === 'both' ? (
                <h2 className="border-t pt-2 text-xs font-medium">Work</h2>
              ) : null}
              {evidence.sessionId && evidence.onOpenWork ? (
                <SessionWorkSummary
                  sessionId={evidence.sessionId}
                  onOpen={() => {
                    setOpen(false);
                    evidence.onOpenWork?.();
                  }}
                />
              ) : null}
              <ClioEvidenceView
                {...evidence}
                compact
                section="work"
                provenanceProvider={evidence.provenanceProviders?.find(
                  (provider) => provider.name === evidence.provenanceProvider,
                )}
                onOpenArtifact={
                  evidence.onOpenArtifact
                    ? (artifact) => {
                        setOpen(false);
                        evidence.onOpenArtifact?.(artifact);
                      }
                    : undefined
                }
                onOpenFile={
                  evidence.onOpenFile
                    ? (path) => {
                        setOpen(false);
                        evidence.onOpenFile?.(path);
                      }
                    : undefined
                }
                onOpenResource={
                  evidence.onOpenResource
                    ? (resource) => {
                        setOpen(false);
                        evidence.onOpenResource?.(resource);
                      }
                    : undefined
                }
                onOpenDiff={
                  evidence.onOpenDiff
                    ? (diff) => {
                        setOpen(false);
                        evidence.onOpenDiff?.(diff);
                      }
                    : undefined
                }
                onOpenSubagent={
                  evidence.onOpenSubagent
                    ? (agent, target) => {
                        setOpen(false);
                        evidence.onOpenSubagent?.(agent, target);
                      }
                    : undefined
                }
              />
              {evidence.sessionId ? <SessionWorkShowcase sessionId={evidence.sessionId} /> : null}
            </div>
          ) : null}
        </div>
        {evidence.onOpenCanvas ? (
          <div className="shrink-0 border-t p-1">
            <Button
              aria-label="Open observability in workspace canvas"
              className="w-full justify-start text-xs"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                evidence.onOpenCanvas?.();
              }}
            >
              <PanelRightOpenIcon /> Open full details
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
