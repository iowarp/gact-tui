import { ClioRepository, type CommentAttachment } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChartLineIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useReducedMotionConfig } from 'motion/react';
import { ClioComposer } from '@/components/clio/composer';
import { ClioConversation } from '@/components/clio/conversation';
import { preloadScientificMapView } from '@/components/clio/scientific-map-view-loader';
import { ClioMapArtifactSource } from '@/components/clio/a2ui-map-data-source';
import type { SelectionWriter } from '@/components/clio/selection-state';
import { ActivityRunsFold } from '@/components/clio/transcript-disclosure-context';
import { ArtifactView } from '@/components/clio/resource-viewers';
import { ADD_COMMENT_SESSION_EVENT } from '@/components/clio/comments/comment-model';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ConnectionStateOverride } from '@/hooks/use-connection-indicator-state';
import { shareA2uiCatalogRows } from '@/lib/a2ui/shared-catalog-rows';
import {
  disposeA2uiSessionRegistry,
  loadA2uiSessionCatalogs,
  markA2uiSessionRouteUnavailable,
} from '@/lib/a2ui/registry-store';
import { vocab } from '@/lib/brand-vocabulary';
import { markFromSelection, withMark } from '@/lib/composer-annotations';
import { createGalleryRepository } from '@/lib/gallery-repository';
import { queryKeys } from '@/lib/query-keys';
import { setModelImageInput, useModelImageInput } from '@/lib/model-image-input';
import type { ClioModelOption } from '@/lib/model-options';
import { findTourAnchor, tourAnchor } from '@/lib/onboarding/tour-anchors';
import {
  practiceConversation,
  practicePlot,
  PRACTICE_TRACKS_MAP,
  type PracticeProgress,
} from '@/lib/onboarding/tour-practice-data';
import type { TourPracticeEvent, TourStep } from '@/lib/onboarding/tour-script';
import {
  TOUR_PRACTICE_SESSION_ID,
  TOUR_PRACTICE_WORKSPACE_ID,
  TourTransport,
} from '@/lib/onboarding/tour-transport';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { createSelectionActionRegistry } from '@/lib/selection-actions';
import { RepositoryOverrideProvider } from '@/providers/repository-override';
import { useTheme } from '@/providers/appearance-provider';
import { t, ph } from '@lingui/core/macro';

/** Window events the practice composer and surfaces send; the real composer must never see them. */
const COMPOSER_EVENTS = [ADD_COMMENT_SESSION_EVENT, 'clio:use-message-draft', 'clio:message-sent'];
/** How long a scripted reply "works" before it answers. */
const WORKING_MS = 1400;

const { agent } = vocab;

const keepSelection: SelectionWriter = () => undefined;

/**
 * The tracks map, drawn out of sight until the reply that shows it. When it
 * unmounts, MapLibre pools its instance (`reuseMaps`) with the style, tiles
 * and rows already loaded, so the reply's map is drawn on its first frame.
 */
function TracksMapWarmup() {
  return (
    <div
      aria-hidden="true"
      // MapLibre's open attribution sets `visibility: visible`, escaping `invisible`. The
      // controls are hidden only here: the pooled instance keeps its attribution for the reply.
      className="pointer-events-none invisible absolute inset-0 overflow-hidden [&_.maplibregl-control-container]:hidden"
      data-tour-map-warmup=""
      inert
    >
      <div className="mx-auto w-full max-w-4xl px-4">
        <ClioMapArtifactSource {...PRACTICE_TRACKS_MAP} setSelection={keepSelection} />
      </div>
    </div>
  );
}

