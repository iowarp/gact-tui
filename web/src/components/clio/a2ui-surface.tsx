import type { A2UISurface as DomainSurface } from '@clio/core/v3';
import { renderMarkdown } from '@a2ui/markdown-it';
import { MarkdownContext } from '@a2ui/react/v0_9';
import { MessageProcessor, type A2uiClientAction, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangleIcon, BoxesIcon } from 'lucide-react';
import { Component, useCallback, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { findLastSurfaceAction } from '@/lib/a2ui-state';
import { A2uiSurface, clioA2UICatalog } from './a2ui-catalog';
import { ClioStatus } from './status';

function SurfaceFailure({ error }: { error: Error }) {
  return (
    <section
      aria-label="Interactive agent surface unavailable"
      className="overflow-hidden rounded-xl border border-destructive/40 bg-destructive/5"
    >
      <div className="flex items-center gap-2 border-b border-destructive/30 px-4 py-2 text-xs">
        <AlertTriangleIcon aria-hidden="true" className="size-3.5 text-destructive" />
        <span className="font-medium">Interactive surface unavailable</span>
        <ClioStatus className="ml-auto" label="Failed safely" value="failed" />
      </div>
      <p className="px-4 py-3 text-xs text-muted-foreground">
        {brand.name} rejected an invalid surface representation. The conversation remains available.
      </p>
      <details className="border-t border-destructive/20 px-4 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Validation detail</summary>
        <p className="mt-2 font-mono">{error.message}</p>
      </details>
    </section>
  );
}

interface SurfaceBoundaryProps {
  children: ReactNode;
}

interface SurfaceBoundaryState {
  error?: Error;
}

class SurfaceBoundary extends Component<SurfaceBoundaryProps, SurfaceBoundaryState> {
  public state: SurfaceBoundaryState = {};

  public static getDerivedStateFromError(error: Error): SurfaceBoundaryState {
    return { error };
  }

  public componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The fallback is intentional containment; transport and validation tests
    // retain the detailed failure without taking down the workspace route.
  }

  public render(): ReactNode {
    return this.state.error ? <SurfaceFailure error={this.state.error} /> : this.props.children;
  }
}

const LOCAL_ACTIONS = new Set(['artifact.open', 'data.select', 'workflow.focus']);

export type A2UILocalActionHandler = (
  action: A2uiClientAction,
) => string | void | Promise<string | void>;

function ClioA2UISurfaceContent({
  onLocalAction,
  surface,
}: {
  onLocalAction?: A2UILocalActionHandler;
  surface: DomainSurface;
}) {
  const repository = useRepository();
  const [localActionPending, setLocalActionPending] = useState(false);
  const [localActionStatus, setLocalActionStatus] = useState<string>();
  const [localActionError, setLocalActionError] = useState<string>();
  const { error, isPending, mutateAsync } = useMutation({
    mutationFn: (clientAction: A2uiClientAction) =>
      repository.a2uiAction(
        surface.session_id,
        { version: 'v0.9.1', action: clientAction },
        {
          run_id: surface.run_id,
          message_id: surface.message_id,
          part_id: surface.part_id,
        },
      ),
  });
  const handleAction = useCallback(
    async (clientAction: A2uiClientAction) => {
      if (LOCAL_ACTIONS.has(clientAction.name)) {
        setLocalActionError(undefined);
        if (!onLocalAction) {
          setLocalActionError(`${clientAction.name} is unavailable in this workspace.`);
          return;
        }
        setLocalActionPending(true);
        try {
          const status = await onLocalAction(clientAction);
          setLocalActionStatus(status || `${clientAction.name} completed locally`);
        } catch (localError) {
          setLocalActionError(
            localError instanceof Error ? localError.message : `${clientAction.name} failed`,
          );
        } finally {
          setLocalActionPending(false);
        }
        return;
      }
      await mutateAsync(clientAction);
    },
    [mutateAsync, onLocalAction],
  );
  const model = useMemo(() => {
    const processor = new MessageProcessor([clioA2UICatalog], handleAction, { version: 'v0.9.1' });
    processor.processMessages(surface.messages as A2uiMessage[]);
    return processor.model.getSurface(surface.id);
  }, [handleAction, surface.id, surface.messages]);
  const lastAction = useMemo(() => findLastSurfaceAction(surface.messages), [surface.messages]);

  if (!model || surface.state === 'deleted') return null;
  return (
    <section
      aria-label="Interactive agent surface"
      className="overflow-hidden rounded-xl border bg-card/70"
    >
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs">
        <BoxesIcon aria-hidden="true" className="size-3.5 text-primary" />
        <span className="font-medium">Interactive surface</span>
        {isPending || localActionPending || surface.state !== 'ready' ? (
          <ClioStatus
            className="ml-auto"
            label={
              isPending
                ? 'Sending action'
                : localActionPending
                  ? 'Applying local action'
                  : surface.state.replaceAll('_', ' ')
            }
            value={
              isPending || localActionPending
                ? 'running'
                : surface.state === 'failed'
                  ? 'failed'
                  : surface.state === 'updating'
                    ? 'running'
                    : 'healthy'
            }
          />
        ) : null}
      </div>
      <div className="p-4">
        <MarkdownContext.Provider value={renderMarkdown}>
          <A2uiSurface surface={model} />
        </MarkdownContext.Provider>
      </div>
      {isPending || localActionPending || localActionStatus || lastAction ? (
        <div aria-live="polite" className="border-t px-4 py-2 text-xs">
          <ClioStatus
            label={
              isPending
                ? `Sending action to ${brand.name}`
                : localActionPending
                  ? 'Applying action in this workspace'
                  : localActionStatus || `${lastAction?.name} accepted`
            }
            value={isPending || localActionPending ? 'running' : 'completed'}
          />
        </div>
      ) : null}
      {error || localActionError ? (
        <p className="border-t px-4 py-2 text-xs text-destructive">
          {localActionError || error?.message}
        </p>
      ) : null}
    </section>
  );
}

export function ClioA2UISurface({
  onLocalAction,
  surface,
}: {
  onLocalAction?: A2UILocalActionHandler;
  surface: DomainSurface;
}) {
  return (
    <SurfaceBoundary key={`${surface.id}:${surface.revision}`}>
      <ClioA2UISurfaceContent onLocalAction={onLocalAction} surface={surface} />
    </SurfaceBoundary>
  );
}
import { brand } from '@brand';
