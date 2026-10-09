import {
  A2UI_VERSION,
  type A2UIActionLifecycle,
  type A2UISurface as DomainSurface,
} from '@clio/core/v3';
import { renderMarkdown } from '@a2ui/markdown-it';
import { MarkdownContext } from '@a2ui/react/v0_9';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, Loader2Icon } from 'lucide-react';
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { useRepository } from '@/hooks/use-repository';
import { A2uiSurface } from '@/lib/a2ui/kernel-catalog';
import { useA2uiCatalogRegistry, useA2uiSurfaceModel } from '@/lib/a2ui/processor-store';
import { A2uiReferenceSessionProvider } from '@/lib/a2ui/reference-session';
import { AutoDatasetSelectionProvider } from '@/lib/a2ui/auto-dataset-selection';
import { A2uiUrlViolationProvider } from '@/lib/a2ui/url-guard';
import { cn } from '@/lib/utils';
import { ClioA2UIActionLifecycle } from './a2ui-action-lifecycle';
import { dataSourceIntent } from '@/lib/a2ui/data-source-action';
import { useSourceSignIn } from '@/lib/a2ui/source-sign-in-context';
import { vocab } from '@/lib/brand-vocabulary';
import { ClioStatus, type ClioStatusValue } from './status';
import { TechnicalDetails } from './technical-details';
import { a2uiSurfaceDomId, a2uiSurfaceKind } from './a2ui-presentation';
import { A2uiRegionCaptureProvider } from './a2ui-region-capture';
import { SurfaceAttentionProvider } from '@/lib/a2ui/attention-selection';
import type { A2uiRegistrySnapshot } from '@/lib/a2ui/registry-store';
import { useA2uiVisualViewer } from './a2ui-visual-viewer';

