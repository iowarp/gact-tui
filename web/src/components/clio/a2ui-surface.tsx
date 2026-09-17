import {
  A2UI_VERSION,
  type A2UIActionLifecycle,
  type A2UISurface as DomainSurface,
} from '@clio/core/v3';
import { renderMarkdown } from '@a2ui/markdown-it';
import { MarkdownContext } from '@a2ui/react/v0_9';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangleIcon, BoxesIcon, Loader2Icon } from 'lucide-react';
import { Component, useCallback, type ErrorInfo, type ReactNode } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { A2uiSurface } from '@/lib/a2ui/kernel-catalog';
import { useA2uiCatalogRegistry, useA2uiSurfaceModel } from '@/lib/a2ui/processor-store';
import { A2uiUrlViolationProvider } from '@/lib/a2ui/url-guard';
import { ClioA2UIActionLifecycle } from './a2ui-action-lifecycle';
import { ClioStatus, type ClioStatusValue } from './status';
import { a2uiSurfaceDomId, a2uiSurfaceKind } from './a2ui-presentation';

function SurfaceFailure({ message }: { message: string }) {
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
        {message} The conversation remains available, and no action was taken by this view.
      </p>
      <details className="border-t border-destructive/20 px-4 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Validation detail</summary>
        <p className="mt-2 font-mono">{message}</p>
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
    return this.state.error ? (
      <SurfaceFailure message={this.state.error.message} />
    ) : (
      this.props.children
    );
  }
}

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

export type A2UIRemoteActionHandler = (message: {
  version: string;
  action: A2uiClientAction;
}) => Promise<void>;

function ClioA2UISurfaceContent({
  actionLifecycle,
  onRemoteAction,
  surface,
}: {
  /**
   * Owed by dispatcher slice S5 (docs/design/a2ui-compat-campaign-2026-09.md):
   * once the server emits `a2ui.action.*` events and a caller threads
   * `EntityState.a2ui_action_lifecycles[surface.id]` down to this component,
   * passing it here renders the server-truth footer
   * (`a2ui-action-lifecycle.tsx`). No caller wires it yet.
   */
  actionLifecycle?: A2UIActionLifecycle;
  onRemoteAction?: A2UIRemoteActionHandler;
  surface: DomainSurface;
}) {
  const repository = useRepository();
  const { catalogs, isLoading: catalogsLoading } = useA2uiCatalogRegistry(surface.session_id);
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
      await mutateAsync(clientAction);
    },
    [mutateAsync],
  );
  const handleValidationFailed = useCallback(
    (validationError: { code: string; path?: string; message: string }) => {
      void repository.a2uiAction(surface.session_id, {
        version: `v${A2UI_VERSION}`,
        error: {
          code: validationError.code,
          surfaceId: surface.id,
          path: validationError.path ?? '',
          message: validationError.message,
        },
      });
    },
    [repository, surface.id, surface.session_id],
  );
  const { model, failure } = useA2uiSurfaceModel(
    surface,
    catalogs,
    catalogsLoading,
    handleAction,
    handleValidationFailed,
  );
  const reportUrlViolation = useCallback(
    (componentId: string, propName: string, message: string) => {
      void model?.dispatchError({
        code: 'VALIDATION_FAILED',
        path: `/${componentId}/${propName}`,
        message,
      });
    },
    [model],
  );
  const surfaceKind = a2uiSurfaceKind(surface.messages);
  const surfaceBusy = isPending || surface.state !== 'ready';

  if (failure) return <SurfaceFailure message={failure.message} />;
  if (surface.error || surface.state === 'failed') {
    return (
      <SurfaceFailure message={surface.error || 'The service reported that this surface failed.'} />
    );
  }
  if (surface.state === 'deleted') return null;
  if (!model) {
    if (catalogsLoading) {
      return (
        <div className="flex items-center gap-2 rounded-xl border bg-card/70 px-4 py-3 text-xs text-muted-foreground">
          <Loader2Icon aria-hidden="true" className="size-3.5 animate-spin" />
          Resolving the interactive catalog for this session…
        </div>
      );
    }
    return null;
  }
  return (
    <section
      aria-label={`Generated UI, ${surfaceKind}`}
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
            label={isPending ? 'Sending action' : surface.state.replaceAll('_', ' ')}
            value={isPending ? 'running' : surfaceStatusValue(surface.state)}
          />
        ) : null}
      </div>
      <div className="p-3 [--a2ui-tabs-content-padding:0]">
        <MarkdownContext.Provider value={renderMarkdown}>
          <A2uiUrlViolationProvider value={reportUrlViolation}>
            <A2uiSurface surface={model} />
          </A2uiUrlViolationProvider>
        </MarkdownContext.Provider>
      </div>
      <ClioA2UIActionLifecycle lifecycle={actionLifecycle} />
      {error ? (
        <p className="border-t px-4 py-2 text-xs text-destructive">{error.message}</p>
      ) : null}
    </section>
  );
}

export function ClioA2UISurface({
  actionLifecycle,
  onRemoteAction,
  surface,
}: {
  actionLifecycle?: A2UIActionLifecycle;
  onRemoteAction?: A2UIRemoteActionHandler;
  surface: DomainSurface;
}) {
  return (
    <SurfaceBoundary key={surface.id}>
      <ClioA2UISurfaceContent
        actionLifecycle={actionLifecycle}
        onRemoteAction={onRemoteAction}
        surface={surface}
      />
    </SurfaceBoundary>
  );
}
