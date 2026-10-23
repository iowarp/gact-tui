import type { ReactNode, RefObject } from 'react';
import { useId, useRef, useState } from 'react';
import { PanelRightOpenIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEvidenceSections } from '@/hooks/use-evidence-disclosures';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConnectedSourcePicker } from './connected-source-picker';
import { useShowcasePlacement } from './use-showcase-placement';
import { restoreEvidenceFocus } from './evidence-focus';
import { SessionRailContent } from './session-rail-content';
import type { ClioObservabilityDockProps } from './observability-dock-shell';
import type { RailKind } from './session-rail-layout';

/** A compact launcher that stays docked while the transcript has room beside it. */
export function SessionEvidencePopover({
  evidence,
  children,
  kind = 'session',
}: {
  evidence: ClioObservabilityDockProps;
  kind?: RailKind;
  children: (control: {
    visible: boolean;
    buttonRef: RefObject<HTMLButtonElement | null>;
    panelId: string;
    toggle: () => void;
  }) => ReactNode;
}) {
  const selection = useEvidenceSections('evidence-layout', []);
  // Honor existing top/bottom preferences as visible, now that sections have their own controls.
  const enabled = selection.value.some((value) =>
    (kind === 'session' ? ['top', 'open', 'session'] : ['bottom', 'work']).includes(value),
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const outsideRef = useRef(false);
  const [mode, setMode] = useState<'docked' | 'temporary'>(enabled ? 'docked' : 'temporary');
  const [selectedSource, setSelectedSource] = useState<{ workspaceId: string; id: string }>();
  const { gutter, flyoutHeight, dockAnchor, flyoutAnchor, measureNow } = useShowcasePlacement(
    buttonRef,
    evidence.surfaceRef,
  );
  const docked = mode === 'docked' && Boolean(gutter);
  const open = enabled && (mode !== 'docked' || Boolean(gutter));
  const panelId = useId();
  // Opening while the transcript hydrates must not lock a roomy viewport into overlay mode.
  if (enabled && gutter && mode === 'temporary') setMode('docked');
  const setOpen = (open: boolean) => {
    if (!open) selection.onValueChange([]);
  };
  // Opening a workbench tab may take the gutter; preserve the selected panels
  // so they return when that tab closes. Explicit dismissal still selects none.
  const suspendForWorkbench = () => setMode('docked');
  const toggle = () => {
    if (open) setOpen(false);
    else {
      setMode(measureNow() ? 'docked' : 'temporary');
      selection.onValueChange([kind]);
    }
  };
  const openWork = evidence.onOpenWork
    ? () => {
        suspendForWorkbench();
        evidence.onOpenWork?.();
      }
    : undefined;
  const summaryActions = {
    onOpenWork: openWork,
    onOpenActivity: evidence.onOpenCanvas
      ? () => {
          suspendForWorkbench();
          evidence.onOpenCanvas?.('activity');
        }
      : undefined,
    onOpenArtifact: evidence.onOpenArtifact
      ? (artifact: Parameters<NonNullable<typeof evidence.onOpenArtifact>>[0]) => {
          suspendForWorkbench();
          evidence.onOpenArtifact?.(artifact);
        }
      : undefined,
    onOpenFile: evidence.onOpenFile
      ? (path: string) => {
          suspendForWorkbench();
          evidence.onOpenFile?.(path);
        }
      : undefined,
    onOpenResource: evidence.onOpenResource
      ? (resource: Parameters<NonNullable<typeof evidence.onOpenResource>>[0]) => {
          suspendForWorkbench();
          evidence.onOpenResource?.(resource);
        }
      : undefined,
    onOpenDiff: evidence.onOpenDiff
      ? (diff: Parameters<NonNullable<typeof evidence.onOpenDiff>>[0]) => {
          suspendForWorkbench();
          evidence.onOpenDiff?.(diff);
        }
      : undefined,
    onOpenSubagent: evidence.onOpenSubagent
      ? (...args: Parameters<NonNullable<typeof evidence.onOpenSubagent>>) => {
          suspendForWorkbench();
          evidence.onOpenSubagent?.(...args);
        }
      : undefined,
  };
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        {children({ visible: open, buttonRef, panelId, toggle })}
        <PopoverAnchor virtualRef={docked ? dockAnchor : flyoutAnchor} />
        <PopoverContent
          id={panelId}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            if (!enabled) restoreEvidenceFocus(event, buttonRef.current, outsideRef.current);
            else event.preventDefault();
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
          aria-label={kind === 'work' ? 'Work rail' : 'Session rail'}
          className={cn(
            'w-[min(22rem,calc(100vw-2rem))] overflow-hidden gap-0 p-0',
            docked
              ? 'bg-transparent shadow-none ring-0'
              : 'max-h-[min(32rem,var(--radix-popover-content-available-height))]',
          )}
        >
          <SessionRailContent
            kind={kind}
            evidence={{
              ...evidence,
              ...summaryActions,
              onOpenCanvas: evidence.onOpenCanvas
                ? (view) => {
                    suspendForWorkbench();
                    evidence.onOpenCanvas?.(view);
                  }
                : undefined,
            }}
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
                            suspendForWorkbench();
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
                  aria-label={`Hide ${kind} rail`}
                  title={`Hide ${kind} rail`}
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setOpen(false)}
                >
                  <CloseIcon />
                </Button>
              </>
            }
            onOpenSource={(source) => {
              suspendForWorkbench();
              setSelectedSource({ workspaceId: evidence.workspaceId!, id: source.id });
            }}
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