function SurfaceFailure({ detail, message }: { detail?: string; message: string }) {
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
      <TechnicalDetails
        className="border-t border-destructive/20 px-4 py-2 text-xs text-muted-foreground"
        title="Validation detail"
      >
        <p className="mt-2 font-mono">{detail ?? message}</p>
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

export type A2UILocalActionHandler = (
  action: A2uiClientAction,
) => string | void | Promise<string | void>;

const LEGACY_LOCAL_ACTIONS = new Set(['artifact.open', 'data.select', 'workflow.focus']);

function ClioA2UISurfaceContent({
  actionLifecycle,
  onLocalAction,
  onRemoteAction,
  surface,
  viewport,
  readOnly,
  catalogRegistry,
  captureArtifactId,
  visualFeedback,
}: {
  /**
   * The server-truth footer's data (dispatcher slice S5,
   * `docs/design/a2ui-compat-campaign-2026-09.md`): `a2ui.action.*` events
   * folded into `EntityState.a2ui_action_lifecycles[surface.id]` and threaded
   * down by the caller (S8 gact-tui#409 item 2 — the main transcript, the
   * subagent canvas, and `pending-interactions.tsx`'s cross-session surfaces
   * all wire it). Rendered by the footer, `a2ui-action-lifecycle.tsx`.
   */
  actionLifecycle?: A2UIActionLifecycle;
  onLocalAction?: A2UILocalActionHandler;
  onRemoteAction?: A2UIRemoteActionHandler;
  surface: DomainSurface;
  viewport: 'inline' | 'fullscreen';
  readOnly: boolean;
  catalogRegistry?: A2uiRegistrySnapshot;
  captureArtifactId?: string;
  visualFeedback?: boolean;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const sessionRegistry = useA2uiCatalogRegistry(surface.session_id);
  const { registry, catalogs, isLoading: catalogsLoading } = catalogRegistry ?? sessionRegistry;
  const [validationPostFailure, setValidationPostFailure] = useState<{
    revision: number;
    message: string;
  }>();
  const [validationNotice, setValidationNotice] = useState<{ revision: number; message: string }>();
  const [localNotice, setLocalNotice] = useState<string>();
  const [localActionPending, setLocalActionPending] = useState(false);
  const [localActionStatus, setLocalActionStatus] = useState<string>();
  const openSourceSignIn = useSourceSignIn();
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
      if (clientAction.name.startsWith('data_source/')) {
        try {
          const intent = dataSourceIntent(clientAction);
          if (readOnly) {
            setLocalNotice('Private sign-in is unavailable in this archive.');
            return;
          }
          if (!intent || !openSourceSignIn) {
            throw new Error('Private sign-in is unavailable in this workspace view.');
          }
          if (
            registry.eventRoute(surface.catalog_id, clientAction.name)?.destination !== 'client'
          ) {
            throw new Error('This workspace does not support private sign-in actions.');
          }
          const reply = await repository.a2uiAction(
            surface.session_id,
            { version: `v${A2UI_VERSION}`, action: clientAction },
            {
              run_id: surface.run_id,
              message_id: surface.message_id,
              part_id: surface.part_id,
            },
          );
          if (reply.destination !== 'client' || reply.state !== 'consumed') {
            throw new Error(`${vocab.agent} did not accept this private sign-in action.`);
          }
          openSourceSignIn(intent);
        } catch (sourceError) {
          setLocalNotice(
            sourceError instanceof Error ? sourceError.message : 'Sign-in is unavailable.',
          );
        }
        return;
      }
      if (LEGACY_LOCAL_ACTIONS.has(clientAction.name)) {
        if (!onLocalAction) {
          setLocalNotice(`${clientAction.name} is unavailable in this workspace.`);
          return;
        }
        setLocalNotice(undefined);
        setLocalActionPending(true);
        try {
          const status = await onLocalAction(clientAction);
          setLocalActionStatus(status || `${clientAction.name} completed locally`);
        } catch (localError) {
          setLocalNotice(
            localError instanceof Error ? localError.message : `${clientAction.name} failed`,
          );
        } finally {
          setLocalActionPending(false);
        }
        return;
      }
      await mutateAsync(clientAction);
    },
    [mutateAsync, onLocalAction, readOnly, registry, repository, surface, openSourceSignIn],
  );
  const handleValidationFailed = useCallback(
    async (validationError: { code: string; path?: string; message: string }) => {
      // Only a real VALIDATION_FAILED belongs on the wire (owner decision
      // 11); a local resolution problem (e.g. openArtifact's own failure,
      // dispatched the same way) is worded in this card and never posted.
      if (validationError.code !== 'VALIDATION_FAILED') {
        setValidationNotice({ revision: surface.revision, message: validationError.message });
        return;
      }
      // A render-time report (the Image/Video/AudioPlayer URL-scheme guard)
      // carries a `path` and already renders its own inline notice in place
      // of the component (`UrlBlocked`) — wording it again here would be a
      // redundant second copy. A function-level report with no single
      // component to replace (e.g. openUrl's own scheme guard,
      // `kernel-catalog-functions.ts`) has no such inline notice, so it is
      // worded here too — a blocked click must never look like it silently
      // did nothing (S8 gact-tui#409 item 1, adversarial finding).
      if (!validationError.path) {
        setValidationNotice({ revision: surface.revision, message: validationError.message });
      }
      setValidationPostFailure(undefined);
      if (readOnly) {
        setValidationNotice({ revision: surface.revision, message: validationError.message });
        return;
      }
      try {
        await repository.a2uiAction(surface.session_id, {
          version: `v${A2UI_VERSION}`,
          error: {
            code: validationError.code,
            surfaceId: surface.id,
            path: validationError.path ?? '',
            message: validationError.message,
          },
        });
      } catch (postError) {
        // S5 has not landed the error door server-side yet (a 404 today);
        // never an unhandled rejection — worded in the card, typed locally.
        setValidationPostFailure({
          revision: surface.revision,
          message:
            postError instanceof Error ? postError.message : 'The request could not be completed.',
        });
      }
    },
    [repository, surface.id, surface.revision, surface.session_id, readOnly],
  );
  const { model, failure } = useA2uiSurfaceModel(
    surface,
    catalogs,
    catalogsLoading,
    handleAction,
    handleValidationFailed,
    !readOnly,
  );
  const visualRoot = useRef<HTMLDivElement>(null);
  useA2uiVisualViewer(visualRoot, surface, model, captureArtifactId, visualFeedback);
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
  const unresolvedCatalogId =
    failure && !catalogsLoading && registry.get(surface.catalog_id) === undefined
      ? surface.catalog_id
      : undefined;

  // The registry is refetched exactly once per (surface, catalogId) so a
  // catalog installed moments ago (e.g. a pack just activated) resolves
  // without a manual retry — an effect, never during render, per this
  // codebase's "no ref/query access during render" rule.
  useEffect(() => {
    if (!unresolvedCatalogId) return;
    void queryClient.invalidateQueries({ queryKey: ['a2ui-catalogs', surface.session_id] });
  }, [unresolvedCatalogId, queryClient, surface.session_id]);

  if (failure) {
    // An unresolvable/unknown catalog gets its own worded card — the
    // catalogId URI is technical detail (CLAUDE.md: never product copy) and
    // stays out of the primary message, in the hidden detail section only.
    if (unresolvedCatalogId) {
      const reason = registry.reasonFor(unresolvedCatalogId);
      return (
        <SurfaceFailure
          detail={reason ? `${reason.code}: ${reason.detail}` : failure.message}
          message="This view uses a catalog this workspace does not have installed."
        />
      );
    }
    return <SurfaceFailure message={failure.message} />;
  }
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
  const renderedSurface = (
    <div
      className={cn(
        'min-w-0 [--a2ui-tabs-content-padding:0]',
        viewport === 'fullscreen' && 'min-h-full [--a2ui-map-height:calc(100dvh-12rem)]',
      )}
      // The one marker every surface host shares, framed or bare, inline or
      // full screen: the surface host's dialog (and
      // `pending-a2ui-response.tsx`'s own) portals this div's subtree
      // directly, bypassing each host's own `id`/`data-slot` wrapper, so a
      // CSS patch scoped to those misses the dialog (#1549 G9 #25). This
      // div is the thing being moved in every case, so index.css scopes its
      // catalog-wide patches (ChoicePicker, TextField/Label) here instead.
      data-slot="a2ui-surface-root"
      ref={visualRoot}
    >
      <MarkdownContext.Provider value={renderMarkdown}>
        <A2uiUrlViolationProvider value={reportUrlViolation}>
          <A2uiReferenceSessionProvider value={surface.session_id}>
            <AutoDatasetSelectionProvider>
              <SurfaceAttentionProvider surface={surface} disabled={readOnly}>
                <A2uiRegionCaptureProvider surface={surface}>
                  <A2uiSurface surface={model} />
                </A2uiRegionCaptureProvider>
              </SurfaceAttentionProvider>
            </AutoDatasetSelectionProvider>
          </A2uiReferenceSessionProvider>
        </A2uiUrlViolationProvider>
      </MarkdownContext.Provider>
    </div>
  );
  const surfaceFeedback = (
    <>
      <ClioA2UIActionLifecycle lifecycle={actionLifecycle} />
      {localActionPending || localActionStatus ? (
        <div aria-live="polite" className="py-2 text-xs">
          <ClioStatus
            label={
              localActionPending
                ? 'Applying action in this workspace'
                : localActionStatus || 'Action completed'
            }
            value={localActionPending ? 'running' : 'completed'}
          />
        </div>
      ) : null}
      {localNotice ? <p className="py-2 text-xs text-destructive">{localNotice}</p> : null}
      {validationNotice?.revision === surface.revision ? (
        <p className="py-2 text-xs text-destructive">{validationNotice.message}</p>
      ) : null}
      {validationPostFailure?.revision === surface.revision ? (
        <p className="py-2 text-xs text-destructive">
          The service could not record the rendering problem: {validationPostFailure.message}
        </p>
      ) : null}
      {error ? <p className="py-2 text-xs text-destructive">{error.message}</p> : null}
    </>
  );
  const statusNotice =
    isPending || surface.state !== 'ready' ? (
      <div aria-live="polite" className="mb-2 flex items-center text-xs">
        <ClioStatus
          label={isPending ? 'Sending action' : surface.state.replaceAll('_', ' ')}
          value={isPending ? 'running' : surfaceStatusValue(surface.state)}
        />
      </div>
    ) : null;
  const provenance = `Generated UI · ${surfaceKind} · revision ${surface.revision} · state ${surface.state.replaceAll('_', ' ')}`;
  return (
    <section
      aria-description={provenance}
      aria-label={`Interactive surface, ${surfaceKind}`}
      className="scroll-m-8 min-w-0 focus:outline-2 focus:outline-offset-2 focus:outline-primary"
      id={a2uiSurfaceDomId(surface.id)}
      tabIndex={-1}
      title={provenance}
    >
      {statusNotice}
      {renderedSurface}
      {surfaceFeedback}
    </section>
  );
}

export function ClioA2UISurface({
  actionLifecycle,
  onLocalAction,
  onRemoteAction,
  surface,
  viewport = 'inline',
  readOnly = false,
  catalogRegistry,
  captureArtifactId,
  visualFeedback,
}: {
  actionLifecycle?: A2UIActionLifecycle;
  onLocalAction?: A2UILocalActionHandler;
  onRemoteAction?: A2UIRemoteActionHandler;
  surface: DomainSurface;
  viewport?: 'inline' | 'fullscreen';
  readOnly?: boolean;
  catalogRegistry?: A2uiRegistrySnapshot;
  captureArtifactId?: string;
  visualFeedback?: boolean;
}) {
  return (
    <SurfaceBoundary key={surface.id}>
      <ClioA2UISurfaceContent
        actionLifecycle={actionLifecycle}
        onLocalAction={onLocalAction}
        onRemoteAction={onRemoteAction}
        surface={surface}
        viewport={viewport}
        readOnly={readOnly}
        catalogRegistry={catalogRegistry}
        captureArtifactId={captureArtifactId}
        visualFeedback={visualFeedback}
      />
    </SurfaceBoundary>
  );
}
