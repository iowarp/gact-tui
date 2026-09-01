import type { InfrastructureDependency } from '@clio/core/v3';
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  PlugZapIcon,
  RotateCwIcon,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface ClioInfrastructurePreparationProps {
  dependencies: readonly InfrastructureDependency[];
}

const CATEGORY_LABELS: Record<string, string> = {
  mcp: 'Agent tools',
};

function phaseLabel(dependency: InfrastructureDependency): string {
  if (dependency.state === 'ready') {
    return dependency.tool_count === undefined
      ? 'Connected'
      : `Connected with ${dependency.tool_count} tools`;
  }
  if (dependency.state === 'failed') return 'Could not prepare this tool service';
  if (dependency.state === 'retrying') {
    const retrySeconds = dependency.retry_in_ms
      ? Math.max(1, Math.round(dependency.retry_in_ms / 1_000))
      : undefined;
    return retrySeconds
      ? `Retrying in ${retrySeconds} ${retrySeconds === 1 ? 'second' : 'seconds'}`
      : 'Retrying connection';
  }
  if (dependency.phase === 'provision') return 'Installing required service';
  if (dependency.phase === 'connect') return 'Connecting';
  return dependency.attempt > 1
    ? `Starting, attempt ${dependency.attempt} of ${dependency.max_attempts}`
    : 'Starting';
}

function DependencyStateIcon({ dependency }: { dependency: InfrastructureDependency }) {
  if (dependency.state === 'ready') {
    return <CheckCircle2Icon aria-hidden="true" className="size-4 text-success" />;
  }
  if (dependency.state === 'failed') {
    return <CircleAlertIcon aria-hidden="true" className="size-4 text-destructive" />;
  }
  if (dependency.state === 'retrying') {
    return <RotateCwIcon aria-hidden="true" className="size-4 animate-spin text-warning" />;
  }
  return <Spinner aria-hidden="true" className="size-4" role="presentation" />;
}

/** Transient, session-scoped preparation state rendered immediately above the composer. */
export function ClioInfrastructurePreparation({
  dependencies,
}: ClioInfrastructurePreparationProps) {
  const [open, setOpen] = useState(true);
  const [dismissedCompletion, setDismissedCompletion] = useState('');
  const sortedDependencies = useMemo(
    () =>
      [...dependencies].sort(
        (left, right) =>
          left.category.localeCompare(right.category) || left.title.localeCompare(right.title),
      ),
    [dependencies],
  );
  const hasFailure = sortedDependencies.some((dependency) => dependency.state === 'failed');
  const hasActive = sortedDependencies.some(
    (dependency) => dependency.state === 'running' || dependency.state === 'retrying',
  );
  const allReady =
    sortedDependencies.length > 0 &&
    sortedDependencies.every((dependency) => dependency.state === 'ready');
  const completionKey = sortedDependencies
    .map((dependency) => `${dependency.id}:${dependency.attempt}`)
    .join('|');
  const observedActive = sortedDependencies.some((dependency) => dependency.observed_active);

  const visible =
    sortedDependencies.length > 0 &&
    (hasActive ||
      hasFailure ||
      (allReady && observedActive && dismissedCompletion !== completionKey));

  useEffect(() => {
    if (!allReady || !observedActive || dismissedCompletion === completionKey) return;
    const timeout = window.setTimeout(() => setDismissedCompletion(completionKey), 1_100);
    return () => window.clearTimeout(timeout);
  }, [allReady, completionKey, dismissedCompletion, observedActive]);

  const groups = useMemo(() => {
    const grouped = new Map<string, InfrastructureDependency[]>();
    for (const dependency of sortedDependencies) {
      const rows = grouped.get(dependency.category) ?? [];
      rows.push(dependency);
      grouped.set(dependency.category, rows);
    }
    return [...grouped.entries()];
  }, [sortedDependencies]);

  const statusLabel = hasFailure
    ? 'Needs attention'
    : allReady
      ? 'Ready'
      : `${sortedDependencies.filter((dependency) => dependency.state === 'ready').length} of ${sortedDependencies.length} ready`;

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <m.div
          animate={{ height: 'auto', opacity: 1, y: 0 }}
          className="mb-2 overflow-hidden"
          exit={{ height: 0, opacity: 0, y: 4 }}
          initial={{ height: 0, opacity: 0, y: 4 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <Frame className="bg-background/95 shadow-lg" dense spacing="xs" stacked>
            <Collapsible onOpenChange={setOpen} open={open}>
              <CollapsibleTrigger className="flex w-full text-left">
                <FrameHeader className="flex grow flex-row items-center gap-2 px-3 py-2">
                  <ChevronRightIcon
                    aria-hidden="true"
                    className={cn(
                      'size-4 shrink-0 text-muted-foreground transition-transform',
                      open && 'rotate-90',
                    )}
                  />
                  <PlugZapIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  <FrameTitle className="truncate text-sm">Initial infrastructure setup</FrameTitle>
                  <span
                    className={cn(
                      'ml-auto shrink-0 text-xs',
                      hasFailure ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {statusLabel}
                  </span>
                </FrameHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <FramePanel className="space-y-3 px-3 py-2.5" role="status" aria-live="polite">
                  {groups.map(([category, rows]) => (
                    <div className="space-y-1.5" key={category}>
                      <div className="text-xs font-medium text-muted-foreground">
                        {CATEGORY_LABELS[category] ?? category}
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {rows.map((dependency) => (
                          <div
                            className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/45 px-2.5 py-2"
                            key={dependency.id}
                          >
                            <DependencyStateIcon dependency={dependency} />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{dependency.title}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {phaseLabel(dependency)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </FramePanel>
              </CollapsibleContent>
            </Collapsible>
          </Frame>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
