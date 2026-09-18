import {
  A2UI_VERSION,
  a2uiComponentSchema,
  type A2UISurface as DomainSurface,
} from '@clio/core/v3';
import { renderMarkdown } from '@a2ui/markdown-it';
import { MarkdownContext } from '@a2ui/react/v0_9';
import { MessageProcessor, type A2uiClientAction, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangleIcon, BoxesIcon } from 'lucide-react';
import { Component, useCallback, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { findLastSurfaceAction } from '@/lib/a2ui-state';
import { PROTOCOL, vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { A2uiSurface, clioA2UICatalog } from './a2ui-catalog';
import { ClioStatus, type ClioStatusValue } from './status';
import { TechnicalDetails } from './technical-details';
import { a2uiSurfaceDomId, a2uiSurfaceKind } from './a2ui-presentation';

function SurfaceFailure({ error }: { error: Error }) {
  return (
    <section
      aria-label={`${PROTOCOL.a2ui} surface unavailable`}
      className="overflow-hidden rounded-xl border border-destructive/40 bg-destructive/5"
    >
      <div className="flex items-center gap-2 border-b border-destructive/30 px-4 py-2 text-xs">
        <AlertTriangleIcon aria-hidden="true" className="size-3.5 text-destructive" />
        <span className="font-medium">{PROTOCOL.a2ui} surface unavailable</span>
        <ClioStatus className="ml-auto" label="Failed safely" value="failed" />
      </div>
      <p className="px-4 py-3 text-xs text-muted-foreground">
        {error.message} The conversation remains available, and no action was taken by this view.
      </p>
      <TechnicalDetails
        className="border-t border-destructive/20 px-4 py-2 text-xs text-muted-foreground"
        title={`${PROTOCOL.a2ui} details`}
      >
        <p className="mt-2 font-mono">{error.message}</p>
      </TechnicalDetails>
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

/** Every declared surface state keeps its own honest status; none defaults to success. */
function surfaceStatusValue(state: DomainSurface['state']): ClioStatusValue {
  switch (state) {
    case 'ready':
      return 'healthy';
    case 'creating':
    case 'updating':
      return 'running';
    case 'pending_action':
      return 'waiting_user';
    case 'cancelled':
      return 'cancelled';
    case 'disconnected':
      return 'offline';
    case 'failed':
      return 'failed';
    case 'deleted':
    case 'unknown':
      return 'unavailable';
    default: {
      const unhandled: never = state;
      void unhandled;
      return 'unavailable';
    }
  }
}

function validateSurfaceComponents(messages: unknown[]): A2uiMessage[] {
  return messages.map((message, messageIndex) => {
    if (typeof message !== 'object' || message === null) return message as A2uiMessage;
    const update = Reflect.get(message, 'updateComponents');
    if (typeof update !== 'object' || update === null) return message as A2uiMessage;
    const components = Reflect.get(update, 'components');
    if (!Array.isArray(components)) return message as A2uiMessage;
    components.forEach((component, componentIndex) => {
      const result = a2uiComponentSchema.safeParse(component);
      if (!result.success) {
        const detail = result.error.issues[0]?.message || 'unknown schema violation';
        throw new Error(
          `A2UI component ${componentIndex + 1} in update ${messageIndex + 1} does not satisfy the shared ${vocab.agent} catalog: ${detail}`,
        );
      }
    });
    return message as A2uiMessage;
  });
}

export type A2UILocalActionHandler = (
  action: A2uiClientAction,
) => string | void | Promise<string | void>;

export type A2UIRemoteActionHandler = (message: {
  version: string;
  action: A2uiClientAction;
}) => Promise<void>;

function ClioA2UISurfaceContent({
  chrome,
  onLocalAction,
  onRemoteAction,
  surface,
  viewport,
}: {
  chrome: 'framed' | 'bare';
  onLocalAction?: A2UILocalActionHandler;
  onRemoteAction?: A2UIRemoteActionHandler;
  surface: DomainSurface;
  viewport: 'inline' | 'fullscreen';
}) {
  const repository = useRepository();
  const [localActionPending, setLocalActionPending] = useState(false);
  const [localActionStatus, setLocalActionStatus] = useState<string>();
  const [localActionError, setLocalActionError] = useState<string>();
  const { error, isPending, mutateAsync } = useMutation({
    mutationFn: async (clientAction: A2uiClientAction) => {
      const message = { version: `v${A2UI_VERSION}`, action: clientAction };
      if (onRemoteAction) {
        await onRemoteAction(message);
        return;
      }
      await repository.a2uiAction(surface.session_id, message, {
        run_id: surface.run_id,
        message_id: surface.message_id,
        part_id: surface.part_id,
      });
    },
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
  const processedSurface = useMemo(() => {
    try {
      const processor = new MessageProcessor([clioA2UICatalog], handleAction, {
        version: `v${A2UI_VERSION}`,
      });
      processor.processMessages(validateSurfaceComponents(surface.messages));
      return { model: processor.model.getSurface(surface.id) };
    } catch (processingError) {
      return {
        error:
          processingError instanceof Error
            ? processingError
            : new Error('The interactive surface could not be validated.'),
      };
    }
  }, [handleAction, surface.id, surface.messages]);
  const lastAction = useMemo(() => findLastSurfaceAction(surface.messages), [surface.messages]);
  const surfaceBusy = isPending || localActionPending || surface.state !== 'ready';
  const surfaceKind = useMemo(() => a2uiSurfaceKind(surface.messages), [surface.messages]);

  if (processedSurface.error) return <SurfaceFailure error={processedSurface.error} />;
  if (surface.error || surface.state === 'failed') {
    return (
      <SurfaceFailure
        error={new Error(surface.error || 'The service reported that this surface failed.')}
      />
    );
  }
  if (!processedSurface.model || surface.state === 'deleted') return null;
  const renderedSurface = (
    <div
      className={
        chrome === 'bare'
          ? '[--a2ui-tabs-content-padding:0]'
          : 'p-3 [--a2ui-tabs-content-padding:0]'
      }
    >
      <MarkdownContext.Provider value={renderMarkdown}>
        <A2uiSurface surface={processedSurface.model} />
      </MarkdownContext.Provider>
    </div>
  );
  const surfaceFeedback = (
    <>
      {isPending || localActionPending || localActionStatus || lastAction ? (
        <div aria-live="polite" className="border-t px-4 py-2 text-xs">
          <ClioStatus
            label={
              isPending
                ? `Sending action to ${vocab.agent}`
                : localActionPending
                  ? 'Applying action in this workspace'
                  : localActionStatus || acceptedActionLabel(lastAction?.name)
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
    </>
  );
  if (chrome === 'bare') {
    return (
      <section
        aria-label={`${PROTOCOL.a2ui} surface, ${surfaceKind}`}
        className={cn(
          'scroll-m-8 min-w-0 focus:outline-2 focus:outline-offset-2 focus:outline-primary',
          viewport === 'fullscreen' &&
            'min-h-full [&_[data-slot=a2ui-map]]:h-[calc(100dvh-7rem)] [&_[data-slot=a2ui-map]>[data-slot=frame]]:h-full',
        )}
        id={a2uiSurfaceDomId(surface.id)}
        tabIndex={-1}
      >
        {renderedSurface}
        {surfaceFeedback}
      </section>
    );
  }
  return (
    <section
      aria-label={`${PROTOCOL.a2ui} surface, ${surfaceKind}`}
      className="scroll-m-8 overflow-hidden rounded-xl border bg-card/70 focus:outline-2 focus:outline-offset-2 focus:outline-primary"
      id={a2uiSurfaceDomId(surface.id)}
      tabIndex={-1}
    >
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
        <BoxesIcon aria-hidden="true" className="size-3.5 text-primary" />
        <span className="font-medium">Generated UI</span>
        <span className="text-muted-foreground">{surfaceKind}</span>
        {surfaceBusy ? (
          <ClioStatus
            className="ml-auto"
            label={
              isPending
                ? 'Sending action'
                : localActionPending
                  ? 'Applying local action'
                  : surface.state.replaceAll('_', ' ')
            }
            value={isPending || localActionPending ? 'running' : surfaceStatusValue(surface.state)}
          />
        ) : null}
      </div>
      {renderedSurface}
      {surfaceFeedback}
    </section>
  );
}

function acceptedActionLabel(name: string | undefined): string {
  switch (name) {
    case 'agent.submit':
      return 'Sent to agent';
    case 'form.submit':
      return 'Form response accepted';
    case 'approval.respond':
      return 'Approval response accepted';
    case 'run.retry':
      return 'Retry requested';
    case 'run.cancel':
      return 'Cancellation requested';
    default:
      return 'Action accepted';
  }
}

export function ClioA2UISurface({
  chrome = 'framed',
  onLocalAction,
  onRemoteAction,
  surface,
  viewport = 'inline',
}: {
  chrome?: 'framed' | 'bare';
  onLocalAction?: A2UILocalActionHandler;
  onRemoteAction?: A2UIRemoteActionHandler;
  surface: DomainSurface;
  viewport?: 'inline' | 'fullscreen';
}) {
  return (
    <SurfaceBoundary key={`${surface.id}:${surface.revision}`}>
      <ClioA2UISurfaceContent
        chrome={chrome}
        onLocalAction={onLocalAction}
        onRemoteAction={onRemoteAction}
        surface={surface}
        viewport={viewport}
      />
    </SurfaceBoundary>
  );
}
