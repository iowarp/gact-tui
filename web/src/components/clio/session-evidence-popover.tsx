import type { ReactNode, RefObject } from 'react';
import { useId, useRef, useState } from 'react';
import { PanelRightOpenIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { ClioEvidenceView } from './observability-evidence';
import { SessionWorkSummary } from './session-work';
import { cycleEvidenceLayout, type EvidenceLayout } from './evidence-layout';
import type { ClioObservabilityDockProps } from './observability-dock-shell';

/** A dismissible evidence inventory beside the composer, backed by session truth. */
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
  const panelId = useId();
  const setOpen = (open: boolean) => {
    if (!open) setLayout('none');
  };
  const cycle = (direction: 1 | -1) =>
    setLayout((current) => cycleEvidenceLayout(current, direction));
  return (
    <Popover open={layout !== 'none'} onOpenChange={setOpen}>
      <PopoverAnchor asChild>{children({ layout, buttonRef, panelId, cycle })}</PopoverAnchor>
      <PopoverContent
        id={panelId}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          buttonRef.current?.focus();
        }}
        onInteractOutside={(event) => {
          if (
            event.detail.originalEvent.target instanceof Node &&
            buttonRef.current?.contains(event.detail.originalEvent.target)
          )
            event.preventDefault();
        }}
        align="end"
        side="top"
        aria-label="Activity and evidence"
        className="w-[min(24rem,calc(100vw-2rem))] h-[min(32rem,var(--radix-popover-content-available-height))] gap-0 p-0"
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <h2 className="flex-1 text-sm font-medium">Activity and evidence</h2>
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
        <div className="clio-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-1">
          {layout !== 'bottom' && evidence.sessionId && evidence.onOpenWork ? (
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
            section={layout === 'both' ? undefined : layout === 'top' ? 'activity' : 'sources'}
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