/** A scripted catalog: the picker, levels and badges render from it exactly as from a live one. */
const PRACTICE_MODELS: readonly ClioModelOption[] = [
  {
    providerId: 'openai',
    providerName: 'OpenAI',
    id: 'gpt-5',
    label: 'GPT-5',
    available: true,
    health: 'healthy',
    contextWindow: 400_000,
    modalities: ['text', 'image'],
    toolCalling: true,
    reasoning: { levels: ['minimal', 'low', 'medium', 'high'], default: 'medium' },
  },
  {
    providerId: 'openai',
    providerName: 'OpenAI',
    id: 'gpt-5-mini',
    // i18n-ignore: model name
    label: 'GPT-5 mini',
    available: true,
    health: 'healthy',
    contextWindow: 400_000,
    modalities: ['text', 'image'],
    toolCalling: true,
    reasoning: { levels: ['minimal', 'low', 'medium', 'high'], default: 'low' },
  },
  {
    providerId: 'anthropic',
    providerName: 'Anthropic',
    id: 'claude-sonnet-4-5',
    // i18n-ignore: model name
    label: 'Claude Sonnet 4.5',
    available: true,
    health: 'healthy',
    contextWindow: 200_000,
    modalities: ['text', 'image'],
    toolCalling: true,
    reasoning: { levels: ['off', 'low', 'medium', 'high'], default: 'off' },
  },
  {
    providerId: 'anthropic',
    providerName: 'Anthropic',
    id: 'claude-haiku-4-5',
    // i18n-ignore: model name
    label: 'Claude Haiku 4.5',
    available: true,
    health: 'healthy',
    contextWindow: 200_000,
    modalities: ['text', 'image'],
    toolCalling: true,
    reasoning: { levels: ['off', 'low', 'medium', 'high'], default: 'off' },
  },
  {
    providerId: 'ollama',
    providerName: t`Ollama (this computer)`,
    id: 'qwen3:32b',
    label: 'Qwen3 32B',
    available: true,
    health: 'healthy',
    contextWindow: 40_960,
    modalities: ['text'],
    toolCalling: true,
    reasoning: { levels: ['off', 'medium'], default: 'medium' },
  },
  {
    providerId: 'ollama',
    providerName: t`Ollama (this computer)`,
    id: 'llama3.1:8b',
    label: 'Llama 3.1 8B',
    available: true,
    health: 'healthy',
    contextWindow: 131_072,
    modalities: ['text'],
    toolCalling: true,
  },
];

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Follows the app's conversation area, so the practice conversation sits exactly where real ones do. */
function useConversationArea(): Box | undefined {
  const [box, setBox] = useState<Box>();
  useLayoutEffect(() => {
    let frame = 0;
    let current: Box | undefined;
    const tick = () => {
      const rect = findTourAnchor('conversation-area')?.getBoundingClientRect();
      const next =
        rect && rect.width > 240 && rect.height > 240
          ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          : undefined;
      if (
        current?.top !== next?.top ||
        current?.left !== next?.left ||
        current?.width !== next?.width ||
        current?.height !== next?.height
      ) {
        current = next;
        setBox(next);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);
  return box;
}

/**
 * The hands-on practice conversation: the real transcript, composer, model
 * picker, artifact viewer and A2UI components, laid over the app's
 * conversation area and fed by a scripted conversation and bundled sample
 * data. It owns its own query cache, repository, catalog registry and
 * selection actions, so nothing reaches an agent, a model, the person's
 * conversations, their draft or the app's caches, and unmounting it leaves
 * nothing behind.
 */
export function TourPracticeStage({
  step,
  stageRef,
  onEvent,
}: {
  step: TourStep;
  stageRef: Ref<HTMLDivElement>;
  onEvent: (event: TourPracticeEvent) => void;
}) {
  const reduceMotion = Boolean(useReducedMotionConfig());
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const light = !useTheme().resolvedTheme.dark;
  // The tour transport is stateless, so a theme switch can rebuild the repository.
  const repository = useMemo(
    () =>
      createGalleryRepository(new ClioRepository(new TourTransport()), {
        lightPlot: light,
      }) as ClioRepository,
    [light],
  );
  const plot = practicePlot(light);
  // The plot's bytes are cached per artifact; a theme switch fetches the other variant.
  useEffect(() => {
    void client.resetQueries({ queryKey: queryKeys.key('artifact-image') });
  }, [client, light]);
  const selectionActions = useMemo(() => createSelectionActionRegistry(), []);
  const area = useConversationArea();
  const [progress, setProgress] = useState<PracticeProgress>({
    turns: 0,
    working: false,
    sent: [],
  });
  const [draft, setDraft] = useState('');
  const [annotations, setAnnotations] = useState<readonly CommentAttachment[]>([]);
  const [viewer, setViewer] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const emit = useRef(onEvent);
  useLayoutEffect(() => {
    emit.current = onEvent;
  }, [onEvent]);

  // Each step sets the scene it teaches: Back, Next and skipped actions all
  // land on a consistent conversation.
  const [sceneStep, setSceneStep] = useState<string>();
  if (sceneStep !== step.id) {
    setSceneStep(step.id);
    const scene = step.practice;
    if (scene) {
      if (scene.turns !== progress.turns || progress.working)
        setProgress({
          turns: scene.turns,
          working: false,
          sent: progress.sent.slice(0, scene.turns),
        });
      setDraft(scene.draft ?? '');
      setViewer(Boolean(scene.viewer));
      if (scene.turns < 2) setAnnotations([]);
    }
  }
  const conversation = useMemo(() => practiceConversation(progress, light), [progress, light]);

  useEffect(() => {
    if (!progress.working) return;
    const timer = window.setTimeout(
      () => {
        setProgress((current) => ({ ...current, working: false }));
        emit.current('sent');
      },
      reduceMotion ? 0 : WORKING_MS,
    );
    return () => window.clearTimeout(timer);
  }, [progress.working, reduceMotion]);

  useEffect(() => () => client.clear(), [client]);

  // The tracks map's renderer and MapLibre load now, so the map step mounts without a fallback.
  useEffect(() => {
    void preloadScientificMapView();
  }, []);

  // The composer reports its model's image input app-wide; restore the real one's afterwards.
  const appImageInput = useRef(useModelImageInput());
  useEffect(() => {
    const restore = appImageInput.current;
    return () => setModelImageInput(restore);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    repository
      .a2uiCatalogs(TOUR_PRACTICE_SESSION_ID, controller.signal)
      .then((result) => {
        const shared = shareA2uiCatalogRows(result);
        loadA2uiSessionCatalogs(TOUR_PRACTICE_SESSION_ID, shared.rows, shared.rejected, false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        markA2uiSessionRouteUnavailable(
          TOUR_PRACTICE_SESSION_ID,
          'a2ui_catalog_decode_failed',
          error instanceof Error ? error.message : t`The sample catalog did not load.`,
        );
      });
    return () => {
      controller.abort();
      disposeA2uiSessionRegistry(TOUR_PRACTICE_SESSION_ID);
    };
  }, [repository]);

  // The same Reference this as a live conversation, attached to the practice draft.
  useEffect(
    () =>
      selectionActions.register({
        id: 'tour-reference',
        label: t`Reference this`,
        icon: ChartLineIcon,
        order: 10,
        kinds: ['data-surface-zone'],
        run: (target) => {
          const mark = markFromSelection(target);
          setAnnotations((current) => withMark(current, mark.kind, mark.title, mark.anchor));
          emit.current('referenced');
        },
      }),
    [selectionActions],
  );

  useEffect(() => {
    // Capture phase on window runs before any composer's own listener, so the
    // person's real draft behind the tour never receives practice content.
    const intercept = (event: Event) => {
      event.stopImmediatePropagation();
      const detail = (event as CustomEvent<unknown>).detail;
      if (event.type === ADD_COMMENT_SESSION_EVENT) {
        const session = detail as CommentAttachment | undefined;
        if (!session || !Array.isArray(session.marks) || !session.marks.length) return;
        setAnnotations((current) => [
          ...current.filter(
            (item) => !(item.kind === session.kind && item.title === session.title),
          ),
          session,
        ]);
      } else if (event.type === 'clio:use-message-draft') {
        const text = (detail as { text?: unknown } | undefined)?.text;
        if (typeof text === 'string') setDraft(text);
      }
    };
    for (const name of COMPOSER_EVENTS) window.addEventListener(name, intercept, true);
    return () => {
      for (const name of COMPOSER_EVENTS) window.removeEventListener(name, intercept, true);
    };
  }, []);

  const send = async ({ text }: { text: string }) => {
    if (progress.working || progress.turns >= 2) return;
    setAnnotations([]);
    setProgress({
      turns: (progress.turns + 1) as 1 | 2,
      working: true,
      sent: [...progress.sent, text],
    });
  };

  return (
    <QueryClientProvider client={client}>
      <RepositoryOverrideProvider repository={repository}>
        <ConnectionStateOverride.Provider value="live">
          <SelectionActionsContext.Provider value={selectionActions}>
            <section
              aria-label={t`Practice conversation`}
              className={
                area
                  ? 'pointer-events-auto fixed z-40 flex flex-col overflow-hidden bg-background'
                  : 'pointer-events-auto fixed inset-x-3 top-[5dvh] bottom-[5dvh] z-40 mx-auto flex max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl'
              }
              data-selection-actions="local"
              ref={stageRef}
              style={area}
              {...tourAnchor('practice-conversation')}
            >
              <header className="flex shrink-0 items-baseline gap-3 border-b border-border px-4 py-2">
                <h2 className="text-sm font-medium">{t`Practice conversation`}</h2>
                <p className="text-xs text-muted-foreground">{t`Scripted. Nothing is sent or saved.`}</p>
              </header>
              <div className="relative flex min-h-0 flex-1">
                <div className="relative flex min-w-0 flex-1 flex-col">
                  {progress.turns < 2 || progress.working ? <TracksMapWarmup /> : null}
                  {progress.turns === 0 ? (
                    <div
                      className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground"
                      style={{ paddingBottom: composerHeight }}
                    >
                      {t`Your conversation with ${agent} appears here.`}
                    </div>
                  ) : (
                    <ActivityRunsFold.Provider value={false}>
                      <ClioConversation
                        {...conversation}
                        agentName={vocab.agent}
                        bottomInset={composerHeight}
                        onOpenArtifact={() => {
                          setViewer(true);
                          emit.current('artifact-opened');
                        }}
                      />
                    </ActivityRunsFold.Provider>
                  )}
                  <div className="pointer-events-none absolute inset-0 z-20 flex min-h-0 flex-col justify-end">
                    <ClioComposer
                      annotations={annotations}
                      attachments
                      confirmationPolicy="ask"
                      contextReferences
                      model="gpt-5"
                      modelOptions={[...PRACTICE_MODELS]}
                      onAnnotationsChange={setAnnotations}
                      onHeightChange={setComposerHeight}
                      onSubmit={send}
                      onValueChange={setDraft}
                      provider="openai"
                      state={progress.working ? 'running' : 'completed'}
                      value={draft}
                      variant="docked"
                      workspaceId={TOUR_PRACTICE_WORKSPACE_ID}
                    />
                  </div>
                </div>
                {viewer ? (
                  <aside
                    aria-label={plot.name}
                    className="absolute inset-0 z-30 flex min-w-0 flex-col border-l border-border bg-background md:static md:w-[46%] md:shrink-0"
                    {...tourAnchor('practice-artifact-viewer')}
                  >
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border py-1 pr-1 pl-3">
                      <h3 className="truncate text-sm font-medium">{plot.name}</h3>
                      <IconButton
                        icon={<CloseIcon />}
                        label={t`Close ${ph({ name: plot.name })}`}
                        onClick={() => setViewer(false)}
                        size="toolbar"
                        type="button"
                      />
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                      <ArtifactView
                        artifact={plot}
                        files={[]}
                        sessionId={TOUR_PRACTICE_SESSION_ID}
                        showIdentity={false}
                        workspaceId={TOUR_PRACTICE_WORKSPACE_ID}
                      />
                    </div>
                  </aside>
                ) : null}
              </div>
            </section>
          </SelectionActionsContext.Provider>
        </ConnectionStateOverride.Provider>
      </RepositoryOverrideProvider>
    </QueryClientProvider>
  );
}
